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

test('authenticated host creates and controls a room while guests play without answer leaks', async (context) => {
  const store = new MemoryStore();
  const app = createApp({ store, clientOrigin: 'http://localhost:5173' });
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: 'http://localhost:5173' } });
  const manager = new RoomManager({ io, store });
  registerSocketHandlers(io, manager, store);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  context.after(async () => {
    await new Promise((resolve) => io.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  });

  const registration = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'Host@Example.com', password: 'long-demo-password-42' })
  });
  assert.equal(registration.status, 201);
  const { accessToken, host } = await registration.json();
  assert.equal(host.email, 'host@example.com');
  assert.equal('passwordHash' in host, false);
  const authHeaders = { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` };

  const setResponse = await fetch(`${base}/api/question-sets`, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({
      title: 'Integration set',
      questions: [{ prompt: '2 + 2?', topic: 'quantitative', difficulty: 'easy', durationMs: 5000, marks: 250, explanation: 'Add two and two.', correctOptionId: optionB,
        options: [{ id: optionA, text: '3' }, { id: optionB, text: '4' }] }]
    })
  });
  assert.equal(setResponse.status, 201);
  const { id: questionSetId } = await setResponse.json();
  assert.equal((await (await fetch(`${base}/api/question-sets/${questionSetId}/publish`, { method: 'POST', headers: authHeaders })).json()).status, 'published');
  const setReadResponse = await fetch(`${base}/api/question-sets/${questionSetId}`, { headers: authHeaders });
  const authoredSet = await setReadResponse.json();
  assert.equal(authoredSet.questions[0].correctOptionId, optionB);
  const roomResponse = await fetch(`${base}/api/question-sets/${questionSetId}/rooms`, {
    method: 'POST', headers: authHeaders, body: JSON.stringify({ collegeName: 'Demo College' })
  });
  assert.equal(roomResponse.status, 201);
  const { room } = await roomResponse.json();
  const sourceQuiz = await store.getQuestionSet(questionSetId);
  await store.updateQuestionSet(questionSetId, { ...sourceQuiz, questions: [{ ...sourceQuiz.questions[0], prompt: 'Changed after room creation' }] });

  const hostSocket = connect(base, { transports: ['websocket'], auth: { accessToken } });
  const player = connect(base, { transports: ['websocket'] });
  context.after(() => { hostSocket.close(); player.close(); });
  await Promise.all([once(hostSocket, 'connect'), once(player, 'connect')]);
  const guestJoin = await emitAck(player, 'room:join', { joinCode: room.joinCode, displayName: 'Asha' });
  assert.equal(guestJoin.ok, true);
  const hostAsPlayer = await emitAck(hostSocket, 'room:join', { joinCode: room.joinCode, displayName: 'Host' });
  assert.equal(hostAsPlayer.ok, false);
  assert.equal(hostAsPlayer.error.code, 'HOST_CANNOT_PLAY');

  const activeQuestion = once(player, 'game:question');
  assert.equal((await emitAck(player, 'host:game:start', { joinCode: room.joinCode })).error.code, 'AUTH_REQUIRED');
  assert.equal((await emitAck(hostSocket, 'host:game:start', { joinCode: room.joinCode })).ok, true);
  const question = await activeQuestion;
  assert.equal(question.prompt, '2 + 2?');
  assert.equal(question.durationMs, 5000);
  assert.equal('correctOptionId' in question, false);
  assert.deepEqual(new Set(question.options.map((option) => option.id)), new Set([optionA, optionB]));

  const hostProgress = once(hostSocket, 'room:lobby');
  assert.equal((await emitAck(player, 'answer:submit', { roundId: question.roundId, optionId: optionB })).ok, true);
  assert.equal((await hostProgress).players[0].answered, true);
  const roundResult = once(player, 'game:round-result');
  await manager.closeRound(guestJoin.data.room.id, 0);
  const result = await roundResult;
  assert.equal(result.correctOptionId, optionB);
  assert.equal(result.explanation, 'Add two and two.');
  assert.ok(result.leaderboard[0].score >= 250 && result.leaderboard[0].score <= 500);
  const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: authHeaders });
  assert.equal(logout.status, 200);
  const revokedControl = await emitAck(hostSocket, 'host:next-question', { joinCode: room.joinCode });
  assert.equal(revokedControl.ok, false);
  assert.equal(revokedControl.error.code, 'SESSION_INVALID');
});
