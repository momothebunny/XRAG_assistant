"""Filesystem-backed persistence for uploaded documents and their chunks.

Layout under ``backend/data/knowledge/``::

    index.json                       # list of KnowledgeDocument records (no chunk bodies)
    uploads/<doc_id>/<filename>      # the original uploaded file
    chunks/<doc_id>.json             # the chunk bodies for that document
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from threading import Lock

from .models import KnowledgeChunk, KnowledgeDocument, KnowledgeDocumentSummary


class KnowledgeStore:
    def __init__(self, data_dir: Path) -> None:
        self._root = data_dir / "knowledge"
        self._uploads_dir = self._root / "uploads"
        self._chunks_dir = self._root / "chunks"
        self._index_path = self._root / "index.json"
        self._lock = Lock()
        for directory in (self._root, self._uploads_dir, self._chunks_dir):
            directory.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Index helpers
    # ------------------------------------------------------------------

    def _read_index(self) -> list[dict]:
        if not self._index_path.exists():
            return []
        try:
            return json.loads(self._index_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return []

    def _write_index(self, records: list[dict]) -> None:
        self._index_path.write_text(json.dumps(records, indent=2), encoding="utf-8")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def upload_dir_for(self, doc_id: str) -> Path:
        directory = self._uploads_dir / doc_id
        directory.mkdir(parents=True, exist_ok=True)
        return directory

    def list_documents(self) -> list[KnowledgeDocumentSummary]:
        with self._lock:
            return [KnowledgeDocumentSummary.model_validate(item) for item in self._read_index()]

    def get_document(self, doc_id: str) -> KnowledgeDocument | None:
        with self._lock:
            for raw in self._read_index():
                if raw.get("id") == doc_id:
                    chunk_path = self._chunks_dir / f"{doc_id}.json"
                    chunks: list[KnowledgeChunk] = []
                    if chunk_path.exists():
                        try:
                            chunks = [
                                KnowledgeChunk.model_validate(c)
                                for c in json.loads(chunk_path.read_text(encoding="utf-8"))
                            ]
                        except json.JSONDecodeError:
                            chunks = []
                    return KnowledgeDocument.model_validate({**raw, "chunks": [c.model_dump() for c in chunks]})
        return None

    def upsert_document(self, document: KnowledgeDocument) -> KnowledgeDocumentSummary:
        with self._lock:
            records = self._read_index()
            # Keep token_estimate in sync with actual chunk data
            if document.chunks:
                document = document.model_copy(
                    update={"token_estimate": sum(c.token_estimate for c in document.chunks)}
                )
            summary_dict = document.model_dump(exclude={"chunks"})
            replaced = False
            for index, record in enumerate(records):
                if record.get("id") == document.id:
                    records[index] = summary_dict
                    replaced = True
                    break
            if not replaced:
                records.insert(0, summary_dict)
            self._write_index(records)

            chunk_path = self._chunks_dir / f"{document.id}.json"
            chunk_path.write_text(
                json.dumps([chunk.model_dump() for chunk in document.chunks], indent=2),
                encoding="utf-8",
            )
            return KnowledgeDocumentSummary.model_validate(summary_dict)

    def delete_document(self, doc_id: str) -> bool:
        with self._lock:
            records = self._read_index()
            kept = [record for record in records if record.get("id") != doc_id]
            if len(kept) == len(records):
                return False
            self._write_index(kept)

            upload_path = self._uploads_dir / doc_id
            if upload_path.exists():
                shutil.rmtree(upload_path, ignore_errors=True)
            chunk_path = self._chunks_dir / f"{doc_id}.json"
            if chunk_path.exists():
                chunk_path.unlink(missing_ok=True)
            return True
