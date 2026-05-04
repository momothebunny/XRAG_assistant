"""Pydantic models for custom canvas nodes."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


# Whitelisted Tailwind color tokens — must match the PALETTES keys in
# `frontend/src/components/tabs/canvas/nodeTypes.jsx`.
ALLOWED_COLORS = (
    "amber", "sky", "cyan", "emerald", "violet",
    "fuchsia", "rose", "indigo", "slate",
)

# Whitelisted lucide-react icon names for custom nodes. The frontend looks
# these up in a curated map; an unknown name falls back to `Wand2`.
ALLOWED_ICONS = (
    "Wand2", "Sparkles", "Bot", "Brain", "Code2", "Zap", "Layers",
    "GitBranch", "Filter", "Search", "Database", "Network", "Globe",
    "Shield", "Repeat", "ScissorsLineDashed", "ScrollText", "FileInput",
    "FileUp", "MessageSquare", "Mic", "Volume2", "Eye", "User", "Image",
)


class CustomNode(BaseModel):
    """A user-defined canvas node persisted to disk."""

    id: str
    name: str = Field(..., min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)
    category: str = Field(default="Custom", max_length=40)
    color: str = "indigo"
    icon: str = "Wand2"
    code: str = ""  # body of `def run(inputs, config, context): ...`
    inputs: list[str] = Field(default_factory=lambda: ["text"])
    outputs: list[str] = Field(default_factory=lambda: ["text"])
    # `accepts_from`: list of templateKeys that this node permits as upstream
    # connections. Empty = accept any. Used by the canvas for visual hints.
    accepts_from: list[str] = Field(default_factory=list)
    # `connects_to`: list of templateKeys that this node may target downstream.
    accepts_to: list[str] = Field(default_factory=list)
    config_schema: dict[str, Any] = Field(default_factory=dict)
    default_config: dict[str, Any] = Field(default_factory=dict)
    embedding: list[float] | None = None  # cached embedding for similarity
    created_at: int | None = None
    updated_at: int | None = None

    model_config = {"populate_by_name": True}

    @field_validator("color")
    @classmethod
    def _color_must_be_allowed(cls, v: str) -> str:
        if v not in ALLOWED_COLORS:
            return "indigo"
        return v

    @field_validator("icon")
    @classmethod
    def _icon_must_be_allowed(cls, v: str) -> str:
        if v not in ALLOWED_ICONS:
            return "Wand2"
        return v


class CustomNodeCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    description: str = ""
    category: str = "Custom"
    color: str = "indigo"
    icon: str = "Wand2"
    code: str = ""
    inputs: list[str] = Field(default_factory=lambda: ["text"])
    outputs: list[str] = Field(default_factory=lambda: ["text"])
    accepts_from: list[str] = Field(default_factory=list)
    accepts_to: list[str] = Field(default_factory=list)
    config_schema: dict[str, Any] = Field(default_factory=dict)
    default_config: dict[str, Any] = Field(default_factory=dict)


class CustomNodeUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    color: str | None = None
    icon: str | None = None
    code: str | None = None
    inputs: list[str] | None = None
    outputs: list[str] | None = None
    accepts_from: list[str] | None = None
    accepts_to: list[str] | None = None
    config_schema: dict[str, Any] | None = None
    default_config: dict[str, Any] | None = None


class CustomNodeRunRequest(BaseModel):
    """Test-execute a custom node in the sandbox."""

    inputs: dict[str, Any] = Field(default_factory=dict)
    config: dict[str, Any] = Field(default_factory=dict)


class CustomNodeRunResult(BaseModel):
    ok: bool
    output: Any = None
    logs: list[str] = Field(default_factory=list)
    error: str | None = None
    duration_ms: int = 0


class AIGenerateRequest(BaseModel):
    description: str = Field(..., min_length=4, max_length=2000)
    model: str = "openai/gpt-4o"
    temperature: float = 0.2
    max_tokens: int = 1500
    similarity_threshold: float = 0.82


class SimilarNodeHit(BaseModel):
    template_key: str
    label: str
    description: str
    category: str
    score: float
    is_custom: bool = False


class AIGenerateResponse(BaseModel):
    suggestion: CustomNodeCreateRequest | None = None
    similar: list[SimilarNodeHit] = Field(default_factory=list)
    used_existing: bool = False
    rationale: str = ""
    raw_model_output: str = ""
