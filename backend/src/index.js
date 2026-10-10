import './lib/load-env.js';
import http from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './http/app.js';
import { RoomManager } from './game/room-manager.js';
import { registerSocketHandlers } from './socket/register-handlers.js';
import { createStore } from './store/index.js';

const port = Number(process.env.PORT ?? 3001);
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:4173,http://localhost:5173';
const store = createStore();
const app = createApp({ store, clientOrigin });
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: clientOrigin.split(',').map((origin) => origin.trim()), methods: ['GET', 'POST'] }
});
const roomManager = new RoomManager({ io, store });
registerSocketHandlers(io, roomManager, store);

server.listen(port, () => {
  console.log(`AptiQuiz server listening on http://localhost:${port} (${store.constructor.name})`);
});
