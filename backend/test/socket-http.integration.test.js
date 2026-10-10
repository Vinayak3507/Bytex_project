import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { createApp } from '../src/http/app.js';
import { RoomManager } from '../src/game/room-manager.js';
import { registerSocketHandlers } from '../src/socket/register-handlers.js';
import { MemoryStore } from '../src/store/memory-store.js';

const optionA = randomUUID();
const optionB = randomUUID();

const emitAck = (socket, event, payload) => new Promise((resolve, reject) => {
  socket.timeout(1_000).emit(event, payload, (error, result) => error ? reject(error) : resolve(result));
});
const once = (socket, event) => new Promise((resolve) => socket.once(event, resolve));

test('HTTP authoring and Socket.IO play exchange JSON without leaking answers early', async (context) => {
  const store = new MemoryStore();
  const app = createApp({ store, clientOrigin: 'http://localhost:5173' });
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: 'http://localhost:5173' } });
  const manager = new RoomManager({ io, store });
  registerSocketHandlers(io, manager);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  context.after(async () => {
    await new Promise((resolve) => io.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  });

  const setResponse = await fetch(`http://127.0.0.1:${port}/api/question-sets`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Integration set',
      questions: [{ prompt: '2 + 2?', topic: 'quantitative', difficulty: 'easy', durationMs: 5000, correctOptionId: optionB,
        options: [{ id: optionA, text: '3' }, { id: optionB, text: '4' }] }]
    })
  });
  assert.equal(setResponse.status, 201);
  const { id: questionSetId, hostToken } = await setResponse.json();
  const setReadResponse = await fetch(`http://127.0.0.1:${port}/api/question-sets/${questionSetId}`, { headers: { 'x-host-token': hostToken } });
  const authoredSet = await setReadResponse.json();
  assert.equal('correctOptionId' in authoredSet.questions[0], false);
  const roomResponse = await fetch(`http://127.0.0.1:${port}/api/question-sets/${questionSetId}/rooms`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-host-token': hostToken },
    body: JSON.stringify({ collegeName: 'Demo College' })
  });
  assert.equal(roomResponse.status, 201);
  const { room } = await roomResponse.json();

  const player = connect(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
  context.after(() => player.close());
  await once(player, 'connect');
  const joined = await emitAck(player, 'room:join', { joinCode: room.joinCode, displayName: 'Asha' });
  assert.equal(joined.ok, true);
  const activeQuestion = once(player, 'game:question');
  assert.equal((await emitAck(player, 'host:game:start', { joinCode: room.joinCode, hostToken })).ok, true);
  const question = await activeQuestion;
  assert.equal('correctOptionId' in question, false);
  assert.deepEqual(new Set(question.options.map((option) => option.id)), new Set([optionA, optionB]));

  assert.equal((await emitAck(player, 'answer:submit', { roundId: question.roundId, optionId: optionB })).ok, true);
  const roundResult = once(player, 'game:round-result');
  await manager.closeRound(joined.data.room.id, 0);
  assert.equal((await roundResult).correctOptionId, optionB);
});
