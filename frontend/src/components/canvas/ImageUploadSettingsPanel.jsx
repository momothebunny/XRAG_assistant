/**
 * ImageUploadSettingsPanel — image input node for vision-augmented RAG.
 *
 * CONNECTION CONTRACT (CANONICAL_PIPELINE_RANK = 1)
 *   • Inputs: none — source node for image data.
 *   • Outputs: `documents` (with image data), `images`, consumed by Vision LLM / Chunking.
 */

import { Image, Upload, CircleHelp } from 'lucide-react';

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-sky-400';

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
      <Icon size={13} className="text-sky-500 shrink-0" />
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">{title}</span>
    </div>
    {children}
  </div>
);

export default function ImageUploadSettingsPanel({ value = {}, onChange }) {
  const set = (key, val) => onChange?.({ ...value, [key]: val });

  return (
    <div className="space-y-3">
      <Section icon={Image} title="Image Source">
        <FieldLabel title="Input mode" help="How images are provided to this node" />
        <select
          value={value.mode ?? 'upload'}
          onChange={(e) => set('mode', e.target.value)}
          className={inputClass}
        >
          <option value="upload">File upload</option>
          <option value="url">Image URL</option>
          <option value="base64">Base64 encoded</option>
          <option value="knowledge-base">From Knowledge Base</option>
        </select>

        <FieldLabel title="Accepted formats" help="Comma-separated MIME types" />
        <input
          type="text"
          value={value.acceptedFormats ?? 'image/png,image/jpeg,image/webp,image/gif'}
          onChange={(e) => set('acceptedFormats', e.target.value)}
          className={inputClass}
        />

        <FieldLabel title="Max file size (MB)" />
        <input
          type="number"
          min={0.1}
          max={50}
          step={0.5}
          value={value.maxFileSizeMb ?? 10}
          onChange={(e) => set('maxFileSizeMb', Number(e.target.value))}
          className={inputClass}
        />
      </Section>

      <Section icon={Upload} title="Processing Options">
        <FieldLabel title="Image role" help="How the image will be used in the pipeline" />
        <select
          value={value.role ?? 'query-image'}
          onChange={(e) => set('role', e.target.value)}
          className={inputClass}
        >
          <option value="query-image">Query image (sent to Vision LLM with the question)</option>
          <option value="document-image">Document image (embedded for retrieval)</option>
          <option value="chart-image">Chart / diagram (OCR + description)</option>
        </select>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.autoResize ?? true)}
            onChange={(e) => set('autoResize', e.target.checked)}
            className="h-3.5 w-3.5 accent-sky-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Auto-resize to max 2048×2048</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.extractText ?? false)}
            onChange={(e) => set('extractText', e.target.checked)}
            className="h-3.5 w-3.5 accent-sky-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Extract embedded text (OCR)</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.generateCaption ?? false)}
            onChange={(e) => set('generateCaption', e.target.checked)}
            className="h-3.5 w-3.5 accent-sky-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Generate image caption</span>
        </label>
      </Section>
    </div>
  );
}
