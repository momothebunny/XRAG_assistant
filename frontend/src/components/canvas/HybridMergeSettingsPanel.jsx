/**
 * HybridMergeSettingsPanel — cyan-themed sparse+dense fusion inspector.
 *
 * Backend contract (`process-hybrid-merge` in
 * `backend/app/canvas/nodes.py::_exec_hybrid_merge`):
 *   { bm25Weight, vectorWeight, fusionStrategy, rrfK, topK,
 *     deduplicateByDocId }
 *
 * Inputs: `chunks` (one or more retrieval streams). Outputs: `chunks`
 * re-scored by the chosen fusion strategy. Backend honours all keys; weights
 * always sum to 1 (driven by the slider).
 */

import { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  GitMerge,
  Layers,
  ListOrdered,
  Sliders,
  Zap,
} from 'lucide-react';

const FUSION_STRATEGIES = [
  { value: 'rrf',    label: 'RRF',    hint: 'Reciprocal Rank Fusion' },
  { value: 'linear', label: 'Linear', hint: 'Weighted score sum' },
  { value: 'max',    label: 'Max',    hint: 'Best single-source score' },
  { value: 'mean',   label: 'Mean',   hint: 'Average of sources' },
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
  const bm25 = Math.max(0, Math.min(1, Number(value?.bm25Weight ?? 0.4)));
  return {
    bm25Weight:         Number(bm25.toFixed(2)),
    vectorWeight:       Number((1 - bm25).toFixed(2)),
    fusionStrategy:     String(value?.fusionStrategy ?? 'rrf'),
    rrfK:               Math.max(1, Math.min(200, Number(value?.rrfK ?? 60))),
    topK:               Math.max(1, Math.min(50, Number(value?.topK ?? 10))),
    deduplicateByDocId: Boolean(value?.deduplicateByDocId ?? true),
  };
}

export default function HybridMergeSettingsPanel({ value = {}, onChange }) {
  const setField = (k, v) => onChange?.(k, v);
  const payload = useMemo(() => buildPayload(value), [value]);
  const activeStrategy = FUSION_STRATEGIES.find((s) => s.value === payload.fusionStrategy) ?? FUSION_STRATEGIES[0];

  const warnings = [];
  if (payload.fusionStrategy === 'linear' && payload.bm25Weight === 0) {
    warnings.push('Linear fusion with BM25 weight 0 is identical to vector-only retrieval.');
  }
  if (payload.fusionStrategy === 'rrf' && (payload.rrfK < 10 || payload.rrfK > 120)) {
    warnings.push('RRF k constant typically lives between 10 and 120 (default 60).');
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-300 via-cyan-400 to-sky-300" />
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-50 to-sky-50 text-cyan-600 ring-1 ring-cyan-200/60">
            <GitMerge size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-800">Hybrid Merge</p>
            <p className="truncate font-mono text-[10.5px] text-slate-500">
              <span className="text-cyan-700">{activeStrategy.label}</span> · top-{payload.topK}
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-cyan-700">fusion</span>
            <span className="font-mono text-[10px] text-slate-500">
              {(payload.bm25Weight * 100).toFixed(0)}/{(payload.vectorWeight * 100).toFixed(0)}
            </span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-500">
          Blends sparse <span className="font-semibold text-slate-700">BM25</span> with dense{' '}
          <span className="font-semibold text-slate-700">vector</span> scores. Use RRF for rank-only
          fusion or linear for weighted score sum.
        </p>
      </div>

      <div className="rounded-2xl border border-cyan-200 bg-cyan-50/50 p-3">
        <div className="flex items-start gap-2">
          <Layers size={14} className="text-cyan-700" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-800">Fusion summary</p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <StatPill label="Strategy" ok hint={activeStrategy.label} Icon={GitMerge} />
              <StatPill label="BM25"     ok hint={`${(payload.bm25Weight * 100).toFixed(0)}%`}   Icon={Sliders} />
              <StatPill label="Vector"   ok hint={`${(payload.vectorWeight * 100).toFixed(0)}%`} Icon={Sliders} />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-cyan-900/80">
              Inputs: multiple <span className="font-mono font-semibold">chunks</span> streams →
              merged top-{payload.topK} <span className="font-mono font-semibold">chunks</span>.
            </p>
          </div>
        </div>
      </div>

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Sliders size={12} className="text-cyan-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Score weights</h4>
        </header>
        <FieldLabel title={`BM25 — ${(payload.bm25Weight * 100).toFixed(0)}% · Vector — ${(payload.vectorWeight * 100).toFixed(0)}%`} />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={payload.bm25Weight}
          onChange={(e) => {
            const next = Number(e.target.value);
            setField('bm25Weight', Number(next.toFixed(2)));
            setField('vectorWeight', Number((1 - next).toFixed(2)));
          }}
          className="w-full accent-cyan-500"
        />
        <div className="flex justify-between text-[10px] text-slate-400">
          <span>vector-only</span>
          <span>balanced</span>
          <span>BM25-only</span>
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <GitMerge size={12} className="text-cyan-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Fusion strategy</h4>
        </header>
        <div className="flex flex-wrap gap-1.5">
          {FUSION_STRATEGIES.map((s) => (
            <ToggleChip
              key={s.value}
              checked={payload.fusionStrategy === s.value}
              onChange={() => setField('fusionStrategy', s.value)}
              label={s.label}
              help={s.hint}
            />
          ))}
        </div>
        <div className="grid grid-cols-1 @[280px]:grid-cols-2 gap-2 pt-1">
          <div>
            <FieldLabel title="RRF k constant" help="Lower → top results dominate." />
            <input
              type="number"
              min={1}
              max={200}
              value={payload.rrfK}
              onChange={(e) => setField('rrfK', Number(e.target.value))}
              className={inputClass}
              disabled={payload.fusionStrategy !== 'rrf'}
            />
          </div>
          <div>
            <FieldLabel title="Top-k after merge" />
            <input
              type="number"
              min={1}
              max={50}
              value={payload.topK}
              onChange={(e) => setField('topK', Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
        <div className="pt-1">
          <ToggleChip
            checked={payload.deduplicateByDocId}
            onChange={(v) => setField('deduplicateByDocId', v)}
            label="Deduplicate by document ID"
            help="Keep only the highest-scoring chunk per source document."
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
          <CheckCircle2 size={11} /> Hybrid fusion configured.
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
        Output: <span className="font-mono text-cyan-700">{payload.topK} merged chunks</span>
        <ListOrdered size={11} className="ml-auto text-cyan-400" />
      </div>
    </div>
  );
}
