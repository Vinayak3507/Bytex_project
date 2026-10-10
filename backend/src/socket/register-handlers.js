import { HttpError, assert } from '../lib/http-error.js';
import { hashToken } from '../lib/ids.js';

const failure = (error) => ({
  ok: false,
  error: {
    code: error instanceof HttpError ? error.code : 'INTERNAL_ERROR',
    message: error instanceof HttpError ? error.message : 'An unexpected server error occurred.'
  }
});

const bind = (socket, event, handler) => {
  socket.on(event, async (payload = {}, acknowledge = () => {}) => {
    try {
      acknowledge({ ok: true, data: await handler(payload) });
    } catch (error) {
      acknowledge(failure(error));
    }
  });
};

const bindHost = (socket, event, handler, store) => {
  socket.on(event, async (payload = {}, acknowledge = () => {}) => {
    try {
      const sessionTokenHash = socket.data.hostSessionTokenHash;
      assert(sessionTokenHash && socket.data.hostId, 401, 'AUTH_REQUIRED', 'Sign in as the quiz host to control this room.');
      const session = await store.getHostSession(sessionTokenHash);
      assert(session && session.host.id === socket.data.hostId, 401, 'SESSION_INVALID', 'Your host session has expired. Sign in again.');
      acknowledge({ ok: true, data: await handler(payload) });
    } catch (error) {
      acknowledge(failure(error));
    }
  });
};

export const registerSocketHandlers = (io, roomManager, store) => {
  io.use(async (socket, next) => {
    const accessToken = socket.handshake.auth?.accessToken;
    if (!accessToken) return next();
    try {
      const session = await store.getHostSession(hashToken(accessToken));
      if (!session) return next(new Error('Host session is invalid or expired.'));
      socket.data.hostId = session.host.id;
      socket.data.hostEmail = session.host.email;
      socket.data.hostSessionTokenHash = hashToken(accessToken);
      return next();
    } catch {
      return next(new Error('Could not verify host session.'));
    }
  });

  io.on('connection', (socket) => {
    bind(socket, 'room:join', (payload) => roomManager.joinPlayer(socket, payload));
    bindHost(socket, 'host:observe', (payload) => roomManager.observeHost(socket, payload), store);
    bindHost(socket, 'host:game:start', (payload) => roomManager.startGame(socket, payload), store);
    bindHost(socket, 'host:next-question', (payload) => roomManager.nextQuestion(socket, payload), store);
    bind(socket, 'answer:submit', (payload) => roomManager.submitAnswer(socket, payload));
    socket.on('disconnect', () => roomManager.disconnect(socket).catch(() => {}));
  });
};
