/**
 * ReflectionLoopSettingsPanel — rose-themed self-critique loop.
 *
 * Backend contract (`process-reflection-loop` in
 * `backend/app/canvas/nodes.py::_exec_reflection`):
 *   { maxReflections, stopCondition, qualityThreshold, critiquePrompt,
 *     critiqueModel, model, temperature, maxTokens, appendIterationTrace }
 *
 * Inputs: `text` (LLM answer) + `chunks` (evidence). Outputs: `answer`
 * (revised), `iterations`, `critiques`. Falls back to a no-op when no API
 * key is configured.
 */

import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, MessageSquare, Repeat, Sparkles, Target, Zap } from 'lucide-react';

const STOP_CONDITIONS = [
  { value: 'max-iters',       label: 'Always max', hint: 'Run every iteration' },
  { value: 'score-threshold', label: 'Threshold',  hint: 'Stop when score ≥ threshold' },
  { value: 'no-change',       label: 'No-change',  hint: 'Stop when answer is stable' },
];

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-200/50';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</label>
    {help && (
      <span title={help} className="cursor-help text-slate-300 hover:text-rose-500">
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
        ? 'border-rose-300 bg-rose-50 text-rose-800 shadow-sm shadow-rose-200/40'
        : 'border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:text-rose-700'
    }`}
  >
    <span aria-hidden className={`inline-block h-2 w-2 rounded-full transition ${checked ? 'bg-rose-500' : 'bg-slate-300'}`} />
    {label}
  </button>
);

function StatPill({ label, hint, ok = true, Icon }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-[10px] ${ok ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-slate-200 bg-white text-slate-500'}`}>
      <div className="flex items-center gap-1">
        <Icon size={10} />
        <p className="font-bold">{label}</p>
      </div>
      <p className="mt-0.5 truncate font-mono text-[9px]">{hint}</p>
    </div>
  );
}

const DEFAULT_CRITIQUE = 'Critique the following answer. Identify factual errors, missing citations, or logical inconsistencies. Then produce an improved version.';

function buildPayload(value) {
  return {
    maxReflections:       Math.max(1, Math.min(5, Number(value?.maxReflections ?? 2))),
    stopCondition:        String(value?.stopCondition ?? 'max-iters'),
    qualityThreshold:     Number(value?.qualityThreshold ?? 0.85),
    critiquePrompt:       String(value?.critiquePrompt ?? DEFAULT_CRITIQUE),
    critiqueModel:        String(value?.critiqueModel ?? value?.model ?? 'openai/gpt-4o-mini'),
    model:                String(value?.model ?? value?.critiqueModel ?? 'openai/gpt-4o-mini'),
    temperature:          Number(value?.temperature ?? 0.1),
    maxTokens:            Number(value?.maxTokens ?? 1024),
    appendIterationTrace: Boolean(value?.appendIterationTrace ?? false),
  };
}

export default function ReflectionLoopSettingsPanel({ value = {}, onChange }) {
  const setField = (k, v) => onChange?.(k, v);
  const payload = useMemo(() => buildPayload(value), [value]);

  const warnings = [];
  if (payload.maxReflections > 3) warnings.push('More than 3 iterations multiplies LLM cost — use sparingly.');
  if (payload.temperature > 0.5) warnings.push('Critique works best with low temperature (≤ 0.3).');
  if (!payload.critiquePrompt.trim()) warnings.push('Critique prompt is empty.');

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rose-300 via-rose-400 to-pink-300" />
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-50 to-pink-50 text-rose-600 ring-1 ring-rose-200/60">
            <Repeat size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-800">Reflection Loop</p>
            <p className="truncate font-mono text-[10.5px] text-slate-500">
              max <span className="text-rose-700">{payload.maxReflections}</span> iters · {payload.stopCondition}
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-rose-700">self-critique</span>
            <span className="font-mono text-[10px] text-slate-500 truncate max-w-[140px]">{payload.critiqueModel}</span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-500">
          Critique-and-revise pass. Each iteration the model identifies factual gaps against the
          retrieved evidence and emits a revised answer. Stops early when stable.
        </p>
      </div>

      <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-3">
        <div className="flex items-start gap-2">
          <Target size={14} className="text-rose-700" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-800">Loop summary</p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <StatPill label="Max iters" ok hint={String(payload.maxReflections)} Icon={Repeat} />
              <StatPill label="Stop"      ok hint={payload.stopCondition} Icon={Target} />
              <StatPill label="Temp"      ok hint={payload.temperature.toFixed(2)} Icon={Sparkles} />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-rose-900/80">
              Inputs: <span className="font-mono font-semibold">text</span> +{' '}
              <span className="font-mono font-semibold">chunks</span> → outputs revised{' '}
              <span className="font-mono font-semibold">answer</span> +{' '}
              <span className="font-mono font-semibold">iterations</span>.
            </p>
          </div>
        </div>
      </div>

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Repeat size={12} className="text-rose-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Loop settings</h4>
        </header>
        <div className="grid grid-cols-1 @[280px]:grid-cols-2 gap-2">
          <div>
            <FieldLabel title="Max reflections" help="1-5 iterations." />
            <input
              type="number"
              min={1}
              max={5}
              value={payload.maxReflections}
              onChange={(e) => setField('maxReflections', Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel title="Quality threshold" help="0-1; used by score-threshold mode." />
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={payload.qualityThreshold}
              onChange={(e) => setField('qualityThreshold', Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <FieldLabel title="Stop condition" />
          <div className="flex flex-wrap gap-1.5">
            {STOP_CONDITIONS.map((c) => (
              <ToggleChip
                key={c.value}
                checked={payload.stopCondition === c.value}
                onChange={() => setField('stopCondition', c.value)}
                label={c.label}
                help={c.hint}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Sparkles size={12} className="text-rose-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Critique</h4>
        </header>
        <div>
          <FieldLabel title="Critique prompt" help="System instruction for the critique step." />
          <textarea
            rows={4}
            value={payload.critiquePrompt}
            onChange={(e) => setField('critiquePrompt', e.target.value)}
            className={`${inputClass} resize-y`}
          />
        </div>
        <div className="grid grid-cols-1 @[280px]:grid-cols-2 gap-2">
          <div>
            <FieldLabel title="Critique model" help="OpenRouter model id." />
            <input
              type="text"
              value={payload.critiqueModel}
              onChange={(e) => {
                setField('critiqueModel', e.target.value);
                setField('model', e.target.value);
              }}
              className={`${inputClass} font-mono`}
            />
          </div>
          <div>
            <FieldLabel title="Temperature" />
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={payload.temperature}
              onChange={(e) => setField('temperature', Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <FieldLabel title="Max tokens" />
          <input
            type="number"
            min={64}
            max={8192}
            step={64}
            value={payload.maxTokens}
            onChange={(e) => setField('maxTokens', Number(e.target.value))}
            className={inputClass}
          />
        </div>
        <div className="pt-1">
          <ToggleChip
            checked={payload.appendIterationTrace}
            onChange={(v) => setField('appendIterationTrace', v)}
            label="Append all iterations to trace"
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
        <div className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-rose-800">
          <CheckCircle2 size={11} /> Reflection loop ready.
        </div>
      )}

      <details className="rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-rose-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <Zap size={11} className="text-rose-400" />
        Output: <span className="font-mono text-rose-700">revised answer + iterations</span>
        <MessageSquare size={11} className="ml-auto text-rose-400" />
      </div>
    </div>
  );
}
