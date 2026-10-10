import { GamePhase } from '../types/game.types.js';
import { socket } from '../contexts/SocketContext.js';
import { api } from '../services/api.js';
import { ClientEvents, ServerEvents } from '../types/socket.types.js';
import { getHostAccessToken } from '../services/hostAuth.js';
import { navigate } from '../services/router.js';

const SESSION_KEY = 'aptiquiz-live-session';
const colors = ['coral', 'lime', 'purple', 'blue'];
const asPlayer = (player, college, index = 0) => ({
  id: player.id,
  name: player.displayName ?? player.name,
  college: player.college ?? college ?? 'AptiQuiz player',
  score: Number(player.score ?? 0),
  avatar: (player.displayName ?? player.name ?? '?').slice(0, 1).toUpperCase(),
  color: colors[index % colors.length],
  answered: Boolean(player.answered),
  online: player.online ?? true,
  accuracy: player.accuracy,
  topicStats: player.topicStats
});
const byScore = (players) => [...players].sort((a, b) => b.score - a.score);
const parseStoredSession = () => {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
};

export class GameStore extends EventTarget {
  constructor() {
    super();
    const joinCode = new URLSearchParams(location.search).get('join')?.toUpperCase() ?? '';
    this.state = {
      phase: GamePhase.LOBBY, screen: joinCode ? 'join' : 'home', roomCode: joinCode, joinUrl: '',
      name: sessionStorage.getItem('aptiquiz-display-name') || 'Player', college: 'VIT Vellore', isHost: false,
      players: [], questions: [], currentQuestion: null, questionIndex: 0, totalQuestions: 0,
      secondsLeft: 0, durationSeconds: 0, selectedOptionId: null, correctOptionId: null,
      answerSubmitted: false, roundClosed: false, roundId: null, serverOffsetMs: 0,
      reaction: '', explanation: '', score: 0, combo: 0, currentPlayerId: null,
      busy: false, error: '', connectionStatus: 'disconnected', leagueLeaderboard: []
    };
    this.session = null;
    this.hasJoined = false;
    this.resuming = false;
    this.socketCleanups = [];
    this.tickHandle = null;
    this.lastConnected = false;
  }

  update(changes) {
    Object.assign(this.state, changes);
    this.dispatchEvent(new Event('change'));
  }

  async openConnection() {
    const client = await socket.connect();
    if (this.socketCleanups.length === 0) this.bindSocketEvents();
    this.lastConnected = true;
    return client;
  }

  bindSocketEvents() {
    const on = (event, handler) => this.socketCleanups.push(socket.on(event, (message) => handler(message.detail)));
    on(ServerEvents.ROOM_LOBBY, (snapshot) => this.applyLobby(snapshot));
    on(ServerEvents.HOST_ROOM_STATE, (snapshot) => this.applyLobby(snapshot));
    on(ServerEvents.QUESTION, (question) => this.applyQuestion(question));
    on(ServerEvents.ANSWER_RECEIVED, () => this.update({ answerSubmitted: true, reaction: 'ANSWER LOCKED' }));
    on(ServerEvents.ROUND_RESULT, (result) => this.applyRoundResult(result));
    on(ServerEvents.LEADERBOARD, (result) => this.applyLeaderboard(result.leaderboard));
    on(ServerEvents.COMPLETE, (result) => this.applyCompletion(result));
    on(ServerEvents.ERROR, (error) => this.update({ error: error.message || 'The game server reported an error.' }));
    on('connection:status', (status) => this.update({ connectionStatus: status.status }));
    on('connection:error', (error) => this.update({ connectionStatus: 'reconnecting', error: error.message }));
    on('connect', () => {
      this.update({ connectionStatus: 'connected' });
      if (this.hasJoined && this.session && this.lastConnected) this.resumeMembership();
      this.lastConnected = true;
    });
  }

  async resumeMembership() {
    if (this.resuming || !this.session) return;
    this.resuming = true;
    try {
      if (this.session.role === 'host') {
        await socket.emitAck(ClientEvents.HOST_OBSERVE, { joinCode: this.session.joinCode });
      } else {
        const joined = await socket.emitAck(ClientEvents.JOIN_ROOM, {
          joinCode: this.session.joinCode,
          displayName: this.session.displayName,
          reconnectToken: this.session.reconnectToken
        });
        this.applyJoin(joined, this.session.displayName, this.session.joinCode);
      }
      this.update({ connectionStatus: 'connected', error: '' });
    } catch (error) {
      this.update({ connectionStatus: 'reconnecting', error: `Reconnecting failed: ${error.message}` });
    } finally {
      this.resuming = false;
    }
  }

  applyLobby(snapshot) {
    if (!snapshot?.room) return;
    const room = snapshot.room;
    const players = (snapshot.players ?? []).map((player, index) => asPlayer(player, room.collegeName, index));
    this.update({
      roomId: room.id,
      roomCode: room.joinCode,
      joinUrl: `${location.origin}/?join=${encodeURIComponent(room.joinCode)}`,
      college: room.collegeName,
      players,
      score: players.find((player) => player.id === this.state.currentPlayerId)?.score ?? this.state.score,
      screen: room.status === 'in_progress' ? 'game' : this.state.screen === 'home' ? 'lobby' : this.state.screen,
      phase: room.status === 'in_progress' ? GamePhase.PLAYING : this.state.phase
    });
  }

  applyQuestion(question) {
    const serverOffsetMs = question.startsAt - Date.now();
    const currentQuestion = {
      id: question.questionId,
      prompt: question.prompt,
      category: question.topic,
      difficulty: question.difficulty,
      durationMs: question.durationMs,
      durationSeconds: Math.ceil(question.durationMs / 1000),
      startsAt: question.startsAt,
      endsAt: question.endsAt,
      options: question.options
    };
    const remaining = Math.max(0, Math.ceil((question.endsAt - (Date.now() + serverOffsetMs)) / 1000));
    const questions = [...this.state.questions];
    questions[question.questionNumber - 1] = currentQuestion;
    this.update({
      phase: GamePhase.PLAYING, screen: 'game', currentQuestion, questions,
      questionIndex: question.questionNumber - 1, totalQuestions: question.totalQuestions,
      durationSeconds: currentQuestion.durationSeconds, secondsLeft: remaining,
      selectedOptionId: null, correctOptionId: null, answerSubmitted: false, roundClosed: false,
      roundId: question.roundId, serverOffsetMs, reaction: '', error: ''
    });
    this.startDisplayTimer();
  }

  startDisplayTimer() {
    clearInterval(this.tickHandle);
    this.tickHandle = setInterval(() => {
      const question = this.state.currentQuestion;
      if (!question || this.state.roundClosed) return;
      const secondsLeft = Math.max(0, Math.ceil((question.endsAt - (Date.now() + this.state.serverOffsetMs)) / 1000));
      if (secondsLeft !== this.state.secondsLeft) this.update({ secondsLeft });
    }, 200);
  }

  applyRoundResult(result) {
    clearInterval(this.tickHandle);
    const players = (result.leaderboard ?? []).map((player, index) => asPlayer(player, this.state.college, index));
    const own = players.find((player) => player.id === this.state.currentPlayerId);
    const selected = this.state.currentQuestion?.options.find((option) => option.id === this.state.selectedOptionId);
    const wasCorrect = selected?.id === result.correctOptionId;
    this.update({
      correctOptionId: result.correctOptionId, explanation: result.explanation ?? '', roundClosed: true, secondsLeft: 0,
      players: byScore(players), score: own?.score ?? this.state.score,
      reaction: this.state.answerSubmitted ? (wasCorrect ? 'CORRECT ANSWER' : 'NOT QUITE') : 'TIME UP'
    });
  }

  applyLeaderboard(leaderboard = []) {
    const players = byScore(leaderboard.map((player, index) => asPlayer(player, this.state.college, index)));
    const own = players.find((player) => player.id === this.state.currentPlayerId);
    this.update({ players, score: own?.score ?? this.state.score });
  }

  applyCompletion(result) {
    clearInterval(this.tickHandle);
    const players = byScore((result.results ?? []).map((player, index) => asPlayer({
      id: player.playerId, displayName: player.displayName, score: player.score,
      accuracy: player.accuracy, topicStats: player.topicStats
    }, result.room?.collegeName ?? this.state.college, index)));
    const own = players.find((player) => player.id === this.state.currentPlayerId);
    this.update({
      phase: GamePhase.RESULTS, screen: 'results', players, score: own?.score ?? this.state.score,
      leagueLeaderboard: result.league ?? this.state.leagueLeaderboard, roundClosed: true,
      error: '', connectionStatus: 'connected'
    });
  }

  async createHostRoom(questionSetId) {
    this.update({ busy: true, error: '' });
    try {
      const created = await api.createRoom(questionSetId, { collegeName: this.state.college, seasonName: 'Hackathon Demo' });
      await this.observeHostRoom(created.room.joinCode);
    } catch (error) {
      this.update({ error: error.message || 'Could not create a room.' });
      throw error;
    } finally {
      this.update({ busy: false });
    }
  }

  async observeHostRoom(joinCode) {
    const code = String(joinCode ?? '').trim().toUpperCase();
    this.session = { role: 'host', joinCode: code };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
    await this.openConnection();
    const observed = await socket.emitAck(ClientEvents.HOST_OBSERVE, { joinCode: code });
    this.hasJoined = true;
    const phase = observed.room.status === 'in_progress' || observed.room.status === 'round_closed'
      ? GamePhase.PLAYING
      : observed.room.status === 'completed' ? GamePhase.RESULTS : GamePhase.LOBBY;
    this.update({
      role: 'host', isHost: true, roomId: observed.room.id, roomCode: code,
      joinUrl: `${location.origin}/?join=${encodeURIComponent(code)}`,
      screen: 'host-room', phase, connectionStatus: 'connected', error: ''
    });
    navigate(`/host/room/${encodeURIComponent(code)}`);
  }

  async join(displayName, _college, joinCode) {
    const code = joinCode.trim().toUpperCase();
    this.update({ busy: true, error: '' });
    try {
      const existing = parseStoredSession();
      const reconnectToken = existing?.role === 'player' && existing.joinCode === code ? existing.reconnectToken : null;
      await this.openConnection();
      const joined = await socket.emitAck(ClientEvents.JOIN_ROOM, { joinCode: code, displayName: displayName.trim(), reconnectToken });
      this.applyJoin(joined, displayName.trim(), code);
      this.session = { role: 'player', joinCode: code, displayName: displayName.trim(), reconnectToken: joined.reconnectToken };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
      sessionStorage.setItem('aptiquiz-display-name', displayName.trim());
      this.hasJoined = true;
    } catch (error) {
      this.update({ error: error.message || 'Could not join that room.' });
    } finally {
      this.update({ busy: false });
    }
  }

  applyJoin(joined, displayName, joinCode) {
    const room = joined.room;
    this.update({
      roomId: room.id, roomCode: room.joinCode ?? joinCode,
      joinUrl: `${location.origin}/?join=${encodeURIComponent(room.joinCode ?? joinCode)}`,
      currentPlayerId: joined.player.id, name: displayName, college: room.collegeName,
      isHost: false, role: 'player', screen: 'lobby', phase: GamePhase.LOBBY,
      score: joined.player.score, connectionStatus: 'connected', error: ''
    });
  }

  async restoreSession() {
    const saved = parseStoredSession();
    if (!saved?.joinCode) return;
    if (saved.role === 'host' && !location.pathname.startsWith('/host/room/')) return;
    if (saved.role === 'host' && !getHostAccessToken()) return;
    if (saved.role !== 'host' && getHostAccessToken()) return;
    this.session = saved;
    this.update({ busy: true, name: saved.displayName ?? this.state.name, roomCode: saved.joinCode, isHost: saved.role === 'host', role: saved.role });
    try {
      await this.openConnection();
      if (saved.role === 'host') {
        const result = await socket.emitAck(ClientEvents.HOST_OBSERVE, { joinCode: saved.joinCode });
        this.hasJoined = true;
        const phase = result.room.status === 'in_progress' || result.room.status === 'round_closed'
          ? GamePhase.PLAYING : result.room.status === 'completed' ? GamePhase.RESULTS : GamePhase.LOBBY;
        this.update({ roomId: result.room.id, roomCode: result.room.joinCode, isHost: true, role: 'host', screen: 'host-room', phase });
      } else {
        const joined = await socket.emitAck(ClientEvents.JOIN_ROOM, { joinCode: saved.joinCode, displayName: saved.displayName, reconnectToken: saved.reconnectToken });
        this.applyJoin(joined, saved.displayName, saved.joinCode);
        this.hasJoined = true;
      }
    } catch (error) {
      this.update({ error: `Could not restore your room: ${error.message}`, screen: saved.role === 'host' ? 'host-room' : 'home' });
    } finally {
      this.update({ busy: false });
    }
  }

  async start() {
    if (!this.state.isHost || !this.session) return;
    this.update({ busy: true, error: '' });
    try {
      await socket.emitAck(ClientEvents.HOST_START, { joinCode: this.session.joinCode });
    } catch (error) {
      this.update({ error: error.message || 'The host could not start the game.' });
    } finally {
      this.update({ busy: false });
    }
  }

  async submitAnswer(optionId) {
    if (!this.state.roundId || this.state.roundClosed || this.state.answerSubmitted || this.state.secondsLeft <= 0) return;
    this.update({ selectedOptionId: optionId, reaction: 'SUBMITTING ANSWER…', error: '' });
    try {
      await socket.emitAck(ClientEvents.ANSWER_SUBMIT, { roundId: this.state.roundId, optionId });
      this.update({ answerSubmitted: true, reaction: 'ANSWER LOCKED' });
    } catch (error) {
      this.update({ selectedOptionId: null, error: error.message || 'The answer was not accepted.' });
    }
  }

  async nextQuestion() {
    if (!this.state.isHost || !this.session || !this.state.roundClosed) return;
    this.update({ busy: true, error: '' });
    try {
      await socket.emitAck(ClientEvents.HOST_NEXT_QUESTION, { joinCode: this.session.joinCode });
    } catch (error) {
      this.update({ error: error.message || 'Could not advance the game.' });
    } finally {
      this.update({ busy: false });
    }
  }

  async loadLeague() {
    try {
      const result = await api.getLeague();
      this.update({ leagueLeaderboard: result.leaderboard ?? [] });
    } catch (error) {
      this.update({ error: error.message });
    }
  }

  async leave() {
    clearInterval(this.tickHandle);
    this.hasJoined = false;
    this.session = null;
    sessionStorage.removeItem(SESSION_KEY);
    await socket.disconnect();
    this.socketCleanups.forEach((cleanup) => cleanup());
    this.socketCleanups = [];
    this.update({
      phase: GamePhase.LOBBY, screen: 'home', roomCode: '', joinUrl: '', isHost: false,
      players: [], questions: [], currentQuestion: null, selectedOptionId: null, correctOptionId: null, explanation: '',
      answerSubmitted: false, roundClosed: false, currentPlayerId: null, score: 0, error: '', busy: false,
      connectionStatus: 'disconnected'
    });
  }

  async leaveHostRoom() {
    clearInterval(this.tickHandle);
    this.hasJoined = false;
    this.session = null;
    sessionStorage.removeItem(SESSION_KEY);
    await socket.disconnect();
    this.socketCleanups.forEach((cleanup) => cleanup());
    this.socketCleanups = [];
    this.update({
      phase: GamePhase.LOBBY, screen: 'home', roomCode: '', joinUrl: '', isHost: false,
      players: [], questions: [], currentQuestion: null, selectedOptionId: null, correctOptionId: null, explanation: '',
      answerSubmitted: false, roundClosed: false, currentPlayerId: null, score: 0, error: '', busy: false,
      connectionStatus: 'disconnected'
    });
  }
<<<<<<< HEAD
  update(changes) { Object.assign(this.state, changes); this.dispatchEvent(new Event('change')); }
  resetMatch() { this.update({ phase:GamePhase.LOBBY, questionIndex:0, secondsLeft:20, selected:null, correct:null, reaction:'', combo:0, score:740, players:structuredClone(mockPlayers) }); }
  join(name, college, code) { const players = structuredClone(mockPlayers); players[1] = { ...players[1], name:name || 'You', college }; this.update({ phase:GamePhase.LOBBY, questionIndex:0, secondsLeft:20, selected:null, correct:null, reaction:'', combo:0, score:740, name:name || 'You', college, roomCode:code.toUpperCase(), players, screen:'lobby', isHost:false }); }
  host() { this.update({ phase:GamePhase.LOBBY, questionIndex:0, secondsLeft:20, selected:null, correct:null, reaction:'', combo:0, score:740, players:structuredClone(mockPlayers), roomCode:'APTI'+Math.floor(10 + Math.random()*90), screen:'lobby', isHost:true }); }
  start() { this.update({ phase:GamePhase.PLAYING, screen:'game', questionIndex:0, secondsLeft:20, selected:null, correct:null, combo:0 }); }
  selectAnswer(index) { if (this.state.selected !== null) return; const question = this.currentQuestion; const correct = index === question.answerIndex; const points = correct ? 100 + this.state.secondsLeft * 4 + this.state.combo * 20 : 0; const score = this.state.score + points; const players = this.state.players.map(player => player.id === 'you' ? { ...player, score, answered:true, roundPoints:points } : player); this.update({ selected:index, correct, score, combo:correct ? this.state.combo + 1 : 0, players, reaction:correct ? `+${points} POINTS!` : 'OOPS! NEXT ONE!' }); }
  showLeaderboard() { if (this.state.phase !== GamePhase.PLAYING || this.state.selected === null) return; const players = this.state.players.map(player => { if (player.id === 'you') return { ...player, answered:true, roundPoints:player.roundPoints || 0 }; const roundPoints = Math.random() > .35 ? 80 + Math.floor(Math.random() * 221) : 0; return { ...player, score:player.score + roundPoints, answered:true, roundPoints }; }); this.update({ phase:GamePhase.ROUND_RESULTS, players }); }
  next() { if (this.state.phase !== GamePhase.ROUND_RESULTS) return; if (this.state.questionIndex >= this.state.questions.length - 1) { const players = [...this.state.players].sort((a,b) => b.score-a.score); this.update({ phase:GamePhase.RESULTS, screen:'results', players }); return; } this.update({ phase:GamePhase.PLAYING, questionIndex:this.state.questionIndex+1, secondsLeft:20, selected:null, correct:null, reaction:'', players:this.state.players.map(player => ({...player,answered:false,roundPoints:0})) }); }
  tick() { if (this.state.screen !== 'game' || this.state.selected !== null) return; if (this.state.secondsLeft <= 1) { this.update({ secondsLeft:0, selected:-1, correct:false, reaction:'TIME UP!' }); return; } this.update({ secondsLeft:this.state.secondsLeft-1 }); }
  get currentQuestion() { return this.state.questions[this.state.questionIndex]; }
=======
>>>>>>> 5c03288 (Build host auth and custom quiz builder)
}

export const game = new GameStore();
