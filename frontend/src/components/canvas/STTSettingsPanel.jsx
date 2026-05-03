/**
 * STTSettingsPanel — Speech-to-Text transcription node.
 *
 * CONNECTION CONTRACT
 *   • Inputs: `audio` (file reference or URL).
 *   • Outputs: `text` (transcript), consumed by Question / Query Rewriter.
 */

import { Mic, Globe, CircleHelp } from 'lucide-react';

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

const MODELS = [
  { value: 'whisper-large-v3', label: 'Whisper large-v3 (OpenAI)' },
  { value: 'whisper-1', label: 'Whisper-1 (OpenAI)' },
  { value: 'nova-2', label: 'Nova-2 (Deepgram)' },
  { value: 'nova', label: 'Nova (Deepgram)' },
  { value: 'assemblyai/best', label: 'AssemblyAI Best' },
  { value: 'assemblyai/nano', label: 'AssemblyAI Nano (fast)' },
];

export default function STTSettingsPanel({ value = {}, onChange }) {
  const set = (key, val) => onChange?.({ ...value, [key]: val });

  return (
    <div className="space-y-3">
      <Section icon={Mic} title="Transcription Model">
        <FieldLabel title="Model" />
        <select
          value={value.model ?? 'whisper-large-v3'}
          onChange={(e) => set('model', e.target.value)}
          className={inputClass}
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </Section>

      <Section icon={Globe} title="Language & Format">
        <FieldLabel title="Language" help="ISO 639-1 code, or 'auto' for auto-detection" />
        <input
          type="text"
          value={value.language ?? 'auto'}
          placeholder="auto, en, hu, de, fr, …"
          onChange={(e) => set('language', e.target.value)}
          className={inputClass}
        />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.punctuate ?? true)}
            onChange={(e) => set('punctuate', e.target.checked)}
            className="h-3.5 w-3.5 accent-violet-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Add punctuation</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.timestamps ?? false)}
            onChange={(e) => set('timestamps', e.target.checked)}
            className="h-3.5 w-3.5 accent-violet-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Include word timestamps</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.diarize ?? false)}
            onChange={(e) => set('diarize', e.target.checked)}
            className="h-3.5 w-3.5 accent-violet-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Speaker diarization</span>
        </label>
      </Section>
    </div>
  );
}
