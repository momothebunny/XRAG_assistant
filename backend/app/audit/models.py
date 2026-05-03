"""Pydantic models for the Audit / Flow Arena feature."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


MAX_QUESTIONS_PER_SESSION = 15


class AuditFlowEntry(BaseModel):
    """One flow enrolled in an audit session."""

    flow_id: str
    flow_name: str
    # Randomised per-session label shown to the user: "Flow A", "Flow B", …
    blind_label: str


class BlindResponse(BaseModel):
    """A single answer from one flow, shown blindly to the user."""

    blind_label: str          # "Flow A", "Flow B", …
    answer: str
    duration_ms: int
    error: str | None = None


class AuditQuestion(BaseModel):
    """One question round within a session."""

    question_index: int        # 0-based
    question: str
    responses: list[BlindResponse] = Field(default_factory=list)
    # blind_label of the winner chosen by the user (None = not yet voted)
    winner_label: str | None = None
    # Derived after voting: actual flow_id of the winner
    winner_flow_id: str | None = None


class AuditSession(BaseModel):
    """Full audit session document stored on disk."""

    id: str
    name: str = "Audit Session"
    flows: list[AuditFlowEntry] = Field(default_factory=list)
    questions: list[AuditQuestion] = Field(default_factory=list)
    status: Literal["setup", "running", "finished"] = "running"
    created_at: int
    finished_at: int | None = None
    # Tally: flow_id -> win count
    tally: dict[str, int] = Field(default_factory=dict)
    winner_flow_id: str | None = None
    winner_flow_name: str | None = None


class AuditSessionSummary(BaseModel):
    id: str
    name: str
    flow_count: int
    question_count: int
    voted_count: int
    status: str
    created_at: int
    winner_flow_name: str | None = None


class AuditReport(BaseModel):
    """Detailed report returned after a session is finished."""

    session_id: str
    session_name: str
    status: str
    total_questions: int
    voted_questions: int
    flows: list[AuditFlowEntry]
    tally: dict[str, int]           # flow_id -> wins
    tally_by_name: dict[str, int]   # flow_name -> wins
    winner_flow_id: str | None
    winner_flow_name: str | None
    questions: list[AuditQuestion]
    created_at: int
    finished_at: int | None


# ── Request / Response payloads ──────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    name: str = "Audit Session"
    flow_ids: list[str] = Field(min_length=2)


class AskQuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class AskQuestionResponse(BaseModel):
    question_index: int
    responses: list[BlindResponse]
    remaining: int          # how many questions can still be asked


class VoteRequest(BaseModel):
    question_index: int
    winner_label: str       # "Flow A" / "Flow B" / …


class VoteResponse(BaseModel):
    question_index: int
    winner_flow_id: str
    winner_flow_name: str
    tally: dict[str, int]   # flow_id -> wins so far


# ── Benchmark / Evaluation dataset ───────────────────────────────────────

MAX_BENCHMARK_ENTRIES = 50


class BenchmarkEntry(BaseModel):
    """One question + expected (gold) answer pair."""

    question: str
    expected_answer: str


class BenchmarkDataset(BaseModel):
    id: str
    name: str
    description: str = ""
    entries: list[BenchmarkEntry]
    created_at: int


class BenchmarkDatasetSummary(BaseModel):
    id: str
    name: str
    description: str = ""
    entry_count: int
    created_at: int


class CreateBenchmarkDatasetRequest(BaseModel):
    name: str
    description: str = ""
    entries: list[BenchmarkEntry] = Field(min_length=1)


class BenchmarkQuestionResult(BaseModel):
    """Per-flow metrics for one question."""

    question_index: int
    question: str
    expected_answer: str
    flow_id: str
    flow_name: str
    answer: str
    duration_ms: int
    exact_match: float      # 0.0 or 1.0
    char_similarity: float  # SequenceMatcher ratio 0–1
    token_f1: float         # SQuAD-style token overlap F1 0–1

    # ── Architecture-agnostic RAG validation metrics (RAGAS + RAGChecker)
    # All values are in [0.0, 1.0]; higher is better except hallucination_rate.
    # Default to 0.0 so legacy runs (without validator) deserialise cleanly.
    faithfulness: float = 0.0          # RAGAS
    answer_relevancy: float = 0.0      # RAGAS
    context_precision: float = 0.0     # RAGAS
    context_recall: float = 0.0        # RAGAS
    answer_similarity: float = 0.0     # RAGAS
    answer_correctness: float = 0.0    # RAGAS
    claim_recall: float = 0.0          # RAGChecker
    claim_precision: float = 0.0       # RAGChecker
    hallucination_rate: float = 0.0    # RAGChecker (lower is better)
    context_utilization: float = 0.0   # RAGChecker
    overall_score: float = 0.0         # composite (mean of positive metrics)
    judge_mode: str = "lexical"        # "llm" | "lexical"
    retrieved_context_count: int = 0   # # chunks captured from the flow

    error: str | None = None


class BenchmarkRun(BaseModel):
    id: str
    name: str
    dataset_id: str
    dataset_name: str
    flow_ids: list[str]
    flow_names: dict[str, str]          # flow_id → flow_name
    status: str                         # "running" | "finished" | "error"
    results: list[BenchmarkQuestionResult] = Field(default_factory=list)
    error_message: str | None = None
    created_at: int
    finished_at: int | None = None


class BenchmarkRunSummary(BaseModel):
    id: str
    name: str
    dataset_name: str
    flow_count: int
    question_count: int
    status: str
    created_at: int


class FlowBenchmarkSummary(BaseModel):
    flow_id: str
    flow_name: str
    avg_exact_match: float
    avg_char_similarity: float
    avg_token_f1: float

    # ── Aggregated RAG validation scores (averages across questions).
    avg_faithfulness: float = 0.0
    avg_answer_relevancy: float = 0.0
    avg_context_precision: float = 0.0
    avg_context_recall: float = 0.0
    avg_answer_similarity: float = 0.0
    avg_answer_correctness: float = 0.0
    avg_claim_recall: float = 0.0
    avg_claim_precision: float = 0.0
    avg_hallucination_rate: float = 0.0  # lower is better
    avg_context_utilization: float = 0.0
    avg_overall_score: float = 0.0
    judge_mode: str = "lexical"


class BenchmarkReport(BaseModel):
    run_id: str
    run_name: str
    dataset_name: str
    question_count: int
    flow_summaries: list[FlowBenchmarkSummary]
    results: list[BenchmarkQuestionResult]
    status: str


class StartBenchmarkRunRequest(BaseModel):
    name: str
    flow_ids: list[str] = Field(min_length=2)
    # When True (default), run the full RAGAS+RAGChecker validator
    # against every (flow, question) pair using an LLM judge if
    # OPENROUTER_API_KEY is set, otherwise the deterministic lexical
    # fallback. Set to False to skip RAG validation entirely.
    enable_rag_validation: bool = True
    use_llm_judge: bool = True
