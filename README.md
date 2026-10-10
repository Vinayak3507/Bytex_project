# AptiQuiz — AI Hackathon 2026

AptiQuiz is a live, multiplayer aptitude quiz built around college competition. Hosts create rooms, players join with a short code, and the server owns the question timer, answer acceptance, scoring, and standings.

## Current frontend

The `frontend/` folder contains a gamified dashboard, room join flow, lobby, timed questions, score feedback, reactions, and final standings. It currently runs in mock mode; its Socket.IO adapter and REST paths are not yet connected to the backend contract.

Run it with Node.js (no package installation is required):

```bash
cd frontend
npm start
```

Open the URL printed by the server, normally `http://localhost:4173`. The server also prints a LAN URL for testing from another device on the same Wi-Fi. If port 4173 is occupied, run `node server.js 5000`.

## Backend and database

The backend requires Node.js 20+ and uses Express, Socket.IO, and Supabase Postgres.

```bash
cd backend
cp .env.example .env
npm install
npm test
npm run dev
```

Without Supabase environment variables, the server uses in-memory storage for local integration; that data resets when the server restarts. For persistent storage, apply [`supabase/migrations/202610100001_aptiquiz.sql`](supabase/migrations/202610100001_aptiquiz.sql), then set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`. Keep the service-role key on the backend only.

The server runs at `http://localhost:3001` by default. Set `CLIENT_ORIGIN=http://localhost:4173` (or your deployed frontend URL) to allow browser requests from the frontend.

See [`docs/architecture.md`](docs/architecture.md) for the REST and Socket.IO contract. The backend tests cover question-set creation, room creation, joining, server-timed rounds, answer submission, and withholding the correct answer until a round closes.

## Deployment

The frontend can be served as static files; the backend needs a persistent Node.js service for Socket.IO. Deployment URL: to be added.

## Team

- Frontend: team member 1
- Backend: team member 2
