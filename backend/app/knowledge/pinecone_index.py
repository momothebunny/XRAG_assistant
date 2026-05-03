"""Pinecone-backed vector index using integrated inference.

Why integrated inference?
    Pinecone's *integrated inference* indexes embed text server-side with a
    hosted model (we use ``multilingual-e5-large``: 1024-dim, 96 languages).
    That means we don't need a separate OpenAI/Cohere embedding key on the
    backend — the only requirement is ``PINECONE_API_KEY``.

Public surface:
    - ``ensure_index()``                 → create the index if missing.
    - ``upsert_chunks(doc_id, chunks)``  → push chunks to ``namespace=knowledge``.
    - ``delete_document(doc_id)``        → remove all vectors for a doc.
    - ``search(query, top_k, ...)``      → semantic search; returns ranked rows.
    - ``is_available()``                 → True iff the SDK + key are usable.

All public functions degrade gracefully: if the SDK is missing or the key is
unset they raise ``PineconeUnavailable`` so the caller can fall back.
"""

from __future__ import annotations

import logging
import os
from threading import Lock
from typing import Any, Iterable

logger = logging.getLogger(__name__)

INDEX_NAME = os.environ.get("PINECONE_INDEX_NAME", "xrag-knowledge")
EMBED_MODEL = os.environ.get("PINECONE_EMBED_MODEL", "multilingual-e5-large")
NAMESPACE = os.environ.get("PINECONE_NAMESPACE", "knowledge")
CLOUD = os.environ.get("PINECONE_CLOUD", "aws")
REGION = os.environ.get("PINECONE_REGION", "us-east-1")
# E5 family is symmetric — same prefix conventions for queries and passages,
# but the integrated index already handles that internally.

_BATCH_SIZE = 96  # Pinecone integrated upsert hard cap is 96 records per call.

_client_lock = Lock()
_client: Any | None = None
_index: Any | None = None
_ensured = False


class PineconeUnavailable(RuntimeError):
    """Raised when the SDK or API key is not usable."""


def is_available() -> bool:
    if not os.environ.get("PINECONE_API_KEY"):
        return False
    try:
        import pinecone  # noqa: F401
    except Exception:  # noqa: BLE001
        return False
    return True


def _client_or_raise():
    global _client
    if _client is not None:
        return _client
    api_key = os.environ.get("PINECONE_API_KEY", "").strip()
    if not api_key:
        raise PineconeUnavailable("PINECONE_API_KEY not set")
    try:
        from pinecone import Pinecone
    except ImportError as exc:
        raise PineconeUnavailable(f"pinecone SDK not installed: {exc}") from exc
    with _client_lock:
        if _client is None:
            _client = Pinecone(api_key=api_key)
    return _client


def ensure_index() -> Any:
    """Create the integrated-inference index if missing, return the index handle."""
    global _index, _ensured
    if _index is not None and _ensured:
        return _index

    pc = _client_or_raise()

    # Lazy import the typed config helpers. Older SDKs may not export them, so
    # we fall back to a plain dict in that case.
    try:
        from pinecone import IndexEmbed  # type: ignore
    except ImportError:
        IndexEmbed = None  # type: ignore[assignment]

    existing_list = pc.list_indexes()
    try:
        existing = set(existing_list.names())  # type: ignore[attr-defined]
    except AttributeError:
        existing = {entry.get("name") for entry in (existing_list or []) if isinstance(entry, dict)}
    if INDEX_NAME not in existing:
        logger.info("Creating Pinecone integrated index '%s' (%s)", INDEX_NAME, EMBED_MODEL)
        # `multilingual-e5-large` is a cosine-similarity model. Pinecone's
        # newer SDKs require the metric to be passed explicitly inside the
        # embed config (older builds inferred it).
        embed_dict = {
            "model": EMBED_MODEL,
            "field_map": {"text": "text"},
            "metric": "cosine",
        }
        embed_cfg = (
            IndexEmbed(**embed_dict) if IndexEmbed is not None else embed_dict
        )
        pc.create_index_for_model(
            name=INDEX_NAME,
            cloud=CLOUD,
            region=REGION,
            embed=embed_cfg,
        )

    _index = pc.Index(INDEX_NAME)
    _ensured = True
    return _index


def _records_from_chunks(doc_id: str, chunks: Iterable[dict[str, Any]], doc_meta: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    doc_meta = doc_meta or {}
    for chunk in chunks:
        text = (chunk.get("text") or "").strip()
        if not text:
            continue
        record_id = f"{doc_id}::{chunk.get('id') or chunk.get('index') or len(out)}"
        record: dict[str, Any] = {
            "_id": record_id,
            "text": text,
            "doc_id": doc_id,
            "chunk_index": int(chunk.get("index", len(out))),
        }
        # Carry a few metadata fields so the retriever can show them without
        # a second store lookup.
        for k in ("name", "title", "category", "subcategory", "relative_path"):
            if doc_meta.get(k):
                record[k] = doc_meta[k]
        out.append(record)
    return out


def upsert_chunks(doc_id: str, chunks: Iterable[dict[str, Any]], doc_meta: dict[str, Any] | None = None) -> int:
    """Embed + upsert chunks. Returns number of records pushed."""
    if not is_available():
        raise PineconeUnavailable("Pinecone not available (missing SDK or key)")
    index = ensure_index()
    records = _records_from_chunks(doc_id, chunks, doc_meta)
    if not records:
        return 0

    # Upsert in batches; integrated upsert uses upsert_records.
    for start in range(0, len(records), _BATCH_SIZE):
        batch = records[start : start + _BATCH_SIZE]
        index.upsert_records(NAMESPACE, batch)
    logger.info("Pinecone upsert: doc=%s chunks=%d", doc_id, len(records))
    return len(records)


def delete_document(doc_id: str) -> int:
    """Delete all vectors belonging to a document. Returns deleted count (best-effort)."""
    if not is_available():
        return 0
    try:
        index = ensure_index()
    except PineconeUnavailable:
        return 0
    # Integrated indexes support metadata filter delete on the modern SDK.
    try:
        index.delete(filter={"doc_id": {"$eq": doc_id}}, namespace=NAMESPACE)
        return 1
    except Exception as exc:  # noqa: BLE001
        logger.warning("Pinecone delete by filter failed for %s: %s", doc_id, exc)
        return 0


def search(
    query: str,
    top_k: int = 10,
    *,
    metadata_filter: dict[str, Any] | None = None,
    rerank_top_n: int | None = None,
) -> list[dict[str, Any]]:
    """Semantic search via Pinecone integrated inference.

    Returns a list of dicts with keys: ``id``, ``score``, ``text``, ``doc_id``,
    ``chunk_index``, plus any metadata fields preserved on upsert.
    """
    if not is_available():
        raise PineconeUnavailable("Pinecone not available (missing SDK or key)")
    if not query.strip():
        return []
    index = ensure_index()

    query_payload: dict[str, Any] = {
        "inputs": {"text": query},
        "top_k": int(top_k),
    }
    if metadata_filter:
        query_payload["filter"] = metadata_filter

    search_kwargs: dict[str, Any] = {"namespace": NAMESPACE, "query": query_payload}
    if rerank_top_n:
        # Server-side rerank is optional; if the model isn't enabled in the
        # project this raises and we fall back to vector-only results.
        search_kwargs["rerank"] = {"model": "bge-reranker-v2-m3", "top_n": int(rerank_top_n), "rank_fields": ["text"]}

    try:
        resp = index.search(**search_kwargs)
    except TypeError:
        # Older SDKs use search_records.
        resp = index.search_records(**search_kwargs)

    hits = []
    raw_hits = (
        getattr(resp, "result", None) or resp.get("result", {})
    ).get("hits", []) if not isinstance(resp, list) else resp
    for hit in raw_hits:
        # Pinecone returns objects on newer SDKs; coerce to dicts.
        item = hit if isinstance(hit, dict) else hit.to_dict()
        fields = item.get("fields") or {}
        hits.append(
            {
                "id": item.get("_id") or item.get("id"),
                "score": float(item.get("_score") or item.get("score") or 0.0),
                "text": fields.get("text", ""),
                "doc_id": fields.get("doc_id"),
                "chunk_index": fields.get("chunk_index"),
                "title": fields.get("title") or fields.get("name"),
                "category": fields.get("category"),
                "subcategory": fields.get("subcategory"),
            }
        )
    return hits


def stats() -> dict[str, Any]:
    """Return integer counts and other stats; useful for the UI."""
    if not is_available():
        return {"available": False}
    try:
        index = ensure_index()
        s = index.describe_index_stats()
        if hasattr(s, "to_dict"):
            s = s.to_dict()
        return {"available": True, "index": INDEX_NAME, "namespace": NAMESPACE, **s}
    except Exception as exc:  # noqa: BLE001
        return {"available": True, "error": str(exc)}
