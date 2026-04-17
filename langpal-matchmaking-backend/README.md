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

## Database Tables
1. waiting_queue
    - user_id
    - socket_id
    - created_at

2. matches
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
node testClient.js user1
node testClinet.js user 2

## Expected Example Flow
1. user1 joins the queue
2. user2 joins the queue
3. server matches them
4. both receive match_found event
5. match is stored in the database

Prevents duplicates in a queue, match ends on disconnect, and next_partner is determined through functionality.
