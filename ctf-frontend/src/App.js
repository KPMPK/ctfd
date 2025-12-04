import React, { useState, useEffect } from 'react';
import './App.css';
import ReactMarkdown from 'react-markdown';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MarkdownPage from './MarkdownPage';
import { owaspMappings } from './constants';
import { loadCaptchaEnginge, LoadCanvasTemplate, validateCaptcha } from 'react-simple-captcha';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';
// Default to true unless explicitly set to 'false'
const SHOW_GUARDRAILS_BUTTON = process.env.REACT_APP_SHOW_GUARDRAILS_BUTTON !== 'false';

const flags = {
  1: "FLAG{l1_qj9qamw45rz839wj}",
  2: "FLAG{l2_6or6kzkqocvi6441}",
  3: "FLAG{l3_mqh3czjiywy3arva}",
  4: "FLAG{l4_x19f70u43b4uc0bt}",
  5: "FLAG{l5_wosfm448o5vs8zth}",
  6: "FLAG{l6_e025q63ec161elu0}",
  7: "FLAG{l7_g41fy0oqsg83tukb}",
  8: "FLAG{l8_vkw0gq7v6k59xfys}",
  9: "FLAG{l9_lawd7koj4q7u820g}",
  10: "FLAG{l10_iwkazb4q0gtxuqlq}"
};

const difficultyLevels = {
  1: "Easy",
  2: "Easy",
  3: "Easy",
  4: "Medium",
  5: "Medium",
  6: "Medium",
  7: "Hard",
  8: "Hard",
  9: "Hard",
  10: "Master"
};

function App() {
  const [unlockedLevels, setUnlockedLevels] = useState([1]);
  const [flagInputs, setFlagInputs] = useState({});
  const [errors, setErrors] = useState({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [modalType, setModalType] = useState(null);
  const [solvedFlags, setSolvedFlags] = useState({});
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [tokens, setTokens] = useState({});
  const [guardTokens, setGuardTokens] = useState({});
  const [docTokens, setDocTokens] = useState({});
  const [captchaInput, setCaptchaInput] = useState('');

  useEffect(() => {
    loadCaptchaEnginge(6);
  }, [showRegister]);

  const validateCaptchaInput = () => {
    if (validateCaptcha(captchaInput)) {
      return true;
    } else {
      setLoginError('Incorrect CAPTCHA');
      loadCaptchaEnginge(6);
      setCaptchaInput('');
      return false;
    }
  };

  const fetchLevels = async () => {
    try {
      // console.log('Fetching levels for user:', username);
      const response = await fetch(`${API_BASE_URL}/api/levels`, { credentials: 'include' });
      const data = await response.json();
      // console.log('Levels response:', data);
      if (data.unlockedLevels && Array.isArray(data.unlockedLevels)) {
        setUnlockedLevels(data.unlockedLevels);
      } else {
        setUnlockedLevels([1]);
      }
      if (data.solvedFlags) {
        setSolvedFlags(data.solvedFlags);
      } else {
        setSolvedFlags({});
      }
    } catch (error) {
      console.error('Error fetching levels and flags:', error);
      setUnlockedLevels([1]);
      setSolvedFlags({});
    }
  };

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/config`, { credentials: 'include' })
      .then(response => response.json())
      .then(data => {
        // console.log('Config response:', data);
        if (data.registrationEnabled !== undefined) {
          setRegistrationEnabled(data.registrationEnabled);
        }
      })
      .catch(error => console.error('Error fetching config:', error));
  }, []);

  useEffect(() => {
    const storedUsername = localStorage.getItem('username');
    if (storedUsername) {
      setUsername(storedUsername);
      setIsLoggedIn(true);
      fetchLevels();
    }
  }, []);

  const handleRegister = () => {
    if (!validateCaptchaInput()) {
      return;
    }
    fetch(`${API_BASE_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'include'
    })
      .then(response => response.json())
      .then(data => {
        // console.log('Register response:', data);
        if (data.success) {
          setShowRegister(false);
          handleLogin();
        } else {
          setLoginError(data.error || 'Registration failed');
          loadCaptchaEnginge(6);
          setCaptchaInput('');
        }
      })
      .catch(error => {
        console.error('Error registering:', error);
        setLoginError('Registration failed');
        loadCaptchaEnginge(6);
        setCaptchaInput('');
      });
  };

  const handleLogin = () => {
    if (!validateCaptchaInput()) {
      return;
    }
    fetch(`${API_BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'include'
    })
      .then(response => response.json())
      .then(data => {
        // console.log('Login response:', data);
        if (data.success) {
          setIsLoggedIn(true);
          setLoginError('');
          setUsername(data.user);
          localStorage.setItem('username', data.user);
          fetchLevels();
        } else {
          setLoginError('Invalid credentials');
          loadCaptchaEnginge(6);
          setCaptchaInput('');
        }
      })
      .catch(error => {
        console.error('Error logging in:', error);
        setLoginError('Login failed');
        loadCaptchaEnginge(6);
        setCaptchaInput('');
      });
  };

  const handleLogout = () => {
    fetch(`${API_BASE_URL}/api/logout`, {
      method: 'POST',
      credentials: 'include'
    })
      .then(response => {
        if (!response.ok) throw new Error('Logout request failed');
        return response.json();
      })
      .then(data => {
        // console.log('Logout response:', data);
        if (data.success) {
          setIsLoggedIn(false);
          setUnlockedLevels([1]);
          setSolvedFlags({});
          setUsername('');
          setPassword('');
          setLoginError('');
          localStorage.removeItem('username');
          window.location.reload();
        }
      })
      .catch(error => {
        console.error('Logout error:', error);
        setLoginError('Logout failed');
      });
  };

  const handleFlagChange = (level, value) => {
    setFlagInputs({ ...flagInputs, [level]: value });
  };

  const handleSubmit = (level) => {
    if (!isLoggedIn) {
      setErrors({ ...errors, [level]: 'Please log in first' });
      return;
    }
    const submittedFlag = flagInputs[level]?.trim();
    // console.log(`Submitting flag for level ${level}:`, submittedFlag);
    if (submittedFlag === flags[level]) {
      const newUnlocked = [...new Set([...unlockedLevels, level + 1])].sort((a, b) => a - b);
      setUnlockedLevels(newUnlocked);
      setErrors({ ...errors, [level]: '' });
      setFlagInputs({ ...flagInputs, [level]: '' });

      setSolvedFlags((prev) => ({
        ...prev,
        [level]: submittedFlag,
      }));

      if (level === 10) {
        alert('Congratulations! You have completed all 10 levels of the CTF AI Bank challenge!');
      }

      fetch(`${API_BASE_URL}/api/submit-flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, flag: submittedFlag }),
        credentials: 'include'
      })
        .then(response => response.json())
        .then(data => {
          // console.log('Submit flag response:', data);
          if (data.success) {
            if (level < 10) {
              fetchToken(data.nextLevel).then((token) => {
                if (token) {
                  setSelectedLevel(data.nextLevel);
                  setIsModalOpen(true);
                } else {
                  setErrors({ ...errors, [level]: 'Failed to generate token for next level' });
                }
              });
            }
            fetch(`${API_BASE_URL}/api/get-solved-flags`, { credentials: 'include' })
              .then(response => response.json())
              .then(data => {
                // console.log('Solved flags response:', data);
                setSolvedFlags(data.solvedFlags || {});
              })
              .catch(error => {
                console.error('Error fetching solved flags:', error);
                setErrors({ ...errors, [level]: 'Failed to fetch solved flags, but flag recorded locally' });
              });
          }
        })
        .catch(error => {
          console.error('Error submitting flag:', error);
          setErrors({ ...errors, [level]: 'Error submitting flag' });
        });
    } else {
      setErrors({ ...errors, [level]: 'Incorrect flag' });
    }
  };

  const fetchToken = async (level) => {
    try {
      // console.log(`Fetching chatbot token for level ${level}`);
      const response = await fetch(`${API_BASE_URL}/api/generate-token/${level}`, { credentials: 'include' });
      const data = await response.json();
      // console.log('Chatbot token response:', data);
      if (data.token) {
        setTokens({ ...tokens, [level]: data.token });
        return data.token;
      }
      return null;
    } catch (error) {
      console.error('Error fetching chatbot token:', error);
      return null;
    }
  };

  const fetchGuardrailsToken = async (level) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/generate-guardrails-token/${level}`, { credentials: 'include' });
      const data = await response.json();
      if (data.token) {
        setGuardTokens({ ...guardTokens, [level]: data.token });
        return data.token;
      }
      return null;
    } catch (error) {
      console.error('Error fetching guardrails token:', error);
      return null;
    }
  };

  const fetchDocToken = async (level) => {
    try {
      // console.log(`Fetching doc token for level ${level} from ${API_BASE_URL}/api/generate-doc-token/${level}`);
      const response = await fetch(`${API_BASE_URL}/api/generate-doc-token/${level}`, { credentials: 'include' });
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      // console.log('Doc token response:', data);
      if (data.token) {
        setDocTokens({ ...docTokens, [level]: data.token });
        return data.token;
      }
      // console.log('No token in response:', data);
      setLoginError(`No token received for level ${level}: ${JSON.stringify(data)}`);
      return null;
    } catch (error) {
      console.error('Error fetching doc token:', error);
      setLoginError(`Failed to fetch documentation token for level ${level}: ${error.message}`);
      return null;
    }
  };

  const openChatbot = async (level) => {
    // console.log(`Opening chatbot for level ${level}, isLoggedIn: ${isLoggedIn}, unlockedLevels:`, unlockedLevels);
    if (!isLoggedIn) {
      setLoginError('Please log in to access the chatbot');
      return;
    }
    if (!unlockedLevels.includes(level)) {
      setLoginError('Level not unlocked');
      return;
    }
    let token = tokens[level];
    if (!token) {
      token = await fetchToken(level);
    }
    if (token) {
      setSelectedLevel(level);
      setModalType('chatbot');
      setIsModalOpen(true);
    } else {
      setLoginError('Failed to generate access token');
    }
  };

  const openGuardrails = async (level) => {
    if (!isLoggedIn) {
      setLoginError('Please log in to access the guardrails');
      return;
    }
    if (!unlockedLevels.includes(level)) {
      setLoginError('Level not unlocked');
      return;
    }
    let token = guardTokens[level];
    if (!token) {
      token = await fetchGuardrailsToken(level);
    }
    if (token) {
      setSelectedLevel(level);
      setModalType('guardrails');
      setIsModalOpen(true);
    } else {
      setLoginError('Failed to generate access token');
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedLevel(null);
    setModalType(null);
  };

  const openDocumentation = async (level) => {
    const numericLevel = Number(level);
    // console.log(`Attempting to open documentation for level ${numericLevel}, type: ${typeof numericLevel}, isLoggedIn: ${isLoggedIn}, unlockedLevels:`, unlockedLevels);
    if (!isLoggedIn) {
      setLoginError('Please log in to access the documentation');
      // console.log('Open documentation failed: Not logged in');
      return;
    }
    if (!unlockedLevels.includes(numericLevel)) {
      setLoginError(`Level ${numericLevel} not unlocked`);
      // console.log(`Open documentation failed: Level not unlocked, requested level: ${numericLevel}, unlockedLevels:`, unlockedLevels);
      return;
    }
    let token = docTokens[numericLevel];
    if (!token) {
      token = await fetchDocToken(numericLevel);
    }
    if (token) {
      const url = `/docs/${numericLevel}?token=${token}`;
      // console.log('Attempting to open URL:', url);
      const newWindow = window.open(url, '_blank');
      if (!newWindow) {
        console.warn('Pop-up blocked, navigating in current tab');
        setLoginError('Pop-up blocked; navigating in current tab');
        window.location.href = url;
      }
    } else {
      setLoginError('Failed to generate documentation access token');
      // console.log('Open documentation failed: No token received');
    }
  };

  const maxUnlocked = Math.max(...unlockedLevels, 0);

  const difficultyOrder = ["Easy", "Medium", "Hard", "Master"];
  const groupedLevels = difficultyOrder.reduce((acc, difficulty) => {
    const levelsForDifficulty = Object.keys(difficultyLevels)
      .filter(level => difficultyLevels[level] === difficulty)
      .map(level => parseInt(level))
      .sort((a, b) => a - b);
    return [...acc, ...levelsForDifficulty];
  }, []);

  if (!isLoggedIn) {
    return (
      <div className="App">
        <h1>Welcome to CTF AI Bank – An AI-powered Bank</h1>
        <img src="/logo.png" alt="CTF Branding" className="login-branding" />
        <div className="login-container">
          <h2>{showRegister ? 'Register' : 'Login'}</h2>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="captcha-container">
            <LoadCanvasTemplate />
            <input
              type="text"
              placeholder="Enter CAPTCHA"
              value={captchaInput}
              onChange={(e) => setCaptchaInput(e.target.value)}
            />
          </div>
          <button onClick={showRegister ? handleRegister : handleLogin}>
            {showRegister ? 'Register' : 'Login'}
          </button>
          {registrationEnabled && (
            <button onClick={() => { setShowRegister(!showRegister); setLoginError(''); loadCaptchaEnginge(6); setCaptchaInput(''); }}>
              {showRegister ? 'Switch to Login' : 'Switch to Register'}
            </button>
          )}
          {loginError && <p className="error">{loginError}</p>}
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={    
            <div className="App">
              <h1>CTF AI Bank: GenAI Capture-the-Flag Challenges</h1>
              <p>
                Welcome, {username}! <button onClick={handleLogout}>Logout</button>
              </p>
              <p>
                Educational CTF: Exploit each level's chatbot to get the flag, then submit to unlock the next.
              </p>
              {loginError && <p className="error">{loginError}</p>}
        
              <div className="notice-box">
                <h2>⚠️ Important Notice</h2>
                <p>
                  These apps are <strong>intentionally vulnerable</strong> for learning—so keep your
                  hacks inside this CTF only.
                </p>
                <p>
                  🖥️ The backend is running on a <strong>low-end GPU</strong> 💪. Please be gentle
                  and avoid overloading it with heavy requests.
                </p>
                <p>
                  🤖 The challenges leverage a <strong>language model</strong>, so outputs may be 
                  <em>non-deterministic</em> (the same prompt might give slightly different answers).
                </p>
                <p><strong>Good luck, have fun, and happy flag hunting 🚩</strong></p>
              </div>
        
              <div className="levels-container">
                {groupedLevels.map(level => (
                  <div key={level} className={`level difficulty-${difficultyLevels[level]?.toLowerCase() || 'easy'}`}>
                    <h3>Level {level}: {owaspMappings[level]}</h3>
                    {unlockedLevels.includes(level) ? (
                      <>
                        <button
                          className={`difficulty-btn difficulty-${difficultyLevels[level]?.toLowerCase() || 'easy'}`}
                          onClick={() => openChatbot(level)}
                        >
                          Open Chatbot
                        </button>
                        {level === 10 && (
                          <div className="flag-input-container">
                            <input
                              type="text"
                              className={`difficulty-input difficulty-${difficultyLevels[level]?.toLowerCase() || 'easy'}`}
                              placeholder={`Enter Level ${level} FLAG`}
                              value={flagInputs[level] || ''}
                              onChange={(e) => handleFlagChange(level, e.target.value)}
                            />
                            <button onClick={() => handleSubmit(level)}>Submit Flag</button>
                            {errors[level] && <p className="error">{errors[level]}</p>}
                            {solvedFlags[10] && level === 10 && (
                              <span className="completed-badge">Challenge Completed!</span>
                            )}
                          </div>
                        )}
                      </>
                    ) : level === maxUnlocked + 1 ? (
                      <div className="flag-input-container">
                        <input
                          type="text"
                          className={`difficulty-input difficulty-${difficultyLevels[level - 1]?.toLowerCase() || 'easy'}`}
                          placeholder={`Unlock with Level${level - 1} FLAG`}
                          value={flagInputs[level - 1] || ''}
                          onChange={(e) => handleFlagChange(level - 1, e.target.value)}
                        />
                        <button onClick={() => handleSubmit(level - 1)}>Submit Flag</button>
                        {errors[level - 1] && <p className="error">{errors[level - 1]}</p>}
                      </div>
                    ) : (
                      <p>Locked (Complete previous levels)</p>
                    )}
                    <div className={`difficulty-badge badge-${difficultyLevels[level]?.toLowerCase() || 'easy'}`}>
                      {difficultyLevels[level] || 'Easy'}
                    </div>
                  </div>
                ))}
              </div>
              {Object.keys(solvedFlags).length > 0 && (
                <div className="solved-flags">
                  <h2>🚩 Solved Flags</h2>
                  <div className="solved-flags-grid">
                    {Object.entries(solvedFlags)
                      .sort(([levelA], [levelB]) => Number(levelA) - Number(levelB))
                      .map(([level, flag]) => (
                        <div key={level} className="solved-flag-card">
                          <div className="solved-flag-header">
                            <span className="solved-flag-level">Level {level}</span>
                            <span className="solved-flag-badge">Solved</span>
                          </div>
                          <div className="solved-flag-body">
                            <code className="solved-flag-code">{flag.replace(/\n/g, ' ')}</code>
                          </div>
                          <button
                            className="learn-more-btn"
                            onClick={(event) => {
                              event.stopPropagation();
                              openDocumentation(Number(level));
                            }}
                          >
                            Learn More
                          </button>
                          {SHOW_GUARDRAILS_BUTTON && (
                            <button
                              className="guardrails-btn"
                              onClick={(event) => {
                                event.stopPropagation();
                                openGuardrails(Number(level));
                              }}
                            >
                              F5 AI Guardrails
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
              {isModalOpen && selectedLevel && modalType && (
                <div className="modal">
                  <div className="modal-content">
                    <span className="modal-close" onClick={closeModal}>&times;</span>
                    <h3>Level {selectedLevel} {modalType === 'chatbot' ? 'Chatbot' : 'Guardrails'}</h3>
                    <iframe
                      src={`${API_BASE_URL}/${modalType === 'chatbot' ? 'level' : 'guardrails-level'}${selectedLevel}/?token=${(modalType === 'chatbot' ? tokens : guardTokens)[selectedLevel] || ''}&username=${encodeURIComponent(username)}`}
                      title={`Level ${selectedLevel} ${modalType === 'chatbot' ? 'Chatbot' : 'Guardrails'}`}
                      className="chatbot-iframe"
                    />
                  </div>
                </div>
              )}
            </div>
          }
        />
        <Route path="/docs/:level" element={<MarkdownPage />} />
      </Routes>
    </Router>
  );
}

export default App;