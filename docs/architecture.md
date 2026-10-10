# AptiQuiz architecture

```text
React + Vite frontend
        │ JSON REST + Socket.IO events
        ▼
Node.js + Express + Socket.IO server
        │
        ▼
Supabase Postgres
```

The Node server is the referee. It owns room state, round start/end timestamps, answer acceptance, score calculation, and league updates. A device clock never decides a result.

## Persistence

The migration in `supabase/migrations/202610100001_aptiquiz.sql` creates question sets, questions, rooms, players, answers, and college league points. Row-level security is enabled and browser database access is revoked. Only the backend, using `SUPABASE_SERVICE_ROLE_KEY`, talks to the database.

For local integration without credentials, the server deliberately falls back to in-memory storage. That mode resets on restart and must not be used for the deployed demo.

## REST API

All REST bodies and responses are JSON. Host routes require `x-host-token`; players never receive it.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Server and storage status |
| `POST` | `/api/question-sets` | Create a set; returns its ID and the one-time host token |
| `GET` | `/api/question-sets` | List safe set metadata |
| `GET` | `/api/question-sets/:id` | Read host-owned editable question data, with no correct answer |
| `PUT` | `/api/question-sets/:id` | Replace/reorder questions; request includes the correct option, response never does |
| `POST` | `/api/question-sets/:id/rooms` | Create a lobby and short join code |
| `GET` | `/api/rooms/:joinCode` | Read safe public room metadata |
| `GET` | `/api/leagues/:seasonName` | Read college standings |

Question options and `correctOptionId` use UUIDs. The frontend should create UUIDs when authoring a question; the server validates that the correct option belongs to that question.

## Socket.IO event contract

Every client-to-server event acknowledges JSON in this form:

```json
{ "ok": true, "data": {} }
```

or:

```json
{ "ok": false, "error": { "code": "ERROR_CODE", "message": "Human-readable reason" } }
```

| Direction | Event | Payload |
|---|---|---|
| Client → server | `room:join` | `joinCode`, `displayName`, optional `reconnectToken` |
| Client → server | `host:observe` | `joinCode`, `hostToken` |
| Client → server | `host:game:start` | `joinCode`, `hostToken` |
| Client → server | `host:next-question` | `joinCode`, `hostToken` |
| Client → server | `answer:submit` | `roundId`, `optionId` |
| Server → client | `room:lobby` | Safe room data and player list |
| Server → client | `game:question` | Question, shuffled options, server `startsAt`/`endsAt`; never a correct answer |
| Server → client | `game:answer-received` | Accepted answer acknowledgement only |
| Server → client | `game:round-result` | Correct option and updated leaderboard, sent only after closure |
| Server → client | `game:leaderboard` | Ranking after each closed round |
| Server → client | `game:complete` | Results and college league standings |

## Fairness and security

- A room accepts at most 50 players.
- Each player receives one accepted answer per question; the database also enforces this uniqueness.
- The server stores answer receipt time and accepts a fixed 300 ms grace period after the official close time.
- The score is `500 base + 0–500 speed bonus + 150 streak bonus after three correct answers`.
- The correct option stays server-only while a round is active. It is not included in REST responses or `game:question`.
- A reconnect token lets a player rejoin the same room and retain their score.
- Host actions require a server-verified host token.

## Integration checkpoint

Run `npm test` from `apps/server`. The HTTP + Socket.IO integration test exercises the same JSON path that the React frontend will use and verifies that correct answers are not leaked before the round closes.
