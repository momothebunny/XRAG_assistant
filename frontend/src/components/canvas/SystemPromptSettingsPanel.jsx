/**
 * SystemPromptSettingsPanel  amber-themed persona/style/constraints composer.
 *
 * This is a SOURCE node  it produces output unconditionally and feeds the
 * downstream Brain LLM. Backend contract (`process-system-prompt` in
 * `nodes.py::_exec_system_prompt`):
 *   { preset, persona, style, constraints, template }
 * Outputs: system_prompt (preferred), text (compat).
 */

import { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  ScrollText,
  Sliders,
  Sparkles,
  Zap,
} from 'lucide-react';

const PRESETS = [
  {
    id: 'rag-grounded',
    label: 'RAG (grounded)',
    persona: 'You are a grounded enterprise RAG assistant.',
    style: 'Concise, factual, with inline citations like [1].',
    constraints: 'Refuse to answer if no evidence chunks support the claim.',
    template: '',
  },
  {
    id: 'analyst',
    label: 'Senior Analyst',
    persona: 'You are a senior business analyst writing for a C-level audience.',
    style: 'Executive summary first (2 sentences), then bullet-pointed findings.',
    constraints: 'Quantify every claim. Flag assumptions explicitly.',
    template: '',
  },
  {
    id: 'tutor',
    label: 'Patient Tutor',
    persona: 'You are a patient tutor explaining complex topics step by step.',
    style: 'Use analogies. Check understanding with a quick recap at the end.',
    constraints: 'Avoid jargon. If a term must be used, define it.',
    template: '',
  },
  {
    id: 'code-reviewer',
    label: 'Code Reviewer',
    persona: 'You are a strict but constructive senior code reviewer.',
    style: 'Quote the offending lines, then suggest the fix in a code block.',
    constraints: 'Only comment on issues with concrete evidence in the diff.',
    template: '',
  },
  { id: 'custom', label: 'Custom', persona: '', style: '', constraints: '', template: '' },
];

const inputClass =
  'w-full rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-xs text-slate-200 outline-none transition focus:border-amber-600/60 focus:ring-2 focus:ring-amber-200/50';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{title}</label>
    {help && (
      <span title={help} className="cursor-help text-slate-300 hover:text-amber-500">
        <CircleHelp size={11} />
      </span>
    )}
  </div>
);

const PresetChip = ({ checked, onChange, label }) => (
  <button
    type="button"
    onClick={onChange}
    aria-pressed={Boolean(checked)}
    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
      checked
        ? 'border-amber-600/60 bg-amber-900/20 text-amber-300 shadow-sm shadow-amber-200/40'
        : 'border-slate-700/50 bg-[#0d1117] text-slate-400 hover:border-amber-700/40 hover:text-amber-400'
    }`}
  >
    <span aria-hidden className={`inline-block h-2 w-2 rounded-full transition ${checked ? 'bg-amber-500' : 'bg-slate-300'}`} />
    {label}
  </button>
);

function StatPill({ label, hint, ok = true, Icon }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-[10px] ${ok ? 'border-amber-700/40 bg-amber-900/20 text-amber-300' : 'border-slate-700/50 bg-[#0d1117] text-slate-400'}`}>
      <div className="flex items-center gap-1">
        <Icon size={10} />
        <p className="font-bold">{label}</p>
      </div>
      <p className="mt-0.5 truncate font-mono text-[9px]">{hint}</p>
    </div>
  );
}

export function buildSystemPromptPayload(config = {}) {
  const pieces = [];
  if (config.persona) pieces.push(config.persona);
  if (config.style) pieces.push(`Style: ${config.style}`);
  if (config.constraints) pieces.push(`Constraints: ${config.constraints}`);
  if (config.template) pieces.push(config.template);
  const rendered = pieces.join('\n\n').trim() || 'You are a helpful assistant.';
  return {
    step_type: 'system_prompt',
    metadata: {
      preset: config.preset || 'custom',
      length_chars: rendered.length,
      token_estimate: Math.max(1, Math.floor(rendered.length / 4)),
    },
    system_prompt: rendered,
  };
}

export default function SystemPromptSettingsPanel({ value = {}, onChange }) {
  const setField = (k, v) => onChange?.(k, v);
  const payload = useMemo(() => buildSystemPromptPayload(value), [value]);
  const activePreset = PRESETS.find((p) => p.id === (value.preset || 'custom')) ?? PRESETS[PRESETS.length - 1];

  const applyPreset = (presetId) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setField('preset', preset.id);
    if (preset.id !== 'custom') {
      setField('persona', preset.persona);
      setField('style', preset.style);
      setField('constraints', preset.constraints);
      setField('template', preset.template);
    }
  };

  const warnings = [];
  if (!value.persona && !value.style && !value.constraints && !value.template) {
    warnings.push('No fields filled  falling back to "You are a helpful assistant."');
  }
  if (payload.metadata.token_estimate > 800) {
    warnings.push('System prompt > ~800 tokens eats into the LLM context window.');
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-800/50 to-amber-900/70 text-amber-200 ring-1 ring-amber-600/30">
            <ScrollText size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-100">System Prompt</p>
            <p className="truncate font-mono text-[10.5px] text-slate-400">
              <span className="text-amber-400">{activePreset.label}</span>  {payload.metadata.length_chars} char
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-amber-400">~{payload.metadata.token_estimate} tok</span>
            <span className="font-mono text-[10px] text-slate-400"> brain-llm</span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-400">
          A composable persona / style / constraints prompt  feeds the LLM as a first-class
          artefact you can A/B test.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-700/40 bg-amber-900/20 p-3">
        <div className="flex items-start gap-2">
          <Sparkles size={14} className="text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">Prompt summary</p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <StatPill label="Preset" ok hint={activePreset.label}                    Icon={Sparkles} />
              <StatPill label="Chars"  ok hint={String(payload.metadata.length_chars)} Icon={Sliders} />
              <StatPill label="Tokens" ok hint={`~${payload.metadata.token_estimate}`} Icon={Sliders} />
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Sparkles size={12} className="text-amber-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Preset</h4>
        </header>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <PresetChip
              key={p.id}
              checked={(value.preset || 'custom') === p.id}
              onChange={() => applyPreset(p.id)}
              label={p.label}
            />
          ))}
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <ScrollText size={12} className="text-amber-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Composable fields</h4>
        </header>
        <div>
          <FieldLabel title="Persona" help="Who/what is the model?" />
          <textarea
            rows={2}
            value={value.persona || ''}
            placeholder="You are a grounded enterprise RAG assistant."
            onChange={(e) => setField('persona', e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <FieldLabel title="Style" help="Tone, format, length." />
          <textarea
            rows={2}
            value={value.style || ''}
            placeholder="Concise, factual, with inline citations like [1]."
            onChange={(e) => setField('style', e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <FieldLabel title="Constraints" help="Prohibitions and required rules." />
          <textarea
            rows={2}
            value={value.constraints || ''}
            placeholder="Refuse to answer if no evidence supports the claim."
            onChange={(e) => setField('constraints', e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <FieldLabel title="Custom template (raw)" help="Appended after persona/style/constraints." />
          <textarea
            rows={3}
            value={value.template || ''}
            placeholder="Few-shot examples, formatting hints, "
            onChange={(e) => setField('template', e.target.value)}
            className={`${inputClass} font-mono`}
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
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-700/40 bg-amber-900/20 px-2.5 py-1.5 text-[10.5px] font-semibold text-amber-300">
          <CheckCircle2 size={11} /> System prompt ready.
        </div>
      )}

      <details className="rounded-2xl border border-slate-700/50 bg-slate-800/40/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-amber-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <Zap size={11} className="text-amber-400" />
        Output: <span className="font-mono text-amber-400">system_prompt</span>  brain-llm
      </div>
    </div>
  );
}
