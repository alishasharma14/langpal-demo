# LangPal WebRTC

Peer-to-peer video calling using WebRTC. A lightweight Node.js signaling server handles connection setup; after that, video streams directly between peers.

## Prerequisites

- Node.js 18+
- [ngrok](https://ngrok.com/download) (for testing across devices)

## Setup

```bash
git clone https://github.com/PaytonAnderson/langpal-webrtc.git
cd langpal-webrtc
npm install
```

## Running locally (same machine, two tabs)

```bash
npm start
```

Open `http://localhost:8080` in two tabs. Enter the same room ID in both, click **Join**, then **Call** from one tab.

## Testing across devices (phone + laptop, or two different machines)

You'll need ngrok because:
- Devices can't reach each other's `localhost`
- `getUserMedia` (camera/mic access) requires HTTPS on non-localhost origins

**1. Sign up for a free ngrok account and add your auth token:**

```bash
ngrok config add-authtoken YOUR_TOKEN_HERE
```

**2. Start the server and tunnel it:**

```bash
# terminal 1
npm start

# terminal 2
ngrok http 8080
```

ngrok will print a URL like `https://abc123.ngrok-free.app`.

**3. Open that URL on both devices, join the same room ID, and call.**

No URL configuration needed — the client automatically connects back to whatever host served it.

## Project structure

```
├── server/
│   └── signaling.js        # WebSocket signaling server + static file serving
├── client/
│   ├── index.html          # Two-video UI
│   ├── webrtc.js           # RTCPeerConnection lifecycle
│   └── signaling-client.js # WebSocket client wrapper
└── package.json
```

## How it works

WebRTC needs a **signaling server** to exchange connection metadata before the direct peer-to-peer stream is established:

```
Peer A ──── SDP offer/answer + ICE candidates ──── Signaling Server ──── Peer B
Peer A ◄──────────────────── Direct P2P Video ───────────────────────► Peer B
```

The signaling server (`server/signaling.js`) routes messages between peers in the same room. Once both peers have exchanged offers, answers, and ICE candidates, the video stream goes directly between them — the server is no longer in the loop.

STUN (`stun.l.google.com`) is used for NAT traversal. If you hit connectivity issues with users on stricter networks, a TURN server will be needed (see `webrtc.js` for where to add it).
