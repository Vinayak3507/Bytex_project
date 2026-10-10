import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { APTIQUIZ_CONFIG: { backendUrl: 'http://localhost:3001/' } };
const tokens = new Map();
globalThis.sessionStorage = { getItem: (key) => tokens.get(key) ?? null, setItem: (key, value) => tokens.set(key, value), removeItem: (key) => tokens.delete(key) };
const { api, ApiError, backendUrl } = await import('../src/services/api.js');

test('API uses the configured backend and the implemented question-set and room routes', async (context) => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ id: 'set-id', room: { joinCode: 'AB12CD34' } }), { status: 201 });
  };

  assert.equal(backendUrl, 'http://localhost:3001');
  tokens.set('aptiquiz-host-access-token', 'opaque-session-token');
  await api.createQuestionSet({ title: 'Test set', questions: [] });
  await api.createRoom('set-id', { collegeName: 'Demo College' });
  assert.equal(requests[0].url, 'http://localhost:3001/api/question-sets');
  assert.equal(requests[1].url, 'http://localhost:3001/api/question-sets/set-id/rooms');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer opaque-session-token');
  assert.equal(requests[1].options.headers.Authorization, 'Bearer opaque-session-token');
  assert.equal('x-host-token' in requests[1].options.headers, false);
});

test('host auth API exposes registration, login, session, logout, and dashboard routes', async (context) => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ host: { id: 'host-id' }, accessToken: 'access-token' }), { status: 200 });
  };
  await api.registerHost({ email: 'host@example.com', password: 'a-long-password' });
  await api.loginHost({ email: 'host@example.com', password: 'a-long-password' });
  await api.currentHost();
  await api.getHostDashboard();
  await api.logoutHost();
  assert.deepEqual(requests.map((entry) => new URL(entry.url).pathname), [
    '/api/auth/register', '/api/auth/login', '/api/auth/me', '/api/host/dashboard', '/api/auth/logout'
  ]);
  assert.equal(requests[2].options.headers.Authorization, 'Bearer opaque-session-token');
});

test('quiz management methods use the protected draft, publish, preview, question and room endpoints', async (context) => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ id: 'quiz-id', questions: [], status: 'draft' }), { status: 200 });
  };
  await api.createQuestionSet({ title: '', questions: [] });
  await api.getQuestionSet('quiz/1');
  await api.updateQuestionSet('quiz/1', { title: 'Edited' });
  await api.previewQuestionSet('quiz/1');
  await api.publishQuestionSet('quiz/1');
  await api.addQuestion('quiz/1', { prompt: 'New' });
  await api.updateQuestion('quiz/1', 'q-1', { prompt: 'Changed' });
  await api.reorderQuestions('quiz/1', ['q-1']);
  await api.deleteQuestion('quiz/1', 'q-1');
  await api.deleteQuestionSet('quiz/1');
  assert.deepEqual(requests.map((entry) => `${entry.options.method || 'GET'} ${new URL(entry.url).pathname}`), [
    'POST /api/question-sets', 'GET /api/question-sets/quiz%2F1', 'PUT /api/question-sets/quiz%2F1',
    'GET /api/question-sets/quiz%2F1/preview', 'POST /api/question-sets/quiz%2F1/publish',
    'POST /api/question-sets/quiz%2F1/questions', 'PUT /api/question-sets/quiz%2F1/questions/q-1',
    'PUT /api/question-sets/quiz%2F1/questions/reorder', 'DELETE /api/question-sets/quiz%2F1/questions/q-1',
    'DELETE /api/question-sets/quiz%2F1'
  ]);
  assert.ok(requests.every((entry) => entry.options.headers.Authorization === 'Bearer opaque-session-token'));
});

test('API reports server validation errors and network failures as useful errors', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'INVALID_INPUT', message: 'Room code is required.', fields: [{ field: 'title', message: 'Add a title.' }] } }), { status: 400 });
  await assert.rejects(() => api.getRoom(''), (error) => error instanceof ApiError && error.code === 'INVALID_INPUT' && error.message === 'Room code is required.');

  globalThis.fetch = async () => { throw new TypeError('offline'); };
  await assert.rejects(() => api.health(), (error) => error instanceof ApiError && error.code === 'NETWORK_ERROR');
});
