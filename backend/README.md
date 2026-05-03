# XRAG Backend API

## Run locally

1. Create and activate a virtual environment.
2. Install dependencies:
   pip install -r requirements.txt
3. Start API server:
   uvicorn app.main:app --reload --port 8000

## Endpoints

- GET /health
- GET /api/settings
- PUT /api/settings
- POST /api/chat
- GET /api/answers
- POST /api/answers

## Frontend integration

Frontend calls this API on http://localhost:8000 by default.
You can override with VITE_XRAG_API_BASE_URL in frontend env.
