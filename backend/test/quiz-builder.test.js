import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/http/app.js';
import { MemoryStore } from '../src/store/memory-store.js';

const password = 'correct horse battery staple';
const startServer = async (context) => {
  const store = new MemoryStore();
  const server = http.createServer(createApp({ store }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  context.after(() => new Promise((resolve) => server.close(resolve)));
  return { store, base };
};
const request = (base, path, { method = 'GET', token, body } = {}) => fetch(`${base}${path}`, {
  method,
  headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) })
});
const register = async (base, email) => {
  const response = await request(base, '/api/auth/register', { method: 'POST', body: { email, password } });
  return response.json();
};
const makeQuestion = ({ durationSeconds = null, marks = null, prompt = 'What is 2 + 2?' } = {}) => {
  const correctOptionId = randomUUID();
  return {
    prompt, topic: 'quantitative', difficulty: 'easy', durationSeconds, marks,
    explanation: 'Add the two values.', correctOptionId,
    options: [
      { id: randomUUID(), text: '3' }, { id: correctOptionId, text: '4' },
      { id: randomUUID(), text: '5' }, { id: randomUUID(), text: '6' }
    ]
  };
};

test('draft validation, ownership, publish lifecycle, safe preview, and immutable room snapshot', async (context) => {
  const { store, base } = await startServer(context);
  const host = await register(base, 'quiz-owner@example.com');
  const anotherHost = await register(base, 'other-owner@example.com');
  const token = host.accessToken;
  const created = await request(base, '/api/question-sets', { method: 'POST', token, body: { title: '', questions: [] } });
  assert.equal(created.status, 201);
  const draft = await created.json();
  assert.equal(draft.status, 'draft');

  const incompletePublish = await request(base, `/api/question-sets/${draft.id}/publish`, { method: 'POST', token });
  assert.equal(incompletePublish.status, 422);
  const validation = await incompletePublish.json();
  assert.deepEqual(new Set(validation.error.fields.map((field) => field.field)), new Set(['title', 'questions']));
  const draftRoom = await request(base, `/api/question-sets/${draft.id}/rooms`, { method: 'POST', token, body: { collegeName: 'Demo College' } });
  assert.equal(draftRoom.status, 409);

  const question = makeQuestion({ durationSeconds: 15, marks: 250 });
  const secondQuestion = makeQuestion({ prompt: 'Question using defaults?' });
  const saved = await request(base, `/api/question-sets/${draft.id}`, {
    method: 'PUT', token,
    body: { title: 'Placement Aptitude', description: 'A short demo', defaultDurationSeconds: 30, defaultMarks: 600, questions: [question, secondQuestion] }
  });
  assert.equal(saved.status, 200);
  const quiz = await saved.json();
  assert.equal(quiz.status, 'draft');
  assert.equal(quiz.questions.length, 2);
  assert.equal(quiz.questions[0].correctOptionId, question.correctOptionId);

  const crossOwnerRead = await request(base, `/api/question-sets/${draft.id}`, { token: anotherHost.accessToken });
  assert.equal(crossOwnerRead.status, 403);
  const crossOwnerWrite = await request(base, `/api/question-sets/${draft.id}`, { method: 'PUT', token: anotherHost.accessToken, body: quiz });
  assert.equal(crossOwnerWrite.status, 403);

  const previewResponse = await request(base, `/api/question-sets/${draft.id}/preview`, { token });
  const preview = await previewResponse.json();
  assert.equal('correctOptionId' in preview.questions[0], false);
  assert.equal('explanation' in preview.questions[0], false);

  const publishedResponse = await request(base, `/api/question-sets/${draft.id}/publish`, { method: 'POST', token });
  assert.equal(publishedResponse.status, 200);
  assert.equal((await publishedResponse.json()).status, 'published');
  const roomResponse = await request(base, `/api/question-sets/${draft.id}/rooms`, { method: 'POST', token, body: { collegeName: 'Demo College' } });
  assert.equal(roomResponse.status, 201);
  const { room } = await roomResponse.json();
  const snapshot = (await store.getRoomByCode(room.joinCode)).quizSnapshot;
  assert.equal(snapshot.questions[0].durationMs, 15000);
  assert.equal(snapshot.questions[0].marks, 250);
  assert.equal(snapshot.questions[1].durationMs, 30000);
  assert.equal(snapshot.questions[1].marks, 600);

  const changed = await request(base, `/api/question-sets/${draft.id}`, {
    method: 'PUT', token,
    body: { ...quiz, title: 'Edited source', questions: [{ ...quiz.questions[0], prompt: 'Changed after room creation' }] }
  });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).status, 'draft');
  assert.equal((await store.getRoomByCode(room.joinCode)).quizSnapshot.questions[0].prompt, 'What is 2 + 2?');
});

test('question add, update, reorder, delete, and validation persist as an owned draft', async (context) => {
  const { base } = await startServer(context);
  const host = await register(base, 'question-editor@example.com');
  const token = host.accessToken;
  const created = await request(base, '/api/question-sets', { method: 'POST', token, body: { title: 'Question CRUD', questions: [] } });
  const quiz = await created.json();
  const firstQuestion = makeQuestion();
  const addedFirst = await request(base, `/api/question-sets/${quiz.id}/questions`, { method: 'POST', token, body: { question: firstQuestion } });
  assert.equal(addedFirst.status, 201);
  const first = (await addedFirst.json()).questions[0];
  const secondQuestion = makeQuestion({ prompt: 'New first question' });
  const addedSecond = await request(base, `/api/question-sets/${quiz.id}/questions`, { method: 'POST', token, body: { question: secondQuestion } });
  assert.equal(addedSecond.status, 201);
  const second = (await addedSecond.json()).questions[1];

  const reordered = await request(base, `/api/question-sets/${quiz.id}/questions/reorder`, { method: 'PUT', token, body: { questionIds: [second.id, first.id] } });
  assert.equal((await reordered.json()).questions[0].id, second.id);
  const updated = await request(base, `/api/question-sets/${quiz.id}/questions/${second.id}`, {
    method: 'PUT', token, body: { question: { ...secondQuestion, prompt: 'Updated prompt' } }
  });
  assert.equal((await updated.json()).questions[0].prompt, 'Updated prompt');

  const deleted = await request(base, `/api/question-sets/${quiz.id}/questions/${second.id}`, { method: 'DELETE', token });
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json()).questions.length, 1);

  const invalidOptionQuiz = await request(base, `/api/question-sets/${quiz.id}`, {
    method: 'PUT', token,
    body: { title: 'Invalid saved draft', questions: [{ prompt: '', options: [{ id: randomUUID(), text: '' }], correctOptionId: null }] }
  });
  assert.equal(invalidOptionQuiz.status, 200);
  const invalidPublish = await request(base, `/api/question-sets/${quiz.id}/publish`, { method: 'POST', token });
  assert.equal(invalidPublish.status, 422);
  assert.ok((await invalidPublish.json()).error.fields.length >= 3);

  const invalidMarks = await request(base, `/api/question-sets/${quiz.id}`, {
    method: 'PUT', token, body: { title: 'Bad marks', defaultMarks: -1, questions: [] }
  });
  assert.equal(invalidMarks.status, 400);
  assert.equal((await invalidMarks.json()).error.fields[0].field, 'defaultMarks');
});
