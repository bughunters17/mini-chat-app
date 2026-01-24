const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const SECRET_KEY = 'MessenCharlesSecretKey';

// ------------------- USERS -------------------
const users = {
    crz: { password: bcrypt.hashSync('1234', 10), nickname: 'Charles' },
    kmz: { password: bcrypt.hashSync('4321', 10), nickname: 'Karen' }
};

// ------------------- EXPRESS LOGIN -------------------
const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(bodyParser.json());

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users[username];

    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ message: 'Invalid username or password' });
    }

    const token = jwt.sign(
        { username, nickname: user.nickname },
        SECRET_KEY,
        { expiresIn: '2h' }
    );

    res.json({ token, nickname: user.nickname });
});

// ------------------- WEBSOCKET SERVER -------------------
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Track online users
const onlineUsers = new Map(); // username -> ws

// Directory to store history files
const HISTORY_DIR = path.join(__dirname, 'history');
if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR);

// Helper: save message per receiver
function saveMessage(sender, receiver, message) {
    const file = path.join(HISTORY_DIR, `${receiver}.json`);
    let history = [];
    if (fs.existsSync(file)) {
        history = JSON.parse(fs.readFileSync(file));
    }
    history.push({ sender, message, timestamp: new Date().toISOString() });
    fs.writeFileSync(file, JSON.stringify(history, null, 2));
}

// Helper: load message history for a user
function loadHistory(user) {
    const file = path.join(HISTORY_DIR, `${user}.json`);
    if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file));
    }
    return [];
}

// ------------------- Broadcast list of online users -------------------
function broadcastOnlineUsers() {
  // send username + nickname
  const usersList = Array.from(onlineUsers.keys()).map(u => ({
      username: u,
      nickname: users[u]?.nickname || u
  }));

  const msg = JSON.stringify({ type: 'online-users', users: usersList });

  onlineUsers.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

wss.on('connection', (ws, req) => {
    const params = new URLSearchParams(req.url.replace('/?', ''));
    const token = params.get('token');

    if (!token) {
        ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
        ws.close();
        return;
    }

    let payload;
    try {
        payload = jwt.verify(token, SECRET_KEY);
    } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
        ws.close();
        return;
    }

    ws.username = payload.username;
    ws.nickname = payload.nickname;

    onlineUsers.set(ws.username, ws);

    // Send authentication confirmation
    ws.send(JSON.stringify({ type: 'system', message: 'Authenticated' }));

    // Send chat history to this user
    const history = loadHistory(ws.username);
    ws.send(JSON.stringify({ type: 'history', messages: history }));

    // Update online users for everyone
    broadcastOnlineUsers();

    console.log(`✅ ${ws.nickname} connected via JWT`);

    // Handle incoming messages
    ws.on('message', (rawMsg) => {
      let msgObj;
  
      try {
          // Try parsing JSON (if client sent {to, message})
          msgObj = JSON.parse(rawMsg);
      } catch {
          // fallback: plain string
          msgObj = { message: rawMsg };
      }
  
      onlineUsers.forEach((client, uname) => {
          if (client.readyState === WebSocket.OPEN) {
              // Only send messages intended for this client or broadcast
              if (!msgObj.to || msgObj.to === uname || uname === ws.username) {
                  client.send(JSON.stringify({
                      type: 'chat',
                      sender: ws.username,
                      user: ws.nickname,
                      message: msgObj.message,
                      to: msgObj.to || null
                  }));
              }
  
              if (uname !== ws.username && (!msgObj.to || msgObj.to === uname)) {
                  saveMessage(ws.username, uname, msgObj.message);
              }
          }
      });
  });
  

    ws.on('close', () => {
        onlineUsers.delete(ws.username);
        broadcastOnlineUsers();
        console.log(`❌ ${ws.nickname} disconnected`);
    });
});

// ------------------- SERVER START -------------------
server.listen(3000, () => {
    console.log('MessenCharles server running on port 3000');
});
