# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────
# Au;ReliA — Hugging Face Spaces (Docker SDK) single-container image
#
# What this build does
# ────────────────────
#   1. `frontend-builder` — Node 22 builds the Vite/React SPA.
#      VITE_XRAG_API_BASE_URL is left EMPTY so the bundle calls the
#      backend on the same origin (relative `/api/...` URLs).
#
#   2. `backend-builder`  — Python 3.12 installs the FastAPI deps into a
#      self-contained virtualenv at /opt/venv (cached layer).
#
#   3. `runtime`          — Python 3.12-slim that:
#        • copies the venv from stage 2,
#        • copies the backend source to /app/app,
#        • copies the built SPA from stage 1 to /app/frontend_dist,
#        • runs as non-root uid 1000 (the user Hugging Face Spaces uses
#          for its persistent /data mount),
#        • listens on port 7860 (Hugging Face's default ingress port).
#
# FastAPI is configured (in `backend/app/main.py`, gated by the
# XRAG_FRONTEND_DIST env var) to serve the SPA on `/` and the API on
# `/api/...`, so a single port is enough — perfect for HF Spaces, which
# only exposes one HTTP port per Space.
#
# Persistent data
# ───────────────
# Hugging Face Spaces with the "Persistent Storage" upgrade mounts a
# writable volume at /data. Our backend respects XRAG_DATA_DIR=/data, so
# users.json, api_keys.json, knowledge/uploads, etc. survive restarts.
# Without persistent storage, the same path is just ephemeral scratch
# space — the Space still works, but data is wiped on rebuild.
# ─────────────────────────────────────────────────────────────────────────


# ── Stage 1: frontend-builder ───────────────────────────────────────────
FROM node:22-alpine AS frontend-builder

WORKDIR /build

COPY frontend/package.json frontend/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Empty base URL → same-origin relative requests (`/api/...`).
# The xragApi.js client falls back to `http://localhost:8000` only when
# the env var is undefined; setting it to "" disables that fallback.
ARG VITE_XRAG_API_BASE_URL=""
ENV VITE_XRAG_API_BASE_URL=$VITE_XRAG_API_BASE_URL

COPY frontend/ ./
# Skip `tsc -b` (the project is .jsx, no TS inputs) and run vite directly.
RUN npx --no-install vite build


# ── Stage 2: backend-builder ────────────────────────────────────────────
FROM python:3.12-slim AS backend-builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
        libffi-dev \
        libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY backend/requirements.txt ./requirements.txt
RUN pip install --upgrade pip setuptools wheel \
 && pip install --no-cache-dir -r requirements.txt


# ── Stage 3: runtime ────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    XRAG_DATA_DIR=/data \
    XRAG_FRONTEND_DIST=/app/frontend_dist \
    PORT=7860 \
    UVICORN_LOG_LEVEL=info

# Native runtime deps for OCR / PDF / image pipelines.
RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        poppler-utils \
        libgl1 \
        libglib2.0-0 \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces runs containers as uid 1000 by default and that's
# also the owner of the (optional) persistent /data mount. Match it so
# we can write users.json, .auth_secret, knowledge/uploads, etc.
RUN groupadd --system --gid 1000 aurelia \
 && useradd  --system --uid 1000 --gid aurelia --home /app aurelia

WORKDIR /app

COPY --from=backend-builder /opt/venv /opt/venv
COPY --chown=aurelia:aurelia backend/app                  ./app
COPY --chown=aurelia:aurelia --from=frontend-builder /build/dist  ./frontend_dist

RUN mkdir -p /data && chown aurelia:aurelia /data
VOLUME ["/data"]

USER aurelia

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl --fail --silent http://localhost:7860/health || exit 1

# Use the dual-stack launcher; PORT=7860 makes it bind on the HF ingress port.
CMD ["python", "-m", "app._serve"]
