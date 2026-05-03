/**
 * HybridMergeSettingsPanel — blends BM25 sparse retrieval with dense vector scores.
 *
 * CONNECTION CONTRACT (CANONICAL_PIPELINE_RANK = 8)
 *   • Inputs: `chunks` from Retriever (dense) and/or Graph DB.
 *   • Outputs: `chunks` re-scored and merged, consumed by Reranker / LLM.
 */

import { GitMerge, Sliders, CircleHelp } from 'lucide-react';

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-amber-400';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">{title}</label>
    {help && (
      <button type="button" title={help} className="shrink-0 text-slate-400 hover:text-slate-700">
        <CircleHelp size={11} />
      </button>
    )}
  </div>
);

const Section = ({ icon: Icon, title, children }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
    <div className="flex items-center gap-1.5">
      <Icon size={13} className="text-amber-500 shrink-0" />
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">{title}</span>
    </div>
    {children}
  </div>
);

export default function HybridMergeSettingsPanel({ value = {}, onChange }) {
  const set = (key, val) => onChange?.({ ...value, [key]: val });
  const bm25 = Number(value.bm25Weight ?? 0.4);
  const vec = Number(value.vectorWeight ?? 0.6);

  return (
    <div className="space-y-3">
      <Section icon={Sliders} title="Score Weights">
        <FieldLabel
          title={`BM25 Weight — ${(bm25 * 100).toFixed(0)}%`}
          help="Sparse lexical scoring weight (keyword matching)"
        />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={bm25}
          onChange={(e) => {
            const next = Number(e.target.value);
            set('bm25Weight', next);
            set('vectorWeight', Math.round((1 - next) * 100) / 100);
          }}
          className="w-full accent-amber-500"
        />
        <div className="flex justify-between text-[10px] text-slate-400">
          <span>BM25 {(bm25 * 100).toFixed(0)}%</span>
          <span>Vector {(vec * 100).toFixed(0)}%</span>
        </div>

        <FieldLabel title="Vector Weight" />
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={vec}
          onChange={(e) => {
            const next = Number(e.target.value);
            set('vectorWeight', next);
            set('bm25Weight', Math.round((1 - next) * 100) / 100);
          }}
          className={inputClass}
        />
      </Section>

      <Section icon={GitMerge} title="Merge Options">
        <FieldLabel title="Fusion Strategy" help="How to combine scores from multiple retrieval paths" />
        <select
          value={value.fusionStrategy ?? 'rrf'}
          onChange={(e) => set('fusionStrategy', e.target.value)}
          className={inputClass}
        >
          <option value="rrf">Reciprocal Rank Fusion (RRF)</option>
          <option value="linear">Linear interpolation</option>
          <option value="max">Max score</option>
          <option value="mean">Mean score</option>
        </select>

        <FieldLabel title="RRF k constant" help="RRF ranking constant (default 60). Lower = top results weighted more." />
        <input
          type="number"
          min={1}
          max={200}
          value={value.rrfK ?? 60}
          onChange={(e) => set('rrfK', Number(e.target.value))}
          className={inputClass}
        />

        <FieldLabel title="Top-k after merge" help="Number of results to keep after fusion" />
        <input
          type="number"
          min={1}
          max={50}
          value={value.topK ?? 10}
          onChange={(e) => set('topK', Number(e.target.value))}
          className={inputClass}
        />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.deduplicateByDocId ?? true)}
            onChange={(e) => set('deduplicateByDocId', e.target.checked)}
            className="h-3.5 w-3.5 accent-amber-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Deduplicate by document ID</span>
        </label>
      </Section>
    </div>
  );
}
