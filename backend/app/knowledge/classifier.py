"""LLM-based document classifier.

Calls an OpenRouter chat-completion model to organise the user's uploaded
documents into a 2-level taxonomy (category -> subcategory). The classifier
sees only document names and a short text excerpt — never the full chunks.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, Field

from .models import KnowledgeDocument
from .store import KnowledgeStore


OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "openai/gpt-4o-mini"
EXCERPT_CHARS = 400  # how much text from each doc to feed the LLM


class TaxonomySubcategory(BaseModel):
    name: str
    document_ids: list[str] = Field(default_factory=list)


class TaxonomyCategory(BaseModel):
    name: str
    subcategories: list[TaxonomySubcategory] = Field(default_factory=list)


class ClassificationRequest(BaseModel):
    model: str | None = None
    language: str = "hu"  # output category names in this language


class ClassificationResult(BaseModel):
    model: str
    taxonomy: list[TaxonomyCategory]
    assignments: dict[str, dict[str, str | None]]  # doc_id -> {category, subcategory}


# ---------------------------------------------------------------------------


def _build_doc_blurbs(documents: list[KnowledgeDocument]) -> list[dict[str, Any]]:
    """Compact summary for each document the LLM should read."""
    blurbs: list[dict[str, Any]] = []
    for doc in documents:
        excerpt = ""
        if doc.chunks:
            excerpt = (doc.chunks[0].text or "")[:EXCERPT_CHARS]
        blurbs.append(
            {
                "id": doc.id,
                "name": doc.name,
                "path": doc.relative_path or doc.name,
                "current_category": doc.category,
                "current_subcategory": doc.subcategory,
                "excerpt": excerpt.replace("\n", " ").strip(),
            }
        )
    return blurbs


def _existing_taxonomy(documents: list[KnowledgeDocument]) -> dict[str, set[str]]:
    """Map current category -> set of subcategories already in use."""
    tax: dict[str, set[str]] = {}
    for doc in documents:
        if not doc.category:
            continue
        bucket = tax.setdefault(doc.category, set())
        if doc.subcategory:
            bucket.add(doc.subcategory)
    return tax


def _build_prompt(
    blurbs: list[dict[str, Any]],
    existing: dict[str, set[str]],
    language: str,
) -> list[dict[str, str]]:
    lang_hint = {
        "hu": "Hungarian",
        "en": "English",
    }.get(language, language)

    system = (
        "You are a librarian organising a user's knowledge base. "
        "Group the documents into a taxonomy with at most 2 levels: "
        "top-level CATEGORY and OPTIONAL SUBCATEGORY. "
        f"Return category and subcategory names in {lang_hint}. "
        "Use 3-8 top-level categories. "
        "STRONGLY PREFER FLAT (no subcategories). Only introduce a subcategory "
        "when ALL of these hold: (a) the parent category contains at least 5 "
        "documents, AND (b) those documents split into 2+ clearly distinct "
        "themes, AND (c) each resulting subcategory has at least 3 documents. "
        "If any condition fails, leave the category flat (no subcategories). "
        "Never create a subcategory that would contain only 1-2 documents. "
        "Every document MUST be assigned to exactly one category. "
        "IMPORTANT: when an existing taxonomy is provided, REUSE those category "
        "and subcategory names whenever they still fit. Only invent new ones if "
        "a document genuinely does not belong to any existing bucket. Do not "
        "rename existing categories unless the meaning has clearly changed. "
        "Respond with STRICT JSON, no markdown, in this exact shape:\n"
        '{"categories":[{"name":"<cat>","document_ids":["doc-..."],'
        '"subcategories":[{"name":"<sub>","document_ids":["doc-..."]}]}]}\n'
        "When a category is flat, omit \"subcategories\" (or pass an empty array) "
        "and put the document_ids directly on the category."
    )

    user_lines: list[str] = []
    if existing:
        user_lines.append("Existing taxonomy (reuse these names when possible):")
        for cat, subs in existing.items():
            if subs:
                user_lines.append(f"  - {cat}: {sorted(subs)}")
            else:
                user_lines.append(f"  - {cat}")
        user_lines.append("")

    user_lines.append("Documents to classify:")
    for b in blurbs:
        current = ""
        if b.get("current_category"):
            current = (
                f" | currently in: {b['current_category']}"
                + (f" / {b['current_subcategory']}" if b.get("current_subcategory") else "")
            )
        user_lines.append(
            f"- id={b['id']} | name={b['name']} | path={b['path']}{current} | excerpt: {b['excerpt']!r}"
        )
    user_lines.append("\nReturn the JSON taxonomy now.")
    user = "\n".join(user_lines)

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def _call_openrouter(messages: list[dict[str, str]], model: str) -> str:
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENROUTER_API_KEY is not set on the server. Add it to backend/.env.",
        )
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": model,
        "messages": messages,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }
    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                f"{OPENROUTER_BASE_URL}/chat/completions", headers=headers, json=body
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"OpenRouter unreachable: {exc}") from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"OpenRouter chat failed ({response.status_code}): {response.text[:300]}",
        )
    payload = response.json()
    try:
        return payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail=f"Unexpected OpenRouter payload: {exc}")


def _extract_json(text: str) -> dict[str, Any]:
    """Be lenient: strip ```json fences if the model adds them."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        # Last-ditch attempt: find the outermost {...}
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise HTTPException(status_code=502, detail=f"LLM returned non-JSON: {exc}")


def _normalise_taxonomy(
    parsed: dict[str, Any],
    valid_ids: set[str],
) -> tuple[list[TaxonomyCategory], dict[str, dict[str, str | None]]]:
    categories_raw = parsed.get("categories")
    if not isinstance(categories_raw, list):
        raise HTTPException(status_code=502, detail="LLM JSON missing 'categories' array.")

    taxonomy: list[TaxonomyCategory] = []
    assignments: dict[str, dict[str, str | None]] = {}
    seen: set[str] = set()

    for cat in categories_raw:
        if not isinstance(cat, dict):
            continue
        cat_name = str(cat.get("name") or "").strip()
        if not cat_name:
            continue
        subs_raw = cat.get("subcategories") or []
        subs_norm: list[TaxonomySubcategory] = []
        # Documents may sit either under a subcategory or directly on the category.
        direct_ids = [did for did in (cat.get("document_ids") or []) if did in valid_ids]
        for did in direct_ids:
            if did in seen:
                continue
            assignments[did] = {"category": cat_name, "subcategory": None}
            seen.add(did)

        for sub in subs_raw if isinstance(subs_raw, list) else []:
            if not isinstance(sub, dict):
                continue
            sub_name = str(sub.get("name") or "").strip()
            if not sub_name:
                continue
            ids = [did for did in (sub.get("document_ids") or []) if did in valid_ids]
            kept_ids: list[str] = []
            for did in ids:
                if did in seen:
                    continue
                assignments[did] = {"category": cat_name, "subcategory": sub_name}
                seen.add(did)
                kept_ids.append(did)
            subs_norm.append(TaxonomySubcategory(name=sub_name, document_ids=kept_ids))

        taxonomy.append(TaxonomyCategory(name=cat_name, subcategories=subs_norm))

    # Anything the LLM forgot lands in "Egyéb" / "Other" — flat, no subcategory.
    leftover = [did for did in valid_ids if did not in seen]
    if leftover:
        other = TaxonomyCategory(name="Egyéb", subcategories=[])
        for did in leftover:
            assignments[did] = {"category": "Egyéb", "subcategory": None}
        taxonomy.append(other)

    # Safety net: collapse subcategories that are too small to be useful.
    # If a category has fewer than 5 documents in total, OR any individual
    # subcategory would have fewer than 3, we flatten the entire category.
    MIN_DOCS_FOR_SUBS = 5
    MIN_DOCS_PER_SUB = 3
    for cat in taxonomy:
        total = sum(len(s.document_ids) for s in cat.subcategories)
        too_small_overall = total < MIN_DOCS_FOR_SUBS
        too_small_subs = any(0 < len(s.document_ids) < MIN_DOCS_PER_SUB for s in cat.subcategories)
        if too_small_overall or too_small_subs:
            flat_ids: list[str] = []
            for sub in cat.subcategories:
                flat_ids.extend(sub.document_ids)
            for did in flat_ids:
                if did in assignments:
                    assignments[did]["subcategory"] = None
            cat.subcategories = []

    return taxonomy, assignments


def classify_documents(
    store: KnowledgeStore,
    model: str | None = None,
    language: str = "hu",
) -> ClassificationResult:
    summaries = store.list_documents()
    if not summaries:
        raise HTTPException(status_code=400, detail="No documents to classify.")

    documents: list[KnowledgeDocument] = []
    for summary in summaries:
        full = store.get_document(summary.id)
        if full is not None:
            documents.append(full)

    valid_ids = {doc.id for doc in documents}
    blurbs = _build_doc_blurbs(documents)
    existing = _existing_taxonomy(documents)
    messages = _build_prompt(blurbs, existing=existing, language=language)
    chosen_model = (model or DEFAULT_MODEL).strip()

    raw = _call_openrouter(messages, chosen_model)
    parsed = _extract_json(raw)
    taxonomy, assignments = _normalise_taxonomy(parsed, valid_ids)

    # Persist category / subcategory on each document.
    for doc in documents:
        ass = assignments.get(doc.id)
        if not ass:
            continue
        updated = doc.model_copy(
            update={
                "category": ass.get("category"),
                "subcategory": ass.get("subcategory"),
            }
        )
        store.upsert_document(updated)

    return ClassificationResult(
        model=chosen_model,
        taxonomy=taxonomy,
        assignments=assignments,
    )
