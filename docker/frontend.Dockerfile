# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────
# Aurelia frontend — Vite/React build served by nginx
#
# Multi-stage build:
#   1. `builder` — install npm deps (cached), run `vite build`
#   2. `runtime` — minimal nginx:alpine serving the static dist/
#
# Build-time configuration:
#   --build-arg VITE_XRAG_API_BASE_URL=https://api.example.com
#     Inlined into the bundle by Vite. Use "/api" so the same-origin
#     reverse proxy below forwards backend traffic.
#
# Runtime configuration:
#   -e BACKEND_URL=http://backend:8001
#     Where nginx should forward /api/* requests. Substituted at startup
#     via nginx's /etc/nginx/templates/ mechanism (envsubst). Defaults
#     to http://backend:8001 which works with docker-compose.
# ─────────────────────────────────────────────────────────────────────────

# ── Stage 1: builder ────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /build

COPY frontend/package.json frontend/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

ARG VITE_XRAG_API_BASE_URL="/api"
ENV VITE_XRAG_API_BASE_URL=$VITE_XRAG_API_BASE_URL

COPY frontend/ ./
# Skip the `tsc -b` step from the package.json "build" script — the project
# is plain JavaScript (.jsx) so tsc finds no inputs and aborts with TS18003.
# Vite alone produces a complete production bundle.
RUN npx --no-install vite build


# ── Stage 2: runtime (nginx) ────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

ENV BACKEND_URL=http://backend:8001

# Remove stock site, install ours as a template so nginx:alpine's
# entrypoint runs envsubst on it at startup (replacing $BACKEND_URL).
RUN rm /etc/nginx/conf.d/default.conf

COPY <<'NGINX' /etc/nginx/templates/aurelia.conf.template
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    client_max_body_size 50M;

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

    location /api/ {
        proxy_pass         ${BACKEND_URL}/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location = /healthz {
        access_log off;
        return 200 "ok\n";
        add_header Content-Type text/plain;
    }
}
NGINX

COPY --from=builder /build/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/healthz || exit 1
