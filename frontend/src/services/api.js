import { ClientEvents } from '../types/socket.types.js';

const json = (path, body) => fetch(path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });

export const api = {
  createRoom: payload => json('/api/rooms', payload),
  joinRoom: payload => json('/api/rooms/join', payload),
  startGame: payload => json('/api/game/start', payload),
  answer: payload => json('/api/game/answer', payload),
  events: ClientEvents
};
