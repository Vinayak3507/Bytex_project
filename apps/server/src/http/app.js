import cors from 'cors';
import express from 'express';
import { HttpError, assert } from '../lib/http-error.js';
import { hashToken, token, tokensMatch } from '../lib/ids.js';
import { validateQuestionSet, validateRoom } from '../lib/validation.js';

const asyncRoute = (handler) => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
const hostToken = (request) => request.get('x-host-token');
const roomView = (room, playerCount) => ({
  joinCode: room.joinCode, collegeName: room.collegeName, seasonName: room.seasonName,
  status: room.status, playerCount, maxPlayers: 50
});
const authoredSetView = (questionSet) => ({
  id: questionSet.id,
  title: questionSet.title,
  questions: questionSet.questions.map(({ id, prompt, topic, difficulty, durationMs, options, position }) => ({
    id, prompt, topic, difficulty, durationMs, options, position
  }))
});

const assertSetOwner = async (store, questionSetId, suppliedToken) => {
  const questionSet = await store.getQuestionSet(questionSetId);
  assert(questionSet, 404, 'QUESTION_SET_NOT_FOUND', 'Question set not found.');
  assert(tokensMatch(suppliedToken, questionSet.ownerTokenHash), 403, 'FORBIDDEN', 'Host token is invalid.');
  return questionSet;
};

export const createApp = ({ store, clientOrigin = 'http://localhost:5173' }) => {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: clientOrigin.split(',').map((origin) => origin.trim()), methods: ['GET', 'POST', 'PUT'], allowedHeaders: ['Content-Type', 'x-host-token'] }));
  app.use(express.json({ limit: '500kb' }));

  app.get('/health', (_request, response) => response.json({ ok: true, storage: store.constructor.name }));

  app.post('/api/question-sets', asyncRoute(async (request, response) => {
    const input = validateQuestionSet(request.body);
    const plainHostToken = token();
    const questionSet = await store.createQuestionSet({ ...input, ownerTokenHash: hashToken(plainHostToken) });
    response.status(201).json({
      id: questionSet.id, title: questionSet.title, questionCount: questionSet.questions.length,
      hostToken: plainHostToken
    });
  }));

  app.get('/api/question-sets', asyncRoute(async (_request, response) => {
    response.json({ questionSets: await store.listQuestionSets() });
  }));

  app.get('/api/question-sets/:questionSetId', asyncRoute(async (request, response) => {
    const questionSet = await assertSetOwner(store, request.params.questionSetId, hostToken(request));
    response.json(authoredSetView(questionSet));
  }));

  app.put('/api/question-sets/:questionSetId', asyncRoute(async (request, response) => {
    await assertSetOwner(store, request.params.questionSetId, hostToken(request));
    const questionSet = await store.updateQuestionSet(request.params.questionSetId, validateQuestionSet(request.body));
    response.json(authoredSetView(questionSet));
  }));

  app.post('/api/question-sets/:questionSetId/rooms', asyncRoute(async (request, response) => {
    const questionSet = await assertSetOwner(store, request.params.questionSetId, hostToken(request));
    assert(questionSet.questions.length > 0, 409, 'EMPTY_QUESTION_SET', 'Question set must contain at least one question.');
    const room = await store.createRoom({ questionSetId: questionSet.id, ...validateRoom(request.body) });
    response.status(201).json({
      room: roomView(room, 0),
      hostToken: hostToken(request)
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
    if (error instanceof HttpError) return response.status(error.status).json({ error: { code: error.code, message: error.message } });
    console.error(error);
    return response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' } });
  });
  return app;
};
