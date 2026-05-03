"""Per-embedding-model tokenizer registry.

The chunking processor uses these to count *real* tokens (as the embedding
model would) instead of guessing with a 4-chars-per-token heuristic. Each
embedding family has its own tokenizer; picking the right one matters
because:

  * OpenAI text-embedding-3-* uses ``cl100k_base`` (BPE, ~4 chars/token EN).
  * Pinecone integrated ``multilingual-e5-large`` uses XLM-RoBERTa tokenizer
    (SentencePiece, ~2-3 chars/token for Hungarian text — much denser than
    the OpenAI heuristic predicts).
  * BAAI/bge-* uses BERT WordPiece.

Counters are cached because tokenizer construction is expensive (downloads
the tokenizer.json from Hugging Face on first use).
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Callable

logger = logging.getLogger(__name__)

TokenCounter = Callable[[str], int]


def _normalise_hf_id(model_id: str) -> str:
    """Project a free-form embedding id to a Hugging Face Hub repo id.

    Pinecone's integrated inference accepts bare names (``multilingual-e5-
    large``) — those map back to ``intfloat/multilingual-e5-large``.
    """
    lower = model_id.lower()
    if "/" in model_id:
        return model_id
    if "e5" in lower:
        return f"intfloat/{model_id}"
    if lower.startswith("bge"):
        return f"BAAI/{model_id}"
    return model_id


@lru_cache(maxsize=16)
def get_token_counter(model_id: str | None) -> TokenCounter | None:
    """Return a ``(text) -> token_count`` function for the given embedding id.

    Returns ``None`` when no real tokenizer is available so callers can fall
    back to a character-based heuristic.
    """
    if not model_id:
        return None
    lower = model_id.lower()

    # ── OpenAI family → tiktoken ────────────────────────────────────────────
    if (
        lower.startswith("openai/")
        or "text-embedding-3" in lower
        or "text-embedding-ada" in lower
    ):
        try:
            import tiktoken  # type: ignore

            enc = tiktoken.get_encoding("cl100k_base")
            return lambda s: len(enc.encode(s or ""))
        except Exception as exc:  # noqa: BLE001
            logger.warning("tiktoken unavailable for %s: %s", model_id, exc)
            return None

    # ── Hugging Face / Pinecone integrated → tokenizers ────────────────────
    hf_id = _normalise_hf_id(model_id)
    try:
        from tokenizers import Tokenizer  # type: ignore

        tok = Tokenizer.from_pretrained(hf_id)
        return lambda s: len(tok.encode(s or "").ids)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "HF tokenizer unavailable for %s (resolved id: %s): %s",
            model_id,
            hf_id,
            exc,
        )
        return None


def chars_per_token(model_id: str | None, sample: str) -> float | None:
    """Compute the actual char-per-token ratio for a sample using the real
    tokenizer. Returns ``None`` if no tokenizer is available so the caller
    can apply its own fallback (typically 4.0)."""
    counter = get_token_counter(model_id)
    if counter is None:
        return None
    sample = (sample or "").strip()
    if not sample:
        return None
    tokens = max(1, counter(sample))
    return len(sample) / tokens
