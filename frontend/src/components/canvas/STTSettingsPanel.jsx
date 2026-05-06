/**
 * STTSettingsPanel  amber-themed Speech-to-Text inspector.
 *
 * Backend contract (`source-stt` in `nodes.py::_exec_stt`):
 *   { model, language, punctuate, timestamps, diarize }
 * Inputs: audio. Outputs: text (transcript).
 */

import { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Globe,
  Mic,
  Settings,
  Zap,
} from 'lucide-react';

const MODELS = [
  { value: 'whisper-large-v3',  label: 'Whisper large-v3' },
  { value: 'whisper-1',         label: 'Whisper-1' },
  { value: 'nova-2',            label: 'Deepgram Nova-2' },
  { value: 'nova',              label: 'Deepgram Nova' },
  { value: 'assemblyai/best',   label: 'AssemblyAI Best' },
  { value: 'assemblyai/nano',   label: 'AssemblyAI Nano' },
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

const ToggleChip = ({ checked, onChange, label, help }) => (
  <button
    type="button"
    title={help}
    aria-pressed={Boolean(checked)}
    onClick={() => onChange?.(!checked)}
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

function buildPayload(value) {
  return {
    model:      String(value?.model ?? 'whisper-large-v3'),
    language:   String(value?.language ?? 'auto'),
    punctuate:  Boolean(value?.punctuate ?? true),
    timestamps: Boolean(value?.timestamps ?? false),
    diarize:    Boolean(value?.diarize ?? false),
  };
}

export default function STTSettingsPanel({ value = {}, onChange }) {
  const setField = (k, v) => onChange?.(k, v);
  const payload = useMemo(() => buildPayload(value), [value]);
  const activeModel = MODELS.find((m) => m.value === payload.model) ?? MODELS[0];

  const warnings = [];
  if (payload.diarize && !payload.timestamps) warnings.push('Diarisation usually pairs with word timestamps.');

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-800/50 to-amber-900/70 text-amber-200 ring-1 ring-amber-600/30">
            <Mic size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-100">Speech-to-Text</p>
            <p className="truncate font-mono text-[10.5px] text-slate-400">
              <span className="text-amber-400">{activeModel.label}</span>  {payload.language}
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-amber-400">audio  text</span>
            <span className="font-mono text-[10px] text-slate-400">{payload.timestamps ? 'ts' : 'plain'}</span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-400">
          Transcribes incoming audio. Set language to <span className="font-mono text-slate-200">auto</span>{' '}
          to detect, or to ISO codes like <span className="font-mono text-slate-200">en</span>,{' '}
          <span className="font-mono text-slate-200">hu</span>.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-700/40 bg-amber-900/20 p-3">
        <div className="flex items-start gap-2">
          <Settings size={14} className="text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">Capture summary</p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <StatPill label="Model"      ok hint={activeModel.label.split(' ')[0]} Icon={Mic} />
              <StatPill label="Language"   ok hint={payload.language}                Icon={Globe} />
              <StatPill label="Punct"      ok={payload.punctuate} hint={payload.punctuate ? 'on' : 'off'} Icon={Settings} />
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Mic size={12} className="text-amber-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Transcription model</h4>
        </header>
        <select
          value={payload.model}
          onChange={(e) => setField('model', e.target.value)}
          className={inputClass}
        >
          {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Globe size={12} className="text-amber-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Language &amp; format</h4>
        </header>
        <div>
          <FieldLabel title="Language" help="ISO 639-1 code or 'auto'." />
          <input
            type="text"
            value={payload.language}
            placeholder="auto"
            onChange={(e) => setField('language', e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip checked={payload.punctuate}  onChange={(v) => setField('punctuate', v)}  label="Add punctuation" />
          <ToggleChip checked={payload.timestamps} onChange={(v) => setField('timestamps', v)} label="Word timestamps" />
          <ToggleChip checked={payload.diarize}    onChange={(v) => setField('diarize', v)}    label="Speaker diarisation" />
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
          <CheckCircle2 size={11} /> Transcription configured.
        </div>
      )}

      <details className="rounded-2xl border border-slate-700/50 bg-slate-800/40/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-amber-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <Zap size={11} className="text-amber-400" />
        Output: <span className="font-mono text-amber-400">transcript text</span>
      </div>
    </div>
  );
}
