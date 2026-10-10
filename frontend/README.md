# QUIZRIFT frontend

<<<<<<< HEAD
The frontend is a standalone, demo-ready QUIZRIFT experience. It includes the lobby, room join flow, timed match, and live-style leaderboard using mock game data so it can be explored without a backend connection.
=======
The frontend uses the AptiQuiz REST and Socket.IO backend for host registration/login, custom quiz drafts, editing, preview, publishing, room management, synchronized questions, answer acceptance, scoring, and results. Host quiz routes (`/host/quiz/:id/edit` and `/host/quiz/:id/preview`) are separate from participant join and game screens.
>>>>>>> 5c03288 (Build host auth and custom quiz builder)

## Run locally

Start the backend first in another terminal, then from this directory run:

```sh
npm start
```

Then open the URL printed by the server (normally `http://localhost:4173`). The static server binds to all interfaces and also prints a LAN address for testing from another device on the same network.

## Structure

- `src/types/` contains the game and socket event contracts.
- `src/contexts/`, `src/hooks/`, and `src/services/` hold the socket, game-state, and API integration points.
- `src/components/` contains reusable game UI components.
- `src/pages/` contains participant screens and host authentication, dashboard, quiz editor, student preview, and live-room screens.

The static frontend server injects its backend URL at runtime. Set `BACKEND_URL=http://localhost:3001` when running `npm start` to point it at another backend. For another frontend origin, set the backend's `CLIENT_ORIGIN` to that origin. No database secret belongs in the frontend.

Hosts sign in with email and a password of at least 12 characters. The opaque eight-hour bearer token is held in tab-scoped `sessionStorage`; it is sent only to the configured backend. Use HTTPS for deployed environments. New quizzes are drafts; save incomplete work, edit/reorder questions and options, preview, then publish only after server validation. Drafts cannot be hosted. Editing a published quiz returns it to draft; existing rooms keep their independent configuration snapshot.

Correct choices are returned only to the authenticated owner for editing and are never included in participant preview or active-question events. The server reveals them in the round-result event only after the round closes. The dedicated host screen shows live participant answer progress but does not render participant answer controls.

The frontend is plain JavaScript and has no bundler/build step. Run `npm test` here for UI rendering and API contract tests, then verify the flow in a browser with the backend running.
