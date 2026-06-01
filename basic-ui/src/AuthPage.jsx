import React, { useState } from 'react';

const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_MATCHMAKING_URL;
  const isLocalOrigin = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (envUrl && (isLocalOrigin || (!envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')))) {
    return envUrl;
  }
  return window.location.origin;
};

const API_URL = getApiUrl();

const LANGUAGES = [
  'Arabic', 'English', 'French', 'German', 'Hindi',
  'Italian', 'Japanese', 'Korean', 'Mandarin', 'Portuguese', 'Spanish'
];

function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState('register');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [nativeLanguage, setNativeLanguage] = useState('');
  const [practiceLanguage, setPracticeLanguage] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const isRegister = mode === 'register';

  const switchMode = () => {
    setMode(isRegister ? 'login' : 'register');
    setPassword('');
    setConfirmPassword('');
    setErrorMessage('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    const trimmedDisplayName = displayName.trim();

    if (isRegister) {
      if (!trimmedDisplayName) {
        setErrorMessage('Display name is required.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.');
        return;
      }
      if (!agreeTerms) {
        setErrorMessage('You must agree to the Terms of Service & Privacy Policy.');
        return;
      }
      if (!nativeLanguage) {
        setErrorMessage('Please select your native language.');
        return;
      }
      if (!practiceLanguage) {
        setErrorMessage('Please select the language you want to practice.');
        return;
      }
      if (nativeLanguage === practiceLanguage) {
        setErrorMessage('Your native language and practice language cannot be the same.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const payload = isRegister
        ? {
            email,
            password,
            firstName: trimmedDisplayName,
            lastName: '',
            nativeLanguage,
            practiceLanguage
          }
        : { email, password };

      const response = await fetch(`${API_URL}/auth/${isRegister ? 'register' : 'login'}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed.');
      }

      onAuthenticated(data);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <header className="auth-header">
          <h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1>
          <p>{isRegister ? 'Start speaking a new language with confidence.' : 'Sign in to continue practicing.'}</p>
        </header>

        <form onSubmit={handleSubmit} className="auth-form">
          {isRegister && (
            <div className="auth-field">
              <label htmlFor="auth-display-name">Display name</label>
              <input
                id="auth-display-name"
                name="displayName"
                type="text"
                placeholder="How should we call you?"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {isRegister && (
            <>
              <div className="auth-row">
                <div className="auth-field">
                  <label htmlFor="auth-native">I speak</label>
                  <select
                    id="auth-native"
                    value={nativeLanguage}
                    onChange={(e) => setNativeLanguage(e.target.value)}
                    required
                  >
                    <option value="" disabled>Choose...</option>
                    {LANGUAGES.map(lang => (
                      <option key={lang} value={lang}>{lang}</option>
                    ))}
                  </select>
                </div>
                <div className="auth-field">
                  <label htmlFor="auth-practice">I want to learn</label>
                  <select
                    id="auth-practice"
                    value={practiceLanguage}
                    onChange={(e) => setPracticeLanguage(e.target.value)}
                    required
                  >
                    <option value="" disabled>Choose...</option>
                    {LANGUAGES.map(lang => (
                      <option key={lang} value={lang}>{lang}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="auth-tip">Don't worry, this can be changed later</div>
            </>
          )}

          <div className="auth-field">
            <label htmlFor="auth-password">Password</label>
            <div className="auth-password-row">
              <input
                id="auth-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="8+ characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
              <button
                type="button"
                className="auth-visibility-btn"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {isRegister && (
            <div className="auth-field">
              <label htmlFor="auth-confirm-password">Confirm password</label>
              <div className="auth-password-row">
                <input
                  id="auth-confirm-password"
                  name="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="auth-visibility-btn"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          {isRegister && (
            <label className="auth-checkbox-row">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                required
              />
              <span>I agree to the <span style={{ color: '#E63946', fontWeight: 700 }}>Terms of Service</span> and <span style={{ color: '#E63946', fontWeight: 700 }}>Privacy Policy</span></span>
            </label>
          )}

          {errorMessage && <div className="auth-error">{errorMessage}</div>}

          <button type="submit" className="auth-submit-btn" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="auth-divider">OR</div>

        <button
          type="button"
          className="social-btn"
          disabled
          title="Google sign-in is not wired up in this demo yet."
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69c-.29 1.5-.1.8-1.5 2.76l3.4 2.64c2-1.84 3.15-4.55 3.15-7.25z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.4-2.64c-.9.6-2.07.98-3.53.98-3.13 0-5.78-2.11-6.73-4.96L.76 17.15C2.73 21.08 6.84 24 12 24z"/>
            <path fill="#FBBC05" d="M5.27 14.47c-.25-.75-.39-1.56-.39-2.47 0-.91.14-1.72.39-2.47L.76 5.89C.28 6.94 0 8.39 0 12s.28 5.06.76 6.11l4.51-3.64z"/>
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 6.84 0 2.73 2.92.76 6.85l4.51 3.64c.95-2.85 3.6-4.96 6.73-4.96z"/>
          </svg>
          <span>Continue with Google</span>
        </button>

        <p className="auth-footer">
          {isRegister ? 'Already have an account?' : 'Need an account?'}
          <button type="button" onClick={switchMode} style={{ color: '#E63946', fontWeight: 700 }}>
            {isRegister ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </div>
    </div>
  );
}

export default AuthPage;
