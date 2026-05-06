"""Persistence layer for canvas flows."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from threading import Lock
from time import time
from uuid import uuid4

from .models import CanvasFlow, FlowSummary


def _build_naive_provider_flow(
    *,
    flow_id: str,
    flow_name: str,
    provider_id: str,
    provider_label: str,
    vector_config: dict,
    retriever_provider: str,
) -> CanvasFlow:
    base_embedding = {
        "gateway": "backend_proxy",
        "model_id": "intfloat/multilingual-e5-large",
        "output_dimensions": 1024,
        "max_token_capacity": 512,
        "is_cached": True,
        "batch_size": 100,
        "metadata": {
            "model_id": "intfloat/multilingual-e5-large",
            "max_token_capacity": 512,
            "output_dimensions": 1024,
            "is_cached": True,
            "batch_size": 100,
        },
    }

    retriever_store = {
        "provider": provider_id,
        "indexName": vector_config.get("indexName"),
        "namespace": vector_config.get("namespace"),
        "metric": vector_config.get("metric", "cosine"),
    }

    nodes = [
        {
            "id": f"{provider_id}-node-user",
            "templateKey": "user-actor",
            "label": "User",
            "config": {"role": "user"},
            "position": {"x": -140.0, "y": 260.0},
        },
        {
            "id": f"{provider_id}-node-question",
            "templateKey": "input-question",
            "label": "Question",
            "config": {"language": "auto", "maxLength": 4000},
            "position": {"x": 80.0, "y": 260.0},
        },
        {
            "id": f"{provider_id}-node-upload",
            "templateKey": "input-upload",
            "label": "Document Upload",
            "config": {
                "remove_headers_footers": True,
                "normalize_whitespace": True,
                "ocr_enabled": False,
            },
            "position": {"x": 80.0, "y": 40.0},
        },
        {
            "id": f"{provider_id}-node-cleaning",
            "templateKey": "process-cleaning",
            "label": "Text Cleaning",
            "config": {
                "removeHeaders": True,
                "removeFooters": True,
                "normalizeUnicode": True,
                "collapseWhitespace": True,
                "preserveParagraphBreaks": True,
            },
            "position": {"x": 300.0, "y": 40.0},
        },
        {
            "id": f"{provider_id}-node-chunking",
            "templateKey": "process-chunking",
            "label": "Chunking",
            "config": {
                "strategy": "recursive",
                "chunkSize": 750,
                "overlap": 150,
                "lengthFunction": "characters",
                "stripWhitespace": True,
            },
            "position": {"x": 520.0, "y": 40.0},
        },
        {
            "id": f"{provider_id}-node-embedding",
            "templateKey": "process-embedding",
            "label": "Embedding Model",
            "config": base_embedding,
            "position": {"x": 740.0, "y": 40.0},
        },
        {
            "id": f"{provider_id}-node-vectordb",
            "templateKey": "storage-vector",
            "label": provider_label,
            "config": vector_config,
            "position": {"x": 960.0, "y": 40.0},
        },
        {
            "id": f"{provider_id}-node-retriever",
            "templateKey": "process-retriever",
            "label": "Retriever",
            "config": {
                "strategy": "similarity",
                "topK": 5,
                "similarityThreshold": 0.68,
                "includeMetadata": True,
                "includeScores": True,
                "retrieverProvider": retriever_provider,
                "vectorStore": retriever_store,
                "metadataFilter": "",
            },
            "position": {"x": 960.0, "y": 260.0},
        },
        {
            "id": f"{provider_id}-node-llm",
            "templateKey": "brain-llm",
            "label": "LLM",
            "config": {
                "gateway": "backend_proxy",
                "model_id": "openai/gpt-4o-mini",
                "temperature": 0.1,
                "max_tokens": 800,
                "systemPrompt": "You are a grounded RAG assistant. Answer ONLY using the provided numbered evidence list. Be concise and factual. Cite each supporting fact inline with the actual evidence number like [1] or [2].",
                "citationMode": True,
            },
            "position": {"x": 740.0, "y": 260.0},
        },
        {
            "id": f"{provider_id}-node-response",
            "templateKey": "output-response",
            "label": "Response",
            "config": {"includeCitations": True, "format": "markdown"},
            "position": {"x": 740.0, "y": 480.0},
        },
    ]

    edges = [
        {
            "id": f"{provider_id}-e1",
            "source": f"{provider_id}-node-user",
            "target": f"{provider_id}-node-question",
            "sourceHandle": "source-right",
            "targetHandle": "target-left",
        },
        {
            "id": f"{provider_id}-e2",
            "source": f"{provider_id}-node-upload",
            "target": f"{provider_id}-node-cleaning",
            "sourceHandle": "source-right",
            "targetHandle": "target-left",
        },
        {
            "id": f"{provider_id}-e3",
            "source": f"{provider_id}-node-cleaning",
            "target": f"{provider_id}-node-chunking",
            "sourceHandle": "source-right",
            "targetHandle": "target-left",
        },
        {
            "id": f"{provider_id}-e4",
            "source": f"{provider_id}-node-chunking",
            "target": f"{provider_id}-node-embedding",
            "sourceHandle": "source-right",
            "targetHandle": "target-left",
        },
        {
            "id": f"{provider_id}-e5",
            "source": f"{provider_id}-node-embedding",
            "target": f"{provider_id}-node-vectordb",
            "sourceHandle": "source-right",
            "targetHandle": "target-left",
        },
        {
            "id": f"{provider_id}-e6",
            "source": f"{provider_id}-node-question",
            "target": f"{provider_id}-node-retriever",
            "sourceHandle": "source-right",
            "targetHandle": "target-left",
        },
        {
            "id": f"{provider_id}-e7",
            "source": f"{provider_id}-node-vectordb",
            "target": f"{provider_id}-node-retriever",
            "sourceHandle": "source-bottom",
            "targetHandle": "target-top",
        },
        {
            "id": f"{provider_id}-e8",
            "source": f"{provider_id}-node-retriever",
            "target": f"{provider_id}-node-llm",
            "sourceHandle": "source-left",
            "targetHandle": "target-right",
        },
        {
            "id": f"{provider_id}-e9",
            "source": f"{provider_id}-node-llm",
            "target": f"{provider_id}-node-response",
            "sourceHandle": "source-bottom",
            "targetHandle": "target-top",
        },
    ]

    return CanvasFlow(
        id=flow_id,
        name=flow_name,
        description=f"System preset flow with {provider_label} vector backend.",
        nodes=nodes,
        edges=edges,
    )


def _build_builtin_provider_flows() -> list[CanvasFlow]:
    presets = [
        {
            "flow_id": "flow-naive-rag-pinecone-001",
            "flow_name": "Naive RAG - Pinecone Preset",
            "provider_id": "pinecone",
            "provider_label": "Pinecone",
            "retriever_provider": "pinecone",
            "vector_config": {
                "provider": "pinecone",
                "indexName": "xrag-knowledge",
                "namespace": "knowledge",
                "cloud": "aws",
                "region": "us-east-1",
                "metric": "cosine",
                "dimensions": 1024,
                "apiKeyEnvVar": "PINECONE_API_KEY",
                "hybridSearch": False,
            },
        },
        {
            "flow_id": "flow-naive-rag-qdrant-001",
            "flow_name": "Naive RAG - Qdrant Preset",
            "provider_id": "qdrant",
            "provider_label": "Qdrant",
            "retriever_provider": "qdrant",
            "vector_config": {
                "provider": "qdrant",
                "collection": "xrag_chunks",
                "url": "http://localhost:6333",
                "metric": "cosine",
                "dimensions": 1024,
                "apiKeyEnvVar": "QDRANT_API_KEY",
                "hybridSearch": True,
            },
        },
        {
            "flow_id": "flow-naive-rag-weaviate-001",
            "flow_name": "Naive RAG - Weaviate Preset",
            "provider_id": "weaviate",
            "provider_label": "Weaviate",
            "retriever_provider": "weaviate",
            "vector_config": {
                "provider": "weaviate",
                "collection": "XRAGChunk",
                "url": "http://localhost:8080",
                "metric": "cosine",
                "dimensions": 1024,
                "apiKeyEnvVar": "WEAVIATE_API_KEY",
                "hybridSearch": True,
            },
        },
        {
            "flow_id": "flow-naive-rag-chroma-001",
            "flow_name": "Naive RAG - Chroma Preset",
            "provider_id": "chroma",
            "provider_label": "Chroma",
            "retriever_provider": "chroma",
            "vector_config": {
                "provider": "chroma",
                "collection": "xrag_chunks",
                "persistDirectory": "./data/chroma",
                "url": "http://localhost:8001",
                "metric": "cosine",
                "dimensions": 1024,
                "hybridSearch": False,
            },
        },
        {
            "flow_id": "flow-naive-rag-supabase-001",
            "flow_name": "Naive RAG - Supabase Preset",
            "provider_id": "supabase",
            "provider_label": "Supabase",
            "retriever_provider": "supabase",
            "vector_config": {
                "provider": "supabase",
                "collection": "documents",
                "url": "https://your-project.supabase.co",
                "schemaName": "public",
                "metric": "cosine",
                "dimensions": 1024,
                "apiKeyEnvVar": "SUPABASE_API_KEY",
                "hybridSearch": False,
            },
        },
    ]

    return [
        _build_naive_provider_flow(
            flow_id=preset["flow_id"],
            flow_name=preset["flow_name"],
            provider_id=preset["provider_id"],
            provider_label=preset["provider_label"],
            vector_config=deepcopy(preset["vector_config"]),
            retriever_provider=preset["retriever_provider"],
        )
        for preset in presets
    ]


def _build_safety_guarded_flow() -> CanvasFlow:
    return CanvasFlow(
        id="flow-safety-rag-001",
        name="Safety-First RAG Preset",
        description="Preset flow with PII redaction + guardrails + hallucination guard.",
        nodes=[
            {
                "id": "safety-node-user",
                "templateKey": "user-actor",
                "label": "User",
                "config": {"role": "user"},
                "position": {"x": -140.0, "y": 260.0},
            },
            {
                "id": "safety-node-question",
                "templateKey": "input-question",
                "label": "Question",
                "config": {"language": "auto", "maxLength": 4000},
                "position": {"x": 80.0, "y": 260.0},
            },
            {
                "id": "safety-node-upload",
                "templateKey": "input-upload",
                "label": "Document Upload",
                "config": {
                    "remove_headers_footers": True,
                    "normalize_whitespace": True,
                    "ocr_enabled": False,
                },
                "position": {"x": 80.0, "y": 40.0},
            },
            {
                "id": "safety-node-cleaning",
                "templateKey": "process-cleaning",
                "label": "Text Cleaning",
                "config": {
                    "removeHeaders": True,
                    "removeFooters": True,
                    "normalizeUnicode": True,
                    "collapseWhitespace": True,
                    "preserveParagraphBreaks": True,
                },
                "position": {"x": 300.0, "y": 40.0},
            },
            {
                "id": "safety-node-chunking",
                "templateKey": "process-chunking",
                "label": "Chunking",
                "config": {
                    "strategy": "recursive",
                    "chunkSize": 700,
                    "overlap": 140,
                    "lengthFunction": "characters",
                    "stripWhitespace": True,
                },
                "position": {"x": 520.0, "y": 40.0},
            },
            {
                "id": "safety-node-embedding",
                "templateKey": "process-embedding",
                "label": "Embedding Model",
                "config": {
                    "gateway": "backend_proxy",
                    "model_id": "intfloat/multilingual-e5-large",
                    "output_dimensions": 1024,
                    "max_token_capacity": 512,
                    "is_cached": True,
                    "batch_size": 100,
                    "metadata": {
                        "model_id": "intfloat/multilingual-e5-large",
                        "max_token_capacity": 512,
                        "output_dimensions": 1024,
                        "is_cached": True,
                        "batch_size": 100,
                    },
                },
                "position": {"x": 740.0, "y": 40.0},
            },
            {
                "id": "safety-node-vectordb",
                "templateKey": "storage-vector",
                "label": "Pinecone",
                "config": {
                    "provider": "pinecone",
                    "indexName": "xrag-knowledge",
                    "namespace": "knowledge",
                    "cloud": "aws",
                    "region": "us-east-1",
                    "metric": "cosine",
                    "dimensions": 1024,
                    "apiKeyEnvVar": "PINECONE_API_KEY",
                    "hybridSearch": False,
                },
                "position": {"x": 960.0, "y": 40.0},
            },
            {
                "id": "safety-node-retriever",
                "templateKey": "process-retriever",
                "label": "Retriever",
                "config": {
                    "strategy": "similarity_with_threshold",
                    "topK": 6,
                    "similarityThreshold": 0.74,
                    "includeMetadata": True,
                    "includeScores": True,
                    "retrieverProvider": "pinecone",
                    "vectorStore": {
                        "provider": "pinecone",
                        "indexName": "xrag-knowledge",
                        "namespace": "knowledge",
                        "metric": "cosine",
                    },
                    "metadataFilter": "",
                },
                "position": {"x": 960.0, "y": 260.0},
            },
            {
                "id": "safety-node-pii",
                "templateKey": "process-pii-redaction",
                "label": "PII Redaction",
                "config": {
                    "redactEmails": True,
                    "redactPhones": True,
                    "redactIds": True,
                    "redactNames": False,
                    "redactAddresses": False,
                    "redactCreditCards": True,
                    "redactIbans": True,
                    "mask": "[REDACTED]",
                    "whitelistPattern": "",
                },
                "position": {"x": 1180.0, "y": 260.0},
            },
            {
                "id": "safety-node-guardrails",
                "templateKey": "brain-guardrails",
                "label": "Guardrails",
                "config": {
                    "checkJailbreak": True,
                    "checkPromptInjection": True,
                    "checkToxicity": True,
                    "checkOutputPII": True,
                    "checkOutputToxicity": False,
                    "checkOutputRelevance": True,
                    "violationAction": "flag",
                    "rejectionMessage": "This request cannot be processed due to policy restrictions.",
                },
                "position": {"x": 1400.0, "y": 260.0},
            },
            {
                "id": "safety-node-llm",
                "templateKey": "brain-llm",
                "label": "LLM",
                "config": {
                    "gateway": "backend_proxy",
                    "model_id": "openai/gpt-4o-mini",
                    "temperature": 0.15,
                    "max_tokens": 850,
                    "systemPrompt": "Answer from retrieved context only. If context is insufficient, explicitly say you do not have enough evidence.",
                    "citationMode": True,
                },
                "position": {"x": 1620.0, "y": 260.0},
            },
            {
                "id": "safety-node-hallucination",
                "templateKey": "process-hallucination-guard",
                "label": "Hallucination Guard",
                "config": {
                    "minGroundingScore": 0.8,
                    "fallbackMode": "reject",
                    "rejectionMessage": "I cannot answer this reliably from the available evidence.",
                    "alwaysPassIfNoEvidence": False,
                    "appendScore": True,
                },
                "position": {"x": 1840.0, "y": 260.0},
            },
            {
                "id": "safety-node-response",
                "templateKey": "output-response",
                "label": "Response",
                "config": {"includeCitations": True, "format": "markdown"},
                "position": {"x": 1840.0, "y": 480.0},
            },
        ],
        edges=[
            {
                "id": "safety-e1",
                "source": "safety-node-user",
                "target": "safety-node-question",
                "sourceHandle": "source-right",
                "targetHandle": "target-left",
            },
            {
                "id": "safety-e2",
                "source": "safety-node-upload",
                "target": "safety-node-cleaning",
                "sourceHandle": "source-right",
                "targetHandle": "target-left",
            },
            {
                "id": "safety-e3",
                "source": "safety-node-cleaning",
                "target": "safety-node-chunking",
                "sourceHandle": "source-right",
                "targetHandle": "target-left",
            },
            {
                "id": "safety-e4",
                "source": "safety-node-chunking",
                "target": "safety-node-embedding",
                "sourceHandle": "source-right",
                "targetHandle": "target-left",
            },
            {
                "id": "safety-e5",
                "source": "safety-node-embedding",
                "target": "safety-node-vectordb",
                "sourceHandle": "source-right",
                "targetHandle": "target-left",
            },
            {
                "id": "safety-e6",
                "source": "safety-node-question",
                "target": "safety-node-retriever",
                "sourceHandle": "source-right",
                "targetHandle": "target-left",
            },
            {
                "id": "safety-e7",
                "source": "safety-node-vectordb",
                "target": "safety-node-retriever",
                "sourceHandle": "source-bottom",
                "targetHandle": "target-top",
            },
            {
                "id": "safety-e8",
                "source": "safety-node-retriever",
                "target": "safety-node-pii",
                "sourceHandle": "source-right",
                "targetHandle": "target-left",
            },
            {
                "id": "safety-e9",
                "source": "safety-node-pii",
                "target": "safety-node-guardrails",
                "sourceHandle": "source-right",
                "targetHandle": "target-left",
            },
            {
                "id": "safety-e10",
                "source": "safety-node-guardrails",
                "target": "safety-node-llm",
                "sourceHandle": "source-right",
                "targetHandle": "target-left",
            },
            {
                "id": "safety-e11",
                "source": "safety-node-llm",
                "target": "safety-node-hallucination",
                "sourceHandle": "source-right",
                "targetHandle": "target-left",
            },
            {
                "id": "safety-e12",
                "source": "safety-node-hallucination",
                "target": "safety-node-response",
                "sourceHandle": "source-bottom",
                "targetHandle": "target-top",
            },
        ],
    )


BUILTIN_PROVIDER_FLOWS = [
    *_build_builtin_provider_flows(),
    _build_safety_guarded_flow(),
]


class CanvasFlowStore:
    def __init__(self, data_dir: Path) -> None:
        self._path = data_dir / "canvas_flows.json"
        self._lock = Lock()
        data_dir.mkdir(parents=True, exist_ok=True)
        self._ensure_builtin_provider_flows()

    def _read(self) -> list[dict]:
        if not self._path.exists():
            return []
        return json.loads(self._path.read_text(encoding="utf-8"))

    def _write(self, flows: list[CanvasFlow]) -> None:
        self._path.write_text(
            json.dumps(
                [flow.model_dump(by_alias=True) for flow in flows],
                indent=2,
            ),
            encoding="utf-8",
        )

    def list_flows(self) -> list[FlowSummary]:
        with self._lock:
            data = self._read()
            return [
                FlowSummary(
                    id=item.get("id", ""),
                    name=item.get("name", "Untitled"),
                    description=item.get("description", ""),
                    node_count=len(item.get("nodes", [])),
                    edge_count=len(item.get("edges", [])),
                    updated_at=item.get("updatedAt"),
                )
                for item in data
                if item.get("id")
            ]

    def get_flow(self, flow_id: str) -> CanvasFlow | None:
        with self._lock:
            for raw in self._read():
                if raw.get("id") == flow_id:
                    return CanvasFlow.model_validate(raw)
        return None

    def upsert_flow(self, flow: CanvasFlow) -> CanvasFlow:
        with self._lock:
            data = self._read()
            now = int(time() * 1000)
            if not flow.id:
                flow = flow.model_copy(update={"id": f"flow-{uuid4().hex[:10]}", "created_at": now})
            flow = flow.model_copy(update={"updated_at": now})
            existing = [CanvasFlow.model_validate(item) for item in data]
            replaced = False
            for index, current in enumerate(existing):
                if current.id == flow.id:
                    existing[index] = flow
                    replaced = True
                    break
            if not replaced:
                existing.insert(0, flow)
            self._write(existing[:200])
            return flow

    def delete_flow(self, flow_id: str) -> bool:
        with self._lock:
            data = self._read()
            kept = [CanvasFlow.model_validate(item) for item in data if item.get("id") != flow_id]
            if len(kept) == len(data):
                return False
            self._write(kept)
            return True

    def _ensure_builtin_provider_flows(self) -> None:
        with self._lock:
            existing = [CanvasFlow.model_validate(item) for item in self._read()]
            existing_ids = {flow.id for flow in existing if flow.id}
            appended = False

            for flow in BUILTIN_PROVIDER_FLOWS:
                if flow.id in existing_ids:
                    continue
                existing.append(flow)
                existing_ids.add(flow.id)
                appended = True

            if appended:
                self._write(existing[:200])
