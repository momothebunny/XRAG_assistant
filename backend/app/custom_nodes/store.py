"""JSON-file storage for custom canvas nodes."""

from __future__ import annotations

import json
import secrets
import threading
import time
from pathlib import Path

from .models import CustomNode


class CustomNodeStore:
    """Thread-safe persistence for user-defined nodes (single JSON file)."""

    def __init__(self, data_dir: Path) -> None:
        self._path = Path(data_dir) / "custom_nodes.json"
        self._lock = threading.Lock()
        if not self._path.exists():
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._path.write_text(json.dumps({"nodes": []}, indent=2), encoding="utf-8")

    def _read(self) -> list[dict]:
        try:
            payload = json.loads(self._path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, FileNotFoundError):
            return []
        return list(payload.get("nodes") or [])

    def _write(self, items: list[dict]) -> None:
        tmp = self._path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"nodes": items}, indent=2, ensure_ascii=False), encoding="utf-8")
        tmp.replace(self._path)

    @staticmethod
    def _new_id() -> str:
        return f"custom-{secrets.token_hex(6)}"

    @staticmethod
    def _now() -> int:
        return int(time.time() * 1000)

    def list(self) -> list[CustomNode]:
        with self._lock:
            return [CustomNode.model_validate(item) for item in self._read()]

    def get(self, node_id: str) -> CustomNode | None:
        with self._lock:
            for item in self._read():
                if item.get("id") == node_id:
                    return CustomNode.model_validate(item)
            return None

    def create(self, node: CustomNode) -> CustomNode:
        with self._lock:
            items = self._read()
            if not node.id:
                node = node.model_copy(update={"id": self._new_id()})
            ts = self._now()
            node = node.model_copy(update={"created_at": ts, "updated_at": ts})
            items.append(node.model_dump())
            self._write(items)
            return node

    def update(self, node_id: str, patch: dict) -> CustomNode | None:
        with self._lock:
            items = self._read()
            for index, item in enumerate(items):
                if item.get("id") == node_id:
                    merged = {**item, **{k: v for k, v in patch.items() if v is not None}}
                    merged["id"] = node_id
                    merged["created_at"] = item.get("created_at") or self._now()
                    merged["updated_at"] = self._now()
                    validated = CustomNode.model_validate(merged)
                    items[index] = validated.model_dump()
                    self._write(items)
                    return validated
            return None

    def delete(self, node_id: str) -> bool:
        with self._lock:
            items = self._read()
            new_items = [item for item in items if item.get("id") != node_id]
            if len(new_items) == len(items):
                return False
            self._write(new_items)
            return True
