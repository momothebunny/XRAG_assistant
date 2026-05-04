/**
 * ImageUploadSettingsPanel — violet-themed image input source node.
 *
 * Backend contract (`source-image-upload` in `nodes.py::_exec_image_upload`):
 *   { mode, acceptedFormats, maxFileSizeMb, role, autoResize, extractText,
 *     generateCaption }
 * Inputs: none. Outputs: documents[], images[].
 */

import { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  ImageIcon,
  Settings,
  Upload,
  Zap,
} from 'lucide-react';

const MODES = [
  { value: 'upload',         label: 'File upload' },
  { value: 'url',            label: 'Image URL' },
  { value: 'base64',         label: 'Base64' },
  { value: 'knowledge-base', label: 'Knowledge base' },
];
const ROLES = [
  { value: 'query-image',    label: 'Query image' },
  { value: 'document-image', label: 'Document image' },
  { value: 'chart-image',    label: 'Chart / diagram' },
];

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-200/50';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</label>
    {help && (
      <span title={help} className="cursor-help text-slate-300 hover:text-violet-500">
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
        ? 'border-violet-300 bg-violet-50 text-violet-800 shadow-sm shadow-violet-200/40'
        : 'border-slate-200 bg-white text-slate-500 hover:border-violet-200 hover:text-violet-700'
    }`}
  >
    <span aria-hidden className={`inline-block h-2 w-2 rounded-full transition ${checked ? 'bg-violet-500' : 'bg-slate-300'}`} />
    {label}
  </button>
);

function StatPill({ label, hint, ok = true, Icon }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-[10px] ${ok ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-slate-200 bg-white text-slate-500'}`}>
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
    mode:            String(value?.mode ?? 'upload'),
    acceptedFormats: String(value?.acceptedFormats ?? 'image/png,image/jpeg,image/webp,image/gif'),
    maxFileSizeMb:   Math.max(0.1, Math.min(50, Number(value?.maxFileSizeMb ?? 10))),
    role:            String(value?.role ?? 'query-image'),
    autoResize:      Boolean(value?.autoResize ?? true),
    extractText:     Boolean(value?.extractText ?? false),
    generateCaption: Boolean(value?.generateCaption ?? false),
  };
}

export default function ImageUploadSettingsPanel({ value = {}, onChange }) {
  const setField = (k, v) => onChange?.(k, v);
  const payload = useMemo(() => buildPayload(value), [value]);
  const activeMode = MODES.find((m) => m.value === payload.mode) ?? MODES[0];
  const activeRole = ROLES.find((r) => r.value === payload.role) ?? ROLES[0];

  const warnings = [];
  if (payload.maxFileSizeMb > 20) warnings.push('Large image uploads may exceed Vision LLM payload limits.');
  if (!payload.acceptedFormats.trim()) warnings.push('Accepted formats list is empty — uploads will be rejected.');

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-300 via-violet-400 to-purple-300" />
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 text-violet-600 ring-1 ring-violet-200/60">
            <ImageIcon size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-800">Image Upload</p>
            <p className="truncate font-mono text-[10.5px] text-slate-500">
              <span className="text-violet-700">{activeMode.label}</span> · {activeRole.label}
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-violet-700">{payload.maxFileSizeMb} MB</span>
            <span className="font-mono text-[10px] text-slate-500">{payload.autoResize ? 'auto-fit' : 'native'}</span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-500">
          Accepts images for vision-augmented RAG. Pair with a Vision LLM for VQA or with
          OCR + caption to convert images into searchable text chunks.
        </p>
      </div>

      <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-3">
        <div className="flex items-start gap-2">
          <Settings size={14} className="text-violet-700" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-800">Source summary</p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <StatPill label="Mode" ok hint={activeMode.label}              Icon={Upload} />
              <StatPill label="Role" ok hint={activeRole.label}              Icon={ImageIcon} />
              <StatPill label="Max"  ok hint={`${payload.maxFileSizeMb} MB`} Icon={Settings} />
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <ImageIcon size={12} className="text-violet-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Image source</h4>
        </header>
        <div>
          <FieldLabel title="Input mode" />
          <select value={payload.mode} onChange={(e) => setField('mode', e.target.value)} className={inputClass}>
            {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel title="Accepted formats" help="Comma-separated MIME types." />
          <input
            type="text"
            value={payload.acceptedFormats}
            onChange={(e) => setField('acceptedFormats', e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <FieldLabel title="Max file size (MB)" />
          <input
            type="number"
            min={0.1}
            max={50}
            step={0.5}
            value={payload.maxFileSizeMb}
            onChange={(e) => setField('maxFileSizeMb', Number(e.target.value))}
            className={inputClass}
          />
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Upload size={12} className="text-violet-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Processing</h4>
        </header>
        <div>
          <FieldLabel title="Image role" />
          <select value={payload.role} onChange={(e) => setField('role', e.target.value)} className={inputClass}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip checked={payload.autoResize}      onChange={(v) => setField('autoResize', v)}      label="Auto-resize to 2048²" />
          <ToggleChip checked={payload.extractText}     onChange={(v) => setField('extractText', v)}     label="OCR extract text" />
          <ToggleChip checked={payload.generateCaption} onChange={(v) => setField('generateCaption', v)} label="Generate caption" />
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
        <div className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-violet-800">
          <CheckCircle2 size={11} /> Image source configured.
        </div>
      )}

      <details className="rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-violet-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <Zap size={11} className="text-violet-400" />
        Output: <span className="font-mono text-violet-700">documents[] · images[]</span>
      </div>
    </div>
  );
}
