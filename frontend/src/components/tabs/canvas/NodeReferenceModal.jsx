import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Copy, Check, BookOpen, ArrowRight, Layout, Link2, Code as CodeIcon } from 'lucide-react';
import { templateByKey, RAG_BLUEPRINTS } from './canvasConfig';
import { paletteFromColorClass } from './nodeTypes';
import CustomNodeSettingsPanel from './CustomNodeSettingsPanel';

// Map Tailwind palette class → semantic color token (matches CustomNodeEditor swatches)
const COLORCLASS_TO_TOKEN = (cc = '') => {
  const m = cc.match(/bg-(amber|sky|cyan|emerald|violet|fuchsia|rose|indigo|slate)-\d+/);
  return m ? m[1] : 'indigo';
};

// Reverse-map an icon component to its name string (for serialization)
const iconName = (IconComponent) =>
  IconComponent?.displayName || IconComponent?.name || 'Wand2';

// Walk built-in blueprints to suggest typical neighbours of a given template.
const deriveDependencies = (templateKey) => {
  const predecessors = new Set();
  const successors = new Set();
  RAG_BLUEPRINTS.forEach((bp) => {
    const keys = bp.templateKeys || [];
    keys.forEach((k, idx) => {
      if (k !== templateKey) return;
      if (idx > 0) predecessors.add(keys[idx - 1]);
      if (idx < keys.length - 1) successors.add(keys[idx + 1]);
    });
  });
  return {
    predecessors: Array.from(predecessors),
    successors: Array.from(successors),
  };
};

// Infer a config_schema-like fields list from a raw config object.
const inferType = (v) => {
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return Number.isInteger(v) ? 'number' : 'number';
  if (Array.isArray(v)) return 'json';
  if (v && typeof v === 'object') return 'json';
  if (typeof v === 'string' && v.length > 60) return 'textarea';
  return 'text';
};

const humanize = (key) =>
  String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const inferConfigSchema = (config) => {
  const fields = Object.entries(config || {}).map(([key, v]) => ({
    key,
    label: humanize(key),
    type: inferType(v),
    default: v,
    group: 'General',
  }));
  return { fields };
};

const buildPythonSkeleton = (template) => {
  const config = template.config || {};
  const configKeys = Object.keys(config);
  const lines = [
    `# Inspired by built-in node: "${template.label}" (${template.category})`,
    `# ${template.description || ''}`,
    '',
    'def run(inputs, config, log):',
    `    """${template.label} — replicate / adapt the behaviour."""`,
    `    text = str(inputs.get("text", ""))`,
    `    log(f"processing {len(text)} chars with {template.label}")`,
    '',
    '    # Available config keys (with defaults from the built-in template):',
  ];
  if (configKeys.length === 0) {
    lines.push('    # (no config — pure transform)');
  } else {
    configKeys.slice(0, 12).forEach((k) => {
      const v = config[k];
      const repr = typeof v === 'string' ? `"${v}"` : JSON.stringify(v);
      lines.push(`    ${k} = config.get("${k}", ${repr})`);
    });
    if (configKeys.length > 12) {
      lines.push(`    # …${configKeys.length - 12} more`);
    }
  }
  lines.push('');
  lines.push('    # TODO: implement your logic here');
  lines.push('    return {"text": text}');
  return lines.join('\n');
};

// ─── Small read-only chip group used by the Dependencies section ───────────
function ChipGroup({ keys, emptyMessage }) {
  if (!keys || keys.length === 0) {
    return (
      <p className="text-[10px] italic text-slate-400 py-1.5">{emptyMessage}</p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {keys.map((k) => {
        const t = templateByKey[k];
        const pal = t ? paletteFromColorClass(t.colorClass) : null;
        const Icon = t?.icon;
        return (
          <span
            key={k}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-700"
            title={k}
          >
            {Icon && pal && (
              <span
                className="inline-flex items-center justify-center rounded"
                style={{ width: 14, height: 14, background: `linear-gradient(140deg, ${pal.accent2} 0%, ${pal.accent} 100%)` }}
              >
                <Icon size={8} className="text-white" />
              </span>
            )}
            {t?.label || k}
          </span>
        );
      })}
    </div>
  );
}

// ─── Section header with Visual / Code toggle ──────────────────────────────
function SectionToggle({ label, icon: Icon, mode, onMode, modes = ['visual', 'code'] }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
        {Icon && <Icon size={11} />} {label}
      </h4>
      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onMode(m)}
            className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded ${
              mode === m ? 'bg-indigo-500 text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function NodeReferenceModal({ open, onClose, onUseAsTemplate }) {
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);
  const [copied, setCopied] = useState(false);
  const [depMode, setDepMode] = useState('visual');
  const [uiMode, setUiMode] = useState('visual');

  const items = useMemo(() => {
    const all = Object.values(templateByKey).filter((t) => !t.isCustom);
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((t) =>
      [t.label, t.description, t.category, t.key].some((s) =>
        String(s || '').toLowerCase().includes(q)
      )
    );
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map();
    items.forEach((t) => {
      const cat = t.category || 'Other';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(t);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const selected = selectedKey ? templateByKey[selectedKey] : null;
  const skeleton = selected ? buildPythonSkeleton(selected) : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(skeleton);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2147483001] flex items-center justify-center bg-slate-900/70 p-6 xrag-modal-overlay-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl max-h-[90vh] flex flex-col rounded-3xl bg-white shadow-2xl border border-indigo-200 overflow-hidden xrag-modal-card-zoom-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 bg-gradient-to-br from-indigo-50 via-sky-50 to-indigo-100 border-b border-indigo-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/40">
              <BookOpen size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800">Built-in Node Reference</h2>
              <p className="text-[11px] text-indigo-700 font-black uppercase tracking-widest">
                Inspect • Learn • Reuse
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl text-slate-500 hover:bg-white/70">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 grid grid-cols-12 overflow-hidden">
          {/* Left: list */}
          <div className="col-span-12 md:col-span-4 border-r border-slate-200 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-slate-200">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search built-in nodes…"
                  className="w-full rounded-xl border border-slate-300 bg-white pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-3">
              {grouped.map(([cat, list]) => (
                <div key={cat}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2 py-1">{cat}</p>
                  <div className="space-y-1">
                    {list.map((t) => {
                      const Icon = t.icon;
                      const pal = paletteFromColorClass(t.colorClass);
                      const active = selectedKey === t.key;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setSelectedKey(t.key)}
                          className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all ${
                            active ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div
                            className="shrink-0 flex items-center justify-center rounded-lg"
                            style={{
                              width: 28, height: 28,
                              background: `linear-gradient(140deg, ${pal.accent2} 0%, ${pal.accent} 100%)`,
                            }}
                          >
                            {Icon && <Icon size={13} className="text-white" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-black text-slate-800 truncate">{t.label}</p>
                            <p className="text-[10px] text-slate-500 truncate">{t.key}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {grouped.length === 0 && (
                <p className="text-center text-[11px] text-slate-400 py-6">No matches.</p>
              )}
            </div>
          </div>

          {/* Right: details */}
          <div className="col-span-12 md:col-span-8 overflow-y-auto bg-slate-50">
            {!selected && (
              <div className="h-full flex items-center justify-center text-center p-8">
                <div>
                  <BookOpen size={28} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-black text-slate-600">Pick a node from the list</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    See its full template, default config, and a Python skeleton you can adapt.
                  </p>
                </div>
              </div>
            )}

            {selected && (() => {
              const Icon = selected.icon;
              const pal = paletteFromColorClass(selected.colorClass);
              const colorToken = COLORCLASS_TO_TOKEN(selected.colorClass);
              return (
                <div className="p-6 space-y-5">
                  {/* Title strip */}
                  <div className="flex items-start gap-4">
                    <div
                      className="shrink-0 flex items-center justify-center rounded-2xl"
                      style={{
                        width: 52, height: 52,
                        background: `linear-gradient(140deg, ${pal.accent2} 0%, ${pal.accent} 100%)`,
                        boxShadow: `0 4px 14px ${pal.accent}50`,
                      }}
                    >
                      {Icon && <Icon size={22} className="text-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-black text-slate-800">{selected.label}</h3>
                      <p className="text-sm text-slate-600 leading-snug">{selected.description}</p>
                      <div className="flex items-center flex-wrap gap-2 mt-2">
                        <span className="rounded-full bg-indigo-100 text-indigo-700 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest">
                          {selected.category}
                        </span>
                        <span className="rounded-full bg-slate-100 text-slate-600 px-2.5 py-0.5 text-[10px] font-mono">
                          {selected.key}
                        </span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest bg-${colorToken}-100 text-${colorToken}-700`}>
                          {colorToken}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Dependencies — typical predecessors / successors derived from blueprints */}
                  {(() => {
                    const deps = deriveDependencies(selected.key);
                    return (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                        <SectionToggle
                          label="Dependencies (derived from built-in blueprints)"
                          icon={Link2}
                          mode={depMode}
                          onMode={setDepMode}
                        />
                        {depMode === 'visual' ? (
                          <div className="space-y-2">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                                Typical upstream
                              </p>
                              <ChipGroup
                                keys={deps.predecessors}
                                emptyMessage="No usual upstream — this node is often a starting point."
                              />
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                                Typical downstream
                              </p>
                              <ChipGroup
                                keys={deps.successors}
                                emptyMessage="No usual downstream — this node is often a terminal."
                              />
                            </div>
                          </div>
                        ) : (
                          <pre className="rounded-lg bg-slate-900 text-emerald-200 font-mono text-[11px] px-3 py-2 overflow-x-auto max-h-44">
                            {JSON.stringify(
                              { accepts_from: deps.predecessors, accepts_to: deps.successors },
                              null,
                              2
                            )}
                          </pre>
                        )}
                      </div>
                    );
                  })()}

                  {/* Settings UI — visual rendering of the inferred config form, or raw JSON */}
                  {(() => {
                    const inferred = inferConfigSchema(selected.config || {});
                    const previewTemplate = { customNode: { config_schema: inferred } };
                    return (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                        <SectionToggle
                          label="Settings UI (inferred from defaults)"
                          icon={Layout}
                          mode={uiMode}
                          onMode={setUiMode}
                        />
                        {uiMode === 'visual' ? (
                          inferred.fields.length === 0 ? (
                            <p className="text-[10px] italic text-slate-400 py-2 text-center">
                              No settings — pure transform node.
                            </p>
                          ) : (
                            <div className="rounded-lg bg-slate-50 p-2 max-h-72 overflow-y-auto">
                              <CustomNodeSettingsPanel
                                template={previewTemplate}
                                value={selected.config || {}}
                                onChange={() => {/* read-only preview */}}
                              />
                            </div>
                          )
                        ) : (
                          <pre className="rounded-lg bg-slate-900 text-emerald-200 font-mono text-[11px] px-3 py-2 overflow-x-auto max-h-72">
                            {JSON.stringify(
                              { config_schema: inferred, default_config: selected.config || {} },
                              null,
                              2
                            )}
                          </pre>
                        )}
                      </div>
                    );
                  })()}

                  {/* Skeleton */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                        <CodeIcon size={11} /> Python skeleton — adapt for your custom node
                      </h4>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-300 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100"
                      >
                        {copied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <pre className="rounded-lg bg-slate-900 text-amber-100 font-mono text-[11px] px-4 py-3 overflow-x-auto max-h-72">
                      {skeleton}
                    </pre>
                  </div>

                  {/* Use as starting point */}
                  {onUseAsTemplate && (() => {
                    const inferred = inferConfigSchema(selected.config || {});
                    const deps = deriveDependencies(selected.key);
                    return (
                      <div className="flex items-center justify-end pt-2">
                        <button
                          type="button"
                          onClick={() =>
                            onUseAsTemplate({
                              name: selected.label,
                              description: selected.description,
                              category: selected.category,
                              color: colorToken,
                              icon: iconName(Icon),
                              inputs: ['text'],
                              outputs: ['text'],
                              code: skeleton,
                              config_schema: inferred,
                              default_config: selected.config || {},
                              accepts_from: deps.predecessors,
                              accepts_to: deps.successors,
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 text-white px-4 py-2 text-[11px] font-black uppercase tracking-widest shadow-md shadow-indigo-500/40 hover:bg-indigo-700"
                        >
                          Use as starting point <ArrowRight size={12} />
                        </button>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
