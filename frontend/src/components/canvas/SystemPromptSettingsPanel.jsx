/**
 * SystemPromptSettingsPanel — composable persona / style / constraints.
 *
 * Outputs a typed `system_prompt` payload consumed by the LLM (Generation)
 * node. Keeping system prompts as a separate node enables A/B testing
 * different personas without editing the LLM node, and makes the prompt
 * visible in the canvas as a first-class artefact.
 *
 * CONNECTION CONTRACT (CANONICAL_PIPELINE_RANK = 12)
 *   • Inputs: none — this is a source node.
 *   • Outputs: `system_prompt` (preferred) and `text` (compat fallback).
 *
 * Unlike the LLM panel, this one is always awake — it produces output
 * unconditionally. Presets seed the form; the user can override any field.
 */

import { useMemo } from 'react';
import { CircleHelp, ScrollText, Sparkles, Zap } from 'lucide-react';

const PRESETS = [
  {
    id: 'rag-grounded',
    label: 'RAG (grounded + citations)',
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
  {
    id: 'custom',
    label: 'Custom (manual)',
    persona: '',
    style: '',
    constraints: '',
    template: '',
  },
];

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-violet-400';

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
  const payload = useMemo(() => buildSystemPromptPayload(value), [value]);

  const setField = (field, fieldValue) => onChange?.(field, fieldValue);

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

  return (
    <div className="space-y-3">
      {/* ── Preset picker ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-violet-700" />
          <p className="text-[11px] font-black uppercase tracking-wider text-violet-800">
            Preset (gyors indítás)
          </p>
        </div>
        <select
          value={value.preset || 'custom'}
          onChange={(event) => applyPreset(event.target.value)}
          className={`${inputClass} mt-2`}
        >
          {PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Composable fields ───────────────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <FieldLabel
            title="Persona"
            help="Ki/mi a modell? Pl. 'Senior elemző', 'Patient tutor'."
          />
          <textarea
            rows={2}
            value={value.persona || ''}
            onChange={(event) => setField('persona', event.target.value)}
            className={inputClass}
            placeholder="You are a grounded enterprise RAG assistant."
          />
        </div>

        <div>
          <FieldLabel title="Style" help="Hogyan válaszoljon? Hangnem, formátum, hossz." />
          <textarea
            rows={2}
            value={value.style || ''}
            onChange={(event) => setField('style', event.target.value)}
            className={inputClass}
            placeholder="Concise, factual, with inline citations like [1]."
          />
        </div>

        <div>
          <FieldLabel
            title="Constraints"
            help="Tiltások és kötelező szabályok. Itt erősítsd meg a hallucináció elleni védelmet."
          />
          <textarea
            rows={2}
            value={value.constraints || ''}
            onChange={(event) => setField('constraints', event.target.value)}
            className={inputClass}
            placeholder="Refuse to answer if no evidence chunks support the claim."
          />
        </div>

        <div>
          <FieldLabel
            title="Custom template (raw)"
            help="Tetszőleges kiegészítő prompt. A persona/style/constraints UTÁN kerül."
          />
          <textarea
            rows={3}
            value={value.template || ''}
            onChange={(event) => setField('template', event.target.value)}
            className={`${inputClass} font-mono`}
            placeholder="Few-shot examples, formatting hints, ..."
          />
        </div>
      </div>

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Hossz</p>
          <p className="font-mono text-xs font-bold text-slate-800">
            {payload.metadata.length_chars} char
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">~ Tokenek</p>
          <p className="font-mono text-xs font-bold text-slate-800">
            {payload.metadata.token_estimate}
          </p>
        </div>
      </div>

      {/* ── Read-only payload ───────────────────────────────────────────── */}
      <div>
        <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
          Output payload (read-only)
        </p>
        <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-emerald-300">
{JSON.stringify(payload, null, 2)}
        </pre>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <Zap size={11} className="text-violet-500" />
        Kimenet: <span className="font-mono">system_prompt</span> →{' '}
        <span className="font-mono">brain-llm</span>
      </div>
    </div>
  );
}
