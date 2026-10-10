import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../src/game/room-manager.js';
import { hashToken } from '../src/lib/ids.js';
import { HttpError } from '../src/lib/http-error.js';
import { MemoryStore } from '../src/store/memory-store.js';

class FakeSocket {
  constructor(id) { this.id = id; this.data = {}; this.events = []; this.rooms = new Set(); }
  join(roomId) { this.rooms.add(roomId); }
  emit(event, payload) { this.events.push({ event, payload }); }
}

class FakeIo {
  constructor() { this.sockets = []; this.roomEvents = []; }
  to(roomId) { return { emit: (event, payload) => this.roomEvents.push({ roomId, event, payload }) }; }
  in(roomId) { return { fetchSockets: async () => this.sockets.filter((socket) => socket.rooms.has(roomId)) }; }
}

const fixture = async () => {
  const io = new FakeIo();
  const store = new MemoryStore();
  const hostToken = 'host-token';
  const questionSet = await store.createQuestionSet({
    title: 'Core test', ownerTokenHash: hashToken(hostToken),
    questions: [{ id: 'question-1', prompt: '2 + 2?', topic: 'quantitative', difficulty: 'easy', durationMs: 20_000, position: 0,
      options: [{ id: 'option-a', text: '3' }, { id: 'option-b', text: '4' }], correctOptionId: 'option-b' }]
  });
  const room = await store.createRoom({ questionSetId: questionSet.id, collegeName: 'Demo College', seasonName: 'Hackathon Demo' });
  let clock = 1_000;
  const manager = new RoomManager({ io, store, now: () => clock });
  const playerSocket = new FakeSocket('player-socket');
  io.sockets.push(playerSocket);
  const joined = await manager.joinPlayer(playerSocket, { joinCode: room.joinCode, displayName: 'Asha' });
  return { io, store, room, manager, hostToken, playerSocket, joined, setClock: (value) => { clock = value; } };
};

test('the active-question payload never exposes a correct answer', async () => {
  const { manager, room, hostToken, playerSocket } = await fixture();
  await manager.startGame(playerSocket, { joinCode: room.joinCode, hostToken });
  const question = playerSocket.events.find((event) => event.event === 'game:question')?.payload;
  assert.ok(question);
  assert.equal('correctOptionId' in question, false);
  assert.equal(question.options.length, 2);
});

test('only a first, on-time answer is accepted and the answer is revealed after close', async () => {
  const { manager, room, hostToken, playerSocket, setClock, io } = await fixture();
  await manager.startGame(playerSocket, { joinCode: room.joinCode, hostToken });
  const question = playerSocket.events.find((event) => event.event === 'game:question').payload;
  setClock(2_000);
  await manager.submitAnswer(playerSocket, { roundId: question.roundId, optionId: 'option-b' });
  await assert.rejects(
    () => manager.submitAnswer(playerSocket, { roundId: question.roundId, optionId: 'option-b' }),
    (error) => error instanceof HttpError && error.code === 'DUPLICATE_ANSWER'
  );
  await manager.closeRound(room.id, 0);
  const result = io.roomEvents.find((event) => event.event === 'game:round-result')?.payload;
  assert.equal(result.correctOptionId, 'option-b');
  assert.equal(result.leaderboard[0].score, 975);
});
