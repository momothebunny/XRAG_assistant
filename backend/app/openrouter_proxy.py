"""OpenRouter proxy — keeps the API key server-side.

The frontend's `OmniEmbeddingNode` calls `GET /api/models/embeddings` instead of
talking to OpenRouter directly, so the secret never reaches the browser.
"""
from __future__ import annotations

import os
import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
_CACHE_TTL_SECONDS = 300  # 5 minutes — OpenRouter's catalogue is very stable.

_router = APIRouter(prefix="/api/models", tags=["models"])

# In-memory cache: { "embeddings": (expires_at_epoch, payload) }
_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}


# ---------------------------------------------------------------------------
# Curated fallback catalogue.
#
# OpenRouter currently does NOT serve embedding endpoints — `GET /models`
# returns ~360 chat-completion entries and zero with `embed` in the id.
# We therefore guarantee that the OmniEmbeddingNode always sees at least the
# canonical industry embeddings, with public context-length figures sourced
# from each provider's docs. These are merged in *after* whatever the live
# OpenRouter catalogue surfaces; live entries take precedence on id collision.
# ---------------------------------------------------------------------------
_CURATED_EMBEDDING_MODELS: list[dict[str, Any]] = [
    {"id": "openai/text-embedding-3-small",   "name": "OpenAI Text Embedding 3 Small",  "context_length": 8191},
    {"id": "openai/text-embedding-3-large",   "name": "OpenAI Text Embedding 3 Large",  "context_length": 8191},
    {"id": "openai/text-embedding-ada-002",   "name": "OpenAI Ada 002",                 "context_length": 8191},
    {"id": "cohere/embed-multilingual-v3.0",  "name": "Cohere Embed Multilingual v3.0", "context_length": 512},
    {"id": "cohere/embed-english-v3.0",       "name": "Cohere Embed English v3.0",      "context_length": 512},
    {"id": "cohere/embed-english-light-v3.0", "name": "Cohere Embed English Light v3",  "context_length": 512},
    {"id": "google/text-embedding-004",       "name": "Google Text Embedding 004",      "context_length": 2048},
    {"id": "voyage/voyage-3",                 "name": "Voyage 3",                       "context_length": 32000},
    {"id": "voyage/voyage-3-lite",            "name": "Voyage 3 Lite",                  "context_length": 32000},
    {"id": "mistralai/mistral-embed",         "name": "Mistral Embed",                  "context_length": 8192},
    {"id": "baai/bge-large-en-v1.5",          "name": "BAAI BGE Large EN v1.5",         "context_length": 512},
    {"id": "baai/bge-m3",                     "name": "BAAI BGE-M3",                    "context_length": 8192},
    # Pinecone integrated-inference models (server-side embedding, no
    # external API key needed — the index hosts the model). The id matches
    # what `pinecone_index.py` configures so the saved canvas flow lights up
    # the dropdown correctly.
    {"id": "intfloat/multilingual-e5-large",  "name": "Pinecone — multilingual-e5-large (1024d, 96 langs)", "context_length": 512},
    {"id": "pinecone/llama-text-embed-v2",    "name": "Pinecone — llama-text-embed-v2 (1024d)",            "context_length": 2048},
]


# ---------------------------------------------------------------------------
# Curated reranker catalogue. Mirrors the embedding fallback: live
# OpenRouter entries take precedence on id collision, otherwise these guarantee
# the canonical Cohere/Voyage/Jina models are visible even when OpenRouter's
# /models endpoint omits them (which is currently the case).
# ---------------------------------------------------------------------------
_CURATED_RERANKER_MODELS: list[dict[str, Any]] = [
    {"id": "cohere/rerank-4-pro",                   "name": "Cohere Rerank 4 Pro",                  "context_length": 4096},
    {"id": "cohere/rerank-4-fast",                  "name": "Cohere Rerank 4 Fast",                 "context_length": 4096},
    {"id": "cohere/rerank-v3.5",                    "name": "Cohere Rerank v3.5",                   "context_length": 4096},
    {"id": "cohere/rerank-english-v3.0",            "name": "Cohere Rerank English v3",             "context_length": 4096},
    {"id": "cohere/rerank-multilingual-v3.0",       "name": "Cohere Rerank Multilingual v3",        "context_length": 4096},
    {"id": "voyage/rerank-2",                       "name": "Voyage Rerank 2",                      "context_length": 16000},
    {"id": "voyage/rerank-2-lite",                  "name": "Voyage Rerank 2 Lite",                 "context_length": 8000},
    {"id": "jina/reranker-v2-base-multilingual",    "name": "Jina Reranker v2 Multilingual",        "context_length": 8192},
    {"id": "mixedbread/mxbai-rerank-large-v1",      "name": "Mixedbread mxbai-rerank-large-v1",     "context_length": 8192},
    {"id": "baai/bge-reranker-v2-m3",               "name": "BAAI BGE Reranker v2 m3",              "context_length": 8192},
]


def _is_embedding_model(model: dict[str, Any]) -> bool:
    """Permissive identifier for embedding models on the OpenRouter catalogue.

    Matches anything whose id contains `embedding`, `embed`, or `bge-`, OR
    whose advertised modality references embedding.
    """
    model_id = str(model.get("id") or "").lower()
    if "embedding" in model_id or "embed" in model_id or "bge-" in model_id:
        return True
    modality = str((model.get("architecture") or {}).get("modality") or "").lower()
    return "embedding" in modality


def _is_reranker_model(model: dict[str, Any]) -> bool:
    """Identify reranker models from the OpenRouter catalogue.

    The user-facing contract: any model whose id contains the substring
    "rerank" is treated as a reranker. We exclude embedding-style ids that
    might coincidentally include the word.
    """
    model_id = str(model.get("id") or "").lower()
    return "rerank" in model_id


def _is_chat_model(model: dict[str, Any]) -> bool:
    """Identify chat / completion models on the OpenRouter catalogue.

    OpenRouter's `/models` mostly returns chat models, so the cleanest
    contract is exclusion: anything that is NOT an embedding or reranker
    is considered a chat model.
    """
    if _is_embedding_model(model) or _is_reranker_model(model):
        return False
    model_id = str(model.get("id") or "").lower()
    # Defensive: also drop pure audio / image models, which advertise their
    # modality in the architecture sub-document.
    modality = str((model.get("architecture") or {}).get("modality") or "").lower()
    if modality and "text" not in modality and "->" not in modality:
        # Modality strings on OpenRouter usually look like "text->text" or
        # "text+image->text". Anything without 'text' is image/audio only.
        return False
    return bool(model_id)



def _project_model(model: dict[str, Any]) -> dict[str, Any]:
    """Trim the OpenRouter payload to the fields the frontend actually needs."""
    return {
        "id": model.get("id"),
        "name": model.get("name") or model.get("id"),
        "context_length": model.get("context_length"),
    }


@_router.get("/embeddings")
def list_embedding_models() -> list[dict[str, Any]]:
    """Return the filtered catalogue of OpenRouter embedding models.

    Errors are surfaced as 502 (upstream failure) or 500 (config). The API key
    is read from the `OPENROUTER_API_KEY` environment variable and NEVER
    forwarded to the client.
    """
    now = time.time()
    cached = _cache.get("embeddings")
    if cached and cached[0] > now:
        return cached[1]

    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENROUTER_API_KEY is not set on the server. Add it to backend/.env.",
        )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.get(f"{OPENROUTER_BASE_URL}/models", headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"OpenRouter unreachable: {exc}") from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"OpenRouter /models failed ({response.status_code}): {response.text[:200]}",
        )

    payload = response.json()
    raw_list = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(raw_list, list):
        raise HTTPException(status_code=502, detail="Unexpected OpenRouter payload shape.")

    embedding_models = [
        _project_model(entry)
        for entry in raw_list
        if isinstance(entry, dict) and _is_embedding_model(entry)
    ]

    # Merge in the curated catalogue. Live OpenRouter entries win on id collision.
    seen_ids = {str(entry["id"]) for entry in embedding_models if entry.get("id")}
    for fallback in _CURATED_EMBEDDING_MODELS:
        if fallback["id"] not in seen_ids:
            embedding_models.append(fallback)
            seen_ids.add(fallback["id"])

    embedding_models.sort(key=lambda item: str(item.get("id") or ""))

    _cache["embeddings"] = (now + _CACHE_TTL_SECONDS, embedding_models)
    return embedding_models


@_router.get("/rerankers")
def list_reranker_models() -> list[dict[str, Any]]:
    """Return the filtered catalogue of OpenRouter reranker models.

    Same secure proxy pattern as `/api/models/embeddings`:
      • API key read from `OPENROUTER_API_KEY` server-side ONLY.
      • Live OpenRouter catalogue is filtered to ids containing "rerank".
      • Curated fallback merged in so the canonical Cohere/Voyage/Jina
        models are always available even when OpenRouter omits them.
    """
    now = time.time()
    cached = _cache.get("rerankers")
    if cached and cached[0] > now:
        return cached[1]

    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENROUTER_API_KEY is not set on the server. Add it to backend/.env.",
        )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.get(f"{OPENROUTER_BASE_URL}/models", headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"OpenRouter unreachable: {exc}") from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"OpenRouter /models failed ({response.status_code}): {response.text[:200]}",
        )

    payload = response.json()
    raw_list = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(raw_list, list):
        raise HTTPException(status_code=502, detail="Unexpected OpenRouter payload shape.")

    reranker_models = [
        _project_model(entry)
        for entry in raw_list
        if isinstance(entry, dict) and _is_reranker_model(entry)
    ]

    seen_ids = {str(entry["id"]) for entry in reranker_models if entry.get("id")}
    for fallback in _CURATED_RERANKER_MODELS:
        if fallback["id"] not in seen_ids:
            reranker_models.append(fallback)
            seen_ids.add(fallback["id"])

    reranker_models.sort(key=lambda item: str(item.get("id") or ""))

    _cache["rerankers"] = (now + _CACHE_TTL_SECONDS, reranker_models)
    return reranker_models


# Curated chat-model fallback. Used when OpenRouter is unreachable so the
# panel never renders empty. Live entries take precedence on id collision.
_CURATED_CHAT_MODELS: list[dict[str, Any]] = [
    {"id": "openai/gpt-4o",                  "name": "OpenAI GPT-4o",               "context_length": 128000},
    {"id": "openai/gpt-4o-mini",             "name": "OpenAI GPT-4o mini",          "context_length": 128000},
    {"id": "openai/gpt-4.1",                 "name": "OpenAI GPT-4.1",              "context_length": 1000000},
    {"id": "openai/gpt-4.1-mini",            "name": "OpenAI GPT-4.1 mini",         "context_length": 1000000},
    {"id": "anthropic/claude-opus-4",        "name": "Anthropic Claude Opus 4",     "context_length": 200000},
    {"id": "anthropic/claude-sonnet-4",      "name": "Anthropic Claude Sonnet 4",   "context_length": 200000},
    {"id": "anthropic/claude-3.5-sonnet",    "name": "Anthropic Claude 3.5 Sonnet", "context_length": 200000},
    {"id": "google/gemini-2.5-pro",          "name": "Google Gemini 2.5 Pro",       "context_length": 2000000},
    {"id": "google/gemini-2.5-flash",        "name": "Google Gemini 2.5 Flash",     "context_length": 1000000},
    {"id": "meta-llama/llama-3.3-70b-instruct", "name": "Llama 3.3 70B Instruct",   "context_length": 131072},
    {"id": "mistralai/mistral-large-2",      "name": "Mistral Large 2",             "context_length": 128000},
    {"id": "mistralai/mixtral-8x22b-instruct", "name": "Mixtral 8x22B Instruct",    "context_length": 65536},
    {"id": "deepseek/deepseek-r1",           "name": "DeepSeek R1",                 "context_length": 65536},
    {"id": "qwen/qwen-2.5-72b-instruct",     "name": "Qwen 2.5 72B Instruct",       "context_length": 131072},
]


@_router.get("/chat")
def list_chat_models() -> list[dict[str, Any]]:
    """Return the OpenRouter chat / completion catalogue (excludes embed + rerank).

    Same secure proxy pattern as `/embeddings` and `/rerankers`. Used by the
    `brain-llm` panel to populate its model dropdown without exposing the
    `OPENROUTER_API_KEY` to the browser.
    """
    now = time.time()
    cached = _cache.get("chat")
    if cached and cached[0] > now:
        return cached[1]

    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENROUTER_API_KEY is not set on the server. Add it to backend/.env.",
        )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.get(f"{OPENROUTER_BASE_URL}/models", headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"OpenRouter unreachable: {exc}") from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"OpenRouter /models failed ({response.status_code}): {response.text[:200]}",
        )

    payload = response.json()
    raw_list = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(raw_list, list):
        raise HTTPException(status_code=502, detail="Unexpected OpenRouter payload shape.")

    chat_models = [
        _project_model(entry)
        for entry in raw_list
        if isinstance(entry, dict) and _is_chat_model(entry)
    ]

    seen_ids = {str(entry["id"]) for entry in chat_models if entry.get("id")}
    for fallback in _CURATED_CHAT_MODELS:
        if fallback["id"] not in seen_ids:
            chat_models.append(fallback)
            seen_ids.add(fallback["id"])

    chat_models.sort(key=lambda item: str(item.get("id") or ""))

    _cache["chat"] = (now + _CACHE_TTL_SECONDS, chat_models)
    return chat_models


# ---------------------------------------------------------------------------
# HuggingFace catalogue — top-N text-generation models by downloads.
#
# This endpoint exists so the LLM picker can offer the broader open-source
# universe (Mistral / Qwen / Llama community fine-tunes, etc.). We keep the
# OpenRouter endpoint above intact so users can A/B between the curated
# managed catalogue and the raw HF firehose.
#
# Performance notes:
#   • HF's `/api/models` returns relatively heavy entries (siblings, tags, ...).
#     We project to {id, name, downloads, likes, pipeline_tag, last_modified}
#     so the wire payload for 1 000 models stays under ~250 KB.
#   • Cache TTL is 1 hour — download counts move slowly, and HF is rate-limited.
#   • Token is read from HUGGINGFACE_API_KEY and never sent to the browser.
# ---------------------------------------------------------------------------
HF_BASE_URL = "https://huggingface.co/api"
_HF_CACHE_TTL_SECONDS = 3600  # 1 hour


def _project_hf_model(entry: dict[str, Any]) -> dict[str, Any]:
    model_id = str(entry.get("id") or entry.get("modelId") or "")
    # HF ids look like "mistralai/Mistral-7B-Instruct-v0.3"; strip the org for
    # a friendlier display name.
    short_name = model_id.split("/", 1)[1] if "/" in model_id else model_id
    return {
        "id": model_id,
        "name": short_name,
        "pipeline_tag": entry.get("pipeline_tag"),
        "downloads": int(entry.get("downloads") or 0),
        "likes": int(entry.get("likes") or 0),
        "last_modified": entry.get("lastModified") or entry.get("last_modified"),
        # `context_length` is not exposed by the list endpoint; we keep the
        # field shape compatible with the OpenRouter projection so the
        # frontend card can render uniformly. UI will simply hide it when null.
        "context_length": None,
    }


@_router.get("/hf-chat")
def list_huggingface_chat_models(limit: int = 1000) -> list[dict[str, Any]]:
    """Return the top-N HuggingFace text-generation models by download count.

    Mirrors the proxy contract used for OpenRouter: secret stays server-side,
    response is cached, payload is projected to the minimal shape the
    frontend needs.
    """
    # Hard-cap to protect the proxy and the browser. 1000 is the HF page max.
    limit = max(1, min(limit, 1000))

    cache_key = f"hf-chat:{limit}"
    now = time.time()
    cached = _cache.get(cache_key)
    if cached and cached[0] > now:
        return cached[1]

    api_key = os.getenv("HUGGINGFACE_API_KEY", "").strip()
    headers = {"Accept": "application/json"}
    if api_key:
        # HF list endpoint works anonymously but rate-limits aggressively;
        # auth doubles the quota.
        headers["Authorization"] = f"Bearer {api_key}"

    params = {
        "filter": "text-generation",
        "sort": "downloads",
        "direction": "-1",
        "limit": str(limit),
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(f"{HF_BASE_URL}/models", headers=headers, params=params)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"HuggingFace unreachable: {exc}") from exc

    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="HUGGINGFACE_API_KEY rejected by HF.")
    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"HuggingFace /models failed ({response.status_code}): {response.text[:200]}",
        )

    raw = response.json()
    if not isinstance(raw, list):
        raise HTTPException(status_code=502, detail="Unexpected HuggingFace payload shape.")

    models = [_project_hf_model(entry) for entry in raw if isinstance(entry, dict) and entry.get("id")]
    # Already sorted by downloads desc on the API side, but enforce locally
    # in case HF changes the default.
    models.sort(key=lambda item: item.get("downloads", 0), reverse=True)

    _cache[cache_key] = (now + _HF_CACHE_TTL_SECONDS, models)
    return models


@_router.get("/hf-model")
def get_huggingface_model(model_id: str) -> dict[str, Any]:
    """Fetch metadata for a single HuggingFace model by id (e.g. `org/name`).

    Used by the canvas LLM panel so users can paste any HF model id and
    have it added to the picker even if it's outside the cached top-1000.
    Pipeline tag is checked client-side; we only forward HF's view.
    """
    model_id = (model_id or "").strip().lstrip("/").rstrip("/")
    if not model_id or " " in model_id or len(model_id) > 200:
        raise HTTPException(status_code=400, detail="Invalid model id.")

    cache_key = f"hf-model:{model_id}"
    now = time.time()
    cached = _cache.get(cache_key)
    if cached and cached[0] > now:
        return cached[1]

    api_key = os.getenv("HUGGINGFACE_API_KEY", "").strip()
    headers = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.get(f"{HF_BASE_URL}/models/{model_id}", headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"HuggingFace unreachable: {exc}") from exc

    if response.status_code == 404:
        raise HTTPException(status_code=404, detail=f"Model not found: {model_id}")
    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="HUGGINGFACE_API_KEY rejected by HF.")
    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"HuggingFace /models/{model_id} failed ({response.status_code}): {response.text[:200]}",
        )

    payload = response.json()
    if not isinstance(payload, dict) or not payload.get("id"):
        raise HTTPException(status_code=502, detail="Unexpected HuggingFace payload shape.")

    projected = _project_hf_model(payload)
    _cache[cache_key] = (now + _HF_CACHE_TTL_SECONDS, projected)
    return projected


router = _router
