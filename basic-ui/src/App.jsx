
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import './styles.css';
import { SignalingClient } from './signalingClient.js';
import { WebRTCClient } from './webrtc.js';
import AuthPage from './AuthPage.jsx';
import { supabase } from './supabaseClient.js';

const LANGUAGES = [
  'Arabic', 'English', 'French', 'German', 'Hindi',
  'Italian', 'Japanese', 'Korean', 'Mandarin', 'Portuguese', 'Spanish'
];

const getMatchmakingUrl = () => {
  const envUrl = import.meta.env.VITE_MATCHMAKING_URL;
  const isLocalOrigin = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (envUrl && (isLocalOrigin || (!envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')))) {
    return envUrl;
  }
  // Fallback to same host (useful if backend serves the frontend in production)
  return window.location.origin;
};

const getSignalingUrl = () => {
  const envUrl = import.meta.env.VITE_SIGNALING_WS_URL;
  const isLocalOrigin = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (envUrl && (isLocalOrigin || (!envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')))) {
    return envUrl;
  }
  // Fallback to same host with WebSocket protocol
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/webrtc`;
};

const MATCHMAKING_URL = getMatchmakingUrl();
const SIGNALING_WS_URL = getSignalingUrl();
const AUTH_TOKEN_KEY = 'langpalAuthToken';
const AUTH_USER_KEY = 'langpalAuthUser';

function getBootstrapState() {
  const params = new URLSearchParams(window.location.search);
  return {
    nativeLanguage: params.get('native') ?? '',
    practiceLanguage: params.get('practice') ?? '',
    requeue: params.get('requeue') === '1',
  };
}

function MainApp({ user, onLogout }) {
  const bootstrapState = useMemo(() => getBootstrapState(), []);
  const [nativeLanguage, setNativeLanguage] = useState(
    bootstrapState.nativeLanguage || user?.native_language || ''
  );
  const [practiceLanguage, setPracticeLanguage] = useState(
    bootstrapState.practiceLanguage || user?.practice_language || ''
  );
  const [isChatActive, setIsChatActive] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [statusMessage, setStatusMessage] = useState('Select languages and click Start to connect.');
  // 'idle' | 'queued' | 'connecting' | 'connected' | 'partner-left'
  const [callStatus, setCallStatus] = useState('idle');
  const [queueCount, setQueueCount] = useState(0);
  const [partnerName, setPartnerName] = useState('Partner');
  const [callDuration, setCallDuration] = useState(0);

  const callStartTimeRef = useRef(null);
  const partnerNameRef = useRef('Partner');

  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const userIdRef = useRef(user?.id);
  const languagesRef = useRef({
    nativeLanguage: bootstrapState.nativeLanguage,
    practiceLanguage: bootstrapState.practiceLanguage,
  });
  const shouldRequeueRef = useRef(bootstrapState.requeue);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const signalingRef = useRef(null);
  const webrtcClientRef = useRef(null);
  const hasPlacedCallRef = useRef(false);
  const peerReadyPendingRef = useRef(false);

  const isStartDisabled = !nativeLanguage || !practiceLanguage || !user?.id;
  const canChat = callStatus === 'connected';

  const formatDuration = (totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

  useEffect(() => {
    languagesRef.current = { nativeLanguage, practiceLanguage };
  }, [nativeLanguage, practiceLanguage]);

  useEffect(() => {
    partnerNameRef.current = partnerName;
  }, [partnerName]);

  const leaveCall = useCallback(() => {
    webrtcClientRef.current?.hangup();
    signalingRef.current?.disconnect();
    webrtcClientRef.current = null;
    signalingRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    hasPlacedCallRef.current = false;
    peerReadyPendingRef.current = false;
    setCallStatus('idle');
  }, []);

  const stopCall = useCallback(() => {
    leaveCall();
    setIsChatActive(false);
    setMessages([]);
    setInputText('');
    setPartnerName('Partner');
    setCallDuration(0);
    callStartTimeRef.current = null;
    setStatusMessage('Select languages and click Start to connect.');
  }, [leaveCall]);

  const markPartnerLeft = useCallback((name = 'Partner') => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    hasPlacedCallRef.current = false;
    peerReadyPendingRef.current = false;
    setPartnerName(name || 'Partner');
    setCallDuration(
      callStartTimeRef.current
        ? Math.round((Date.now() - callStartTimeRef.current) / 1000)
        : 0
    );
    setCallStatus('partner-left');
    setStatusMessage(`${name || 'Partner'} left the room.`);
  }, []);

  const placeCall = useCallback(async () => {
    const webrtc = webrtcClientRef.current;
    if (!webrtc || hasPlacedCallRef.current || !webrtc.localStream) {
      peerReadyPendingRef.current = true;
      return;
    }
    hasPlacedCallRef.current = true;
    peerReadyPendingRef.current = false;
    setStatusMessage('Connecting to partner...');
    await webrtc.call();
  }, []);

  const joinRoom = useCallback(async (roomId) => {
    const signaling = new SignalingClient(SIGNALING_WS_URL);
    const webrtc = new WebRTCClient(signaling);
    signalingRef.current = signaling;
    webrtcClientRef.current = webrtc;
    hasPlacedCallRef.current = false;
    peerReadyPendingRef.current = false;

    webrtc.onMessage = (text) => {
      setMessages((prev) => [...prev, { role: 'stranger', text }]);
    };

    webrtc.onRemoteStream = (stream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
        remoteVideoRef.current.play().catch((err) => {
          console.warn('[FRONTEND] Remote video play failed on stream set:', err);
        });
      }
      setCallStatus('connected');
      callStartTimeRef.current = Date.now();
      setStatusMessage('Connected - P2P stream active');
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
      markPartnerLeft(partnerNameRef.current);
    });

    signaling.on('disconnect', () => {
      setStatusMessage('Signaling disconnected.');
      setCallStatus((currentStatus) =>
        currentStatus === 'partner-left' ? currentStatus : 'idle'
      );
    });

    try {
      await signaling.connect(roomId);
    } catch {
      setStatusMessage('Failed to connect to signaling server.');
      return;
    }

    try {
      const stream = await webrtc.startLocalStream();
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch((err) => {
          console.warn('[FRONTEND] Local video play failed on stream set:', err);
        });
      }
      setCallStatus((prev) => (prev === 'connected' ? 'connected' : 'connecting'));
      if (peerReadyPendingRef.current) {
        await placeCall();
      }
    } catch (err) {
      console.error('Failed to get media devices:', err);
      setStatusMessage('Camera/mic access failed.');
    }
  }, [markPartnerLeft, placeCall]);

  const handleStartChat = () => {
    if (isStartDisabled || !socketRef.current || !userIdRef.current) return;

    console.log('[FRONTEND] Start clicked', {
      userId: userIdRef.current,
      nativeLanguage,
      practiceLanguage,
    });
    setIsChatActive(true);
    setStatusMessage('Joining matchmaking queue...');
    setMessages([]);
    setPartnerName('Partner');
    setCallDuration(0);
    callStartTimeRef.current = null;

    socketRef.current.emit('start_matchmaking', {
      userId: userIdRef.current,
      displayName: user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user?.email,
      nativeLanguage,
      practiceLanguage,
    });
  };

  const handleNext = () => {
    if (!socketRef.current || !userIdRef.current) return;
    leaveCall();

    console.log('[FRONTEND] Emitting next_partner', {
      userId: userIdRef.current,
      nativeLanguage,
      practiceLanguage,
    });
    setIsChatActive(true);
    setStatusMessage('Looking for a new partner...');
    setMessages([]);
    setPartnerName('Partner');
    setCallDuration(0);
    callStartTimeRef.current = null;

    socketRef.current.emit('next_partner', {
      userId: userIdRef.current,
      displayName: user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user?.email,
      nativeLanguage,
      practiceLanguage,
    });
  };

  const handleSendMessage = () => {
    const messageText = inputText.trim();
    if (!messageText || !canChat || !webrtcClientRef.current) return;

    const sent = webrtcClientRef.current.sendMessage(messageText);
    if (sent === false) {
      setStatusMessage('Chat channel is still connecting.');
      return;
    }

    const newUserMessage = { role: 'you', text: messageText };
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
    const socket = io(MATCHMAKING_URL);

    socketRef.current = socket;

    socket.on('connect', () => {
      setStatusMessage('Connected to matchmaking.');

      if (
        languagesRef.current.nativeLanguage &&
        languagesRef.current.practiceLanguage &&
        userIdRef.current &&
        shouldRequeueRef.current
      ) {
        setIsChatActive(true);
        setStatusMessage('Rejoining matchmaking queue...');
        console.log('[FRONTEND] Rejoining matchmaking queue', {
          userId: userIdRef.current,
        });
        socket.emit('start_matchmaking', {
          userId: userIdRef.current,
          displayName: user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user?.email,
          nativeLanguage: languagesRef.current.nativeLanguage,
          practiceLanguage: languagesRef.current.practiceLanguage,
        });

        const url = new URL(window.location.href);
        url.searchParams.delete('requeue');
        window.history.replaceState({}, '', url);
        shouldRequeueRef.current = false;
      }
    });

    socket.on('queued', ({ message, count }) => {
      setIsChatActive(true);
      setCallStatus('queued');
      setQueueCount(count || 0);
      setStatusMessage(message || 'Waiting for a partner...');
    });

    socket.on('queue_update', ({ count }) => {
      setQueueCount(count || 0);
    });

    socket.on('partner_disconnected', ({ partnerName }) => {
      markPartnerLeft(partnerName || 'Partner');
    });

    socket.on('info', ({ message }) => {
      setStatusMessage(message || 'Matchmaking update received.');
    });

    socket.on('match_found', ({ matchId, partnerName: incomingPartnerName }) => {
      const roomId = String(matchId);
      console.log('[FRONTEND] match_found received', { userId: userIdRef.current, roomId, partnerName: incomingPartnerName });
      if (incomingPartnerName) {
        setPartnerName(incomingPartnerName);
      }
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
  }, [joinRoom, leaveCall, markPartnerLeft, user?.email, user?.first_name, user?.last_name]);

  const showLocalVideo = callStatus === 'connecting' || callStatus === 'connected' || callStatus === 'partner-left';
  const showRemoteVideo = callStatus === 'connected';

  // Autoplay remote video when it becomes visible
  useEffect(() => {
    if (showRemoteVideo && remoteVideoRef.current && remoteVideoRef.current.srcObject) {
      console.log('[FRONTEND] showRemoteVideo is active, calling play()');
      remoteVideoRef.current.play().catch((err) => {
        console.warn('[FRONTEND] Remote video play failed in useEffect:', err);
      });
    }
  }, [showRemoteVideo]);

  // Autoplay local video when it becomes visible
  useEffect(() => {
    if (showLocalVideo && localVideoRef.current && localVideoRef.current.srcObject) {
      console.log('[FRONTEND] showLocalVideo is active, calling play()');
      localVideoRef.current.play().catch((err) => {
        console.warn('[FRONTEND] Local video play failed in useEffect:', err);
      });
    }
  }, [showLocalVideo]);

  return (
    <div className="app-container">
      <div className="left-panel">
        <div className="top-bar">
          <div className="top-bar-header">
            <h2 className="app-title">LangPal Live</h2>
            <div className="auth-status">
              <span>{user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user?.email}</span>
              <button type="button" onClick={onLogout}>Log out</button>
            </div>
          </div>
          <div className="top-bar-controls">
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
        </div>

        <div className="video-grid">
          <div className={`video-card stranger-video${showRemoteVideo ? ' video-active' : ''}`}>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={{ display: showRemoteVideo ? 'block' : 'none' }}
            />
            {!showRemoteVideo && callStatus === 'queued' ? (
              <div className="queue-counter">
                {queueCount === 0
                  ? `You're the first one waiting to practice ${practiceLanguage} — hang tight`
                  : `${queueCount} others waiting to practice ${practiceLanguage}`}
              </div>
            ) : !showRemoteVideo && callStatus === 'partner-left' ? (
              <div className="post-call-card">
                <h3>{partnerName} left</h3>
                <p>Call duration: {formatDuration(callDuration)}</p>
                <button className="next-match-btn" onClick={handleNext}>Find New Match</button>
                <button className="stop-btn" onClick={stopCall}>Stop</button>
              </div>
            ) : !showRemoteVideo ? (
              <span>{isChatActive ? statusMessage : 'Waiting for connection...'}</span>
            ) : null}
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
              {msg.role === 'stranger' && <span className="sender-name">{partnerName || 'Stranger'}: </span>}
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
            disabled={!canChat}
          />
          <button
            className="send-btn"
            onClick={handleSendMessage}
            disabled={!canChat}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function getStoredAuth() {
  const params = new URLSearchParams(window.location.search);
  const urlUserId = params.get('userId');
  const urlEmail = params.get('email');

  // 1. If coming from the main landing page via URL parameters
  if (urlUserId) {
    const user = { id: urlUserId, email: urlEmail || `User ${urlUserId}` };
    window.sessionStorage.setItem(AUTH_TOKEN_KEY, 'linked-token');
    window.sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    return { token: 'linked-token', user };
  }

  // 2. Check local storage
  const token = window.sessionStorage.getItem(AUTH_TOKEN_KEY);
  const storedUser = window.sessionStorage.getItem(AUTH_USER_KEY);

  if (token && storedUser) {
    try {
      const user = JSON.parse(storedUser);
      if (user?.id) return { token, user };
    } catch {
      window.sessionStorage.removeItem(AUTH_USER_KEY);
    }
  }

  return { token: '', user: null };
}

function App() {
  const [auth, setAuth] = useState(() => getStoredAuth());

  const handleAuthenticated = ({ token, user }) => {
    window.sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    window.sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    setAuth({ token, user });
  };

  const handleLogout = async () => {
    window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
    window.sessionStorage.removeItem(AUTH_USER_KEY);
    await supabase?.auth.signOut();
    setAuth({ token: '', user: null });
  };

  if (!auth.token) {
    return <AuthPage onAuthenticated={handleAuthenticated} />;
  }

  return <MainApp user={auth.user} onLogout={handleLogout} />;
}

export default App;
