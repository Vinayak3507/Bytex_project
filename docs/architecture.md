# AptiQuiz architecture

```text
Vanilla JavaScript frontend
        │ JSON REST + Socket.IO events
        ▼
Node.js + Express + Socket.IO server
        │
        ▼
Supabase Postgres
```

Host pages use account-backed authentication and ownership checks. Participant pages continue to use the existing guest join and gameplay contract.

The Node server is the referee. It owns room state, round start/end timestamps, answer acceptance, score calculation, and league updates. A device clock never decides a result.

## Persistence

Apply migrations in order. `202610100001_aptiquiz.sql` creates question sets, questions, rooms, players, answers, and league points. `202610100002_host_auth.sql` adds host accounts, hashed bearer-session records, and owner relationships on question sets and rooms. `202610100003_custom_quiz_builder.sql` adds quiz metadata/lifecycle/configuration, question-level marks and explanations, room quiz snapshots, and the transactional RPC used to replace draft content. Row-level security is enabled and browser database access is revoked. Only the backend, using `SUPABASE_SERVICE_ROLE_KEY`, talks to the database.

For local integration without credentials, the server deliberately falls back to in-memory storage. That mode resets on restart and must not be used for the deployed demo.

## REST API

All REST bodies and responses are JSON. Host endpoints require `Authorization: Bearer <accessToken>`. The token is random and opaque, expires after eight hours, and can be revoked by logout. Only its SHA-256 hash is persisted. Passwords are scrypt-hashed with per-password salts; plaintext passwords and password hashes are never returned. Email is trimmed and lowercased. Registration and login are rate-limited per client IP. The frontend stores the token in tab-scoped `sessionStorage` and sends it only to the configured backend; use HTTPS in deployment.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Server and storage status |
| `POST` | `/api/auth/register` | Register host and issue session |
| `POST` | `/api/auth/login` | Verify credentials and issue session |
| `GET` | `/api/auth/me` | Return the current host identity |
| `POST` | `/api/auth/logout` | Revoke the current session |
| `GET` | `/api/host/dashboard` | List only the authenticated host's quizzes and rooms |
| `POST` | `/api/question-sets` | Create a quiz owned by the authenticated host |
| `GET` | `/api/question-sets` | List only the authenticated host's quizzes |
| `GET` | `/api/question-sets/:id` | Read owned editable quiz data, including its answer key |
| `PUT` | `/api/question-sets/:id` | Save/replace quiz draft fields and question order |
| `DELETE` | `/api/question-sets/:id` | Delete an unused draft |
| `GET` | `/api/question-sets/:id/preview` | Return participant-safe preview without answer keys or explanations |
| `POST` | `/api/question-sets/:id/publish` | Validate and publish a quiz |
| `POST` | `/api/question-sets/:id/questions` | Add a question |
| `PUT` | `/api/question-sets/:id/questions/:questionId` | Update a question |
| `DELETE` | `/api/question-sets/:id/questions/:questionId` | Remove a question from the draft |
| `PUT` | `/api/question-sets/:id/questions/reorder` | Set deterministic question ordering |
| `POST` | `/api/question-sets/:id/rooms` | Create a lobby from a published quiz and capture a snapshot |
| `GET` | `/api/rooms/:joinCode` | Read safe public room metadata |
| `GET` | `/api/leagues/:seasonName` | Read college standings |

Every quiz read/write and room creation checks `owner_id` against the authenticated host. A missing session returns 401; another host's resource returns 403. Draft saves can be incomplete; publish validates title, question text, 2–10 non-empty options, one selected correct option, bounded duration/marks, and deterministic ordering. Editing a published quiz moves it back to draft. Only published sets can be hosted. Legacy question sets created before host accounts have no account owner and require an explicit trusted migration/claim before they can be managed.

Question and option IDs use UUIDs. Quiz defaults are 20 seconds and 500 marks; each question can override either. Scoring uses configured correct marks as base, a proportional speed bonus, and a 30% streak bonus after three consecutive correct answers. Negative marking is not implemented. Participant preview omits correct-option IDs and explanations. The result event reveals them after the round closes.

Rooms store a materialized quiz snapshot when created. Game progression, answer checks, scoring, reconnect replay, and final results read that snapshot instead of the editable source quiz. In Supabase, old question rows referenced by answer records are detached rather than deleted when the draft is replaced; replacement is transactional through `replace_question_set_content`.

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
| Client → server | Socket handshake `auth.accessToken` | Optional opaque host session; server resolves host identity |
| Client → server | `host:observe` | `joinCode` |
| Client → server | `host:game:start` | `joinCode` |
| Client → server | `host:next-question` | `joinCode` |
| Client → server | `answer:submit` | `roundId`, `optionId` |
| Server → client | `room:lobby` | Safe room data and player list |
| Server → client | `game:question` | Question, shuffled options, server `startsAt`/`endsAt`; never a correct answer |
| Server → client | `game:answer-received` | Accepted answer acknowledgement only |
| Server → client | `game:round-result` | Correct option, optional explanation, and updated leaderboard, sent only after closure |
| Server → client | `game:leaderboard` | Ranking after each closed round |
| Server → client | `game:complete` | Results and college league standings |

## Fairness and security

- A room accepts at most 50 players.
- Each player receives one accepted answer per question; the database also enforces this uniqueness.
- The server stores answer receipt time and accepts a fixed 300 ms grace period after the official close time.
- The score is `configured marks + up to the same marks as a speed bonus + 30% marks streak bonus after three correct answers` (defaults reproduce the prior 500/500/150 values).
- The correct option stays server-only while a round is active. It is not included in REST responses or `game:question`.
- A reconnect token lets a player rejoin the same room and retain their score.
- Host socket identity comes from a verified, unexpired backend session, not event payloads. Every host room action verifies quiz and room ownership.
- An authenticated host socket cannot join as a player; in particular, a host cannot participate in their own room.
- Answer acceptance emits updated safe lobby progress to the host, with no option IDs or correctness before close.

## Integration checkpoint

Run `npm test` from `backend` and `npm test` from `frontend`. The frontend is served at `http://localhost:4173`; the backend defaults to `http://localhost:3001`. Register at `/host/register`, create a draft at `/host`, edit/preview at `/host/quiz/:id/edit` and `/host/quiz/:id/preview`, then publish and host it from the dashboard. Participants join at `/?join=<joinCode>`. The host starts/advances from `/host/room/:joinCode`; players join with `room:join` and answer through `answer:submit`. The browser timer only displays the server's `endsAt` timestamp. The server alone closes rounds, scores answers, and publishes the final result. The vanilla JavaScript frontend has no production build command.
