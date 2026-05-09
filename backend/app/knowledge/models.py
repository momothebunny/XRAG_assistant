"""Pydantic models for the knowledge base."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class KnowledgeContradictionRef(BaseModel):
    document_id: str
    document_name: str
    chunk_id: str
    chunk_index: int
    quote: str = ""


class KnowledgeContradictionIssue(BaseModel):
    severity: str = "medium"  # low | medium | high
    explanation: str
    recommendation: str = ""
    left: KnowledgeContradictionRef
    right: KnowledgeContradictionRef


class KnowledgeChangeAnalysis(BaseModel):
    status: str = "not_checked"  # not_checked | ok | contradictions | error
    summary: str = ""
    issues: list[KnowledgeContradictionIssue] = Field(default_factory=list)
    checked_at: int = 0
    model: str = ""
    scanned_chunk_count: int = 0


class KnowledgeChunk(BaseModel):
    id: str
    index: int
    text: str
    char_count: int
    token_estimate: int


class KnowledgeDocument(BaseModel):
    id: str
    name: str
    relative_path: str = ""  # for folder uploads, e.g. "policies/security/handbook.pdf"
    content_type: str = ""
    size_bytes: int = 0
    page_count: int | None = None
    char_count: int = 0
    word_count: int = 0
    chunk_count: int = 0
    token_estimate: int = 0
    status: str = "pending"  # pending | indexed | error
    error: str | None = None
    flow_id: str | None = None
    chunking_config: dict[str, Any] = Field(default_factory=dict)
    category: str | None = None
    subcategory: str | None = None
    content_hash: str = ""
    change_status: str = "not_checked"
    change_issues_count: int = 0
    change_last_checked_at: int = 0
    change_summary: str | None = None
    change_analysis: KnowledgeChangeAnalysis = Field(default_factory=KnowledgeChangeAnalysis)
    created_at: int = 0
    updated_at: int = 0
    chunks: list[KnowledgeChunk] = Field(default_factory=list)


class KnowledgeDocumentSummary(BaseModel):
    """Lightweight version returned by list endpoints (no chunk bodies)."""

    id: str
    name: str
    relative_path: str = ""
    content_type: str = ""
    size_bytes: int = 0
    page_count: int | None = None
    char_count: int = 0
    word_count: int = 0
    chunk_count: int = 0
    token_estimate: int = 0
    status: str = "pending"
    error: str | None = None
    flow_id: str | None = None
    chunking_config: dict[str, Any] = Field(default_factory=dict)
    category: str | None = None
    subcategory: str | None = None
    content_hash: str = ""
    change_status: str = "not_checked"
    change_issues_count: int = 0
    change_last_checked_at: int = 0
    change_summary: str | None = None
    created_at: int = 0
    updated_at: int = 0


class UploadResponse(BaseModel):
    documents: list[KnowledgeDocumentSummary]
    flow_id: str | None = None
    chunking_config: dict[str, Any] = Field(default_factory=dict)


class UrlSource(BaseModel):
    """A web URL registered as an AI-searchable knowledge source."""

    id: str
    url: str
    label: str = ""
    enabled: bool = True
    created_at: int = 0
