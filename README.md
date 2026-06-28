# LangPal Demo

LangPal Demo is a local integration of the LangPal Live frontend and the matchmaking backend. It lets authenticated users choose language preferences, enter a queue, match with a compatible partner, start a video call, chat over a WebRTC data channel, find the next partner, or stop matchmaking cleanly.

This repo is organized as two project folders:

- `basic-ui`: React/Vite frontend
- `langpal-matchmaking-backend`: Express, Socket.IO, Supabase auth bridge, matchmaking, and embedded WebRTC signaling at `/webrtc`

## Current Flow

```text
Supabase Auth register/login/Google OAuth
-> POST /auth/langpal-login
-> backend JWT + app-level users row
-> Socket.IO matchmaking queue
-> compatible match by native/practice language
-> WebRTC signaling room
-> peer-to-peer video/audio + data-channel chat
```

The app-level public identity is `users.display_name`. The `first_name` and `last_name` columns still exist for legacy compatibility, but new UI identity should use `display_name`.

## Project Structure

```text
basic-ui/
  React frontend, auth screens, matchmaking UI, WebRTC client

langpal-matchmaking-backend/
  Express auth routes, Socket.IO matchmaking, Supabase migrations,
  and WebRTC signaling at the /webrtc WebSocket path
```

## Ports

- Frontend: `http://localhost:5173`
- Matchmaking backend + WebRTC signaling: `http://localhost:3000` (WebSocket at `ws://localhost:3000/webrtc`)

## Environment Setup

Create local `.env` files from the examples:

```bash
cp basic-ui/.env.example basic-ui/.env
cp langpal-matchmaking-backend/.env.example langpal-matchmaking-backend/.env
```

### `basic-ui/.env`

```env
VITE_MATCHMAKING_URL=http://localhost:3000
VITE_API_URL=http://localhost:3000
VITE_SIGNALING_WS_URL=ws://localhost:3000/webrtc

VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### `langpal-matchmaking-backend/.env`

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
JWT_SECRET=your_long_random_jwt_secret

PORT=3000
CORS_ORIGIN=http://localhost:5173
```

`SUPABASE_SERVICE_ROLE_KEY` is required on the backend because `/auth/langpal-login` verifies Supabase Auth tokens and creates/updates app-level rows. Never put the service role key in frontend env.

`CORS_ORIGIN` accepts a comma-separated list if needed:

```env
CORS_ORIGIN=http://localhost:5173,https://your-vercel-url.vercel.app
```

## Supabase Setup

The backend uses these Supabase tables:

- `users`
- `waiting_queue`
- `matches`

For a fresh Supabase project, run these in Supabase SQL Editor:

```text
langpal-matchmaking-backend/migrations/001_auth_users_schema.sql
langpal-matchmaking-backend/migrations/002_matchmaking_schema.sql
langpal-matchmaking-backend/migrations/003_language_matchmaking.sql
```

If the shared Supabase project already had older versions of these tables, also run:

```text
langpal-matchmaking-backend/migrations/004_supabase_schema_patches.sql
```

The patch migration is safe to rerun. It uses `add column if not exists`, backfills missing `display_name` values, and reloads the Supabase API schema cache.

## Install

Run installs once in each folder:

```bash
cd basic-ui
npm install

cd ../langpal-matchmaking-backend
npm install
```

## Run Locally

Use two terminals.

### Terminal 1: Frontend

```bash
cd basic-ui
npm run dev
```

### Terminal 2: Matchmaking Backend + WebRTC Signaling

```bash
cd langpal-matchmaking-backend
npm start
```

Then open `http://localhost:5173`. The backend serves both Socket.IO matchmaking and WebRTC signaling at `ws://localhost:3000/webrtc`.

## Auth Notes

The current frontend uses Supabase Auth directly for:

- email/password registration
- email/password login
- Google OAuth

After Supabase Auth succeeds, the frontend sends the Supabase session token to:

```text
POST /auth/langpal-login
```

The backend verifies that token with Supabase, finds or creates the app-level row in `users`, and returns the backend JWT used for app routes like display-name updates.

The backend still includes legacy routes:

```text
POST /auth/register
POST /auth/login
```

Those are kept for compatibility/manual testing. New frontend auth work should use Supabase Auth plus `/auth/langpal-login`.

## Matchmaking Notes

Matchmaking is language-aware:

- user A's `practice_language` must match user B's `native_language`
- user A's `native_language` must match user B's `practice_language`

There is no random fallback match. If no compatible partner exists, the user stays queued.

Queue entries store:

- `user_id`
- `socket_id`
- `display_name`
- `native_language`
- `practice_language`

Matches are stored in `matches` and marked `ended` when users stop, disconnect, or move to the next partner.

## Checks

Run these before pushing meaningful changes:

```bash
cd basic-ui
npm run lint
npm run build

cd ../langpal-matchmaking-backend
npm test
```

## Manual Test Checklist

Use this as the smoke test before demoing or shipping auth/matchmaking changes:

- Register with email/password and confirm a `users` row exists with `email`, `display_name`, `native_language`, and `practice_language`.
- Sign out and sign back in with email/password.
- Sign in with Google OAuth and confirm it lands on the main matching screen.
- Edit the top-right display name and confirm it updates in `users.display_name`.
- Queue one user and confirm the UI waits instead of erroring.
- Queue a second compatible user and confirm both users connect.
- Confirm local and remote video appear after camera/mic permission.
- Send a chat message during a connected call.
- Click `Next` and confirm the old match ends before requeueing.
- Click `Stop` while queued and while connected.
- Check Supabase: `waiting_queue` should clear after match/stop/disconnect, and `matches.status` should update when calls end.

## Deployment Notes

Typical deployment shape:

- `basic-ui` -> Vercel
- `langpal-matchmaking-backend` -> Render/Railway (serves both Socket.IO matchmaking and WebRTC signaling at `/webrtc`)

Frontend production env should point at the deployed backend:

```env
VITE_MATCHMAKING_URL=https://your-backend.example.com
VITE_API_URL=https://your-backend.example.com
VITE_SIGNALING_WS_URL=wss://your-backend.example.com/webrtc
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

`VITE_SIGNALING_WS_URL` can be omitted entirely in production if the frontend is served from the same host as the backend — the app automatically falls back to `wss://<host>/webrtc`.

Backend production env must include:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
JWT_SECRET=your_long_random_jwt_secret
CORS_ORIGIN=https://your-frontend.example.com
```

If deploying backend and signaling as one combined service, set `VITE_SIGNALING_WS_URL` to the backend WebSocket path, for example:

```env
VITE_SIGNALING_WS_URL=wss://your-backend.example.com/webrtc
```

## Keep In Mind

- Do not commit real `.env` files or Supabase secrets.
- The frontend must use the Supabase anon key only; the backend uses the service role key.
- Socket.IO matchmaking currently trusts the `userId` sent by the client. That is okay for the demo, but production should authenticate socket connections with the backend JWT.
- `first_name` and `last_name` are legacy fields. Public identity should be `display_name`.
- The in-memory matchmaking fallback is for backend-only testing when Supabase env vars are missing. It is not enough for the current register-first frontend.
- The standalone `signaling-server/` directory was removed. WebRTC signaling is now exclusively served by the backend at the `/webrtc` WebSocket path.
