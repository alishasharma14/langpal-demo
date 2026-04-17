const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const CLIENT_DIR = path.join(__dirname, '..', 'client');

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
};

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname;
  const requestedFile = pathname === '/' ? 'index.html' : pathname;
  const filePath = path.join(CLIENT_DIR, requestedFile);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

// roomId -> Set of WebSocket clients
const rooms = new Map();

wss.on('connection', (ws) => {
  let currentRoom = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      console.warn('Invalid JSON received, ignoring.');
      return;
    }

    const { type, roomId } = msg;

    if (type === 'join') {
      currentRoom = roomId;
      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      const room = rooms.get(roomId);
      room.add(ws);
      console.log(`[${roomId}] peer joined (${room.size} in room)`);

      ws.send(JSON.stringify({ type: 'joined', roomId, peerCount: room.size }));

      if (room.size > 1) {
        room.forEach((peer) => {
          if (peer !== ws && peer.readyState === WebSocket.OPEN) {
            peer.send(JSON.stringify({ type: 'peer-ready', roomId }));
          }
        });
      }
      return;
    }

    // Relay offer, answer, ice-candidate to every other peer in the room
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    room.forEach((peer) => {
      if (peer !== ws && peer.readyState === WebSocket.OPEN) {
        peer.send(raw.toString());
      }
    });
  });

  ws.on('close', () => {
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.delete(ws);
        console.log(`[${currentRoom}] peer left (${room.size} remaining)`);
        room.forEach((peer) => {
          if (peer.readyState === WebSocket.OPEN) {
            peer.send(JSON.stringify({ type: 'peer-left', roomId: currentRoom }));
          }
        });
        if (room.size === 0) rooms.delete(currentRoom);
      }
    }
  });

  ws.on('error', (err) => console.error('WebSocket error:', err));
});

server.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
