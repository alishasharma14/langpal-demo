const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
};

export class WebRTCClient {
  constructor(signalingClient) {
    this.signaling = signalingClient;
    this.pc = null;
    this.localStream = null;
    this.onRemoteStream = null;

    this.signaling.on('offer', (msg) => this._handleOffer(msg));
    this.signaling.on('answer', (msg) => this._handleAnswer(msg));
    this.signaling.on('ice-candidate', (msg) => this._handleIceCandidate(msg));
  }

  async startLocalStream() {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    return this.localStream;
  }

  async call() {
    this._createPeerConnection();

    this.localStream.getTracks().forEach((track) =>
      this.pc.addTrack(track, this.localStream)
    );

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.signaling.send({ type: 'offer', sdp: offer });
  }

  async _handleOffer({ sdp }) {
    this._createPeerConnection();

    this.localStream.getTracks().forEach((track) =>
      this.pc.addTrack(track, this.localStream)
    );

    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    await this._flushIceQueue();

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.signaling.send({ type: 'answer', sdp: answer });
  }

  async _handleAnswer({ sdp }) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    await this._flushIceQueue();
  }

  async _handleIceCandidate({ candidate }) {
    if (!candidate) return;
    if (this.pc.remoteDescription) {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      this._iceQueue = this._iceQueue || [];
      this._iceQueue.push(candidate);
    }
  }

  async _flushIceQueue() {
    for (const candidate of this._iceQueue || []) {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
    this._iceQueue = [];
  }

  _createPeerConnection() {
    if (this.pc) this.pc.close();
    this._iceQueue = [];

    this.pc = new RTCPeerConnection(ICE_CONFIG);

    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.signaling.send({ type: 'ice-candidate', candidate });
      }
    };

    this.pc.ontrack = ({ streams }) => {
      if (this.onRemoteStream) this.onRemoteStream(streams[0]);
    };
  }

  hangup() {
    this.pc?.close();
    this.pc = null;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
  }
}
