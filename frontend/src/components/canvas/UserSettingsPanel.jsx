/**
 * UserSettingsPanel — the *actor* at the entry of every RAG pipeline.
 *
 * What belongs here, and ONLY here:
 *   1. Identity — display name, role, tenant, user id (RBAC / multi-tenant key)
 *   2. Access  — which tools the runtime is allowed to call for this user
 *   3. Quotas  — per-user rate limit
 *
 * What does NOT belong here (delegated to sibling nodes):
 *   • Output language       → Response node
 *   • Tone / expertise      → System Prompt node
 *   • Look & feel / avatar  → cosmetic, not a pipeline concern
 *   • Telemetry / consent   → org-level setting, not per-flow
 *
 * Output: typed `user_context` payload consumed by Guardrails, Router and LLM.
 */

import { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Crown,
  Gauge,
  KeyRound,
  ShieldCheck,
  User,
  UserCog,
  Wrench,
  Zap,
} from 'lucide-react';

// ─── Shared atoms (modern, soft fuchsia) ──────────────────────────────────
const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-fuchsia-300 focus:ring-2 focus:ring-fuchsia-200/40';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {title}
    </label>
    {help && (
      <span title={help} className="cursor-help text-slate-300 hover:text-fuchsia-500">
        <CircleHelp size={11} />
      </span>
    )}
  </div>
);

/**
 * ToggleChip — pill button with aria-pressed state.
 *
 * IMPORTANT: implemented as a real <button>, NOT a <label> wrapping a hidden
 * <input>. Hidden checkboxes inside <label> can cause the browser to scroll
 * the page when focus moves into a clipped (`sr-only`) element — visible to
 * the user as the panel "jumping" or a popup-like reflow.
 */
const ToggleChip = ({ checked, onChange, label, help }) => (
  <button
    type="button"
    title={help}
    aria-pressed={Boolean(checked)}
    onClick={() => onChange?.(!checked)}
    className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
      checked
        ? 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800 shadow-sm shadow-fuchsia-200/30'
        : 'border-slate-200 bg-white text-slate-500 hover:border-fuchsia-200 hover:text-fuchsia-700'
    }`}
  >
    <span
      aria-hidden
      className={`inline-block h-2 w-2 rounded-full transition ${
        checked ? 'bg-fuchsia-500' : 'bg-slate-300 group-hover:bg-fuchsia-300'
      }`}
    />
    {label}
  </button>
);

// ─── Domain options ──────────────────────────────────────────────────────
const PERSONA_PRESETS = [
  {
    id: 'anonymous',
    label: 'Anonymous',
    description: 'Public visitor, read-only, low rate limit.',
    icon: User,
    role: 'guest',
    allowedTools: ['retrieve'],
    rateLimitRpm: 5,
    requireAuth: false,
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'Authenticated user with retrieval + citations.',
    icon: UserCog,
    role: 'user',
    allowedTools: ['retrieve', 'rerank', 'cite'],
    rateLimitRpm: 60,
    requireAuth: true,
  },
  {
    id: 'power',
    label: 'Power user',
    description: 'Function calling and raw chunk inspection.',
    icon: Wrench,
    role: 'user',
    allowedTools: ['retrieve', 'rerank', 'cite', 'tools_exec', 'raw_chunks'],
    rateLimitRpm: 240,
    requireAuth: true,
  },
  {
    id: 'admin',
    label: 'Admin',
    description: 'Can mutate the index. High rate limit.',
    icon: Crown,
    role: 'admin',
    allowedTools: ['retrieve', 'rerank', 'cite', 'tools_exec', 'raw_chunks', 'index_admin'],
    rateLimitRpm: 600,
    requireAuth: true,
  },
];

const ROLE_OPTIONS = [
  { value: 'guest', label: 'Guest — anonymous visitor' },
  { value: 'user', label: 'User — authenticated' },
  { value: 'admin', label: 'Admin — full access' },
  { value: 'service', label: 'Service — machine / API' },
];

const ALL_TOOLS = [
  { value: 'retrieve', label: 'Retrieve', help: 'Vector search the knowledge base.' },
  { value: 'rerank', label: 'Rerank', help: 'Cross-encoder reranking of chunks.' },
  { value: 'cite', label: 'Cite', help: 'Attach source citations to the answer.' },
  { value: 'tools_exec', label: 'Function calling', help: 'Run registered tool functions.' },
  { value: 'raw_chunks', label: 'Raw chunks', help: 'Return retrieved chunks verbatim (debug).' },
  { value: 'index_admin', label: 'Index admin', help: 'Mutate the vector index (upsert/delete).' },
];

// ─── Schema ──────────────────────────────────────────────────────────────
export const DEFAULT_USER_CONFIG = {
  preset: 'standard',
  // Identity
  displayName: '',
  role: 'user',
  tenantId: 'acme-corp',
  userId: '',
  requireAuth: true,
  // Access control
  allowedTools: ['retrieve', 'rerank', 'cite'],
  rateLimitRpm: 60,
};

export function buildUserContextPayload(config = {}) {
  const c = { ...DEFAULT_USER_CONFIG, ...config };
  return {
    step_type: 'user_context',
    metadata: {
      preset: c.preset || 'custom',
      identity: {
        display_name: c.displayName || null,
        role: c.role,
        tenant_id: c.tenantId || null,
        user_id: c.userId || null,
        require_auth: Boolean(c.requireAuth),
      },
      access: {
        allowed_tools: Array.isArray(c.allowedTools) ? [...c.allowedTools] : [],
        rate_limit_rpm: Number(c.rateLimitRpm) || 0,
      },
    },
  };
}

// ─── Component ───────────────────────────────────────────────────────────
export default function UserSettingsPanel({ value = {}, onChange }) {
  const config = useMemo(() => ({ ...DEFAULT_USER_CONFIG, ...value }), [value]);
  const payload = useMemo(() => buildUserContextPayload(config), [config]);
  const setField = (field, fieldValue) => onChange?.(field, fieldValue);

  const applyPreset = (presetId) => {
    const preset = PERSONA_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setField('preset', preset.id);
    setField('role', preset.role);
    setField('allowedTools', preset.allowedTools);
    setField('rateLimitRpm', preset.rateLimitRpm);
    setField('requireAuth', preset.requireAuth);
  };

  const toggleTool = (toolValue, enabled) => {
    const current = new Set(Array.isArray(config.allowedTools) ? config.allowedTools : []);
    if (enabled) current.add(toolValue);
    else current.delete(toolValue);
    setField('allowedTools', [...current]);
    if (config.preset !== 'custom') setField('preset', 'custom');
  };

  const warnings = [];
  if (config.role === 'guest' && config.requireAuth) {
    warnings.push('Guest role with required auth — pick a real role or disable auth.');
  }
  if (config.allowedTools?.includes('index_admin') && config.role !== 'admin') {
    warnings.push('Index admin tool should only be granted to the admin role.');
  }
  if (!config.allowedTools || config.allowedTools.length === 0) {
    warnings.push('No tools enabled — the user cannot retrieve anything.');
  }

  const previewName = config.displayName?.trim() || 'Anonymous user';
  const previewSub = [config.role, config.tenantId].filter(Boolean).join(' · ');
  const toolCount = config.allowedTools?.length || 0;

  return (
    <div className="space-y-3">
      {/* ── Hero card ───────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-fuchsia-300 via-fuchsia-400 to-pink-300"
        />
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-50 to-pink-50 text-fuchsia-600 ring-1 ring-fuchsia-200/60">
            <User size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-800">{previewName}</p>
            <p className="truncate font-mono text-[10.5px] text-slate-500">
              {previewSub || 'no identity yet'}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-fuchsia-700">
              {toolCount} {toolCount === 1 ? 'tool' : 'tools'}
            </span>
            <span className="font-mono text-[10px] text-slate-500">
              {config.rateLimitRpm === 0 ? '∞ rpm' : `${config.rateLimitRpm} rpm`}
            </span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-500">
          Tells downstream nodes <span className="font-semibold text-slate-700">who</span> is asking
          and <span className="font-semibold text-slate-700">what they may do</span>. Output language
          and tone live in the Response / System Prompt nodes.
        </p>
      </div>

      {/* ── Quick presets ───────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
        <header className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Quick presets
          </p>
          {config.preset === 'custom' && (
            <span className="rounded-full border border-fuchsia-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-fuchsia-700">
              custom
            </span>
          )}
        </header>
        <div className="grid grid-cols-2 gap-1.5">
          {PERSONA_PRESETS.map((preset) => {
            const Icon = preset.icon;
            const active = config.preset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={`group flex flex-col gap-1 rounded-xl border bg-white p-2 text-left transition ${
                  active
                    ? 'border-fuchsia-300 ring-2 ring-fuchsia-200/50'
                    : 'border-slate-200 hover:border-fuchsia-200'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md transition ${
                      active
                        ? 'bg-fuchsia-100 text-fuchsia-600'
                        : 'bg-slate-100 text-slate-500 group-hover:bg-fuchsia-50 group-hover:text-fuchsia-500'
                    }`}
                  >
                    <Icon size={11} />
                  </span>
                  <span
                    className={`text-[11px] font-bold ${
                      active ? 'text-fuchsia-800' : 'text-slate-700'
                    }`}
                  >
                    {preset.label}
                  </span>
                </div>
                <span className="text-[9.5px] leading-snug text-slate-500">
                  {preset.description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Identity ────────────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <KeyRound size={12} className="text-fuchsia-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Identity
          </h4>
        </header>

        <div>
          <FieldLabel title="Display name" help="Shown in the chat UI." />
          <input
            type="text"
            value={config.displayName}
            placeholder="e.g. Jane Doe"
            onChange={(event) => setField('displayName', event.target.value)}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel title="Role" help="Drives RBAC in Guardrails / Router." />
            <select
              value={config.role}
              onChange={(event) => setField('role', event.target.value)}
              className={inputClass}
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel title="Tenant ID" help="Multi-tenant isolation key." />
            <input
              type="text"
              value={config.tenantId}
              placeholder="acme-corp"
              onChange={(event) => setField('tenantId', event.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel title="User ID" help="Optional — empty = anonymous." />
            <input
              type="text"
              value={config.userId}
              placeholder="auth0|abc123"
              onChange={(event) => setField('userId', event.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
          <button
            type="button"
            aria-pressed={Boolean(config.requireAuth)}
            onClick={() => setField('requireAuth', !config.requireAuth)}
            className={`mt-[18px] inline-flex items-center justify-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
              config.requireAuth
                ? 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800'
                : 'border-slate-200 bg-white text-slate-500 hover:border-fuchsia-200 hover:text-fuchsia-700'
            }`}
          >
            <ShieldCheck
              size={12}
              className={config.requireAuth ? 'text-fuchsia-500' : 'text-slate-400'}
            />
            Require auth
          </button>
        </div>
      </section>

      {/* ── Allowed tools ───────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={12} className="text-fuchsia-500" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Allowed tools
            </h4>
          </div>
          <span className="font-mono text-[10px] text-slate-500">
            {toolCount} / {ALL_TOOLS.length}
          </span>
        </header>
        <p className="text-[10px] leading-snug text-slate-500">
          The Router and LLM nodes only call tools that are checked here.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ALL_TOOLS.map((tool) => (
            <ToggleChip
              key={tool.value}
              checked={config.allowedTools?.includes(tool.value)}
              onChange={(v) => toggleTool(tool.value, v)}
              label={tool.label}
              help={tool.help}
            />
          ))}
        </div>
      </section>

      {/* ── Rate limit ──────────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gauge size={12} className="text-fuchsia-500" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Rate limit
            </h4>
          </div>
          <span className="font-mono text-[11px] font-bold text-fuchsia-700">
            {config.rateLimitRpm === 0 ? '∞' : `${config.rateLimitRpm} rpm`}
          </span>
        </header>
        <input
          type="range"
          min={0}
          max={600}
          step={5}
          value={config.rateLimitRpm}
          onChange={(event) =>
            setField('rateLimitRpm', Math.max(0, Number(event.target.value) || 0))
          }
          className="w-full accent-fuchsia-400"
        />
        <div className="flex justify-between text-[9px] font-semibold uppercase tracking-wider text-slate-400">
          <span>off</span>
          <span>60</span>
          <span>240</span>
          <span>600</span>
        </div>
        <p className="text-[10px] text-slate-500">
          Per-user sliding window. <span className="font-mono">0</span> = unlimited
          (recommended only for service / admin roles).
        </p>
      </section>

      {/* ── Validation ──────────────────────────────────────────────────── */}
      {warnings.length > 0 ? (
        <ul className="space-y-1">
          {warnings.map((warning) => (
            <li
              key={warning}
              className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-amber-800"
            >
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-emerald-800">
          <CheckCircle2 size={11} />
          Configuration valid — all checks passed.
        </div>
      )}

      {/* ── Output payload preview ──────────────────────────────────────── */}
      <details className="rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-fuchsia-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <Zap size={11} className="text-fuchsia-400" />
        Output: <span className="font-mono text-fuchsia-700">user_context</span> → Guardrails, Router, LLM
      </div>
    </div>
  );
}
