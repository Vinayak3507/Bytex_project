import { id, joinCode } from '../lib/ids.js';

export class MemoryStore {
  constructor() {
    this.questionSets = new Map();
    this.rooms = new Map();
    this.players = new Map();
    this.answers = new Map();
    this.leaguePoints = new Map();
  }

  async createQuestionSet({ title, ownerTokenHash, questions }) {
    const questionSet = { id: id(), title, ownerTokenHash, createdAt: new Date().toISOString(), questions };
    this.questionSets.set(questionSet.id, questionSet);
    return questionSet;
  }

  async listQuestionSets() {
    return [...this.questionSets.values()].map(({ ownerTokenHash, questions, ...set }) => ({ ...set, questionCount: questions.length }));
  }

  async getQuestionSet(questionSetId) { return this.questionSets.get(questionSetId) ?? null; }
  async updateQuestionSet(questionSetId, { title, questions }) {
    const questionSet = await this.getQuestionSet(questionSetId);
    if (!questionSet) return null;
    questionSet.title = title;
    questionSet.questions = questions;
    return questionSet;
  }

  async createRoom({ questionSetId, collegeName, seasonName }) {
    let code = joinCode();
    while ([...this.rooms.values()].some((room) => room.joinCode === code)) code = joinCode();
    const room = {
      id: id(), questionSetId, collegeName, seasonName, joinCode: code, status: 'lobby',
      currentQuestionIndex: -1, roundStartedAt: null, roundEndsAt: null, createdAt: new Date().toISOString()
    };
    this.rooms.set(room.id, room);
    return room;
  }

  async getRoomByCode(code) { return [...this.rooms.values()].find((room) => room.joinCode === code) ?? null; }
  async getRoom(roomId) { return this.rooms.get(roomId) ?? null; }
  async updateRoom(roomId, updates) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    Object.assign(room, updates);
    return room;
  }

  async listRoomPlayers(roomId) { return [...this.players.values()].filter((player) => player.roomId === roomId); }
  async getPlayer(playerId) { return this.players.get(playerId) ?? null; }
  async findPlayerByReconnectHash(roomId, reconnectTokenHash) {
    return [...this.players.values()].find((player) => player.roomId === roomId && player.reconnectTokenHash === reconnectTokenHash) ?? null;
  }
  async createPlayer({ roomId, displayName, reconnectTokenHash }) {
    const existing = (await this.listRoomPlayers(roomId)).find((player) => player.displayName.toLowerCase() === displayName.toLowerCase());
    if (existing) return { conflict: true };
    const player = { id: id(), roomId, displayName, reconnectTokenHash, score: 0, currentStreak: 0, joinedAt: new Date().toISOString() };
    this.players.set(player.id, player);
    return player;
  }
  async updatePlayer(playerId, updates) {
    const player = this.players.get(playerId);
    if (!player) return null;
    Object.assign(player, updates);
    return player;
  }

  answerKey(roomId, playerId, questionId) { return `${roomId}:${playerId}:${questionId}`; }
  async recordAnswer(answer) {
    const key = this.answerKey(answer.roomId, answer.playerId, answer.questionId);
    if (this.answers.has(key)) return { duplicate: true, answer: this.answers.get(key) };
    const saved = { id: id(), points: 0, isCorrect: null, ...answer };
    this.answers.set(key, saved);
    return { duplicate: false, answer: saved };
  }
  async getAnswer(roomId, playerId, questionId) { return this.answers.get(this.answerKey(roomId, playerId, questionId)) ?? null; }
  async listAnswersForQuestion(roomId, questionId) { return [...this.answers.values()].filter((answer) => answer.roomId === roomId && answer.questionId === questionId); }
  async listAnswersForRoom(roomId) { return [...this.answers.values()].filter((answer) => answer.roomId === roomId); }
  async updateAnswer(answerId, updates) {
    const answer = [...this.answers.values()].find((item) => item.id === answerId);
    if (!answer) return null;
    Object.assign(answer, updates);
    return answer;
  }

  async completeRoom(roomId) {
    const room = await this.getRoom(roomId);
    if (!room) return null;
    const players = await this.listRoomPlayers(roomId);
    const total = players.reduce((sum, player) => sum + player.score, 0);
    const key = `${room.seasonName}:${room.collegeName}`;
    const entry = this.leaguePoints.get(key) ?? { seasonName: room.seasonName, collegeName: room.collegeName, points: 0, roomsPlayed: 0 };
    entry.points += total;
    entry.roomsPlayed += 1;
    this.leaguePoints.set(key, entry);
    return entry;
  }
  async getLeagueLeaderboard(seasonName = 'Hackathon Demo') {
    return [...this.leaguePoints.values()].filter((entry) => entry.seasonName === seasonName).sort((a, b) => b.points - a.points || a.collegeName.localeCompare(b.collegeName));
  }
}
