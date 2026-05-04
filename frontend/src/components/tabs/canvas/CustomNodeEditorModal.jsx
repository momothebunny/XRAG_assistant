import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Wand2, Sparkles, Loader2, Save, Play, AlertTriangle, CheckCircle2, Code2,
  Bot, Brain, Zap, Layers, GitBranch, Filter, Search, Database, Network, Globe,
  Shield, Repeat, ScissorsLineDashed, ScrollText, FileInput, MessageSquare, Mic,
  Volume2, Eye, User, Image as ImageIcon, Lightbulb, BookOpen,
  Plus, Trash2, ChevronDown, ChevronUp, Settings2, Code as CodeIcon,
} from 'lucide-react';
import { xragApi } from '../../../services/xragApi';
import NodeReferenceModal from './NodeReferenceModal';

const ALLOWED_COLORS = [
  { key: 'amber',   bg: 'bg-amber-500',   ring: 'ring-amber-300' },
  { key: 'sky',     bg: 'bg-sky-500',     ring: 'ring-sky-300' },
  { key: 'cyan',    bg: 'bg-cyan-500',    ring: 'ring-cyan-300' },
  { key: 'emerald', bg: 'bg-emerald-500', ring: 'ring-emerald-300' },
  { key: 'violet',  bg: 'bg-violet-500',  ring: 'ring-violet-300' },
  { key: 'fuchsia', bg: 'bg-fuchsia-500', ring: 'ring-fuchsia-300' },
  { key: 'rose',    bg: 'bg-rose-500',    ring: 'ring-rose-300' },
  { key: 'indigo',  bg: 'bg-indigo-500',  ring: 'ring-indigo-300' },
  { key: 'slate',   bg: 'bg-slate-500',   ring: 'ring-slate-300' },
];

const ALLOWED_ICONS = {
  Wand2, Sparkles, Bot, Brain, Code2, Zap, Layers, GitBranch, Filter, Search,
  Database, Network, Globe, Shield, Repeat, ScissorsLineDashed, ScrollText,
  FileInput, MessageSquare, Mic, Volume2, Eye, User, Image: ImageIcon,
};

const CATEGORIES = ['Custom', 'Ingestion', 'Retrieval', 'Safety', 'Brain', 'Sources', 'Storage'];

const DEFAULT_CODE = `# Define a top-level run(inputs, config, log) function.
# Allowed modules (pre-imported): json, math, re, statistics, datetime,
#   collections, itertools, functools, hashlib, base64
# No imports, file I/O, network, eval/exec/open are allowed.

def run(inputs, config, log):
    text = str(inputs.get("text", ""))
    log(f"received {len(text)} chars")
    return {"text": text.upper()}
`;

const emptyDraft = () => ({
  id: '',
  name: '',
  description: '',
  category: 'Custom',
  color: 'indigo',
  icon: 'Wand2',
  code: DEFAULT_CODE,
  inputs: ['text'],
  outputs: ['text'],
  accepts_from: [],
  accepts_to: [],
  config_schema: { fields: [] },
  default_config: {},
});

// â”€â”€â”€ DependencyPicker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Visual chip selector + raw text/code mode for picking which template keys
// this custom node accepts as upstream / downstream connections.
const DEP_FIELD_TYPE_GROUPS = (options) => {
  const map = new Map();
  options.forEach((o) => {
    const cat = o.category || 'Other';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(o);
  });
  return Array.from(map.entries());
};

function DependencyPicker({ label, hint, value = [], onChange, options = [] }) {
  const [mode, setMode] = useState('visual'); // 'visual' | 'code'
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      [o.key, o.label, o.category].some((s) => String(s || '').toLowerCase().includes(q))
    );
  }, [filter, options]);

  const grouped = useMemo(() => DEP_FIELD_TYPE_GROUPS(filtered), [filtered]);

  const toggle = (key) => {
    if (value.includes(key)) onChange(value.filter((k) => k !== key));
    else onChange([...value, key]);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">{label}</label>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          <button
            type="button"
            onClick={() => setMode('visual')}
            className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded ${
              mode === 'visual' ? 'bg-amber-500 text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Visual
          </button>
          <button
            type="button"
            onClick={() => setMode('code')}
            className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded ${
              mode === 'code' ? 'bg-amber-500 text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Code
          </button>
        </div>
      </div>
      {hint && <p className="text-[9px] text-slate-400 italic leading-snug">{hint}</p>}

      {mode === 'visual' && (
        <div className="rounded-xl border border-slate-200 bg-white p-2 space-y-2">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search nodesâ€¦"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
          <div className="max-h-48 overflow-y-auto pr-1 space-y-1.5">
            {value.length > 0 && (
              <div className="flex flex-wrap gap-1 pb-1.5 border-b border-slate-100">
                {value.map((k) => {
                  const opt = options.find((o) => o.key === k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggle(k)}
                      className="inline-flex items-center gap-1 rounded-full bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider px-2 py-0.5 hover:bg-amber-600"
                      title={`Remove ${k}`}
                    >
                      {opt?.label || k}
                      <X size={9} />
                    </button>
                  );
                })}
              </div>
            )}
            {grouped.length === 0 && (
              <p className="text-center text-[10px] text-slate-400 py-2">No matches.</p>
            )}
            {grouped.map(([cat, list]) => (
              <div key={cat}>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-1 py-0.5">{cat}</p>
                <div className="flex flex-wrap gap-1">
                  {list.map((opt) => {
                    const on = value.includes(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => toggle(opt.key)}
                        className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border transition-colors ${
                          on
                            ? 'bg-amber-100 border-amber-400 text-amber-800'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                        title={opt.key}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-slate-400">{value.length === 0 ? 'No restriction â€” accepts any.' : `${value.length} selected`}</p>
        </div>
      )}

      {mode === 'code' && (
        <textarea
          value={JSON.stringify(value, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              if (Array.isArray(parsed)) onChange(parsed.filter((x) => typeof x === 'string'));
            } catch {
              /* ignore until valid */
            }
          }}
          spellCheck={false}
          rows={4}
          className="w-full rounded-xl border border-slate-300 bg-slate-900 text-emerald-200 font-mono text-[11px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      )}
    </div>
  );
}

// â”€â”€â”€ ConfigSchemaBuilder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Visual editor for the node's settings UI. Each field declares how a
// config key is rendered when the user selects this custom node on the
// canvas. Also supports a raw JSON mode for power users.
const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'number', label: 'Number' },
  { value: 'slider', label: 'Slider' },
  { value: 'boolean', label: 'Toggle' },
  { value: 'select', label: 'Select' },
  { value: 'multiselect', label: 'Multi-select' },
  { value: 'json', label: 'JSON' },
];

function ConfigSchemaBuilder({ schema, defaultConfig = {}, onChange }) {
  const [mode, setMode] = useState('visual');
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];

  const emit = (nextFields, nextDefaults) =>
    onChange({
      config_schema: { ...(schema || {}), fields: nextFields },
      default_config: nextDefaults ?? defaultConfig,
    });

  const addField = () => {
    const idx = fields.length + 1;
    const key = `field_${idx}`;
    const next = [
      ...fields,
      {
        key,
        label: `Field ${idx}`,
        type: 'text',
        default: '',
        description: '',
        group: 'General',
      },
    ];
    emit(next, { ...defaultConfig, [key]: '' });
  };

  const removeField = (i) => {
    const removed = fields[i];
    const next = fields.filter((_, j) => j !== i);
    const nextDefaults = { ...defaultConfig };
    if (removed?.key) delete nextDefaults[removed.key];
    emit(next, nextDefaults);
  };

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    emit(next);
  };

  const updateField = (i, patch) => {
    const prev = fields[i];
    const merged = { ...prev, ...patch };
    const next = fields.map((f, j) => (j === i ? merged : f));
    let nextDefaults = { ...defaultConfig };
    // Rename key in defaults if `key` changed
    if (patch.key && patch.key !== prev.key) {
      const oldVal = nextDefaults[prev.key];
      delete nextDefaults[prev.key];
      nextDefaults[patch.key] = oldVal !== undefined ? oldVal : (merged.default ?? '');
    }
    // Update default value for this field if changed
    if (Object.prototype.hasOwnProperty.call(patch, 'default')) {
      nextDefaults[merged.key] = patch.default;
    }
    emit(next, nextDefaults);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
          <Settings2 size={11} /> Settings UI (config schema)
        </label>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          <button
            type="button"
            onClick={() => setMode('visual')}
            className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded ${
              mode === 'visual' ? 'bg-amber-500 text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Visual
          </button>
          <button
            type="button"
            onClick={() => setMode('code')}
            className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded ${
              mode === 'code' ? 'bg-amber-500 text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Code
          </button>
        </div>
      </div>
      <p className="text-[9px] text-slate-400 italic leading-snug">
        Defines the form rendered when the user selects this node on the canvas. Same keys are passed to your <code className="font-mono">run(inputs, config, log)</code>.
      </p>

      {mode === 'visual' && (
        <div className="rounded-xl border border-slate-200 bg-white p-2 space-y-2">
          {fields.length === 0 && (
            <div className="text-center py-4 text-[11px] text-slate-400">
              No fields yet. Click <span className="font-black text-amber-700">+ Add field</span> to build the UI.
            </div>
          )}

          {fields.map((field, i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-slate-50/60 p-2 space-y-1.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">#{i + 1}</span>
                <div className="flex items-center gap-0.5">
                  <button type="button" onClick={() => move(i, -1)} className="p-1 rounded text-slate-400 hover:bg-slate-200 disabled:opacity-30" disabled={i === 0}>
                    <ChevronUp size={11} />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} className="p-1 rounded text-slate-400 hover:bg-slate-200 disabled:opacity-30" disabled={i === fields.length - 1}>
                    <ChevronDown size={11} />
                  </button>
                  <button type="button" onClick={() => removeField(i)} className="p-1 rounded text-rose-500 hover:bg-rose-50">
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={field.key || ''}
                  onChange={(e) => updateField(i, { key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })}
                  placeholder="key"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
                <input
                  type="text"
                  value={field.label || ''}
                  onChange={(e) => updateField(i, { label: e.target.value })}
                  placeholder="Label"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
                <select
                  value={field.type || 'text'}
                  onChange={(e) => updateField(i, { type: e.target.value })}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-400"
                >
                  {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <input
                  type="text"
                  value={field.group || ''}
                  onChange={(e) => updateField(i, { group: e.target.value })}
                  placeholder="Group (optional)"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              </div>

              <input
                type="text"
                value={field.description || ''}
                onChange={(e) => updateField(i, { description: e.target.value })}
                placeholder="Description / hint (shown next to the label)"
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-400"
              />

              {/* Default value editor â€” type-specific */}
              {(field.type === 'text' || field.type === 'textarea' || !field.type) && (
                <input
                  type="text"
                  value={field.default ?? ''}
                  onChange={(e) => updateField(i, { default: e.target.value })}
                  placeholder="Default value"
                  className="w-full rounded-md border border-slate-300 bg-amber-50/40 px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              )}
              {(field.type === 'number' || field.type === 'slider') && (
                <div className="grid grid-cols-4 gap-1.5">
                  <input
                    type="number"
                    value={field.default ?? ''}
                    onChange={(e) => updateField(i, { default: e.target.value === '' ? '' : Number(e.target.value) })}
                    placeholder="Default"
                    className="rounded-md border border-slate-300 bg-amber-50/40 px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <input
                    type="number"
                    value={field.min ?? ''}
                    onChange={(e) => updateField(i, { min: e.target.value === '' ? undefined : Number(e.target.value) })}
                    placeholder="Min"
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <input
                    type="number"
                    value={field.max ?? ''}
                    onChange={(e) => updateField(i, { max: e.target.value === '' ? undefined : Number(e.target.value) })}
                    placeholder="Max"
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <input
                    type="number"
                    value={field.step ?? ''}
                    onChange={(e) => updateField(i, { step: e.target.value === '' ? undefined : Number(e.target.value) })}
                    placeholder="Step"
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
              )}
              {field.type === 'boolean' && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Default:</span>
                  <button
                    type="button"
                    onClick={() => updateField(i, { default: !field.default })}
                    className={`relative w-9 h-5 rounded-full transition-colors ${field.default ? 'bg-amber-500' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${field.default ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              )}
              {(field.type === 'select' || field.type === 'multiselect') && (
                <div className="space-y-1">
                  <input
                    type="text"
                    value={Array.isArray(field.options) ? field.options.map((o) => (typeof o === 'string' ? o : o.value)).join(', ') : ''}
                    onChange={(e) =>
                      updateField(i, {
                        options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      })
                    }
                    placeholder="Options (comma-separated)"
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <input
                    type="text"
                    value={
                      field.type === 'multiselect'
                        ? (Array.isArray(field.default) ? field.default.join(', ') : '')
                        : (field.default ?? '')
                    }
                    onChange={(e) => {
                      if (field.type === 'multiselect') {
                        updateField(i, { default: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) });
                      } else {
                        updateField(i, { default: e.target.value });
                      }
                    }}
                    placeholder={field.type === 'multiselect' ? 'Default selected (comma-separated)' : 'Default option'}
                    className="w-full rounded-md border border-slate-300 bg-amber-50/40 px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
              )}
              {field.type === 'json' && (
                <textarea
                  value={typeof field.default === 'string' ? field.default : JSON.stringify(field.default ?? null, null, 2)}
                  onChange={(e) => {
                    try {
                      updateField(i, { default: JSON.parse(e.target.value) });
                    } catch {
                      updateField(i, { default: e.target.value });
                    }
                  }}
                  rows={3}
                  placeholder="Default JSON"
                  className="w-full rounded-md border border-slate-300 bg-slate-900 text-emerald-200 font-mono px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={addField}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-amber-400 bg-amber-50/40 py-1.5 text-[10px] font-black uppercase tracking-widest text-amber-700 hover:bg-amber-100"
          >
            <Plus size={11} /> Add field
          </button>
        </div>
      )}

      {mode === 'code' && (
        <textarea
          value={JSON.stringify({ config_schema: schema || { fields: [] }, default_config: defaultConfig }, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              if (parsed && typeof parsed === 'object') {
                onChange({
                  config_schema: parsed.config_schema && typeof parsed.config_schema === 'object'
                    ? parsed.config_schema
                    : { fields: [] },
                  default_config: parsed.default_config && typeof parsed.default_config === 'object'
                    ? parsed.default_config
                    : {},
                });
              }
            } catch {
              /* ignore until valid */
            }
          }}
          spellCheck={false}
          rows={10}
          className="w-full rounded-xl border border-slate-300 bg-slate-900 text-emerald-200 font-mono text-[11px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      )}
    </div>
  );
}

export default function CustomNodeEditorModal({
  open,
  initial,           // null = create, otherwise edit
  onClose,
  onSaved,           // (savedNode) => void
  builtinTemplateKeys = [],   // [{key, label}]
}) {
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');

  // AI assistant state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState('');

  // Reset on open
  useEffect(() => {
    if (open) {
      setDraft(initial ? { ...emptyDraft(), ...initial } : emptyDraft());
      setError('');
      setTestResult(null);
      setAiOpen(false);
      setAiPrompt('');
      setAiResult(null);
      setAiError('');
    }
  }, [open, initial]);

  const [referenceOpen, setReferenceOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('identity');

  // Reset to first tab whenever modal opens
  useEffect(() => {
    if (open) setActiveTab('identity');
  }, [open]);

  if (!open) return null;

  const isEdit = Boolean(initial?.id);
  const SelectedIcon = ALLOWED_ICONS[draft.icon] || Wand2;

  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const handleSave = async () => {
    if (!draft.name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!draft.code.includes('def run')) {
      setError('Code must define a `def run(inputs, config, log):` function.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description,
        category: draft.category,
        color: draft.color,
        icon: draft.icon,
        code: draft.code,
        inputs: draft.inputs,
        outputs: draft.outputs,
        accepts_from: draft.accepts_from,
        accepts_to: draft.accepts_to,
        config_schema: draft.config_schema || { fields: [] },
        default_config: draft.default_config,
      };
      const saved = isEdit
        ? await xragApi.updateCustomNode(draft.id, payload)
        : await xragApi.createCustomNode(payload);
      onSaved?.(saved);
      onClose?.();
    } catch (err) {
      setError(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await xragApi.runCustomNodePreview({
        code: draft.code,
        inputs: { text: 'sample input' },
        config: draft.default_config || {},
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, error: err.message, logs: [], output: null, duration_ms: 0 });
    } finally {
      setTesting(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    setAiError('');
    setAiResult(null);
    try {
      const res = await xragApi.aiGenerateCustomNode({
        description: aiPrompt.trim(),
        model: 'openai/gpt-4o',
        temperature: 0.2,
        max_tokens: 1500,
        similarity_threshold: 0.82,
      });
      setAiResult(res);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiBusy(false);
    }
  };

  const applyAiSuggestion = () => {
    if (!aiResult?.suggestion) return;
    const s = aiResult.suggestion;
    update({
      name: s.name || draft.name,
      description: s.description || draft.description,
      category: s.category || draft.category,
      color: s.color || draft.color,
      icon: s.icon || draft.icon,
      code: s.code || draft.code,
      inputs: s.inputs?.length ? s.inputs : draft.inputs,
      outputs: s.outputs?.length ? s.outputs : draft.outputs,
      default_config: s.default_config || draft.default_config,
    });
    setAiOpen(false);
  };

  const TABS = [
    { key: 'identity',    label: 'Identity',     icon: Sparkles,  hint: 'Name, look & feel'        },
    { key: 'code',        label: 'Code & Test',  icon: Code2,     hint: 'Python sandbox'           },
    { key: 'connections', label: 'Connections',  icon: GitBranch, hint: 'Ports & dependencies'     },
    { key: 'schema',      label: 'Settings UI',  icon: Settings2, hint: 'Runtime config form'      },
    { key: 'ai',          label: 'AI Assistant', icon: Bot,       hint: 'Generate from prompt'     },
  ];
  const PreviewColor = ALLOWED_COLORS.find((c) => c.key === draft.color) || ALLOWED_COLORS[0];

  return createPortal(
    <div
      className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-slate-900/60 p-6 xrag-modal-overlay-in"
      onClick={onClose}
    >
      <div
        className={`w-[1100px] h-[760px] max-w-[calc(100vw-3rem)] max-h-[calc(100vh-3rem)] flex flex-col rounded-[28px] bg-white shadow-2xl border border-amber-200/70 overflow-hidden transition-all duration-300 ${
          referenceOpen ? 'xrag-modal-pushed-back pointer-events-none' : 'xrag-modal-card-in'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Header with live node preview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="relative px-7 py-5 bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-100/60 border-b border-amber-200/80 overflow-hidden">
          {/* decorative orbs */}
          <div className="pointer-events-none absolute -top-20 -right-16 w-64 h-64 rounded-full bg-amber-300/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 w-72 h-72 rounded-full bg-yellow-200/40 blur-3xl" />

          <div className="relative flex items-center justify-between gap-4">
            {/* Left: live preview node + title */}
            <div className="flex items-center gap-4 min-w-0">
              <div className="shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-yellow-300 via-amber-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/40 ring-4 ring-white/70 transition-all duration-300">
                <SelectedIcon size={26} className="text-white drop-shadow" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-slate-800 truncate tracking-tight">
                    {isEdit ? 'Edit Custom Node' : 'Create Custom Node'}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 text-[9px] font-black uppercase tracking-widest">
                    {draft.category || 'Custom'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5 truncate max-w-[420px]">
                  <span className="font-bold text-slate-700">{draft.name || 'Untitled node'}</span>
                  {draft.description ? <> Â· <span className="italic text-slate-500">{draft.description}</span></> : null}
                </p>
              </div>
            </div>

            {/* Right: action buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setReferenceOpen(true)}
                className="group inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[11px] font-black uppercase tracking-widest bg-white text-indigo-700 border border-indigo-200 shadow-sm hover:bg-indigo-50 hover:border-indigo-300 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
                title="Browse built-in node specs for inspiration"
              >
                <BookOpen size={12} className="group-hover:rotate-[-6deg] transition-transform" />
                Built-ins
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ai')}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[11px] font-black uppercase tracking-widest transition-all duration-200 hover:-translate-y-0.5 ${
                  activeTab === 'ai'
                    ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/40'
                    : 'bg-white text-amber-700 border border-amber-300 hover:bg-amber-50 hover:shadow-md'
                }`}
              >
                <Sparkles size={12} /> AI Assistant
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-slate-500 hover:bg-white/80 hover:text-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Body: left tab rail + right pane â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="flex-1 flex min-h-0 bg-slate-50/40">
          {/* Tab rail */}
          <nav className="shrink-0 w-56 border-r border-slate-200 bg-white/60 backdrop-blur-sm py-4 px-3 flex flex-col gap-1.5 overflow-y-auto">
            {TABS.map((t) => {
              const Active = activeTab === t.key;
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 ${
                    Active
                      ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/40'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {Active && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-white/80" />
                  )}
                  <Icon size={15} className={Active ? '' : 'text-slate-500 group-hover:text-amber-600'} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[11px] font-black uppercase tracking-widest leading-tight">{t.label}</span>
                    <span className={`block text-[9px] font-medium leading-tight mt-0.5 ${Active ? 'text-white/80' : 'text-slate-400'}`}>
                      {t.hint}
                    </span>
                  </span>
                </button>
              );
            })}

            <div className="mt-auto pt-4 border-t border-slate-200/80">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 px-2">Quick test</p>
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 text-white px-3 py-2 text-[10px] font-black uppercase tracking-widest shadow-md shadow-emerald-500/30 hover:bg-emerald-600 disabled:opacity-50 transition-colors"
              >
                {testing ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                {testing ? 'Running' : 'Sandbox run'}
              </button>
              {testResult && (
                <div className={`mt-2 px-2 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest text-center ${
                  testResult.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}>
                  {testResult.ok ? `OK Â· ${testResult.duration_ms}ms` : 'Failed'}
                </div>
              )}
            </div>
          </nav>

          {/* Pane content */}
          <div key={activeTab} className="flex-1 min-w-0 overflow-y-auto p-7 xrag-tabpane-slide">
            {activeTab === 'identity' && (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-1.5 block">Name *</label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => update({ name: e.target.value })}
                    placeholder="e.g. Word Counter"
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-colors"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-1.5 block">Description</label>
                  <textarea
                    value={draft.description}
                    onChange={(e) => update({ description: e.target.value })}
                    placeholder="What this node does"
                    className="w-full h-20 rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-colors resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-1.5 block">Category</label>
                    <select
                      value={draft.category}
                      onChange={(e) => update({ category: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-colors"
                    >
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-1.5 block">Color</label>
                    <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-2.5">
                      {ALLOWED_COLORS.map((c) => (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => update({ color: c.key })}
                          title={c.key}
                          className={`w-7 h-7 rounded-lg ${c.bg} transition-all duration-200 hover:scale-110 ${
                            draft.color === c.key ? `ring-2 ${c.ring} ring-offset-2 scale-110 shadow-md` : ''
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-1.5 block">Icon</label>
                  <div className="grid grid-cols-12 gap-1.5 max-h-44 overflow-y-auto rounded-xl border border-slate-200 p-2.5 bg-white">
                    {Object.entries(ALLOWED_ICONS).map(([name, Icon]) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => update({ icon: name })}
                        title={name}
                        className={`aspect-square rounded-lg flex items-center justify-center transition-all duration-200 ${
                          draft.icon === name
                            ? `${PreviewColor.bg} text-white shadow-md scale-105`
                            : 'bg-slate-50 text-slate-600 hover:bg-amber-100 hover:text-amber-700 hover:scale-105'
                        }`}
                      >
                        <Icon size={14} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'code' && (
              <div className="space-y-3 h-full flex flex-col">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                      <CodeIcon size={14} className="text-amber-600" /> Python Code
                    </h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Define <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-700">def run(inputs, config, log)</code> â€” sandbox blocks imports, I/O & eval.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={testing}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 text-white px-4 py-2 text-[11px] font-black uppercase tracking-widest shadow-md shadow-emerald-500/30 hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                  >
                    {testing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                    {testing ? 'Runningâ€¦' : 'Test in sandbox'}
                  </button>
                </div>
                <textarea
                  value={draft.code}
                  onChange={(e) => update({ code: e.target.value })}
                  spellCheck={false}
                  className="flex-1 min-h-[420px] w-full rounded-2xl border border-slate-700 bg-slate-900 text-emerald-200 font-mono text-xs px-5 py-4 focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-inner"
                />

                {testResult && (
                  <div className={`rounded-2xl border p-4 ${testResult.ok ? 'border-emerald-300 bg-emerald-50' : 'border-rose-300 bg-rose-50'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {testResult.ok ? (
                        <CheckCircle2 size={16} className="text-emerald-600" />
                      ) : (
                        <AlertTriangle size={16} className="text-rose-600" />
                      )}
                      <span className={`text-[11px] font-black uppercase tracking-widest ${testResult.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {testResult.ok ? `Success Â· ${testResult.duration_ms}ms` : 'Failed'}
                      </span>
                    </div>
                    {testResult.error && (
                      <pre className="text-[11px] text-rose-700 whitespace-pre-wrap break-words">{testResult.error}</pre>
                    )}
                    {testResult.ok && (
                      <pre className="text-[11px] text-slate-700 whitespace-pre-wrap break-words bg-white/70 rounded-lg p-2.5 max-h-32 overflow-y-auto">
                        {JSON.stringify(testResult.output, null, 2)}
                      </pre>
                    )}
                    {testResult.logs?.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-[10px] font-black uppercase tracking-widest text-slate-500 cursor-pointer hover:text-slate-700">
                          Logs ({testResult.logs.length})
                        </summary>
                        <pre className="mt-1 text-[10px] text-slate-600 bg-white/70 rounded-lg p-2 max-h-24 overflow-y-auto">
                          {testResult.logs.join('\n')}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'connections' && (
              <div className="space-y-6 max-w-3xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-1.5 block">Inputs</label>
                    <input
                      type="text"
                      value={draft.inputs.join(', ')}
                      onChange={(e) => update({ inputs: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                      placeholder="text, embeddings"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <p className="text-[10px] text-slate-500 mt-1.5">Comma-separated port names exposed on the left side.</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-1.5 block">Outputs</label>
                    <input
                      type="text"
                      value={draft.outputs.join(', ')}
                      onChange={(e) => update({ outputs: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                      placeholder="text, score"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <p className="text-[10px] text-slate-500 mt-1.5">Ports exposed on the right side for downstream nodes.</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
                  <DependencyPicker
                    label="Accepts upstream from"
                    hint="Empty = accept any upstream node. Pick which built-in nodes can connect into this one."
                    value={draft.accepts_from}
                    onChange={(arr) => update({ accepts_from: arr })}
                    options={builtinTemplateKeys}
                  />
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
                  <DependencyPicker
                    label="Connects downstream to"
                    hint="Empty = connect to any downstream node. Pick which built-ins this one can feed into."
                    value={draft.accepts_to}
                    onChange={(arr) => update({ accepts_to: arr })}
                    options={builtinTemplateKeys}
                  />
                </div>
              </div>
            )}

            {activeTab === 'schema' && (
              <div className="max-w-3xl">
                <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
                  <ConfigSchemaBuilder
                    schema={draft.config_schema}
                    defaultConfig={draft.default_config}
                    onChange={(next) => update({
                      config_schema: next.config_schema,
                      default_config: next.default_config,
                    })}
                  />
                </div>
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="max-w-2xl space-y-4">
                <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/70 to-white p-5 space-y-4">
                  <div className="flex items-start gap-2">
                    <Lightbulb size={16} className="text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-[12px] text-slate-700 leading-snug">
                      Describe the node you want and the assistant will draft the spec & Python code for you.
                      Existing similar custom nodes will be flagged before generation.
                    </p>
                  </div>
                  <div className="flex items-stretch gap-2">
                    <input
                      type="text"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAiGenerate(); }}
                      placeholder='e.g. "Count words and characters in input text"'
                      className="flex-1 rounded-xl border border-amber-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <button
                      type="button"
                      onClick={handleAiGenerate}
                      disabled={aiBusy || !aiPrompt.trim()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 text-white px-5 py-2.5 text-[11px] font-black uppercase tracking-widest hover:bg-amber-700 disabled:opacity-50 transition-colors shadow-md shadow-amber-500/30"
                    >
                      {aiBusy ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                      Generate
                    </button>
                  </div>
                  {aiError && (
                    <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
                      {aiError}
                    </div>
                  )}
                  {aiResult && (
                    <div className="space-y-2">
                      {aiResult.used_existing ? (
                        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-[11px] text-indigo-800">
                          <strong className="font-black uppercase tracking-widest text-[10px] block mb-1">Already exists</strong>
                          A similar node is already saved. Open it from the palette instead.
                        </div>
                      ) : aiResult.suggestion && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <strong className="text-[11px] font-black uppercase tracking-widest text-emerald-800">
                              {aiResult.suggestion.name}
                            </strong>
                            <button
                              type="button"
                              onClick={() => { applyAiSuggestion(); setActiveTab('identity'); }}
                              className="rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 hover:bg-emerald-700 transition-colors"
                            >
                              Apply to draft
                            </button>
                          </div>
                          <p className="text-[11px] text-slate-700 leading-snug">{aiResult.suggestion.description}</p>
                        </div>
                      )}
                      {aiResult.rationale && (
                        <p className="text-[10px] text-slate-500 italic">{aiResult.rationale}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Footer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="flex items-center justify-between gap-3 px-7 py-4 border-t border-slate-200 bg-white/80 backdrop-blur-sm">
          {error ? (
            <span className="text-[11px] text-rose-600 font-black flex items-center gap-1.5">
              <AlertTriangle size={12} /> {error}
            </span>
          ) : (
            <span className="text-[10px] text-slate-400 font-medium">
              {isEdit ? 'Editing existing node' : 'Drafting new node'} Â· changes saved on Create
            </span>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-white border border-slate-300 text-slate-700 px-4 py-2 text-[11px] font-black uppercase tracking-widest hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white px-5 py-2 text-[11px] font-black uppercase tracking-widest shadow-md shadow-amber-500/40 hover:shadow-lg hover:shadow-amber-500/50 hover:-translate-y-0.5 disabled:opacity-50 transition-all duration-200"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {saving ? 'Savingâ€¦' : isEdit ? 'Save changes' : 'Create node'}
            </button>
          </div>
        </div>
      </div>

      <NodeReferenceModal
        open={referenceOpen}
        onClose={() => setReferenceOpen(false)}
        builtinTemplateKeys={builtinTemplateKeys}
        onUseAsTemplate={(spec) => {
          update({
            name: draft.name || spec.name,
            description: draft.description || spec.description,
            category: spec.category || draft.category,
            color: spec.color || draft.color,
            icon: spec.icon || draft.icon,
            inputs: spec.inputs || draft.inputs,
            outputs: spec.outputs || draft.outputs,
            code: spec.code || draft.code,
            default_config: spec.default_config || draft.default_config,
          });
          setReferenceOpen(false);
        }}
      />
    </div>,
    document.body
  );
}
