/**
 * PiiRedactionSettingsPanel — Safety / PII redaction inspector.
 *
 * Visual language: same modern atoms as the LLM (amber) / Retriever (cyan) /
 * VectorDB (emerald) / Embedding (sky) panels — hero card, sectioned cards,
 * ToggleChip pills, validation strip, payload preview, footer. ROSE palette
 * to mirror the `process-pii-redaction` node colour
 * (`bg-rose-50 border-rose-200 text-rose-700`).
 *
 * UX contract:
 *   • Detector toggles for each PII class (email, phone, ID, name, address,
 *     credit card, IBAN). Toggling one immediately previews the effect.
 *   • Replacement-mask input — user-customisable token (e.g. [REDACTED]).
 *   • Whitelist regex so domain-internal patterns (e.g. ticket IDs) survive.
 *
 * BACKEND CONTRACT (`process-pii-redaction` in `backend/app/canvas/nodes.py`):
 *   { redactEmails, redactPhones, redactIds, redactNames, redactAddresses,
 *     redactCreditCards, redactIbans, mask, whitelistPattern }
 */

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  AtSign,
  CheckCircle2,
  CircleHelp,
  CreditCard,
  Eye,
  Fingerprint,
  Hash,
  MapPin,
  Phone,
  Shield,
  ShieldCheck,
  User as UserIcon,
  Zap,
} from 'lucide-react';

const DETECTORS = [
  { id: 'redactEmails',      label: 'Emails',        Icon: AtSign,      hint: 'name@domain.com' },
  { id: 'redactPhones',      label: 'Phone numbers', Icon: Phone,       hint: '+36 30 1234567' },
  { id: 'redactIds',         label: 'ID numbers',    Icon: Hash,        hint: 'national / tax IDs' },
  { id: 'redactNames',       label: 'Person names',  Icon: UserIcon,    hint: 'capitalised pairs' },
  { id: 'redactAddresses',   label: 'Addresses',     Icon: MapPin,      hint: 'street, city, ZIP' },
  { id: 'redactCreditCards', label: 'Credit cards',  Icon: CreditCard,  hint: 'card-like 13-19 digits' },
  { id: 'redactIbans',       label: 'IBANs',         Icon: Fingerprint, hint: 'banking IBAN' },
];

// JS-side mirror of the backend regex set so the preview matches what the
// runtime actually produces. Keep in sync with `_exec_pii` in
// `backend/app/canvas/nodes.py`.
const PATTERNS = {
  redactEmails:      /[\w.+-]+@[\w-]+\.[\w.-]+/g,
  redactPhones:      /\+?\d[\d\s\-()]{6,}\d/g,
  redactIds:         /\b\d{8,12}\b/g,
  redactNames:       /\b[A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]{1,}\s+[A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]{1,}\b/g,
  redactAddresses:   /\b\d{1,4}\s?[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű.\- ]{3,}\b(?:\s+\d{4,5})?/g,
  redactCreditCards: /\b(?:\d[ -]*?){13,19}\b/g,
  redactIbans:       /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){4,7}\b/g,
};

export const buildPiiRedactionPayload = (config) => ({
  redactEmails:      Boolean(config?.redactEmails ?? true),
  redactPhones:      Boolean(config?.redactPhones ?? true),
  redactIds:         Boolean(config?.redactIds ?? true),
  redactNames:       Boolean(config?.redactNames ?? false),
  redactAddresses:   Boolean(config?.redactAddresses ?? false),
  redactCreditCards: Boolean(config?.redactCreditCards ?? true),
  redactIbans:       Boolean(config?.redactIbans ?? true),
  mask:              String(config?.mask ?? '[REDACTED]'),
  whitelistPattern:  String(config?.whitelistPattern ?? ''),
});

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-200/50';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {title}
    </label>
    {help && (
      <span title={help} className="cursor-help text-slate-300 hover:text-rose-500">
        <CircleHelp size={11} />
      </span>
    )}
  </div>
);

const ToggleChip = ({ checked, onChange, label, help, Icon }) => (
  <button
    type="button"
    title={help}
    aria-pressed={Boolean(checked)}
    onClick={() => onChange?.(!checked)}
    className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
      checked
        ? 'border-rose-300 bg-rose-50 text-rose-800 shadow-sm shadow-rose-200/40'
        : 'border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:text-rose-700'
    }`}
  >
    {Icon ? (
      <Icon
        size={11}
        className={checked ? 'text-rose-600' : 'text-slate-400 group-hover:text-rose-500'}
      />
    ) : (
      <span
        aria-hidden
        className={`inline-block h-2 w-2 rounded-full transition ${
          checked ? 'bg-rose-500' : 'bg-slate-300 group-hover:bg-rose-300'
        }`}
      />
    )}
    {label}
  </button>
);

function StatPill({ label, hint, ok = true, Icon }) {
  return (
    <div
      className={`rounded-lg border px-2 py-1.5 text-[10px] ${
        ok
          ? 'border-rose-200 bg-rose-50 text-rose-800'
          : 'border-slate-200 bg-white text-slate-500'
      }`}
    >
      <div className="flex items-center gap-1">
        <Icon size={10} />
        <p className="font-bold">{label}</p>
      </div>
      <p className="mt-0.5 truncate font-mono text-[9px]">{hint}</p>
    </div>
  );
}

function runRedaction(text, payload) {
  if (!text) return '';
  let out = text;
  const sentinels = [];
  if (payload.whitelistPattern) {
    try {
      const wl = new RegExp(payload.whitelistPattern, 'g');
      out = out.replace(wl, (m) => {
        sentinels.push(m);
        return `\u0000WL${sentinels.length - 1}\u0000`;
      });
    } catch {
      // Invalid regex → ignore the whitelist for the preview.
    }
  }
  for (const det of DETECTORS) {
    if (payload[det.id]) {
      out = out.replace(PATTERNS[det.id], payload.mask);
    }
  }
  if (sentinels.length) {
    out = out.replace(/\u0000WL(\d+)\u0000/g, (_, i) => sentinels[Number(i)]);
  }
  return out;
}

const DEFAULT_SAMPLE =
  'Hi, I\'m Anna Kovacs. Call me at +36 30 1234567 or mail mary.smith@example.com. ' +
  'My ID 8012105678 and card 4111 1111 1111 1111. ' +
  'Address: Bem rkp 12, 1011 Budapest. IBAN: HU42 1177 3016 1111 1018 0000 0000.';

export default function PiiRedactionSettingsPanel({ value = {}, onChange }) {
  const setField = (field, fieldValue) => onChange?.(field, fieldValue);

  const payload = useMemo(() => buildPiiRedactionPayload(value), [value]);

  const enabledCount = DETECTORS.filter((d) => payload[d.id]).length;
  const mask = payload.mask;

  const [sample, setSample] = useState(DEFAULT_SAMPLE);
  const preview = useMemo(() => runRedaction(sample, payload), [sample, payload]);

  const warnings = [];
  if (enabledCount === 0) {
    warnings.push('No detectors enabled — this node will pass everything through unchanged.');
  }
  if (!mask.trim()) warnings.push('Replacement mask is empty.');
  if (payload.whitelistPattern) {
    try {
      // eslint-disable-next-line no-new
      new RegExp(payload.whitelistPattern);
    } catch {
      warnings.push('Whitelist pattern is not a valid regular expression.');
    }
  }

  return (
    <div className="space-y-3">
      {/* ── Hero card ───────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rose-300 via-rose-400 to-pink-300"
        />
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-50 to-pink-50 text-rose-600 ring-1 ring-rose-200/60">
            <Shield size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-800">PII Redaction</p>
            <p className="truncate font-mono text-[10.5px] text-slate-500">
              {enabledCount}/{DETECTORS.length} detectors · mask{' '}
              <span className="text-rose-700">{mask || '∅'}</span>
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-rose-700">privacy</span>
            <span className="font-mono text-[10px] text-slate-500">
              {payload.whitelistPattern ? '+ whitelist' : 'no whitelist'}
            </span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-500">
          The <span className="font-semibold text-slate-700">privacy hop</span> — masks
          personal &amp; sensitive fields in retrieved chunks before they reach the LLM
          or get logged. Pure regex, zero latency cost.
        </p>
      </div>

      {/* ── Status contract ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck size={14} className="text-rose-700" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-800">
              Detector summary
            </p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <StatPill
                label="Detectors"
                ok={enabledCount > 0}
                hint={`${enabledCount}/${DETECTORS.length} on`}
                Icon={Shield}
              />
              <StatPill
                label="Mask"
                ok={Boolean(mask)}
                hint={mask || '—'}
                Icon={Eye}
              />
              <StatPill
                label="Whitelist"
                ok={Boolean(payload.whitelistPattern)}
                hint={payload.whitelistPattern ? 'regex set' : 'none'}
                Icon={Hash}
              />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-rose-900/80">
              Allowed input: <span className="font-mono font-semibold">chunks</span>;
              output keeps the same shape with PII replaced by the mask.
            </p>
          </div>
        </div>
      </div>

      {/* ── Detectors ───────────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Shield size={12} className="text-rose-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Detectors
          </h4>
          <span className="ml-auto rounded-full bg-rose-100 px-1.5 py-px text-[9px] font-bold text-rose-700">
            {enabledCount} on
          </span>
        </header>
        <div className="flex flex-wrap gap-1.5">
          {DETECTORS.map((det) => (
            <ToggleChip
              key={det.id}
              checked={Boolean(payload[det.id])}
              onChange={(next) => setField(det.id, next)}
              label={det.label}
              help={det.hint}
              Icon={det.Icon}
            />
          ))}
        </div>
      </section>

      {/* ── Replacement mask + whitelist ───────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Eye size={12} className="text-rose-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Mask &amp; whitelist
          </h4>
        </header>
        <div>
          <FieldLabel
            title="Replacement mask"
            help="Token used to replace each detected PII match."
          />
          <input
            type="text"
            value={value.mask ?? '[REDACTED]'}
            onChange={(event) => setField('mask', event.target.value)}
            className={`${inputClass} font-mono`}
            placeholder="[REDACTED]"
          />
        </div>
        <div>
          <FieldLabel
            title="Whitelist regex"
            help="Anything matching this pattern is preserved (e.g. internal ticket IDs)."
          />
          <input
            type="text"
            value={value.whitelistPattern ?? ''}
            onChange={(event) => setField('whitelistPattern', event.target.value)}
            className={`${inputClass} font-mono`}
            placeholder="\bTICKET-\d+\b"
            spellCheck={false}
          />
        </div>
      </section>

      {/* ── Live preview ────────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Eye size={12} className="text-rose-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Live preview
          </h4>
          <button
            type="button"
            onClick={() => setSample(DEFAULT_SAMPLE)}
            className="ml-auto rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
          >
            Reset sample
          </button>
        </header>
        <div>
          <FieldLabel title="Input" help="Local-only: never leaves the browser." />
          <textarea
            value={sample}
            onChange={(event) => setSample(event.target.value)}
            rows={3}
            className={`${inputClass} resize-y font-mono text-[10.5px]`}
            spellCheck={false}
          />
        </div>
        <div>
          <FieldLabel title="Output (after redaction)" />
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-rose-200 bg-rose-50/40 p-2 font-mono text-[10.5px] leading-relaxed text-rose-900">
{preview || ' '}
          </pre>
        </div>
      </section>

      {/* ── Validation strip ────────────────────────────────────────────── */}
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
        <div className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-rose-800">
          <CheckCircle2 size={11} />
          Configuration valid — ready to redact.
        </div>
      )}

      {/* ── Output payload preview ──────────────────────────────────────── */}
      <details className="rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-rose-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <Zap size={11} className="text-rose-400" />
        Output: <span className="font-mono text-rose-700">chunks</span> → next-node
      </div>
    </div>
  );
}
