/**
 * UrlScraperSettingsPanel — configures the web-crawler input node.
 *
 * CONNECTION CONTRACT (CANONICAL_PIPELINE_RANK = 1)
 *   • Inputs: none — source node providing web content.
 *   • Outputs: `documents` list consumed by Chunking / Cleaning nodes.
 */

import { Globe, Link2, CircleHelp } from 'lucide-react';

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

export default function UrlScraperSettingsPanel({ value = {}, onChange }) {
  const set = (key, val) => onChange?.({ ...value, [key]: val });

  return (
    <div className="space-y-3">
      <Section icon={Globe} title="Target URL">
        <FieldLabel title="Entry URL" help="The starting URL for the crawler" />
        <input
          type="url"
          value={value.url ?? ''}
          placeholder="https://example.com/docs"
          onChange={(e) => set('url', e.target.value)}
          className={inputClass}
        />
      </Section>

      <Section icon={Link2} title="Crawl Settings">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel title="Depth" help="How many link levels deep to crawl" />
            <input
              type="number"
              min={1}
              max={10}
              value={value.depth ?? 2}
              onChange={(e) => set('depth', Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel title="Max Pages" help="Hard cap on total pages fetched" />
            <input
              type="number"
              min={1}
              max={500}
              value={value.maxPages ?? 20}
              onChange={(e) => set('maxPages', Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>

        <FieldLabel title="CSS Selector (content)" help="Limit extraction to matching elements (e.g. article, .main-content)" />
        <input
          type="text"
          value={value.contentSelector ?? ''}
          placeholder="article, .content, main"
          onChange={(e) => set('contentSelector', e.target.value)}
          className={inputClass}
        />

        <FieldLabel title="URL Include Pattern" help="Regex — only follow URLs matching this pattern" />
        <input
          type="text"
          value={value.includePattern ?? ''}
          placeholder="^https://example\.com/docs/"
          onChange={(e) => set('includePattern', e.target.value)}
          className={inputClass}
        />

        <FieldLabel title="URL Exclude Pattern" help="Regex — skip URLs matching this pattern" />
        <input
          type="text"
          value={value.excludePattern ?? ''}
          placeholder=".*\\.(png|jpg|pdf)$"
          onChange={(e) => set('excludePattern', e.target.value)}
          className={inputClass}
        />
      </Section>

      <Section icon={Globe} title="Options">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.followExternalLinks)}
            onChange={(e) => set('followExternalLinks', e.target.checked)}
            className="h-3.5 w-3.5 accent-sky-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Follow external links</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.renderJs ?? false)}
            onChange={(e) => set('renderJs', e.target.checked)}
            className="h-3.5 w-3.5 accent-sky-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Render JavaScript (headless)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.ignoreRobotsTxt ?? false)}
            onChange={(e) => set('ignoreRobotsTxt', e.target.checked)}
            className="h-3.5 w-3.5 accent-sky-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Ignore robots.txt</span>
        </label>
      </Section>
    </div>
  );
}
