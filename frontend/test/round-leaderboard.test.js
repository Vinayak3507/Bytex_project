import test from 'node:test';
import assert from 'node:assert/strict';
import { RoundLeaderboard } from '../src/pages/ActiveRoom.js';

test('round results show ranked standings to each participant and keep host controls with the host', () => {
  const state = {
    roomCode: 'AB12CD34', questionIndex: 0, totalQuestions: 3, currentPlayerId: 'p2', isHost: false, busy: false, error: '',
    players: [
      { id: 'p2', name: 'Rohan', college: 'VIT', score: 400, avatar: 'R', color: 'blue' },
      { id: 'p1', name: 'Asha', college: 'VIT', score: 700, avatar: 'A', color: 'lime' }
    ]
  };

  const participantView = RoundLeaderboard(state);
  assert.match(participantView, /You placed #2 after question 1/);
  assert.match(participantView, /Asha/);
  assert.match(participantView, /Rohan/);
  assert.match(participantView, /Only correct answers earn points; skipped and incorrect answers earn zero/);
  assert.doesNotMatch(participantView, /data-action="next-question"/);

  const hostView = RoundLeaderboard({ ...state, isHost: true });
  assert.match(hostView, /data-action="next-question"/);
});
