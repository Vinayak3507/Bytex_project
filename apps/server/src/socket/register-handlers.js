import { HttpError } from '../lib/http-error.js';

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

export const registerSocketHandlers = (io, roomManager) => {
  io.on('connection', (socket) => {
    bind(socket, 'room:join', (payload) => roomManager.joinPlayer(socket, payload));
    bind(socket, 'host:observe', (payload) => roomManager.observeHost(socket, payload));
    bind(socket, 'host:game:start', (payload) => roomManager.startGame(socket, payload));
    bind(socket, 'host:next-question', (payload) => roomManager.nextQuestion(socket, payload));
    bind(socket, 'answer:submit', (payload) => roomManager.submitAnswer(socket, payload));
    socket.on('disconnect', () => roomManager.disconnect(socket).catch(() => {}));
  });
};
