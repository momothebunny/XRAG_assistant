/**
 * ChatTesterSettingsPanel  fuchsia-themed interactive chat surface for testing the pipeline.
 *
 * CONNECTION CONTRACT (CANONICAL_PIPELINE_RANK = 18)
 *    Inputs: `answer` / `text` from Response node.
 *    Outputs: `answer` (pass-through).
 *
 * Backend contract: passthrough  config is consumed by the chat tester UI only.
 */

import { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  History,
  MessageSquare,
  Settings2,
  Sparkles,
  Zap,
} from 'lucide-react';

const MODES = [
  { value: 'markdown',  label: 'Markdown' },
  { value: 'plaintext', label: 'Plain text' },
  { value: 'json',      label: 'Raw JSON' },
  { value: 'html',      label: 'HTML' },
];

const inputClass =
  'w-full rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-xs text-slate-200 outline-none transition focus:border-fuchsia-300 focus:ring-2 focus:ring-fuchsia-200/50';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{title}</label>
    {help && (
      <span title={help} className="cursor-help text-slate-300 hover:text-fuchsia-500">
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
        ? 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800 shadow-sm shadow-fuchsia-200/40'
        : 'border-slate-700/50 bg-[#0d1117] text-slate-400 hover:border-fuchsia-200 hover:text-fuchsia-700'
    }`}
  >
    <span aria-hidden className={`inline-block h-2 w-2 rounded-full transition ${checked ? 'bg-fuchsia-500' : 'bg-slate-300'}`} />
    {label}
  </button>
);

function StatPill({ label, hint, ok = true, Icon }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-[10px] ${ok ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800' : 'border-slate-700/50 bg-[#0d1117] text-slate-400'}`}>
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
    mode:            String(value?.mode ?? 'markdown'),
    showTrace:       Boolean(value?.showTrace ?? true),
    showCitations:   Boolean(value?.showCitations ?? true),
    showMetrics:     Boolean(value?.showMetrics ?? false),
    multiTurn:       Boolean(value?.multiTurn ?? true),
    maxHistoryTurns: Math.max(0, Math.min(50, Number(value?.maxHistoryTurns ?? 10))),
  };
}

export default function ChatTesterSettingsPanel({ value = {}, onChange }) {
  const setField = (k, v) => onChange?.(k, v);
  const payload = useMemo(() => buildPayload(value), [value]);
  const activeMode = MODES.find((m) => m.value === payload.mode) ?? MODES[0];
  const panelsOn = [payload.showTrace, payload.showCitations, payload.showMetrics].filter(Boolean).length;

  const warnings = [];
  if (payload.multiTurn && payload.maxHistoryTurns === 0) warnings.push('Multi-turn enabled but history window is 0.');
  if (payload.maxHistoryTurns > 30) warnings.push('Very large history window may exceed LLM context limits.');

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-800/50 to-fuchsia-900/70 text-fuchsia-200 ring-1 ring-fuchsia-600/30">
            <MessageSquare size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-100">Chat Tester</p>
            <p className="truncate font-mono text-[10.5px] text-slate-400">
              <span className="text-fuchsia-700">{activeMode.label}</span>  {payload.multiTurn ? `${payload.maxHistoryTurns}-turn` : 'single-turn'}
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-fuchsia-700">{panelsOn}/3 panels</span>
            <span className="font-mono text-[10px] text-slate-400">tester</span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-400">
          Renders the final answer and (optionally) the execution trace, citations and
          token/latency metrics. Use this to dry-run the canvas pipeline.
        </p>
      </div>

      <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/50 p-3">
        <div className="flex items-start gap-2">
          <Settings2 size={14} className="text-fuchsia-700" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fuchsia-800">Tester summary</p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <StatPill label="Render" ok hint={activeMode.label}                                           Icon={Sparkles} />
              <StatPill label="Turns"  ok hint={payload.multiTurn ? String(payload.maxHistoryTurns) : 'off'} Icon={History} />
              <StatPill label="Panels" ok hint={`${panelsOn}/3`}                                            Icon={Settings2} />
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Sparkles size={12} className="text-fuchsia-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Display</h4>
        </header>
        <div>
          <FieldLabel title="Render mode" />
          <select value={payload.mode} onChange={(e) => setField('mode', e.target.value)} className={inputClass}>
            {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip checked={payload.showTrace}     onChange={(v) => setField('showTrace', v)}     label="Execution trace" />
          <ToggleChip checked={payload.showCitations} onChange={(v) => setField('showCitations', v)} label="Source citations" />
          <ToggleChip checked={payload.showMetrics}   onChange={(v) => setField('showMetrics', v)}   label="Latency & tokens" />
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <History size={12} className="text-fuchsia-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Conversation</h4>
        </header>
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip checked={payload.multiTurn} onChange={(v) => setField('multiTurn', v)} label="Multi-turn" />
        </div>
        <div>
          <FieldLabel title="Max history turns" />
          <input
            type="number"
            min={0}
            max={50}
            value={payload.maxHistoryTurns}
            onChange={(e) => setField('maxHistoryTurns', Number(e.target.value))}
            className={inputClass}
            disabled={!payload.multiTurn}
          />
        </div>
      </section>

      {warnings.length > 0 ? (
        <ul className="space-y-1">
          {warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5 rounded-lg border border-amber-700/40 bg-amber-900/20 px-2.5 py-1.5 text-[10.5px] font-semibold text-amber-300">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-1.5 rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-fuchsia-800">
          <CheckCircle2 size={11} /> Tester configured.
        </div>
      )}

      <details className="rounded-2xl border border-slate-700/50 bg-slate-800/40/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-fuchsia-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <Zap size={11} className="text-fuchsia-400" />
        Output: <span className="font-mono text-fuchsia-700">answer (passthrough)</span>
      </div>
    </div>
  );
}
