import { createClient } from '@supabase/supabase-js';
import { id, joinCode } from '../lib/ids.js';

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

const fromSet = (row) => ({
  id: row.id, title: row.title, description: row.description ?? '', ownerId: row.owner_id,
  status: row.status ?? 'draft', defaultDurationMs: row.default_duration_ms ?? 20000,
  defaultMarks: row.default_marks ?? 500, createdAt: row.created_at, updatedAt: row.updated_at ?? row.created_at,
  questions: (row.questions ?? []).map((question) => ({
    id: question.id, prompt: question.prompt, topic: question.topic, difficulty: question.difficulty,
    durationMs: question.duration_ms, marks: question.marks, explanation: question.explanation ?? '',
    options: question.options, correctOptionId: question.correct_option_id, position: question.position
  }))
});
const fromRoom = (row) => row && ({
  id: row.id, questionSetId: row.question_set_id, ownerId: row.owner_id, collegeName: row.college_name, seasonName: row.season_name,
  quizSnapshot: row.quiz_snapshot ?? null,
  joinCode: row.join_code, status: row.status, currentQuestionIndex: row.current_question_index,
  roundStartedAt: row.round_started_at ? Date.parse(row.round_started_at) : null,
  roundEndsAt: row.round_ends_at ? Date.parse(row.round_ends_at) : null, createdAt: row.created_at
});
const fromPlayer = (row) => row && ({
  id: row.id, roomId: row.room_id, displayName: row.display_name, reconnectTokenHash: row.reconnect_token_hash,
  score: row.score, currentStreak: row.current_streak, joinedAt: row.joined_at
});
const fromAnswer = (row) => row && ({
  id: row.id, roomId: row.room_id, playerId: row.player_id, questionId: row.question_id, optionId: row.option_id,
  receivedAt: Date.parse(row.received_at), responseMs: row.response_ms, points: row.points, isCorrect: row.is_correct
});

export class SupabaseStore {
  constructor({ url, serviceRoleKey }) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  async createHost({ email, passwordHash }) {
    const { data, error } = await this.db.from('hosts').insert({ email, password_hash: passwordHash }).select().maybeSingle();
    if (error?.code === '23505') return { conflict: true };
    if (error) throw error;
    return { id: data.id, email: data.email, passwordHash: data.password_hash, createdAt: data.created_at };
  }
  async getHostByEmail(email) {
    const row = unwrap(await this.db.from('hosts').select('*').eq('email', email).maybeSingle());
    return row ? { id: row.id, email: row.email, passwordHash: row.password_hash, createdAt: row.created_at } : null;
  }
  async getHost(hostId) {
    const row = unwrap(await this.db.from('hosts').select('id,email,created_at').eq('id', hostId).maybeSingle());
    return row ? { id: row.id, email: row.email, createdAt: row.created_at } : null;
  }
  async createHostSession({ tokenHash, hostId, expiresAt }) {
    unwrap(await this.db.from('host_sessions').insert({ token_hash: tokenHash, host_id: hostId, expires_at: expiresAt }));
  }
  async getHostSession(tokenHash, now = Date.now()) {
    const row = unwrap(await this.db.from('host_sessions').select('host_id,expires_at').eq('token_hash', tokenHash).maybeSingle());
    if (!row || Date.parse(row.expires_at) <= now) {
      if (row) await this.deleteHostSession(tokenHash);
      return null;
    }
    const host = await this.getHost(row.host_id);
    return host ? { host, expiresAt: row.expires_at } : null;
  }
  async deleteHostSession(tokenHash) { unwrap(await this.db.from('host_sessions').delete().eq('token_hash', tokenHash)); }

  questionRows(questions, questionSetId) {
    return questions.map((question) => ({
      id: question.id, question_set_id: questionSetId, prompt: question.prompt, topic: question.topic, difficulty: question.difficulty,
      duration_ms: question.durationMs, marks: question.marks, explanation: question.explanation,
      options: question.options, correct_option_id: question.correctOptionId, position: question.position
    }));
  }

  async createQuestionSet({ title, description, defaultDurationMs, defaultMarks, ownerId, questions = [] }) {
    const setId = id();
    unwrap(await this.db.from('question_sets').insert({
      id: setId, title, description, owner_id: ownerId, default_duration_ms: defaultDurationMs,
      default_marks: defaultMarks, status: 'draft'
    }));
    await this.updateQuestionSet(setId, { title, description, defaultDurationMs, defaultMarks, questions });
    return this.getQuestionSet(setId);
  }

  async listQuestionSets(ownerId) {
    const rows = unwrap(await this.db.from('question_sets').select('id,title,description,status,default_duration_ms,default_marks,owner_id,created_at,updated_at,questions(count)').eq('owner_id', ownerId).order('updated_at', { ascending: false }));
    return rows.map((row) => ({
      id: row.id, title: row.title, description: row.description ?? '', status: row.status ?? 'draft',
      defaultDurationMs: row.default_duration_ms ?? 20000, defaultMarks: row.default_marks ?? 500,
      createdAt: row.created_at, updatedAt: row.updated_at ?? row.created_at, questionCount: row.questions?.[0]?.count ?? 0
    }));
  }

  async getQuestionSet(questionSetId) {
    const row = unwrap(await this.db.from('question_sets').select('*,questions(*)').eq('id', questionSetId).order('position', { referencedTable: 'questions' }).maybeSingle());
    return row ? fromSet(row) : null;
  }

  async updateQuestionSet(questionSetId, { title, description, defaultDurationMs, defaultMarks, questions }) {
    unwrap(await this.db.rpc('replace_question_set_content', {
      p_question_set_id: questionSetId,
      p_title: title,
      p_description: description,
      p_default_duration_ms: defaultDurationMs,
      p_default_marks: defaultMarks,
      p_questions: this.questionRows(questions, questionSetId)
    }));
    return this.getQuestionSet(questionSetId);
  }

  async publishQuestionSet(questionSetId) {
    const row = unwrap(await this.db.from('question_sets').update({ status: 'published', updated_at: new Date().toISOString() }).eq('id', questionSetId).select('id').maybeSingle());
    return row ? this.getQuestionSet(questionSetId) : null;
  }

  async deleteQuestionSet(questionSetId) {
    const room = unwrap(await this.db.from('rooms').select('id').eq('question_set_id', questionSetId).limit(1).maybeSingle());
    if (room) return false;
    const row = unwrap(await this.db.from('question_sets').delete().eq('id', questionSetId).select('id').maybeSingle());
    return Boolean(row);
  }

  async createRoom({ questionSetId, ownerId, collegeName, seasonName, quizSnapshot }) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const row = { id: id(), question_set_id: questionSetId, owner_id: ownerId, college_name: collegeName, season_name: seasonName, quiz_snapshot: quizSnapshot, join_code: joinCode() };
      const { data, error } = await this.db.from('rooms').insert(row).select().maybeSingle();
      if (!error) return fromRoom(data);
      if (error.code !== '23505') throw error;
    }
    throw new Error('Could not allocate a join code.');
  }

  async getRoomByCode(code) {
    const row = unwrap(await this.db.from('rooms').select('*').eq('join_code', code).maybeSingle());
    return fromRoom(row);
  }
  async getRoom(roomId) {
    const row = unwrap(await this.db.from('rooms').select('*').eq('id', roomId).maybeSingle());
    return fromRoom(row);
  }
  async listRoomsByOwner(ownerId) {
    const rows = unwrap(await this.db.from('rooms').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }));
    return rows.map(fromRoom);
  }
  async updateRoom(roomId, updates) {
    const mapped = {};
    const fields = { questionSetId: 'question_set_id', collegeName: 'college_name', seasonName: 'season_name', currentQuestionIndex: 'current_question_index', roundStartedAt: 'round_started_at', roundEndsAt: 'round_ends_at', status: 'status' };
    for (const [key, column] of Object.entries(fields)) if (key in updates) mapped[column] = ['roundStartedAt', 'roundEndsAt'].includes(key) && updates[key] ? new Date(updates[key]).toISOString() : updates[key];
    const row = unwrap(await this.db.from('rooms').update(mapped).eq('id', roomId).select().maybeSingle());
    return fromRoom(row);
  }

  async listRoomPlayers(roomId) {
    const rows = unwrap(await this.db.from('room_players').select('*').eq('room_id', roomId).order('score', { ascending: false }));
    return rows.map(fromPlayer);
  }
  async getPlayer(playerId) {
    const row = unwrap(await this.db.from('room_players').select('*').eq('id', playerId).maybeSingle());
    return fromPlayer(row);
  }
  async findPlayerByReconnectHash(roomId, reconnectTokenHash) {
    const row = unwrap(await this.db.from('room_players').select('*').eq('room_id', roomId).eq('reconnect_token_hash', reconnectTokenHash).maybeSingle());
    return fromPlayer(row);
  }
  async createPlayer({ roomId, displayName, reconnectTokenHash }) {
    const { data, error } = await this.db.from('room_players').insert({ id: id(), room_id: roomId, display_name: displayName, reconnect_token_hash: reconnectTokenHash }).select().maybeSingle();
    if (error?.code === '23505') return { conflict: true };
    if (error) throw error;
    return fromPlayer(data);
  }
  async updatePlayer(playerId, updates) {
    const mapped = {};
    if ('score' in updates) mapped.score = updates.score;
    if ('currentStreak' in updates) mapped.current_streak = updates.currentStreak;
    const row = unwrap(await this.db.from('room_players').update(mapped).eq('id', playerId).select().maybeSingle());
    return fromPlayer(row);
  }

  async recordAnswer(answer) {
    const { data, error } = await this.db.from('answers').insert({
      id: id(), room_id: answer.roomId, player_id: answer.playerId, question_id: answer.questionId,
      option_id: answer.optionId, received_at: new Date(answer.receivedAt).toISOString(), response_ms: answer.responseMs
    }).select().maybeSingle();
    if (error?.code === '23505') return { duplicate: true, answer: await this.getAnswer(answer.roomId, answer.playerId, answer.questionId) };
    if (error) throw error;
    return { duplicate: false, answer: fromAnswer(data) };
  }
  async getAnswer(roomId, playerId, questionId) {
    const row = unwrap(await this.db.from('answers').select('*').eq('room_id', roomId).eq('player_id', playerId).eq('question_id', questionId).maybeSingle());
    return fromAnswer(row);
  }
  async listAnswersForQuestion(roomId, questionId) {
    const rows = unwrap(await this.db.from('answers').select('*').eq('room_id', roomId).eq('question_id', questionId));
    return rows.map(fromAnswer);
  }
  async listAnswersForRoom(roomId) {
    const rows = unwrap(await this.db.from('answers').select('*').eq('room_id', roomId));
    return rows.map(fromAnswer);
  }
  async updateAnswer(answerId, updates) {
    const row = unwrap(await this.db.from('answers').update({ points: updates.points, is_correct: updates.isCorrect }).eq('id', answerId).select().maybeSingle());
    return fromAnswer(row);
  }

  async completeRoom(roomId) {
    const { data, error } = await this.db.rpc('apply_room_to_league', { p_room_id: roomId });
    if (error) throw error;
    return data;
  }
  async getLeagueLeaderboard(seasonName = 'Hackathon Demo') {
    const rows = unwrap(await this.db.from('league_points').select('season_name,college_name,points,rooms_played').eq('season_name', seasonName).order('points', { ascending: false }));
    return rows.map((row) => ({ seasonName: row.season_name, collegeName: row.college_name, points: row.points, roomsPlayed: row.rooms_played }));
  }
}
