/**
 * TTSSettingsPanel — amber-themed Text-to-Speech inspector.
 *
 * Backend contract (`output-tts` in `nodes.py::_exec_tts`):
 *   { provider, voice, format, speed, streamOutput }
 * Inputs: text/answer. Outputs: audio_url, spoken.
 */

import { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Mic,
  Sliders,
  Volume2,
  Zap,
} from 'lucide-react';

const PROVIDERS = [
  { value: 'openai-tts',      label: 'OpenAI TTS' },
  { value: 'elevenlabs',      label: 'ElevenLabs' },
  { value: 'azure-cognitive', label: 'Azure Cognitive Speech' },
  { value: 'google-tts',      label: 'Google Cloud TTS' },
  { value: 'coqui',           label: 'Coqui (self-hosted)' },
];

const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
const FORMATS = ['mp3', 'opus', 'aac', 'flac', 'wav'];

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
    provider:     String(value?.provider ?? 'openai-tts'),
    voice:        String(value?.voice ?? 'alloy'),
    format:       String(value?.format ?? 'mp3'),
    speed:        Math.max(0.25, Math.min(4, Number(value?.speed ?? 1.0))),
    streamOutput: Boolean(value?.streamOutput ?? false),
  };
}

export default function TTSSettingsPanel({ value = {}, onChange }) {
  const setField = (k, v) => onChange?.(k, v);
  const payload = useMemo(() => buildPayload(value), [value]);
  const activeProvider = PROVIDERS.find((p) => p.value === payload.provider) ?? PROVIDERS[0];
  const isOpenAI = payload.provider === 'openai-tts';

  const warnings = [];
  if (payload.speed > 2.0) warnings.push('Speed > 2.0 produces unnatural pronunciation on most voices.');

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-300 via-amber-400 to-orange-300" />
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 text-amber-600 ring-1 ring-amber-200/60">
            <Volume2 size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-800">Text-to-Speech</p>
            <p className="truncate font-mono text-[10.5px] text-slate-500">
              <span className="text-amber-700">{activeProvider.label}</span> · {payload.voice}
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-amber-700">{payload.format.toUpperCase()}</span>
            <span className="font-mono text-[10px] text-slate-500">{payload.speed.toFixed(2)}×</span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-500">
          Synthesises spoken audio from the LLM answer. Streaming sends partial audio
          as soon as a sentence is ready.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3">
        <div className="flex items-start gap-2">
          <Sliders size={14} className="text-amber-700" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-800">Synthesis summary</p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <StatPill label="Provider" ok hint={activeProvider.label.split(' ')[0]} Icon={Volume2} />
              <StatPill label="Voice"    ok hint={payload.voice}                       Icon={Mic} />
              <StatPill label="Format"   ok hint={payload.format.toUpperCase()}        Icon={Sliders} />
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Volume2 size={12} className="text-amber-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Provider</h4>
        </header>
        <select value={payload.provider} onChange={(e) => setField('provider', e.target.value)} className={inputClass}>
          {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Mic size={12} className="text-amber-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Voice &amp; quality</h4>
        </header>
        <div>
          <FieldLabel title="Voice" help="Voice ID or preset for the selected provider." />
          {isOpenAI ? (
            <select value={payload.voice} onChange={(e) => setField('voice', e.target.value)} className={inputClass}>
              {OPENAI_VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          ) : (
            <input
              type="text"
              value={payload.voice}
              placeholder="provider voice ID"
              onChange={(e) => setField('voice', e.target.value)}
              className={inputClass}
            />
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel title="Format" />
            <select value={payload.format} onChange={(e) => setField('format', e.target.value)} className={inputClass}>
              {FORMATS.map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel title="Speed" help="Playback speed multiplier (0.25–4.0)." />
            <input
              type="number"
              min={0.25}
              max={4}
              step={0.05}
              value={payload.speed}
              onChange={(e) => setField('speed', Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
        <div className="pt-1">
          <ToggleChip
            checked={payload.streamOutput}
            onChange={(v) => setField('streamOutput', v)}
            label="Stream audio output"
            help="Send audio incrementally as the LLM streams text."
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
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-amber-800">
          <CheckCircle2 size={11} /> Synthesis configured.
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
        Output: <span className="font-mono text-amber-700">audio_url · spoken</span>
      </div>
    </div>
  );
}
