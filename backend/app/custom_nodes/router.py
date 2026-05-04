"""FastAPI router for custom-node CRUD + sandboxed test runs + AI generation."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Callable

from fastapi import APIRouter, HTTPException

from . import ai_assistant
from .models import (
    AIGenerateRequest,
    AIGenerateResponse,
    CustomNode,
    CustomNodeCreateRequest,
    CustomNodeRunRequest,
    CustomNodeRunResult,
    CustomNodeUpdateRequest,
    SimilarNodeHit,
)
from .sandbox import execute_user_code
from .store import CustomNodeStore

router = APIRouter(prefix="/api/custom-nodes", tags=["custom-nodes"])

# Configured at app startup via `configure(...)`.
_store: CustomNodeStore | None = None
_api_store_getter: Callable | None = None
_builtin_descriptors_getter: Callable | None = None


def configure(
    *,
    data_dir: Path,
    api_store_getter: Callable | None = None,
    builtin_descriptors_getter: Callable | None = None,
) -> CustomNodeStore:
    """Wire up the module's singletons. Call once from `main.py`."""
    global _store, _api_store_getter, _builtin_descriptors_getter
    _store = CustomNodeStore(data_dir)
    _api_store_getter = api_store_getter
    _builtin_descriptors_getter = builtin_descriptors_getter
    return _store


def _require_store() -> CustomNodeStore:
    if _store is None:
        raise HTTPException(status_code=500, detail="Custom node store not configured")
    return _store


def _builtin_nodes_for_similarity() -> list[dict]:
    if _builtin_descriptors_getter is None:
        return []
    try:
        descriptors = _builtin_descriptors_getter() or []
    except Exception:  # noqa: BLE001
        return []
    out: list[dict] = []
    for d in descriptors:
        # Pydantic NodeDescriptor or dict.
        if hasattr(d, "model_dump"):
            d = d.model_dump()
        out.append(
            {
                "template_key": d.get("template_key") or d.get("templateKey", ""),
                "label": d.get("label", ""),
                "description": d.get("description", ""),
                "category": d.get("category", ""),
            }
        )
    return out


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


@router.get("", response_model=list[CustomNode])
def list_custom_nodes() -> list[CustomNode]:
    return _require_store().list()


@router.post("", response_model=CustomNode)
def create_custom_node(payload: CustomNodeCreateRequest) -> CustomNode:
    store = _require_store()
    node = CustomNode(id="", **payload.model_dump())
    # Best-effort embedding cache for future similarity queries.
    try:
        emb = ai_assistant.embed_text(
            f"{node.name}. {node.description}",
            api_store_getter=_api_store_getter,
        )
        if emb:
            node = node.model_copy(update={"embedding": emb})
    except Exception:  # noqa: BLE001
        pass
    return store.create(node)


@router.put("/{node_id}", response_model=CustomNode)
def update_custom_node(node_id: str, payload: CustomNodeUpdateRequest) -> CustomNode:
    store = _require_store()
    patch = payload.model_dump(exclude_none=True)
    # Re-embed if name or description changed.
    if "name" in patch or "description" in patch:
        existing = store.get(node_id)
        if existing is not None:
            new_name = patch.get("name", existing.name)
            new_desc = patch.get("description", existing.description)
            try:
                emb = ai_assistant.embed_text(
                    f"{new_name}. {new_desc}",
                    api_store_getter=_api_store_getter,
                )
                if emb:
                    patch["embedding"] = emb
            except Exception:  # noqa: BLE001
                pass
    updated = store.update(node_id, patch)
    if updated is None:
        raise HTTPException(status_code=404, detail="Custom node not found")
    return updated


@router.delete("/{node_id}")
def delete_custom_node(node_id: str) -> dict[str, bool]:
    if not _require_store().delete(node_id):
        raise HTTPException(status_code=404, detail="Custom node not found")
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Sandboxed execution
# ---------------------------------------------------------------------------


@router.post("/{node_id}/run", response_model=CustomNodeRunResult)
def run_custom_node(node_id: str, payload: CustomNodeRunRequest) -> CustomNodeRunResult:
    store = _require_store()
    node = store.get(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Custom node not found")
    started = time.monotonic()
    ok, output, logs, error = execute_user_code(
        node.code,
        payload.inputs,
        {**node.default_config, **payload.config},
        timeout_seconds=5.0,
    )
    duration = int((time.monotonic() - started) * 1000)
    return CustomNodeRunResult(
        ok=ok, output=output, logs=logs, error=error, duration_ms=duration
    )


@router.post("/preview/run", response_model=CustomNodeRunResult)
def run_preview(payload: dict) -> CustomNodeRunResult:
    """Test-execute arbitrary code without persisting (used by the editor)."""
    code = str(payload.get("code") or "")
    inputs = dict(payload.get("inputs") or {})
    config = dict(payload.get("config") or {})
    started = time.monotonic()
    ok, output, logs, error = execute_user_code(code, inputs, config, timeout_seconds=5.0)
    duration = int((time.monotonic() - started) * 1000)
    return CustomNodeRunResult(
        ok=ok, output=output, logs=logs, error=error, duration_ms=duration
    )


# ---------------------------------------------------------------------------
# AI assistant
# ---------------------------------------------------------------------------


@router.post("/ai/generate", response_model=AIGenerateResponse)
def ai_generate(payload: AIGenerateRequest) -> AIGenerateResponse:
    store = _require_store()
    builtin = _builtin_nodes_for_similarity()
    custom = store.list()

    similar = ai_assistant.find_similar_nodes(
        payload.description,
        builtin_nodes=builtin,
        custom_nodes=custom,
        threshold=payload.similarity_threshold,
        api_store_getter=_api_store_getter,
    )

    # If something very close already exists, suggest reuse instead of generating.
    if similar and similar[0].score >= max(0.9, payload.similarity_threshold + 0.05):
        return AIGenerateResponse(
            suggestion=None,
            similar=similar,
            used_existing=True,
            rationale=f"A very similar node already exists: '{similar[0].label}' (score {similar[0].score:.2f}). Reuse it instead of creating a duplicate.",
        )

    try:
        suggestion, rationale, raw = ai_assistant.generate_node_spec(
            payload, api_store_getter=_api_store_getter
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"AI generation failed: {exc}")

    return AIGenerateResponse(
        suggestion=suggestion,
        similar=similar,
        used_existing=False,
        rationale=rationale,
        raw_model_output=raw,
    )


@router.post("/ai/similar", response_model=list[SimilarNodeHit])
def ai_similar(payload: AIGenerateRequest) -> list[SimilarNodeHit]:
    store = _require_store()
    return ai_assistant.find_similar_nodes(
        payload.description,
        builtin_nodes=_builtin_nodes_for_similarity(),
        custom_nodes=store.list(),
        threshold=payload.similarity_threshold,
        api_store_getter=_api_store_getter,
    )
