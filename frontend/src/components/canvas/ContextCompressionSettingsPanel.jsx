/**
 * ContextCompressionSettingsPanel — cyan-themed token-budget inspector.
 *
 * Backend contract (`process-context-compression` in
 * `backend/app/canvas/nodes.py::_exec_compression`):
 *   { strategy, maxTokens, topK, maxCharsPerChunk, keepCitations,
 *     keepScores }
 *
 * Inputs: `chunks` (Retriever / Reranker). Outputs: `chunks` (subset / trimmed).
 * The backend trims to fit `maxTokens`; the additional knobs travel with
 * the node so a richer compressor (extractive / LLM summariser) can opt in.
 */

import { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  FileText,
  Gauge,
  ScissorsLineDashed,
  ListOrdered,
  Zap,
} from 'lucide-react';

const STRATEGIES = [
  { value: 'token-budget', label: 'Token budget', hint: 'Greedy fit under maxTokens' },
  { value: 'top-k',        label: 'Top-k',        hint: 'Keep top-k by score' },
  { value: 'extractive',   label: 'Extractive',   hint: 'Most relevant sentences' },
  { value: 'llm-compress', label: 'LLM compress', hint: 'Summarise via LLM' },
];

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/50';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</label>
    {help && (
      <span title={help} className="cursor-help text-slate-300 hover:text-cyan-500">
        <CircleHelp size={11} />
      </span>
    )}
  </div>
);

const ToggleChip = ({ checked, onChange, label, help }) => (
  <button
    type="button"
    title={help}
    aria-pressed={Boolean(checked)}
    onClick={() => onChange?.(!checked)}
    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
      checked
        ? 'border-cyan-300 bg-cyan-50 text-cyan-800 shadow-sm shadow-cyan-200/40'
        : 'border-slate-200 bg-white text-slate-500 hover:border-cyan-200 hover:text-cyan-700'
    }`}
  >
    <span aria-hidden className={`inline-block h-2 w-2 rounded-full transition ${checked ? 'bg-cyan-500' : 'bg-slate-300'}`} />
    {label}
  </button>
);

function StatPill({ label, hint, ok = true, Icon }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-[10px] ${ok ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-slate-200 bg-white text-slate-500'}`}>
      <div className="flex items-center gap-1">
        <Icon size={10} />
        <p className="font-bold">{label}</p>
      </div>
      <p className="mt-0.5 truncate font-mono text-[9px]">{hint}</p>
    </div>
  );
}

function buildPayload(value) {
  return {
    strategy:         String(value?.strategy ?? 'token-budget'),
    maxTokens:        Math.max(100, Math.min(128000, Number(value?.maxTokens ?? 2200))),
    topK:             Math.max(1, Math.min(50, Number(value?.topK ?? 5))),
    maxCharsPerChunk: Math.max(50, Math.min(10000, Number(value?.maxCharsPerChunk ?? 1000))),
    keepCitations:    Boolean(value?.keepCitations ?? true),
    keepScores:       Boolean(value?.keepScores ?? true),
  };
}

export default function ContextCompressionSettingsPanel({ value = {}, onChange }) {
  const setField = (k, v) => onChange?.(k, v);
  const payload = useMemo(() => buildPayload(value), [value]);
  const activeStrategy = STRATEGIES.find((s) => s.value === payload.strategy) ?? STRATEGIES[0];

  const warnings = [];
  if (payload.maxTokens > 32000) warnings.push('Token budget > 32k may exceed many model context windows.');
  if (payload.maxCharsPerChunk < 200) warnings.push('Per-chunk char limit is very small — chunks may lose meaning.');

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-300 via-cyan-400 to-sky-300" />
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-50 to-sky-50 text-cyan-600 ring-1 ring-cyan-200/60">
            <ScissorsLineDashed size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-800">Context Compression</p>
            <p className="truncate font-mono text-[10.5px] text-slate-500">
              <span className="text-cyan-700">{activeStrategy.label}</span> · {payload.maxTokens.toLocaleString()} tok
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-cyan-700">budget</span>
            <span className="font-mono text-[10px] text-slate-500">{payload.maxCharsPerChunk}c / chunk</span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-500">
          Fits the retrieved context inside the LLM window. <span className="font-semibold text-slate-700">{activeStrategy.label}</span>{' '}
          — {activeStrategy.hint.toLowerCase()}.
        </p>
      </div>

      <div className="rounded-2xl border border-cyan-200 bg-cyan-50/50 p-3">
        <div className="flex items-start gap-2">
          <Gauge size={14} className="text-cyan-700" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-800">Budget summary</p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <StatPill label="Strategy"  ok hint={activeStrategy.label} Icon={ScissorsLineDashed} />
              <StatPill label="Tokens"    ok hint={payload.maxTokens.toLocaleString()} Icon={Gauge} />
              <StatPill label="Top-k"     ok hint={String(payload.topK)} Icon={ListOrdered} />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-cyan-900/80">
              Inputs: <span className="font-mono font-semibold">chunks</span> → trimmed{' '}
              <span className="font-mono font-semibold">chunks</span>.
            </p>
          </div>
        </div>
      </div>

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <ScissorsLineDashed size={12} className="text-cyan-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Strategy</h4>
        </header>
        <div className="flex flex-wrap gap-1.5">
          {STRATEGIES.map((s) => (
            <ToggleChip
              key={s.value}
              checked={payload.strategy === s.value}
              onChange={() => setField('strategy', s.value)}
              label={s.label}
              help={s.hint}
            />
          ))}
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <FileText size={12} className="text-cyan-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Budget &amp; limits</h4>
        </header>
        <div className="grid grid-cols-1 @[280px]:grid-cols-2 gap-2">
          <div>
            <FieldLabel title="Max tokens" />
            <input
              type="number"
              min={100}
              max={128000}
              step={100}
              value={payload.maxTokens}
              onChange={(e) => setField('maxTokens', Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel title="Top-k (top-k mode)" />
            <input
              type="number"
              min={1}
              max={50}
              value={payload.topK}
              onChange={(e) => setField('topK', Number(e.target.value))}
              className={inputClass}
              disabled={payload.strategy !== 'top-k'}
            />
          </div>
        </div>
        <div>
          <FieldLabel title="Max chars per chunk" help="Truncate individual chunks before forwarding." />
          <input
            type="number"
            min={50}
            max={10000}
            step={50}
            value={payload.maxCharsPerChunk}
            onChange={(e) => setField('maxCharsPerChunk', Number(e.target.value))}
            className={inputClass}
          />
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <ToggleChip
            checked={payload.keepCitations}
            onChange={(v) => setField('keepCitations', v)}
            label="Preserve citations"
            help="Keep citation markers in trimmed chunks."
          />
          <ToggleChip
            checked={payload.keepScores}
            onChange={(v) => setField('keepScores', v)}
            label="Preserve scores"
            help="Carry rerank/retrieval scores through."
          />
        </div>
      </section>

      {warnings.length > 0 ? (
        <ul className="space-y-1">
          {warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-amber-800">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-cyan-800">
          <CheckCircle2 size={11} /> Compression configured.
        </div>
      )}

      <details className="rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-cyan-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <Zap size={11} className="text-cyan-400" />
        Output: <span className="font-mono text-cyan-700">trimmed chunks</span>
      </div>
    </div>
  );
}
