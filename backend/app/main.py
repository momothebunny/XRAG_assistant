from pathlib import Path
from time import time
from uuid import uuid4

import hashlib
import logging
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json

# Load secrets from backend/.env BEFORE importing any module that reads env vars.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from .canvas import (
    CanvasFlow,
    CanvasFlowRunner,
    FlowExecutionRequest,
    FlowExecutionResponse,
    FlowSummary,
    NodeDescriptor,
    list_node_descriptors,
)
from .canvas.runner import CanvasFlowError
from .canvas.store import CanvasFlowStore
from .audit import router as audit_router
from .audit.store import AuditStore
from .audit.benchmark_store import BenchmarkStore
from .knowledge import (
    ClassificationRequest,
    ClassificationResult,
    KnowledgeDocument,
    KnowledgeDocumentSummary,
    KnowledgeProcessor,
    KnowledgeStore,
    UploadResponse,
    classify_documents,
)
from .knowledge.models import UrlSource as KnowledgeUrlSource
from .knowledge import pinecone_index
from .models import AssistantSettings, ChatRequest, ChatResponse, CompareDocumentsRequest, CompareDocumentsSummaryResult, FactCheckResult, FactCheckIssue, SaveAnswerRequest, SaveAnswerResponse, SourceSnippet
from .api_keys import (
    ApiKeyImportReport,
    ApiKeyImportRequest,
    ApiKeyPublic,
    ApiKeyStore,
    ApiKeyUpsertRequest,
    PROVIDER_CATALOG,
)
from .openrouter_proxy import router as openrouter_router
from .health import router as health_router
from .custom_nodes import router as custom_nodes_router, configure as configure_custom_nodes
from .auth import router as auth_router, configure as configure_auth
from .rag_engine import LangChainRAGEngine
from .store import JsonStore


app = FastAPI(title="XRAG Assistant API", version="0.1.0")

logger = logging.getLogger(__name__)


def _push_to_pinecone(document: KnowledgeDocument) -> None:
    """Best-effort upsert into Pinecone integrated index.

    Errors are logged but never propagated — the local KnowledgeStore is
    still authoritative for the UI; Pinecone is only used for retrieval.
    """
    try:
        meta = {
            "name": document.name,
            "title": document.name,
            "category": document.category,
            "subcategory": document.subcategory,
            "relative_path": document.relative_path,
        }
        chunks = [c.model_dump() if hasattr(c, "model_dump") else c for c in document.chunks]
        pinecone_index.upsert_chunks(document.id, chunks, doc_meta=meta)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Pinecone upsert failed for %s: %s", document.id, exc)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(openrouter_router)
app.include_router(health_router)
app.include_router(audit_router)
app.include_router(custom_nodes_router)
app.include_router(auth_router)

DATA_DIR = Path(os.environ.get("XRAG_DATA_DIR") or (Path(__file__).resolve().parents[1] / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
store = JsonStore(DATA_DIR)
api_key_store = ApiKeyStore(DATA_DIR)
# Push any persisted, active keys into os.environ so every downstream reader
# (rag_engine, openrouter_proxy, classifier, pinecone, audit, canvas, ...)
# sees them on the very first request.
api_key_store.sync_to_env()
# Expose the store via the module-level singleton so deeper modules
# (canvas/nodes._call_openrouter_chat, audit/validation, ...) can reach it
# without a FastAPI dependency.
from .api_keys import register_store as _register_api_key_store
_register_api_key_store(api_key_store)
rag_engine = LangChainRAGEngine(DATA_DIR)
canvas_store = CanvasFlowStore(DATA_DIR)
knowledge_store = KnowledgeStore(DATA_DIR)
knowledge_processor = KnowledgeProcessor()
audit_store = AuditStore(DATA_DIR)
benchmark_store = BenchmarkStore(DATA_DIR)

# Custom node store + AI assistant — needs to see the API key store so the
# OpenRouter call inside `ai/generate` can promote/rotate keys, and the
# built-in node descriptors so similarity can compare against them.
configure_custom_nodes(
    data_dir=DATA_DIR,
    api_store_getter=lambda: api_key_store,
    builtin_descriptors_getter=list_node_descriptors,
)

# User authentication — JSON-backed store with PBKDF2 password hashing.
configure_auth(DATA_DIR)

# Inject shared state so audit router can access stores + runner
app.state.canvas_store = canvas_store
app.state.canvas_runner = CanvasFlowRunner()
app.state.audit_store = audit_store
app.state.benchmark_store = benchmark_store
app.state.knowledge_store = knowledge_store
app.state.knowledge_processor = knowledge_processor
app.state.push_to_pinecone = _push_to_pinecone


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/settings")
def get_settings() -> AssistantSettings:
    return store.get_settings()


@app.put("/api/settings")
def put_settings(payload: AssistantSettings) -> AssistantSettings:
    settings = store.get_settings().model_copy(update=payload.model_dump())
    return store.save_settings(settings)


# ---------------------------------------------------------------------------
# API key management — multiple keys per provider, active key mirrored to env
# ---------------------------------------------------------------------------


@app.get("/api/settings/api-keys/providers")
def list_api_key_providers() -> list[dict]:
    """Catalogue of supported providers + canonical env-var names."""
    return PROVIDER_CATALOG


@app.get("/api/settings/api-keys", response_model=list[ApiKeyPublic])
def list_api_keys() -> list[ApiKeyPublic]:
    return api_key_store.list_public()


@app.post("/api/settings/api-keys", response_model=ApiKeyPublic)
def upsert_api_key(payload: ApiKeyUpsertRequest) -> ApiKeyPublic:
    return api_key_store.upsert(payload)


@app.delete("/api/settings/api-keys/{key_id}")
def delete_api_key(key_id: str) -> dict[str, bool]:
    deleted = api_key_store.delete(key_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"API key '{key_id}' not found")
    return {"deleted": True}


@app.post("/api/settings/api-keys/{key_id}/activate", response_model=ApiKeyPublic)
def activate_api_key(key_id: str) -> ApiKeyPublic:
    activated = api_key_store.activate(key_id)
    if activated is None:
        raise HTTPException(status_code=404, detail=f"API key '{key_id}' not found")
    return activated


@app.post("/api/settings/api-keys/import", response_model=ApiKeyImportReport)
def import_api_keys(payload: ApiKeyImportRequest) -> ApiKeyImportReport:
    return api_key_store.import_env_text(payload)


@app.get("/api/answers")
def get_answers():
    return store.list_answers()


@app.post("/api/answers", response_model=SaveAnswerResponse)
def post_answer(payload: SaveAnswerRequest):
    saved, answer = store.save_answer(payload)
    return SaveAnswerResponse(saved=saved, answer=answer)


@app.delete("/api/answers/{answer_id}")
def delete_answer(answer_id: str) -> dict[str, bool]:
    deleted = store.delete_answer(answer_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Answer '{answer_id}' not found")
    return {"deleted": True}


@app.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest):
    settings = store.get_settings()

    if settings.retrieval.langchain_enabled:
        try:
            return rag_engine.run(payload, settings)
        except Exception as exc:
            return ChatResponse(
                content=(
                    "RAG runtime error before generation. "
                    f"provider={settings.llm.provider}, model={settings.llm.model}, error={exc.__class__.__name__}: {str(exc)[:220]}"
                ),
                reasoning="LangChain pipeline raised an exception in backend before fallback path could run.",
                traceSteps=[
                    {"label": "RAG", "duration": "0 ms"},
                    {"label": "Error", "duration": "0 ms"},
                ],
                sources=[],
            )

    top_k = settings.retrieval.top_k
    alpha = settings.retrieval.hybrid_alpha
    strict_mode = settings.llm.strict_mode

    if payload.attachments:
        content = (
            f"I processed {len(payload.attachments)} attachment(s) with {settings.vector_store.name} and returned grounded findings "
            f"using top-k={top_k}, alpha={alpha:.1f}."
        )
    else:
        content = (
            f"Answer generated by {settings.llm.model} with retrieval from {settings.vector_store.name}. "
            f"Current strategy: top-k={top_k}, alpha={alpha:.1f}, reranker={'on' if settings.retrieval.reranker_enabled else 'off'}."
        )

    if strict_mode:
        content += " Strict mode is enabled, so the answer is constrained to indexed context."

    reasoning = (
        "1. Read active system settings from backend store. "
        "2. Run hybrid retrieval using configured strategy. "
        "3. Apply reranker if enabled. "
        f"4. Generate response with model={settings.llm.model}, temperature={settings.llm.temperature:.1f}."
    )

    if payload.prompt_reference:
        reasoning += f" Prompt reference: {payload.prompt_reference}."

    return ChatResponse(
        content=content,
        reasoning=reasoning,
        traceSteps=[
            {"label": "Settings", "duration": "8 ms"},
            {"label": "Search", "duration": "112 ms"},
            {"label": "Rerank", "duration": "74 ms"},
            {"label": "Answer", "duration": "68 ms"},
        ],
        sources=[
            SourceSnippet(
                label="BCP_Plan_2024.pdf (p.12)",
                page=12,
                chunkId="C-041",
                tokenCount=83,
                snippet="Critical operation cutover is allowed only after security audit closure and continuity owner approval.",
            ),
            SourceSnippet(
                label="Infra_Security_v2.docx (p.4)",
                page=4,
                chunkId="C-019",
                tokenCount=71,
                snippet="Operational changes require least-privilege access and dual-control confirmation for high impact systems.",
            ),
        ],
    )


# ---------------------------------------------------------------------------
# Canvas (Langflow-style) endpoints
# ---------------------------------------------------------------------------


@app.get("/api/canvas/nodes", response_model=list[NodeDescriptor])
def list_canvas_nodes() -> list[NodeDescriptor]:
    """Expose the registry of node executors so the frontend can introspect."""
    return list_node_descriptors()


@app.get("/api/registry/embedding-models")
def get_embedding_model_registry() -> list[dict]:
    """Return the catalogue of embedding providers + models the OmniEmbeddingNode UI is built from.

    The frontend treats this endpoint as the single source of truth — adding a new
    model on the backend (i.e. appending it to embedding_models_registry.json) is
    enough to make it appear in the canvas without any frontend change.
    """
    registry_path = DATA_DIR / "embedding_models_registry.json"
    if not registry_path.exists():
        raise HTTPException(status_code=404, detail="Embedding model registry not found")
    try:
        return json.loads(registry_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Registry is malformed: {exc}") from exc


@app.get("/api/registry/vector-providers")
def get_vector_providers_registry() -> dict:
    """Return the canonical catalog of vector-store providers.

    Both the backend executor (`storage-vector` node) and the frontend
    `VectorDatabaseSettingsPanel` consume this same JSON so they cannot drift.
    """
    registry_path = DATA_DIR / "vector_providers_registry.json"
    if not registry_path.exists():
        raise HTTPException(status_code=404, detail="Vector provider registry not found")
    try:
        return json.loads(registry_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Registry is malformed: {exc}") from exc


@app.get("/api/registry/graph-providers")
def get_graph_providers_registry() -> dict:
    """Return the canonical catalog of knowledge-graph providers.

    Both the backend executor (`storage-graph` node) and the frontend
    `GraphDatabaseSettingsPanel` consume this JSON so they cannot drift.
    """
    registry_path = DATA_DIR / "graph_providers_registry.json"
    if not registry_path.exists():
        raise HTTPException(status_code=404, detail="Graph provider registry not found")
    try:
        return json.loads(registry_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Registry is malformed: {exc}") from exc


@app.get("/api/registry/rerankers")
def get_rerankers_registry() -> dict:
    """Return the canonical catalog of reranker models (Cohere/Voyage/BGE/...).

    Shared by the `process-reranker` executor and the frontend
    `RerankerSettingsPanel` to keep model metadata in lock-step.
    """
    registry_path = DATA_DIR / "reranker_models_registry.json"
    if not registry_path.exists():
        raise HTTPException(status_code=404, detail="Reranker registry not found")
    try:
        return json.loads(registry_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Registry is malformed: {exc}") from exc


@app.get("/api/registry/retriever-providers")
def get_retriever_providers_registry() -> dict:
    """Return the retriever provider catalog used by process-retriever UI/runtime."""
    registry_path = DATA_DIR / "retriever_providers_registry.json"
    if not registry_path.exists():
        raise HTTPException(status_code=404, detail="Retriever provider registry not found")
    try:
        return json.loads(registry_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Registry is malformed: {exc}") from exc


@app.get("/api/registry/embedding-providers")
def get_embedding_providers_registry() -> dict:
    """Return the provider-first embedding catalog used by the EmbeddingSettingsPanel.

    Each entry carries credentialFields, additionalFields and a model list so
    the frontend can render provider → model → params without hard-coding anything.
    """
    registry_path = DATA_DIR / "embedding_providers_registry.json"
    if not registry_path.exists():
        raise HTTPException(status_code=404, detail="Embedding provider registry not found")
    try:
        return json.loads(registry_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Registry is malformed: {exc}") from exc


@app.get("/api/canvas/flows", response_model=list[FlowSummary])
def list_canvas_flows() -> list[FlowSummary]:
    return canvas_store.list_flows()


@app.get("/api/canvas/flows/{flow_id}", response_model=CanvasFlow)
def get_canvas_flow(flow_id: str) -> CanvasFlow:
    flow = canvas_store.get_flow(flow_id)
    if flow is None:
        raise HTTPException(status_code=404, detail=f"Flow '{flow_id}' not found")
    return flow


@app.post("/api/canvas/flows", response_model=CanvasFlow)
@app.put("/api/canvas/flows", response_model=CanvasFlow)
def upsert_canvas_flow(payload: CanvasFlow) -> CanvasFlow:
    return canvas_store.upsert_flow(payload)


@app.delete("/api/canvas/flows/{flow_id}")
def delete_canvas_flow(flow_id: str) -> dict[str, bool]:
    deleted = canvas_store.delete_flow(flow_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Flow '{flow_id}' not found")
    return {"deleted": True}


@app.post("/api/canvas/run", response_model=FlowExecutionResponse)
def run_canvas_flow(payload: FlowExecutionRequest) -> FlowExecutionResponse:
    flow = payload.flow
    if flow is None and payload.flow_id:
        flow = canvas_store.get_flow(payload.flow_id)
    if flow is None:
        raise HTTPException(status_code=400, detail="Either 'flow' or 'flowId' must be provided.")

    runner = CanvasFlowRunner(settings=store.get_settings())
    try:
        return runner.run(payload, flow)
    except CanvasFlowError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Knowledge base endpoints
# ---------------------------------------------------------------------------


def _normalize_doc_name(name: str) -> str:
    """Lower-case base name without extension and with whitespace collapsed."""
    stem = Path(name).stem.lower()
    return re.sub(r"\s+", " ", stem).strip()


def _find_duplicate(
    existing: list[KnowledgeDocumentSummary],
    name: str,
    size_bytes: int,
    content_hash: str,
    *,
    exclude_id: str | None = None,
) -> KnowledgeDocumentSummary | None:
    """Return an existing document that matches the new upload, if any.

    Matching rules:
      1. Exact byte equality (sha256 hash match).
      2. Same normalized file name AND size within ~2% (handles tiny
         metadata-only edits / re-saves of the same document).
    """
    norm = _normalize_doc_name(name)
    for doc in existing:
        if exclude_id and doc.id == exclude_id:
            continue
        if content_hash and doc.content_hash and doc.content_hash == content_hash:
            return doc
        if _normalize_doc_name(doc.name) == norm and doc.size_bytes > 0 and size_bytes > 0:
            larger = max(doc.size_bytes, size_bytes)
            smaller = min(doc.size_bytes, size_bytes)
            if (larger - smaller) / larger <= 0.02:
                return doc
    return None


@app.post("/api/knowledge/upload", response_model=UploadResponse)
async def upload_knowledge_documents(
    files: list[UploadFile] = File(...),
    flow_id: str | None = Form(default=None),
    relative_paths: list[str] | None = Form(default=None),
) -> UploadResponse:
    """Upload one or more files (optionally part of a folder) and chunk them.

    The chunking parameters are read from the canvas flow identified by
    ``flow_id`` — specifically the first node whose ``templateKey`` is
    ``chunking``. Falls back to sensible defaults if no such node exists.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files were uploaded.")

    flow = canvas_store.get_flow(flow_id) if flow_id else None
    chunking_config = knowledge_processor.resolve_chunking_config(flow)

    existing_docs = knowledge_store.list_documents()

    summaries: list[KnowledgeDocumentSummary] = []
    for index, upload in enumerate(files):
        relative_path = ""
        if relative_paths and index < len(relative_paths):
            relative_path = relative_paths[index] or ""
        relative_path = relative_path.replace("\\", "/").lstrip("/")
        original_name = upload.filename or relative_path or f"document-{index}"

        doc_id = f"doc-{uuid4().hex[:12]}"
        target_dir = knowledge_store.upload_dir_for(doc_id)
        safe_name = Path(original_name).name or f"document-{index}"
        target_path = target_dir / safe_name

        contents = await upload.read()
        size_bytes = len(contents)
        content_hash = hashlib.sha256(contents).hexdigest()

        # ----- Duplicate detection -----------------------------------
        conflict = _find_duplicate(existing_docs, safe_name, size_bytes, content_hash)
        if conflict is not None:
            reason = (
                "azonos tartalom (byte-szintű egyezés)"
                if conflict.content_hash and conflict.content_hash == content_hash
                else "azonos név és közel azonos méret"
            )
            # Don't write the file; clean the empty upload directory.
            try:
                target_dir.rmdir()
            except OSError:
                pass
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Duplicate document: '{safe_name}' ütközik a már feltöltött "
                    f"'{conflict.name}' dokumentummal ({reason}). "
                    f"Ha frissíteni szeretnéd, használd a meglévő dokumentum mellett "
                    f"a feltöltés (felhő) ikont."
                ),
            )

        target_path.write_bytes(contents)

        # Run synchronous extraction + chunking immediately (small files are fine).
        # We reuse _process_uploaded_file but pass the already-allocated id by
        # re-creating the file in a subdirectory keyed by that id.
        try:
            text, page_count = knowledge_processor.extract_text(target_path, upload.content_type or "")
            chunks = knowledge_processor.chunk_text(doc_id, text, chunking_config)
            document = KnowledgeDocument(
                id=doc_id,
                name=safe_name,
                relative_path=relative_path or safe_name,
                content_type=upload.content_type or "",
                size_bytes=size_bytes,
                page_count=page_count,
                char_count=len(text),
                word_count=len(text.split()) if text else 0,
                chunk_count=len(chunks),
                chunks=chunks,
                status="indexed",
                flow_id=flow_id,
                chunking_config=chunking_config,
                content_hash=content_hash,
                created_at=int(time() * 1000),
                updated_at=int(time() * 1000),
            )
        except Exception as exc:  # noqa: BLE001 — error per-file
            document = KnowledgeDocument(
                id=doc_id,
                name=safe_name,
                relative_path=relative_path or safe_name,
                content_type=upload.content_type or "",
                size_bytes=size_bytes,
                status="error",
                error=f"{exc.__class__.__name__}: {exc}",
                flow_id=flow_id,
                chunking_config=chunking_config,
                content_hash=content_hash,
                created_at=int(time() * 1000),
                updated_at=int(time() * 1000),
            )

        summaries.append(knowledge_store.upsert_document(document))
        _push_to_pinecone(document)
        # Include the just-uploaded doc in the conflict-set so subsequent
        # files in the same batch can still detect duplicates against it.
        existing_docs.append(KnowledgeDocumentSummary.model_validate(document.model_dump(exclude={"chunks"})))

    return UploadResponse(documents=summaries, flow_id=flow_id, chunking_config=chunking_config)


@app.get("/api/knowledge/documents", response_model=list[KnowledgeDocumentSummary])
def list_knowledge_documents() -> list[KnowledgeDocumentSummary]:
    return knowledge_store.list_documents()


@app.get("/api/knowledge/documents/{document_id}", response_model=KnowledgeDocument)
def get_knowledge_document(document_id: str) -> KnowledgeDocument:
    document = knowledge_store.get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")
    return document


@app.post("/api/knowledge/documents/{document_id}/fact-check", response_model=FactCheckResult)
def fact_check_document(document_id: str) -> FactCheckResult:
    """Run an LLM-based fact-check on the indexed chunks of a document.

    The LLM is asked to identify claims that may be outdated or incorrect
    given today's date, and to suggest corrections.  Results are returned
    immediately (synchronous) and are not persisted.
    """
    from time import time as _time

    document = knowledge_store.get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")

    if not document.chunks:
        raise HTTPException(
            status_code=422,
            detail="Document has no indexed chunks. Re-index the document first.",
        )

    # Build a condensed text from chunks (cap at ~12 000 chars to stay inside
    # typical context limits for cheaper/faster models).
    MAX_CHARS = 12_000
    combined = "\n\n".join(
        f"[Chunk {c.index + 1}] {c.text}" for c in document.chunks
    )
    if len(combined) > MAX_CHARS:
        combined = combined[:MAX_CHARS] + "\n\n[… truncated for fact-check …]"

    from datetime import date
    today = date.today().isoformat()

    system_prompt = (
        "You are a rigorous fact-checking assistant. "
        "Today's date is {today}. "
        "Your task: review the document text below and identify any claims, "
        "figures, dates, regulations, or statements that are likely outdated, "
        "inaccurate, or contradict current best-practice as of today. "
        "For each issue return a JSON object with keys: "
        "  \"claim\": the verbatim problematic sentence or phrase (max 200 chars), "
        "  \"explanation\": concise explanation of why it is questionable, "
        "  \"suggestion\": concrete recommended replacement or action. "
        "Return your answer as valid JSON in this exact format:\n"
        "{{\n"
        "  \"summary\": \"<one short paragraph overall verdict>\",\n"
        "  \"issues\": [ {{...}}, ... ]\n"
        "}}\n"
        "If no issues are found, return an empty issues array and a positive summary. "
        "Never return anything outside the JSON block."
    ).format(today=today)

    settings: AssistantSettings = store.get_settings()

    provider = rag_engine._resolve_provider(settings)
    model_name = rag_engine._resolve_model_name(provider, settings.llm.model)
    api_key = rag_engine._resolve_api_key(provider, settings)

    checked_at = int(_time() * 1000)

    if not api_key:
        return FactCheckResult(
            document_id=document_id,
            document_name=document.name,
            status="error",
            summary="Fact-check unavailable: no LLM API key configured. Configure an API key in Settings.",
            issues=[],
            checked_at=checked_at,
        )

    try:
        raw_json = _call_llm_for_fact_check(
            provider=provider,
            model_name=model_name,
            api_key=api_key,
            base_url=settings.llm.base_url,
            system_prompt=system_prompt,
            document_text=combined,
        )
        import json as _json
        # Strip markdown code fences if the model wrapped the response
        cleaned = raw_json.strip()
        if cleaned.startswith("```"):
            cleaned = "\n".join(cleaned.split("\n")[1:])
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
        payload = _json.loads(cleaned)
        issues = [FactCheckIssue(**item) for item in payload.get("issues", [])]
        summary = payload.get("summary", "Fact-check complete.")
        status = "issues_found" if issues else "ok"
    except Exception as exc:  # noqa: BLE001
        logger.warning("Fact-check LLM call failed for %s: %s", document_id, exc)
        return FactCheckResult(
            document_id=document_id,
            document_name=document.name,
            status="error",
            summary=f"Fact-check failed: {exc}",
            issues=[],
            checked_at=checked_at,
        )

    return FactCheckResult(
        document_id=document_id,
        document_name=document.name,
        status=status,
        summary=summary,
        issues=issues,
        checked_at=checked_at,
    )


def _call_llm_for_fact_check(
    *,
    provider: str,
    model_name: str,
    api_key: str,
    base_url: str | None,
    system_prompt: str,
    document_text: str,
) -> str:
    """Call the configured LLM and return the raw text response."""
    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        from langchain_core.messages import HumanMessage, SystemMessage

        llm = ChatGoogleGenerativeAI(
            model=model_name,
            temperature=0.1,
            google_api_key=api_key,
        )
        response = llm.invoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Document to fact-check:\n\n{document_text}"),
        ])
        return response.content

    if provider == "openai":
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import HumanMessage, SystemMessage

        llm = ChatOpenAI(
            model=model_name,
            temperature=0.1,
            api_key=api_key,
            base_url=base_url,
        )
        response = llm.invoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Document to fact-check:\n\n{document_text}"),
        ])
        return response.content

    raise ValueError(f"Unsupported provider for fact-check: {provider}")


@app.delete("/api/knowledge/documents/{document_id}")
def delete_knowledge_document(document_id: str) -> dict[str, bool]:
    deleted = knowledge_store.delete_document(document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")
    if pinecone_index.is_available():
        try:
            pinecone_index.delete_document(document_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Pinecone delete failed for %s: %s", document_id, exc)
    return {"deleted": True}


@app.post("/api/knowledge/documents/{document_id}/reindex", response_model=KnowledgeDocumentSummary)
def reindex_knowledge_document(document_id: str, flow_id: str | None = None) -> KnowledgeDocumentSummary:
    """Re-run text extraction + chunking for an existing document.

    If ``flow_id`` is provided, the chunking parameters are taken from that
    canvas flow; otherwise the document's previously stored config is reused.
    """
    document = knowledge_store.get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")

    upload_dir = knowledge_store.upload_dir_for(document_id)
    files = [path for path in upload_dir.iterdir() if path.is_file()]
    if not files:
        raise HTTPException(status_code=410, detail="Original upload no longer available on disk.")
    file_path = files[0]

    if flow_id:
        flow = canvas_store.get_flow(flow_id)
        chunking_config = knowledge_processor.resolve_chunking_config(flow)
    else:
        chunking_config = document.chunking_config or knowledge_processor.resolve_chunking_config(None)

    try:
        text, page_count = knowledge_processor.extract_text(file_path, document.content_type)
        chunks = knowledge_processor.chunk_text(document_id, text, chunking_config)
        updated = document.model_copy(
            update={
                "status": "indexed",
                "error": None,
                "page_count": page_count,
                "char_count": len(text),
                "word_count": len(text.split()) if text else 0,
                "chunk_count": len(chunks),
                "chunks": chunks,
                "flow_id": flow_id or document.flow_id,
                "chunking_config": chunking_config,
                "updated_at": int(time() * 1000),
            }
        )
    except Exception as exc:  # noqa: BLE001 — surface as error
        updated = document.model_copy(
            update={
                "status": "error",
                "error": f"{exc.__class__.__name__}: {exc}",
                "flow_id": flow_id or document.flow_id,
                "chunking_config": chunking_config,
                "updated_at": int(time() * 1000),
            }
        )
    summary = knowledge_store.upsert_document(updated)
    # Re-push freshly chunked content to Pinecone (delete old vectors first).
    if pinecone_index.is_available():
        try:
            pinecone_index.delete_document(document_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Pinecone delete-before-reindex failed for %s: %s", document_id, exc)
    _push_to_pinecone(updated)
    return summary


@app.post("/api/knowledge/documents/{document_id}/replace", response_model=KnowledgeDocumentSummary)
async def replace_knowledge_document(
    document_id: str,
    file: UploadFile = File(...),
    flow_id: str | None = Form(default=None),
) -> KnowledgeDocumentSummary:
    """Replace the file contents of an existing document and re-chunk."""
    document = knowledge_store.get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")

    safe_name = Path(file.filename or document.name).name or document.name
    contents = await file.read()
    size_bytes = len(contents)
    content_hash = hashlib.sha256(contents).hexdigest()

    # Block replacing with a file that duplicates a *different* existing doc.
    conflict = _find_duplicate(
        knowledge_store.list_documents(),
        safe_name,
        size_bytes,
        content_hash,
        exclude_id=document_id,
    )
    if conflict is not None:
        reason = (
            "azonos tartalom (byte-szintű egyezés)"
            if conflict.content_hash and conflict.content_hash == content_hash
            else "azonos név és közel azonos méret"
        )
        raise HTTPException(
            status_code=409,
            detail=(
                f"Duplicate document: '{safe_name}' ütközik a már feltöltött "
                f"'{conflict.name}' dokumentummal ({reason})."
            ),
        )

    # Wipe previous file(s) so only the new upload remains.
    for existing in list(upload_dir.iterdir()):
        try:
            if existing.is_file():
                existing.unlink()
        except OSError as exc:  # noqa: PERF203
            logger.warning("Could not remove old file %s: %s", existing, exc)

    target_path = upload_dir / safe_name
    target_path.write_bytes(contents)

    if flow_id:
        flow = canvas_store.get_flow(flow_id)
        chunking_config = knowledge_processor.resolve_chunking_config(flow)
    else:
        chunking_config = document.chunking_config or knowledge_processor.resolve_chunking_config(None)

    content_type = file.content_type or document.content_type or ""
    try:
        text, page_count = knowledge_processor.extract_text(target_path, content_type)
        chunks = knowledge_processor.chunk_text(document_id, text, chunking_config)
        updated = document.model_copy(
            update={
                "name": safe_name,
                "content_type": content_type,
                "size_bytes": size_bytes,
                "status": "indexed",
                "error": None,
                "page_count": page_count,
                "char_count": len(text),
                "word_count": len(text.split()) if text else 0,
                "chunk_count": len(chunks),
                "chunks": chunks,
                "flow_id": flow_id or document.flow_id,
                "chunking_config": chunking_config,
                "content_hash": content_hash,
                "updated_at": int(time() * 1000),
            }
        )
    except Exception as exc:  # noqa: BLE001
        updated = document.model_copy(
            update={
                "name": safe_name,
                "content_type": content_type,
                "size_bytes": size_bytes,
                "status": "error",
                "error": f"{exc.__class__.__name__}: {exc}",
                "flow_id": flow_id or document.flow_id,
                "chunking_config": chunking_config,
                "content_hash": content_hash,
                "updated_at": int(time() * 1000),
            }
        )

    summary = knowledge_store.upsert_document(updated)
    if pinecone_index.is_available():
        try:
            pinecone_index.delete_document(document_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Pinecone delete-before-replace failed for %s: %s", document_id, exc)
    _push_to_pinecone(updated)
    return summary


@app.get("/api/knowledge/pinecone/stats")
def pinecone_stats() -> dict:
    """Inspect the Pinecone integrated index (availability + vector counts)."""
    return pinecone_index.stats()


@app.post("/api/knowledge/pinecone/reindex")
def pinecone_reindex_all() -> dict:
    """Backfill: push every locally-stored document into Pinecone.

    Use this after enabling Pinecone for the first time, or after recreating
    the index. Existing vectors for each doc are deleted before re-upsert so
    chunks stay in sync with the on-disk store.
    """
    if not pinecone_index.is_available():
        raise HTTPException(
            status_code=503,
            detail="Pinecone is not configured. Set PINECONE_API_KEY in backend/.env.",
        )
    pushed: list[dict] = []
    failed: list[dict] = []
    for summary in knowledge_store.list_documents():
        document = knowledge_store.get_document(summary.id)
        if document is None or document.status != "indexed" or not document.chunks:
            continue
        try:
            pinecone_index.delete_document(document.id)
        except Exception:  # noqa: BLE001
            pass
        try:
            count = pinecone_index.upsert_chunks(
                document.id,
                [c.model_dump() if hasattr(c, "model_dump") else c for c in document.chunks],
                doc_meta={
                    "name": document.name,
                    "title": document.name,
                    "category": document.category,
                    "subcategory": document.subcategory,
                    "relative_path": document.relative_path,
                },
            )
            pushed.append({"id": document.id, "name": document.name, "chunks": count})
        except Exception as exc:  # noqa: BLE001
            failed.append({"id": document.id, "name": document.name, "error": str(exc)})
    return {
        "pushed": pushed,
        "failed": failed,
        "totals": {"pushed_docs": len(pushed), "failed_docs": len(failed)},
    }


@app.post("/api/knowledge/classify", response_model=ClassificationResult)
def classify_knowledge_documents(request: ClassificationRequest | None = None) -> ClassificationResult:
    """Run an LLM classifier over all uploaded documents to build a 2-level taxonomy.

    Each document gets persisted with `category` (and optional `subcategory`)
    fields so the frontend can group them in the listing afterwards.
    """
    payload = request or ClassificationRequest()
    return classify_documents(
        knowledge_store,
        model=payload.model,
        language=payload.language,
    )


@app.post("/api/knowledge/compare-summary", response_model=CompareDocumentsSummaryResult)
def compare_documents_summary(payload: CompareDocumentsRequest) -> CompareDocumentsSummaryResult:
    """Generate an AI-written paragraph that compares two indexed documents.

    Both documents are fetched from the knowledge store; up to ~6 000 characters
    of chunk text per document are sent to the configured LLM so the summary
    is grounded in actual content rather than just metadata.
    """
    doc_a = knowledge_store.get_document(payload.doc_id_a)
    doc_b = knowledge_store.get_document(payload.doc_id_b)

    if doc_a is None:
        raise HTTPException(status_code=404, detail=f"Document '{payload.doc_id_a}' not found")
    if doc_b is None:
        raise HTTPException(status_code=404, detail=f"Document '{payload.doc_id_b}' not found")

    if not doc_a.chunks:
        raise HTTPException(status_code=422, detail=f"Document '{doc_a.name}' has no indexed chunks.")
    if not doc_b.chunks:
        raise HTTPException(status_code=422, detail=f"Document '{doc_b.name}' has no indexed chunks.")

    MAX_CHARS_PER_DOC = 6_000

    def _extract_text(doc) -> str:
        combined = "\n\n".join(c.text for c in doc.chunks)
        if len(combined) > MAX_CHARS_PER_DOC:
            return combined[:MAX_CHARS_PER_DOC] + "\n[… truncated …]"
        return combined

    text_a = _extract_text(doc_a)
    text_b = _extract_text(doc_b)

    settings: AssistantSettings = store.get_settings()
    provider = rag_engine._resolve_provider(settings)
    model_name = rag_engine._resolve_model_name(provider, settings.llm.model)
    api_key = rag_engine._resolve_api_key(provider, settings)

    if not api_key:
        return CompareDocumentsSummaryResult(
            status="error",
            summary="AI summary unavailable: no LLM API key configured. Add an API key in Settings.",
        )

    system_prompt = (
        "You are a knowledge-base analyst. "
        "You will be given the text content of two documents labelled DOCUMENT A and DOCUMENT B. "
        "Write a single concise paragraph (3–5 sentences) that: "
        "(1) describes the main topic and purpose of each document, "
        "(2) explains how their content relates or differs, and "
        "(3) gives a practical recommendation on when to use one over the other. "
        "Be specific and refer to actual content — do NOT produce generic filler. "
        "Reply with plain text only, no bullet points, no headers."
    )

    human_message = (
        f"DOCUMENT A — {doc_a.name}:\n{text_a}\n\n"
        f"DOCUMENT B — {doc_b.name}:\n{text_b}"
    )

    try:
        raw = _call_llm_for_fact_check(
            provider=provider,
            model_name=model_name,
            api_key=api_key,
            base_url=settings.llm.base_url,
            system_prompt=system_prompt,
            document_text=human_message,
        )
        return CompareDocumentsSummaryResult(status="ok", summary=raw.strip())
    except Exception as exc:  # noqa: BLE001
        logger.warning("Compare-summary LLM call failed: %s", exc)
        return CompareDocumentsSummaryResult(
            status="error",
            summary=f"AI summary failed: {exc.__class__.__name__}: {str(exc)[:200]}",
        )




# ---------------------------------------------------------------------------
# Single-container SPA hosting (Hugging Face Spaces & similar PaaS)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# URL Sources (AI-searchable web URLs)

# ---------------------------------------------------------------------------
# URL Sources (AI-searchable web URLs)
# ---------------------------------------------------------------------------


class _UrlSourceCreate(BaseModel):
    url: str
    label: str = ""
    enabled: bool = True


class _UrlSourceUpdate(BaseModel):
    enabled: bool


@app.get("/api/knowledge/url-sources", response_model=list[KnowledgeUrlSource])
def list_url_sources() -> list[KnowledgeUrlSource]:
    """Return all registered URL knowledge sources."""
    return knowledge_store.list_url_sources()


@app.post("/api/knowledge/url-sources", response_model=KnowledgeUrlSource, status_code=201)
def create_url_source(payload: _UrlSourceCreate) -> KnowledgeUrlSource:
    """Register a new URL as a knowledge source."""
    import time, uuid
    source = KnowledgeUrlSource(
        id=f"url-{uuid.uuid4().hex[:12]}",
        url=payload.url,
        label=payload.label or payload.url,
        enabled=payload.enabled,
        created_at=int(time.time()),
    )
    return knowledge_store.add_url_source(source)


@app.patch("/api/knowledge/url-sources/{source_id}", response_model=KnowledgeUrlSource)
def update_url_source(source_id: str, payload: _UrlSourceUpdate) -> KnowledgeUrlSource:
    """Enable or disable a URL source."""
    updated = knowledge_store.update_url_source(source_id, payload.enabled)
    if updated is None:
        raise HTTPException(status_code=404, detail="URL source not found")
    return updated


@app.delete("/api/knowledge/url-sources/{source_id}", status_code=204)
def delete_url_source(source_id: str) -> None:
    """Remove a URL source."""
    if not knowledge_store.delete_url_source(source_id):
        raise HTTPException(status_code=404, detail="URL source not found")


# ---------------------------------------------------------------------------
# (end URL sources)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Single-container SPA hosting (Hugging Face Spaces & similar PaaS)
# ---------------------------------------------------------------------------

# When XRAG_FRONTEND_DIST points at a built Vite `dist/` directory, mount the
# SPA on `/` so a single port serves both the API (`/api/...`) and the UI.
# Registered LAST so all explicit FastAPI routes take precedence.
_FRONTEND_DIST = os.environ.get("XRAG_FRONTEND_DIST")
if _FRONTEND_DIST:
    _dist_path = Path(_FRONTEND_DIST)
    _index_html = _dist_path / "index.html"
    if _index_html.is_file():
        from fastapi.responses import FileResponse

        @app.get("/{spa_path:path}", include_in_schema=False)
        async def _spa_fallback(spa_path: str):
            # Real file in dist? Serve it. Otherwise hand back index.html so
            # the React Router resolves the route client-side (deep links
            # survive page reloads).
            candidate = (_dist_path / spa_path) if spa_path else _index_html
            try:
                candidate_resolved = candidate.resolve()
                dist_resolved = _dist_path.resolve()
                # Defence in depth against path traversal (`../etc/passwd`).
                if dist_resolved in candidate_resolved.parents or candidate_resolved == dist_resolved:
                    if candidate_resolved.is_file():
                        return FileResponse(candidate_resolved)
            except (OSError, RuntimeError):
                pass
            return FileResponse(_index_html)
    else:
        logger.warning("XRAG_FRONTEND_DIST set to %s but index.html not found; SPA serving disabled.", _FRONTEND_DIST)

