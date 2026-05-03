"""Knowledge base subsystem: document uploads, extraction, chunking, indexing."""

from .models import (
    KnowledgeDocument,
    KnowledgeDocumentSummary,
    KnowledgeChunk,
    UploadResponse,
)
from .store import KnowledgeStore
from .processor import KnowledgeProcessor
from .classifier import (
    ClassificationRequest,
    ClassificationResult,
    classify_documents,
)

__all__ = [
    "KnowledgeDocument",
    "KnowledgeDocumentSummary",
    "KnowledgeChunk",
    "UploadResponse",
    "KnowledgeStore",
    "KnowledgeProcessor",
    "ClassificationRequest",
    "ClassificationResult",
    "classify_documents",
]
