from typing import Any

from pydantic import BaseModel, Field


class RetrievalSettings(BaseModel):
    hybrid_alpha: float = Field(default=0.5, ge=0.0, le=1.0)
    top_k: int = Field(default=5, ge=1, le=50)
    reranker_enabled: bool = True
    reranker_model: str = "cohere-rerank-v3"
    langchain_enabled: bool = True
    chunk_size: int = Field(default=700, ge=100, le=4000)
    chunk_overlap: int = Field(default=120, ge=0, le=1000)


class LLMSettings(BaseModel):
    model: str = "GPT-4o"
    temperature: float = Field(default=0.7, ge=0.0, le=1.0)
    system_prompt: str = (
        "You are a professional research assistant. Always cite your sources and clearly separate verified context from assumptions."
    )
    strict_mode: bool = True
    provider: str = "openai"
    api_key_env: str = "OPENAI_API_KEY"
    base_url: str | None = None


class VectorStoreSettings(BaseModel):
    id: str = "pinecone"
    name: str = "Pinecone"
    type: str = "managed"


class AssistantSettings(BaseModel):
    vector_store: VectorStoreSettings = Field(default_factory=VectorStoreSettings)
    retrieval: RetrievalSettings = Field(default_factory=RetrievalSettings)
    llm: LLMSettings = Field(default_factory=LLMSettings)


class ChatRequest(BaseModel):
    message: str
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    prompt_reference: str | None = None


class SourceSnippet(BaseModel):
    label: str
    page: int
    chunkId: str
    tokenCount: int
    snippet: str


class ChatResponse(BaseModel):
    content: str
    reasoning: str
    traceSteps: list[dict[str, str]]
    sources: list[SourceSnippet]


class SavedAnswer(BaseModel):
    id: str
    content: str
    reasoning: str = ""
    sources: list[dict[str, Any]] = Field(default_factory=list)
    promptReference: str | None = None
    createdAt: int


class SaveAnswerRequest(BaseModel):
    content: str
    reasoning: str = ""
    sources: list[dict[str, Any]] = Field(default_factory=list)
    promptReference: str | None = None


class SaveAnswerResponse(BaseModel):
    saved: bool
    answer: SavedAnswer


# ---------------------------------------------------------------------------
# Fact-check models
# ---------------------------------------------------------------------------

class FactCheckIssue(BaseModel):
    claim: str          # the exact sentence / claim from the document
    explanation: str    # why it may be outdated or incorrect
    suggestion: str     # recommended update / corrected text


class FactCheckResult(BaseModel):
    document_id: str
    document_name: str
    status: str          # "ok" | "issues_found" | "error"
    summary: str         # one-paragraph executive summary
    issues: list[FactCheckIssue] = Field(default_factory=list)
    checked_at: int = 0  # epoch ms


# ---------------------------------------------------------------------------
# Document comparison summary models
# ---------------------------------------------------------------------------

class CompareDocumentsRequest(BaseModel):
    doc_id_a: str
    doc_id_b: str


class CompareDocumentsSummaryResult(BaseModel):
    status: str    # "ok" | "error"
    summary: str   # AI-generated comparison paragraph
