import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreAnswer } from '../src/domain/scoring.js';

test('scoring rewards correct answers, speed, and a three-answer streak', () => {
  assert.equal(scoreAnswer({ isCorrect: false, receivedAt: 1_000, startedAt: 0, durationMs: 20_000, streak: 0 }), 0);
  const fast = scoreAnswer({ isCorrect: true, receivedAt: 1_000, startedAt: 0, durationMs: 20_000, streak: 1 });
  const slow = scoreAnswer({ isCorrect: true, receivedAt: 18_000, startedAt: 0, durationMs: 20_000, streak: 1 });
  const streak = scoreAnswer({ isCorrect: true, receivedAt: 1_000, startedAt: 0, durationMs: 20_000, streak: 3 });
  assert.ok(fast > slow);
  assert.equal(streak - fast, 150);
});
