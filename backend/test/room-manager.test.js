import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../src/game/room-manager.js';
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
  const host = await store.createHost({ email: 'owner@example.com', passwordHash: 'test-only' });
  const questionSet = await store.createQuestionSet({
    title: 'Core test', ownerId: host.id,
    questions: [{ id: 'question-1', prompt: '2 + 2?', topic: 'quantitative', difficulty: 'easy', durationMs: 20_000, position: 0,
      options: [{ id: 'option-a', text: '3' }, { id: 'option-b', text: '4' }], correctOptionId: 'option-b' }]
  });
  const room = await store.createRoom({ questionSetId: questionSet.id, ownerId: host.id, collegeName: 'Demo College', seasonName: 'Hackathon Demo' });
  let clock = 1_000;
  const manager = new RoomManager({ io, store, now: () => clock });
  const hostSocket = new FakeSocket('host-socket');
  hostSocket.data.hostId = host.id;
  const playerSocket = new FakeSocket('player-socket');
  io.sockets.push(hostSocket, playerSocket);
  const joined = await manager.joinPlayer(playerSocket, { joinCode: room.joinCode, displayName: 'Asha' });
  return { io, store, room, manager, hostSocket, playerSocket, joined, setClock: (value) => { clock = value; } };
};

test('the active-question payload never exposes a correct answer', async () => {
  const { manager, room, hostSocket, playerSocket } = await fixture();
  await manager.startGame(hostSocket, { joinCode: room.joinCode });
  const question = playerSocket.events.find((event) => event.event === 'game:question')?.payload;
  assert.ok(question);
  assert.equal('correctOptionId' in question, false);
  assert.equal(question.options.length, 2);
});

test('only a first, on-time answer is accepted and the answer is revealed after close', async () => {
  const { manager, room, hostSocket, playerSocket, setClock, io } = await fixture();
  await manager.startGame(hostSocket, { joinCode: room.joinCode });
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

test('late answers are rejected and a reconnect after round closure replays authorized results', async () => {
  const { manager, room, hostSocket, playerSocket, joined, setClock } = await fixture();
  await manager.startGame(hostSocket, { joinCode: room.joinCode });
  const question = playerSocket.events.find((event) => event.event === 'game:question').payload;
  setClock(21_301);
  await assert.rejects(
    () => manager.submitAnswer(playerSocket, { roundId: question.roundId, optionId: 'option-b' }),
    (error) => error instanceof HttpError && error.code === 'ANSWER_LATE'
  );

  await manager.closeRound(room.id, 0);
  const reconnectSocket = new FakeSocket('reconnected-player');
  await manager.joinPlayer(reconnectSocket, {
    joinCode: room.joinCode, displayName: 'Asha', reconnectToken: joined.reconnectToken
  });
  const replay = reconnectSocket.events.find((event) => event.event === 'game:round-result')?.payload;
  assert.equal(replay.correctOptionId, 'option-b');
});

test('completed players can reconnect to the final server result', async () => {
  const { manager, room, hostSocket, playerSocket, joined, setClock } = await fixture();
  await manager.startGame(hostSocket, { joinCode: room.joinCode });
  const question = playerSocket.events.find((event) => event.event === 'game:question').payload;
  setClock(2_000);
  await manager.submitAnswer(playerSocket, { roundId: question.roundId, optionId: 'option-b' });
  await manager.closeRound(room.id, 0);
  await manager.nextQuestion(hostSocket, { joinCode: room.joinCode });

  const reconnectSocket = new FakeSocket('reconnected-after-completion');
  await manager.joinPlayer(reconnectSocket, {
    joinCode: room.joinCode, displayName: 'Asha', reconnectToken: joined.reconnectToken
  });
  const final = reconnectSocket.events.find((event) => event.event === 'game:complete')?.payload;
  assert.equal(final.results[0].score, 975);
  assert.equal(final.league[0].points, 975);
});

test('only the authenticated owner can control a room and a host cannot join it as a player', async () => {
  const { manager, room, hostSocket, store } = await fixture();
  const otherHost = await store.createHost({ email: 'other@example.com', passwordHash: 'test-only' });
  const impostor = new FakeSocket('impostor');
  impostor.data.hostId = otherHost.id;
  await assert.rejects(
    () => manager.startGame(impostor, { joinCode: room.joinCode }),
    (error) => error instanceof HttpError && error.code === 'FORBIDDEN'
  );
  await assert.rejects(
    () => manager.joinPlayer(hostSocket, { joinCode: room.joinCode, displayName: 'Host as student' }),
    (error) => error instanceof HttpError && error.code === 'HOST_CANNOT_PLAY'
  );
});
