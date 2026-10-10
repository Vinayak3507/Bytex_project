# README

# AptiQuiz — AI Hackathon 2026

AptiQuiz is a live, multiplayer aptitude quiz platform designed for college competitions and hackathons. Hosts create and publish quizzes from a private dashboard; participants join a live room using a short code or link. The backend is authoritative for question timing, answer acceptance, scoring, and standings.

**Current milestone:** end-to-end deployment with host authentication, quiz drafting and publishing, persistent Supabase storage, and live multiplayer room flows.

## Live deployment

- **Participant and host app:** https://bytex-project.vercel.app
- **Backend API:** https://aptiquiz-bytex-api.onrender.com
- **Repository:** https://github.com/Vinayak3507/Bytex_project

The frontend is deployed on Vercel, the Node.js API and Socket.IO server run on Render, and Supabase Postgres provides persistent storage. Render’s free service may spin down after inactivity, so the first request after a quiet period can take longer. For a live demonstration, open the app and verify that the backend is responsive before participants join.

## Features implemented

### Host accounts and dashboard

- Host registration, login, and logout.
- Owner-scoped quiz management and protected host endpoints.
- Password hashing with Node.js `scrypt`.
- Opaque eight-hour bearer sessions; only token hashes are stored by the backend.
- The browser stores the active token in tab-scoped `sessionStorage`.

### Quiz authoring and publishing

- Create incomplete quiz drafts and return to edit them.
- Add and reorder multiple-choice questions and configure options.
- Configure quiz defaults and per-question duration and marks.
- Preview the participant-facing quiz before publishing.
- Publish valid quizzes; only published quizzes can be used to create rooms.
- Store a snapshot of the quiz when a room is created, preventing later edits to the source quiz from changing an active room’s questions or scoring.

### Live multiplayer quiz

- Participants join a room using its join code or link and move through lobby, question, and results screens.
- Socket.IO carries real-time room events.
- The server controls round timing, answer acceptance, scoring, and standings.
- Correct answers are withheld until the round closes.
- Host and participant roles are separated, and host Socket.IO identity is verified during connection setup rather than trusted from event payloads.

### Persistence and security

- Supabase Postgres storage for host accounts, sessions, quizzes, questions, rooms, participants, and answers.
- SQL migrations in `supabase/migrations/` define the current database schema.
- Local development can use in-memory storage when Supabase environment variables are absent; that data resets when the server restarts.
- Secrets stay on the backend. Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code or commit real credentials.

## Tech stack

| Layer | Technologies |
| --- | --- |
| Frontend | HTML, CSS, vanilla JavaScript, Node.js runtime configuration server |
| Backend | Node.js 22+, Express, Socket.IO |
| Database | Supabase Postgres |
| Hosting | Vercel (frontend), Render (backend), Supabase (database) |

The frontend is plain JavaScript, not a Vite bundle, and has no separate build step.

## Project structure

```
.
├── frontend/                 # Host UI, quiz editor, participant pages
│   ├── api/                  # Vercel runtime configuration endpoint
│   └── vercel.json           # Vercel routing and runtime configuration
├── backend/                  # Express API and Socket.IO server
├── supabase/
│   └── migrations/           # Database schema and incremental migrations
├── docs/
│   └── architecture.md       # REST, authentication, and Socket.IO contracts
└── render.yaml               # Render Blueprint configuration
```

Host routes include `/host/register`, `/host/login`, `/host`, `/host/quiz/:id/edit`, `/host/quiz/:id/preview`, and `/host/room/:joinCode`.

## Run locally

Requirements: Node.js 22 or later and npm.

### 1. Backend

From the repository root:

```bash
cd backend
cp .env.example .env
npm install
npm test
npm run dev
```

The backend listens on `http://localhost:3001` by default. For persistent local data, configure the Supabase variables below and apply the SQL migrations. Without them, the server uses in-memory storage for development and integration testing.

### 2. Frontend

In a separate terminal, from the repository root:

```bash
cd frontend
npm start
```

Open the URL printed by the server, normally `http://localhost:4173`. The server also prints a LAN URL for testing from another device on the same Wi-Fi. If port 4173 is occupied, you can run `node server.js 5000`.

The local frontend defaults to `http://localhost:3001` for REST and Socket.IO. Set `BACKEND_URL` when starting the frontend server to point to a different backend URL.

## Environment variables and database setup

For local persistent storage, set these in `backend/.env`:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Base URL of the Supabase project (not a `/rest/v1/` endpoint) |
| `SUPABASE_SERVICE_ROLE_KEY` | Private server-side Supabase service-role/secret key |
| `CLIENT_ORIGIN` | Allowed frontend origin(s), comma-separated when needed |
| `PORT` | Optional backend port; defaults to `3001` locally |

Apply every SQL file under `supabase/migrations/` in filename order to the Supabase project before relying on persistent storage. The migrations cover the core quiz schema, host authentication and ownership, custom quiz building, and support for untitled drafts.

Shell environment variables take precedence over values loaded from `backend/.env`. Use HTTPS for deployed environments. Protected API requests use `Authorization: Bearer …`. Never commit real environment files or place the service-role key in Vercel/frontend settings.

## Tests and architecture

Run backend tests with `npm test` from `backend/` and frontend tests with `npm test` from `frontend/`.

Backend tests cover registration/login/logout, ownership checks, host/player role separation, room creation, server-timed rounds, answer submission, and withholding correct answers until a round closes. See `docs/architecture.md` for REST endpoints, authentication, and Socket.IO contracts.

## Deployment notes

The current deployment uses **Vercel for the frontend** and **Render for the backend**, with Supabase for persistent database storage.

- Vercel project root: `frontend`; framework preset: `Other`; output directory: `.`.
- Set the Vercel environment variable `BACKEND_URL` to `https://aptiquiz-bytex-api.onrender.com`.
- On Render, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the backend service.
- Set `CLIENT_ORIGIN` on Render to include `https://bytex-project.vercel.app` (and any required local development origins).
- Apply new database migrations to Supabase when a feature adds or changes schema; deploying application code alone does not apply SQL migrations automatically.

The repository also includes `render.yaml` as a Blueprint for a two-service Render deployment. That configuration can be used if you choose to host both frontend and backend on Render instead; in that setup, configure `BACKEND_URL` on the frontend service and `CLIENT_ORIGIN` on the API service to match the deployed frontend origin.

For more details, see Render Blueprint configuration and Render WebSocket support.

## Roadmap — planned future updates

These are potential next steps, not features currently claimed as implemented.

### Product improvements

- [ ]  Quiz categories, tags, search, and reusable question banks.
- [ ]  Bulk question import/export (CSV or spreadsheet templates).
- [ ]  More question types, such as true/false and numeric answers.
- [ ]  Configurable scoring modes, negative marking, and answer explanations.
- [ ]  Scheduled quizzes, waiting-room controls, and host moderation tools.
- [ ]  Quiz history, participant reports, and downloadable results.

### Platform and reliability

- [ ]  Reconnection recovery for participants and hosts during network interruptions.
- [ ]  Stronger rate limits and abuse protection for public endpoints and room joins.
- [ ]  Automated database migration workflow and production health monitoring.
- [ ]  CI checks for tests and deployment validation.
- [ ]  Accessibility, responsive UI, and browser/device compatibility review.

### AI-assisted features

- [ ]  AI-assisted question generation from a topic or source notes, with host review before publishing.
- [ ]  Difficulty suggestions and duplicate-question detection.
- [ ]  AI-generated explanations and post-quiz learning recommendations.

## Team

- Frontend: Prince Kumar Yadav
- Backend: Vinayak Dixit
