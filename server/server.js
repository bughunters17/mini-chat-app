const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const db = require('./initDB'); // your DB initialization
const SECRET_KEY = 'MessenCharlesSecretKey';

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

  const user = db
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(username);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ message: 'Invalid username or password' });
  }

  const token = jwt.sign(
    { username: user.username, nickname: user.nickname },
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

// ------------------- Helpers -------------------

// Save message in SQLite
function saveMessage(sender, receiver, message) {
    db.run(
        `INSERT INTO messages (sender, receiver, message) VALUES (?, ?, ?)`,
        [sender, receiver, message],
        (err) => {
            if (err) console.error('Error saving message:', err);
        }
    );
}

// Load chat history between two users
function loadHistory(user, otherUser, callback) {
    db.all(
        `SELECT sender, receiver, message, timestamp FROM messages 
         WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)
         ORDER BY timestamp ASC`,
        [user, otherUser, otherUser, user],
        (err, rows) => {
            if (err) {
                console.error('Error loading history:', err);
                callback([]);
            } else {
                callback(rows);
            }
        }
    );
}

// Broadcast online users with username & nickname
function broadcastOnlineUsers() {
    const usersList = Array.from(onlineUsers.keys()).map(u => {
        return { username: u, nickname: onlineUsers.get(u).nickname };
    });
    const msg = JSON.stringify({ type: 'online-users', users: usersList });

    onlineUsers.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    });
}

// ------------------- WebSocket Connection -------------------
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

    // Confirm auth
    ws.send(JSON.stringify({ type: 'system', message: 'Authenticated' }));

    // Update everyone with online users
    broadcastOnlineUsers();

    console.log(`✅ ${ws.nickname} connected`);

    // Handle incoming messages
    ws.on('message', (rawMsg) => {
        let msgObj;
        try {
            msgObj = JSON.parse(rawMsg); // { to, message }
        } catch {
            msgObj = { message: rawMsg }; // fallback plain text
        }

        onlineUsers.forEach((client, uname) => {
            if (client.readyState === WebSocket.OPEN) {
                // Only send to intended user or self
                if (!msgObj.to || msgObj.to === uname || uname === ws.username) {
                    client.send(JSON.stringify({
                        type: 'chat',
                        sender: ws.username,
                        user: ws.nickname,
                        message: msgObj.message,
                        to: msgObj.to || null
                    }));
                }

                // Save message in SQLite for recipient
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
