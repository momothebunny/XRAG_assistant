"""Model Health probe — real, server-side liveness checks.

The frontend `HealthTab` calls these endpoints to render the LLM Status &
Health Dashboard. We probe two universes:

* **OpenRouter** — `GET /api/v1/models/{id}/endpoints` returns the providers
  serving a given model id. It's free (no completion charge), authenticated
  with our server-side `OPENROUTER_API_KEY` if available, and a 200 response
  with at least one provider entry is a good liveness signal. 404 → offline,
  429 → rate_limited, 5xx / network errors → offline.

* **Hugging Face** — `POST https://api-inference.huggingface.co/models/{id}`
  with `options.wait_for_model: false` so HF returns 503 *immediately* when a
  model needs cold-starting (instead of blocking for 20–60 s). This gives us
  the actual `waking_up` signal that powers the amber pulse on the UI. 200
  → online, 503 → waking_up, 429 → rate_limited, 401 → offline (auth), other
  → offline.

We expose a tiny `/api/health/top-hf` helper that returns the top 10 chat
models by download count — used by the UI's "Quick Add" button so a user
can populate the watchlist with the most-relevant HF models in one click.
This call piggybacks on the existing HF chat-models cache (1 hour TTL) so
no extra HF traffic is generated.
"""
from __future__ import annotations

import os
import time
from typing import Any, Literal

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .openrouter_proxy import _cache

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Probe timeout. Kept short so a dead model doesn't stall the dashboard.
_PROBE_TIMEOUT_SECONDS = 8.0

router = APIRouter(prefix="/api/health", tags=["health"])

HealthStatus = Literal["online", "waking_up", "offline", "rate_limited", "unsupported"]
HealthProvider = Literal["openrouter", "huggingface"]


class ProbeRequest(BaseModel):
    provider: HealthProvider
    model_id: str = Field(..., min_length=3, max_length=200)


class ProbeResponse(BaseModel):
    provider: HealthProvider
    model_id: str
    status: HealthStatus
    latency_ms: int | None = None
    last_checked: str
    message: str | None = None
    http_status: int | None = None


def _now_iso() -> str:
    # Use the same UTC ISO format the frontend's `new Date(iso)` expects.
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _probe_openrouter(model_id: str) -> ProbeResponse:
    """Liveness check via OpenRouter's free `/models/{id}/endpoints`.

    A 200 response with a non-empty endpoint list means at least one provider
    is currently serving the model. The author/slug split is required by
    OpenRouter's URL scheme.
    """
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    headers = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    if "/" not in model_id:
        return ProbeResponse(
            provider="openrouter",
            model_id=model_id,
            status="offline",
            latency_ms=None,
            last_checked=_now_iso(),
            message="Invalid OpenRouter id (expected `author/slug`).",
        )

    url = f"{OPENROUTER_BASE_URL}/models/{model_id}/endpoints"
    started = time.perf_counter()
    try:
        with httpx.Client(timeout=_PROBE_TIMEOUT_SECONDS) as client:
            response = client.get(url, headers=headers)
    except httpx.TimeoutException:
        return ProbeResponse(
            provider="openrouter",
            model_id=model_id,
            status="offline",
            latency_ms=None,
            last_checked=_now_iso(),
            message=f"Timeout after {_PROBE_TIMEOUT_SECONDS:.0f}s",
        )
    except httpx.HTTPError as exc:
        return ProbeResponse(
            provider="openrouter",
            model_id=model_id,
            status="offline",
            latency_ms=None,
            last_checked=_now_iso(),
            message=f"Network error: {exc.__class__.__name__}",
        )
    latency_ms = int((time.perf_counter() - started) * 1000)

    if response.status_code == 200:
        try:
            payload = response.json()
        except ValueError:
            payload = None
        endpoints = []
        if isinstance(payload, dict):
            data = payload.get("data") or payload
            endpoints = data.get("endpoints") if isinstance(data, dict) else []
        if not endpoints:
            return ProbeResponse(
                provider="openrouter",
                model_id=model_id,
                status="unsupported",
                latency_ms=None,
                last_checked=_now_iso(),
                message="No provider currently serves this model.",
                http_status=200,
            )
        provider_count = len(endpoints) if isinstance(endpoints, list) else 1
        return ProbeResponse(
            provider="openrouter",
            model_id=model_id,
            status="online",
            latency_ms=latency_ms,
            last_checked=_now_iso(),
            message=f"{provider_count} provider(s) available",
            http_status=200,
        )
    if response.status_code == 404:
        return ProbeResponse(
            provider="openrouter",
            model_id=model_id,
            status="unsupported",
            latency_ms=None,
            last_checked=_now_iso(),
            message="404 — model id unknown to OpenRouter.",
            http_status=404,
        )
    if response.status_code == 429:
        return ProbeResponse(
            provider="openrouter",
            model_id=model_id,
            status="rate_limited",
            latency_ms=latency_ms,
            last_checked=_now_iso(),
            message="429 Too Many Requests",
            http_status=429,
        )
    return ProbeResponse(
        provider="openrouter",
        model_id=model_id,
        status="offline",
        latency_ms=latency_ms,
        last_checked=_now_iso(),
        message=f"HTTP {response.status_code}",
        http_status=response.status_code,
    )


def _probe_huggingface(model_id: str) -> ProbeResponse:
    """Liveness check via HF Hub model metadata + Inference Providers mapping.

    Why not the legacy serverless Inference API (`api-inference.huggingface.co`)?
    Hugging Face deprecated free serverless inference for most popular chat
    models in late 2024 — they consistently return 404 even for hugely
    popular ids like `meta-llama/Llama-3.1-8B-Instruct`. The modern signal
    lives on the Hub metadata:

      * `inference: "warm"` — at least one provider is hot and serving now.
      * `inference: "cold"` — supported but currently sleeping (cold start).
      * `inferenceProviderMapping` — list of third-party providers (Together,
        Fireworks, Replicate, …) that route through HF's `router.huggingface.co`.
        Each entry's `status` is `"live"` when actively serving.

    Mapping:
      - warm OR any provider live → online
      - cold (no live providers)  → waking_up
      - mapping present but none live → offline ("no provider currently live")
      - 404 / 401 / 429 / 5xx     → offline / rate_limited as appropriate
    """
    api_key = os.getenv("HUGGINGFACE_API_KEY", "").strip()
    headers = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    # `expand[]` query params force HF to include the otherwise-omitted
    # inference fields on the basic model endpoint.
    url = f"https://huggingface.co/api/models/{model_id}"
    params = [
        ("expand[]", "inference"),
        ("expand[]", "inferenceProviderMapping"),
        ("expand[]", "downloads"),
        ("expand[]", "likes"),
    ]

    started = time.perf_counter()
    try:
        with httpx.Client(timeout=_PROBE_TIMEOUT_SECONDS) as client:
            response = client.get(url, headers=headers, params=params)
    except httpx.TimeoutException:
        return ProbeResponse(
            provider="huggingface",
            model_id=model_id,
            status="offline",
            latency_ms=None,
            last_checked=_now_iso(),
            message=f"Timeout after {_PROBE_TIMEOUT_SECONDS:.0f}s",
        )
    except httpx.HTTPError as exc:
        return ProbeResponse(
            provider="huggingface",
            model_id=model_id,
            status="offline",
            latency_ms=None,
            last_checked=_now_iso(),
            message=f"Network error: {exc.__class__.__name__}",
        )
    latency_ms = int((time.perf_counter() - started) * 1000)

    if response.status_code == 401:
        return ProbeResponse(
            provider="huggingface",
            model_id=model_id,
            status="offline",
            latency_ms=latency_ms,
            last_checked=_now_iso(),
            message="401 — HUGGINGFACE_API_KEY rejected.",
            http_status=401,
        )
    if response.status_code == 404:
        return ProbeResponse(
            provider="huggingface",
            model_id=model_id,
            status="offline",
            latency_ms=latency_ms,
            last_checked=_now_iso(),
            message="404 — model not found on the Hub.",
            http_status=404,
        )
    if response.status_code == 429:
        return ProbeResponse(
            provider="huggingface",
            model_id=model_id,
            status="rate_limited",
            latency_ms=latency_ms,
            last_checked=_now_iso(),
            message="429 — Hub API rate-limit hit.",
            http_status=429,
        )
    if response.status_code != 200:
        return ProbeResponse(
            provider="huggingface",
            model_id=model_id,
            status="offline",
            latency_ms=latency_ms,
            last_checked=_now_iso(),
            message=f"HTTP {response.status_code}",
            http_status=response.status_code,
        )

    try:
        meta = response.json()
    except ValueError:
        meta = {}
    if not isinstance(meta, dict):
        meta = {}

    # Normalise the two relevant fields. HF returns `inference` as a string
    # ("warm" / "cold") OR sometimes an object — handle both defensively.
    inference_field = meta.get("inference")
    if isinstance(inference_field, dict):
        inference_state = str(inference_field.get("status") or "").lower()
    else:
        inference_state = str(inference_field or "").lower()

    mapping = meta.get("inferenceProviderMapping")
    # HF currently returns this as a list of dicts; older snapshots used a
    # dict keyed by provider. Normalise to a list of (name, status) tuples.
    providers: list[tuple[str, str]] = []
    if isinstance(mapping, list):
        for item in mapping:
            if not isinstance(item, dict):
                continue
            name = str(item.get("provider") or item.get("name") or "?")
            status_str = str(item.get("status") or "").lower()
            providers.append((name, status_str))
    elif isinstance(mapping, dict):
        for name, item in mapping.items():
            status_str = ""
            if isinstance(item, dict):
                status_str = str(item.get("status") or "").lower()
            providers.append((str(name), status_str))

    live_providers = [name for name, status_str in providers if status_str == "live"]

    if inference_state == "warm" or live_providers:
        provider_count = len(live_providers) or len(providers) or 1
        provider_label = (
            ", ".join(live_providers[:3]) + (f" +{len(live_providers) - 3}" if len(live_providers) > 3 else "")
            if live_providers
            else "HF Inference"
        )
        return ProbeResponse(
            provider="huggingface",
            model_id=model_id,
            status="online",
            latency_ms=latency_ms,
            last_checked=_now_iso(),
            message=f"Warm via {provider_label} ({provider_count} provider{'s' if provider_count != 1 else ''})",
            http_status=200,
        )
    if inference_state == "cold":
        return ProbeResponse(
            provider="huggingface",
            model_id=model_id,
            status="waking_up",
            latency_ms=latency_ms,
            last_checked=_now_iso(),
            message="Model is cold — first request will trigger a load.",
            http_status=200,
        )
    # `unsupported` (vs `offline`) communicates that this isn't an outage —
    # the model simply has no hosted endpoint we can route to. The latency
    # value is dropped because the elapsed time only reflects the metadata
    # call, not a real inference round-trip, and would mislead the dashboard
    # average.
    if providers:
        return ProbeResponse(
            provider="huggingface",
            model_id=model_id,
            status="unsupported",
            latency_ms=None,
            last_checked=_now_iso(),
            message=f"No provider live (registered: {len(providers)}).",
            http_status=200,
        )
    return ProbeResponse(
        provider="huggingface",
        model_id=model_id,
        status="unsupported",
        latency_ms=None,
        last_checked=_now_iso(),
        message="No Inference Provider registered for this model.",
        http_status=200,
    )


@router.post("/probe", response_model=ProbeResponse)
def probe_model(request: ProbeRequest) -> ProbeResponse:
    """Run a single liveness probe against the given provider + model id."""
    model_id = request.model_id.strip().lstrip("/").rstrip("/")
    if not model_id or " " in model_id:
        raise HTTPException(status_code=400, detail="Invalid model id.")
    if request.provider == "openrouter":
        return _probe_openrouter(model_id)
    if request.provider == "huggingface":
        return _probe_huggingface(model_id)
    raise HTTPException(status_code=400, detail=f"Unknown provider: {request.provider}")


@router.get("/top-hf")
def top_hf_chat_models(limit: int = 10) -> list[dict[str, Any]]:
    """Return the top-N **trending** HF chat models that are actually callable.

    "Trending" beats raw download counts for a health dashboard: the all-time
    download leaderboard is dominated by tiny research artifacts
    (`gpt2`, `bert-base-uncased`, `opt-125m`) that nobody actually deploys.
    HF's `?sort=trendingScore` mirrors what the huggingface.co/models?sort=trending
    homepage shows — i.e. *what the community is using right now*.

    We additionally filter to ids that have a registered Inference Provider
    mapping so the dashboard's Quick Add suggests models the user can really
    probe. Result is cached for 1 hour.
    """
    limit = max(1, min(limit, 50))
    cache_key = f"top-hf-trending-callable:{limit}"
    now = time.time()
    cached = _cache.get(cache_key)
    if cached and cached[0] > now:
        return cached[1]

    api_key = os.getenv("HUGGINGFACE_API_KEY", "").strip()
    headers = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    # Pull a fresh trending page (NOT the cached downloads-sorted catalogue).
    # Ask for a generous candidate pool so we can drop non-callable entries
    # and still hit `limit`.
    candidates: list[dict[str, Any]] = []
    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.get(
                "https://huggingface.co/api/models",
                headers=headers,
                params={
                    "filter": "text-generation",
                    "sort": "trendingScore",
                    "direction": "-1",
                    "limit": "100",
                },
            )
        if response.status_code == 200:
            raw = response.json()
            if isinstance(raw, list):
                candidates = [r for r in raw if isinstance(r, dict) and r.get("id")]
    except httpx.HTTPError:
        candidates = []

    # Project to the same shape the existing /api/models/hf-chat endpoint
    # uses, so the frontend's chip rendering is identical.
    def _project(entry: dict[str, Any]) -> dict[str, Any]:
        model_id = str(entry.get("id") or entry.get("modelId") or "")
        short = model_id.split("/", 1)[1] if "/" in model_id else model_id
        return {
            "id": model_id,
            "name": short,
            "pipeline_tag": entry.get("pipeline_tag"),
            "downloads": int(entry.get("downloads") or 0),
            "likes": int(entry.get("likes") or 0),
            "trending_score": entry.get("trendingScore"),
            "last_modified": entry.get("lastModified") or entry.get("last_modified"),
            "context_length": None,
        }

    selected: list[dict[str, Any]] = []
    with httpx.Client(timeout=6.0) as client:
        for entry in candidates:
            if len(selected) >= limit:
                break
            model_id = entry.get("id")
            if not model_id:
                continue
            try:
                meta_resp = client.get(
                    f"https://huggingface.co/api/models/{model_id}",
                    headers=headers,
                    params=[
                        ("expand[]", "inference"),
                        ("expand[]", "inferenceProviderMapping"),
                    ],
                )
            except httpx.HTTPError:
                continue
            if meta_resp.status_code != 200:
                continue
            try:
                meta = meta_resp.json()
            except ValueError:
                continue
            if not isinstance(meta, dict):
                continue

            mapping = meta.get("inferenceProviderMapping")
            has_mapping = (
                (isinstance(mapping, list) and len(mapping) > 0)
                or (isinstance(mapping, dict) and len(mapping) > 0)
            )
            inference_field = meta.get("inference")
            if isinstance(inference_field, dict):
                inference_state = str(inference_field.get("status") or "").lower()
            else:
                inference_state = str(inference_field or "").lower()

            if has_mapping or inference_state in {"warm", "cold"}:
                selected.append(_project(entry))

    _cache[cache_key] = (now + _HF_CACHE_TTL_SECONDS, selected)
    return selected


# Local copy of the cache TTL so we don't import private state across modules.
_HF_CACHE_TTL_SECONDS = 3600

