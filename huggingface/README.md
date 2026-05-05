# Au;ReliA — deploy a Hugging Face Spaces-re

Ez a mappa **NEM kerül futtatásra** — csak a HF Spaces deployhoz tartozó
útmutatót és a Space repo `README.md`-jébe másolandó YAML-fejlécet
tartalmazza. A tényleges build-konfiguráció a repo gyökerében lévő
[Dockerfile](../Dockerfile)-ban van.

## Architektúra (1 Space = 1 konténer)

```
┌──────────────────────────────────────────────┐
│  Hugging Face Space (Docker SDK, port 7860)  │
│  ┌────────────────────────────────────────┐  │
│  │  FastAPI (uvicorn)                     │  │
│  │   ├─  /api/...   → backend route-ok    │  │
│  │   ├─  /health    → healthcheck         │  │
│  │   └─  /         → React SPA (statikus) │  │
│  └────────────────────────────────────────┘  │
│  /data  →  perzisztens kötet (opcionális)    │
└──────────────────────────────────────────────┘
```

Egyetlen URL, egyetlen port — nem kell külön frontend/backend Space, és
nincs CORS-bonyodalom. A Vite bundle relatív `/api/...` hívásokat tesz,
a FastAPI ugyanazon a porton szolgálja ki a SPA-t és az API-t.

## 1. lépés — Hozz létre egy új Space-t

1. Menj a <https://huggingface.co/new-space> oldalra.
2. **Space SDK:** `Docker` → **Blank** template.
3. **Space hardware:** `CPU basic` (ingyenes, 2 vCPU / 16 GB RAM, **nem alszik el**, ha nyilvános).
4. **Visibility:** `Public` (különben elalszik!).
5. Hozd létre — kapsz egy git repót, pl. `https://huggingface.co/spaces/<user>/aurelia`.

## 2. lépés — Pusholj a Space repóba

A legegyszerűbb: ezt a repót pusholod a HF Space remote-jára is.

```powershell
# A meglévő GitHub remote mellé add hozzá a HF-et:
git remote add hf https://huggingface.co/spaces/<user>/aurelia

# (HF személyes access token kell a push-hoz: https://huggingface.co/settings/tokens)
git push hf main
```

> A HF Space buildje a repo gyökerében lévő `Dockerfile`-t fogja
> használni, és a `README.md` YAML-fejléce alapján konfigurálja a
> Space-t (port, hardware, stb.).

## 3. lépés — A Space `README.md` YAML-fejléce

A HF Space-nek a repo gyökerében lévő `README.md` **első sorában** kell
egy YAML frontmatternek lennie. A meglévő [README.md](../README.md)
elejére másold be a következő blokkot (a `---` jelekkel együtt):

```yaml
---
title: Au;ReliA
emoji: 🧠
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
short_description: Visual RAG architecture builder & evaluator (FastAPI + React)
---
```

> Ha nem akarod a fő `README.md`-t módosítani, akkor a HF Space repóban
> külön (a HF push előtt) cseréld le a fájlt — a GitHub repó érintetlen
> maradhat. Erre a legtisztább megoldás: külön branch, pl. `hf-deploy`.

## 4. lépés — Titkok beállítása (Space → Settings → Variables and secrets)

A backend környezeti változókból olvas. Az alábbiakat **Secret**-ként
(nem variable-ként!) add meg, hogy ne kerüljenek a buildbe vagy a logba:

| Név | Kötelező? | Mire kell |
|---|---|---|
| `OPENAI_API_KEY` | nem | OpenAI modellekhez |
| `OPENROUTER_API_KEY` | nem | OpenRouter proxyhoz |
| `GOOGLE_API_KEY` | nem | Gemini modellekhez |
| `PINECONE_API_KEY` | nem | Pinecone vektor backendhez |
| `XRAG_AUTH_SECRET` | **ajánlott** | Auth token aláíró kulcs (különben rebuildkor invalidálódik) |

A kulcsokat az appon belül a **Settings → API Keys** menüben is
kezelheted (`backend/data/api_keys.json`-be kerülnek). Perzisztens
storage nélkül viszont rebuildkor elvesznek — ezért ajánlott a HF
Secrets használata.

## 5. lépés — (opcionális) Perzisztens storage

A `backend/data/` (felhasználók, mentett válaszok, knowledge base
chunks, feltöltött fájlok) **csak** akkor éli túl a rebuildet, ha a
Space-hez veszel **Persistent Storage**-ot:

- **Settings → Persistent Storage → Small (20 GB, $5/hó)**

A HF automatikusan a `/data` útvonalra mountolja, és a `Dockerfile`
`XRAG_DATA_DIR=/data`-ja már erre mutat → semmilyen kódváltoztatás
nem kell.

> **Szakdolgozat-tipp:** demóhoz / bíráló bizottságnak az ingyenes
> Space is bőven elég. A `/data` ott is létezik, csak ephemeral —
> a Space újraindításáig megmarad. Két demo között `git push` →
> rebuild → tiszta lap.

## 6. lépés — Build & elindítás

A `git push hf main` után a HF automatikusan elindítja a buildet.
A folyamatot a Space oldalán a **Logs** fülön követheted.

- Az első build **5–10 percig** tart (a `pymupdf`, `tokenizers` és
  `langchain` deps lefordítása + frontend bundle).
- A subsequent buildek a Docker layer cache miatt jóval gyorsabbak.

Ha minden rendben, a Space URL-jén (`https://<user>-aurelia.hf.space`)
megnyílik a React UI, és bejelentkezés után működik a chat / knowledge
base / canvas.

## Hibaelhárítás

| Tünet | Megoldás |
|---|---|
| `Permission denied` a `/data`-n a logban | Engedélyezd a Persistent Storage-t, vagy hagyd, hogy a Space írja az ephemeral `/data`-t (uid 1000-nek mindig van joga rá). |
| Build OOM (Out Of Memory) | A free CPU Basic 16 GB RAM, ennek elégnek kell lennie. Ha mégis hibázik, pinellapd a `langchain` verziót lentebb, vagy válts CPU Upgrade-re. |
| API hívás 404 / `Failed to fetch` | Ellenőrizd, hogy a frontend buildkor üres `VITE_XRAG_API_BASE_URL`-lel készült-e (a `Dockerfile` ezt biztosítja). Ha módosítod, ne add meg a `/api` prefixet — minden endpoint már tartalmazza. |
| Authentikáció reboot után „elfelejt" | Állíts be `XRAG_AUTH_SECRET` Secret-et, vagy vegyél Persistent Storage-t. |
| Space „building" örökre | Logok → ha pip install lassú, ez normális első alkalommal. Ha 30 perc után sem áll össze, restart a Settings-ből. |

## Költség összefoglaló

| Konfiguráció | Havi költség | Mit tud |
|---|---|---|
| Free CPU Basic, no storage | **0 Ft** | Demo, ephemeral adatok, **nem alszik el** ha public |
| Free CPU Basic + Small Storage | ~$5 | Adatperzisztencia rebuildek között |
| CPU Upgrade (8 vCPU / 32 GB) | ~$0.05/h | Több párhuzamos felhasználó / nagyobb embedding workload |
