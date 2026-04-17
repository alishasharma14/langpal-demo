# LangPal Demo

This folder contains 3 separate repos that work together for the demo:

- `basic-ui`: React frontend on `http://localhost:5173`
- `langpal-matchmaking-backend`: Socket.IO matchmaking backend on `http://localhost:3000`
- `langpal-webrtc`: WebRTC video UI and signaling server on `http://localhost:8080`

The repos stay separate. The frontend sends users into matchmaking, the backend pairs them, and matched users are opened in a new WebRTC tab with the same room ID.

## Repositories

- Frontend: https://github.com/Manaskumm/basic-ui
- Backend: https://github.com/kashish-1703/langpal-matchmaking-backend
- WebRTC: https://github.com/PaytonAnderson/langpal-webrtc

These repos were originally authored separately. This demo setup keeps that structure intact and only adds minimal connection work between them.

## Ports

The demo uses these ports consistently:

- Frontend: `5173`
- Matchmaking backend: `3000`
- WebRTC app: `8080`

## Install

Run installs once in each repo:

```bash
cd basic-ui
npm install

cd ../langpal-matchmaking-backend
npm install

cd ../langpal-webrtc
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

The backend supports two modes:

- If `SUPABASE_URL` and `SUPABASE_KEY` are present, it uses the original Supabase flow.
- If credentials are missing, it falls back to in-memory matchmaking so the demo still runs locally.

### Supabase Backend Mode

The original backend was built to use Supabase for:

- `waiting_queue`
- `matches`

If you want to run the original database-backed version, create a `.env` file inside `langpal-matchmaking-backend` with:

```bash
SUPABASE_URL=your_supabase_url_here
SUPABASE_KEY=your_supabase_key_here
PORT=3000
```

When those env vars are present:

- the backend uses the original Supabase queries and updates
- queue entries are stored in `waiting_queue`
- match records are stored in `matches`
- the existing teammate-written matchmaking flow stays active

When those env vars are missing:

- the server still starts
- Supabase calls are skipped safely
- matchmaking uses an in-memory fallback for local demo/testing only

That fallback is only for demo convenience. It is not meant to replace the original backend design.

### Terminal 3: WebRTC

```bash
cd langpal-webrtc
npm start
```

## Demo Flow

1. Open `http://localhost:5173` in 2 browser tabs.
2. Choose languages in both tabs.
3. Click `Start` in both tabs.
4. Watch the backend terminal for queue and match logs.
5. Each frontend tab opens the WebRTC app in a new tab.
6. Confirm both WebRTC tabs show the same room ID.
7. Confirm camera and microphone permissions are allowed.

This demo intentionally keeps the repos separate and avoids rewriting the original systems.

### Frontend (`basic-ui`)

Key demo changes:

- connected the existing `Start` button to the matchmaking backend using Socket.IO
- listens for `match_found`
- opens the WebRTC app in a new tab with the matched `roomId`
- adds console logs to make the test flow easier to follow

### Backend (`langpal-matchmaking-backend`)

Key demo changes:

- preserved the original Supabase flow when env credentials are available
- added a safe in-memory fallback when Supabase credentials are missing
- added clearer queue, match, next, and disconnect logs for testing visibility
- kept the same socket event names and overall behavior

### WebRTC (`langpal-webrtc`)

Key demo changes:

- reads the `roomId` from the URL automatically
- joins the room on page load
- simplifies the UI for demo use
- shows the current room ID and connection state on screen

## Demo Scope

This is a working demo integration, not a full product-level UI integration.

For the demo:

- the frontend and WebRTC app are connected enough to test matchmaking and room handoff
- WebRTC opens in a separate tab instead of being fully embedded into the React UI
- the WebRTC page is simplified to reduce confusion while testing

Not fully integrated yet:

- a single unified in-app calling experience inside `basic-ui`
- polished call controls shared across matchmaking and video UI
- a production-ready end-to-end UX

## Debugging

### Frontend console

The frontend prints a test checklist on load and logs:

- when `Start` is clicked
- when `next_partner` is emitted
- when `match_found` is received
- when the WebRTC redirect happens

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

- The frontend opens WebRTC in a new tab for easier side-by-side testing.
- The WebRTC UI has been simplified for the demo and shows the current room ID and connection state.
- Matchmaking behavior was not rewritten; the setup was only cleaned up for easier local testing.
