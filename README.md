# LangPal Demo

LangPal Demo is a local integration of the LangPal Live frontend, the matchmaking backend, and the WebRTC signaling server. It lets authenticated users choose language preferences, enter a queue, match with a compatible partner, start a video call, chat over a WebRTC data channel, find the next partner, or stop matchmaking cleanly.

This repo is intentionally organized as three project folders because the pieces were originally built separately:

- `basic-ui`: React/Vite frontend
- `langpal-matchmaking-backend`: Express, Socket.IO, Supabase auth bridge, matchmaking, and optional embedded WebRTC signaling
- `signaling-server`: standalone WebRTC signaling server for local/demo use

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
  Express auth routes, Socket.IO matchmaking, Supabase migrations

signaling-server/
  Standalone WebRTC signaling server and small test client page
```

## Ports

- Frontend: `http://localhost:5173`
- Matchmaking backend: `http://localhost:3000`
- Standalone signaling server: `ws://localhost:8080`

The matchmaking backend also has a `/webrtc` WebSocket path for single-service deployment. Local development currently uses the standalone `signaling-server` through `VITE_SIGNALING_WS_URL`.

## Environment Setup

Create local `.env` files from the examples:

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

### `signaling-server/.env`

```env
PORT=8080
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

cd ../signaling-server
npm install
```

## Run Locally

Use three terminals.

### Terminal 1: Frontend

```bash
cd basic-ui
npm run dev
```

### Terminal 2: Matchmaking Backend

```bash
cd langpal-matchmaking-backend
npm start
```

### Terminal 3: Signaling Server

```bash
cd signaling-server
npm start
```

Then open `http://localhost:5173`.

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

cd ../signaling-server
node --check server/signaling.js
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
- `langpal-matchmaking-backend` -> Render/Railway
- `signaling-server` -> Render/Railway, unless using the backend's embedded `/webrtc` path

Frontend production env should point at deployed backend URLs:

```env
VITE_MATCHMAKING_URL=https://your-backend.example.com
VITE_API_URL=https://your-backend.example.com
VITE_SIGNALING_WS_URL=wss://your-signaling.example.com
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

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
- `signaling-server` and backend `/webrtc` overlap. Keep both only if the team wants separate local and deployment options.
