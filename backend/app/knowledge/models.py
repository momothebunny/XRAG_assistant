"""Pydantic models for the knowledge base."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


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
