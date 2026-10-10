import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/http/app.js';
import { MemoryStore } from '../src/store/memory-store.js';

const password = 'correct horse battery staple';
const quizBody = () => {
  const correctOptionId = randomUUID();
  return {
    title: 'Private quiz',
    questions: [{ prompt: 'Choose the answer', topic: 'logic', difficulty: 'easy', durationMs: 5000, correctOptionId,
      options: [{ id: randomUUID(), text: 'No' }, { id: correctOptionId, text: 'Yes' }] }]
  };
};

const startServer = async (context) => {
  const store = new MemoryStore();
  const server = http.createServer(createApp({ store }));
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  context.after(() => new Promise((resolve) => server.close(resolve)));
  return { store, base };
};

const request = (base, path, { method = 'GET', token, body } = {}) => fetch(`${base}${path}`, {
  method,
  headers: {
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(token ? { authorization: `Bearer ${token}` } : {})
  },
  ...(body === undefined ? {} : { body: JSON.stringify(body) })
});

test('host registration, login, ownership, protected APIs, and logout are enforced', async (context) => {
  const { base } = await startServer(context);
  const credentials = { email: ' First.Host@Example.com ', password };
  const registration = await request(base, '/api/auth/register', { method: 'POST', body: credentials });
  assert.equal(registration.status, 201);
  const firstSession = await registration.json();
  assert.equal(firstSession.host.email, 'first.host@example.com');
  assert.equal('passwordHash' in firstSession.host, false);
  assert.equal('password' in firstSession.host, false);

  const duplicate = await request(base, '/api/auth/register', { method: 'POST', body: credentials });
  assert.equal(duplicate.status, 409);
  const invalidLogin = await request(base, '/api/auth/login', { method: 'POST', body: { email: credentials.email, password: 'wrong password' } });
  assert.equal(invalidLogin.status, 401);
  const login = await request(base, '/api/auth/login', { method: 'POST', body: { email: credentials.email, password } });
  assert.equal(login.status, 200);
  const loggedIn = await login.json();

  const unprotectedAttempt = await request(base, '/api/question-sets', { method: 'POST', body: quizBody() });
  assert.equal(unprotectedAttempt.status, 401);
  const firstQuizResponse = await request(base, '/api/question-sets', { method: 'POST', token: firstSession.accessToken, body: quizBody() });
  assert.equal(firstQuizResponse.status, 201);
  const firstQuiz = await firstQuizResponse.json();
  assert.equal(firstQuiz.status, 'draft');
  const publish = await request(base, `/api/question-sets/${firstQuiz.id}/publish`, { method: 'POST', token: firstSession.accessToken });
  assert.equal(publish.status, 200);

  const secondRegistration = await request(base, '/api/auth/register', {
    method: 'POST', body: { email: 'second.host@example.com', password }
  });
  assert.equal(secondRegistration.status, 201);
  const secondSession = await secondRegistration.json();
  const ownSets = await request(base, '/api/question-sets', { token: secondSession.accessToken });
  assert.deepEqual((await ownSets.json()).questionSets, []);

  const forbiddenRead = await request(base, `/api/question-sets/${firstQuiz.id}`, { token: secondSession.accessToken });
  assert.equal(forbiddenRead.status, 403);
  const forbiddenUpdate = await request(base, `/api/question-sets/${firstQuiz.id}`, { method: 'PUT', token: secondSession.accessToken, body: quizBody() });
  assert.equal(forbiddenUpdate.status, 403);
  const forbiddenRoom = await request(base, `/api/question-sets/${firstQuiz.id}/rooms`, {
    method: 'POST', token: secondSession.accessToken, body: { collegeName: 'Other College' }
  });
  assert.equal(forbiddenRoom.status, 403);

  const dashboard = await request(base, '/api/host/dashboard', { token: firstSession.accessToken });
  const dashboardData = await dashboard.json();
  assert.equal(dashboardData.questionSets.length, 1);
  assert.equal('ownerId' in dashboardData.questionSets[0], false);
  await request(base, '/api/auth/logout', { method: 'POST', token: loggedIn.accessToken });
  const revoked = await request(base, '/api/auth/me', { token: loggedIn.accessToken });
  assert.equal(revoked.status, 401);
  const stillValid = await request(base, '/api/auth/me', { token: firstSession.accessToken });
  assert.equal(stillValid.status, 200);
});

test('registration validates email and password strength', async (context) => {
  const { base } = await startServer(context);
  const shortPassword = await request(base, '/api/auth/register', { method: 'POST', body: { email: 'a@example.com', password: 'short' } });
  assert.equal(shortPassword.status, 400);
  const invalidEmail = await request(base, '/api/auth/register', { method: 'POST', body: { email: 'not-an-email', password } });
  assert.equal(invalidEmail.status, 400);
});
