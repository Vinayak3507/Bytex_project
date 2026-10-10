import { ServerEvents } from '../types/socket.types.js';

/* A tiny event hub keeps UI code independent from the eventual Socket.IO client. */
export class SocketContext extends EventTarget {
  emit(event, detail) { this.dispatchEvent(new CustomEvent(event, { detail })); }
  on(event, listener) { this.addEventListener(event, listener); return () => this.removeEventListener(event, listener); }
  receive(event, payload) { if (Object.values(ServerEvents).includes(event)) this.emit(event, payload); }
}

export const socket = new SocketContext();
