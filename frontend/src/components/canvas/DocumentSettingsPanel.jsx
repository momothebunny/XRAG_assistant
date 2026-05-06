/**
 * DocumentSettingsPanel  violet-themed document pre-processing source node.
 *
 * Backend contract (`source-document` in `nodes.py::_exec_document`):
 *   { remove_headers_footers, normalize_whitespace, ocr_enabled, ocr_dpi,
 *     page_range, image_handling, auto_tagging, source_label }
 * Inputs: none. Outputs: documents[].
 */

import { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  FileText,
  Image as ImageIcon,
  ScanLine,
  Settings,
  Tag,
  Zap,
} from 'lucide-react';

const inputClass =
  'w-full rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-xs text-slate-200 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-200/50';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{title}</label>
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
        ? 'border-violet-300 bg-violet-900/20 text-violet-300 shadow-sm shadow-violet-200/40'
        : 'border-slate-700/50 bg-[#0d1117] text-slate-400 hover:border-violet-700/40 hover:text-violet-400'
    }`}
  >
    <span aria-hidden className={`inline-block h-2 w-2 rounded-full transition ${checked ? 'bg-violet-500' : 'bg-slate-300'}`} />
    {label}
  </button>
);

function StatPill({ label, hint, ok = true, Icon }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-[10px] ${ok ? 'border-violet-700/40 bg-violet-900/20 text-violet-300' : 'border-slate-700/50 bg-[#0d1117] text-slate-400'}`}>
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
    remove_headers_footers: Boolean(value?.remove_headers_footers ?? true),
    normalize_whitespace:   Boolean(value?.normalize_whitespace ?? true),
    ocr_enabled:            Boolean(value?.ocr_enabled ?? false),
    ocr_dpi:                Math.max(150, Math.min(600, Number(value?.ocr_dpi ?? 300))),
    page_range:             String(value?.page_range ?? ''),
    image_handling:         String(value?.image_handling ?? 'ignore').toLowerCase(),
    auto_tagging:           Boolean(value?.auto_tagging ?? false),
    source_label:           String(value?.source_label ?? ''),
  };
}

const DocumentSettingsPanel = ({ value = {}, onChange }) => {
  const setField = (k, v) => onChange?.(k, v);
  const payload = useMemo(() => buildPayload(value), [value]);

  const preCount =
    Number(payload.remove_headers_footers) +
    Number(payload.normalize_whitespace) +
    Number(payload.ocr_enabled);

  const warnings = [];
  if (payload.ocr_enabled && payload.ocr_dpi >= 500) warnings.push('Very high OCR DPI  processing will be slow and costly.');
  if (payload.image_handling === 'extract' && !payload.ocr_enabled) warnings.push('Image extraction without OCR may produce empty chunks.');
  if (payload.page_range && !/^\s*(\d+(\s*-\s*\d+)?)(\s*,\s*\d+(\s*-\s*\d+)?)*\s*$/.test(payload.page_range)) {
    warnings.push('Page range syntax looks invalid (use e.g. "1-10, 15").');
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-800/50 to-violet-900/70 text-violet-200 ring-1 ring-violet-600/30">
            <FileText size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-100">Document Source</p>
            <p className="truncate font-mono text-[10.5px] text-slate-400">
              <span className="text-violet-400">{payload.ocr_enabled ? 'OCR on' : 'native'}</span>  {preCount}/3 pre-steps
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-violet-400">{payload.image_handling}</span>
            <span className="font-mono text-[10px] text-slate-400">{payload.page_range || 'all pages'}</span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-400">
          Cleans and normalises uploaded documents before chunking. Optional OCR for
          scanned PDFs; auto-tagging enriches retrievable metadata.
        </p>
      </div>

      <div className="rounded-2xl border border-violet-700/40 bg-violet-900/20 p-3">
        <div className="flex items-start gap-2">
          <Settings size={14} className="text-violet-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-300">Pipeline summary</p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <StatPill label="Pre-steps" ok hint={`${preCount}/3`}                                   Icon={Settings} />
              <StatPill label="OCR"       ok={payload.ocr_enabled} hint={payload.ocr_enabled ? `${payload.ocr_dpi} dpi` : 'off'} Icon={ScanLine} />
              <StatPill label="Images"    ok hint={payload.image_handling}                            Icon={ImageIcon} />
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Settings size={12} className="text-violet-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Pre-processing</h4>
        </header>
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip
            checked={payload.remove_headers_footers}
            onChange={(v) => setField('remove_headers_footers', v)}
            label="Strip headers/footers"
            help="Removes repeating header/footer noise that would otherwise pollute retrieval."
          />
          <ToggleChip
            checked={payload.normalize_whitespace}
            onChange={(v) => setField('normalize_whitespace', v)}
            label="Normalize whitespace"
            help="Yields stabler chunk boundaries and embedding quality."
          />
          <ToggleChip
            checked={payload.ocr_enabled}
            onChange={(v) => setField('ocr_enabled', v)}
            label="OCR scanned pages"
            help="Generates a text layer for scanned PDFs."
          />
        </div>
        <div>
          <FieldLabel title="OCR DPI" help="Higher DPI improves accuracy but increases latency and cost." />
          <input
            type="number"
            min={150}
            max={600}
            step={50}
            value={payload.ocr_dpi}
            onChange={(e) => setField('ocr_dpi', Number(e.target.value || 300))}
            className={inputClass}
            disabled={!payload.ocr_enabled}
          />
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <ScanLine size={12} className="text-violet-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Extraction strategy</h4>
        </header>
        <div>
          <FieldLabel title="Page range" help="Limit processing to specific pages, e.g. 1-10, 15." />
          <input
            type="text"
            placeholder="1-10, 15"
            value={payload.page_range}
            onChange={(e) => setField('page_range', e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <FieldLabel title="Image handling" help="Skip images for speed, or extract them for richer multi-modal context." />
          <select
            value={payload.image_handling}
            onChange={(e) => setField('image_handling', e.target.value)}
            className={inputClass}
          >
            <option value="ignore">Ignore</option>
            <option value="extract">Extract</option>
          </select>
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Tag size={12} className="text-violet-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Metadata</h4>
        </header>
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip
            checked={payload.auto_tagging}
            onChange={(v) => setField('auto_tagging', v)}
            label="Auto-tag"
            help="Auto-tagging enables domain-scoped search and metadata-based reranking."
          />
        </div>
        <div>
          <FieldLabel title="Source label" help="Provenance tag  used for filtering, audit and reproducibility." />
          <input
            type="text"
            placeholder="knowledge_base"
            value={payload.source_label}
            onChange={(e) => setField('source_label', e.target.value)}
            className={inputClass}
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
        <div className="flex items-center gap-1.5 rounded-lg border border-violet-700/40 bg-violet-900/20 px-2.5 py-1.5 text-[10.5px] font-semibold text-violet-300">
          <CheckCircle2 size={11} /> Document pipeline configured.
        </div>
      )}

      <details className="rounded-2xl border border-slate-700/50 bg-slate-800/40/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-violet-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <Zap size={11} className="text-violet-400" />
        Output: <span className="font-mono text-violet-400">documents[]</span>
      </div>
    </div>
  );
};

export default DocumentSettingsPanel;
