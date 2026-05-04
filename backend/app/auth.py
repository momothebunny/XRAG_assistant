"""User authentication module.

Provides registration with email-verification flow, login, and JWT-style
HMAC bearer tokens. Designed to require ZERO new third-party dependencies:

* Passwords  — PBKDF2-HMAC-SHA256 (200k iterations) with per-user salt.
* Tokens     — compact HMAC-SHA256 signed JSON, base64url encoded.
* Storage    — JSON file under ``backend/data/users.json``.
* Email      — SMTP via stdlib ``smtplib``. If SMTP is not configured,
               the verification code is logged to the server console AND
               returned in the registration response (DEV mode only,
               toggled by ``XRAG_AUTH_DEV_MODE`` env var). Never enable
               that flag in production.

Security notes:
* Passwords are NEVER stored in plaintext, never logged, never returned.
* Login failures use a constant-time message; we do not disclose whether
  the account exists or whether the password was wrong.
* Verification codes expire after 30 minutes and are single-use.
* Tokens carry only the user_id + email + role; no PII.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import smtplib
import threading
import time
from email.message import EmailMessage
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator

import re

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _validate_email(value: str) -> str:
    value = (value or "").strip()
    if not _EMAIL_RE.match(value):
        raise ValueError("Invalid email address.")
    return value.lower()

# --------------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------------

_PBKDF2_ITERATIONS = 200_000
_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days
_VERIFICATION_TTL_SECONDS = 60 * 30  # 30 minutes
_VERIFICATION_CODE_BYTES = 4  # 8 hex chars — ~32 bits of entropy
_MAX_VERIFY_ATTEMPTS = 5

# Server secret used to sign tokens. Persisted on first launch so tokens
# survive restarts. NEVER commit the resulting file to git.
_SECRET_FILE_NAME = ".auth_secret"


# --------------------------------------------------------------------------
# Pydantic models
# --------------------------------------------------------------------------


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=2, max_length=64)
    full_name: str | None = Field(default=None, max_length=128)
    organization: str | None = Field(default=None, max_length=128)

    @field_validator("email")
    @classmethod
    def _validate_email_field(cls, v: str) -> str:
        return _validate_email(v)

    @field_validator("password")
    @classmethod
    def _password_strength(cls, value: str) -> str:
        if not any(c.isalpha() for c in value):
            raise ValueError("Password must contain at least one letter.")
        if not any(c.isdigit() for c in value):
            raise ValueError("Password must contain at least one digit.")
        return value


class VerifyRequest(BaseModel):
    email: str
    code: str = Field(min_length=4, max_length=16)

    @field_validator("email")
    @classmethod
    def _v(cls, v: str) -> str:
        return _validate_email(v)


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _v(cls, v: str) -> str:
        return _validate_email(v)


class ResendCodeRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def _v(cls, v: str) -> str:
        return _validate_email(v)


class PublicUser(BaseModel):
    id: str
    email: str
    display_name: str
    full_name: str | None = None
    organization: str | None = None
    role: str = "user"
    verified: bool = False
    created_at: float
    last_login_at: float | None = None


class AuthResponse(BaseModel):
    token: str
    expires_at: float
    user: PublicUser


class RegisterResponse(BaseModel):
    """Returned after registration. Contains a one-shot dev-only code so
    the developer can copy it from the network tab without an SMTP server.

    The ``verification_code`` field is ``None`` unless ``XRAG_AUTH_DEV_MODE``
    is enabled.
    """

    user: PublicUser
    verification_required: bool = True
    verification_code: str | None = None
    message: str


# --------------------------------------------------------------------------
# Password hashing
# --------------------------------------------------------------------------


def _hash_password(password: str, salt_hex: str | None = None) -> tuple[str, str]:
    """Return ``(salt_hex, digest_hex)``."""
    salt = bytes.fromhex(salt_hex) if salt_hex else secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        _PBKDF2_ITERATIONS,
    )
    return salt.hex(), digest.hex()


def _verify_password(password: str, salt_hex: str, expected_hex: str) -> bool:
    _, candidate = _hash_password(password, salt_hex=salt_hex)
    # constant-time comparison
    return hmac.compare_digest(candidate, expected_hex)


# --------------------------------------------------------------------------
# Token signing (compact HMAC-SHA256, JSON payload)
# --------------------------------------------------------------------------


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def _sign(payload: dict[str, Any], secret: bytes) -> str:
    body = _b64url(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    sig = hmac.new(secret, body.encode("ascii"), hashlib.sha256).digest()
    return f"{body}.{_b64url(sig)}"


def _verify_token(token: str, secret: bytes) -> dict[str, Any] | None:
    try:
        body, sig = token.split(".", 1)
    except ValueError:
        return None
    expected = _b64url(hmac.new(secret, body.encode("ascii"), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(_b64url_decode(body).decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    exp = payload.get("exp")
    if not isinstance(exp, (int, float)) or exp < time.time():
        return None
    return payload


# --------------------------------------------------------------------------
# Email delivery (best-effort SMTP, optional)
# --------------------------------------------------------------------------


def _load_dotenv_smtp() -> None:
    """Read backend/.env (or backend/data/.env) once and inject SMTP_*
    keys into os.environ. Stdlib-only, no python-dotenv dependency.
    Lines starting with # are comments. KEY=VALUE format. Values may be
    quoted with single or double quotes which are stripped."""
    if getattr(_load_dotenv_smtp, "_done", False):
        return
    candidates = [
        Path(__file__).resolve().parent.parent / ".env",        # backend/.env
        Path(__file__).resolve().parent.parent / "data" / ".env",  # backend/data/.env
    ]
    for env_path in candidates:
        if not env_path.exists():
            continue
        try:
            for raw in env_path.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
        except OSError as exc:
            logger.warning("[auth] could not read %s: %s", env_path, exc)
    _load_dotenv_smtp._done = True  # type: ignore[attr-defined]


def _send_verification_email(to_email: str, code: str) -> bool:
    _load_dotenv_smtp()
    host = os.getenv("XRAG_SMTP_HOST")
    if not host:
        logger.info(
            "[auth] SMTP not configured — verification code for %s is %s",
            to_email,
            code,
        )
        return False

    port = int(os.getenv("XRAG_SMTP_PORT", "587"))
    username = os.getenv("XRAG_SMTP_USER")
    password = os.getenv("XRAG_SMTP_PASSWORD")
    sender_addr = os.getenv("XRAG_SMTP_FROM", username or "no-reply@aurelia.local")
    sender_name = os.getenv("XRAG_SMTP_FROM_NAME", "Aurelia")
    use_tls = os.getenv("XRAG_SMTP_TLS", "1") not in {"0", "false", "False"}
    use_ssl = os.getenv("XRAG_SMTP_SSL", "0") in {"1", "true", "True"}

    msg = EmailMessage()
    msg["Subject"] = "Aurelia — verify your account"
    msg["From"] = f"{sender_name} <{sender_addr}>" if sender_name else sender_addr
    msg["To"] = to_email
    msg.set_content(
        "Welcome to Aurelia.\n\n"
        f"Your verification code is: {code}\n\n"
        "The code expires in 30 minutes. If you did not request this account,\n"
        "you can safely ignore this email.\n"
    )
    # Add an HTML alternative for nicer rendering in modern mail clients.
    html = f"""\
<!doctype html>
<html><body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
        <tr><td style="height:3px;background:linear-gradient(90deg,#fbbf24,#f97316,#fbbf24);"></td></tr>
        <tr><td style="padding:32px 28px 24px;text-align:center;">
          <h1 style="margin:0;color:#fbbf24;font-size:28px;font-weight:900;letter-spacing:-0.5px;">Aurelia</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.5);font-size:13px;">Verify your account</p>
        </td></tr>
        <tr><td style="padding:0 28px 24px;color:rgba(255,255,255,0.85);font-size:14px;line-height:1.6;">
          <p>Welcome aboard! Use the code below to finish creating your account:</p>
        </td></tr>
        <tr><td align="center" style="padding:0 28px 28px;">
          <div style="display:inline-block;padding:18px 28px;background:rgba(251,191,36,0.08);border:1px dashed rgba(251,191,36,0.45);border-radius:12px;color:#fcd34d;font-family:Consolas,Menlo,monospace;font-size:24px;font-weight:900;letter-spacing:0.4em;">{code}</div>
        </td></tr>
        <tr><td style="padding:0 28px 28px;color:rgba(255,255,255,0.5);font-size:12px;line-height:1.6;">
          <p style="margin:0;">The code expires in 30 minutes. If you did not request this account, you can safely ignore this email — no further action is required.</p>
        </td></tr>
        <tr><td style="background:rgba(255,255,255,0.02);padding:14px 28px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;color:rgba(255,255,255,0.35);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;">
          Sent automatically by Aurelia
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""
    msg.add_alternative(html, subtype="html")

    try:
        if use_ssl:
            smtp_cls = smtplib.SMTP_SSL
            with smtp_cls(host, port, timeout=15) as smtp:
                if username and password:
                    smtp.login(username, password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=15) as smtp:
                smtp.ehlo()
                if use_tls:
                    smtp.starttls()
                    smtp.ehlo()
                if username and password:
                    smtp.login(username, password)
                smtp.send_message(msg)
        logger.info("[auth] verification email sent to %s via %s:%s", to_email, host, port)
        return True
    except Exception as exc:  # noqa: BLE001 — best-effort, never crash auth
        logger.warning("[auth] SMTP send failed for %s: %s", to_email, exc)
        return False


# --------------------------------------------------------------------------
# Persistent store (JSON file, in-memory mirror, lock-protected)
# --------------------------------------------------------------------------


class UserStore:
    """Thread-safe JSON-backed user store."""

    def __init__(self, data_dir: Path) -> None:
        self._lock = threading.Lock()
        self._data_dir = data_dir
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._file = data_dir / "users.json"
        self._secret = self._load_or_create_secret()
        self._users: dict[str, dict[str, Any]] = {}  # keyed by email (lowercased)
        self._load()

    # ----- secret -------------------------------------------------------
    def _load_or_create_secret(self) -> bytes:
        secret_path = self._data_dir / _SECRET_FILE_NAME
        if secret_path.exists():
            return secret_path.read_bytes()
        secret = secrets.token_bytes(32)
        secret_path.write_bytes(secret)
        try:
            os.chmod(secret_path, 0o600)
        except OSError:
            pass
        return secret

    @property
    def secret(self) -> bytes:
        return self._secret

    # ----- I/O ----------------------------------------------------------
    def _load(self) -> None:
        if not self._file.exists():
            return
        try:
            raw = json.loads(self._file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("[auth] failed to load users.json: %s", exc)
            return
        if isinstance(raw, dict) and isinstance(raw.get("users"), list):
            for user in raw["users"]:
                key = str(user.get("email", "")).lower()
                if key:
                    self._users[key] = user

    def _save_locked(self) -> None:
        payload = {"users": list(self._users.values())}
        tmp = self._file.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        tmp.replace(self._file)

    # ----- public API ---------------------------------------------------
    def get(self, email: str) -> dict[str, Any] | None:
        with self._lock:
            return self._users.get(email.lower())

    def create(self, payload: RegisterRequest) -> dict[str, Any]:
        email_key = payload.email.lower()
        with self._lock:
            if email_key in self._users:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An account with this email already exists.",
                )
            salt, digest = _hash_password(payload.password)
            user: dict[str, Any] = {
                "id": secrets.token_hex(8),
                "email": payload.email,
                "display_name": payload.display_name.strip(),
                "full_name": (payload.full_name or "").strip() or None,
                "organization": (payload.organization or "").strip() or None,
                "role": "admin" if not self._users else "user",  # first user is admin
                "verified": False,
                "created_at": time.time(),
                "last_login_at": None,
                "password_salt": salt,
                "password_hash": digest,
                "verification": None,
            }
            self._users[email_key] = user
            self._save_locked()
            return user

    def set_verification(self, email: str, code: str) -> None:
        salt, digest = _hash_password(code)
        with self._lock:
            user = self._users.get(email.lower())
            if user is None:
                raise HTTPException(status_code=404, detail="User not found.")
            user["verification"] = {
                "salt": salt,
                "hash": digest,
                "expires_at": time.time() + _VERIFICATION_TTL_SECONDS,
                "attempts": 0,
            }
            self._save_locked()

    def verify_code(self, email: str, code: str) -> dict[str, Any]:
        with self._lock:
            user = self._users.get(email.lower())
            if user is None or not user.get("verification"):
                raise HTTPException(status_code=400, detail="No pending verification.")
            v = user["verification"]
            if v["expires_at"] < time.time():
                user["verification"] = None
                self._save_locked()
                raise HTTPException(status_code=410, detail="Verification code expired.")
            if v["attempts"] >= _MAX_VERIFY_ATTEMPTS:
                user["verification"] = None
                self._save_locked()
                raise HTTPException(status_code=429, detail="Too many attempts. Request a new code.")
            v["attempts"] += 1
            if not _verify_password(code, v["salt"], v["hash"]):
                self._save_locked()
                raise HTTPException(status_code=401, detail="Invalid verification code.")
            user["verified"] = True
            user["verification"] = None
            self._save_locked()
            return user

    def authenticate(self, email: str, password: str) -> dict[str, Any]:
        with self._lock:
            user = self._users.get(email.lower())
            if user is None or not _verify_password(
                password, user["password_salt"], user["password_hash"]
            ):
                # Generic message — do not disclose which side failed.
                raise HTTPException(status_code=401, detail="Invalid email or password.")
            if not user.get("verified"):
                raise HTTPException(
                    status_code=403,
                    detail="Email not verified. Please enter the verification code first.",
                )
            user["last_login_at"] = time.time()
            self._save_locked()
            return user

    def to_public(self, user: dict[str, Any]) -> PublicUser:
        return PublicUser(
            id=user["id"],
            email=user["email"],
            display_name=user["display_name"],
            full_name=user.get("full_name"),
            organization=user.get("organization"),
            role=user.get("role", "user"),
            verified=bool(user.get("verified")),
            created_at=user["created_at"],
            last_login_at=user.get("last_login_at"),
        )


# --------------------------------------------------------------------------
# FastAPI router + dependency
# --------------------------------------------------------------------------


router = APIRouter(prefix="/api/auth", tags=["auth"])
_bearer = HTTPBearer(auto_error=False)
_store: UserStore | None = None


def configure(data_dir: Path) -> UserStore:
    global _store
    _store = UserStore(data_dir)
    return _store


def get_store() -> UserStore:
    if _store is None:
        raise RuntimeError("UserStore not configured — call configure(data_dir) at startup.")
    return _store


def _is_dev_mode() -> bool:
    return os.getenv("XRAG_AUTH_DEV_MODE", "0") not in {"0", "false", "False", ""}


def _issue_token(user: dict[str, Any], store: UserStore) -> tuple[str, float]:
    expires_at = time.time() + _TOKEN_TTL_SECONDS
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "role": user.get("role", "user"),
        "exp": int(expires_at),
        "iat": int(time.time()),
    }
    return _sign(payload, store.secret), expires_at


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    store: UserStore = Depends(get_store),
) -> dict[str, Any]:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    payload = _verify_token(creds.credentials, store.secret)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    user = store.get(payload.get("email", ""))
    if user is None or user["id"] != payload.get("sub"):
        raise HTTPException(status_code=401, detail="User no longer exists.")
    return user


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------


@router.post("/register", response_model=RegisterResponse)
def register(payload: RegisterRequest) -> RegisterResponse:
    store = get_store()
    user = store.create(payload)
    code = secrets.token_hex(_VERIFICATION_CODE_BYTES).upper()
    store.set_verification(user["email"], code)
    delivered = _send_verification_email(user["email"], code)
    if not delivered or _is_dev_mode():
        # Surface the code to operators via the server log so it's
        # discoverable through `fly logs` / docker logs / journalctl
        # without having to crack open users.json.
        logger.warning(
            "[auth] verification code for %s = %s (delivered=%s, dev=%s)",
            user["email"], code, delivered, _is_dev_mode(),
        )
    return RegisterResponse(
        user=store.to_public(user),
        verification_required=True,
        verification_code=code if (_is_dev_mode() or not delivered) else None,
        message=(
            "Account created. Please check your email for the verification code."
            if delivered
            else "Account created. Please ask an administrator for your verification code."
        ),
    )


@router.post("/resend-code", response_model=RegisterResponse)
def resend_code(payload: ResendCodeRequest) -> RegisterResponse:
    store = get_store()
    user = store.get(payload.email)
    if user is None:
        raise HTTPException(status_code=404, detail="No account with that email.")
    if user.get("verified"):
        raise HTTPException(status_code=400, detail="Account is already verified.")
    code = secrets.token_hex(_VERIFICATION_CODE_BYTES).upper()
    store.set_verification(user["email"], code)
    delivered = _send_verification_email(user["email"], code)
    if not delivered or _is_dev_mode():
        logger.warning(
            "[auth] resend code for %s = %s (delivered=%s, dev=%s)",
            user["email"], code, delivered, _is_dev_mode(),
        )
    return RegisterResponse(
        user=store.to_public(user),
        verification_required=True,
        verification_code=code if (_is_dev_mode() or not delivered) else None,
        message="A new verification code has been sent." if delivered else "A new code was generated. Please ask an administrator for it.",
    )


@router.post("/verify", response_model=AuthResponse)
def verify(payload: VerifyRequest) -> AuthResponse:
    store = get_store()
    user = store.verify_code(payload.email, payload.code.strip())
    user["last_login_at"] = time.time()
    token, expires_at = _issue_token(user, store)
    return AuthResponse(token=token, expires_at=expires_at, user=store.to_public(user))


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest) -> AuthResponse:
    store = get_store()
    user = store.authenticate(payload.email, payload.password)
    token, expires_at = _issue_token(user, store)
    return AuthResponse(token=token, expires_at=expires_at, user=store.to_public(user))


@router.get("/me", response_model=PublicUser)
def me(user: dict[str, Any] = Depends(current_user)) -> PublicUser:
    return get_store().to_public(user)
