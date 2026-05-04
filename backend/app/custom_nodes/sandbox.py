"""Sandbox for executing user-supplied Python code from custom canvas nodes.

The threat model: the user (an authenticated operator of XRAG) can write
arbitrary Python that the backend runs server-side. Because the backend is
trusted infrastructure and we cannot fully sandbox CPython, we restrict
the surface to: a curated whitelist of safe modules, no file/network access,
no introspection on dunder attributes, and a wall-clock timeout enforced via
a watchdog thread.

This is best-effort defense-in-depth — operators should still review code
before saving for production flows.
"""

from __future__ import annotations

import ast
import builtins as _builtins
import io
import math
import re
import threading
import time
from typing import Any

# ---------------------------------------------------------------------------
# Allowed standard-library modules. These are imported once and exposed to
# user code via the restricted globals — `import` statements themselves are
# blocked by the AST checker below.
# ---------------------------------------------------------------------------

import json as _json
import statistics as _statistics
import datetime as _datetime
import collections as _collections
import itertools as _itertools
import functools as _functools
import hashlib as _hashlib
import base64 as _base64

ALLOWED_MODULES: dict[str, Any] = {
    "json": _json,
    "math": math,
    "re": re,
    "statistics": _statistics,
    "datetime": _datetime,
    "collections": _collections,
    "itertools": _itertools,
    "functools": _functools,
    "hashlib": _hashlib,
    "base64": _base64,
}

# Builtins that are always safe.
SAFE_BUILTINS: dict[str, Any] = {
    name: getattr(_builtins, name)
    for name in (
        "abs", "all", "any", "ascii", "bin", "bool", "bytearray", "bytes",
        "callable", "chr", "complex", "dict", "divmod", "enumerate", "filter",
        "float", "format", "frozenset", "hash", "hex", "int", "isinstance",
        "issubclass", "iter", "len", "list", "map", "max", "min", "next",
        "object", "oct", "ord", "pow", "range", "repr", "reversed", "round",
        "set", "slice", "sorted", "str", "sum", "tuple", "type", "zip",
        "True", "False", "None",
    )
    if hasattr(_builtins, name)
}

# Banned attribute names (prevent escaping the sandbox via __class__ tricks).
BANNED_ATTRS = {
    "__class__", "__bases__", "__subclasses__", "__mro__", "__globals__",
    "__getattribute__", "__reduce__", "__reduce_ex__", "__import__",
    "__builtins__", "__loader__", "__spec__", "__code__", "__closure__",
    "func_globals", "f_globals", "f_locals", "gi_frame",
}

# AST node types that are flat-out banned in user code.
BANNED_NODES = (
    ast.Import,
    ast.ImportFrom,
    ast.AsyncFunctionDef,
    ast.AsyncFor,
    ast.AsyncWith,
    ast.Await,
    ast.Global,
    ast.Nonlocal,
)


class SandboxError(Exception):
    """Raised when user code violates sandbox rules or fails to run."""


def _validate_ast(tree: ast.AST) -> None:
    """Walk the AST and reject anything dangerous."""
    for node in ast.walk(tree):
        if isinstance(node, BANNED_NODES):
            raise SandboxError(
                f"Disallowed construct: {type(node).__name__} "
                "(imports, async, global/nonlocal are blocked)"
            )
        if isinstance(node, ast.Attribute):
            if node.attr in BANNED_ATTRS:
                raise SandboxError(
                    f"Disallowed attribute access: '{node.attr}'"
                )
            if node.attr.startswith("__") and node.attr.endswith("__"):
                # Allow harmless dunders we explicitly need.
                if node.attr not in {"__name__", "__doc__"}:
                    raise SandboxError(
                        f"Disallowed dunder attribute: '{node.attr}'"
                    )
        if isinstance(node, ast.Name) and node.id in {"exec", "eval", "compile", "open", "input", "__import__"}:
            raise SandboxError(f"Disallowed name: '{node.id}'")


def _build_globals() -> dict[str, Any]:
    """Construct a fresh restricted global namespace per execution."""
    return {
        "__builtins__": SAFE_BUILTINS,
        **ALLOWED_MODULES,
    }


class _Logger:
    """Captures user-side `log(...)` calls for return to the UI."""

    def __init__(self) -> None:
        self._buf: list[str] = []
        self._cap = 200  # max log lines

    def __call__(self, *args: Any) -> None:
        if len(self._buf) >= self._cap:
            return
        self._buf.append(" ".join(str(a) for a in args)[:1000])

    @property
    def lines(self) -> list[str]:
        return list(self._buf)


def execute_user_code(
    code: str,
    inputs: dict[str, Any],
    config: dict[str, Any],
    *,
    timeout_seconds: float = 5.0,
) -> tuple[bool, Any, list[str], str | None]:
    """Compile and run user code in the sandbox.

    The code must define a top-level `def run(inputs, config, log):` function.
    Returns (ok, output, logs, error_or_none).
    """
    if not code or not code.strip():
        return False, None, [], "Empty code body"

    # 1. Parse & validate.
    try:
        tree = ast.parse(code, mode="exec")
    except SyntaxError as exc:
        return False, None, [], f"Syntax error: {exc.msg} (line {exc.lineno})"

    try:
        _validate_ast(tree)
    except SandboxError as exc:
        return False, None, [], str(exc)

    # 2. Compile.
    try:
        compiled = compile(tree, filename="<custom_node>", mode="exec")
    except (SyntaxError, ValueError) as exc:
        return False, None, [], f"Compile error: {exc}"

    # 3. Run with timeout watchdog.
    log = _Logger()
    globals_ns = _build_globals()
    locals_ns: dict[str, Any] = {}
    result: dict[str, Any] = {"value": None, "error": None}

    def _runner() -> None:
        try:
            exec(compiled, globals_ns, locals_ns)  # noqa: S102 — sandboxed
            run_fn = locals_ns.get("run") or globals_ns.get("run")
            if run_fn is None or not callable(run_fn):
                result["error"] = "Code must define a top-level `run(inputs, config, log)` function."
                return
            result["value"] = run_fn(dict(inputs), dict(config), log)
        except Exception as exc:  # noqa: BLE001 — surface user-visible message
            result["error"] = f"{type(exc).__name__}: {exc}"

    thread = threading.Thread(target=_runner, daemon=True)
    started = time.monotonic()
    thread.start()
    thread.join(timeout=timeout_seconds)
    if thread.is_alive():
        return False, None, log.lines, f"Execution exceeded {timeout_seconds:.1f}s timeout"

    if result["error"]:
        return False, None, log.lines, result["error"]

    return True, result["value"], log.lines, None
