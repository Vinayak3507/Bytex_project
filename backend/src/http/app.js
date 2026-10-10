import cors from 'cors';
import express from 'express';
import { HttpError, assert } from '../lib/http-error.js';
import { hashToken, token } from '../lib/ids.js';
import { hashPassword, publicHost, sessionExpiresAt, verifyPassword } from '../auth/credentials.js';
import { materializeQuestionSet, quizValidationErrors, validateCredentials, validateQuestionSet, validateRoom } from '../lib/validation.js';

const asyncRoute = (handler) => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
const roomView = (room, playerCount) => ({
  joinCode: room.joinCode, collegeName: room.collegeName, seasonName: room.seasonName,
  status: room.status, playerCount, maxPlayers: 50
});
const authoredSetView = (questionSet) => ({
  id: questionSet.id,
  title: questionSet.title,
  description: questionSet.description ?? '',
  status: questionSet.status ?? 'draft',
  defaultDurationSeconds: (questionSet.defaultDurationMs ?? 20000) / 1000,
  defaultMarks: questionSet.defaultMarks ?? 500,
  createdAt: questionSet.createdAt,
  updatedAt: questionSet.updatedAt ?? questionSet.createdAt,
  questions: questionSet.questions.map(({ id, prompt, topic, difficulty, durationMs, marks, explanation, options, correctOptionId, position }) => ({
    id, prompt, topic, difficulty, durationSeconds: durationMs == null ? null : durationMs / 1000,
    marks: marks ?? null, explanation: explanation ?? '', options, correctOptionId, position
  }))
});
const previewSetView = (questionSet) => ({
  ...authoredSetView(questionSet),
  questions: questionSet.questions.map(({ id, prompt, topic, difficulty, durationMs, marks, options, position }) => ({
    id, prompt, topic, difficulty, durationSeconds: durationMs == null ? questionSet.defaultDurationMs / 1000 : durationMs / 1000,
    marks: marks ?? questionSet.defaultMarks ?? 500, options, position
  }))
});

const assertSetOwner = async (store, questionSetId, hostId) => {
  const questionSet = await store.getQuestionSet(questionSetId);
  assert(questionSet, 404, 'QUESTION_SET_NOT_FOUND', 'Question set not found.');
  assert(questionSet.ownerId === hostId, 403, 'FORBIDDEN', 'You do not own this quiz.');
  return questionSet;
};

export const createApp = ({ store, clientOrigin = 'http://localhost:5173' }) => {
  const app = express();
  const loginAttempts = new Map();
  app.disable('x-powered-by');
  app.use(cors({ origin: clientOrigin.split(',').map((origin) => origin.trim()), methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
  app.use(express.json({ limit: '500kb' }));

  const authRateLimit = (request, _response, next) => {
    const key = `${request.ip}:${request.path}`;
    const now = Date.now();
    const attempts = (loginAttempts.get(key) ?? []).filter((timestamp) => now - timestamp < 15 * 60 * 1000);
    if (attempts.length >= 20) return next(new HttpError(429, 'AUTH_RATE_LIMITED', 'Too many authentication attempts. Try again later.'));
    attempts.push(now);
    loginAttempts.set(key, attempts);
    return next();
  };

  const requireHost = asyncRoute(async (request, _response, next) => {
    const match = /^Bearer ([A-Za-z0-9_-]{40,})$/.exec(request.get('authorization') ?? '');
    assert(match, 401, 'AUTH_REQUIRED', 'Sign in to continue.');
    const session = await store.getHostSession(hashToken(match[1]));
    assert(session, 401, 'SESSION_INVALID', 'Your session has expired. Sign in again.');
    request.authenticatedHost = session.host;
    request.hostSessionTokenHash = hashToken(match[1]);
    return next();
  });

  const createSession = async (host) => {
    const accessToken = token();
    const expiresAt = sessionExpiresAt();
    await store.createHostSession({ tokenHash: hashToken(accessToken), hostId: host.id, expiresAt });
    return { host: publicHost(host), accessToken, expiresAt };
  };

  app.get('/health', (_request, response) => response.json({ ok: true, storage: store.constructor.name }));

  app.post('/api/auth/register', authRateLimit, asyncRoute(async (request, response) => {
    const { email, password } = validateCredentials(request.body, { registration: true });
    const created = await store.createHost({ email, passwordHash: await hashPassword(password) });
    assert(!created.conflict, 409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.');
    response.status(201).json(await createSession(created));
  }));

  app.post('/api/auth/login', authRateLimit, asyncRoute(async (request, response) => {
    const { email, password } = validateCredentials(request.body);
    const host = await store.getHostByEmail(email);
    const valid = host ? await verifyPassword(password, host.passwordHash) : false;
    assert(valid, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    response.json(await createSession(host));
  }));

  app.get('/api/auth/me', requireHost, (request, response) => response.json({ host: publicHost(request.authenticatedHost) }));

  app.post('/api/auth/logout', requireHost, asyncRoute(async (request, response) => {
    await store.deleteHostSession(request.hostSessionTokenHash);
    response.json({ ok: true });
  }));

  app.get('/api/host/dashboard', requireHost, asyncRoute(async (request, response) => {
    const [questionSets, rooms] = await Promise.all([
      store.listQuestionSets(request.authenticatedHost.id), store.listRoomsByOwner(request.authenticatedHost.id)
    ]);
    response.json({ host: publicHost(request.authenticatedHost), questionSets, rooms: await Promise.all(rooms.map(async (room) => roomView(room, (await store.listRoomPlayers(room.id)).length))) });
  }));

  app.post('/api/question-sets', requireHost, asyncRoute(async (request, response) => {
    const input = validateQuestionSet(request.body);
    const questionSet = await store.createQuestionSet({ ...input, ownerId: request.authenticatedHost.id, status: 'draft' });
    response.status(201).json(authoredSetView(questionSet));
  }));

  app.get('/api/question-sets', requireHost, asyncRoute(async (request, response) => {
    response.json({ questionSets: await store.listQuestionSets(request.authenticatedHost.id) });
  }));

  app.get('/api/question-sets/:questionSetId', requireHost, asyncRoute(async (request, response) => {
    const questionSet = await assertSetOwner(store, request.params.questionSetId, request.authenticatedHost.id);
    response.json(authoredSetView(questionSet));
  }));

  app.get('/api/question-sets/:questionSetId/preview', requireHost, asyncRoute(async (request, response) => {
    const questionSet = await assertSetOwner(store, request.params.questionSetId, request.authenticatedHost.id);
    response.json(previewSetView(questionSet));
  }));

  app.put('/api/question-sets/:questionSetId', requireHost, asyncRoute(async (request, response) => {
    await assertSetOwner(store, request.params.questionSetId, request.authenticatedHost.id);
    const questionSet = await store.updateQuestionSet(request.params.questionSetId, validateQuestionSet(request.body));
    response.json(authoredSetView(questionSet));
  }));

  app.delete('/api/question-sets/:questionSetId', requireHost, asyncRoute(async (request, response) => {
    const questionSet = await assertSetOwner(store, request.params.questionSetId, request.authenticatedHost.id);
    assert(questionSet.status === 'draft', 409, 'QUIZ_NOT_DRAFT', 'Only draft quizzes can be deleted.');
    const deleted = await store.deleteQuestionSet(questionSet.id);
    assert(deleted, 409, 'QUIZ_IN_USE', 'This quiz is linked to a room and cannot be deleted.');
    response.json({ ok: true });
  }));

  app.post('/api/question-sets/:questionSetId/publish', requireHost, asyncRoute(async (request, response) => {
    const questionSet = await assertSetOwner(store, request.params.questionSetId, request.authenticatedHost.id);
    const errors = quizValidationErrors(questionSet);
    assert(errors.length === 0, 422, 'QUIZ_INVALID', 'Complete the highlighted quiz fields before publishing.', { fields: errors });
    const published = await store.publishQuestionSet(questionSet.id);
    response.json(authoredSetView(published));
  }));

  app.post('/api/question-sets/:questionSetId/questions', requireHost, asyncRoute(async (request, response) => {
    const current = await assertSetOwner(store, request.params.questionSetId, request.authenticatedHost.id);
    const next = validateQuestionSet({
      ...authoredSetView(current), ...request.body,
      questions: [...current.questions, request.body?.question ?? {}]
    });
    response.status(201).json(authoredSetView(await store.updateQuestionSet(current.id, next)));
  }));

  app.put('/api/question-sets/:questionSetId/questions/reorder', requireHost, asyncRoute(async (request, response) => {
    const current = await assertSetOwner(store, request.params.questionSetId, request.authenticatedHost.id);
    const questionIds = request.body?.questionIds;
    assert(Array.isArray(questionIds) && questionIds.length === current.questions.length && new Set(questionIds).size === questionIds.length && questionIds.every((id) => current.questions.some((question) => question.id === id)), 400, 'INVALID_ORDER', 'questionIds must list every quiz question exactly once.');
    const byId = new Map(current.questions.map((question) => [question.id, question]));
    const ordered = questionIds.map((id) => byId.get(id));
    const updated = await store.updateQuestionSet(current.id, { ...current, questions: ordered });
    response.json(authoredSetView(updated));
  }));

  app.put('/api/question-sets/:questionSetId/questions/:questionId', requireHost, asyncRoute(async (request, response) => {
    const current = await assertSetOwner(store, request.params.questionSetId, request.authenticatedHost.id);
    const index = current.questions.findIndex((question) => question.id === request.params.questionId);
    assert(index >= 0, 404, 'QUESTION_NOT_FOUND', 'Question not found.');
    const questions = [...current.questions];
    questions[index] = { ...questions[index], ...request.body?.question };
    const updated = await store.updateQuestionSet(current.id, validateQuestionSet({ ...authoredSetView(current), questions }));
    response.json(authoredSetView(updated));
  }));

  app.delete('/api/question-sets/:questionSetId/questions/:questionId', requireHost, asyncRoute(async (request, response) => {
    const current = await assertSetOwner(store, request.params.questionSetId, request.authenticatedHost.id);
    const questions = current.questions.filter((question) => question.id !== request.params.questionId);
    assert(questions.length < current.questions.length, 404, 'QUESTION_NOT_FOUND', 'Question not found.');
    const updated = await store.updateQuestionSet(current.id, { ...current, questions });
    response.json(authoredSetView(updated));
  }));

  app.post('/api/question-sets/:questionSetId/rooms', requireHost, asyncRoute(async (request, response) => {
    const questionSet = await assertSetOwner(store, request.params.questionSetId, request.authenticatedHost.id);
    assert(questionSet.status === 'published', 409, 'QUIZ_NOT_PUBLISHED', 'Publish this quiz before creating a room.');
    const errors = quizValidationErrors(questionSet);
    assert(errors.length === 0, 422, 'QUIZ_INVALID', 'This quiz is incomplete and cannot be hosted.', { fields: errors });
    const quizSnapshot = materializeQuestionSet(questionSet);
    const room = await store.createRoom({ questionSetId: questionSet.id, ownerId: request.authenticatedHost.id, quizSnapshot, ...validateRoom(request.body) });
    response.status(201).json({
      room: roomView(room, 0)
    });
  }));

  app.get('/api/rooms/:joinCode', asyncRoute(async (request, response) => {
    const room = await store.getRoomByCode(request.params.joinCode.toUpperCase());
    assert(room, 404, 'ROOM_NOT_FOUND', 'Join code is invalid.');
    const players = await store.listRoomPlayers(room.id);
    response.json({ room: roomView(room, players.length) });
  }));

  app.get('/api/leagues/:seasonName', asyncRoute(async (request, response) => {
    response.json({ seasonName: request.params.seasonName, leaderboard: await store.getLeagueLeaderboard(request.params.seasonName) });
  }));

  app.use((request, _response, next) => next(new HttpError(404, 'NOT_FOUND', `No route exists for ${request.method} ${request.path}.`)));
  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && 'body' in error) return response.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } });
    if (error instanceof HttpError) return response.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.details ?? {}) } });
    console.error(error);
    return response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' } });
  });
  return app;
};
