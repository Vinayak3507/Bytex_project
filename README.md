# AptiQuiz — AI Hackathon 2026

AptiQuiz is a live, multiplayer aptitude quiz built around college competition. Hosts register and sign in to a dedicated dashboard, create a quiz room, and run it from a host-only control screen. Students join with a short code or link. The server owns question timing, answer acceptance, scoring, and standings.

## Current frontend

The `frontend/` folder contains separate host authentication, quiz dashboard/editor/preview, and live-room pages alongside participant join/lobby/question/results pages. Host routes include `/host/register`, `/host/login`, `/host`, `/host/quiz/:id/edit`, `/host/quiz/:id/preview`, and `/host/room/:joinCode`.

Run it with Node.js (no package installation is required). Start the backend in a separate terminal first:

```bash
cd frontend
npm start
```

Open the URL printed by the server, normally `http://localhost:4173`. The server also prints a LAN URL for testing from another device on the same Wi-Fi. If port 4173 is occupied, run `node server.js 5000`.

The frontend defaults to `http://localhost:3001` for its REST and Socket.IO server. Set `BACKEND_URL` when starting the frontend server to use a different backend URL.

## Backend and database

The backend requires Node.js 22+ and uses Express, Socket.IO, and Supabase Postgres. It loads `backend/.env` locally when present; shell environment variables take precedence.

```bash
cd backend
cp .env.example .env
npm install
npm test
npm run dev
```

Without Supabase environment variables, the server uses in-memory storage for local integration; accounts, sessions, quizzes, and rooms reset when the server restarts. For persistent storage, apply all migrations in `supabase/migrations/` in filename order, then set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`. Keep the service-role key on the backend only. The migrations add host accounts/ownership and custom quiz drafts, question settings, and room snapshots.

Host passwords are hashed with Node's scrypt implementation. Login issues an opaque, eight-hour bearer session; only its SHA-256 hash is stored by the backend. The browser keeps the bearer token in tab-scoped `sessionStorage`. Use HTTPS in deployment. Protected API requests use `Authorization: Bearer …`; host Socket.IO identity is verified from the connection handshake, never from event payloads.

The server runs at `http://localhost:3001` by default and allows local frontend origins on ports 4173, 4174, and 5173. Set `CLIENT_ORIGIN` to the frontend origin (comma-separated for multiple origins) when deploying. The frontend and backend must be reachable by each player's browser.

See [`docs/architecture.md`](docs/architecture.md) for the REST, authentication, and Socket.IO contracts. Backend tests cover registration/login/logout, ownership checks, host/player role separation, room creation, server-timed rounds, answer submission, and withholding correct answers until a round closes.

Hosts can create incomplete drafts, author and reorder multiple-choice questions, configure quiz defaults and per-question duration/marks, preview the participant-facing view, and publish. Only published, valid quizzes can create rooms. A room captures a quiz snapshot when created, so later source edits cannot change its questions or scoring. See [`docs/architecture.md`](docs/architecture.md) for REST, authentication, and Socket.IO contracts.

The frontend is plain JavaScript served by Node (not a Vite bundle), so use `npm test` in `frontend/` and open the local server for UI verification; there is no separate frontend build command.

## Deployment

The repository includes [`render.yaml`](render.yaml) for a two-service Render deployment. The backend is a persistent Node.js web service because Socket.IO needs long-lived connections. The frontend is also served by Node so it can inject `BACKEND_URL` at runtime.

1. Push the latest `main` branch to GitHub.
2. In the [Render Blueprint dashboard](https://dashboard.render.com/blueprints), create a Blueprint from `Vinayak3507/Bytex_project` and select `render.yaml`.
3. Render creates `quizrift-bytex-api` and `quizrift-bytex-web`. When prompted, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the API service. Apply the SQL migrations in `supabase/migrations/` to that Supabase project first.
4. Deploy the API service first. Copy its public `https://…onrender.com` URL.
5. Set `BACKEND_URL` on the web service to that API URL, then set `CLIENT_ORIGIN` on the API service to the web service's public URL. Redeploy both services after saving these values.
6. Open the web service URL, create a host account, publish a quiz, and join a room from a second browser or device to verify the live flow.

Never add Supabase credentials to Git, `render.yaml`, or frontend environment variables. Render Web Services accept public WebSocket connections, which is required by the live room experience. [Render’s Blueprint reference](https://render.com/docs/blueprint-spec) and [WebSocket documentation](https://render.com/docs/websocket) describe these settings.

## Team

- Frontend: team member 1
- Backend: team member 2
