/**
 * KVSessionStoreSettingsPanel  emerald-themed session memory cache.
 *
 * Backend contract (`storage-kv-session` in `nodes.py::_exec_kv_session`):
 *   { provider, url, keyPrefix, ttlSeconds, maxTurns, persistOnEviction }
 * Inputs: none. Outputs: store metadata (consumed by LLM for multi-turn).
 */

import { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Clock,
  Database,
  KeyRound,
  Zap,
} from 'lucide-react';

const PROVIDERS = [
  { value: 'redis',     label: 'Redis' },
  { value: 'memcached', label: 'Memcached' },
  { value: 'in-memory', label: 'In-memory' },
  { value: 'dynamodb',  label: 'DynamoDB' },
  { value: 'upstash',   label: 'Upstash' },
];

const inputClass =
  'w-full rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-xs text-slate-200 outline-none transition focus:border-emerald-600/60 focus:ring-2 focus:ring-emerald-200/50';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{title}</label>
    {help && (
      <span title={help} className="cursor-help text-slate-300 hover:text-emerald-500">
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
        ? 'border-emerald-600/60 bg-emerald-900/20 text-emerald-300 shadow-sm shadow-emerald-200/40'
        : 'border-slate-700/50 bg-[#0d1117] text-slate-400 hover:border-emerald-700/40 hover:text-emerald-400'
    }`}
  >
    <span aria-hidden className={`inline-block h-2 w-2 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`} />
    {label}
  </button>
);

function StatPill({ label, hint, ok = true, Icon }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-[10px] ${ok ? 'border-emerald-700/40 bg-emerald-900/20 text-emerald-300' : 'border-slate-700/50 bg-[#0d1117] text-slate-400'}`}>
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
    provider:          String(value?.provider ?? 'redis'),
    url:               String(value?.url ?? ''),
    keyPrefix:         String(value?.keyPrefix ?? 'xrag:session:'),
    ttlSeconds:        Math.max(0, Math.min(86400 * 30, Number(value?.ttlSeconds ?? 3600))),
    maxTurns:          Math.max(1, Math.min(200, Number(value?.maxTurns ?? 20))),
    persistOnEviction: Boolean(value?.persistOnEviction ?? false),
  };
}

function fmtTtl(secs) {
  if (secs === 0) return 'no expiry';
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h`;
  return `${Math.round(secs / 86400)}d`;
}

export default function KVSessionStoreSettingsPanel({ value = {}, onChange }) {
  const setField = (k, v) => onChange?.(k, v);
  const payload = useMemo(() => buildPayload(value), [value]);
  const activeProvider = PROVIDERS.find((p) => p.value === payload.provider) ?? PROVIDERS[0];
  const isInMemory = payload.provider === 'in-memory';

  const warnings = [];
  if (!isInMemory && !payload.url.trim()) warnings.push('Connection URL is empty for a remote provider.');
  if (payload.ttlSeconds === 0) warnings.push('TTL of 0 means sessions never expire  watch memory growth.');

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-800/50 to-emerald-900/70 text-emerald-200 ring-1 ring-emerald-600/30">
            <Database size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-100">KV Session Store</p>
            <p className="truncate font-mono text-[10.5px] text-slate-400">
              <span className="text-emerald-400">{activeProvider.label}</span>  ttl {fmtTtl(payload.ttlSeconds)}
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-emerald-400">{payload.maxTurns} turns</span>
            <span className="font-mono text-[10px] text-slate-400">{payload.keyPrefix}*</span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-400">
          Persists multi-turn conversation memory keyed by session ID. Used by the LLM to
          carry conversational state across requests.
        </p>
      </div>

      <div className="rounded-2xl border border-emerald-700/40 bg-emerald-900/20 p-3">
        <div className="flex items-start gap-2">
          <KeyRound size={14} className="text-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">Cache summary</p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <StatPill label="Provider" ok hint={activeProvider.label}        Icon={Database} />
              <StatPill label="TTL"      ok hint={fmtTtl(payload.ttlSeconds)}  Icon={Clock} />
              <StatPill label="Turns"    ok hint={String(payload.maxTurns)}    Icon={KeyRound} />
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Database size={12} className="text-emerald-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Provider</h4>
        </header>
        <select value={payload.provider} onChange={(e) => setField('provider', e.target.value)} className={inputClass}>
          {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <div>
          <FieldLabel title="Connection URL" help="Leave blank for in-memory." />
          <input
            type="text"
            value={payload.url}
            placeholder={isInMemory ? '(in-memory  no URL needed)' : 'redis://localhost:6379'}
            onChange={(e) => setField('url', e.target.value)}
            className={inputClass}
            disabled={isInMemory}
          />
        </div>
        <div>
          <FieldLabel title="Key prefix" help="Namespace prefix for all session keys." />
          <input
            type="text"
            value={payload.keyPrefix}
            onChange={(e) => setField('keyPrefix', e.target.value)}
            className={inputClass}
          />
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Clock size={12} className="text-emerald-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">TTL &amp; eviction</h4>
        </header>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel title="TTL (seconds)" help="0 = no expiry." />
            <input
              type="number"
              min={0}
              max={86400 * 30}
              value={payload.ttlSeconds}
              onChange={(e) => setField('ttlSeconds', Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel title="Max turns" />
            <input
              type="number"
              min={1}
              max={200}
              value={payload.maxTurns}
              onChange={(e) => setField('maxTurns', Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
        <ToggleChip
          checked={payload.persistOnEviction}
          onChange={(v) => setField('persistOnEviction', v)}
          label="Persist to disk on eviction"
          help="Snapshot evicted sessions to durable storage."
        />
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
        <div className="flex items-center gap-1.5 rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-2.5 py-1.5 text-[10.5px] font-semibold text-emerald-300">
          <CheckCircle2 size={11} /> Session store configured.
        </div>
      )}

      <details className="rounded-2xl border border-slate-700/50 bg-slate-800/40/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-emerald-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <Zap size={11} className="text-emerald-400" />
        Output: <span className="font-mono text-emerald-400">store metadata</span>
      </div>
    </div>
  );
}
