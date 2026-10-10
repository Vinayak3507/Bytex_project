/* Keep these names aligned with backend/src/socket/register-handlers.js. */
export const ClientEvents = Object.freeze({
  JOIN_ROOM: 'room:join', HOST_OBSERVE: 'host:observe', HOST_START: 'host:game:start',
  HOST_NEXT_QUESTION: 'host:next-question', ANSWER_SUBMIT: 'answer:submit'
});
export const ServerEvents = Object.freeze({
  ROOM_LOBBY: 'room:lobby', HOST_ROOM_STATE: 'host:room-state', QUESTION: 'game:question',
  ANSWER_RECEIVED: 'game:answer-received', ROUND_RESULT: 'game:round-result',
  LEADERBOARD: 'game:leaderboard', COMPLETE: 'game:complete', ERROR: 'game:error'
});
