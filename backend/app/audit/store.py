"""In-memory + JSON persistence for audit sessions."""

from __future__ import annotations

import json
from pathlib import Path
from threading import Lock
from time import time

from .models import AuditSession, AuditSessionSummary


class AuditStore:
    def __init__(self, data_dir: Path) -> None:
        self._path = data_dir / "audit_sessions.json"
        self._lock = Lock()
        data_dir.mkdir(parents=True, exist_ok=True)

    # ── Internal I/O ─────────────────────────────────────────────────

    def _read(self) -> list[dict]:
        if not self._path.exists():
            return []
        try:
            return json.loads(self._path.read_text(encoding="utf-8"))
        except Exception:
            return []

    def _write(self, sessions: list[AuditSession]) -> None:
        self._path.write_text(
            json.dumps([s.model_dump() for s in sessions], indent=2),
            encoding="utf-8",
        )

    # ── Public API ────────────────────────────────────────────────────

    def list_sessions(self) -> list[AuditSessionSummary]:
        with self._lock:
            data = self._read()
            result = []
            for raw in data:
                questions = raw.get("questions", [])
                voted = sum(1 for q in questions if q.get("winner_label"))
                result.append(
                    AuditSessionSummary(
                        id=raw["id"],
                        name=raw.get("name", "Audit Session"),
                        flow_count=len(raw.get("flows", [])),
                        question_count=len(questions),
                        voted_count=voted,
                        status=raw.get("status", "running"),
                        created_at=raw.get("created_at", 0),
                        winner_flow_name=raw.get("winner_flow_name"),
                    )
                )
            return sorted(result, key=lambda s: s.created_at, reverse=True)

    def get(self, session_id: str) -> AuditSession | None:
        with self._lock:
            for raw in self._read():
                if raw.get("id") == session_id:
                    return AuditSession.model_validate(raw)
        return None

    def save(self, session: AuditSession) -> AuditSession:
        with self._lock:
            data = self._read()
            existing = []
            replaced = False
            for raw in data:
                if raw.get("id") == session.id:
                    existing.append(session)
                    replaced = True
                else:
                    existing.append(AuditSession.model_validate(raw))
            if not replaced:
                existing.insert(0, session)
            self._write(existing[:100])
        return session

    def delete(self, session_id: str) -> bool:
        with self._lock:
            data = self._read()
            kept = [AuditSession.model_validate(r) for r in data if r.get("id") != session_id]
            if len(kept) == len(data):
                return False
            self._write(kept)
        return True
