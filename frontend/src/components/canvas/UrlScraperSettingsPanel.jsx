/**
 * UrlScraperSettingsPanel — violet-themed web crawler source node.
 *
 * Backend contract (`source-url-scraper` in `nodes.py::_exec_url_scraper`):
 *   { url, depth, maxPages, contentSelector, includePattern, excludePattern,
 *     followExternalLinks, renderJs, ignoreRobotsTxt }
 * Inputs: none. Outputs: documents[].
 */

import { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Filter,
  Globe,
  Link2,
  Settings,
  Zap,
} from 'lucide-react';

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
    url:                 String(value?.url ?? ''),
    depth:               Math.max(1, Math.min(10, Number(value?.depth ?? 2))),
    maxPages:            Math.max(1, Math.min(500, Number(value?.maxPages ?? 20))),
    contentSelector:     String(value?.contentSelector ?? ''),
    includePattern:      String(value?.includePattern ?? ''),
    excludePattern:      String(value?.excludePattern ?? ''),
    followExternalLinks: Boolean(value?.followExternalLinks ?? false),
    renderJs:            Boolean(value?.renderJs ?? false),
    ignoreRobotsTxt:     Boolean(value?.ignoreRobotsTxt ?? false),
  };
}

export default function UrlScraperSettingsPanel({ value = {}, onChange }) {
  const setField = (k, v) => onChange?.(k, v);
  const payload = useMemo(() => buildPayload(value), [value]);

  let host = '—';
  try { if (payload.url) host = new URL(payload.url).host; } catch { host = 'invalid'; }

  const warnings = [];
  if (!payload.url.trim()) warnings.push('Entry URL is empty.');
  if (host === 'invalid') warnings.push('Entry URL is malformed.');
  if (payload.ignoreRobotsTxt) warnings.push('Ignoring robots.txt may breach the site’s scraping policy.');
  if (payload.depth >= 5 && payload.maxPages > 100) warnings.push('Deep + wide crawl — consider a tighter URL filter.');

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-300 via-violet-400 to-purple-300" />
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 text-violet-600 ring-1 ring-violet-200/60">
            <Globe size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-800">URL Scraper</p>
            <p className="truncate font-mono text-[10.5px] text-slate-500">
              <span className="text-violet-700">{host}</span> · depth {payload.depth}
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-violet-700">{payload.maxPages} pages</span>
            <span className="font-mono text-[10px] text-slate-500">{payload.renderJs ? 'JS' : 'static'}</span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-500">
          Crawls a website starting at the entry URL, optionally rendering JavaScript and
          honouring robots.txt. Emits a list of documents downstream.
        </p>
      </div>

      <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-3">
        <div className="flex items-start gap-2">
          <Settings size={14} className="text-violet-700" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-800">Crawl summary</p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <StatPill label="Host"    ok={host !== 'invalid' && host !== '—'} hint={host}                Icon={Globe} />
              <StatPill label="Depth"   ok hint={String(payload.depth)}                                    Icon={Link2} />
              <StatPill label="Pages"   ok hint={String(payload.maxPages)}                                 Icon={Filter} />
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Globe size={12} className="text-violet-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Target</h4>
        </header>
        <FieldLabel title="Entry URL" />
        <input
          type="url"
          value={payload.url}
          placeholder="https://example.com/docs"
          onChange={(e) => setField('url', e.target.value)}
          className={inputClass}
        />
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Link2 size={12} className="text-violet-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Crawl scope</h4>
        </header>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel title="Depth" />
            <input
              type="number"
              min={1}
              max={10}
              value={payload.depth}
              onChange={(e) => setField('depth', Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel title="Max pages" />
            <input
              type="number"
              min={1}
              max={500}
              value={payload.maxPages}
              onChange={(e) => setField('maxPages', Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <FieldLabel title="CSS content selector" help="Limit extraction to matching elements." />
          <input
            type="text"
            value={payload.contentSelector}
            placeholder="article, .content, main"
            onChange={(e) => setField('contentSelector', e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <FieldLabel title="URL include regex" />
          <input
            type="text"
            value={payload.includePattern}
            placeholder="^https://example\.com/docs/"
            onChange={(e) => setField('includePattern', e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <FieldLabel title="URL exclude regex" />
          <input
            type="text"
            value={payload.excludePattern}
            placeholder=".*\\.(png|jpg|pdf)$"
            onChange={(e) => setField('excludePattern', e.target.value)}
            className={inputClass}
          />
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Settings size={12} className="text-violet-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Options</h4>
        </header>
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip checked={payload.followExternalLinks} onChange={(v) => setField('followExternalLinks', v)} label="Follow external links" />
          <ToggleChip checked={payload.renderJs}            onChange={(v) => setField('renderJs', v)}            label="Render JavaScript" />
          <ToggleChip checked={payload.ignoreRobotsTxt}     onChange={(v) => setField('ignoreRobotsTxt', v)}     label="Ignore robots.txt" />
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
          <CheckCircle2 size={11} /> Crawler configured.
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
        Output: <span className="font-mono text-violet-700">documents[]</span>
      </div>
    </div>
  );
}
