"""JSON persistence for benchmark datasets and runs."""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Optional

from .models import BenchmarkDataset, BenchmarkRun


class BenchmarkStore:
    _DATASETS_FILE = "benchmark_datasets.json"
    _RUNS_FILE = "benchmark_runs.json"

    def __init__(self, data_dir: Path) -> None:
        self._dir = Path(data_dir)
        self._datasets_path = self._dir / self._DATASETS_FILE
        self._runs_path = self._dir / self._RUNS_FILE
        self._lock = threading.Lock()
        for p in (self._datasets_path, self._runs_path):
            if not p.exists():
                p.write_text("[]", encoding="utf-8")

    # ── Internal ─────────────────────────────────────────────────────────

    def _read(self, path: Path) -> list[dict]:
        try:
            text = path.read_text(encoding="utf-8").strip()
            return json.loads(text) if text else []
        except Exception:
            return []

    def _write(self, path: Path, data: list[dict]) -> None:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    # ── Datasets ──────────────────────────────────────────────────────────

    def list_datasets(self) -> list[dict]:
        return self._read(self._datasets_path)

    def get_dataset(self, dataset_id: str) -> Optional[dict]:
        return next(
            (d for d in self._read(self._datasets_path) if d["id"] == dataset_id), None
        )

    def save_dataset(self, dataset: BenchmarkDataset) -> None:
        with self._lock:
            items = [d for d in self._read(self._datasets_path) if d["id"] != dataset.id]
            items.append(dataset.model_dump())
            self._write(self._datasets_path, items)

    def delete_dataset(self, dataset_id: str) -> bool:
        with self._lock:
            items = self._read(self._datasets_path)
            new = [d for d in items if d["id"] != dataset_id]
            if len(new) == len(items):
                return False
            self._write(self._datasets_path, new)
            return True

    # ── Runs ──────────────────────────────────────────────────────────────

    def list_runs(self) -> list[dict]:
        """Return summaries (no results array) for list view."""
        runs = self._read(self._runs_path)
        return [{k: v for k, v in r.items() if k != "results"} for r in runs]

    def get_run(self, run_id: str) -> Optional[dict]:
        return next(
            (r for r in self._read(self._runs_path) if r["id"] == run_id), None
        )

    def save_run(self, run: BenchmarkRun) -> None:
        with self._lock:
            items = [r for r in self._read(self._runs_path) if r["id"] != run.id]
            items.append(run.model_dump())
            self._write(self._runs_path, items)

    def delete_run(self, run_id: str) -> bool:
        with self._lock:
            items = self._read(self._runs_path)
            new = [r for r in items if r["id"] != run_id]
            if len(new) == len(items):
                return False
            self._write(self._runs_path, new)
            return True
