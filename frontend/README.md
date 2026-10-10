# QUIZRIFT frontend

The frontend is a standalone, demo-ready QUIZRIFT experience. It includes the lobby, room join flow, timed match, and live-style leaderboard using mock game data so it can be explored without a backend connection.

## Run locally

From this directory, run:

```sh
npm start
```

Then open the URL printed by the server (normally `http://localhost:4173`). The static server binds to all interfaces and also prints a LAN address for testing from another device on the same network.

## Structure

- `src/types/` contains the game and socket event contracts.
- `src/mocks/` provides sample questions, players, and standings.
- `src/contexts/`, `src/hooks/`, and `src/services/` hold the socket, game-state, and API integration points.
- `src/components/` contains reusable game UI components.
- `src/pages/` contains the home, join-room, and active-room screens.

The current build runs in mock mode. The socket context and API service are the integration points for connecting it to the authoritative game server.
