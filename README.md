# AptiQuiz — AI Hackathon 2026

## Problem

AptiQuiz makes aptitude and logical-reasoning practice feel like a fair, live multiplayer game. A host creates a question set, up to 50 students join a room, and server-authoritative scoring feeds a college league table.

## Tech Stack

- Frontend: React + Vite (owned separately)
- Backend: Node.js, Express, Socket.IO
- Database: Supabase Postgres
- Deployment: static frontend plus a persistent Node/Socket.IO service

## Run locally

Backend prerequisites: Node.js 20+.

```bash
cd apps/server
cp .env.example .env
npm install
npm test
npm run dev
```

Without Supabase environment variables, the server uses in-memory storage for local frontend integration. For persistent storage, apply [`supabase/migrations/202610100001_aptiquiz.sql`](supabase/migrations/202610100001_aptiquiz.sql) to a Supabase project, then set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `apps/server/.env`. Keep the service-role key on the backend only.

The server runs at `http://localhost:3001` by default. Set `CLIENT_ORIGIN=http://localhost:5173` (or your deployed frontend URL) to permit frontend requests.

## Frontend/backend integration milestone

The backend test suite verifies this complete JSON flow:

1. Create a question set through the REST API.
2. Create a room using the host token.
3. Join through Socket.IO.
4. Start a server-timed round.
5. Submit one answer.
6. Confirm the correct option is absent from every pre-close payload and appears only in `game:round-result` after the round closes.

See [`docs/architecture.md`](docs/architecture.md) for the REST and Socket.IO contract.

## Deployment

Deployment URL: To be added.

## Team

- Member 1:
- Member 2:
