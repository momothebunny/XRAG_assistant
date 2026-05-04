"""RAG architecture validation metrics.

This module implements two complementary, architecture-agnostic
validation suites for any RAG flow executed by the canvas runner:

* **RAGAS-style** (https://github.com/explodinggradients/ragas) — reference
  and reference-free quality metrics that operate on the
  ``(question, answer, contexts, ground_truth)`` quadruple.
* **RAGChecker-style** (https://github.com/amazon-science/RAGChecker) —
  fine-grained claim-level metrics that decompose the answer and the
  ground truth into atomic claims and check each claim against the
  retrieved contexts.

Both suites prefer a real LLM judge via OpenRouter (any architecture is
graded uniformly because the judge only sees the I/O of the flow, not
its internals). When ``OPENROUTER_API_KEY`` is unavailable, every metric
gracefully degrades to a deterministic lexical heuristic so the UI keeps
working offline — the metric *names and value ranges stay identical* so
runs are still comparable to each other.

Each metric returns a float in ``[0.0, 1.0]`` (higher is better) except
``hallucination_rate`` where lower is better.
"""

from __future__ import annotations

import difflib
import json
import os
import re
from collections import Counter
from dataclasses import dataclass
from typing import Any, Iterable

from ..canvas.nodes import _call_openrouter_chat


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Light, fast judge by default — overridable via env so operators can pin
# a stronger model for high-stakes audits (gpt-4o, claude-3.5-sonnet, ...).
JUDGE_MODEL = os.environ.get("XRAG_JUDGE_MODEL", "openai/gpt-4o-mini")

# Cap how much context we send to the judge per request — keeps cost
# bounded and avoids context-window blowups on long-context flows.
MAX_CONTEXT_CHARS = 6000
MAX_CHUNKS_FOR_JUDGE = 8


def _judge_available() -> bool:
    """LLM judge is available if any OpenRouter key is reachable.

    Checks the env first (fast path) and falls back to the multi-key
    store, so a freshly imported key from the Settings panel enables the
    judge without requiring a server restart.
    """
    if os.environ.get("OPENROUTER_API_KEY", "").strip():
        return True
    try:
        from ..api_keys import get_store as _get_api_key_store

        store = _get_api_key_store()
        if store is not None and store.keys_for_env("OPENROUTER_API_KEY"):
            return True
    except Exception:  # noqa: BLE001 — defensive
        return False
    return False


# ---------------------------------------------------------------------------
# Public dataclass returned by ``evaluate(...)``
# ---------------------------------------------------------------------------

@dataclass
class RagValidationScores:
    """All metrics for a single (question, answer) sample.

    Float range is ``[0.0, 1.0]``; higher is better unless noted.
    All fields default to ``0.0`` so partially-failing flows still
    produce comparable rows.
    """

    # ── RAGAS suite ────────────────────────────────────────────────
    faithfulness: float = 0.0          # claims supported by context
    answer_relevancy: float = 0.0      # answer addresses the question
    context_precision: float = 0.0     # retrieved chunks are relevant
    context_recall: float = 0.0        # contexts contain the gold info
    answer_similarity: float = 0.0     # semantic/lexical sim to gold
    answer_correctness: float = 0.0    # weighted blend of the above

    # ── RAGChecker suite ──────────────────────────────────────────
    claim_recall: float = 0.0          # gold claims covered by answer
    claim_precision: float = 0.0       # answer claims supported by ctx
    hallucination_rate: float = 0.0    # answer claims unsupported (lower=better)
    context_utilization: float = 0.0   # gold claims that ARE in retrieved ctx

    # ── Aggregate ─────────────────────────────────────────────────
    overall_score: float = 0.0         # mean of the positive metrics

    # Per-metric judge mode used (llm | lexical) for transparency
    judge_mode: str = "lexical"

    def as_dict(self) -> dict[str, float | str]:
        return {
            "faithfulness": round(self.faithfulness, 4),
            "answer_relevancy": round(self.answer_relevancy, 4),
            "context_precision": round(self.context_precision, 4),
            "context_recall": round(self.context_recall, 4),
            "answer_similarity": round(self.answer_similarity, 4),
            "answer_correctness": round(self.answer_correctness, 4),
            "claim_recall": round(self.claim_recall, 4),
            "claim_precision": round(self.claim_precision, 4),
            "hallucination_rate": round(self.hallucination_rate, 4),
            "context_utilization": round(self.context_utilization, 4),
            "overall_score": round(self.overall_score, 4),
            "judge_mode": self.judge_mode,
        }


# ---------------------------------------------------------------------------
# Context extraction — works for ANY RAG architecture
# ---------------------------------------------------------------------------

def extract_retrieved_contexts(node_outputs: dict[str, dict[str, Any]]) -> list[str]:
    """Collect the text of all retrieved/processed chunks emitted by the flow.

    Looks at every node output bag for a ``chunks`` list (the canonical
    key emitted by retriever, reranker, hybrid-merge, compression and PII
    nodes). Falls back to ``contexts``/``passages`` for nodes that follow
    different conventions. The result is deduplicated while preserving
    order so the LLM judge sees the most upstream / authoritative copy
    first.

    This single primitive is what makes the validator architecture-agnostic:
    Naive RAG, Self-RAG, GraphRAG, HyDE, Agentic, ... all funnel their
    retrieved evidence through chunk-shaped outputs.
    """
    return [item["text"] for item in extract_retrieved_chunks(node_outputs)]


def extract_retrieved_chunks(node_outputs: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """Same as :func:`extract_retrieved_contexts` but keeps title/score metadata.

    Returns a deduplicated list of ``{"title", "text", "score", "source"}``
    dicts in the same order the flow produced them. Used by the audit UI
    to render clickable [n] citations that reveal the underlying chunk.
    """
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for bag in node_outputs.values():
        if not isinstance(bag, dict):
            continue
        for key in ("chunks", "contexts", "passages"):
            value = bag.get(key)
            if not isinstance(value, list):
                continue
            for item in value:
                text = ""
                title = ""
                source = ""
                score: float | None = None
                if isinstance(item, str):
                    text = item
                elif isinstance(item, dict):
                    text = (
                        item.get("text")
                        or item.get("content")
                        or item.get("chunk")
                        or item.get("passage")
                        or ""
                    )
                    title = str(
                        item.get("title")
                        or item.get("document_title")
                        or item.get("doc_title")
                        or item.get("id")
                        or ""
                    )
                    source = str(
                        item.get("source")
                        or item.get("document_id")
                        or item.get("doc_id")
                        or ""
                    )
                    raw_score = item.get("score") or item.get("similarity")
                    if isinstance(raw_score, (int, float)):
                        score = float(raw_score)
                text = (text or "").strip()
                if not text:
                    continue
                fp = text[:200]
                if fp in seen:
                    continue
                seen.add(fp)
                out.append({
                    "title": title,
                    "text": text,
                    "source": source,
                    "score": score,
                })
    return out


def _trim_contexts(contexts: list[str]) -> list[str]:
    """Trim contexts so we don't blow the judge's context window."""
    capped = contexts[:MAX_CHUNKS_FOR_JUDGE]
    total = 0
    out: list[str] = []
    for c in capped:
        budget = MAX_CONTEXT_CHARS - total
        if budget <= 0:
            break
        out.append(c[:budget])
        total += len(out[-1])
    return out


# ---------------------------------------------------------------------------
# Lexical helpers used both as features and as offline fallbacks
# ---------------------------------------------------------------------------

_TOKEN_RE = re.compile(r"\w+", re.UNICODE)


def _tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall((text or "").lower())


def _token_f1(a: str, b: str) -> float:
    a_toks = _tokenize(a)
    b_toks = _tokenize(b)
    if not a_toks or not b_toks:
        return 1.0 if a_toks == b_toks else 0.0
    common = sum((Counter(a_toks) & Counter(b_toks)).values())
    if common == 0:
        return 0.0
    prec = common / len(a_toks)
    rec = common / len(b_toks)
    return 2 * prec * rec / (prec + rec)


def _char_similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, (a or "").lower(), (b or "").lower()).ratio()


def _split_into_claims(text: str) -> list[str]:
    """Naive sentence splitter used by the lexical RAGChecker fallback.

    Keeps clauses split on ``.``, ``;``, ``!``, ``?`` and bullet-list
    delimiters. Anything shorter than 3 tokens is dropped — those are
    rarely standalone factual claims.
    """
    if not text:
        return []
    # Normalise bullets to sentence terminators so they're split cleanly.
    normalised = re.sub(r"[\u2022\u2023\u25E6\u2043\u2219\-\*]\s+", ". ", text)
    parts = re.split(r"(?<=[.!?;])\s+|\n+", normalised)
    claims: list[str] = []
    for part in parts:
        cleaned = part.strip(" \t.;:-").strip()
        if len(_tokenize(cleaned)) >= 3:
            claims.append(cleaned)
    return claims


def _claim_supported_lexical(claim: str, contexts: Iterable[str], threshold: float = 0.45) -> bool:
    """Lexical fallback for "is this claim supported by any context?".

    A claim is considered supported when its token-F1 against the best
    matching context is above ``threshold``. The threshold is calibrated
    against typical RAG outputs — high enough to avoid superficial
    keyword overlap, low enough to accept paraphrased support.
    """
    best = 0.0
    for ctx in contexts:
        score = _token_f1(claim, ctx)
        if score > best:
            best = score
            if best >= 1.0:
                break
    return best >= threshold


# ---------------------------------------------------------------------------
# LLM judge — single batched call that scores every metric at once
# ---------------------------------------------------------------------------

_JUDGE_SYSTEM_PROMPT = """You are an impartial evaluator for Retrieval-Augmented \
Generation (RAG) systems. You assess RAG outputs across the RAGAS and \
RAGChecker metric families.

Always respond with a single JSON object, no commentary, no markdown. \
Every metric value MUST be a float between 0.0 and 1.0 (inclusive). \
Use 0.0 for "completely fails this criterion" and 1.0 for "perfectly \
satisfies it". Lists must be JSON arrays of strings.

Metric definitions:
- faithfulness: fraction of claims in the answer that are entailed by the contexts.
- answer_relevancy: how well the answer addresses the user's question (independent of correctness).
- context_precision: fraction of retrieved contexts that are relevant to the question.
- context_recall: fraction of the ground-truth answer that is recoverable from the contexts.
- answer_similarity: semantic similarity between answer and ground truth.
- answer_correctness: factual agreement between answer and ground truth.
- claim_recall (RAGChecker): fraction of ground-truth claims covered by the answer.
- claim_precision (RAGChecker): fraction of answer claims supported by the contexts.
- hallucination_rate (RAGChecker): fraction of answer claims NOT supported by ANY context (lower is better).
- context_utilization (RAGChecker): fraction of ground-truth claims actually present in the retrieved contexts.

Also extract:
- answer_claims: atomic factual claims you decomposed from the answer (max 8).
- gold_claims:   atomic factual claims you decomposed from the ground truth (max 8).
"""


def _build_judge_user_prompt(
    *,
    question: str,
    answer: str,
    contexts: list[str],
    ground_truth: str,
) -> str:
    ctx_block = (
        "\n\n".join(f"[CTX-{i+1}] {c}" for i, c in enumerate(contexts))
        if contexts
        else "(no retrieved contexts)"
    )
    return f"""QUESTION:
{question}

GROUND_TRUTH_ANSWER:
{ground_truth}

GENERATED_ANSWER:
{answer}

RETRIEVED_CONTEXTS:
{ctx_block}

Return a JSON object with the following keys (all metrics MUST be floats in [0.0, 1.0]):
{{
  "faithfulness": <float>,
  "answer_relevancy": <float>,
  "context_precision": <float>,
  "context_recall": <float>,
  "answer_similarity": <float>,
  "answer_correctness": <float>,
  "claim_recall": <float>,
  "claim_precision": <float>,
  "hallucination_rate": <float>,
  "context_utilization": <float>,
  "answer_claims": ["...", "..."],
  "gold_claims":   ["...", "..."]
}}"""


def _llm_judge(
    *,
    question: str,
    answer: str,
    contexts: list[str],
    ground_truth: str,
    judge_model: str | None = None,
) -> dict[str, Any] | None:
    """One-shot LLM judge call. Returns ``None`` on any error so the caller
    can transparently fall back to the lexical scorer."""
    model = (judge_model or "").strip() or JUDGE_MODEL
    try:
        raw = _call_openrouter_chat(
            messages=[
                {"role": "system", "content": _JUDGE_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": _build_judge_user_prompt(
                        question=question,
                        answer=answer,
                        contexts=contexts,
                        ground_truth=ground_truth,
                    ),
                },
            ],
            model=model,
            temperature=0.0,
            max_tokens=900,
            response_format="json",
            timeout=90.0,
        )
    except Exception:  # noqa: BLE001
        return None

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Some judges wrap JSON in code fences — strip and retry once.
        cleaned = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError:
            return None
    if not isinstance(data, dict):
        return None
    return data


# ---------------------------------------------------------------------------
# Lexical fallback — operates on the same inputs, returns the same shape
# ---------------------------------------------------------------------------

def _lexical_scores(
    *,
    question: str,
    answer: str,
    contexts: list[str],
    ground_truth: str,
) -> RagValidationScores:
    answer_claims = _split_into_claims(answer)
    gold_claims = _split_into_claims(ground_truth)

    # ── Faithfulness / hallucination — claims supported by ANY context.
    if answer_claims:
        supported = sum(1 for c in answer_claims if _claim_supported_lexical(c, contexts))
        faithfulness = supported / len(answer_claims)
        hallucination = 1.0 - faithfulness
        claim_precision = faithfulness
    else:
        faithfulness = 0.0
        hallucination = 1.0
        claim_precision = 0.0

    # ── Claim recall — gold claims covered by the answer.
    if gold_claims:
        covered = sum(1 for c in gold_claims if _token_f1(c, answer) >= 0.4)
        claim_recall = covered / len(gold_claims)
        ctx_util = sum(1 for c in gold_claims if _claim_supported_lexical(c, contexts, 0.35)) / len(gold_claims)
    else:
        claim_recall = 0.0
        ctx_util = 0.0

    # ── Context precision/recall heuristics.
    if contexts:
        # A context is "relevant" if it overlaps with either Q or gold answer.
        relevant = 0
        for ctx in contexts:
            if _token_f1(ctx, question) >= 0.15 or _token_f1(ctx, ground_truth) >= 0.15:
                relevant += 1
        context_precision = relevant / len(contexts)
    else:
        context_precision = 0.0

    # Recall: how much of the gold answer's tokens appear across all contexts.
    if ground_truth.strip():
        merged_ctx = " ".join(contexts)
        context_recall = _token_f1(merged_ctx, ground_truth)
    else:
        context_recall = 0.0

    # ── Answer relevancy — does the answer cover the question's terms?
    answer_relevancy = _token_f1(answer, question) if question.strip() else 0.0
    # Heavily penalise empty / one-word answers.
    if len(_tokenize(answer)) < 2:
        answer_relevancy *= 0.5

    # ── Answer similarity / correctness vs gold.
    answer_similarity = (_char_similarity(answer, ground_truth) + _token_f1(answer, ground_truth)) / 2.0
    answer_correctness = (claim_recall * 0.6) + (claim_precision * 0.4)

    scores = RagValidationScores(
        faithfulness=faithfulness,
        answer_relevancy=answer_relevancy,
        context_precision=context_precision,
        context_recall=context_recall,
        answer_similarity=answer_similarity,
        answer_correctness=answer_correctness,
        claim_recall=claim_recall,
        claim_precision=claim_precision,
        hallucination_rate=hallucination,
        context_utilization=ctx_util,
        judge_mode="lexical",
    )
    scores.overall_score = _aggregate_overall(scores)
    return scores


def _coerce_unit(value: Any) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 0.0
    if v < 0.0:
        return 0.0
    if v > 1.0:
        # Some judges return percentages — auto-rescale.
        return min(v / 100.0, 1.0) if v <= 100.0 else 1.0
    return v


def _aggregate_overall(scores: RagValidationScores) -> float:
    """Composite score: mean of the positive-direction metrics with
    hallucination inverted so ``1.0`` always means "best"."""
    positive = [
        scores.faithfulness,
        scores.answer_relevancy,
        scores.context_precision,
        scores.context_recall,
        scores.answer_similarity,
        scores.answer_correctness,
        scores.claim_recall,
        scores.claim_precision,
        1.0 - scores.hallucination_rate,
        scores.context_utilization,
    ]
    return sum(positive) / len(positive)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def evaluate(
    *,
    question: str,
    answer: str,
    contexts: list[str],
    ground_truth: str,
    use_llm_judge: bool = True,
    judge_model: str | None = None,
) -> RagValidationScores:
    """Run the full RAGAS + RAGChecker suite on one sample.

    The call is architecture-agnostic: it only inspects the I/O of the
    flow (question, answer, retrieved contexts, gold answer), never the
    flow's internal node graph. Any RAG variant — Naive, Self-RAG,
    GraphRAG, HyDE, Agentic, Corrective, Modular — is therefore graded
    on the same axes and is directly comparable.
    """
    # Defensive normalisation — these are the only inputs the rest of
    # the pipeline trusts, so we make sure they're strings/lists even if
    # an upstream node emitted ``None``.
    question = (question or "").strip()
    answer = (answer or "").strip()
    ground_truth = (ground_truth or "").strip()
    contexts = [c for c in (contexts or []) if isinstance(c, str) and c.strip()]
    trimmed_contexts = _trim_contexts(contexts)

    # ── LLM judge path.
    if use_llm_judge and _judge_available():
        data = _llm_judge(
            question=question,
            answer=answer,
            contexts=trimmed_contexts,
            ground_truth=ground_truth,
            judge_model=judge_model,
        )
        if data is not None:
            scores = RagValidationScores(
                faithfulness=_coerce_unit(data.get("faithfulness")),
                answer_relevancy=_coerce_unit(data.get("answer_relevancy")),
                context_precision=_coerce_unit(data.get("context_precision")),
                context_recall=_coerce_unit(data.get("context_recall")),
                answer_similarity=_coerce_unit(data.get("answer_similarity")),
                answer_correctness=_coerce_unit(data.get("answer_correctness")),
                claim_recall=_coerce_unit(data.get("claim_recall")),
                claim_precision=_coerce_unit(data.get("claim_precision")),
                hallucination_rate=_coerce_unit(data.get("hallucination_rate")),
                context_utilization=_coerce_unit(data.get("context_utilization")),
                judge_mode="llm",
            )
            scores.overall_score = _aggregate_overall(scores)
            return scores

    # ── Fallback path (no API key, judge crashed, or judge_mode disabled).
    return _lexical_scores(
        question=question,
        answer=answer,
        contexts=trimmed_contexts,
        ground_truth=ground_truth,
    )


__all__ = [
    "RagValidationScores",
    "evaluate",
    "extract_retrieved_contexts",
    "extract_retrieved_chunks",
    "JUDGE_MODEL",
]
