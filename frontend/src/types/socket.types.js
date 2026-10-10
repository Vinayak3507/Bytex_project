/* Event names are grouped here so the backend and frontend can share one contract. */
export const ClientEvents = Object.freeze({ CREATE_ROOM: 'room:create', JOIN_ROOM: 'room:join', START_GAME: 'game:start', ANSWER: 'game:answer', REACT: 'room:react' });
export const ServerEvents = Object.freeze({ ROOM_UPDATED: 'room:updated', QUESTION: 'game:question', ANSWER_RESULT: 'game:answer-result', LEADERBOARD: 'game:leaderboard', FINISHED: 'game:finished' });
