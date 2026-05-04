/**
 * AuthScreen — entry surface for Aurelia.
 *
 * Layout:
 *   • Default view = a single Sign-in card on a black, responsive canvas.
 *   • A "Create an account" link opens a modal that handles BOTH the
 *     register step and the follow-up verification step in sequence
 *     (verification only happens once, immediately after registration).
 *   • On a successful login OR verification the parent receives the
 *     authenticated user via the onAuthenticated callback.
 */

import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { xragApi, setAuthToken } from '../../services/xragApi';

const BRAND = 'Aurelia';

const fieldClass =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-amber-400/60 focus:bg-white/[0.06] focus:ring-2 focus:ring-amber-400/30';

const labelClass =
  'mb-1 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-amber-200/70';

export default function AuthScreen({ onAuthenticated }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [registerOpen, setRegisterOpen] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const handleAuthSuccess = (response) => {
    setAuthToken(response.token);
    onAuthenticated?.(response.user, response.token);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await xragApi.authLogin({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      handleAuthSuccess(res);
    } catch (err) {
      if (err.status === 403) {
        // Unverified — open the modal directly into the verify step.
        setError(null);
        setRegisterOpen({ initialStep: 'verify', email: loginEmail.trim() });
      } else {
        setError(err.message || 'Login failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 bottom-0 h-[28rem] w-[28rem] rounded-full bg-amber-700/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(217,119,6,0.18),transparent_60%)]"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-5 py-10 sm:px-6">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src="/aurelia.png"
            alt={BRAND}
            draggable="false"
            className="mb-2 h-44 w-auto max-w-full select-none object-contain drop-shadow-[0_15px_40px_rgba(217,119,6,0.5)] sm:h-56 md:h-64"
          />
          <p className="mt-1 text-[12px] text-white/50 sm:text-sm">
            Sign in to your workspace
          </p>
        </div>

        <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-md sm:p-8">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent"
          />

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-[12px] font-semibold text-rose-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className={labelClass}>
                <Mail size={11} /> Email <RequiredMark />
              </label>
              <InputWithIcon
                icon={Mail}
                type="email"
                autoComplete="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className={labelClass}>
                <Lock size={11} /> Password <RequiredMark />
              </label>
              <PasswordInput
                autoComplete="current-password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <SubmitButton busy={busy} label="Sign in" icon={LogIn} />
          </form>

          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
              new here?
            </span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <button
            type="button"
            onClick={() => setRegisterOpen({ initialStep: 'register' })}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-2.5 text-sm font-bold text-amber-200 transition hover:border-amber-400/60 hover:bg-amber-400/10 hover:text-amber-100"
          >
            <UserPlus size={15} />
            Create an account
          </button>
        </div>

        <p className="mt-6 text-center text-[10px] uppercase tracking-wider text-white/30">
          <Lock size={9} className="mr-1 inline-block" />
          PBKDF2 · 200k iterations · per-user salt
        </p>
      </div>

      {registerOpen && (
        <RegisterModal
          initialStep={registerOpen.initialStep || 'register'}
          initialEmail={registerOpen.email || ''}
          onClose={() => setRegisterOpen(false)}
          onAuthSuccess={handleAuthSuccess}
        />
      )}
    </div>
  );
}

/* ─── Register / Verify modal ─────────────────────────────────────── */

const RegisterModal = ({ initialStep, initialEmail, onClose, onAuthSuccess }) => {
  const [step, setStep] = useState(initialStep);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  // NOTE: when SMTP isn't configured / dev mode is on, the backend still
  // returns the verification code in the response body — but we no longer
  // surface it in the UI. Developers can read it from the Network tab,
  // from `fly logs --app aurelia-backend`, or from the JSON store.

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');

  const [code, setCode] = useState('');

  const reset = () => {
    setError(null);
    setInfo(null);
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    reset();
    if (password !== passwordConfirm) {
      setError('Passwords do not match. Please re-enter them.');
      return;
    }
    setBusy(true);
    try {
      const res = await xragApi.authRegister({
        email: email.trim(),
        password,
        display_name: displayName.trim(),
        full_name: fullName.trim() || null,
        organization: organization.trim() || null,
      });
      setStep('verify');
      setInfo(res.message);
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (event) => {
    event.preventDefault();
    reset();
    setBusy(true);
    try {
      const res = await xragApi.authVerify({
        email: email.trim(),
        code: code.trim().toUpperCase(),
      });
      onAuthSuccess(res);
    } catch (err) {
      setError(err.message || 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    reset();
    setBusy(true);
    try {
      const res = await xragApi.authResendCode(email.trim());
      setInfo(res.message);
    } catch (err) {
      setError(err.message || 'Could not send a new code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9)]">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent"
        />

        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                step === 'register'
                  ? 'bg-amber-400/15 text-amber-300'
                  : 'bg-emerald-400/15 text-emerald-300'
              }`}
            >
              {step === 'register' ? <UserPlus size={18} /> : <ShieldCheck size={18} />}
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight text-white">
                {step === 'register' ? 'Create your account' : 'Verify your email'}
              </h2>
              <p className="text-[11px] text-white/50">
                {step === 'register'
                  ? `Join ${BRAND} — verification only happens once.`
                  : 'Enter the 8-character code we just sent you.'}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <StepDot active label="Account" done={step === 'verify'} />
            <div className="h-px flex-1 bg-white/10" />
            <StepDot active={step === 'verify'} label="Verify" />
          </div>
        </div>

        <div className="px-6 py-5">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-[12px] font-semibold text-rose-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {info && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-[12px] font-semibold text-emerald-200">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
              <span>{info}</span>
            </div>
          )}

          {step === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <label className={labelClass}>
                  <User size={11} /> Display name <RequiredMark />
                </label>
                <InputWithIcon
                  icon={User}
                  type="text"
                  required
                  minLength={2}
                  maxLength={64}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How should we greet you?"
                />
              </div>

              <div>
                <label className={labelClass}>
                  <Mail size={11} /> Email <RequiredMark />
                </label>
                <InputWithIcon
                  icon={Mail}
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className={labelClass}>
                  <Lock size={11} /> Password <RequiredMark />
                </label>
                <PasswordInput
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 chars · letter + digit"
                />
              </div>

              <div>
                <label className={labelClass}>
                  <Lock size={11} /> Confirm password <RequiredMark />
                </label>
                <PasswordInput
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="Re-enter your password"
                />
                {passwordConfirm && password !== passwordConfirm && (
                  <p className="mt-1 text-[11px] font-semibold text-rose-300">
                    Passwords do not match.
                  </p>
                )}
                {passwordConfirm && password === passwordConfirm && password.length >= 8 && (
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300">
                    <CheckCircle2 size={11} /> Passwords match.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>
                    <User size={11} /> Full name
                    <span className="ml-auto opacity-60">opt.</span>
                  </label>
                  <InputWithIcon
                    icon={User}
                    type="text"
                    maxLength={128}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jane Doe"
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    <Building2 size={11} /> Organization
                    <span className="ml-auto opacity-60">opt.</span>
                  </label>
                  <InputWithIcon
                    icon={Building2}
                    type="text"
                    maxLength={128}
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="Acme Corp."
                  />
                </div>
              </div>

              <p className="text-[10px] text-white/40">
                <RequiredMark /> Required field
              </p>

              <SubmitButton busy={busy} label="Continue" icon={ArrowRight} />
            </form>
          )}

          {step === 'verify' && (
            <form onSubmit={handleVerify} className="space-y-3">
              <div>
                <label className={labelClass}>
                  <Mail size={11} /> Email <RequiredMark />
                </label>
                <InputWithIcon
                  icon={Mail}
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className={labelClass}>
                  <ShieldCheck size={11} /> Verification code <RequiredMark />
                </label>
                <input
                  type="text"
                  required
                  autoComplete="one-time-code"
                  minLength={4}
                  maxLength={16}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABCD1234"
                  className={`${fieldClass} text-center font-mono text-lg tracking-[0.4em]`}
                />
              </div>

              <SubmitButton busy={busy} label="Verify & sign in" icon={CheckCircle2} />

              <button
                type="button"
                onClick={handleResend}
                disabled={busy || !email}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-bold text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={12} />
                Send a new code
              </button>
            </form>
          )}
        </div>

        <div className="border-t border-white/10 bg-white/[0.02] px-6 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-white/40">
          <Sparkles size={10} className="mr-1 inline-block text-amber-300/60" />
          One-time verification keeps your workspace secure
        </div>
      </div>
    </div>
  );
};

/* ─── Sub-components ─────────────────────────────────────────────── */

const StepDot = ({ active, done, label }) => (
  <div className="flex items-center gap-1.5">
    <span
      className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-black ${
        done
          ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-300'
          : active
          ? 'border-amber-400/60 bg-amber-400/15 text-amber-300'
          : 'border-white/15 bg-white/5 text-white/40'
      }`}
    >
      {done ? <CheckCircle2 size={11} /> : null}
    </span>
    <span
      className={`text-[10px] font-bold uppercase tracking-wider ${
        active || done ? 'text-white/80' : 'text-white/40'
      }`}
    >
      {label}
    </span>
  </div>
);

const SubmitButton = ({ busy, label, icon: Icon }) => (
  <button
    type="submit"
    disabled={busy}
    className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-4 py-2.5 text-sm font-bold text-black shadow-lg shadow-amber-500/20 transition hover:from-amber-300 hover:to-orange-400 hover:shadow-amber-500/30 disabled:cursor-not-allowed disabled:opacity-60"
  >
    {busy ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />}
    {label}
  </button>
);

const InputWithIcon = ({ icon: Icon, ...props }) => (
  <div className="relative">
    <Icon
      size={14}
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-amber-300/70"
    />
    <input {...props} className={`${fieldClass} pl-9`} />
  </div>
);

const PasswordInput = (props) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Lock
        size={14}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-amber-300/70"
      />
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`${fieldClass} pl-9 pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-white/40 transition hover:bg-white/10 hover:text-amber-200"
      >
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
};

const RequiredMark = () => (
  <span aria-label="required" className="text-rose-400/90">*</span>
);
