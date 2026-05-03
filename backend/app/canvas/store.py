"""Persistence layer for canvas flows."""

from __future__ import annotations

import json
from pathlib import Path
from threading import Lock
from time import time
from uuid import uuid4

from .models import CanvasFlow, FlowSummary


class CanvasFlowStore:
    def __init__(self, data_dir: Path) -> None:
        self._path = data_dir / "canvas_flows.json"
        self._lock = Lock()
        data_dir.mkdir(parents=True, exist_ok=True)

    def _read(self) -> list[dict]:
        if not self._path.exists():
            return []
        return json.loads(self._path.read_text(encoding="utf-8"))

    def _write(self, flows: list[CanvasFlow]) -> None:
        self._path.write_text(
            json.dumps(
                [flow.model_dump(by_alias=True) for flow in flows],
                indent=2,
            ),
            encoding="utf-8",
        )

    def list_flows(self) -> list[FlowSummary]:
        with self._lock:
            data = self._read()
            return [
                FlowSummary(
                    id=item.get("id", ""),
                    name=item.get("name", "Untitled"),
                    description=item.get("description", ""),
                    node_count=len(item.get("nodes", [])),
                    edge_count=len(item.get("edges", [])),
                    updated_at=item.get("updatedAt"),
                )
                for item in data
                if item.get("id")
            ]

    def get_flow(self, flow_id: str) -> CanvasFlow | None:
        with self._lock:
            for raw in self._read():
                if raw.get("id") == flow_id:
                    return CanvasFlow.model_validate(raw)
        return None

    def upsert_flow(self, flow: CanvasFlow) -> CanvasFlow:
        with self._lock:
            data = self._read()
            now = int(time() * 1000)
            if not flow.id:
                flow = flow.model_copy(update={"id": f"flow-{uuid4().hex[:10]}", "created_at": now})
            flow = flow.model_copy(update={"updated_at": now})
            existing = [CanvasFlow.model_validate(item) for item in data]
            replaced = False
            for index, current in enumerate(existing):
                if current.id == flow.id:
                    existing[index] = flow
                    replaced = True
                    break
            if not replaced:
                existing.insert(0, flow)
            self._write(existing[:200])
            return flow

    def delete_flow(self, flow_id: str) -> bool:
        with self._lock:
            data = self._read()
            kept = [CanvasFlow.model_validate(item) for item in data if item.get("id") != flow_id]
            if len(kept) == len(data):
                return False
            self._write(kept)
            return True
