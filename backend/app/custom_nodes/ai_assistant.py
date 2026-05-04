"""AI-assisted custom node generation + semantic similarity to existing nodes.

Uses the same OpenRouter integration as the canvas runtime (chat completion
via the server-held API key). Embeddings come from a lightweight call to
OpenRouter's embedding endpoint (passthrough to underlying providers).
"""

from __future__ import annotations

import json
import math
import os
import re
from typing import Any, Callable

import httpx

from .models import (
    AIGenerateRequest,
    AIGenerateResponse,
    CustomNodeCreateRequest,
    SimilarNodeHit,
)

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
EMBEDDING_MODEL = "openai/text-embedding-3-small"


# ---------------------------------------------------------------------------
# OpenRouter helpers (kept local so we don't pull in canvas internals).
# ---------------------------------------------------------------------------


def _openrouter_keys(api_store_getter: Callable | None = None) -> list[str]:
    candidates: list[str] = []
    env_key = (os.environ.get("OPENROUTER_API_KEY") or "").strip()
    if env_key:
        candidates.append(env_key)
    if api_store_getter:
        try:
            store = api_store_getter()
            if store is not None:
                for stored in store.keys_for_env("OPENROUTER_API_KEY"):
                    s = (stored or "").strip()
                    if s and s not in candidates:
                        candidates.append(s)
        except Exception:  # noqa: BLE001
            pass
    return candidates


def _post_openrouter(
    path: str,
    body: dict[str, Any],
    *,
    api_store_getter: Callable | None,
    timeout: float = 60.0,
) -> dict[str, Any]:
    keys = _openrouter_keys(api_store_getter)
    if not keys:
        raise RuntimeError("OPENROUTER_API_KEY not configured on the server.")
    last_error = ""
    for index, api_key in enumerate(keys):
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": os.environ.get("OPENROUTER_REFERER", "http://localhost:5173"),
            "X-Title": os.environ.get("OPENROUTER_TITLE", "XRAG Assistant"),
        }
        try:
            with httpx.Client(timeout=timeout) as client:
                resp = client.post(f"{OPENROUTER_BASE_URL}{path}", headers=headers, json=body)
        except httpx.HTTPError as exc:
            last_error = f"OpenRouter unreachable: {exc}"
            continue
        if resp.status_code in (401, 402, 403):
            last_error = f"key #{index + 1} rejected ({resp.status_code})"
            continue
        if resp.status_code != 200:
            raise RuntimeError(f"OpenRouter {path} failed ({resp.status_code}): {resp.text[:300]}")
        return resp.json()
    raise RuntimeError(f"All OpenRouter keys failed. Last error: {last_error or 'unknown'}")


# ---------------------------------------------------------------------------
# Embeddings + cosine similarity
# ---------------------------------------------------------------------------


def embed_text(text: str, *, api_store_getter: Callable | None = None) -> list[float] | None:
    """Returns a single embedding vector for `text`, or None on failure."""
    text = (text or "").strip()
    if not text:
        return None
    try:
        payload = _post_openrouter(
            "/embeddings",
            {"model": EMBEDDING_MODEL, "input": text[:4000]},
            api_store_getter=api_store_getter,
            timeout=30.0,
        )
        data = payload.get("data") or []
        if not data:
            return None
        vec = data[0].get("embedding")
        return list(vec) if vec else None
    except Exception:  # noqa: BLE001 — similarity is best-effort
        return None


def cosine(a: list[float] | None, b: list[float] | None) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


# ---------------------------------------------------------------------------
# Node spec generation via LLM
# ---------------------------------------------------------------------------


_SYSTEM_PROMPT = """You are an expert RAG pipeline engineer assisting an operator
who is designing custom canvas nodes for a visual flow builder.

Given a short natural-language description of what the user wants the node
to do, output a STRICT JSON object with this schema (and ONLY this — no
markdown fences, no commentary):

{
  "name": "<short PascalCase or Title Case label, max 60 chars>",
  "description": "<1–2 sentence purpose>",
  "category": "<one of: Custom, Ingestion, Retrieval, Safety, Brain, Sources, Storage>",
  "color": "<one of: indigo, sky, cyan, emerald, violet, fuchsia, rose, amber, slate>",
  "icon": "<one of: Wand2, Sparkles, Bot, Brain, Code2, Zap, Layers, GitBranch, Filter, Search, Database, Network, Globe, Shield, Repeat, ScissorsLineDashed, ScrollText, FileInput, FileUp, MessageSquare, Mic, Volume2, Eye, User, Image>",
  "inputs": ["<input port name>", ...],
  "outputs": ["<output port name>", ...],
  "default_config": { "<key>": <value>, ... },
  "code": "<Python code that defines `def run(inputs, config, log):` and returns a dict>"
}

Rules for the `code` field:
- It MUST define a top-level function `def run(inputs, config, log):` returning a dict.
- Use `log("...")` for diagnostics.
- Allowed modules (pre-imported, no import statements allowed): json, math, re, statistics, datetime, collections, itertools, functools, hashlib, base64.
- NO file I/O, NO network, NO `eval`/`exec`/`open`/`__import__`, NO async.
- Be concise and defensive: validate inputs, default missing config values.

Choose `category` and `color` to match the closest pipeline stage:
- Brain → amber  (LLM-related)
- Retrieval → cyan  (search, rerank, query rewriting)
- Ingestion → sky  (chunking, embedding, cleaning)
- Safety → rose  (guardrails, redaction, hallucination check)
- Sources → violet  (data inputs)
- Storage → emerald  (databases)
- Custom (fallback) → indigo
"""


def _strip_json_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def generate_node_spec(
    request: AIGenerateRequest,
    *,
    api_store_getter: Callable | None = None,
) -> tuple[CustomNodeCreateRequest | None, str, str]:
    """Returns (suggestion, rationale, raw_model_output)."""
    body = {
        "model": request.model,
        "temperature": float(request.temperature),
        "max_tokens": int(request.max_tokens),
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": request.description.strip()},
        ],
    }
    payload = _post_openrouter(
        "/chat/completions", body, api_store_getter=api_store_getter, timeout=90.0
    )
    raw = ""
    try:
        raw = payload["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError):
        return None, "Empty model response.", ""

    try:
        parsed = json.loads(_strip_json_fences(raw))
    except json.JSONDecodeError as exc:
        return None, f"Could not parse JSON from model: {exc}", raw

    suggestion = CustomNodeCreateRequest(
        name=str(parsed.get("name") or "Custom Node")[:80],
        description=str(parsed.get("description") or ""),
        category=str(parsed.get("category") or "Custom"),
        color=str(parsed.get("color") or "indigo"),
        icon=str(parsed.get("icon") or "Wand2"),
        code=str(parsed.get("code") or ""),
        inputs=list(parsed.get("inputs") or ["text"]),
        outputs=list(parsed.get("outputs") or ["text"]),
        default_config=dict(parsed.get("default_config") or {}),
    )
    rationale = "Generated from description; review the code before saving."
    return suggestion, rationale, raw


# ---------------------------------------------------------------------------
# Similarity search across built-in + custom nodes
# ---------------------------------------------------------------------------


def find_similar_nodes(
    description: str,
    *,
    builtin_nodes: list[dict[str, Any]],
    custom_nodes: list[Any],
    threshold: float = 0.82,
    api_store_getter: Callable | None = None,
    limit: int = 5,
) -> list[SimilarNodeHit]:
    query_vec = embed_text(description, api_store_getter=api_store_getter)
    hits: list[SimilarNodeHit] = []

    if query_vec is None:
        # Fallback: simple keyword overlap.
        return _keyword_similar(description, builtin_nodes, custom_nodes, limit=limit)

    for entry in builtin_nodes:
        text = f"{entry.get('label', '')}. {entry.get('description', '')}"
        emb = embed_text(text, api_store_getter=api_store_getter)
        score = cosine(query_vec, emb)
        if score >= threshold:
            hits.append(
                SimilarNodeHit(
                    template_key=entry.get("template_key", ""),
                    label=entry.get("label", ""),
                    description=entry.get("description", ""),
                    category=entry.get("category", ""),
                    score=float(score),
                    is_custom=False,
                )
            )

    for cn in custom_nodes:
        emb = cn.embedding or embed_text(
            f"{cn.name}. {cn.description}", api_store_getter=api_store_getter
        )
        score = cosine(query_vec, emb)
        if score >= threshold:
            hits.append(
                SimilarNodeHit(
                    template_key=cn.id,
                    label=cn.name,
                    description=cn.description,
                    category=cn.category,
                    score=float(score),
                    is_custom=True,
                )
            )

    hits.sort(key=lambda h: h.score, reverse=True)
    return hits[:limit]


def _keyword_similar(
    description: str,
    builtin_nodes: list[dict[str, Any]],
    custom_nodes: list[Any],
    limit: int = 5,
) -> list[SimilarNodeHit]:
    """Cheap fallback when embeddings are unavailable."""
    tokens = {t.lower() for t in re.findall(r"\w{3,}", description)}
    if not tokens:
        return []
    out: list[SimilarNodeHit] = []
    for entry in builtin_nodes:
        text = f"{entry.get('label', '')} {entry.get('description', '')}".lower()
        words = set(re.findall(r"\w{3,}", text))
        overlap = len(tokens & words)
        if overlap >= 2:
            out.append(
                SimilarNodeHit(
                    template_key=entry.get("template_key", ""),
                    label=entry.get("label", ""),
                    description=entry.get("description", ""),
                    category=entry.get("category", ""),
                    score=overlap / max(1, len(tokens)),
                    is_custom=False,
                )
            )
    for cn in custom_nodes:
        text = f"{cn.name} {cn.description}".lower()
        words = set(re.findall(r"\w{3,}", text))
        overlap = len(tokens & words)
        if overlap >= 2:
            out.append(
                SimilarNodeHit(
                    template_key=cn.id,
                    label=cn.name,
                    description=cn.description,
                    category=cn.category,
                    score=overlap / max(1, len(tokens)),
                    is_custom=True,
                )
            )
    out.sort(key=lambda h: h.score, reverse=True)
    return out[:limit]
