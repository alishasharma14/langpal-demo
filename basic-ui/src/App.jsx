import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import './styles.css';

const LANGUAGES = [
  'Arabic', 'English', 'French', 'German', 'Hindi',
  'Italian', 'Japanese', 'Korean', 'Mandarin', 'Portuguese', 'Spanish'
];

const MATCHMAKING_URL = 'http://localhost:3000';
const WEBRTC_URL = 'http://localhost:8080';

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
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const userIdRef = useRef(getOrCreateUserId());
  const languagesRef = useRef({
    nativeLanguage: bootstrapState.current.nativeLanguage,
    practiceLanguage: bootstrapState.current.practiceLanguage,
  });

  const isStartDisabled = !nativeLanguage || !practiceLanguage;

  useEffect(() => {
    languagesRef.current = { nativeLanguage, practiceLanguage };
  }, [nativeLanguage, practiceLanguage]);

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
    console.log(`TEST FLOW:
1. Open 2 tabs
2. Click Start in both
3. Check backend logs for MATCH
4. Verify both tabs have same roomId
5. Close one tab -> check DISCONNECT
6. Click Start again -> verify new match`);

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
      setStatusMessage(message || 'Waiting for a partner...');
    });

    socket.on('info', ({ message }) => {
      setStatusMessage(message || 'Matchmaking update received.');
    });

    socket.on('match_found', ({ matchId }) => {
      const roomId = String(matchId);
      console.log('[FRONTEND] match_found received', {
        userId: userIdRef.current,
        roomId,
      });
      const redirectUrl = new URL(WEBRTC_URL);
      redirectUrl.searchParams.set('room', roomId);
      redirectUrl.searchParams.set('userId', userIdRef.current);
      redirectUrl.searchParams.set('native', languagesRef.current.nativeLanguage);
      redirectUrl.searchParams.set('practice', languagesRef.current.practiceLanguage);
      redirectUrl.searchParams.set('returnTo', window.location.origin);
      console.log('[FRONTEND] Redirecting to WebRTC', redirectUrl.toString());
      window.open(redirectUrl.toString(), "_blank");
    });

    socket.on('disconnect', () => {
      setStatusMessage('Disconnected from matchmaking.');
      setIsChatActive(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

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
          <div className="video-card stranger-video">
            {isChatActive
              ? `Stranger's Video`
              : 'Waiting for connection...'
            }
          </div>
          <div className="video-card you-video">
            You
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
