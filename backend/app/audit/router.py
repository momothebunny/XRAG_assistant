"""FastAPI router for the Audit / Flow Arena feature."""

from __future__ import annotations

import difflib
import hashlib
import logging
import random
import re
import string
import urllib.parse
import urllib.request
from collections import Counter
from time import time
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..canvas.models import FlowExecutionRequest
from ..canvas.runner import CanvasFlowRunner, CanvasFlowError
from ..canvas.store import CanvasFlowStore
from .benchmark_store import BenchmarkStore
from .models import (
    MAX_QUESTIONS_PER_SESSION,
    AuditFlowEntry,
    AuditQuestion,
    AuditReport,
    AuditSession,
    AuditSessionSummary,
    AskQuestionRequest,
    AskQuestionResponse,
    BenchmarkDataset,
    BenchmarkDatasetSummary,
    BenchmarkEntry,
    BenchmarkQuestionResult,
    BenchmarkReport,
    BenchmarkRun,
    BenchmarkRunSummary,
    BlindResponse,
    CreateBenchmarkDatasetRequest,
    CreateSessionRequest,
    FlowBenchmarkSummary,
    StartBenchmarkRunRequest,
    VoteRequest,
    VoteResponse,
)
from .store import AuditStore
from .validation import (
    RagValidationScores,
    evaluate as rag_evaluate,
    extract_retrieved_contexts,
)

router = APIRouter(prefix="/api/audit", tags=["audit"])

# These are injected via app.state by main.py ─────────────────────────────
def _get_audit_store(request) -> AuditStore:
    return request.app.state.audit_store

def _get_canvas_store(request) -> CanvasFlowStore:
    return request.app.state.canvas_store

def _get_runner(request) -> CanvasFlowRunner:
    return request.app.state.canvas_runner


# ── Helpers ───────────────────────────────────────────────────────────────

def _make_blind_labels(n: int) -> list[str]:
    """Return ["Flow A", "Flow B", …] up to 26 flows."""
    return [f"Flow {string.ascii_uppercase[i]}" for i in range(n)]


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.get("/sessions", response_model=list[AuditSessionSummary])
def list_sessions(request_obj: Request):
    store: AuditStore = request_obj.app.state.audit_store
    return store.list_sessions()


@router.post("/sessions", response_model=AuditSession)
def create_session(body: CreateSessionRequest, request_obj: Request):
    audit_store: AuditStore = request_obj.app.state.audit_store
    canvas_store: CanvasFlowStore = request_obj.app.state.canvas_store

    if len(body.flow_ids) < 2:
        raise HTTPException(400, "At least 2 flows are required.")
    if len(body.flow_ids) > 8:
        raise HTTPException(400, "Maximum 8 flows per session.")

    # Validate flows exist
    entries: list[AuditFlowEntry] = []
    labels = _make_blind_labels(len(body.flow_ids))
    shuffled_ids = list(body.flow_ids)
    random.shuffle(shuffled_ids)

    for label, flow_id in zip(labels, shuffled_ids):
        flow = canvas_store.get_flow(flow_id)
        if flow is None:
            raise HTTPException(404, f"Flow '{flow_id}' not found.")
        entries.append(AuditFlowEntry(
            flow_id=flow_id,
            flow_name=flow.name,
            blind_label=label,
        ))

    session = AuditSession(
        id=f"audit-{uuid4().hex[:10]}",
        name=body.name,
        flows=entries,
        status="running",
        created_at=int(time() * 1000),
        tally={e.flow_id: 0 for e in entries},
    )
    audit_store.save(session)
    return session


@router.get("/sessions/{session_id}", response_model=AuditSession)
def get_session(session_id: str, request_obj: Request):
    store: AuditStore = request_obj.app.state.audit_store
    session = store.get(session_id)
    if session is None:
        raise HTTPException(404, "Session not found.")
    return session


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: str, request_obj: Request):
    store: AuditStore = request_obj.app.state.audit_store
    if not store.delete(session_id):
        raise HTTPException(404, "Session not found.")


@router.post("/sessions/{session_id}/ask", response_model=AskQuestionResponse)
def ask_question(session_id: str, body: AskQuestionRequest, request_obj: Request):
    audit_store: AuditStore = request_obj.app.state.audit_store
    canvas_store: CanvasFlowStore = request_obj.app.state.canvas_store
    runner: CanvasFlowRunner = request_obj.app.state.canvas_runner

    session = audit_store.get(session_id)
    if session is None:
        raise HTTPException(404, "Session not found.")
    if session.status == "finished":
        raise HTTPException(400, "Session is already finished.")
    if len(session.questions) >= MAX_QUESTIONS_PER_SESSION:
        raise HTTPException(400, f"Maximum {MAX_QUESTIONS_PER_SESSION} questions per session reached.")

    question_index = len(session.questions)
    responses: list[BlindResponse] = []

    # Run each flow – responses are shuffled so order is random each round
    entries_shuffled = list(session.flows)
    random.shuffle(entries_shuffled)

    for entry in entries_shuffled:
        flow = canvas_store.get_flow(entry.flow_id)
        if flow is None:
            responses.append(BlindResponse(
                blind_label=entry.blind_label,
                answer="[Flow not found]",
                duration_ms=0,
                error="flow_not_found",
            ))
            continue
        try:
            exec_req = FlowExecutionRequest(question=body.question, inputs={})
            result = runner.run(exec_req, flow)
            responses.append(BlindResponse(
                blind_label=entry.blind_label,
                answer=result.answer or "(no answer)",
                duration_ms=result.duration_ms,
            ))
        except CanvasFlowError as exc:
            responses.append(BlindResponse(
                blind_label=entry.blind_label,
                answer="[Execution error]",
                duration_ms=0,
                error=str(exc),
            ))
        except Exception as exc:  # noqa: BLE001
            responses.append(BlindResponse(
                blind_label=entry.blind_label,
                answer="[Unexpected error]",
                duration_ms=0,
                error=f"{exc.__class__.__name__}: {exc}",
            ))

    # Sort responses by blind_label so UI can display in consistent A/B/… order
    responses.sort(key=lambda r: r.blind_label)

    question_record = AuditQuestion(
        question_index=question_index,
        question=body.question,
        responses=responses,
    )
    session.questions.append(question_record)
    audit_store.save(session)

    remaining = MAX_QUESTIONS_PER_SESSION - len(session.questions)
    return AskQuestionResponse(
        question_index=question_index,
        responses=responses,
        remaining=remaining,
    )


@router.post("/sessions/{session_id}/vote", response_model=VoteResponse)
def vote(session_id: str, body: VoteRequest, request_obj: Request):
    audit_store: AuditStore = request_obj.app.state.audit_store

    session = audit_store.get(session_id)
    if session is None:
        raise HTTPException(404, "Session not found.")
    if session.status == "finished":
        raise HTTPException(400, "Session is already finished.")

    # Find the question
    if body.question_index < 0 or body.question_index >= len(session.questions):
        raise HTTPException(400, "Invalid question_index.")
    question = session.questions[body.question_index]
    if question.winner_label is not None:
        raise HTTPException(400, "This question has already been voted on.")

    # Resolve label → flow_id
    label_map = {e.blind_label: e for e in session.flows}
    entry = label_map.get(body.winner_label)
    if entry is None:
        raise HTTPException(400, f"Unknown blind label '{body.winner_label}'.")

    question.winner_label = body.winner_label
    question.winner_flow_id = entry.flow_id
    session.tally[entry.flow_id] = session.tally.get(entry.flow_id, 0) + 1

    # Auto-finish when all questions have been voted on AND the limit is hit
    all_voted = all(q.winner_label is not None for q in session.questions)
    limit_reached = len(session.questions) >= MAX_QUESTIONS_PER_SESSION
    if all_voted and limit_reached:
        _finish_session(session)

    audit_store.save(session)

    return VoteResponse(
        question_index=body.question_index,
        winner_flow_id=entry.flow_id,
        winner_flow_name=entry.flow_name,
        tally=dict(session.tally),
    )


@router.post("/sessions/{session_id}/finish", response_model=AuditReport)
def finish_session(session_id: str, request_obj: Request):
    audit_store: AuditStore = request_obj.app.state.audit_store

    session = audit_store.get(session_id)
    if session is None:
        raise HTTPException(404, "Session not found.")

    if session.status != "finished":
        _finish_session(session)
        audit_store.save(session)

    return _build_report(session)


@router.get("/sessions/{session_id}/report", response_model=AuditReport)
def get_report(session_id: str, request_obj: Request):
    audit_store: AuditStore = request_obj.app.state.audit_store
    session = audit_store.get(session_id)
    if session is None:
        raise HTTPException(404, "Session not found.")
    return _build_report(session)


# ── Internal helpers ──────────────────────────────────────────────────────

def _finish_session(session: AuditSession) -> None:
    session.status = "finished"
    session.finished_at = int(time() * 1000)
    if session.tally:
        winner_id = max(session.tally, key=lambda k: session.tally[k])
        session.winner_flow_id = winner_id
        entry = next((e for e in session.flows if e.flow_id == winner_id), None)
        session.winner_flow_name = entry.flow_name if entry else winner_id


def _build_report(session: AuditSession) -> AuditReport:
    flow_name_map = {e.flow_id: e.flow_name for e in session.flows}
    tally_by_name = {
        flow_name_map.get(fid, fid): wins
        for fid, wins in session.tally.items()
    }
    voted = sum(1 for q in session.questions if q.winner_label is not None)
    return AuditReport(
        session_id=session.id,
        session_name=session.name,
        status=session.status,
        total_questions=len(session.questions),
        voted_questions=voted,
        flows=session.flows,
        tally=dict(session.tally),
        tally_by_name=tally_by_name,
        winner_flow_id=session.winner_flow_id,
        winner_flow_name=session.winner_flow_name,
        questions=session.questions,
        created_at=session.created_at,
        finished_at=session.finished_at,
    )


# ══════════════════════════════════════════════════════════════════════════
# Benchmark / evaluation-dataset endpoints
# ══════════════════════════════════════════════════════════════════════════

def _get_benchmark_store(request) -> BenchmarkStore:
    return request.app.state.benchmark_store


def _compute_metrics(answer: str, expected: str) -> tuple[float, float, float]:
    """Return (exact_match, char_similarity, token_f1)."""
    a = answer.strip().lower()
    e = expected.strip().lower()

    exact_match = 1.0 if a == e else 0.0
    char_sim = difflib.SequenceMatcher(None, a, e).ratio()

    a_toks = a.split()
    e_toks = e.split()
    if not a_toks or not e_toks:
        token_f1 = 1.0 if a_toks == e_toks else 0.0
    else:
        common = sum((Counter(a_toks) & Counter(e_toks)).values())
        prec = common / len(a_toks)
        rec = common / len(e_toks)
        token_f1 = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0.0

    return exact_match, round(char_sim, 4), round(token_f1, 4)


def _build_benchmark_report(run_data: dict) -> BenchmarkReport:
    results = [BenchmarkQuestionResult(**r) for r in run_data.get("results", [])]
    flow_ids = run_data.get("flow_ids", [])
    flow_names: dict[str, str] = run_data.get("flow_names", {})

    summaries: list[FlowBenchmarkSummary] = []
    for fid in flow_ids:
        flow_results = [r for r in results if r.flow_id == fid]
        n = len(flow_results)
        if n == 0:
            summaries.append(FlowBenchmarkSummary(
                flow_id=fid, flow_name=flow_names.get(fid, fid),
                avg_exact_match=0.0, avg_char_similarity=0.0, avg_token_f1=0.0,
            ))
            continue

        def _mean(field_name: str) -> float:
            return round(sum(getattr(r, field_name) for r in flow_results) / n, 4)

        # Judge mode: pick the dominant mode across questions (typically all
        # the same — only mixed when the LLM judge intermittently failed).
        modes = Counter(r.judge_mode for r in flow_results)
        dominant_mode = modes.most_common(1)[0][0] if modes else "lexical"

        summaries.append(FlowBenchmarkSummary(
            flow_id=fid,
            flow_name=flow_names.get(fid, fid),
            avg_exact_match=_mean("exact_match"),
            avg_char_similarity=_mean("char_similarity"),
            avg_token_f1=_mean("token_f1"),
            avg_faithfulness=_mean("faithfulness"),
            avg_answer_relevancy=_mean("answer_relevancy"),
            avg_context_precision=_mean("context_precision"),
            avg_context_recall=_mean("context_recall"),
            avg_answer_similarity=_mean("answer_similarity"),
            avg_answer_correctness=_mean("answer_correctness"),
            avg_claim_recall=_mean("claim_recall"),
            avg_claim_precision=_mean("claim_precision"),
            avg_hallucination_rate=_mean("hallucination_rate"),
            avg_context_utilization=_mean("context_utilization"),
            avg_overall_score=_mean("overall_score"),
            judge_mode=dominant_mode,
        ))

    # Sort summaries: best avg_overall_score first when validation ran,
    # otherwise fall back to the legacy avg_token_f1 ranking so old
    # benchmark runs keep displaying in a sensible order.
    has_overall = any(s.avg_overall_score > 0.0 for s in summaries)
    summaries.sort(
        key=lambda s: (s.avg_overall_score if has_overall else s.avg_token_f1),
        reverse=True,
    )

    return BenchmarkReport(
        run_id=run_data["id"],
        run_name=run_data["name"],
        dataset_name=run_data["dataset_name"],
        question_count=len({r.question_index for r in results}),
        flow_summaries=summaries,
        results=results,
        status=run_data["status"],
    )


# ── Dataset endpoints ─────────────────────────────────────────────────────

@router.get("/benchmarks", response_model=list[BenchmarkDatasetSummary])
def list_benchmark_datasets(request_obj: Request):
    store: BenchmarkStore = _get_benchmark_store(request_obj)
    return [
        BenchmarkDatasetSummary(
            id=d["id"],
            name=d["name"],
            description=d.get("description", ""),
            entry_count=len(d.get("entries", [])),
            created_at=d["created_at"],
        )
        for d in store.list_datasets()
    ]


@router.post("/benchmarks", response_model=BenchmarkDataset, status_code=201)
def create_benchmark_dataset(
    body: CreateBenchmarkDatasetRequest, request_obj: Request
):
    store: BenchmarkStore = _get_benchmark_store(request_obj)
    dataset = BenchmarkDataset(
        id=f"bmd-{uuid4().hex[:10]}",
        name=body.name,
        description=body.description,
        entries=body.entries,
        created_at=int(time() * 1000),
    )
    store.save_dataset(dataset)
    return dataset


@router.get("/benchmarks/{dataset_id}", response_model=BenchmarkDataset)
def get_benchmark_dataset(dataset_id: str, request_obj: Request):
    store: BenchmarkStore = _get_benchmark_store(request_obj)
    d = store.get_dataset(dataset_id)
    if d is None:
        raise HTTPException(404, "Dataset not found.")
    return BenchmarkDataset(**d)


@router.delete("/benchmarks/{dataset_id}", status_code=204)
def delete_benchmark_dataset(dataset_id: str, request_obj: Request):
    store: BenchmarkStore = _get_benchmark_store(request_obj)
    if not store.delete_dataset(dataset_id):
        raise HTTPException(404, "Dataset not found.")


# ── Run endpoints ─────────────────────────────────────────────────────────

@router.get("/benchmark-runs", response_model=list[BenchmarkRunSummary])
def list_benchmark_runs(request_obj: Request):
    store: BenchmarkStore = _get_benchmark_store(request_obj)
    return [
        BenchmarkRunSummary(
            id=r["id"],
            name=r["name"],
            dataset_name=r["dataset_name"],
            flow_count=len(r.get("flow_ids", [])),
            question_count=len({
                res["question_index"]
                for res in r.get("results", [])
            }),
            status=r["status"],
            created_at=r["created_at"],
        )
        for r in store.list_runs()
    ]


@router.post("/benchmark-runs", response_model=BenchmarkReport, status_code=201)
def start_benchmark_run(
    body: StartBenchmarkRunRequest, request_obj: Request
):
    """
    Create and immediately execute a benchmark run.
    Runs all questions from the dataset against all selected flows, then
    persists and returns the full BenchmarkReport.
    """
    bm_store: BenchmarkStore = _get_benchmark_store(request_obj)
    canvas_store: CanvasFlowStore = _get_canvas_store(request_obj)
    runner: CanvasFlowRunner = _get_runner(request_obj)

    # Resolve each dataset referenced by the run's name — the request
    # carries the dataset_id as `dataset_id` (we add it to the request body)
    raise HTTPException(400, "Use POST /benchmark-runs with dataset_id.")


@router.post("/benchmarks/{dataset_id}/run", response_model=BenchmarkReport, status_code=201)
def run_benchmark(
    dataset_id: str, body: StartBenchmarkRunRequest, request_obj: Request
):
    """
    Run a benchmark dataset against the selected flows and return the report.
    This is a synchronous endpoint — it blocks until all questions are
    answered by all flows.
    """
    bm_store: BenchmarkStore = _get_benchmark_store(request_obj)
    canvas_store: CanvasFlowStore = _get_canvas_store(request_obj)
    runner: CanvasFlowRunner = _get_runner(request_obj)

    raw_dataset = bm_store.get_dataset(dataset_id)
    if raw_dataset is None:
        raise HTTPException(404, "Dataset not found.")
    dataset = BenchmarkDataset(**raw_dataset)

    if len(body.flow_ids) < 2:
        raise HTTPException(400, "At least 2 flows are required.")

    # Validate flows
    flow_names: dict[str, str] = {}
    flow_objects: dict[str, object] = {}
    for fid in body.flow_ids:
        flow = canvas_store.get_flow(fid)
        if flow is None:
            raise HTTPException(404, f"Flow '{fid}' not found.")
        flow_names[fid] = flow.name
        flow_objects[fid] = flow

    run_id = f"bmr-{uuid4().hex[:10]}"
    results: list[BenchmarkQuestionResult] = []

    for q_idx, entry in enumerate(dataset.entries):
        for fid in body.flow_ids:
            flow = flow_objects[fid]
            t0 = time()
            answer = ""
            error = None
            retrieved_contexts: list[str] = []
            try:
                exec_req = FlowExecutionRequest(question=entry.question, inputs={})
                result = runner.run(exec_req, flow)
                answer = result.answer or ""
                duration_ms = int((time() - t0) * 1000)
                # Pull the retrieved evidence from EVERY node bag — this is
                # what makes the validator architecture-agnostic (works the
                # same for Naive RAG, Self-RAG, GraphRAG, HyDE, Agentic, …).
                retrieved_contexts = extract_retrieved_contexts(result.final_outputs or {})
            except (CanvasFlowError, Exception) as exc:  # noqa: BLE001
                answer = f"[Error: {exc}]"
                duration_ms = int((time() - t0) * 1000)
                error = str(exc)

            exact, char_sim, tok_f1 = _compute_metrics(answer, entry.expected_answer)

            # ── RAGAS + RAGChecker validation (architecture-agnostic).
            if body.enable_rag_validation and not error:
                rag_scores: RagValidationScores = rag_evaluate(
                    question=entry.question,
                    answer=answer,
                    contexts=retrieved_contexts,
                    ground_truth=entry.expected_answer,
                    use_llm_judge=body.use_llm_judge,
                )
            else:
                rag_scores = RagValidationScores()

            results.append(BenchmarkQuestionResult(
                question_index=q_idx,
                question=entry.question,
                expected_answer=entry.expected_answer,
                flow_id=fid,
                flow_name=flow_names[fid],
                answer=answer,
                duration_ms=duration_ms,
                exact_match=exact,
                char_similarity=char_sim,
                token_f1=tok_f1,
                faithfulness=rag_scores.faithfulness,
                answer_relevancy=rag_scores.answer_relevancy,
                context_precision=rag_scores.context_precision,
                context_recall=rag_scores.context_recall,
                answer_similarity=rag_scores.answer_similarity,
                answer_correctness=rag_scores.answer_correctness,
                claim_recall=rag_scores.claim_recall,
                claim_precision=rag_scores.claim_precision,
                hallucination_rate=rag_scores.hallucination_rate,
                context_utilization=rag_scores.context_utilization,
                overall_score=rag_scores.overall_score,
                judge_mode=rag_scores.judge_mode,
                retrieved_context_count=len(retrieved_contexts),
                error=error,
            ))

    run = BenchmarkRun(
        id=run_id,
        name=body.name,
        dataset_id=dataset_id,
        dataset_name=dataset.name,
        flow_ids=body.flow_ids,
        flow_names=flow_names,
        status="finished",
        results=results,
        created_at=int(time() * 1000),
        finished_at=int(time() * 1000),
    )
    bm_store.save_run(run)
    return _build_benchmark_report(run.model_dump())


@router.get("/benchmark-runs/{run_id}", response_model=BenchmarkReport)
def get_benchmark_run(run_id: str, request_obj: Request):
    store: BenchmarkStore = _get_benchmark_store(request_obj)
    raw = store.get_run(run_id)
    if raw is None:
        raise HTTPException(404, "Run not found.")
    return _build_benchmark_report(raw)


@router.delete("/benchmark-runs/{run_id}", status_code=204)
def delete_benchmark_run(run_id: str, request_obj: Request):
    store: BenchmarkStore = _get_benchmark_store(request_obj)
    if not store.delete_run(run_id):
        raise HTTPException(404, "Run not found.")


# ══════════════════════════════════════════════════════════════════════════
# SQuAD v2 import — fetches questions + Wikipedia contexts from the public
# HuggingFace datasets-server REST API and provisions:
#   • a benchmark dataset (Q + gold answer per row)
#   • optional KnowledgeDocuments (one per unique Wikipedia article context)
#     so the canvas flows have something to retrieve from.
# Designed for end-to-end RAG validation against a well-known QA corpus.
# ══════════════════════════════════════════════════════════════════════════

_SQUAD_LOG = logging.getLogger(__name__)
_SQUAD_DATASET = "rajpurkar/squad_v2"
_SQUAD_CONFIG = "squad_v2"
_HF_ROWS_URL = "https://datasets-server.huggingface.co/rows"
_HF_SPLITS_URL = "https://datasets-server.huggingface.co/splits"
# HF datasets-server caps `length` at 100 per request.
_HF_PAGE_SIZE = 100
_HF_USER_AGENT = "XRAG-Assistant/1.0 (+hf-import)"
_HF_PATH_TOKEN_RE = re.compile(r"[^.\[\]]+|\[\d+\]")

# Backwards-compat aliases (kept so older code paths keep working).
_SQUAD_HF_ROWS_URL = _HF_ROWS_URL
_SQUAD_PAGE_SIZE = _HF_PAGE_SIZE


class ImportSquadRequest(BaseModel):
    name: str = "SQuAD v2 — sample"
    description: str = ""
    split: str = Field(default="validation", pattern=r"^(train|validation)$")
    num_questions: int = Field(default=20, ge=1, le=2000)
    skip_unanswerable: bool = True
    upload_documents: bool = True
    # Maximum number of unique Wikipedia article contexts to ingest as
    # KnowledgeDocuments. Most articles cover several questions, so a small
    # number here can already back many Qs.
    max_documents: int = Field(default=10, ge=0, le=500)


class ImportSquadResponse(BaseModel):
    dataset_id: str
    dataset_name: str
    question_count: int
    document_count: int
    skipped_unanswerable: int
    skipped_duplicates: int


def _hf_get_json(url: str) -> dict:
    """GET an HF datasets-server URL and return the parsed JSON body.

    Raises HTTPException(502) on transport / parse failure so the caller
    surfaces a clean 502 to the frontend.
    """
    req = urllib.request.Request(url, headers={
        "User-Agent": _HF_USER_AGENT,
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = resp.read()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            502,
            f"Failed to reach HuggingFace datasets-server: {exc}",
        ) from exc
    import json as _json
    try:
        return _json.loads(payload)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Invalid JSON from datasets-server: {exc}") from exc


def _hf_detect_config(dataset: str, split: str) -> str:
    """Resolve a default `config` for `dataset` that exposes `split`.

    Many datasets have several configs ("plain_text", "v2.0", language
    variants…). When the user does not specify one we ask the splits API
    and pick the first config whose splits include the requested split.
    """
    params = urllib.parse.urlencode({"dataset": dataset})
    data = _hf_get_json(f"{_HF_SPLITS_URL}?{params}")
    splits = data.get("splits") or []
    candidates = [s for s in splits if (s.get("split") == split)]
    if not candidates:
        # No exact split match — fall back to ANY split's config so the
        # caller can decide how to react. We surface the available splits
        # in the error message to help the user.
        available = sorted({
            f"{s.get('config')}/{s.get('split')}" for s in splits if s.get('config')
        })
        raise HTTPException(
            422,
            f"Dataset '{dataset}' has no '{split}' split. "
            f"Available: {', '.join(available[:20]) or '(none)'}.",
        )
    return str(candidates[0].get("config") or "default")


def _fetch_hf_rows(
    dataset: str,
    config: str,
    split: str,
    max_rows: int,
) -> list[dict]:
    """Page through HF datasets-server `/rows` and return raw row dicts.

    The endpoint caps `length` at 100; we paginate with offset.
    """
    rows: list[dict] = []
    offset = 0
    while len(rows) < max_rows:
        length = min(_HF_PAGE_SIZE, max_rows - len(rows))
        params = urllib.parse.urlencode({
            "dataset": dataset,
            "config": config,
            "split": split,
            "offset": offset,
            "length": length,
        })
        data = _hf_get_json(f"{_HF_ROWS_URL}?{params}")
        page_rows = data.get("rows", []) or []
        if not page_rows:
            break
        for entry in page_rows:
            row = entry.get("row") or {}
            if row:
                rows.append(row)
        offset += length
        if len(page_rows) < length:
            break
    return rows


def _fetch_squad_rows(split: str, max_rows: int) -> list[dict]:
    """Backwards-compatible SQuAD wrapper around the generic fetcher."""
    return _fetch_hf_rows(_SQUAD_DATASET, _SQUAD_CONFIG, split, max_rows)


def _resolve_field(obj: Any, path: str) -> Any:
    """Resolve a dotted path with optional ``[N]`` indexing on a row dict.

    Examples:
        _resolve_field(row, "question")           -> row["question"]
        _resolve_field(row, "answers.text[0]")    -> row["answers"]["text"][0]
        _resolve_field(row, "choices[2].label")   -> row["choices"][2]["label"]

    Returns ``None`` if any segment cannot be resolved.
    """
    if not path:
        return None
    cursor: Any = obj
    for token in _HF_PATH_TOKEN_RE.findall(path):
        if cursor is None:
            return None
        if token.startswith("[") and token.endswith("]"):
            try:
                idx = int(token[1:-1])
            except ValueError:
                return None
            if isinstance(cursor, list) and -len(cursor) <= idx < len(cursor):
                cursor = cursor[idx]
            else:
                return None
        else:
            if isinstance(cursor, dict):
                cursor = cursor.get(token)
            else:
                return None
    return cursor


def _coerce_answer(value: Any) -> str:
    """Best-effort string projection of an answer field.

    Handles: plain strings, lists (joins with newline), dicts with a
    ``text`` key, and falls back to ``str(value)`` for anything else.
    Returns the empty string for ``None`` / empty containers.
    """
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        if not value:
            return ""
        # If list of strings — join. If list of dicts with `text` — pick first.
        if isinstance(value[0], str):
            return str(value[0]).strip()
        if isinstance(value[0], dict) and "text" in value[0]:
            return _coerce_answer(value[0].get("text"))
        return str(value[0]).strip()
    if isinstance(value, dict):
        for key in ("text", "answer", "value", "label"):
            if key in value:
                return _coerce_answer(value[key])
        return ""
    return str(value).strip()


def _provision_hf_documents(
    request_obj: Request,
    contexts: list[tuple[str, str]],  # [(title, context_text), …]
    max_documents: int,
    *,
    category: str = "squad-v2",
    name_prefix: str = "squad",
) -> int:
    """Create KnowledgeDocuments for unique (title, context) pairs.

    Returns the number of documents actually created. Existing documents
    (deduped by content_hash) are reused.
    """
    if max_documents <= 0 or not contexts:
        return 0

    knowledge_store = request_obj.app.state.knowledge_store
    knowledge_processor = request_obj.app.state.knowledge_processor
    push_to_pinecone = request_obj.app.state.push_to_pinecone

    # Use the same default chunking config the upload endpoint uses when no
    # flow is selected — passing flow=None.
    chunking_config = knowledge_processor.resolve_chunking_config(None)

    existing_docs = knowledge_store.list_documents()
    existing_hashes = {d.content_hash for d in existing_docs if getattr(d, "content_hash", "")}

    # Local imports to avoid circular at module load
    from ..knowledge.models import KnowledgeDocument

    created = 0
    for title, context_text in contexts:
        if created >= max_documents:
            break
        if not context_text or not context_text.strip():
            continue

        content_hash = hashlib.sha256(context_text.encode("utf-8")).hexdigest()
        if content_hash in existing_hashes:
            continue

        doc_id = f"doc-{uuid4().hex[:12]}"
        target_dir = knowledge_store.upload_dir_for(doc_id)
        safe_name = f"{name_prefix}-{_slugify(title) or doc_id}.txt"
        target_path = target_dir / safe_name
        target_path.write_text(context_text, encoding="utf-8")

        try:
            chunks = knowledge_processor.chunk_text(doc_id, context_text, chunking_config)
            document = KnowledgeDocument(
                id=doc_id,
                name=safe_name,
                relative_path=safe_name,
                content_type="text/plain",
                size_bytes=len(context_text.encode("utf-8")),
                page_count=1,
                char_count=len(context_text),
                word_count=len(context_text.split()),
                chunk_count=len(chunks),
                chunks=chunks,
                status="indexed",
                category=category,
                subcategory=title or None,
                content_hash=content_hash,
                chunking_config=chunking_config,
                created_at=int(time() * 1000),
                updated_at=int(time() * 1000),
            )
        except Exception as exc:  # noqa: BLE001
            _SQUAD_LOG.warning("HF doc chunking failed for %s: %s", title, exc)
            document = KnowledgeDocument(
                id=doc_id,
                name=safe_name,
                relative_path=safe_name,
                content_type="text/plain",
                size_bytes=len(context_text.encode("utf-8")),
                status="error",
                error=f"{exc.__class__.__name__}: {exc}",
                category=category,
                subcategory=title or None,
                content_hash=content_hash,
                chunking_config=chunking_config,
                created_at=int(time() * 1000),
                updated_at=int(time() * 1000),
            )

        knowledge_store.upsert_document(document)
        try:
            push_to_pinecone(document)
        except Exception as exc:  # noqa: BLE001
            _SQUAD_LOG.warning("Pinecone upsert failed for HF doc %s: %s", doc_id, exc)
        existing_hashes.add(content_hash)
        created += 1
    return created


def _provision_squad_documents(
    request_obj: Request,
    contexts: list[tuple[str, str]],
    max_documents: int,
) -> int:
    """Backwards-compatible SQuAD wrapper."""
    return _provision_hf_documents(
        request_obj, contexts, max_documents,
        category="squad-v2", name_prefix="squad",
    )


def _slugify(text: str) -> str:
    keep = string.ascii_letters + string.digits + "-_"
    return "".join(ch if ch in keep else "-" for ch in (text or ""))[:60].strip("-")


@router.post(
    "/benchmarks/import-squad",
    response_model=ImportSquadResponse,
    status_code=201,
)
def import_squad_benchmark(body: ImportSquadRequest, request_obj: Request):
    """Fetch SQuAD v2 rows from HuggingFace and provision a benchmark dataset.

    The questions become BenchmarkEntry rows; their Wikipedia contexts are
    optionally ingested as KnowledgeDocuments so the canvas flows actually
    have something to retrieve.
    """
    bm_store: BenchmarkStore = _get_benchmark_store(request_obj)

    # Over-fetch a bit so we can still hit `num_questions` after skipping
    # unanswerable rows.
    fetch_count = body.num_questions
    if body.skip_unanswerable:
        fetch_count = min(2000, body.num_questions * 3)

    raw_rows = _fetch_squad_rows(body.split, fetch_count)

    seen_questions: set[str] = set()
    entries: list[BenchmarkEntry] = []
    contexts_by_title: dict[str, str] = {}
    skipped_unanswerable = 0
    skipped_duplicates = 0

    for row in raw_rows:
        if len(entries) >= body.num_questions:
            break
        question = (row.get("question") or "").strip()
        if not question:
            continue
        if question in seen_questions:
            skipped_duplicates += 1
            continue
        answers = row.get("answers") or {}
        # SQuAD v2 schema: {"text": [...], "answer_start": [...]}; empty
        # text list = unanswerable.
        answer_texts = answers.get("text") or []
        if not answer_texts:
            if body.skip_unanswerable:
                skipped_unanswerable += 1
                continue
            expected = ""
        else:
            expected = str(answer_texts[0]).strip()

        seen_questions.add(question)
        entries.append(BenchmarkEntry(question=question, expected_answer=expected))

        title = (row.get("title") or "").strip() or "untitled"
        context_text = (row.get("context") or "").strip()
        # Keep the FIRST context per title to maximise variety.
        if title and context_text and title not in contexts_by_title:
            contexts_by_title[title] = context_text

    if not entries:
        raise HTTPException(
            422,
            "No usable rows after filtering. Try increasing num_questions or "
            "disabling skip_unanswerable.",
        )

    # Persist dataset
    dataset = BenchmarkDataset(
        id=f"bmd-{uuid4().hex[:10]}",
        name=body.name,
        description=(
            body.description
            or f"Imported from HuggingFace dataset {_SQUAD_DATASET} ({body.split} split)."
        ),
        entries=entries,
        created_at=int(time() * 1000),
    )
    bm_store.save_dataset(dataset)

    # Optionally ingest documents
    document_count = 0
    if body.upload_documents:
        contexts_list = list(contexts_by_title.items())
        document_count = _provision_squad_documents(
            request_obj, contexts_list, body.max_documents
        )

    return ImportSquadResponse(
        dataset_id=dataset.id,
        dataset_name=dataset.name,
        question_count=len(entries),
        document_count=document_count,
        skipped_unanswerable=skipped_unanswerable,
        skipped_duplicates=skipped_duplicates,
    )


# ══════════════════════════════════════════════════════════════════════════
# Generic HuggingFace QA dataset import — works with ANY public HF dataset
# that exposes question / answer (and optionally context) columns. The
# caller maps source row fields to benchmark fields with dotted JSON paths
# (e.g. "answers.text[0]" for SQuAD-style schemas, or "answer" for flat
# schemas like databricks/databricks-dolly-15k).
# ══════════════════════════════════════════════════════════════════════════


class ImportHFRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    dataset: str = Field(..., min_length=1)
    config: str | None = None  # auto-detected from /splits when omitted
    split: str = "validation"
    num_questions: int = Field(default=20, ge=1, le=2000)
    # Source-row -> benchmark-field mapping. Dotted paths supported,
    # including [N] indexing on lists (e.g. "answers.text[0]").
    question_field: str = "question"
    answer_field: str = "answers.text[0]"
    context_field: str | None = "context"
    title_field: str | None = "title"
    # Filtering / ingestion knobs
    skip_empty_answers: bool = True
    upload_documents: bool = True
    max_documents: int = Field(default=10, ge=0, le=500)
    document_category: str = Field(default="hf-import", max_length=80)


class ImportHFResponse(BaseModel):
    dataset_id: str
    dataset_name: str
    question_count: int
    document_count: int
    skipped_empty: int
    skipped_duplicates: int
    resolved_config: str
    resolved_split: str


@router.post(
    "/benchmarks/import-hf",
    response_model=ImportHFResponse,
    status_code=201,
)
def import_hf_benchmark(body: ImportHFRequest, request_obj: Request):
    """Import any HuggingFace QA dataset as a benchmark + (optional) docs.

    Pagination uses the public datasets-server `/rows` endpoint; the
    config is auto-detected via `/splits` when not supplied.
    """
    bm_store: BenchmarkStore = _get_benchmark_store(request_obj)

    config = (body.config or "").strip() or _hf_detect_config(body.dataset, body.split)

    fetch_count = body.num_questions
    if body.skip_empty_answers:
        # Over-fetch to absorb empty / unanswerable rows.
        fetch_count = min(2000, body.num_questions * 3)

    raw_rows = _fetch_hf_rows(body.dataset, config, body.split, fetch_count)
    if not raw_rows:
        raise HTTPException(
            422,
            f"No rows returned for {body.dataset} ({config}/{body.split}).",
        )

    seen_questions: set[str] = set()
    entries: list[BenchmarkEntry] = []
    contexts_by_title: dict[str, str] = {}
    skipped_empty = 0
    skipped_duplicates = 0

    for row in raw_rows:
        if len(entries) >= body.num_questions:
            break
        question = _coerce_answer(_resolve_field(row, body.question_field))
        if not question:
            skipped_empty += 1
            continue
        if question in seen_questions:
            skipped_duplicates += 1
            continue
        expected = _coerce_answer(_resolve_field(row, body.answer_field))
        if not expected and body.skip_empty_answers:
            skipped_empty += 1
            continue
        seen_questions.add(question)
        entries.append(BenchmarkEntry(question=question, expected_answer=expected))

        if body.context_field:
            context_text = _coerce_answer(_resolve_field(row, body.context_field))
            if context_text:
                title_raw = (
                    _coerce_answer(_resolve_field(row, body.title_field))
                    if body.title_field else ""
                )
                # Fallback title — use a hash prefix so identical-title rows
                # with different contexts still produce distinct documents
                # via the content_hash dedup downstream.
                title = title_raw or f"row-{hashlib.sha1(context_text.encode('utf-8')).hexdigest()[:8]}"
                contexts_by_title.setdefault(title, context_text)

    if not entries:
        raise HTTPException(
            422,
            "No usable rows after filtering. Check field mappings or "
            "disable skip_empty_answers.",
        )

    dataset = BenchmarkDataset(
        id=f"bmd-{uuid4().hex[:10]}",
        name=body.name,
        description=(
            body.description
            or f"Imported from HuggingFace dataset {body.dataset} ({config}/{body.split})."
        ),
        entries=entries,
        created_at=int(time() * 1000),
    )
    bm_store.save_dataset(dataset)

    document_count = 0
    if body.upload_documents:
        slug = _slugify(body.dataset.replace("/", "-")) or "hf"
        document_count = _provision_hf_documents(
            request_obj,
            list(contexts_by_title.items()),
            body.max_documents,
            category=body.document_category or "hf-import",
            name_prefix=slug,
        )

    return ImportHFResponse(
        dataset_id=dataset.id,
        dataset_name=dataset.name,
        question_count=len(entries),
        document_count=document_count,
        skipped_empty=skipped_empty,
        skipped_duplicates=skipped_duplicates,
        resolved_config=config,
        resolved_split=body.split,
    )
