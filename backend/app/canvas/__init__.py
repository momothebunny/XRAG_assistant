"""Canvas (Langflow-style) RAG pipeline runtime.

This package mirrors the visual canvas exposed in the frontend. Each node from
the canvas palette has a backing executor implemented as a small LangChain
``Runnable``-style callable, and a topological runner stitches them together
into a directed acyclic flow that resembles a minimal Langflow graph.
"""

from .models import (
    CanvasEdge,
    CanvasFlow,
    CanvasNode,
    FlowExecutionRequest,
    FlowExecutionResponse,
    FlowSummary,
    NodeDescriptor,
    NodeRunRecord,
)
from .nodes import NODE_REGISTRY, list_node_descriptors
from .runner import CanvasFlowRunner

__all__ = [
    "CanvasEdge",
    "CanvasFlow",
    "CanvasFlowRunner",
    "CanvasNode",
    "FlowExecutionRequest",
    "FlowExecutionResponse",
    "FlowSummary",
    "NODE_REGISTRY",
    "NodeDescriptor",
    "NodeRunRecord",
    "list_node_descriptors",
]
