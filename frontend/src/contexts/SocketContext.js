import { backendUrl } from '../services/api.js';
import { getHostAccessToken } from '../services/hostAuth.js';

let socketClientScript;
const loadSocketClient = () => {
  if (window.io) return Promise.resolve();
  if (socketClientScript) return socketClientScript;
  socketClientScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${backendUrl}/socket.io/socket.io.js`;
    script.async = true;
    script.onload = () => window.io ? resolve() : reject(new Error('Socket.IO client did not load.'));
    script.onerror = () => reject(new Error(`Could not load the live connection client from ${backendUrl}.`));
    document.head.append(script);
  }).catch((error) => {
    socketClientScript = null;
    throw error;
  });
  return socketClientScript;
};

export class SocketContext extends EventTarget {
  constructor() {
    super();
    this.client = null;
    this.connecting = null;
  }

  async connect() {
    if (this.client?.connected) return this.client;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      await loadSocketClient();
      if (!this.client) {
        this.client = window.io(backendUrl, { autoConnect: false, reconnection: true, reconnectionAttempts: Infinity, timeout: 10000, auth: (callback) => callback({ accessToken: getHostAccessToken() }) });
        this.client.onAny((event, payload) => this.dispatchEvent(new CustomEvent(event, { detail: payload })));
        this.client.on('connect', () => this.dispatchEvent(new CustomEvent('connect', { detail: { id: this.client.id } })));
        this.client.on('disconnect', (reason) => this.dispatchEvent(new CustomEvent('connection:status', { detail: { status: 'disconnected', reason } })));
        this.client.on('connect_error', (error) => this.dispatchEvent(new CustomEvent('connection:error', { detail: { message: error.message } })));
      }
      if (!this.client.connected) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            cleanup();
            reject(new Error('Timed out connecting to the AptiQuiz server.'));
          }, 12000);
          const cleanup = () => {
            clearTimeout(timer);
            this.client.off('connect', onConnect);
            this.client.off('connect_error', onError);
          };
          const onConnect = () => { cleanup(); resolve(); };
          const onError = (error) => { cleanup(); reject(new Error(error.message || 'Could not connect to the AptiQuiz server.')); };
          this.client.once('connect', onConnect);
          this.client.once('connect_error', onError);
          this.client.connect();
        });
      }
      return this.client;
    })();
    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async emitAck(event, payload) {
    const client = await this.connect();
    const result = await new Promise((resolve, reject) => {
      client.timeout(12000).emit(event, payload, (error, response) => {
        if (error) return reject(new Error(`No acknowledgement received for ${event}.`));
        resolve(response);
      });
    });
    if (!result?.ok) throw new Error(result?.error?.message || `The server rejected ${event}.`);
    return result.data;
  }

  on(event, listener) {
    this.addEventListener(event, listener);
    return () => this.removeEventListener(event, listener);
  }

  async disconnect() {
    this.client?.disconnect();
    this.client = null;
    this.connecting = null;
  }

  refreshAuthentication() {
    if (!this.client) return;
    if (this.client.connected) this.client.disconnect();
    this.client.auth = (callback) => callback({ accessToken: getHostAccessToken() });
    this.client.connect();
  }
}

export const socket = new SocketContext();
