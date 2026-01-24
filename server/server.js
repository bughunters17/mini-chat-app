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

// ------------------- Broadcast Online Users -------------------
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

    onlineUsers.set(ws.username, ws);

    console.log(`✅ ${ws.nickname} connected`);

    // ---------------- SEND RECENT CHATS (DB) ----------------
    const recent = loadRecentChats(ws.username);
    ws.send(JSON.stringify({
        type: 'recent-chats',
        chats: recent
    }));

    // ---------------- UPDATE ONLINE USERS ----------------
    broadcastOnlineUsers();

    // ---------------- HANDLE INCOMING MESSAGES ----------------
    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw);
        } catch {
            return;
        }

        if (!msg.to || !msg.message) return;

        // Persist message
        saveMessage(ws.username, msg.to, msg.message);

        // Send to receiver
        const target = onlineUsers.get(msg.to);
        if (target && target.readyState === WebSocket.OPEN) {
            target.send(JSON.stringify({
                type: 'chat',
                sender: ws.username,
                message: msg.message,
                to: msg.to
            }));
        }

        // Echo back to sender (server-authoritative)
        ws.send(JSON.stringify({
            type: 'chat',
            sender: ws.username,
            message: msg.message,
            to: msg.to
        }));
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
