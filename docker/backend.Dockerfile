# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────
# Aurelia backend — FastAPI on Python 3.12-slim
#
# Multi-stage build:
#   1. `builder`  — install deps into a venv (cached layer)
#   2. `runtime`  — copy venv + app, run as non-root, expose 8001
#
# System packages installed for runtime needs:
#   • tesseract-ocr        — OCR via pytesseract
#   • poppler-utils        — PDF rasterization helpers
#   • libgl1, libglib2.0-0 — OpenCV / PyMuPDF / Pillow native deps
#   • curl                 — used by the HEALTHCHECK
# ─────────────────────────────────────────────────────────────────────────

# ── Stage 1: builder ────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Build-time native deps (not all are needed at runtime).
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
        libffi-dev \
        libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Create a self-contained venv so we can copy it cleanly into the runtime
# image without dragging build tools along.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python deps first (best layer-cache hit rate).
COPY backend/requirements.txt ./requirements.txt
RUN pip install --upgrade pip setuptools wheel \
 && pip install --no-cache-dir -r requirements.txt


# ── Stage 2: runtime ────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    XRAG_DATA_DIR=/data

RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        poppler-utils \
        libgl1 \
        libglib2.0-0 \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Non-root user (uid 1001 to avoid clashes with host users on bind mounts).
RUN groupadd --system --gid 1001 aurelia \
 && useradd  --system --uid 1001 --gid aurelia --home /app aurelia

WORKDIR /app

# Bring in the prebuilt virtualenv from the builder stage.
COPY --from=builder /opt/venv /opt/venv

# Copy application code last so source changes don't bust the dep layer.
COPY --chown=aurelia:aurelia backend/app ./app

# Persistent data directory (users.json, .auth_secret, knowledge/, etc.).
# Mount a volume here in production: -v aurelia_data:/data
RUN mkdir -p /data && chown aurelia:aurelia /data
VOLUME ["/data"]

USER aurelia

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl --fail --silent http://localhost:8001/health || exit 1

# Single-process uvicorn launched through ``app/_serve.py`` so we can
# create one dual-stack socket (IPv4 + IPv6 with ``IPV6_V6ONLY=0``).
# This is required on Fly.io where the public edge proxy reaches the
# machine via IPv4 NAT but the internal ``*.internal`` network is
# IPv6-only ULA. Scale horizontally rather than using --workers, since
# the JSON file stores rely on per-process file locks.
CMD ["python", "-m", "app._serve"]
