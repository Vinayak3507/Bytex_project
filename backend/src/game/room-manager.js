import { randomInt } from 'node:crypto';
import { calculateTopicStats, ROUND_GRACE_MS, scoreAnswer } from '../domain/scoring.js';
import { HttpError, assert } from '../lib/http-error.js';
import { hashToken, token } from '../lib/ids.js';
import { validateJoin } from '../lib/validation.js';

const safeRoom = (room) => ({
  id: room.id,
  joinCode: room.joinCode,
  collegeName: room.collegeName,
  seasonName: room.seasonName,
  status: room.status,
  currentQuestionIndex: room.currentQuestionIndex,
  roundEndsAt: room.roundEndsAt
});
const safePlayer = (player, onlinePlayerIds) => ({
  id: player.id,
  displayName: player.displayName,
  score: player.score,
  online: onlinePlayerIds.has(player.id)
});

const shuffled = (items) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

const clientQuestion = (question, room) => ({
  roundId: `${room.id}:${question.id}:${room.roundStartedAt}`,
  questionId: question.id,
  questionNumber: room.currentQuestionIndex + 1,
  totalQuestions: undefined,
  prompt: question.prompt,
  topic: question.topic,
  difficulty: question.difficulty,
  durationMs: question.durationMs,
  startsAt: room.roundStartedAt,
  endsAt: room.roundEndsAt,
  options: shuffled(question.options).map(({ id, text }) => ({ id, text }))
});

export class RoomManager {
  constructor({ io, store, now = () => Date.now() }) {
    this.io = io;
    this.store = store;
    this.now = now;
    this.roundTimers = new Map();
    this.onlineSockets = new Map();
  }

  onlinePlayerIds(roomId) {
    return new Set([...this.onlineSockets.entries()].filter(([, socket]) => socket.data.roomId === roomId && socket.data.playerId).map(([, socket]) => socket.data.playerId));
  }

  async getRoomQuestionSet(room) {
    return room.quizSnapshot ?? this.store.getQuestionSet(room.questionSetId);
  }

  async roomSnapshot(roomId) {
    const room = await this.store.getRoom(roomId);
    const players = await this.store.listRoomPlayers(roomId);
    const online = this.onlinePlayerIds(roomId);
    const questionSet = room.status === 'in_progress' ? await this.getRoomQuestionSet(room) : null;
    const question = questionSet?.questions[room.currentQuestionIndex];
    const answers = question ? await this.store.listAnswersForQuestion(room.id, question.id) : [];
    const answeredIds = new Set(answers.map((answer) => answer.playerId));
    return { room: safeRoom(room), players: players.map((player) => ({ ...safePlayer(player, online), answered: answeredIds.has(player.id) })) };
  }

  async emitLobby(roomId) {
    this.io.to(roomId).emit('room:lobby', await this.roomSnapshot(roomId));
  }

  async assertHost(room, socket) {
    assert(socket.data.hostId, 401, 'AUTH_REQUIRED', 'Sign in as the quiz host to control this room.');
    assert(room.ownerId === socket.data.hostId, 403, 'FORBIDDEN', 'You do not own this room.');
    const questionSet = await this.getRoomQuestionSet(room);
    assert(questionSet, 404, 'QUESTION_SET_NOT_FOUND', 'Question set not found.');
    assert(questionSet.ownerId === socket.data.hostId, 403, 'FORBIDDEN', 'You do not own this quiz.');
    return room.quizSnapshot ?? questionSet;
  }

  async observeHost(socket, { joinCode }) {
    const room = await this.store.getRoomByCode(String(joinCode ?? '').toUpperCase());
    assert(room, 404, 'ROOM_NOT_FOUND', 'Room not found.');
    await this.assertHost(room, socket);
    socket.join(room.id);
    socket.data.roomId = room.id;
    socket.data.role = 'host';
    socket.emit('host:room-state', await this.roomSnapshot(room.id));
    await this.sendCurrentState(socket, room);
    return { room: safeRoom(room) };
  }

  async joinPlayer(socket, rawPayload) {
    const { joinCode, displayName, reconnectToken } = validateJoin(rawPayload);
    const room = await this.store.getRoomByCode(joinCode);
    assert(room, 404, 'ROOM_NOT_FOUND', 'Join code is invalid.');
    assert(room.status !== 'completed' || reconnectToken, 409, 'ROOM_COMPLETED', 'This room has already finished.');
    assert(!socket.data.hostId, 403, 'HOST_CANNOT_PLAY', 'Host accounts must use the host experience, not join as players.');

    let player;
    let issuedReconnectToken = reconnectToken;
    if (reconnectToken) {
      player = await this.store.findPlayerByReconnectHash(room.id, hashToken(reconnectToken));
      assert(player, 403, 'INVALID_RECONNECT_TOKEN', 'Reconnect token is invalid.');
    } else {
      assert(room.status !== 'completed', 409, 'ROOM_COMPLETED', 'This room has already finished.');
      const players = await this.store.listRoomPlayers(room.id);
      assert(players.length < 50, 409, 'ROOM_FULL', 'This room already has 50 players.');
      issuedReconnectToken = token();
      player = await this.store.createPlayer({ roomId: room.id, displayName, reconnectTokenHash: hashToken(issuedReconnectToken) });
      assert(!player.conflict, 409, 'DISPLAY_NAME_TAKEN', 'That display name is already in this room.');
    }

    socket.join(room.id);
    socket.data.roomId = room.id;
    socket.data.playerId = player.id;
    socket.data.role = 'player';
    this.onlineSockets.set(socket.id, socket);
    await this.emitLobby(room.id);
    await this.sendCurrentState(socket, room);
    return { room: safeRoom(room), player: safePlayer(player, this.onlinePlayerIds(room.id)), reconnectToken: issuedReconnectToken };
  }

  async sendCurrentState(socket, existingRoom = null) {
    const room = existingRoom ?? await this.store.getRoom(socket.data.roomId);
    if (!room) return;
    if (room.status === 'in_progress') {
      await this.ensureRoundTimer(room);
      await this.emitQuestion(socket, room);
    }
    if (room.status === 'round_closed') {
      await this.emitQuestion(socket, room);
      await this.replayRoundResult(socket, room);
    }
    if (room.status === 'completed') {
      const questionSet = await this.getRoomQuestionSet(room);
      socket.emit('game:complete', {
        room: safeRoom(room),
        results: await this.roomResults(room.id, questionSet),
        league: await this.store.getLeagueLeaderboard(room.seasonName)
      });
    }
  }

  async replayRoundResult(socket, room) {
    const questionSet = await this.getRoomQuestionSet(room);
    const question = questionSet?.questions[room.currentQuestionIndex];
    if (!question) return;
    socket.emit('game:round-result', {
      questionId: question.id,
      correctOptionId: question.correctOptionId,
      explanation: question.explanation ?? '',
      leaderboard: await this.leaderboard(room.id),
      room: safeRoom(room)
    });
  }

  async startGame(socket, { joinCode }) {
    const room = await this.store.getRoomByCode(String(joinCode ?? '').toUpperCase());
    assert(room, 404, 'ROOM_NOT_FOUND', 'Room not found.');
    const questionSet = await this.assertHost(room, socket);
    assert(room.status === 'lobby', 409, 'INVALID_ROOM_STATE', 'A room can only start from the lobby.');
    const players = await this.store.listRoomPlayers(room.id);
    assert(players.length > 0, 409, 'EMPTY_ROOM', 'At least one player must join before starting.');
    socket.join(room.id);
    socket.data.roomId = room.id;
    socket.data.role = 'host';
    await this.beginRound(room, questionSet, 0);
    return { room: safeRoom(await this.store.getRoom(room.id)) };
  }

  async beginRound(room, questionSet, questionIndex) {
    const question = questionSet.questions[questionIndex];
    assert(question, 409, 'NO_QUESTION', 'There is no question at this index.');
    const startedAt = this.now();
    const updatedRoom = await this.store.updateRoom(room.id, {
      status: 'in_progress', currentQuestionIndex: questionIndex, roundStartedAt: startedAt, roundEndsAt: startedAt + question.durationMs
    });
    await this.emitQuestionToRoom(updatedRoom);
    await this.ensureRoundTimer(updatedRoom);
  }

  async emitQuestion(socket, room) {
    const questionSet = await this.getRoomQuestionSet(room);
    const question = questionSet?.questions[room.currentQuestionIndex];
    if (!question) return;
    const payload = clientQuestion(question, room);
    payload.totalQuestions = questionSet.questions.length;
    socket.emit('game:question', payload);
  }

  async emitQuestionToRoom(room) {
    const sockets = await this.io.in(room.id).fetchSockets();
    await Promise.all(sockets.map((socket) => this.emitQuestion(socket, room)));
  }

  async ensureRoundTimer(room) {
    if (room.status !== 'in_progress') return;
    const key = `${room.id}:${room.currentQuestionIndex}`;
    if (this.roundTimers.has(key)) return;
    const delay = Math.max(0, room.roundEndsAt + ROUND_GRACE_MS - this.now());
    const timer = setTimeout(() => {
      this.roundTimers.delete(key);
      this.closeRound(room.id, room.currentQuestionIndex).catch((error) => this.io.to(room.id).emit('game:error', { code: 'ROUND_CLOSE_FAILED', message: error.message }));
    }, delay);
    timer.unref?.();
    this.roundTimers.set(key, timer);
  }

  async submitAnswer(socket, { roundId, optionId }) {
    const { roomId, playerId } = socket.data;
    assert(roomId && playerId, 403, 'NOT_JOINED', 'Join a room before answering.');
    const room = await this.store.getRoom(roomId);
    assert(room?.status === 'in_progress', 409, 'ROUND_NOT_ACTIVE', 'There is no active question.');
    const questionSet = await this.getRoomQuestionSet(room);
    const question = questionSet?.questions[room.currentQuestionIndex];
    assert(question && roundId === `${room.id}:${question.id}:${room.roundStartedAt}`, 409, 'STALE_ROUND', 'That question is no longer active.');
    assert(this.now() <= room.roundEndsAt + ROUND_GRACE_MS, 409, 'ANSWER_LATE', 'Time has expired for this question.');
    assert(question.options.some((option) => option.id === optionId), 400, 'INVALID_OPTION', 'That option does not belong to this question.');
    const receivedAt = this.now();
    const result = await this.store.recordAnswer({ roomId, playerId, questionId: question.id, optionId, receivedAt, responseMs: Math.max(0, receivedAt - room.roundStartedAt) });
    assert(!result.duplicate, 409, 'DUPLICATE_ANSWER', 'Only the first answer is accepted.');
    socket.emit('game:answer-received', { roundId });
    await this.emitLobby(roomId);
    return { accepted: true, roundId };
  }

  async closeRound(roomId, expectedQuestionIndex) {
    const room = await this.store.getRoom(roomId);
    if (!room || room.status !== 'in_progress' || room.currentQuestionIndex !== expectedQuestionIndex) return;
    const timerKey = `${room.id}:${room.currentQuestionIndex}`;
    const activeTimer = this.roundTimers.get(timerKey);
    if (activeTimer) clearTimeout(activeTimer);
    this.roundTimers.delete(timerKey);
    const questionSet = await this.getRoomQuestionSet(room);
    const question = questionSet.questions[room.currentQuestionIndex];
    const answers = await this.store.listAnswersForQuestion(room.id, question.id);
    const players = await this.store.listRoomPlayers(room.id);
    const answersByPlayer = new Map(answers.map((answer) => [answer.playerId, answer]));

    for (const player of players) {
      const answer = answersByPlayer.get(player.id);
      if (!answer) {
        await this.store.updatePlayer(player.id, { currentStreak: 0 });
        continue;
      }
      const isCorrect = answer.optionId === question.correctOptionId;
      const nextStreak = isCorrect ? player.currentStreak + 1 : 0;
      const points = scoreAnswer({ isCorrect, receivedAt: answer.receivedAt, startedAt: room.roundStartedAt, durationMs: question.durationMs, streak: nextStreak, correctMarks: question.marks ?? questionSet.defaultMarks ?? 500 });
      await this.store.updateAnswer(answer.id, { isCorrect, points });
      await this.store.updatePlayer(player.id, { score: player.score + points, currentStreak: nextStreak });
    }

    const closedRoom = await this.store.updateRoom(room.id, { status: 'round_closed' });
    const leaderboard = await this.leaderboard(room.id);
    this.io.to(room.id).emit('game:round-result', {
      questionId: question.id,
      correctOptionId: question.correctOptionId,
      explanation: question.explanation ?? '',
      leaderboard,
      room: safeRoom(closedRoom)
    });
    this.io.to(room.id).emit('game:leaderboard', { leaderboard, room: safeRoom(closedRoom) });
  }

  async nextQuestion(socket, { joinCode }) {
    const room = await this.store.getRoomByCode(String(joinCode ?? '').toUpperCase());
    assert(room, 404, 'ROOM_NOT_FOUND', 'Room not found.');
    const questionSet = await this.assertHost(room, socket);
    assert(room.status === 'round_closed', 409, 'INVALID_ROOM_STATE', 'Close the current question before advancing.');
    const nextIndex = room.currentQuestionIndex + 1;
    if (nextIndex < questionSet.questions.length) {
      await this.beginRound(room, questionSet, nextIndex);
      return { completed: false };
    }
    const completedRoom = await this.store.updateRoom(room.id, { status: 'completed' });
    await this.store.completeRoom(room.id);
    const results = await this.roomResults(room.id, questionSet);
    this.io.to(room.id).emit('game:complete', { room: safeRoom(completedRoom), results, league: await this.store.getLeagueLeaderboard(room.seasonName) });
    return { completed: true, results };
  }

  async leaderboard(roomId) {
    const online = this.onlinePlayerIds(roomId);
    return (await this.store.listRoomPlayers(roomId))
      .sort((a, b) => b.score - a.score || a.joinedAt.localeCompare(b.joinedAt))
      .map((player, index) => ({ rank: index + 1, ...safePlayer(player, online) }));
  }

  async roomResults(roomId, questionSet) {
    const questions = new Map(questionSet.questions.map((question) => [question.id, question]));
    const answers = await this.store.listAnswersForRoom(roomId);
    const byPlayer = new Map();
    for (const answer of answers) {
      const question = questions.get(answer.questionId);
      const list = byPlayer.get(answer.playerId) ?? [];
      list.push({ topic: question.topic, isCorrect: answer.isCorrect, responseMs: answer.responseMs ?? 0 });
      byPlayer.set(answer.playerId, list);
    }
    const players = await this.store.listRoomPlayers(roomId);
    return players.map((player) => {
      const playerAnswers = byPlayer.get(player.id) ?? [];
      const correct = playerAnswers.filter((answer) => answer.isCorrect).length;
      return {
        playerId: player.id, displayName: player.displayName, score: player.score,
        accuracy: questionSet.questions.length ? Math.round((correct / questionSet.questions.length) * 100) : 0,
        topicStats: calculateTopicStats(playerAnswers)
      };
    }).sort((a, b) => b.score - a.score);
  }

  async disconnect(socket) {
    this.onlineSockets.delete(socket.id);
    if (socket.data.roomId) await this.emitLobby(socket.data.roomId);
  }
}
