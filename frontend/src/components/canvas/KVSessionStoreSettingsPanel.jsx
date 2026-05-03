/**
 * KVSessionStoreSettingsPanel — key-value / session memory cache.
 *
 * CONNECTION CONTRACT
 *   • Inputs: none (acts as a memory sidecar).
 *   • Outputs: `store` metadata, consumed by LLM for multi-turn context.
 */

import { Database, Clock, CircleHelp } from 'lucide-react';

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-emerald-400';

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
      <Icon size={13} className="text-emerald-500 shrink-0" />
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">{title}</span>
    </div>
    {children}
  </div>
);

const PROVIDERS = [
  { value: 'redis', label: 'Redis' },
  { value: 'memcached', label: 'Memcached' },
  { value: 'in-memory', label: 'In-memory (no persistence)' },
  { value: 'dynamodb', label: 'DynamoDB' },
  { value: 'upstash', label: 'Upstash Redis (serverless)' },
];

export default function KVSessionStoreSettingsPanel({ value = {}, onChange }) {
  const set = (key, val) => onChange?.({ ...value, [key]: val });

  return (
    <div className="space-y-3">
      <Section icon={Database} title="Provider">
        <FieldLabel title="KV Provider" />
        <select
          value={value.provider ?? 'redis'}
          onChange={(e) => set('provider', e.target.value)}
          className={inputClass}
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>

        <FieldLabel title="Connection URL" help="Redis URL or endpoint (leave blank for in-memory)" />
        <input
          type="text"
          value={value.url ?? ''}
          placeholder="redis://localhost:6379"
          onChange={(e) => set('url', e.target.value)}
          className={inputClass}
        />

        <FieldLabel title="Key prefix" help="Namespace all keys under this prefix (e.g. xrag:session:)" />
        <input
          type="text"
          value={value.keyPrefix ?? 'xrag:session:'}
          onChange={(e) => set('keyPrefix', e.target.value)}
          className={inputClass}
        />
      </Section>

      <Section icon={Clock} title="TTL & Eviction">
        <FieldLabel title="TTL (seconds)" help="Session entry time-to-live. 0 = no expiry." />
        <input
          type="number"
          min={0}
          max={86400 * 30}
          value={value.ttlSeconds ?? 3600}
          onChange={(e) => set('ttlSeconds', Number(e.target.value))}
          className={inputClass}
        />

        <FieldLabel title="Max history turns" help="Maximum number of conversation turns to remember" />
        <input
          type="number"
          min={1}
          max={100}
          value={value.maxTurns ?? 20}
          onChange={(e) => set('maxTurns', Number(e.target.value))}
          className={inputClass}
        />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.persistOnEviction ?? false)}
            onChange={(e) => set('persistOnEviction', e.target.checked)}
            className="h-3.5 w-3.5 accent-emerald-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Persist to disk on eviction</span>
        </label>
      </Section>
    </div>
  );
}
