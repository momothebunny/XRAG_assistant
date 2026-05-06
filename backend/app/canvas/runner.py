"""Topological executor for canvas flows.

This is the small Langflow-style runtime: build a DAG from the edges, run a
Kahn topological sort, then invoke each node executor in order while feeding
upstream outputs into ``inputs``. Results, per-node timings and an aggregated
final answer are returned.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Any

from .models import (
    CanvasFlow,
    FlowExecutionRequest,
    FlowExecutionResponse,
    NodeRunRecord,
)
from .nodes import NODE_REGISTRY, RunContext


class CanvasFlowError(Exception):
    """Raised when a flow cannot be executed (cycle, missing node, etc.)."""


class CanvasFlowRunner:
    def __init__(self, settings: Any | None = None) -> None:
        self._settings = settings

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run(self, request: FlowExecutionRequest, flow: CanvasFlow) -> FlowExecutionResponse:
        if not flow.nodes:
            raise CanvasFlowError("Flow has no nodes to execute.")

        order = self._topological_order(flow)
        node_index = {node.id: node for node in flow.nodes}
        upstream = self._build_upstream_map(flow)

        context = RunContext(
            question=request.question or str(request.inputs.get("question", "")),
            settings=self._settings,
            inputs=dict(request.inputs),
        )

        node_outputs: dict[str, dict[str, Any]] = {}
        trace: list[NodeRunRecord] = []
        flow_started = time.perf_counter()

        for node_id in order:
            node = node_index[node_id]
            spec = NODE_REGISTRY.get(node.template_key)
            if spec is None:
                trace.append(
                    NodeRunRecord(
                        node_id=node.id,
                        template_key=node.template_key,
                        label=node.label or node.template_key,
                        duration_ms=0,
                        status="skipped",
                        error=f"Unknown template_key '{node.template_key}'",
                    )
                )
                node_outputs[node_id] = {}
                continue

            inputs_for_node = {
                upstream_id: node_outputs.get(upstream_id, {})
                for upstream_id in upstream.get(node_id, [])
            }

            started = time.perf_counter()
            try:
                output = spec.executor(node, context, inputs_for_node) or {}
                status = "ok"
                error: str | None = None
            except Exception as exc:  # noqa: BLE001 — propagate as trace error
                output = {}
                status = "error"
                error = f"{exc.__class__.__name__}: {exc}"

            duration_ms = int((time.perf_counter() - started) * 1000)
            node_outputs[node_id] = output

            preview_value = output.get("answer") or output.get("text") or output.get("query") or ""
            if not isinstance(preview_value, str):
                preview_value = str(preview_value)
            preview = preview_value[:140]

            trace.append(
                NodeRunRecord(
                    node_id=node.id,
                    template_key=node.template_key,
                    label=node.label or spec.label,
                    duration_ms=duration_ms,
                    status=status,
                    output_preview=preview,
                    error=error,
                )
            )

        total_ms = int((time.perf_counter() - flow_started) * 1000)
        answer = self._extract_final_answer(flow, node_outputs, context)
        reasoning = " -> ".join(record.label for record in trace if record.status == "ok")

        return FlowExecutionResponse(
            answer=answer,
            reasoning=reasoning or "Flow executed with no successful nodes.",
            final_outputs=node_outputs,
            trace=trace,
            duration_ms=total_ms,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _topological_order(self, flow: CanvasFlow) -> list[str]:
        """Kahn's topological sort with cycle tolerance.

        Real RAG flows often contain feedback edges (e.g. a Reflection Loop
        that critiques the Hallucination Guard which in turn re-feeds the
        Reflection Loop). These edges create graph cycles even though the
        intended runtime semantics is "run each node once, in dependency
        order, and treat the back-edge as a feedback signal that is consumed
        by the upstream node on its single pass".

        To support that, when Kahn's algorithm runs out of zero-in-degree
        nodes but un-emitted nodes remain, we deterministically pick the
        node with the smallest remaining in-degree (ties broken by the
        node's original position in ``flow.nodes``) and release it as if
        all its incoming edges were already satisfied. Edges from that node
        to nodes already emitted are silently dropped (they are the
        feedback edges).
        """
        node_order_index = {node.id: idx for idx, node in enumerate(flow.nodes)}
        node_ids = set(node_order_index)

        in_degree: dict[str, int] = {node_id: 0 for node_id in node_ids}
        adjacency: dict[str, list[str]] = defaultdict(list)

        for edge in flow.edges:
            if edge.source not in node_ids or edge.target not in node_ids:
                continue
            adjacency[edge.source].append(edge.target)
            in_degree[edge.target] += 1

        emitted: set[str] = set()
        order: list[str] = []
        queue: deque[str] = deque(
            sorted(
                (node_id for node_id, degree in in_degree.items() if degree == 0),
                key=lambda nid: node_order_index[nid],
            )
        )

        def _release(node_id: str) -> None:
            order.append(node_id)
            emitted.add(node_id)
            for neighbour in adjacency[node_id]:
                if neighbour in emitted:
                    # Feedback edge — already produced output, ignore.
                    continue
                in_degree[neighbour] -= 1
                if in_degree[neighbour] == 0:
                    queue.append(neighbour)

        while len(order) < len(node_ids):
            if queue:
                _release(queue.popleft())
                continue
            # Cycle detected — break it by releasing the most-ready unemitted
            # node (smallest residual in-degree, then earliest in the flow).
            remaining = [nid for nid in node_ids if nid not in emitted]
            if not remaining:
                break
            forced = min(
                remaining,
                key=lambda nid: (in_degree[nid], node_order_index[nid]),
            )
            in_degree[forced] = 0
            _release(forced)

        if len(order) != len(node_ids):
            raise CanvasFlowError("Flow contains a cycle and cannot be executed.")

        return order

    def _build_upstream_map(self, flow: CanvasFlow) -> dict[str, list[str]]:
        upstream: dict[str, list[str]] = defaultdict(list)
        for edge in flow.edges:
            upstream[edge.target].append(edge.source)
        return upstream

    def _extract_final_answer(
        self,
        flow: CanvasFlow,
        node_outputs: dict[str, dict[str, Any]],
        context: RunContext,
    ) -> str:
        # Prefer explicit Output nodes.
        output_keys = {"output-response"}
        for node in flow.nodes:
            if node.template_key in output_keys:
                bag = node_outputs.get(node.id, {})
                value = bag.get("answer") or bag.get("text")
                if value:
                    return str(value)

        # Otherwise, fall back to the last node that produced something useful.
        for node in reversed(flow.nodes):
            bag = node_outputs.get(node.id, {})
            for key in ("answer", "text", "query"):
                value = bag.get(key)
                if value:
                    return str(value)

        return context.scratch.get("final_answer") or context.scratch.get("answer") or ""
