This is a simple matchmaking built with Node.js, Express, Socket.IO, and Supabase as mentioned in the requirements.

## Features
- Users can enter a matchmaking queue
- The server pairs users with the next available partner
- Matches are stored in the database
- Users can request a new partner
- Disconnecting would automatically end the match

## Tech Stack
- Node.js
- Express
- Socket.IO
- Supabase

## Auth Routes

The current LangPal Live frontend uses Supabase Auth directly. After Supabase
email/password or Google OAuth succeeds, the frontend sends the Supabase session
token to:

```text
POST /auth/langpal-login
```

That route verifies the Supabase token, finds or creates the app-level row in
`users`, and returns the backend JWT used by matchmaking.

The older custom routes still exist:

```text
POST /auth/register
POST /auth/login
```

Treat those as legacy compatibility routes for older clients or manual backend
testing. Do not build new frontend login flows against them unless the team
decides to bring back custom backend auth.

## Database Tables
Run the SQL files in `migrations/` from Supabase SQL Editor when setting up a project.

If the tables already existed before the latest columns were added, run `migrations/004_supabase_schema_patches.sql`. It is safe to rerun and patches existing shared Supabase projects.

1. users
    - id
    - email
    - password_hash
    - display_name (public LangPal Live name)
    - first_name (legacy compatibility field)
    - last_name (legacy compatibility field)
    - native_language
    - practice_language
    - created_at

2. waiting_queue
    - user_id
    - socket_id
    - display_name
    - native_language
    - practice_language
    - created_at

3. matches
    - id
    - user1_id
    - user2_id
    - status
    - created_at

## How to Run

Install:
npm install

Start server:
node server.js

Run test clients (in two separate terminals):
node testClient.js user1 start English Spanish
node testClient.js user2 start Spanish English

## Manual Test Checklist
- Auth bridge: log in through the frontend with email/password and Google OAuth; confirm `/auth/langpal-login` returns a JWT.
- User row: confirm each authenticated account has a row in `users` with `email`, `display_name`, `native_language`, and `practice_language`.
- Queue: start one user and confirm a `waiting_queue` row is created with `display_name`, `native_language`, and `practice_language`.
- Match: start a compatible second user and confirm both queue rows are removed and a `matches` row is created.
- Next: click `Next` during a call and confirm the old match is ended before the user re-enters the queue.
- Stop: click `Stop` while queued and while connected; confirm the user leaves `waiting_queue` and any active match is ended.
- Disconnect: close one tab during a call and confirm the partner receives the ended-call state.

## Expected Example Flow
1. user1 joins the queue
2. user2 joins the queue
3. server matches them
4. both receive match_found event
5. match is stored in the database

Prevents duplicates in a queue, match ends on disconnect, and next_partner is determined through functionality.
