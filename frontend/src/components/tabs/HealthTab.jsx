import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Flame,
  Gauge,
  Hourglass,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { xragApi } from '../../services/xragApi';

/**
 * @typedef {'online' | 'waking_up' | 'offline' | 'rate_limited' | 'unsupported'} HealthStatus
 * @typedef {'openrouter' | 'huggingface'} HealthProvider
 *
 * @typedef {Object} HealthEntry
 * @property {string} id                Stable client-side id (`provider-slug`).
 * @property {HealthProvider} provider
 * @property {string} model_id          Canonical id, e.g. `openai/gpt-4o`.
 * @property {HealthStatus} status
 * @property {number | null} latency_ms Round-trip ping in ms; null when no
 *                                      successful response was measured.
 * @property {string} last_checked      ISO timestamp of the last probe.
 * @property {string} [message]         Optional human-readable detail
 *                                      (e.g. "Model is currently loading").
 */

const STORAGE_KEY = 'xrag.health.watchlist';
const HISTORY_KEY = 'xrag.health.history';
// History config: keep up to 60 samples per model (= 30 min at 30 s polling).
const HISTORY_MAX_SAMPLES = 60;
const HISTORY_WINDOW_MS = 30 * 60 * 1000; // 30 min
const HISTORY_BUCKET_MS = 5 * 60 * 1000; // 5 min buckets on the X-axis
// Distinct, accessible palette for the latency line chart. Picked so two
// adjacent series don't blur on monochrome printouts either.
// Latency SLO ceiling — anything close to this is considered "hot". Used by
// the percentage badge on the Latency Trends card to flag at-risk models.
const LATENCY_SLO_MS = 2000;
const CHART_PALETTE = ['#6366f1', '#eab308', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];
// Separate, broadcast-friendly key consumed by the Canvas LLM picker so it
// can hide HF model ids that probed as `unsupported` (no Inference Provider).
const UNSUPPORTED_KEY = 'xrag.health.unsupported';
const POLL_INTERVAL_MS = 30_000;

const STATUS_META = {
  online: {
    label: 'Online',
    dot: 'bg-emerald-500',
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle2,
    iconClass: 'text-emerald-500',
  },
  waking_up: {
    label: 'Waking Up',
    dot: 'bg-amber-400 animate-pulse',
    pill: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: Hourglass,
    iconClass: 'text-amber-500',
  },
  offline: {
    label: 'Offline',
    dot: 'bg-rose-500',
    pill: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: XCircle,
    iconClass: 'text-rose-500',
  },
  rate_limited: {
    label: 'Rate Limited',
    dot: 'bg-orange-500',
    pill: 'bg-orange-50 text-orange-700 border-orange-200',
    icon: AlertTriangle,
    iconClass: 'text-orange-500',
  },
  unsupported: {
    label: 'Unsupported',
    dot: 'bg-slate-400',
    pill: 'bg-slate-100 text-slate-600 border-slate-300',
    icon: Ban,
    iconClass: 'text-slate-500',
  },
};

const PROVIDER_META = {
  openrouter: {
    label: 'OpenRouter',
    icon: Cloud,
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    iconClass: 'text-indigo-600',
  },
  huggingface: {
    label: 'Hugging Face',
    icon: Flame,
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
    iconClass: 'text-amber-600',
  },
};

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const formatLatency = (ms) => {
  if (ms == null || !Number.isFinite(ms)) return 'N/A';
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

/** Latency badge colour scale: <500ms green, <1000ms amber, else rose. */
const latencyTone = (ms) => {
  if (ms == null) return 'text-slate-400';
  if (ms < 500) return 'text-emerald-600';
  if (ms < 1000) return 'text-amber-600';
  return 'text-rose-600';
};

const formatRelative = (iso) => {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'never';
  const diff = Date.now() - then;
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return new Date(iso).toLocaleString();
};

/**
 * Real probe — calls the backend `POST /api/health/probe`. Returns a fresh
 * `HealthEntry` shaped object. On any unexpected error we synthesise an
 * `offline` entry so the UI always has something to render.
 *
 * @param {HealthEntry} entry
 * @returns {Promise<HealthEntry>}
 */
async function probeEntry(entry) {
  try {
    const result = await xragApi.probeModel(entry.provider, entry.model_id);
    return {
      ...entry,
      status: result.status,
      latency_ms: typeof result.latency_ms === 'number' ? result.latency_ms : null,
      last_checked: result.last_checked || new Date().toISOString(),
      message: result.message || undefined,
    };
  } catch (err) {
    return {
      ...entry,
      status: 'offline',
      latency_ms: null,
      last_checked: new Date().toISOString(),
      message: `Probe failed: ${err?.message ? String(err.message).slice(0, 140) : 'unknown error'}`,
    };
  }
}

const loadStored = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Enforce "one model_id once" globally — if the persisted state was
    // written before this rule, drop the duplicates (keep first occurrence).
    return dedupeByModelId(parsed);
  } catch {
    return [];
  }
};

/** Keep the first entry for each model_id; later duplicates are dropped. */
function dedupeByModelId(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = row?.model_id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

const HealthTab = () => {
  /** @type {[HealthEntry[], Function]} */
  const [entries, setEntries] = useState(loadStored);
  const [provider, setProvider] = useState('openrouter');
  const [draftId, setDraftId] = useState('');
  const [formError, setFormError] = useState(null);
  const [refreshingIds, setRefreshingIds] = useState(() => new Set());
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
  const [topHf, setTopHf] = useState([]);
  const [topHfLoading, setTopHfLoading] = useState(false);
  const [topHfError, setTopHfError] = useState(null);
  // Per-model rolling history of probe samples used by the Latency Trends
  // chart and the Uptime History strip. Shape: `{ [entry.id]: [{t, latency_ms, status}] }`.
  // Persisted to localStorage so a tab refresh doesn't wipe the timeline.
  const [history, setHistory] = useState(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });
  // Use a ref for the *recordSample* helper so the polling effect can call
  // it without re-subscribing on every history mutation.
  const historyRef = useRef(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);
  // Bumped every 15s so the "X min ago" labels stay in sync without a
  // dedicated per-row interval.
  const [, setTick] = useState(0);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    // Broadcast the set of HF model ids confirmed unsupported so other
    // surfaces (Canvas LLM picker) can drop them from their dropdowns.
    const unsupportedHf = entries
      .filter((e) => e.provider === 'huggingface' && e.status === 'unsupported')
      .map((e) => e.model_id);
    try {
      localStorage.setItem(UNSUPPORTED_KEY, JSON.stringify(unsupportedHf));
      // Same-tab subscribers (`storage` event only fires across tabs) get
      // a custom DOM event so they can react immediately.
      window.dispatchEvent(
        new CustomEvent('xrag:unsupported-models', { detail: unsupportedHf }),
      );
    } catch {
      // localStorage may be unavailable in private mode; fail silently.
    }
  }, [entries]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // Quota exceeded — history is non-critical, drop silently.
    }
  }, [history]);

  // Append one probe result to the per-model rolling buffer. Truncates older
  // samples beyond `HISTORY_MAX_SAMPLES` so localStorage doesn't grow without
  // bound. Called from every probe path (manual refresh, bulk refresh, poll).
  const recordSample = (entry) => {
    setHistory((prev) => {
      const series = Array.isArray(prev[entry.id]) ? prev[entry.id] : [];
      const next = [
        ...series,
        {
          t: Date.now(),
          latency_ms: typeof entry.latency_ms === 'number' ? entry.latency_ms : null,
          status: entry.status,
        },
      ].slice(-HISTORY_MAX_SAMPLES);
      return { ...prev, [entry.id]: next };
    });
  };

  // Background polling: re-probe every entry every 30s. Fire-and-forget;
  // each probe updates state independently to avoid a stampede.
  useEffect(() => {
    const id = setInterval(() => {
      setEntries((current) => {
        current.forEach((entry) => {
          probeEntry(entry).then((next) => {
            recordSample(next);
            setEntries((rows) => rows.map((r) => (r.id === entry.id ? next : r)));
          });
        });
        return current;
      });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pull the top-10 HF chat models once on mount so the Quick Add panel can
  // render without further user interaction. Cached server-side for an hour.
  useEffect(() => {
    let cancelled = false;
    setTopHfLoading(true);
    xragApi
      .listTopHfChatModels(10)
      .then((rows) => {
        if (!cancelled) {
          setTopHf(Array.isArray(rows) ? rows : []);
          setTopHfError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setTopHfError(err?.message || 'Failed to load top HF models.');
      })
      .finally(() => {
        if (!cancelled) setTopHfLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const total = entries.length;
    const online = entries.filter((e) => e.status === 'online').length;
    const degraded = entries.filter((e) => e.status === 'waking_up').length;
    const failing = entries.filter(
      (e) => e.status === 'offline' || e.status === 'rate_limited',
    ).length;
    const unsupported = entries.filter((e) => e.status === 'unsupported').length;
    const liveLatencies = entries
      .map((e) => e.latency_ms)
      .filter((ms) => typeof ms === 'number' && Number.isFinite(ms));
    const avgLatency = liveLatencies.length
      ? Math.round(liveLatencies.reduce((acc, n) => acc + n, 0) / liveLatencies.length)
      : null;
    const allGreen = total > 0 && failing === 0 && degraded === 0;
    return { total, online, degraded, failing, unsupported, avgLatency, allGreen };
  }, [entries]);

  const refreshOne = async (entry) => {
    setRefreshingIds((prev) => {
      const next = new Set(prev);
      next.add(entry.id);
      return next;
    });
    try {
      const updated = await probeEntry(entry);
      recordSample(updated);
      setEntries((rows) => rows.map((r) => (r.id === entry.id ? updated : r)));
    } finally {
      setRefreshingIds((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  };

  const refreshAll = async () => {
    if (entries.length === 0) return;
    setBulkRefreshing(true);
    try {
      const results = await Promise.all(entries.map(probeEntry));
      results.forEach(recordSample);
      setEntries(results);
    } finally {
      setBulkRefreshing(false);
    }
  };

  const addEntry = () => {
    const id = draftId.trim();
    if (!id) {
      setFormError('Adj meg egy model ID-t.');
      return;
    }
    if (!id.includes('/')) {
      setFormError('A model ID formátuma: `org/model-name`.');
      return;
    }
    const entryId = `${provider}-${slugify(id)}`;
    // Uniqueness is keyed on `model_id` (not provider+id) — the same model
    // string can only appear once on the grid, regardless of provider.
    if (entries.some((e) => e.model_id === id)) {
      setFormError('Ez a modell már szerepel a watchlistán.');
      return;
    }
    /** @type {HealthEntry} */
    const fresh = {
      id: entryId,
      provider,
      model_id: id,
      status: 'waking_up',
      latency_ms: null,
      last_checked: new Date().toISOString(),
      message: 'Initial probe pending…',
    };
    setEntries((rows) => [fresh, ...rows]);
    setDraftId('');
    setFormError(null);
    refreshOne(fresh);
  };

  const removeEntry = (id) => {
    setEntries((rows) => rows.filter((r) => r.id !== id));
  };

  // Quick-add a single HF model id from the top-10 panel. Skips silently
  // if the user already tracks it. The freshly added entry kicks off its
  // own probe so the dashboard is hot-loaded with real data.
  const quickAddHf = (modelId) => {
    const entryId = `huggingface-${slugify(modelId)}`;
    // Same global rule as addEntry: a model_id can only appear once.
    if (entries.some((e) => e.model_id === modelId)) return;
    /** @type {HealthEntry} */
    const fresh = {
      id: entryId,
      provider: 'huggingface',
      model_id: modelId,
      status: 'waking_up',
      latency_ms: null,
      last_checked: new Date().toISOString(),
      message: 'Initial probe pending…',
    };
    setEntries((rows) => [fresh, ...rows]);
    refreshOne(fresh);
  };

  const quickAddAllTopHf = () => {
    topHf.forEach((m) => m?.id && quickAddHf(m.id));
  };

  const trackedIds = useMemo(
    () => new Set(entries.filter((e) => e.provider === 'huggingface').map((e) => e.model_id)),
    [entries],
  );

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto bg-slate-50 p-4 md:p-6">
      {/* ── Hero / System Status banner ───────────────────────────────── */}
      <section
        className={`relative overflow-hidden rounded-3xl border p-5 shadow-sm transition-colors md:p-6 ${
          stats.allGreen
            ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50/60'
            : stats.failing > 0
              ? 'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-orange-50/50'
              : 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-yellow-50/50'
        }`}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-md ${
                stats.allGreen
                  ? 'bg-emerald-500 text-white shadow-emerald-300/40'
                  : stats.failing > 0
                    ? 'bg-rose-500 text-white shadow-rose-300/40'
                    : 'bg-amber-500 text-white shadow-amber-300/40'
              }`}
            >
              {stats.allGreen ? (
                <ShieldCheck size={28} />
              ) : stats.failing > 0 ? (
                <AlertTriangle size={28} />
              ) : (
                <Activity size={28} />
              )}
            </div>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">
                System Status
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
                {stats.total === 0
                  ? 'No Models Monitored Yet'
                  : stats.allGreen
                    ? 'All Monitored Systems Operational'
                    : stats.failing > 0
                      ? `${stats.failing} Model${stats.failing === 1 ? '' : 's'} Reporting Issues`
                      : `${stats.degraded} Model${stats.degraded === 1 ? '' : 's'} Warming Up`}
              </h1>
              <p className="mt-1 max-w-xl text-[12.5px] text-slate-600">
                Folyamatosan figyeljük az OpenRouter és Hugging Face modellek elérhetőségét.
                Az automatikus pinger {Math.round(POLL_INTERVAL_MS / 1000)} másodpercenként frissít.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={refreshAll}
            disabled={bulkRefreshing || entries.length === 0}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white shadow-md transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bulkRefreshing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            Refresh All
          </button>
        </div>

        {/* Metric strip */}
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard
            icon={<Gauge size={16} />}
            label="Aktívan figyelt"
            value={String(stats.total)}
            tone="indigo"
          />
          <MetricCard
            icon={<CheckCircle2 size={16} />}
            label="Online"
            value={String(stats.online)}
            tone="emerald"
          />
          <MetricCard
            icon={<Hourglass size={16} />}
            label="Cold start / hiba"
            value={String(stats.degraded + stats.failing)}
            tone={stats.failing > 0 ? 'rose' : stats.degraded > 0 ? 'amber' : 'slate'}
          />
          <MetricCard
            icon={<Zap size={16} />}
            label="Átlag válaszidő"
            value={stats.avgLatency != null ? `${stats.avgLatency} ms` : '—'}
            tone={
              stats.avgLatency == null
                ? 'slate'
                : stats.avgLatency < 500
                  ? 'emerald'
                  : stats.avgLatency < 1000
                    ? 'amber'
                    : 'rose'
            }
          />
        </div>
      </section>

      {/* ── Add model form ─────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Plus size={16} className="text-indigo-600" />
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">
            Add Model to Watchlist
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[180px_1fr_auto]">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200"
          >
            <option value="openrouter">OpenRouter</option>
            <option value="huggingface">Hugging Face</option>
          </select>
          <input
            type="text"
            value={draftId}
            onChange={(e) => {
              setDraftId(e.target.value);
              if (formError) setFormError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addEntry();
              }
            }}
            placeholder={
              provider === 'openrouter'
                ? 'openai/gpt-4o · anthropic/claude-3-haiku · meta-llama/llama-3.1-70b-instruct'
                : 'BAAI/bge-m3 · meta-llama/Llama-3.1-8B-Instruct'
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-[12.5px] text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200"
          />
          <button
            type="button"
            onClick={addEntry}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-amber-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:from-indigo-600 hover:to-amber-700"
          >
            <Plus size={14} />
            Add to Dashboard
          </button>
        </div>
        {formError && (
          <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700">
            {formError}
          </p>
        )}
      </section>

      {/* ── Quick Add — Top 10 trending HF chat models ─────────────── */}
      <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/60 via-white to-orange-50/40 p-4 shadow-sm md:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Flame size={16} className="text-amber-600" />
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">
            Top 10 Trending Hugging Face Chat Models
          </h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
            this week · callable only
          </span>
          <button
            type="button"
            onClick={quickAddAllTopHf}
            disabled={topHfLoading || topHf.length === 0}
            className="ml-auto inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={12} />
            Add all to watchlist
          </button>
        </div>
        {topHfLoading ? (
          <div className="flex items-center gap-2 px-1 py-2 text-[12px] text-slate-500">
            <Loader2 size={14} className="animate-spin text-amber-500" />
            Loading the most popular HF models…
          </div>
        ) : topHfError ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11.5px] font-semibold text-rose-700">
            {topHfError}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {topHf.map((m, idx) => {
              const tracked = trackedIds.has(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => quickAddHf(m.id)}
                  disabled={tracked}
                  title={
                    tracked
                      ? 'Already on the watchlist'
                      : `Trending #${idx + 1} · Downloads: ${(m.downloads ?? 0).toLocaleString()} · Likes: ${m.likes ?? 0}`
                  }
                  className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                    tracked
                      ? 'cursor-default border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-amber-200 bg-white text-slate-700 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-800'
                  }`}
                >
                  <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[9px] font-black text-amber-700">
                    {idx + 1}
                  </span>
                  <span className="max-w-[220px] truncate font-mono text-[11px]">{m.id}</span>
                  {tracked ? (
                    <CheckCircle2 size={11} className="text-emerald-500" />
                  ) : (
                    <Plus size={11} className="text-amber-500 opacity-0 transition group-hover:opacity-100" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Health grid ────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3 md:px-5">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-slate-500" />
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">
              Health Grid
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
              {entries.length}
            </span>
          </div>
          <span className="text-[10.5px] font-medium text-slate-500">
            Auto-poll · {Math.round(POLL_INTERVAL_MS / 1000)}s
          </span>
        </header>

        {entries.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2 md:p-4 xl:grid-cols-3">
            {entries.map((entry) => (
              <HealthCard
                key={entry.id}
                entry={entry}
                samples={history[entry.id] || []}
                refreshing={refreshingIds.has(entry.id)}
                onRefresh={() => refreshOne(entry)}
                onRemove={() => removeEntry(entry.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Latency Trends (Line chart) ────────────────────────────────── */}
      <LatencyTrendsCard entries={entries} history={history} />

      {/* ── Uptime History (Status strip) ──────────────────────────────── */}
      <UptimeHistoryCard entries={entries} history={history} />
    </div>
  );
};

const TONE_BG = {
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  slate: 'bg-slate-50 text-slate-600 border-slate-200',
};

const MetricCard = ({ icon, label, value, tone = 'slate' }) => (
  <div className={`rounded-2xl border px-3 py-2.5 ${TONE_BG[tone] || TONE_BG.slate}`}>
    <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest opacity-80">
      {icon}
      {label}
    </div>
    <div className="mt-1 text-2xl font-black tracking-tight">{value}</div>
  </div>
);

const HealthCard = ({ entry, samples = [], refreshing, onRefresh, onRemove }) => {
  const status = STATUS_META[entry.status] || STATUS_META.offline;
  const provider = PROVIDER_META[entry.provider] || PROVIDER_META.openrouter;
  const ProviderIcon = provider.icon;
  const StatusIcon = status.icon;
  const isHfWaking = entry.provider === 'huggingface' && entry.status === 'waking_up';

  return (
    <article className="group relative flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${provider.badge}`}
        >
          <ProviderIcon size={11} className={provider.iconClass} />
          {provider.label}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${status.pill}`}
          title={isHfWaking ? 'A modell éppen betöltődik a VRAM-ba.' : status.label}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
          <StatusIcon size={11} className={status.iconClass} />
          {status.label}
        </span>
      </div>

      <div>
        <p className="break-all font-mono text-[13px] font-bold text-slate-800">
          {entry.model_id}
        </p>
        {entry.message && (
          <p className="mt-1 text-[11px] italic text-slate-500">{entry.message}</p>
        )}
      </div>

      <MiniSparkline samples={samples} />

      <div className="mt-auto flex items-end justify-between gap-2 border-t border-slate-100 pt-3">
        <div>
          <p className="text-[9.5px] font-extrabold uppercase tracking-widest text-slate-400">
            Latency
          </p>
          <p className={`text-lg font-black tabular-nums ${latencyTone(entry.latency_ms)}`}>
            {formatLatency(entry.latency_ms)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9.5px] font-extrabold uppercase tracking-widest text-slate-400">
            Last checked
          </p>
          <p className="text-[11px] font-semibold text-slate-600">
            {formatRelative(entry.last_checked)}
          </p>
        </div>
      </div>

      <div className="absolute right-3 top-3 flex translate-y-[-1px] gap-1 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Manual refresh"
          title="Ping now"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-slate-500 shadow ring-1 ring-slate-200 transition hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50"
        >
          {refreshing ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove from watchlist"
          title="Remove"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-slate-500 shadow ring-1 ring-slate-200 transition hover:bg-rose-50 hover:text-rose-600"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </article>
  );
};

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
      <Activity size={26} />
    </div>
    <div>
      <p className="text-sm font-bold text-slate-700">A watchlista üres.</p>
      <p className="mt-1 max-w-md text-[12px] text-slate-500">
        Adj hozzá legalább egy modellt a fenti űrlap segítségével ahhoz, hogy a dashboard valós
        időben követni tudja az állapotát.
      </p>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────
// MiniSparkline — per-card 30-sample latency curve. Draws nothing until at
// least 2 numeric samples exist; otherwise shows a gentle "warming up" hint
// so the card stays visually balanced while the timeline backfills.
// ─────────────────────────────────────────────────────────────────────────
const MiniSparkline = ({ samples }) => {
  const data = useMemo(() => {
    return samples
      .slice(-30)
      .filter((s) => typeof s.latency_ms === 'number')
      .map((s) => ({ t: s.t, ms: s.latency_ms }));
  }, [samples]);

  if (data.length < 2) {
    return (
      <div className="flex h-[44px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        Warming up · {data.length}/2 samples
      </div>
    );
  }

  const last = data[data.length - 1].ms;
  const stroke = last < 500 ? '#10b981' : last < 1000 ? '#f59e0b' : '#f43f5e';
  const fillId = `spark-fill-${stroke.replace('#', '')}`;

  return (
    <div className="h-[44px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            cursor={{ stroke: '#cbd5e1', strokeDasharray: '3 3' }}
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <div className="rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-[10px] font-bold tabular-nums text-slate-700 shadow">
                  {Math.round(payload[0].value)} ms
                </div>
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey="ms"
            stroke={stroke}
            strokeWidth={1.75}
            fill={`url(#${fillId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Latency Trends — line chart over the last 30 minutes, bucketed by 5 min.
// Renders the top-N (default 4) entries by sample count so the chart stays
// legible. Each model gets a distinct colour from CHART_PALETTE.
// ─────────────────────────────────────────────────────────────────────────
const LatencyTrendsCard = ({ entries, history }) => {
  const series = useMemo(() => pickChartSeries(entries, history, 4), [entries, history]);
  const data = useMemo(() => bucketSeries(series), [series]);
  const empty = series.length === 0 || data.every((row) => series.every((s) => row[s.label] == null));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={15} className="text-indigo-600" />
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">
            Latency Trends
          </h2>
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
            last 30 min · 5 min buckets
          </span>
        </div>
        {series.length > 0 && (
          <div className="hidden flex-wrap items-center gap-2.5 md:flex">
            {series.map((s) => (
              <span key={s.id} className="flex items-center gap-1.5 text-[10.5px] font-semibold text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="font-mono">{s.label}</span>
              </span>
            ))}
          </div>
        )}
      </header>

      {empty ? (
        <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center">
          <Hourglass size={22} className="text-slate-300" />
          <p className="text-[12px] font-semibold text-slate-500">
            Még nincs elég adat. A grafikon az első néhány ping után tölti fel magát.
          </p>
        </div>
      ) : (
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 4" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`)}
                width={50}
              />
              <Tooltip content={<LatencyTooltip series={series} />} cursor={{ stroke: '#cbd5e1', strokeDasharray: '4 4' }} />
              {series.map((s) => (
                <Line
                  key={s.id}
                  type="monotone"
                  dataKey={s.label}
                  stroke={s.color}
                  strokeWidth={2.25}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
};

const LatencyTooltip = ({ active, payload, label, series }) => {
  if (!active || !payload || payload.length === 0) return null;
  const colorMap = new Map(series.map((s) => [s.label, s.color]));
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
      <p className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
        {label}
      </p>
      <ul className="space-y-0.5">
        {payload
          .filter((p) => typeof p.value === 'number')
          .sort((a, b) => b.value - a.value)
          .map((p) => (
            <li key={p.dataKey} className="flex items-center justify-between gap-3 text-[11.5px]">
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: colorMap.get(p.dataKey) || p.color }}
                />
                <span className="font-mono text-slate-700">{p.dataKey}</span>
              </span>
              <span
                className={`font-bold tabular-nums ${
                  p.value < 500 ? 'text-emerald-600' : p.value < 1000 ? 'text-amber-600' : 'text-rose-600'
                }`}
              >
                {Math.round(p.value)} ms
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Uptime History — vertical micro-bars per model. One bar per recent sample,
// coloured by status. Read like a heatmap from left (oldest) to right (now).
// ─────────────────────────────────────────────────────────────────────────
const UPTIME_BAR_COUNT = 40;

const UptimeHistoryCard = ({ entries, history }) => {
  // Show all entries that have at least one sample, sorted by sample count
  // desc so the most-pinged ones are on top.
  const rows = useMemo(() => {
    return entries
      .map((e) => ({ entry: e, samples: history[e.id] || [] }))
      .filter((r) => r.samples.length > 0)
      .sort((a, b) => b.samples.length - a.samples.length)
      .slice(0, 6);
  }, [entries, history]);

  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <header className="mb-3 flex items-center gap-2">
          <Activity size={15} className="text-emerald-600" />
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">
            Uptime History
          </h2>
        </header>
        <div className="flex h-[120px] flex-col items-center justify-center gap-2 text-center">
          <Hourglass size={20} className="text-slate-300" />
          <p className="text-[12px] font-semibold text-slate-500">
            A státusz-csíkok az első ping után jelennek meg.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-emerald-600" />
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">
            Uptime History
          </h2>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
            most recent {UPTIME_BAR_COUNT} probes
          </span>
        </div>
        <UptimeLegend />
      </header>

      <div className="space-y-2.5">
        {rows.map(({ entry, samples }) => (
          <UptimeRow key={entry.id} entry={entry} samples={samples} />
        ))}
      </div>
    </section>
  );
};

const UptimeRow = ({ entry, samples }) => {
  const sliced = samples.slice(-UPTIME_BAR_COUNT);
  // Pad with empty cells so short timelines still have a consistent width.
  const padCount = Math.max(0, UPTIME_BAR_COUNT - sliced.length);
  const successCount = sliced.filter((s) => s.status === 'online').length;
  const uptimePct = sliced.length > 0 ? Math.round((successCount / sliced.length) * 100) : 0;

  return (
    <div className="flex items-center gap-3">
      <div className="w-44 shrink-0 truncate font-mono text-[11px] font-semibold text-slate-700" title={entry.model_id}>
        {entry.model_id}
      </div>
      <div className="flex h-8 flex-1 items-stretch gap-[2px] overflow-hidden rounded-md bg-slate-50 p-[2px]">
        {Array.from({ length: padCount }).map((_, i) => (
          <span key={`pad-${i}`} className="flex-1 rounded-sm bg-slate-100" />
        ))}
        {sliced.map((sample, i) => (
          <span
            key={`s-${i}`}
            title={`${formatRelative(new Date(sample.t).toISOString())} · ${sample.status}${
              sample.latency_ms != null ? ` · ${sample.latency_ms}ms` : ''
            }`}
            className={`flex-1 rounded-sm transition hover:opacity-80 ${UPTIME_COLORS[sample.status] || UPTIME_COLORS.offline}`}
          />
        ))}
      </div>
      <div className="w-14 shrink-0 text-right">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Up</p>
        <p
          className={`text-[12px] font-bold tabular-nums ${
            uptimePct >= 95 ? 'text-emerald-600' : uptimePct >= 70 ? 'text-amber-600' : 'text-rose-600'
          }`}
        >
          {uptimePct}%
        </p>
      </div>
    </div>
  );
};

const UPTIME_COLORS = {
  online: 'bg-emerald-500',
  waking_up: 'bg-amber-400',
  rate_limited: 'bg-orange-500',
  offline: 'bg-rose-500',
  unsupported: 'bg-slate-400',
};

const UptimeLegend = () => (
  <div className="hidden flex-wrap items-center gap-2 md:flex">
    {[
      ['Online', UPTIME_COLORS.online],
      ['Cold', UPTIME_COLORS.waking_up],
      ['Rate limit', UPTIME_COLORS.rate_limited],
      ['Offline', UPTIME_COLORS.offline],
    ].map(([label, cls]) => (
      <span key={label} className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
        <span className={`h-2.5 w-2.5 rounded-sm ${cls}`} />
        {label}
      </span>
    ))}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────
// History helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Pick the top-N entries to display on the latency chart. We prefer entries
 * with the most samples so a freshly-added watchlist row doesn't push a
 * stable model off the chart. Ties broken by `entries` order (insertion).
 *
 * @returns {{id:string,label:string,color:string,samples:any[]}[]}
 */
function pickChartSeries(entries, history, n) {
  const ranked = entries
    .map((entry, i) => ({ entry, samples: history[entry.id] || [], idx: i }))
    .filter((r) => r.samples.length > 0)
    .sort((a, b) => b.samples.length - a.samples.length || a.idx - b.idx)
    .slice(0, n);
  return ranked.map(({ entry, samples }, i) => ({
    id: entry.id,
    label: shortLabel(entry.model_id),
    color: CHART_PALETTE[i % CHART_PALETTE.length],
    samples,
  }));
}

/** Short, chart-legend-friendly label: strip the org/owner prefix. */
function shortLabel(modelId) {
  return String(modelId).split('/').pop() || modelId;
}

/**
 * Bucket per-series samples into 5-minute slots covering the last 30 min.
 * Returns an array of `{ time: 'HH:MM', [seriesLabel]: avgLatencyMs|null }`
 * shaped objects ready for Recharts. Uses the average of every sample that
 * fell into the bucket (mean smooths out a single spike).
 */
function bucketSeries(series, pageOffset = 0) {
  if (series.length === 0) return [];
  // pageOffset = 0 → window ending now; offset 1 → window ending 30 min ago, …
  const end = Date.now() - pageOffset * HISTORY_WINDOW_MS;
  const start = end - HISTORY_WINDOW_MS;
  const bucketCount = Math.ceil(HISTORY_WINDOW_MS / HISTORY_BUCKET_MS);
  // Anchor each bucket to its end-time (so 14:05 means the 14:00–14:05 window).
  /** @type {Record<string, number | null>[]} */
  const rows = [];
  for (let i = 0; i < bucketCount; i += 1) {
    const bucketEnd = start + (i + 1) * HISTORY_BUCKET_MS;
    rows.push({ __end: bucketEnd, time: formatHHMM(bucketEnd) });
  }
  for (const s of series) {
    const sums = new Array(bucketCount).fill(0);
    const counts = new Array(bucketCount).fill(0);
    for (const sample of s.samples) {
      if (sample.latency_ms == null || sample.t < start || sample.t >= end) continue;
      const idx = Math.min(
        bucketCount - 1,
        Math.max(0, Math.floor((sample.t - start) / HISTORY_BUCKET_MS)),
      );
      sums[idx] += sample.latency_ms;
      counts[idx] += 1;
    }
    for (let i = 0; i < bucketCount; i += 1) {
      rows[i][s.label] = counts[i] > 0 ? Math.round(sums[i] / counts[i]) : null;
    }
  }
  return rows.map(({ __end: _drop, ...row }) => row);
}

function formatHHMM(epochMs) {
  const d = new Date(epochMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export default HealthTab;
