/**
 * TTSSettingsPanel — Text-to-Speech synthesis node.
 *
 * CONNECTION CONTRACT
 *   • Inputs: `text` / `answer` from LLM or Response node.
 *   • Outputs: `audio_url`, `spoken` (text echoed).
 */

import { Volume2, Mic, CircleHelp } from 'lucide-react';

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

const Section = ({ icon: Icon, title, children }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
    <div className="flex items-center gap-1.5">
      <Icon size={13} className="text-violet-500 shrink-0" />
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">{title}</span>
    </div>
    {children}
  </div>
);

const PROVIDERS = [
  { value: 'openai-tts', label: 'OpenAI TTS' },
  { value: 'elevenlabs', label: 'ElevenLabs' },
  { value: 'azure-cognitive', label: 'Azure Cognitive Speech' },
  { value: 'google-tts', label: 'Google Cloud TTS' },
  { value: 'coqui', label: 'Coqui (self-hosted)' },
];

const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
const FORMATS = ['mp3', 'opus', 'aac', 'flac', 'wav'];

export default function TTSSettingsPanel({ value = {}, onChange }) {
  const set = (key, val) => onChange?.({ ...value, [key]: val });

  return (
    <div className="space-y-3">
      <Section icon={Volume2} title="Provider">
        <FieldLabel title="TTS Provider" />
        <select
          value={value.provider ?? 'openai-tts'}
          onChange={(e) => set('provider', e.target.value)}
          className={inputClass}
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </Section>

      <Section icon={Mic} title="Voice & Quality">
        <FieldLabel title="Voice" help="Voice ID or preset name for the selected provider" />
        {value.provider === 'openai-tts' || !value.provider ? (
          <select
            value={value.voice ?? 'alloy'}
            onChange={(e) => set('voice', e.target.value)}
            className={inputClass}
          >
            {OPENAI_VOICES.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={value.voice ?? ''}
            placeholder="Voice ID for selected provider"
            onChange={(e) => set('voice', e.target.value)}
            className={inputClass}
          />
        )}

        <FieldLabel title="Output format" />
        <select
          value={value.format ?? 'mp3'}
          onChange={(e) => set('format', e.target.value)}
          className={inputClass}
        >
          {FORMATS.map((f) => (
            <option key={f} value={f}>{f.toUpperCase()}</option>
          ))}
        </select>

        <FieldLabel title="Speed" help="Playback speed multiplier (0.25–4.0)" />
        <input
          type="number"
          min={0.25}
          max={4}
          step={0.05}
          value={value.speed ?? 1.0}
          onChange={(e) => set('speed', Number(e.target.value))}
          className={inputClass}
        />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.streamOutput ?? false)}
            onChange={(e) => set('streamOutput', e.target.checked)}
            className="h-3.5 w-3.5 accent-violet-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Stream audio output</span>
        </label>
      </Section>
    </div>
  );
}
