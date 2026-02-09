const db = require('./initDB');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const cors = require('cors');

const {
    saveMessage,
    loadConversation,
    loadRecentChats
} = require('./messageRepo');

const SECRET_KEY = 'MessenCharlesSecretKey';

// ------------------- USERS (TEMP / WILL MOVE TO DB) -------------------
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
const disconnectTimers = new Map(); // username -> timeout

<<<<<<< HEAD
// ------------------- Broadcast Online Users -------------------
=======
// ------------------- Helpers -------------------

// Prepared statements for SQLite
const insertMessageStmt = db.prepare(
    `INSERT INTO messages (sender, receiver, message) VALUES (?, ?, ?)`
);
const historyStmt = db.prepare(
    `SELECT sender, receiver, message, timestamp FROM messages 
     WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)
     ORDER BY timestamp ASC`
);

// Save message in SQLite
function saveMessage(sender, receiver, message) {
    try {
        insertMessageStmt.run(sender, receiver, message);
    } catch (err) {
        console.error('Error saving message:', err);
    }
}

// Load chat history between two users
function loadHistory(user, otherUser) {
    try {
        return historyStmt.all(user, otherUser, otherUser, user);
    } catch (err) {
        console.error('Error loading history:', err);
        return [];
    }
}

// Broadcast online users with username & nickname
>>>>>>> 67b6133 (enhance the ui and server connection, created cicd pipeline and improve server response)
function broadcastOnlineUsers() {
    const usersList = Array.from(onlineUsers.keys()).map(u => ({
        username: u,
        nickname: users[u]?.nickname || u
    }));

    const msg = JSON.stringify({
        type: 'online-users',
        users: usersList
    });

    onlineUsers.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(msg);
        }
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
    } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
        ws.close();
        return;
    }

    ws.username = payload.username;
    ws.nickname = payload.nickname;

    const pendingTimer = disconnectTimers.get(ws.username);
    if (pendingTimer) {
        clearTimeout(pendingTimer);
        disconnectTimers.delete(ws.username);
    }

    const existing = onlineUsers.get(ws.username);
    if (existing && existing !== ws && existing.readyState === WebSocket.OPEN) {
        existing.close(1000, 'Replaced by new connection');
    }
    onlineUsers.set(ws.username, ws);

    console.log(`✅ ${ws.nickname} connected`);

    // Handle incoming messages
    ws.on('message', (rawMsg) => {
        let msgObj;
        const msgStr = rawMsg.toString();
        try {
            msgObj = JSON.parse(msgStr); // { to, message } or { type: 'history', with: 'user' }
        } catch {
            msgObj = { message: msgStr }; // fallback plain text
        }

        if (msgObj.type === 'history' && msgObj.with) {
            const history = loadHistory(ws.username, msgObj.with);
            ws.send(JSON.stringify({
                type: 'history',
                with: msgObj.with,
                messages: history
            }));
            return;
        }

        if (msgObj.to) {
            saveMessage(ws.username, msgObj.to, msgObj.message);
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
            }
        });
    });

    ws.on('close', () => {
        const current = onlineUsers.get(ws.username);
        if (current !== ws) return;

        const timer = setTimeout(() => {
            const latest = onlineUsers.get(ws.username);
            if (latest === ws) {
                onlineUsers.delete(ws.username);
                broadcastOnlineUsers();
                console.log(`? ${ws.nickname} disconnected`);
            }
            disconnectTimers.delete(ws.username);
        }, 2000);
        disconnectTimers.set(ws.username, timer);
    });
});

// ------------------- SERVER START -------------------
server.listen(3000, () => {
    console.log('MessenCharles server running on port 3000');
});

