import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import './styles.css';
import { SignalingClient } from './signalingClient.js';
import { WebRTCClient } from './webrtc.js';

const LANGUAGES = [
  'Arabic', 'English', 'French', 'German', 'Hindi',
  'Italian', 'Japanese', 'Korean', 'Mandarin', 'Portuguese', 'Spanish'
];

const MATCHMAKING_URL = 'http://localhost:3000';
const SIGNALING_WS_URL = 'ws://localhost:8080';

function getOrCreateUserId() {
  const storedUserId = window.sessionStorage.getItem('langpalUserId');
  if (storedUserId) return storedUserId;

  const generatedUserId =
    window.crypto?.randomUUID?.() ?? `user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.sessionStorage.setItem('langpalUserId', generatedUserId);
  return generatedUserId;
}

function getBootstrapState() {
  const params = new URLSearchParams(window.location.search);
  return {
    nativeLanguage: params.get('native') ?? '',
    practiceLanguage: params.get('practice') ?? '',
    requeue: params.get('requeue') === '1',
  };
}

function App() {
  const bootstrapState = useRef(getBootstrapState());
  const [nativeLanguage, setNativeLanguage] = useState(bootstrapState.current.nativeLanguage);
  const [practiceLanguage, setPracticeLanguage] = useState(bootstrapState.current.practiceLanguage);
  const [isChatActive, setIsChatActive] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [statusMessage, setStatusMessage] = useState('Select languages and click Start to connect.');
  // 'idle' | 'queued' | 'connecting' | 'connected' | 'partner-left'
  const [callStatus, setCallStatus] = useState('idle');

  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const userIdRef = useRef(getOrCreateUserId());
  const languagesRef = useRef({
    nativeLanguage: bootstrapState.current.nativeLanguage,
    practiceLanguage: bootstrapState.current.practiceLanguage,
  });

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const signalingRef = useRef(null);
  const webrtcClientRef = useRef(null);
  const hasPlacedCallRef = useRef(false);
  const peerReadyPendingRef = useRef(false);

  const isStartDisabled = !nativeLanguage || !practiceLanguage;

  useEffect(() => {
    languagesRef.current = { nativeLanguage, practiceLanguage };
  }, [nativeLanguage, practiceLanguage]);

  const leaveCall = () => {
    webrtcClientRef.current?.hangup();
    signalingRef.current?.disconnect();
    webrtcClientRef.current = null;
    signalingRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    hasPlacedCallRef.current = false;
    peerReadyPendingRef.current = false;
    setCallStatus('idle');
  };

  const placeCall = async () => {
    const webrtc = webrtcClientRef.current;
    if (!webrtc || hasPlacedCallRef.current || !webrtc.localStream) {
      peerReadyPendingRef.current = true;
      return;
    }
    hasPlacedCallRef.current = true;
    peerReadyPendingRef.current = false;
    setStatusMessage('Connecting to partner...');
    await webrtc.call();
  };

  const joinRoom = async (roomId) => {
    const signaling = new SignalingClient(SIGNALING_WS_URL);
    const webrtc = new WebRTCClient(signaling);
    signalingRef.current = signaling;
    webrtcClientRef.current = webrtc;
    hasPlacedCallRef.current = false;
    peerReadyPendingRef.current = false;

    webrtc.onRemoteStream = (stream) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
      setCallStatus('connected');
      setStatusMessage('Connected — P2P stream active');
    };

    signaling.on('joined', ({ peerCount }) => {
      setStatusMessage(
        peerCount > 1
          ? 'Partner present, connecting...'
          : 'Waiting for partner to join...'
      );
    });

    signaling.on('peer-ready', async () => {
      try {
        await placeCall();
      } catch (err) {
        console.error('Failed to place call:', err);
        setStatusMessage('Could not connect call.');
      }
    });

    signaling.on('peer-left', () => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      hasPlacedCallRef.current = false;
      peerReadyPendingRef.current = false;
      setCallStatus('partner-left');
      setStatusMessage('Partner left the room.');
    });

    signaling.on('disconnect', () => {
      setStatusMessage('Signaling disconnected.');
      setCallStatus('idle');
    });

    try {
      await signaling.connect(roomId);
    } catch {
      setStatusMessage('Failed to connect to signaling server.');
      return;
    }

    try {
      const stream = await webrtc.startLocalStream();
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setCallStatus('connecting');
      if (peerReadyPendingRef.current) {
        await placeCall();
      }
    } catch (err) {
      console.error('Failed to get media devices:', err);
      setStatusMessage('Camera/mic access failed.');
    }
  };

  const handleStartChat = () => {
    if (isStartDisabled || !socketRef.current) return;

    console.log('[FRONTEND] Start clicked', {
      userId: userIdRef.current,
      nativeLanguage,
      practiceLanguage,
    });
    setIsChatActive(true);
    setStatusMessage('Joining matchmaking queue...');
    setMessages([]);

    socketRef.current.emit('start_matchmaking', {
      userId: userIdRef.current,
      nativeLanguage,
      practiceLanguage,
    });
  };

  const handleNext = () => {
    if (!socketRef.current) return;
    leaveCall();

    console.log('[FRONTEND] Emitting next_partner', {
      userId: userIdRef.current,
      nativeLanguage,
      practiceLanguage,
    });
    setIsChatActive(true);
    setStatusMessage('Looking for a new partner...');
    setMessages([]);

    socketRef.current.emit('next_partner', {
      userId: userIdRef.current,
      nativeLanguage,
      practiceLanguage,
    });
  };

  const handleSendMessage = () => {
    if (!inputText.trim() || !isChatActive) return;
    const newUserMessage = { role: 'you', text: inputText.trim() };
    setMessages((prev) => [...prev, newUserMessage]);
    setInputText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  };

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    const socket = io(MATCHMAKING_URL, {
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setStatusMessage('Connected to matchmaking.');

      if (
        languagesRef.current.nativeLanguage &&
        languagesRef.current.practiceLanguage &&
        bootstrapState.current.requeue
      ) {
        setIsChatActive(true);
        setStatusMessage('Rejoining matchmaking queue...');
        console.log('[FRONTEND] Rejoining matchmaking queue', {
          userId: userIdRef.current,
        });
        socket.emit('start_matchmaking', {
          userId: userIdRef.current,
          nativeLanguage: languagesRef.current.nativeLanguage,
          practiceLanguage: languagesRef.current.practiceLanguage,
        });

        const url = new URL(window.location.href);
        url.searchParams.delete('requeue');
        window.history.replaceState({}, '', url);
        bootstrapState.current.requeue = false;
      }
    });

    socket.on('queued', ({ message }) => {
      setIsChatActive(true);
      setCallStatus('queued');
      setStatusMessage(message || 'Waiting for a partner...');
    });

    socket.on('info', ({ message }) => {
      setStatusMessage(message || 'Matchmaking update received.');
    });

    socket.on('match_found', ({ matchId }) => {
      const roomId = String(matchId);
      console.log('[FRONTEND] match_found received', { userId: userIdRef.current, roomId });
      joinRoom(roomId);
    });

    socket.on('disconnect', () => {
      setStatusMessage('Disconnected from matchmaking.');
      setIsChatActive(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      leaveCall();
    };
  }, []);

  const showLocalVideo = callStatus === 'connecting' || callStatus === 'connected' || callStatus === 'partner-left';
  const showRemoteVideo = callStatus === 'connected';

  return (
    <div className="app-container">
      <div className="left-panel">
        <div className="top-bar">
          <div className="language-selector">
            <label htmlFor="native-select">Your Native Language</label>
            <select
              id="native-select"
              value={nativeLanguage}
              onChange={(e) => setNativeLanguage(e.target.value)}
            >
              <option value="" disabled>-- Choose --</option>
              {LANGUAGES.map(lang => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>

          <div className="language-selector">
            <label htmlFor="practice-select">Language to Practice</label>
            <select
              id="practice-select"
              value={practiceLanguage}
              onChange={(e) => setPracticeLanguage(e.target.value)}
            >
              <option value="" disabled>-- Choose --</option>
              {LANGUAGES.map(lang => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>

          <div className="action-buttons">
            <button
              className="start-chat-btn"
              disabled={isStartDisabled || isChatActive}
              onClick={handleStartChat}
            >
              Start
            </button>
            <button
              className="next-btn"
              onClick={handleNext}
              disabled={!isChatActive}
            >
              Next
            </button>
          </div>
        </div>

        <div className="video-grid">
          <div className={`video-card stranger-video${showRemoteVideo ? ' video-active' : ''}`}>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={{ display: showRemoteVideo ? 'block' : 'none' }}
            />
            {!showRemoteVideo && (
              <span>{isChatActive ? statusMessage : 'Waiting for connection...'}</span>
            )}
          </div>
          <div className={`video-card you-video${showLocalVideo ? ' video-active' : ''}`}>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              style={{ display: showLocalVideo ? 'block' : 'none' }}
            />
            {!showLocalVideo && <span>You</span>}
          </div>
        </div>
      </div>

      <div className="right-panel chat-panel">
        <div className="chat-header">
          <span>Chat</span>
        </div>
        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="empty-chat-placeholder">{statusMessage}</div>
          )}
          {messages.map((msg, index) => (
            <div key={index} className={`message ${msg.role}`}>
              {msg.role === 'stranger' && <span className="sender-name">Stranger: </span>}
              {msg.role === 'you' && <span className="sender-name">You: </span>}
              {msg.text}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="chat-input-area">
          <input
            type="text"
            placeholder="Type a message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isChatActive}
          />
          <button
            className="send-btn"
            onClick={handleSendMessage}
            disabled={!isChatActive}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
