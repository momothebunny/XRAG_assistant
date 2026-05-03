/**
 * UserSettingsPanel — defines the *acting persona* at the entry point of
 * the canvas pipeline. The User node represents the human (or system) that
 * sends queries; its config feeds:
 *   1. authorisation / RBAC scope (role, tenant, allowed tools)
 *   2. personalisation (locale, expertise, tone preference)
 *   3. session bookkeeping (id, channel, rate limit budget)
 *
 * CONNECTION CONTRACT (CANONICAL_PIPELINE_RANK = 1)
 *   • Inputs: none — this is the *source* node of the conversation.
 *   • Outputs: typed `user_context` payload that downstream nodes
 *     (Question, Guardrails, Router, LLM) can read for personalisation
 *     and policy decisions.
 *
 * Why a dedicated panel? Without proper user context the pipeline cannot
 * differentiate an anonymous trial user from a paid enterprise admin —
 * which has both safety (PII handling) and quality (response tone)
 * implications. A single "persona" string is not enough.
 */

import { useMemo } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CircleHelp,
  Crown,
  Gauge,
  Globe,
  Headset,
  KeyRound,
  Smartphone,
  User,
  UserCog,
  Zap,
} from 'lucide-react';

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-cyan-400';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
      {title}
    </label>
    {help && (
      <button
        type="button"
        title={help}
        className="shrink-0 text-slate-400 hover:text-slate-700"
      >
        <CircleHelp size={11} />
      </button>
    )}
  </div>
);

const ToggleRow = ({ checked, onChange, title, help }) => (
  <label
    className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 transition cursor-pointer ${
      checked
        ? 'border-cyan-300 bg-cyan-50/60'
        : 'border-slate-200 bg-white hover:border-slate-300'
    }`}
  >
    <input
      type="checkbox"
      checked={Boolean(checked)}
      onChange={(event) => onChange?.(event.target.checked)}
      className="mt-0.5 h-3.5 w-3.5 accent-cyan-500"
    />
    <span className="min-w-0">
      <span className="block text-[11.5px] font-bold text-slate-700">{title}</span>
      {help && <span className="mt-0.5 block text-[10.5px] leading-snug text-slate-500">{help}</span>}
    </span>
  </label>
);

// Persona presets seed the form so the user can iterate rather than start
// from scratch. Each preset tunes RBAC + personalisation in one click.
const PERSONA_PRESETS = [
  {
    id: 'anonymous-trial',
    label: 'Anonymous Trial',
    icon: User,
    role: 'guest',
    tenantId: 'public',
    locale: 'en',
    expertise: 'beginner',
    tone: 'friendly',
    allowedTools: ['retrieve'],
    rateLimitRpm: 5,
    requireAuth: false,
  },
  {
    id: 'enterprise-user',
    label: 'Enterprise User',
    icon: Building2,
    role: 'user',
    tenantId: 'acme-corp',
    locale: 'en',
    expertise: 'intermediate',
    tone: 'professional',
    allowedTools: ['retrieve', 'rerank', 'cite'],
    rateLimitRpm: 60,
    requireAuth: true,
  },
  {
    id: 'enterprise-admin',
    label: 'Enterprise Admin',
    icon: Crown,
    role: 'admin',
    tenantId: 'acme-corp',
    locale: 'en',
    expertise: 'expert',
    tone: 'concise',
    allowedTools: ['retrieve', 'rerank', 'cite', 'index_admin', 'tools_exec'],
    rateLimitRpm: 240,
    requireAuth: true,
  },
  {
    id: 'support-agent',
    label: 'Support Agent',
    icon: Headset,
    role: 'agent',
    tenantId: 'acme-corp',
    locale: 'auto',
    expertise: 'intermediate',
    tone: 'empathetic',
    allowedTools: ['retrieve', 'rerank', 'cite', 'ticket_lookup'],
    rateLimitRpm: 120,
    requireAuth: true,
  },
  {
    id: 'developer-api',
    label: 'Developer (API)',
    icon: KeyRound,
    role: 'service',
    tenantId: 'acme-corp',
    locale: 'en',
    expertise: 'expert',
    tone: 'technical',
    allowedTools: ['retrieve', 'rerank', 'cite', 'tools_exec', 'raw_chunks'],
    rateLimitRpm: 600,
    requireAuth: true,
  },
  {
    id: 'custom',
    label: 'Custom (manual)',
    icon: UserCog,
  },
];

const ROLE_OPTIONS = [
  { value: 'guest', label: 'Guest (anonymous)' },
  { value: 'user', label: 'User (authenticated)' },
  { value: 'agent', label: 'Agent (support staff)' },
  { value: 'admin', label: 'Admin (full access)' },
  { value: 'service', label: 'Service (machine / API)' },
];

const LOCALE_OPTIONS = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'hu', label: 'Hungarian' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
];

const EXPERTISE_OPTIONS = [
  { value: 'beginner', label: 'Beginner — explain everything' },
  { value: 'intermediate', label: 'Intermediate — assume basics' },
  { value: 'expert', label: 'Expert — terse + technical' },
];

const TONE_OPTIONS = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
  { value: 'empathetic', label: 'Empathetic' },
  { value: 'concise', label: 'Concise' },
  { value: 'technical', label: 'Technical' },
];

const CHANNEL_OPTIONS = [
  { value: 'web_chat', label: 'Web chat' },
  { value: 'mobile_app', label: 'Mobile app' },
  { value: 'slack', label: 'Slack' },
  { value: 'teams', label: 'MS Teams' },
  { value: 'voice', label: 'Voice (phone)' },
  { value: 'api', label: 'REST API' },
];

// Tool catalogue — these strings flow through to the Router / LLM as
// `allowed_tools` and gate which downstream branches may execute.
const ALL_TOOLS = [
  { value: 'retrieve', label: 'Retrieve', help: 'Vector search a knowledge base.' },
  { value: 'rerank', label: 'Rerank', help: 'Cross-encoder reranking of chunks.' },
  { value: 'cite', label: 'Cite', help: 'Attach source citations to the answer.' },
  { value: 'ticket_lookup', label: 'Ticket lookup', help: 'Query the helpdesk ticket store.' },
  { value: 'tools_exec', label: 'Tools (function-calling)', help: 'Execute registered functions.' },
  { value: 'raw_chunks', label: 'Raw chunks', help: 'Return retrieved chunks verbatim (debug).' },
  { value: 'index_admin', label: 'Index admin', help: 'Mutate the vector index (upsert/delete).' },
];

/**
 * Default config — used by canvasConfig + as the merge base when older
 * payloads are loaded that don't carry the new keys.
 */
export const DEFAULT_USER_CONFIG = {
  preset: 'enterprise-user',
  // Identity & RBAC
  role: 'user',
  tenantId: 'acme-corp',
  userId: '',
  requireAuth: true,
  // Personalisation
  locale: 'en',
  expertise: 'intermediate',
  tone: 'professional',
  // Session
  channel: 'web_chat',
  sessionId: '',
  rememberHistory: true,
  // Capabilities & limits
  allowedTools: ['retrieve', 'rerank', 'cite'],
  rateLimitRpm: 60,
  // Privacy
  consentDataCollection: true,
  consentTraining: false,
};

/**
 * Compose the typed `user_context` payload that downstream nodes consume.
 * Mirrors the buildXxxPayload helpers from sibling panels so the read-only
 * preview block has something concrete to display and Guardrails / Router /
 * LLM nodes can rely on a stable schema.
 */
export function buildUserContextPayload(config = {}) {
  const c = { ...DEFAULT_USER_CONFIG, ...config };
  return {
    step_type: 'user_context',
    metadata: {
      preset: c.preset || 'custom',
      identity: {
        role: c.role,
        tenant_id: c.tenantId || null,
        user_id: c.userId || null,
        require_auth: Boolean(c.requireAuth),
      },
      personalisation: {
        locale: c.locale,
        expertise: c.expertise,
        tone: c.tone,
      },
      session: {
        channel: c.channel,
        session_id: c.sessionId || null,
        remember_history: Boolean(c.rememberHistory),
      },
      capabilities: {
        allowed_tools: Array.isArray(c.allowedTools) ? [...c.allowedTools] : [],
        rate_limit_rpm: Number(c.rateLimitRpm) || 0,
      },
      privacy: {
        consent_data_collection: Boolean(c.consentDataCollection),
        consent_training: Boolean(c.consentTraining),
      },
    },
  };
}

export default function UserSettingsPanel({ value = {}, onChange }) {
  const config = useMemo(() => ({ ...DEFAULT_USER_CONFIG, ...value }), [value]);
  const payload = useMemo(() => buildUserContextPayload(config), [config]);
  const setField = (field, fieldValue) => onChange?.(field, fieldValue);

  const applyPreset = (presetId) => {
    const preset = PERSONA_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setField('preset', preset.id);
    if (preset.id === 'custom') return;
    setField('role', preset.role);
    setField('tenantId', preset.tenantId);
    setField('locale', preset.locale);
    setField('expertise', preset.expertise);
    setField('tone', preset.tone);
    setField('allowedTools', preset.allowedTools);
    setField('rateLimitRpm', preset.rateLimitRpm);
    setField('requireAuth', preset.requireAuth);
  };

  const toggleTool = (toolValue, enabled) => {
    const current = new Set(Array.isArray(config.allowedTools) ? config.allowedTools : []);
    if (enabled) current.add(toolValue);
    else current.delete(toolValue);
    setField('allowedTools', [...current]);
    // Switch to custom preset whenever the tool set diverges from a preset.
    if (config.preset !== 'custom') setField('preset', 'custom');
  };

  // Surface RBAC / consent inconsistencies so misconfigurations don't get
  // silently shipped to the runner.
  const warnings = [];
  if (config.role === 'guest' && config.requireAuth) {
    warnings.push('Guest role nem párosítható auth-kötelezővel — vegyél fel valódi role-t.');
  }
  if (config.allowedTools?.includes('index_admin') && config.role !== 'admin') {
    warnings.push('Index admin tool csak admin role-nak adható ki biztonsággal.');
  }
  if (config.consentTraining && !config.consentDataCollection) {
    warnings.push('Training consent feltételezi a data collection consent-et.');
  }
  if (!config.allowedTools || config.allowedTools.length === 0) {
    warnings.push('Egy tool sincs engedélyezve — a felhasználó csak passzív választ kap.');
  }

  return (
    <div className="space-y-3">
      {/* ── Preset picker ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3">
        <div className="flex items-center gap-2">
          <UserCog size={14} className="text-cyan-700" />
          <p className="text-[11px] font-black uppercase tracking-wider text-cyan-800">
            Persona preset (gyors indítás)
          </p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {PERSONA_PRESETS.map((preset) => {
            const Icon = preset.icon || User;
            const active = config.preset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10.5px] font-bold transition ${
                  active
                    ? 'border-cyan-500 bg-cyan-100 text-cyan-900 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:text-cyan-700'
                }`}
              >
                <Icon size={12} className={active ? 'text-cyan-600' : 'text-slate-400'} />
                <span className="truncate">{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Identity & RBAC ─────────────────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <KeyRound size={13} className="text-slate-500" />
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-700">
            Identity &amp; RBAC
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel title="Role" help="A downstream Guardrails / Router node ezt nézi." />
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
            <FieldLabel title="Tenant ID" help="Multi-tenant isolation kulcsa." />
            <div className="relative">
              <Building2
                size={12}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={config.tenantId}
                placeholder="acme-corp"
                onChange={(event) => setField('tenantId', event.target.value)}
                className={`${inputClass} pl-7 font-mono`}
              />
            </div>
          </div>
        </div>

        <div>
          <FieldLabel
            title="User ID"
            help="Opcionális — telemetria és per-user rate limit kulcsa."
          />
          <input
            type="text"
            value={config.userId}
            placeholder="auth0|abc123 (üresen hagyva = anon)"
            onChange={(event) => setField('userId', event.target.value)}
            className={`${inputClass} font-mono`}
          />
        </div>

        <ToggleRow
          checked={config.requireAuth}
          onChange={(v) => setField('requireAuth', v)}
          title="Authentikáció kötelező"
          help="Ha be van kapcsolva, az API ellenőrzi a JWT-t / API kulcsot a kérés előtt."
        />
      </div>

      {/* ── Personalisation ─────────────────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <Globe size={13} className="text-slate-500" />
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-700">
            Personalisation
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <FieldLabel title="Locale" />
            <select
              value={config.locale}
              onChange={(event) => setField('locale', event.target.value)}
              className={inputClass}
            >
              {LOCALE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel title="Expertise" />
            <select
              value={config.expertise}
              onChange={(event) => setField('expertise', event.target.value)}
              className={inputClass}
            >
              {EXPERTISE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel title="Tone" />
            <select
              value={config.tone}
              onChange={(event) => setField('tone', event.target.value)}
              className={inputClass}
            >
              {TONE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Session ─────────────────────────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <Smartphone size={13} className="text-slate-500" />
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-700">
            Session
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel title="Channel" />
            <select
              value={config.channel}
              onChange={(event) => setField('channel', event.target.value)}
              className={inputClass}
            >
              {CHANNEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel
              title="Session ID"
              help="Ha üres, a runner generál egyet (uuid4)."
            />
            <input
              type="text"
              value={config.sessionId}
              placeholder="auto"
              onChange={(event) => setField('sessionId', event.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>

        <ToggleRow
          checked={config.rememberHistory}
          onChange={(v) => setField('rememberHistory', v)}
          title="Conversation history megőrzése"
          help="A korábbi turn-ök bekerülnek a contextbe — multi-turn beszélgetésekhez."
        />
      </div>

      {/* ── Capabilities & rate limit ───────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <Gauge size={13} className="text-slate-500" />
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-700">
            Capabilities &amp; limits
          </p>
        </div>

        <div>
          <FieldLabel
            title="Allowed tools"
            help="Az itt jelölt értékek mennek át a Router és LLM allowed_tools mezőjébe."
          />
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {ALL_TOOLS.map((tool) => (
              <ToggleRow
                key={tool.value}
                checked={config.allowedTools?.includes(tool.value)}
                onChange={(v) => toggleTool(tool.value, v)}
                title={tool.label}
                help={tool.help}
              />
            ))}
          </div>
        </div>

        <div>
          <FieldLabel
            title="Rate limit (req/perc)"
            help="Per-user sliding window. 0 = nincs korlát (csak admin/service esetén ajánlott)."
          />
          <input
            type="number"
            min={0}
            step={5}
            value={config.rateLimitRpm}
            onChange={(event) =>
              setField('rateLimitRpm', Math.max(0, Number(event.target.value) || 0))
            }
            className={inputClass}
          />
        </div>
      </div>

      {/* ── Privacy & consent ───────────────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
        <div className="flex items-center gap-2">
          <User size={13} className="text-violet-700" />
          <p className="text-[11px] font-black uppercase tracking-wider text-violet-800">
            Privacy &amp; consent
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ToggleRow
            checked={config.consentDataCollection}
            onChange={(v) => setField('consentDataCollection', v)}
            title="Telemetria gyűjtése"
            help="Latency, tokens, success rate logolása (anonim)."
          />
          <ToggleRow
            checked={config.consentTraining}
            onChange={(v) => setField('consentTraining', v)}
            title="Training használatra is"
            help="A beszélgetést jövőbeni model fine-tuninghoz fel lehet használni."
          />
        </div>
      </div>

      {/* ── Warnings / OK ───────────────────────────────────────────────── */}
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
          Konfiguráció rendben — minden ellenőrzés zöld.
        </div>
      )}

      {/* ── Read-only payload ───────────────────────────────────────────── */}
      <div>
        <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
          Output payload (read-only)
        </p>
        <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-cyan-300">
{JSON.stringify(payload, null, 2)}
        </pre>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <Zap size={11} className="text-cyan-500" />
        Kimenet: <span className="font-mono">user_context</span> → Question, Guardrails, Router, LLM
      </div>
    </div>
  );
}
