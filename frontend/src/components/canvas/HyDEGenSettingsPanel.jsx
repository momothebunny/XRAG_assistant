/**
 * HyDEGenSettingsPanel — amber-themed Hypothetical Document Embeddings node.
 *
 * Backend contract (`process-hyde` in `nodes.py::_exec_hyde`):
 *   { hypothesesPerQuery, hydeInstruction, prependOriginalQuery, model,
 *     maxTokens, temperature }
 * Inputs: text/query. Outputs: text, query, hypotheses[].
 */

import { useMemo } from 'react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  CircleHelp,
  FileText,
  Sparkles,
  Zap,
} from 'lucide-react';

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200/50';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</label>
    {help && (
      <span title={help} className="cursor-help text-slate-300 hover:text-amber-500">
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
        ? 'border-amber-300 bg-amber-50 text-amber-800 shadow-sm shadow-amber-200/40'
        : 'border-slate-200 bg-white text-slate-500 hover:border-amber-200 hover:text-amber-700'
    }`}
  >
    <span aria-hidden className={`inline-block h-2 w-2 rounded-full transition ${checked ? 'bg-amber-500' : 'bg-slate-300'}`} />
    {label}
  </button>
);

function StatPill({ label, hint, ok = true, Icon }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-[10px] ${ok ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-500'}`}>
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
    hypothesesPerQuery:   Math.max(1, Math.min(10, Number(value?.hypothesesPerQuery ?? 3))),
    hydeInstruction:      String(value?.hydeInstruction ?? 'Write a concise passage that would answer the following question:'),
    prependOriginalQuery: Boolean(value?.prependOriginalQuery ?? true),
    model:                String(value?.model ?? 'openai/gpt-4o-mini'),
    maxTokens:            Math.max(50, Math.min(2000, Number(value?.maxTokens ?? 256))),
    temperature:          Math.max(0, Math.min(2, Number(value?.temperature ?? 0.7))),
  };
}

export default function HyDEGenSettingsPanel({ value = {}, onChange }) {
  const setField = (k, v) => onChange?.(k, v);
  const payload = useMemo(() => buildPayload(value), [value]);

  const warnings = [];
  if (payload.hypothesesPerQuery > 5) warnings.push('Generating > 5 hypotheses adds noticeable latency and cost.');
  if (payload.temperature < 0.3) warnings.push('Low temperature reduces hypothesis diversity — defeats the point of HyDE.');

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-300 via-amber-400 to-orange-300" />
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 text-amber-600 ring-1 ring-amber-200/60">
            <Sparkles size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-800">HyDE Generator</p>
            <p className="truncate font-mono text-[10.5px] text-slate-500">
              <span className="text-amber-700">{payload.hypothesesPerQuery}× hypotheses</span> · {payload.model}
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-amber-700">temp {payload.temperature.toFixed(2)}</span>
            <span className="font-mono text-[10px] text-slate-500">{payload.maxTokens} tok</span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-500">
          Generates fake answers, then embeds them — bridges sparse-vocabulary queries to dense
          knowledge passages. Higher temperature = more diverse hypotheses.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3">
        <div className="flex items-start gap-2">
          <Brain size={14} className="text-amber-700" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-800">Generation summary</p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <StatPill label="Count"    ok hint={`${payload.hypothesesPerQuery}×`}      Icon={FileText} />
              <StatPill label="Tokens"   ok hint={String(payload.maxTokens)}             Icon={Brain} />
              <StatPill label="Temp"     ok hint={payload.temperature.toFixed(2)}        Icon={Sparkles} />
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <FileText size={12} className="text-amber-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Hypothesis generation</h4>
        </header>
        <div>
          <FieldLabel title="Hypotheses per query" help="More = better recall, more cost." />
          <input
            type="number"
            min={1}
            max={10}
            value={payload.hypothesesPerQuery}
            onChange={(e) => setField('hypothesesPerQuery', Number(e.target.value))}
            className={inputClass}
          />
        </div>
        <div>
          <FieldLabel title="HyDE instruction" />
          <textarea
            rows={3}
            value={payload.hydeInstruction}
            onChange={(e) => setField('hydeInstruction', e.target.value)}
            className={inputClass}
          />
        </div>
        <ToggleChip
          checked={payload.prependOriginalQuery}
          onChange={(v) => setField('prependOriginalQuery', v)}
          label="Prepend original query to output"
          help="Keeps the literal user query in the embedded text."
        />
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Brain size={12} className="text-amber-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Generation model</h4>
        </header>
        <div>
          <FieldLabel title="Model" />
          <input
            type="text"
            value={payload.model}
            onChange={(e) => setField('model', e.target.value)}
            className={inputClass}
            placeholder="openai/gpt-4o-mini"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel title="Max tokens" />
            <input
              type="number"
              min={50}
              max={2000}
              value={payload.maxTokens}
              onChange={(e) => setField('maxTokens', Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel title="Temperature" />
            <input
              type="number"
              min={0}
              max={2}
              step={0.05}
              value={payload.temperature}
              onChange={(e) => setField('temperature', Number(e.target.value))}
              className={inputClass}
            />
          </div>
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
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-amber-800">
          <CheckCircle2 size={11} /> HyDE generator configured.
        </div>
      )}

      <details className="rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-amber-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <Zap size={11} className="text-amber-400" />
        Output: <span className="font-mono text-amber-700">text · hypotheses[]</span>
      </div>
    </div>
  );
}
