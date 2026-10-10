import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute } from '../src/services/router.js';
import { HostAuthPage, HostDashboard, HostQuizEditor, HostQuizPreview, HostRoom } from '../src/pages/HostPages.js';

test('host and participant routes resolve to distinct protected views', () => {
  assert.deepEqual(resolveRoute('/host/login', false), { view: 'host-login' });
  assert.deepEqual(resolveRoute('/host/register', false), { view: 'host-register' });
  assert.deepEqual(resolveRoute('/host', false), { view: 'host-login' });
  assert.deepEqual(resolveRoute('/host/room/AB12CD34', true), { view: 'host-room' });
  assert.deepEqual(resolveRoute('/host/quiz/quiz-id/edit', true), { view: 'host-quiz-editor' });
  assert.deepEqual(resolveRoute('/host/quiz/quiz-id/preview', true), { view: 'host-quiz-preview' });
  assert.deepEqual(resolveRoute('/join/AB12CD34', true), { view: 'redirect', to: '/host' });
  assert.deepEqual(resolveRoute('/?join=AB12CD34', false), { view: 'participant' });
});

test('host pages render account controls, owned quiz actions, and host-only room status', () => {
  assert.match(HostAuthPage({ error: '', busy: false }, 'register'), /CREATE ACCOUNT/);
  const dashboard = HostDashboard({ host: { email: 'host@example.com' }, questionSets: [], rooms: [] });
  assert.match(dashboard, /CREATE QUIZ/);
  assert.match(dashboard, /Quiz library/);
  const quiz = {
    id: 'quiz-id', title: 'Logic round', description: 'A quick test', status: 'draft', defaultDurationSeconds: 20,
    defaultMarks: 500, createdAt: new Date().toISOString(), questions: [{ id: 'q1', prompt: '', topic: 'logic', durationSeconds: null,
      marks: null, explanation: '', options: [{ id: 'a', text: '' }, { id: 'b', text: '' }], correctOptionId: null, position: 0 }]
  };
  const editor = HostQuizEditor({ host: { email: 'host@example.com' }, editingQuiz: quiz, error: '', dirty: true });
  assert.match(editor, /ADD QUESTION/);
  assert.match(editor, /POST-ROUND EXPLANATION/);
  assert.match(editor, /defaultMarks/);
  assert.match(editor, /PUBLISH QUIZ/);
  const preview = HostQuizPreview({ host: { email: 'host@example.com' }, previewQuiz: { ...quiz, questions: [{ ...quiz.questions[0], prompt: 'Private answer?', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] }] } });
  assert.match(preview, /STUDENT-FACING PREVIEW/);
  assert.doesNotMatch(preview, /correctOptionId/);
  const hostView = HostRoom({
    hostEmail: 'host@example.com', phase: 'playing', roomCode: 'AB12CD34', joinUrl: 'http://localhost:4173/?join=AB12CD34',
    players: [{ name: 'Asha', online: true, answered: true, score: 0 }], questionIndex: 0, totalQuestions: 1,
    currentQuestion: { category: 'Logic', prompt: 'A private live prompt', durationSeconds: 10, options: [] },
    secondsLeft: 7, roundClosed: false, correctOptionId: null, busy: false, error: ''
  });
  assert.match(hostView, /ROOM ROSTER/);
  assert.match(hostView, /ANSWER RECEIVED/);
  assert.match(hostView, /A private live prompt/);
  assert.doesNotMatch(hostView, /data-answer=/);

  const finalView = HostRoom({
    hostEmail: 'host@example.com', phase: 'results', roomCode: 'AB12CD34', players: [
      { id: 'p1', name: 'Asha', score: 900 }, { id: 'p2', name: 'Rohan', score: 700 }
    ]
  });
  assert.match(finalView, /Final leaderboard/);
  assert.match(finalView, /Asha/);
  assert.match(finalView, /900 pts/);
});
