"""API key management — multi-key storage with runtime env-var injection.

Design goals:
    * Users can register multiple keys per provider (e.g. two OpenAI keys for
      different teams) and pick which one is **active**.
    * The "active" key for a given environment variable is mirrored into
      ``os.environ`` so every existing module that reads ``os.getenv(...)``
      (rag_engine, openrouter_proxy, classifier, pinecone_index, audit
      validation, canvas nodes, health probes, ...) works without any change.
    * Stored at ``backend/data/api_keys.json`` next to the other JSON stores.
    * Bulk import from an ``.env``-style text blob.

The store is intentionally simple — keys are written as plain text on disk
(same trust level as ``backend/.env``). If you need encryption-at-rest, plug
in a vault provider here without changing the public API.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from threading import Lock
from time import time
from typing import Iterable
from uuid import uuid4

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Provider catalogue — single source of truth for the UI dropdown and for
# resolving "provider -> env var" defaults. Each entry can declare more than
# one env var alias (e.g. Gemini accepts both GOOGLE_API_KEY and
# GEMINI_API_KEY); the first one is the canonical one written to env.
# ---------------------------------------------------------------------------
PROVIDER_CATALOG: list[dict] = [
    {"id": "openai",       "label": "OpenAI",          "env_vars": ["OPENAI_API_KEY"]},
    {"id": "anthropic",    "label": "Anthropic",       "env_vars": ["ANTHROPIC_API_KEY"]},
    {"id": "gemini",       "label": "Google Gemini",   "env_vars": ["GOOGLE_API_KEY", "GEMINI_API_KEY"]},
    {"id": "openrouter",   "label": "OpenRouter",      "env_vars": ["OPENROUTER_API_KEY"]},
    {"id": "huggingface",  "label": "HuggingFace",     "env_vars": ["HUGGINGFACE_API_KEY"]},
    {"id": "pinecone",     "label": "Pinecone",        "env_vars": ["PINECONE_API_KEY"]},
    {"id": "cohere",       "label": "Cohere",          "env_vars": ["COHERE_API_KEY"]},
    {"id": "voyage",       "label": "Voyage AI",       "env_vars": ["VOYAGE_API_KEY"]},
    {"id": "mistral",      "label": "Mistral",         "env_vars": ["MISTRAL_API_KEY"]},
    {"id": "groq",         "label": "Groq",            "env_vars": ["GROQ_API_KEY"]},
    {"id": "deepseek",     "label": "DeepSeek",        "env_vars": ["DEEPSEEK_API_KEY"]},
    {"id": "custom",       "label": "Custom",          "env_vars": []},
]

_PROVIDER_BY_ID: dict[str, dict] = {entry["id"]: entry for entry in PROVIDER_CATALOG}
_PROVIDER_BY_ENV: dict[str, str] = {
    env: entry["id"]
    for entry in PROVIDER_CATALOG
    for env in entry["env_vars"]
}


def _default_env_var_for(provider_id: str) -> str:
    entry = _PROVIDER_BY_ID.get(provider_id)
    if entry and entry["env_vars"]:
        return entry["env_vars"][0]
    return ""


def _mask(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "•" * len(value)
    return f"{value[:4]}…{value[-4:]}"


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ApiKeyEntry(BaseModel):
    id: str
    label: str
    provider: str
    env_var: str
    key: str
    is_active: bool = False
    created_at: int = 0
    updated_at: int = 0


class ApiKeyPublic(BaseModel):
    """View model returned to the UI — masks the secret."""
    id: str
    label: str
    provider: str
    env_var: str
    masked_key: str
    is_active: bool
    created_at: int
    updated_at: int


class ApiKeyUpsertRequest(BaseModel):
    id: str | None = None
    label: str = Field(min_length=1, max_length=120)
    provider: str = Field(min_length=1, max_length=40)
    env_var: str | None = None
    key: str = Field(min_length=1)
    is_active: bool = True


class ApiKeyImportRequest(BaseModel):
    text: str
    activate: bool = True


class ApiKeyImportReport(BaseModel):
    imported: list[ApiKeyPublic] = Field(default_factory=list)
    skipped: list[dict] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Store
# ---------------------------------------------------------------------------

class ApiKeyStore:
    """JSON-backed store for API key entries with env-var sync."""

    def __init__(self, data_dir: Path) -> None:
        self._data_dir = data_dir
        self._path = data_dir / "api_keys.json"
        self._lock = Lock()
        self._data_dir.mkdir(parents=True, exist_ok=True)

    # ---------- low-level ------------------------------------------------
    def _read(self) -> list[ApiKeyEntry]:
        if not self._path.exists():
            return []
        try:
            payload = json.loads(self._path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return []
        return [ApiKeyEntry.model_validate(item) for item in payload if isinstance(item, dict)]

    def _write(self, entries: list[ApiKeyEntry]) -> None:
        self._path.write_text(
            json.dumps([entry.model_dump() for entry in entries], indent=2),
            encoding="utf-8",
        )

    # ---------- public API ----------------------------------------------
    def list_public(self) -> list[ApiKeyPublic]:
        with self._lock:
            entries = self._read()
        return [self._to_public(entry) for entry in entries]

    def list_providers(self) -> list[dict]:
        return PROVIDER_CATALOG

    def keys_for_env(self, env_var: str) -> list[str]:
        """Return every stored key value for ``env_var``, active first.

        Used by the OpenRouter caller to rotate through alternative keys
        when the primary one is rejected (HTTP 401/402/403). The first
        element is always the currently active key, so callers can simply
        iterate and stop on the first 200.
        """
        env_var = (env_var or "").upper()
        if not env_var:
            return []
        with self._lock:
            entries = self._read()
        ordered: list[str] = []
        # Active first
        for entry in entries:
            if entry.env_var == env_var and entry.is_active and entry.key:
                ordered.append(entry.key)
        for entry in entries:
            if entry.env_var == env_var and not entry.is_active and entry.key:
                ordered.append(entry.key)
        # De-duplicate while preserving order so two entries with the same secret
        # don't burn a retry slot.
        seen: set[str] = set()
        unique: list[str] = []
        for value in ordered:
            if value not in seen:
                seen.add(value)
                unique.append(value)
        return unique

    def promote_key(self, env_var: str, key_value: str) -> None:
        """Mark the entry whose secret == ``key_value`` as the active one for ``env_var``.

        Idempotent. Safe to call from anywhere — used by ``_call_openrouter_chat``
        when a fallback key succeeds, so subsequent requests start from the
        working one.
        """
        env_var = (env_var or "").upper()
        if not env_var or not key_value:
            return
        with self._lock:
            entries = self._read()
            target = next(
                (e for e in entries if e.env_var == env_var and e.key == key_value),
                None,
            )
            if target is None:
                return
            if target.is_active and os.environ.get(env_var) == key_value:
                # Already the active one; nothing to do.
                return
            target.is_active = True
            target.updated_at = int(time() * 1000)
            self._enforce_single_active(entries, env_var, keep_id=target.id)
            self._write(entries)
            self._sync_env(entries)

    def upsert(self, payload: ApiKeyUpsertRequest) -> ApiKeyPublic:
        with self._lock:
            entries = self._read()

            env_var = (payload.env_var or _default_env_var_for(payload.provider) or "").strip().upper()
            if not env_var:
                # Custom provider with no env var — fall back to a synthetic name so the
                # secret is still selectable by id but never injected into os.environ.
                env_var = f"XRAG_CUSTOM_{payload.provider.upper()}"

            now_ms = int(time() * 1000)
            existing = next((e for e in entries if e.id == payload.id), None) if payload.id else None

            if existing is not None:
                existing.label = payload.label.strip()
                existing.provider = payload.provider.strip()
                existing.env_var = env_var
                existing.key = payload.key.strip()
                existing.updated_at = now_ms
                if payload.is_active:
                    existing.is_active = True
                target = existing
            else:
                target = ApiKeyEntry(
                    id=f"key-{uuid4().hex[:12]}",
                    label=payload.label.strip(),
                    provider=payload.provider.strip(),
                    env_var=env_var,
                    key=payload.key.strip(),
                    is_active=payload.is_active,
                    created_at=now_ms,
                    updated_at=now_ms,
                )
                entries.append(target)

            if payload.is_active:
                self._enforce_single_active(entries, env_var, keep_id=target.id)

            self._write(entries)
            self._sync_env(entries)
            return self._to_public(target)

    def delete(self, key_id: str) -> bool:
        with self._lock:
            entries = self._read()
            new_entries = [e for e in entries if e.id != key_id]
            if len(new_entries) == len(entries):
                return False
            removed = next((e for e in entries if e.id == key_id), None)
            self._write(new_entries)
            # If the removed key was the active one, clear it from env.
            if removed and removed.is_active and removed.env_var:
                # Only clear if no other entry now claims that env var.
                still_active = any(
                    e.is_active and e.env_var == removed.env_var for e in new_entries
                )
                if not still_active and os.environ.get(removed.env_var) == removed.key:
                    os.environ.pop(removed.env_var, None)
            self._sync_env(new_entries)
            return True

    def activate(self, key_id: str) -> ApiKeyPublic | None:
        with self._lock:
            entries = self._read()
            target = next((e for e in entries if e.id == key_id), None)
            if target is None:
                return None
            target.is_active = True
            target.updated_at = int(time() * 1000)
            self._enforce_single_active(entries, target.env_var, keep_id=target.id)
            self._write(entries)
            self._sync_env(entries)
            return self._to_public(target)

    def import_env_text(self, payload: ApiKeyImportRequest) -> ApiKeyImportReport:
        """Parse a ``.env``-style blob and create one entry per recognised line.

        Lines are parsed with the loose grammar ``KEY=VALUE`` (quotes optional,
        ``export KEY=VALUE`` accepted). Only env-vars listed in
        :data:`PROVIDER_CATALOG` are imported; unknown vars are reported in
        ``skipped`` so the UI can flag them.
        """
        report = ApiKeyImportReport()
        with self._lock:
            entries = self._read()
            now_ms = int(time() * 1000)
            for raw_line in payload.text.splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                if line.lower().startswith("export "):
                    line = line[len("export "):].strip()
                match = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$", line)
                if not match:
                    report.skipped.append({"line": raw_line, "reason": "syntax"})
                    continue
                env_var = match.group(1).strip().upper()
                value = match.group(2).strip().strip('"').strip("'")
                if not value:
                    report.skipped.append({"line": raw_line, "reason": "empty"})
                    continue
                provider_id = _PROVIDER_BY_ENV.get(env_var)
                if provider_id is None:
                    report.skipped.append({"line": raw_line, "reason": f"unknown env var {env_var}"})
                    continue
                provider_label = _PROVIDER_BY_ID[provider_id]["label"]
                entry = ApiKeyEntry(
                    id=f"key-{uuid4().hex[:12]}",
                    label=f"{provider_label} (imported)",
                    provider=provider_id,
                    env_var=env_var,
                    key=value,
                    is_active=payload.activate,
                    created_at=now_ms,
                    updated_at=now_ms,
                )
                entries.append(entry)
                if payload.activate:
                    self._enforce_single_active(entries, env_var, keep_id=entry.id)
                report.imported.append(self._to_public(entry))

            if report.imported:
                self._write(entries)
                self._sync_env(entries)
        return report

    def sync_to_env(self) -> None:
        """Public hook — call on app startup to push active keys into os.environ."""
        with self._lock:
            entries = self._read()
            self._sync_env(entries)

    # ---------- helpers --------------------------------------------------
    @staticmethod
    def _enforce_single_active(entries: list[ApiKeyEntry], env_var: str, *, keep_id: str) -> None:
        """Ensure only one entry per env_var has is_active=True."""
        if not env_var:
            return
        for entry in entries:
            if entry.env_var == env_var and entry.id != keep_id:
                entry.is_active = False

    @staticmethod
    def _sync_env(entries: Iterable[ApiKeyEntry]) -> None:
        """Mirror active entries into os.environ so existing readers see them."""
        for entry in entries:
            if entry.is_active and entry.env_var and entry.key:
                os.environ[entry.env_var] = entry.key

    @staticmethod
    def _to_public(entry: ApiKeyEntry) -> ApiKeyPublic:
        return ApiKeyPublic(
            id=entry.id,
            label=entry.label,
            provider=entry.provider,
            env_var=entry.env_var,
            masked_key=_mask(entry.key),
            is_active=entry.is_active,
            created_at=entry.created_at,
            updated_at=entry.updated_at,
        )


# ---------------------------------------------------------------------------
# Process-wide singleton accessor.
#
# ``main.py`` instantiates the canonical store and registers it here so any
# module (canvas/nodes.py, audit/validation.py, ...) can fall back to the
# rotation logic without taking a hard dependency on the FastAPI app object.
# ---------------------------------------------------------------------------

_GLOBAL_STORE: "ApiKeyStore | None" = None


def register_store(store: "ApiKeyStore") -> None:
    global _GLOBAL_STORE
    _GLOBAL_STORE = store


def get_store() -> "ApiKeyStore | None":
    return _GLOBAL_STORE
