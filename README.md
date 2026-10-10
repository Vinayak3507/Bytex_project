# AptiQuiz

AptiQuiz is a live, multiplayer aptitude quiz built around a college competition. Hosts create rooms, players join with a short code, and the server owns the question timer, answer acceptance, scoring, and standings.

## Frontend

The client lives in `frontend/` and includes a league dashboard, room join flow, lobby, timed question view, live score feedback, reactions, and final standings. Because it uses JavaScript modules, open it through the local server below instead of opening `index.html` as a file.

The frontend follows the planned structure inside `frontend/src/`: shared contracts in `types/`, mock payloads in `mocks/`, a socket adapter in `contexts/`, game state in `hooks/`, API calls in `services/`, reusable UI in `components/`, and page views in `pages/`.

The backend adapter is in `frontend/src/services/api.js`, and the socket event names are in `frontend/src/types/socket.types.js`. Replace the placeholder REST paths and connect the Socket.IO client when the backend contract is finalized.

### Run locally

Run the frontend server, then open the displayed address in a browser:

```bash
cd frontend
npm run dev
```

This uses Node's built-in HTTP server and needs no package installation. Keep the terminal open while using the site. Open the `http://localhost:4173` address it prints. The server also prints a network address for opening the site from another device on the same Wi-Fi. If port 4173 is occupied, run `node server.js 5000` and use the address printed for port 5000.

For deployment, upload the full `frontend/` folder to a static host such as Vercel, Netlify, or GitHub Pages.

## Backend and data

Backend and data-service setup is being finalized. Keep secrets in local environment files and never commit API keys or `.env` files.

## Team

- Frontend: team member 1
- Backend: team member 2
