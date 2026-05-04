import { useMemo } from 'react';
import { Wand2, AlertCircle } from 'lucide-react';

/**
 * Renders the runtime configuration UI for a custom (user-defined) canvas
 * node. The fields come from `template.customNode.config_schema.fields`,
 * a list of `{ key, label, type, default, options, min, max, step,
 * description, group, placeholder }` objects.
 *
 * Supported field types:
 *   - text, textarea, number, slider, boolean, select, multiselect, json
 *
 * If no schema is defined, falls back to a generic key/value editor over the
 * keys present in `value`.
 */
export default function CustomNodeSettingsPanel({ template, value = {}, onChange }) {
  const schema = template?.customNode?.config_schema;
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];

  const groups = useMemo(() => {
    if (fields.length === 0) return [];
    const map = new Map();
    fields.forEach((f) => {
      const g = f.group || 'General';
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(f);
    });
    return Array.from(map.entries());
  }, [fields]);

  const setField = (key, v) => onChange?.(key, v);

  const renderField = (field) => {
    const key = field.key;
    if (!key) return null;
    const v = value[key];
    const fallback = v === undefined ? field.default : v;
    const labelText = field.label || key;

    const labelEl = (
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">{labelText}</label>
        {field.description && (
          <span className="text-[9px] text-slate-400 italic truncate max-w-[60%]" title={field.description}>
            {field.description}
          </span>
        )}
      </div>
    );

    switch (field.type) {
      case 'textarea':
        return (
          <div key={key} className="space-y-1">
            {labelEl}
            <textarea
              value={fallback ?? ''}
              onChange={(e) => setField(key, e.target.value)}
              placeholder={field.placeholder || ''}
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        );
      case 'number':
        return (
          <div key={key} className="space-y-1">
            {labelEl}
            <input
              type="number"
              value={fallback ?? ''}
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              onChange={(e) => setField(key, e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        );
      case 'slider': {
        const num = typeof fallback === 'number' ? fallback : Number(field.default ?? field.min ?? 0);
        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">{labelText}</label>
              <span className="text-[10px] font-mono text-amber-700 font-black">{num}</span>
            </div>
            <input
              type="range"
              value={num}
              min={field.min ?? 0}
              max={field.max ?? 100}
              step={field.step ?? 1}
              onChange={(e) => setField(key, Number(e.target.value))}
              className="w-full accent-amber-500"
            />
            {field.description && <p className="text-[9px] text-slate-400 italic">{field.description}</p>}
          </div>
        );
      }
      case 'boolean':
        return (
          <div key={key} className="flex items-center justify-between gap-2 py-1">
            <div className="min-w-0">
              <p className="text-[11px] font-black text-slate-700 truncate">{labelText}</p>
              {field.description && <p className="text-[9px] text-slate-400 italic truncate">{field.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => setField(key, !fallback)}
              className={`relative w-9 h-5 rounded-full transition-colors ${fallback ? 'bg-amber-500' : 'bg-slate-300'}`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  fallback ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        );
      case 'select': {
        const options = Array.isArray(field.options) ? field.options : [];
        return (
          <div key={key} className="space-y-1">
            {labelEl}
            <select
              value={fallback ?? ''}
              onChange={(e) => setField(key, e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">— pick —</option>
              {options.map((opt) => {
                const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
                return <option key={o.value} value={o.value}>{o.label}</option>;
              })}
            </select>
          </div>
        );
      }
      case 'multiselect': {
        const options = Array.isArray(field.options) ? field.options : [];
        const arr = Array.isArray(fallback) ? fallback : [];
        return (
          <div key={key} className="space-y-1">
            {labelEl}
            <div className="flex flex-wrap gap-1">
              {options.map((opt) => {
                const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
                const on = arr.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setField(key, on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                    className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border transition-colors ${
                      on ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      }
      case 'json':
        return (
          <div key={key} className="space-y-1">
            {labelEl}
            <textarea
              value={typeof fallback === 'string' ? fallback : JSON.stringify(fallback ?? null, null, 2)}
              onChange={(e) => {
                try {
                  setField(key, JSON.parse(e.target.value));
                } catch {
                  setField(key, e.target.value); // store raw while invalid
                }
              }}
              rows={4}
              className="w-full rounded-xl border border-slate-200 bg-slate-900 text-emerald-200 font-mono p-2 text-[11px] outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        );
      case 'text':
      default:
        return (
          <div key={key} className="space-y-1">
            {labelEl}
            <input
              type="text"
              value={fallback ?? ''}
              onChange={(e) => setField(key, e.target.value)}
              placeholder={field.placeholder || ''}
              className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        );
    }
  };

  // No schema → generic fallback over current value keys
  if (fields.length === 0) {
    const entries = Object.entries(value || {});
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-2.5">
          <Wand2 size={12} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-[10px] text-amber-800 leading-snug">
            This custom node has no UI schema — edit the raw config keys, or open the editor to define proper fields.
          </p>
        </div>
        {entries.length === 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-3">
            <AlertCircle size={12} className="text-slate-400" />
            <p className="text-[11px] text-slate-500">No config keys yet.</p>
          </div>
        )}
        {entries.map(([k, v]) => (
          <div key={k} className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">{k}</label>
            <input
              type="text"
              value={String(v ?? '')}
              onChange={(e) => onChange?.(k, e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map(([groupName, groupFields]) => (
        <div key={groupName} className="rounded-xl border border-amber-200 bg-amber-50/30 p-2.5 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">{groupName}</p>
          {groupFields.map(renderField)}
        </div>
      ))}
    </div>
  );
}
