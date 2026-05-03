/**
 * ChatTesterSettingsPanel — interactive chat surface for testing the pipeline.
 *
 * CONNECTION CONTRACT (CANONICAL_PIPELINE_RANK = 18)
 *   • Inputs: `answer` / `text` from Response node.
 *   • Outputs: `answer` (pass-through).
 */

import { MessageSquare, Settings2, CircleHelp } from 'lucide-react';

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-rose-400';

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
      <Icon size={13} className="text-rose-500 shrink-0" />
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">{title}</span>
    </div>
    {children}
  </div>
);

export default function ChatTesterSettingsPanel({ value = {}, onChange }) {
  const set = (key, val) => onChange?.({ ...value, [key]: val });

  return (
    <div className="space-y-3">
      <Section icon={MessageSquare} title="Display Mode">
        <FieldLabel title="Render mode" help="How to display the answer in the chat surface" />
        <select
          value={value.mode ?? 'markdown'}
          onChange={(e) => set('mode', e.target.value)}
          className={inputClass}
        >
          <option value="markdown">Markdown rendered</option>
          <option value="plaintext">Plain text</option>
          <option value="json">Raw JSON</option>
          <option value="html">HTML</option>
        </select>
      </Section>

      <Section icon={Settings2} title="Chat Options">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.showTrace ?? true)}
            onChange={(e) => set('showTrace', e.target.checked)}
            className="h-3.5 w-3.5 accent-rose-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Show execution trace</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.showCitations ?? true)}
            onChange={(e) => set('showCitations', e.target.checked)}
            className="h-3.5 w-3.5 accent-rose-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Show source citations</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.showMetrics ?? false)}
            onChange={(e) => set('showMetrics', e.target.checked)}
            className="h-3.5 w-3.5 accent-rose-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Show latency & token metrics</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.multiTurn ?? true)}
            onChange={(e) => set('multiTurn', e.target.checked)}
            className="h-3.5 w-3.5 accent-rose-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Multi-turn conversation</span>
        </label>

        <FieldLabel title="Max history turns" help="Number of previous turns included in context" />
        <input
          type="number"
          min={0}
          max={50}
          value={value.maxHistoryTurns ?? 10}
          onChange={(e) => set('maxHistoryTurns', Number(e.target.value))}
          className={inputClass}
        />
      </Section>
    </div>
  );
}
