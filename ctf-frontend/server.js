const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3');
const httpProxy = require('http-proxy');
const crypto = require('crypto');

const app = express();
const PORT = 3001;

const PERSISTENT_STORAGE_PATH = '/data';
const DB_PATH = path.join(PERSISTENT_STORAGE_PATH, 'ctf.db');
const MARKDOWN_PATH = path.join(__dirname, 'assets', 'levelDocs');
const CONFIG_PATH = path.join(__dirname, 'config.py');

let currentUser = null;
const tokens = new Map();
const proxy = httpProxy.createProxyServer({});

// Declare db globally
let db;

(async () => {
  try {
    await fs.mkdir(PERSISTENT_STORAGE_PATH, { recursive: true });
    console.log(`Persistent storage directory created at ${PERSISTENT_STORAGE_PATH}`);
  } catch (err) {
    console.error('Failed to create persistent storage directory:', err.message, err.stack);
    process.exit(1);
  }

  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Error opening SQLite database:', err.message, err.stack);
      console.error('DB_PATH:', DB_PATH);
      process.exit(1);
    }
    console.log('Connected to SQLite database at:', DB_PATH);
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        unlockedLevels TEXT,
        solvedFlags TEXT
      )
    `, (err) => {
      if (err) {
        console.error('Error creating users table:', err.message, err.stack);
        process.exit(1);
      }
      console.log('Users table created or already exists');
      db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        if (err) {
          console.error('Error querying users table:', err.message, err.stack);
          process.exit(1);
        }
        console.log('Users table count:', row.count);
        if (row.count === 0) {
          const defaultUsers = [
            {
              username: 'user1',
              password: bcrypt.hashSync('pass098', 10),
              unlockedLevels: JSON.stringify([1]),
              solvedFlags: JSON.stringify({})
            },
            {
              username: 'user2',
              password: bcrypt.hashSync('pass098', 10),
              unlockedLevels: JSON.stringify([1]),
              solvedFlags: JSON.stringify({})
            },
            {
              username: 'fbchan',
              password: bcrypt.hashSync('pass098', 10),
              unlockedLevels: JSON.stringify([1]),
              solvedFlags: JSON.stringify({})
            }
          ];
          const stmt = db.prepare('INSERT INTO users (username, password, unlockedLevels, solvedFlags) VALUES (?, ?, ?, ?)');
          defaultUsers.forEach(user => {
            stmt.run(user.username, user.password, user.unlockedLevels, user.solvedFlags, (err) => {
              if (err) {
                console.error('Error inserting default user:', user.username, err.message);
              } else {
                console.log('Inserted default user:', user.username);
              }
            });
          });
          stmt.finalize(() => {
            console.log('Default users insertion completed');
          });
        }
      });
    });
  });
})();

app.use((req, res, next) => {
  let data = '';
  req.on('data', chunk => data += chunk);
  req.on('end', () => {
    console.log('Raw body received:', data);
    req.rawBody = data;
  });
  next();
});

app.use(express.json());
console.log('express.json middleware applied');

const authenticate = (req, res, next) => {
  console.log('Authenticating:', req.method, req.url, 'currentUser:', currentUser);
  if (!currentUser && req.url !== '/api/login' && req.url !== '/api/register' && req.url !== '/api/logout' && req.url !== '/api/config') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

app.use(authenticate);

app.post('/api/register', (req, res) => {
  console.log('Register attempt:', { body: req.body, headers: req.headers });
  if (!req.body) {
    console.log('No request body received for register');
    return res.status(400).json({ error: 'Request body is missing or malformed' });
  }
  fs.readFile(CONFIG_PATH, 'utf8')
    .then(configContent => {
      const regMatch = configContent.match(/REGISTRATION_ENABLED\s*=\s*(True|False)/);
      if (!regMatch || regMatch[1] === 'False') {
        console.log('Registration disabled by config');
        return res.status(403).json({ error: 'Registration is disabled' });
      }
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }
      db.get('SELECT username FROM users WHERE username = ?', [username], (err, row) => {
        if (err) {
          console.error('Error checking username:', err.message);
          return res.status(500).json({ error: 'Registration failed' });
        }
        if (row) {
          return res.status(400).json({ error: 'Username already exists' });
        }
        bcrypt.hash(password, 10, (err, hash) => {
          if (err) {
            console.error('Error hashing password:', err.message);
            return res.status(500).json({ error: 'Registration failed' });
          }
          db.run(
            'INSERT INTO users (username, password, unlockedLevels, solvedFlags) VALUES (?, ?, ?, ?)',
            [username, hash, JSON.stringify([1]), JSON.stringify({})],
            (err) => {
              if (err) {
                console.error('Error inserting user:', err.message);
                return res.status(500).json({ error: 'Registration failed' });
              }
              console.log(`POST /api/register: Registered ${username}`);
              res.json({ success: true });
            }
          );
        });
      });
    })
    .catch(error => {
      console.error('Error reading config.py for registration:', error.message);
      return res.status(500).json({ error: 'Server configuration error' });
    });
});

app.post('/api/login', (req, res) => {
  console.log('Login attempt:', { body: req.body, headers: req.headers });
  if (!req.body) {
    console.log('No request body received');
    return res.status(400).json({ error: 'Request body is missing or malformed' });
  }
  const { username, password } = req.body;
  if (!username || !password) {
    console.log('Missing credentials:', { username, password });
    return res.status(400).json({ error: 'Missing username or password' });
  }
  db.get('SELECT password, unlockedLevels, solvedFlags FROM users WHERE username = ?', [username], (err, row) => {
    if (err) {
      console.error('DB query error in login:', err.message, err.stack);
      return res.status(500).json({ error: 'Login failed: Database error' });
    }
    console.log('DB query result:', row ? 'User found' : 'User not found');
    try {
      if (row && bcrypt.compareSync(password, row.password)) {
        currentUser = username;
        console.log(`Login successful for ${username}`);
        res.json({ success: true, user: username });
      } else {
        console.log('Invalid credentials for user:', username);
        res.status(401).json({ error: 'Invalid credentials' });
      }
    } catch (bcryptErr) {
      console.error('Bcrypt error in login:', bcryptErr.message, bcryptErr.stack);
      return res.status(500).json({ error: 'Login failed: Password verification error' });
    }
  });
});

app.post('/api/logout', (req, res) => {
  console.log('Attempting logout, currentUser:', currentUser);
  if (currentUser) {
    tokens.delete(currentUser);
    currentUser = null;
    console.log('Logout successful, currentUser cleared');
    res.json({ success: true });
  } else {
    console.log('No user logged in to logout');
    res.json({ success: true });
  }
});

app.get('/api/levels', (req, res) => {
  db.get('SELECT unlockedLevels, solvedFlags FROM users WHERE username = ?', [currentUser], (err, row) => {
    if (err) {
      console.error('Error querying levels:', err.message);
      return res.json({ unlockedLevels: [1], solvedFlags: {} });
    }
    const progress = row || { unlockedLevels: JSON.stringify([1]), solvedFlags: JSON.stringify({}) };
    fs.readFile(CONFIG_PATH, 'utf8')
      .then(configContent => {
        const debugMatch = configContent.match(/DEBUG_MODE\s*=\s*(True|False)/);
        const isDebugMode = debugMatch && debugMatch[1] === 'True';
        const unlockedLevels = JSON.parse(progress.unlockedLevels);
        const response = {
          unlockedLevels: isDebugMode ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : unlockedLevels,
          solvedFlags: JSON.parse(progress.solvedFlags)
        };
        console.log('Sending levels response:', response);
        res.json(response);
      })
      .catch(error => {
        console.error('Error reading config.py:', error.message);
        res.json({
          unlockedLevels: JSON.parse(progress.unlockedLevels),
          solvedFlags: JSON.parse(progress.solvedFlags)
        });
      });
  });
});

app.get('/api/config', (req, res) => {
  fs.readFile(CONFIG_PATH, 'utf8')
    .then(configContent => {
      const debugMatch = configContent.match(/DEBUG_MODE\s*=\s*(True|False)/);
      const regMatch = configContent.match(/REGISTRATION_ENABLED\s*=\s*(True|False)/);
      const isDebugMode = debugMatch && debugMatch[1] === 'True';
      const isRegistrationEnabled = regMatch && regMatch[1] === 'True';
      if (!debugMatch || !regMatch) {
        console.warn('Missing config settings, defaulting to False');
      }
      res.json({
        debugMode: isDebugMode,
        registrationEnabled: isRegistrationEnabled
      });
    })
    .catch(error => {
      console.error('Error reading config.py for config endpoint:', error.message);
      return res.status(500).json({ error: 'Server configuration error' });
    });
});

app.post('/api/levels', (req, res) => {
  res.status(403).json({ error: 'Level updates are managed via flag submission only' });
});

app.post('/api/submit-flag', (req, res) => {
  console.log('Submit flag attempt:', { body: req.body, headers: req.headers });
  if (!req.body) {
    console.log('No request body received for submit-flag');
    return res.status(400).json({ error: 'Request body is missing or malformed' });
  }
  const { level, flag } = req.body;
  db.get('SELECT unlockedLevels, solvedFlags FROM users WHERE username = ?', [currentUser], (err, row) => {
    if (err) {
      console.error('Error querying user progress:', err.message);
      return res.status(500).json({ error: 'Failed to submit flag' });
    }
    const progress = row || { unlockedLevels: JSON.stringify([1]), solvedFlags: JSON.stringify({}) };
    const unlockedLevels = JSON.parse(progress.unlockedLevels);
    const solvedFlags = JSON.parse(progress.solvedFlags);
    const validFlags = {
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
    const maxUnlocked = Math.max(...unlockedLevels, 0);
    if (level !== maxUnlocked) {
      return res.status(400).json({ error: 'You must submit the flag for the current level' });
    }
    if (validFlags[level] === flag) {
      const newUnlocked = [...new Set([...unlockedLevels, level + 1])].sort((a, b) => a - b);
      const newSolvedFlags = { ...solvedFlags, [level]: flag };
      db.run(
        'UPDATE users SET unlockedLevels = ?, solvedFlags = ? WHERE username = ?',
        [JSON.stringify(newUnlocked), JSON.stringify(newSolvedFlags), currentUser],
        (err) => {
          if (err) {
            console.error('Error updating progress:', err.message);
            return res.status(500).json({ error: 'Failed to submit flag' });
          }
          console.log(`POST /api/submit-flag: Saved flag for level ${level}, unlocked ${newUnlocked} for ${currentUser}`);
          res.json({ success: true, nextLevel: level + 1 });
        }
      );
    } else {
      res.status(400).json({ error: 'Invalid flag' });
    }
  });
});

app.get('/api/get-solved-flags', (req, res) => {
  db.get('SELECT solvedFlags FROM users WHERE username = ?', [currentUser], (err, row) => {
    if (err) {
      console.error('Error querying solved flags:', err.message);
      return res.json({ solvedFlags: {} });
    }
    const progress = row || { solvedFlags: JSON.stringify({}) };
    res.json({ solvedFlags: JSON.parse(progress.solvedFlags) });
  });
});

app.get('/api/generate-token/:level', (req, res) => {
  if (!currentUser) return res.status(401).json({ error: 'Unauthorized' });
  const level = parseInt(req.params.level, 10);
  console.log(`Attempting to generate token for user: ${currentUser}, level: ${level}`);
  db.get('SELECT unlockedLevels FROM users WHERE username = ?', [currentUser], (err, row) => {
    if (err) {
      console.error('Error querying user for token:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
    const unlockedLevels = JSON.parse(row?.unlockedLevels || '[1]');
    console.log(`Unlocked levels for ${currentUser}:`, unlockedLevels);
    fs.readFile(CONFIG_PATH, 'utf8')
      .then(configContent => {
        const debugMatch = configContent.match(/DEBUG_MODE\s*=\s*(True|False)/);
        const isDebugMode = debugMatch && debugMatch[1] === 'True';
        if (isNaN(level) || level < 1 || level > 11 || (!isDebugMode && !unlockedLevels.includes(level))) {
          console.log(`Access denied for token: level=${level}, unlockedLevels=${unlockedLevels}, isDebugMode=${isDebugMode}`);
          return res.status(403).json({ error: 'Level not unlocked' });
        }
        const token = crypto.randomBytes(16).toString('hex');
        const expires = Date.now() + 24 * 3600000;
        if (!tokens.has(currentUser)) tokens.set(currentUser, {});
        tokens.get(currentUser)[level] = { token, expires, type: 'chatbot' };
        console.log(`Generated chatbot token for ${currentUser} at level ${level}:`, token);
        res.json({ token });
      })
      .catch(err => {
        console.error('Error reading config.py for token:', err.message);
        return res.status(500).json({ error: 'Config error' });
      });
  });
});

app.get('/api/generate-doc-token/:level', (req, res) => {
  if (!currentUser) return res.status(401).json({ error: 'Unauthorized' });
  const level = parseInt(req.params.level, 10);
  console.log(`Attempting to generate doc token for user: ${currentUser}, level: ${level}`);
  db.get('SELECT unlockedLevels FROM users WHERE username = ?', [currentUser], (err, row) => {
    if (err) {
      console.error('Error querying user for doc token:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
    const unlockedLevels = JSON.parse(row?.unlockedLevels || '[1]');
    fs.readFile(CONFIG_PATH, 'utf8')
      .then(configContent => {
        const debugMatch = configContent.match(/DEBUG_MODE\s*=\s*(True|False)/);
        const isDebugMode = debugMatch && debugMatch[1] === 'True';
        if (isNaN(level) || level < 1 || level > 11 || (!isDebugMode && !unlockedLevels.includes(level))) {
          console.log(`Access denied for doc token: level=${level}, unlockedLevels=${unlockedLevels}, isDebugMode=${isDebugMode}`);
          return res.status(403).json({ error: 'Level not unlocked' });
        }
        const token = crypto.randomBytes(16).toString('hex');
        const expires = Date.now() + 3600000;
        if (!tokens.has(currentUser)) tokens.set(currentUser, {});
        tokens.get(currentUser)[`doc-${level}`] = { token, expires, type: 'doc' };
        console.log(`Generated doc token for ${currentUser} at level ${level}:`, token);
        res.json({ token });
      })
      .catch(err => {
        console.error('Error reading config.py for doc token:', err.message);
        return res.status(500).json({ error: 'Config error' });
      });
  });
});

app.get('/api/generate-guardrails-token/:level', (req, res) => {
  if (!currentUser) return res.status(401).json({ error: 'Unauthorized' });
  const level = parseInt(req.params.level, 10);
  console.log(`Attempting to generate guardrails token for user: ${currentUser}, level: ${level}`);
  db.get('SELECT unlockedLevels FROM users WHERE username = ?', [currentUser], (err, row) => {
    if (err) {
      console.error('Error querying user for guardrails token:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
    const unlockedLevels = JSON.parse(row?.unlockedLevels || '[1]');
    fs.readFile(CONFIG_PATH, 'utf8')
      .then(configContent => {
        const debugMatch = configContent.match(/DEBUG_MODE\s*=\s*(True|False)/);
        const isDebugMode = debugMatch && debugMatch[1] === 'True';
        if (isNaN(level) || level < 1 || level > 10 || (!isDebugMode && !unlockedLevels.includes(level))) {
          console.log(`Access denied for guardrails token: level=${level}, unlockedLevels=${unlockedLevels}, isDebugMode=${isDebugMode}`);
          return res.status(403).json({ error: 'Level not unlocked' });
        }
        const token = crypto.randomBytes(16).toString('hex');
        const expires = Date.now() + 24 * 3600000;
        if (!tokens.has(currentUser)) tokens.set(currentUser, {});
        tokens.get(currentUser)[`guard-${level}`] = { token, expires, type: 'guard' };
        console.log(`Generated guardrails token for ${currentUser} at level ${level}:`, token);
        res.json({ token });
      })
      .catch(err => {
        console.error('Error reading config.py for guardrails token:', err.message);
        return res.status(500).json({ error: 'Config error' });
      });
  });
});

app.get('/api/docs/:level', (req, res) => {
  const level = parseInt(req.params.level, 10);
  const token = req.query.token;
  console.log('Accessing /api/docs:', { level, token, currentUser });
  if (!currentUser) {
    console.log('Unauthorized access to /api/docs:', { level, token });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  db.get('SELECT unlockedLevels FROM users WHERE username = ?', [currentUser], (err, row) => {
    if (err) {
      console.error('Error querying user for docs:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
    const unlockedLevels = JSON.parse(row?.unlockedLevels || '[1]');
    fs.readFile(CONFIG_PATH, 'utf8')
      .then(configContent => {
        const debugMatch = configContent.match(/DEBUG_MODE\s*=\s*(True|False)/);
        const isDebugMode = debugMatch && debugMatch[1] === 'True';
        if (
          isNaN(level) ||
          level < 1 ||
          level > 11 ||
          (!isDebugMode && !unlockedLevels.includes(level)) ||
          !tokens.has(currentUser) ||
          !tokens.get(currentUser)[`doc-${level}`] ||
          tokens.get(currentUser)[`doc-${level}`].token !== token ||
          Date.now() > tokens.get(currentUser)[`doc-${level}`].expires
        ) {
          console.log('Access denied to /api/docs:', {
            level,
            isNaN: isNaN(level),
            levelRange: level < 1 || level > 11,
            unlocked: !unlockedLevels.includes(level),
            tokenExists: !tokens.has(currentUser) || !tokens.get(currentUser)[`doc-${level}`],
            tokenMatch: tokens.get(currentUser)?.[`doc-${level}`]?.token !== token,
            expired: Date.now() > tokens.get(currentUser)?.[`doc-${level}`]?.expires
          });
          return res.status(403).json({ error: 'Access denied: Level not unlocked or invalid token' });
        }
        const filePath = path.join(MARKDOWN_PATH, `level${level}.md`);
        fs.readFile(filePath, 'utf8')
          .then(content => {
            console.log(`Served documentation for level ${level} to ${currentUser}`);
            res.set('Content-Type', 'text/plain');
            res.send(content);
          })
          .catch(err => {
            console.error(`Error reading markdown file for level ${level}:`, err.message);
            return res.status(404).json({ error: 'Documentation not found' });
          });
      })
      .catch(err => {
        console.error('Error reading config.py for docs:', err.message);
        return res.status(500).json({ error: 'Config error' });
      });
  });
});

app.all('/level/:levelNumber', (req, res) => {
  const level = parseInt(req.params.levelNumber, 10);
  const token = req.query.token;
  console.log('Proxying level:', level, 'Token:', token, 'Current User:', currentUser);
  if (!currentUser) return res.status(401).json({ error: 'Unauthorized' });
  db.get('SELECT unlockedLevels FROM users WHERE username = ?', [currentUser], (err, row) => {
    if (err) {
      console.error('Error querying user for level:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
    const unlockedLevels = JSON.parse(row?.unlockedLevels || '[1]');
    fs.readFile(CONFIG_PATH, 'utf8')
      .then(configContent => {
        const debugMatch = configContent.match(/DEBUG_MODE\s*=\s*(True|False)/);
        const isDebugMode = debugMatch && debugMatch[1] === 'True';
        if (
          isNaN(level) ||
          level < 1 ||
          level > 11 ||
          (!isDebugMode && !unlockedLevels.includes(level)) ||
          !tokens.has(currentUser) ||
          !tokens.get(currentUser)[level] ||
          tokens.get(currentUser)[level].token !== token ||
          Date.now() > tokens.get(currentUser)[level].expires
        ) {
          console.log('Access denied details:', {
            isNaN: isNaN(level),
            levelRange: level < 1 || level > 11,
            unlocked: !unlockedLevels.includes(level),
            tokenExists: !tokens.has(currentUser) || !tokens.get(currentUser)[level],
            tokenMatch: tokens.get(currentUser)?.[level]?.token !== token,
            expired: Date.now() > tokens.get(currentUser)?.[level]?.expires
          });
          return res.status(403).json({ error: 'Access denied: Level not unlocked or invalid token' });
        }
        proxy.web(req, res, { target: `http://localhost:85${level}` });
      })
      .catch(err => {
        console.error('Error reading config.py for level:', err.message);
        return res.status(500).json({ error: 'Config error' });
      });
  });
});

app.all('/guardrails-level/:levelNumber', (req, res) => {
  const level = parseInt(req.params.levelNumber, 10);
  const token = req.query.token;
  console.log('Proxying guardrails-level:', level, 'Token:', token, 'Current User:', currentUser);
  if (!currentUser) return res.status(401).json({ error: 'Unauthorized' });
  db.get('SELECT unlockedLevels FROM users WHERE username = ?', [currentUser], (err, row) => {
    if (err) {
      console.error('Error querying user for guardrails level:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
    const unlockedLevels = JSON.parse(row?.unlockedLevels || '[1]');
    fs.readFile(CONFIG_PATH, 'utf8')
      .then(configContent => {
        const debugMatch = configContent.match(/DEBUG_MODE\s*=\s*(True|False)/);
        const isDebugMode = debugMatch && debugMatch[1] === 'True';
        if (
          isNaN(level) ||
          level < 1 ||
          level > 10 ||
          (!isDebugMode && !unlockedLevels.includes(level)) ||
          !tokens.has(currentUser) ||
          !tokens.get(currentUser)[`guard-${level}`] ||
          tokens.get(currentUser)[`guard-${level}`].token !== token ||
          Date.now() > tokens.get(currentUser)[`guard-${level}`].expires
        ) {
          console.log('Access denied details for guardrails:', {
            isNaN: isNaN(level),
            levelRange: level < 1 || level > 10,
            unlocked: !unlockedLevels.includes(level),
            tokenExists: !tokens.has(currentUser) || !tokens.get(currentUser)[`guard-${level}`],
            tokenMatch: tokens.get(currentUser)?.[`guard-${level}`]?.token !== token,
            expired: Date.now() > tokens.get(currentUser)?.[`guard-${level}`]?.expires
          });
          return res.status(403).json({ error: 'Access denied: Level not unlocked or invalid token' });
        }
        proxy.web(req, res, { target: `http://localhost:851${level}` });
      })
      .catch(err => {
        console.error('Error reading config.py for guardrails level:', err.message);
        return res.status(500).json({ error: 'Config error' });
      });
  });
});

app.post('/api/validate-token', (req, res) => {
  console.log('Validate token attempt:', { body: req.body, headers: req.headers });
  if (!req.body) {
    console.log('No request body received for validate-token');
    return res.status(400).json({ error: 'Request body is missing or malformed' });
  }
  const { username, level, token } = req.body;
  console.log('Validating token (POST):', { username, level, token });
  db.get('SELECT unlockedLevels FROM users WHERE username = ?', [username], (err, row) => {
    if (err) {
      console.error('Error querying user:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
    const unlockedLevels = JSON.parse(row?.unlockedLevels || '[1]');
    fs.readFile(CONFIG_PATH, 'utf8')
      .then(configContent => {
        const debugMatch = configContent.match(/DEBUG_MODE\s*=\s*(True|False)/);
        const isDebugMode = debugMatch && debugMatch[1] === 'True';
        const levelStr = String(level);
        const numericLevel = levelStr.startsWith('guard-') ? parseInt(levelStr.replace('guard-', '')) : parseInt(levelStr);
        console.log('Token data:', tokens.get(username), 'Level:', level, 'Numeric Level:', numericLevel, 'Unlocked:', unlockedLevels);
        if (
          !tokens.has(username) ||
          !tokens.get(username)[levelStr] ||
          tokens.get(username)[levelStr].token !== token ||
          Date.now() > tokens.get(username)[levelStr].expires ||
          (!isDebugMode && !unlockedLevels.includes(numericLevel))
        ) {
          console.log('Validation failed:', {
            hasUser: tokens.has(username),
            hasLevel: !!tokens.get(username)?.[levelStr],
            tokenMatch: tokens.get(username)?.[levelStr]?.token === token,
            expired: Date.now() > tokens.get(username)?.[levelStr]?.expires,
            levelUnlocked: unlockedLevels.includes(numericLevel)
          });
          return res.json({ valid: false });
        }
        res.json({ valid: true });
      })
      .catch(err => {
        console.error('Error reading config.py:', err.message);
        return res.status(500).json({ error: 'Config error' });
      });
  });
});

app.use((req, res) => {
  console.log('Unmatched route:', req.method, req.url);
  res.status(404).send('Cannot GET ' + req.url);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});