# LangPal Demo

This folder contains 3 separate repos that work together for the demo:

- `basic-ui`: React frontend on `http://localhost:5173`
- `langpal-matchmaking-backend`: Socket.IO matchmaking backend on `http://localhost:3000`
- `signaling-server`: WebRTC signaling server on `ws://localhost:8080`

The repos stay separate. The frontend sends users into matchmaking, the backend pairs them, and matched users join the same embedded WebRTC room.

## Repositories

- Frontend: https://github.com/Manaskumm/basic-ui
- Backend: https://github.com/kashish-1703/langpal-matchmaking-backend

These repos were originally authored separately. This demo setup keeps that structure intact and only adds minimal connection work between them.

## Ports

The demo uses these ports consistently:

- Frontend: `5173`
- Matchmaking backend: `3000`
- WebRTC signaling server: `8080`

## Environment Setup

Each repo requires a `.env` file. Copy the example and fill in the values:

```bash
cp basic-ui/.env.example basic-ui/.env
cp langpal-matchmaking-backend/.env.example langpal-matchmaking-backend/.env
cp signaling-server/.env.example signaling-server/.env
```

### `basic-ui/.env`

```env
VITE_MATCHMAKING_URL=http://localhost:3000
VITE_API_URL=http://localhost:3000
VITE_SIGNALING_WS_URL=ws://localhost:8080
```

### `langpal-matchmaking-backend/.env`

```env
PORT=3000
CORS_ORIGIN=http://localhost:5173

# Required for auth and Supabase-backed matchmaking
SUPABASE_URL=your_supabase_url_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
JWT_SECRET=your_long_random_jwt_secret_here
```

`CORS_ORIGIN` accepts a comma-separated list if you need to allow multiple origins (e.g. `http://localhost:5173,https://your-app.example.com`).

### `signaling-server/.env`

```env
PORT=8080
```

## Install

Run installs once in each repo:

```bash
cd basic-ui
npm install

cd ../langpal-matchmaking-backend
npm install

cd ../signaling-server
npm install
```

## Start The Demo

Use 3 terminals:

### Terminal 1: Frontend

```bash
cd basic-ui
npm run dev
```

### Terminal 2: Matchmaking backend

```bash
cd langpal-matchmaking-backend
npm start
```

The backend supports Supabase-backed auth and matchmaking:

- If `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `JWT_SECRET` are present, registration, login, and Supabase matchmaking work.
- If Supabase credentials are missing, the server can still start, but the register/login UI will not work.

### Supabase Backend Mode

The backend uses Supabase for:

- `users`
- `waiting_queue`
- `matches`

To run the register UI and database-backed matchmaking, add your Supabase credentials to `langpal-matchmaking-backend/.env` (see the Environment Setup section above).

When those env vars are present:

- users can register and log in
- the backend uses the original Supabase queries and updates
- queue entries are stored in `waiting_queue`
- match records are stored in `matches`
- the existing teammate-written matchmaking flow stays active

When those env vars are missing:

- the server still starts
- auth routes return a configuration error
- direct socket matchmaking can fall back to in-memory mode for local backend-only testing

That fallback is only for backend testing convenience. It is not enough for the current register-first UI.

### Terminal 3: Signaling Server

```bash
cd signaling-server
npm start
```

## Demo Flow

1. Open `http://localhost:5173` in 2 browser tabs.
2. Register or sign in as a different user in each tab.
3. Choose languages in both tabs.
4. Click `Start` in both tabs.
5. Watch the backend terminal for queue and match logs.
6. Confirm each frontend tab shows local video and then the partner video.
7. Confirm camera and microphone permissions are allowed.

This demo intentionally keeps the repos separate and avoids rewriting the original systems.

### Frontend (`basic-ui`)

Key demo changes:

- connected the existing `Start` button to the matchmaking backend using Socket.IO
- listens for `match_found`
- joins the matched WebRTC room inside the frontend
- shows register/login before matchmaking so Supabase user IDs are used in the queue

### Backend (`langpal-matchmaking-backend`)

Key demo changes:

- preserved the original Supabase flow when env credentials are available
- added a safe in-memory fallback when Supabase credentials are missing
- added clearer queue, match, next, and disconnect logs for testing visibility
- kept the same socket event names and overall behavior

### Signaling Server (`signaling-server`)

Key demo changes:

- runs the WebRTC signaling server used by the embedded frontend call
- relays WebRTC offer, answer, and ICE messages between peers in a room
- reads `PORT` from `signaling-server/.env`

## Demo Scope

This is a working demo integration, not a full product-level UI integration.

For the demo:

- the frontend and WebRTC signaling server are connected enough to test matchmaking and room handoff
- WebRTC is embedded in the React UI using the signaling server

Not fully integrated yet:

- polished call controls shared across matchmaking and video UI
- a production-ready end-to-end UX

## Debugging

### Frontend console

The frontend logs:

- when `Start` is clicked
- when `next_partner` is emitted
- when `match_found` is received
- when it joins a matched room

### Backend logs

The backend prints readable matchmaking logs, including:

- queue joins
- queue re-adds
- matches and room IDs
- next partner requests
- disconnects

Example log lines:

```text
[QUEUE] User abc joined. Queue length: 1
[QUEUE] User xyz joined. Queue length: 2
[MATCH] abc matched with xyz in room 1
[NEXT] User abc requested next partner
[DISCONNECT] User abc left
```

## Notes

- Matchmaking behavior was not rewritten; the setup was only cleaned up for easier local testing.
