# Aurelia — Docker

Production-ready container build for the FastAPI backend and the
Vite/React frontend.

## Quick start (local)

```powershell
cd docker
docker compose up --build
```

Open <http://localhost:8080>. The nginx-served frontend forwards every
`/api/*` request to the backend container at `http://backend:8001`.
Backend data persists in the named volume `aurelia_data`
(`users.json`, `.auth_secret`, knowledge uploads, etc.).

## Files

| File | Purpose |
| ---- | ------- |
| [`backend.Dockerfile`](./backend.Dockerfile)  | Python 3.12-slim, multi-stage venv build, runs as non-root, exposes 8001. |
| [`frontend.Dockerfile`](./frontend.Dockerfile)| Node 22 build, served by nginx 1.27-alpine with SPA fallback + `/api` reverse proxy. |
| [`docker-compose.yml`](./docker-compose.yml)  | Wires the two services together with a healthcheck-gated dependency. |

## Build args / env vars

### Backend
| Variable | Default | Notes |
| -------- | ------- | ----- |
| `XRAG_DATA_DIR` | `/data` | Where users/auth/knowledge JSON live (volume-mounted). |
| `XRAG_AUTH_DEV_MODE` | unset | When `1`, registration response includes the verification code. **Never set in production.** |
| `XRAG_SMTP_HOST` / `_PORT` / `_USER` / `_PASSWORD` / `_FROM` / `_FROM_NAME` / `_TLS` / `_SSL` | unset | SMTP for verification emails. See [`backend/.env.example`](../backend/.env.example). |

### Frontend (build-time)
| Build arg | Default | Notes |
| --------- | ------- | ----- |
| `VITE_XRAG_API_BASE_URL` | `/api` | Inlined into the bundle. Use a full origin (e.g. `https://api.example.com`) when serving the static assets from a separate host. |

### Frontend (runtime)
| Env var | Default | Notes |
| ------- | ------- | ----- |
| `BACKEND_URL` | `http://backend:8001` | Where nginx forwards `/api/*`. Substituted by nginx's templating at startup. |

## Production checklist

1. Copy `backend/.env.example` to `backend/.env` and fill in **real** SMTP credentials.
2. Set `XRAG_AUTH_DEV_MODE=0` (or remove the variable).
3. Put a TLS-terminating reverse proxy (Caddy, Traefik, nginx, Cloudflare) in front of port 8080.
4. Restrict CORS in [`backend/app/main.py`](../backend/app/main.py) to the public origin you serve the frontend from.
5. Back up the `aurelia_data` volume regularly — it contains hashed credentials and uploaded documents.

## Building images standalone

```powershell
# Backend image
docker build -f docker/backend.Dockerfile -t aurelia-backend:latest .

# Frontend image (point bundle at a remote API)
docker build `
    -f docker/frontend.Dockerfile `
    --build-arg VITE_XRAG_API_BASE_URL=https://api.example.com `
    -t aurelia-frontend:latest .
```
