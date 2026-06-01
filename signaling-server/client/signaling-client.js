export class SignalingClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
    this.ws = null;
    this.roomId = null;
    this.handlers = {};
  }

  connect(roomId) {
    return new Promise((resolve, reject) => {
      this.roomId = roomId;
      this.ws = new WebSocket(this.serverUrl);

      this.ws.addEventListener('open', () => {
        this.send({ type: 'join', roomId });
        resolve();
      });

      this.ws.addEventListener('message', ({ data }) => {
        let msg;
        try {
          msg = JSON.parse(data);
        } catch {
          return;
        }
        const handler = this.handlers[msg.type];
        if (handler) handler(msg);
      });

      this.ws.addEventListener('close', () => {
        const handler = this.handlers['disconnect'];
        if (handler) handler();
      });

      this.ws.addEventListener('error', (err) => {
        console.error('Signaling WS error:', err);
        reject(err);
      });
    });
  }

  on(type, handler) {
    this.handlers[type] = handler;
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...msg, roomId: this.roomId }));
    }
  }

  disconnect() {
    this.ws?.close();
  }
}
