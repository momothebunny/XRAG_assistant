"""Pydantic models describing the canvas graph and execution payloads."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class CanvasNode(BaseModel):
    """A single node from the canvas. Mirrors the React Flow node shape."""

    id: str
    template_key: str = Field(alias="templateKey")
    label: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)
    position: dict[str, float] | None = None

    model_config = {"populate_by_name": True}


class CanvasEdge(BaseModel):
    """A directed edge between two canvas nodes."""

    id: str | None = None
    source: str
    target: str
    source_handle: str | None = Field(default=None, alias="sourceHandle")
    target_handle: str | None = Field(default=None, alias="targetHandle")

    model_config = {"populate_by_name": True}


class CanvasFlow(BaseModel):
    """A persisted canvas blueprint."""

    id: str | None = None
    name: str = "Untitled Flow"
    description: str = ""
    nodes: list[CanvasNode] = Field(default_factory=list)
    edges: list[CanvasEdge] = Field(default_factory=list)
    created_at: int | None = Field(default=None, alias="createdAt")
    updated_at: int | None = Field(default=None, alias="updatedAt")

    model_config = {"populate_by_name": True}


class NodeDescriptor(BaseModel):
    """Lightweight description of a registered node executor."""

    template_key: str
    category: str
    label: str
    description: str
    inputs: list[str]
    outputs: list[str]
    default_config: dict[str, Any]


class NodeRunRecord(BaseModel):
    """One row in the per-execution trace."""

    node_id: str
    template_key: str
    label: str
    duration_ms: int
    status: str = "ok"
    output_preview: str = ""
    error: str | None = None


class FlowExecutionRequest(BaseModel):
    """Body for ``POST /api/canvas/run``.

    Either ``flow_id`` (existing persisted flow) or ``flow`` (ad-hoc) must be
    provided.
    """

    flow_id: str | None = Field(default=None, alias="flowId")
    flow: CanvasFlow | None = None
    inputs: dict[str, Any] = Field(default_factory=dict)
    question: str | None = None

    model_config = {"populate_by_name": True}


class FlowExecutionResponse(BaseModel):
    answer: str
    reasoning: str
    final_outputs: dict[str, Any]
    trace: list[NodeRunRecord]
    duration_ms: int


class FlowSummary(BaseModel):
    id: str
    name: str
    description: str = ""
    node_count: int
    edge_count: int
    updated_at: int | None = None
