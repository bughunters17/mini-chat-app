require('./initDB');
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
    updateMessage,
    softDeleteMessage
} = require('./messageRepo');
const {
    createGroup,
    listGroupsForUser,
    listGroupMemberUsernames,
    loadGroupMessages,
    saveGroupMessage,
    setGroupHidden,
    hardDeleteGroup,
    updateGroupMessage,
    softDeleteGroupMessage
} = require('./groupRepo');
const {
    approveUser,
    createUser,
    deleteNormalUser,
    findUserByUsername,
    listUsers,
    listUsersForAdmin,
    normalizeNickname,
    normalizeUsername,
    rejectUser
} = require('./userRepo');

const SECRET_KEY = 'MessenCharlesSecretKey';

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());

function validateCredentialsInput({ username, password }) {
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedUsername || !password) {
        return { message: 'Username and password are required' };
    }

    if (!/^[a-z0-9_]{3,32}$/.test(normalizedUsername)) {
        return { message: 'Username must be 3-32 characters and use only letters, numbers, or underscore' };
    }

    return null;
}

function signUserToken(user) {
    return jwt.sign(
        {
            username: user.username,
            nickname: user.nickname,
            role: user.role || 'user',
            status: user.status || 'active'
        },
        SECRET_KEY,
        { expiresIn: '2h' }
    );
}

function publicUser(user) {
    return {
        username: user.username,
        nickname: user.nickname,
        role: user.role || 'user',
        status: user.status || 'active',
        created_at: user.created_at || null,
        approved_by: user.approved_by || null,
        approved_at: user.approved_at || null,
        rejected_at: user.rejected_at || null,
        deleted_at: user.deleted_at || null,
        hard_deleted: !!user.hard_deleted,
        messages_deleted: user.messages_deleted || 0
    };
}

function authenticateHttp(req, res, next) {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';

    if (!token) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    try {
        const payload = jwt.verify(token, SECRET_KEY);
        const user = findUserByUsername(payload.username);

        if (!user || user.status !== 'active') {
            return res.status(403).json({ message: 'Account is not active' });
        }

        req.user = user;
        return next();
    } catch {
        return res.status(401).json({ message: 'Invalid token' });
    }
}

function requireAdmin(req, res, next) {
    if ((req.user.role || 'user') !== 'admin') {
        return res.status(403).json({ message: 'Administrator access is required' });
    }

    return next();
}

app.post('/register', (req, res) => {
    const { username, nickname, password } = req.body;
    const validationError = validateCredentialsInput({ username, password });
    const normalizedUsername = normalizeUsername(username);
    const normalizedNickname = normalizeNickname(nickname);

    if (validationError) {
        return res.status(422).json({ message: validationError.message });
    }

    if (!normalizedNickname || normalizedNickname.length < 2 || normalizedNickname.length > 40) {
        return res.status(422).json({ message: 'Nickname must be 2-40 characters' });
    }

    if (String(password).length < 4) {
        return res.status(422).json({ message: 'Password must be at least 4 characters' });
    }

    if (findUserByUsername(normalizedUsername)) {
        return res.status(409).json({ message: 'Username is already taken' });
    }

    const user = createUser({
        username: normalizedUsername,
        nickname: normalizedNickname,
        password
    });

    res.status(201).json({
        message: 'Registration submitted. Wait for administrator approval before logging in.',
        user: {
            username: user.username,
            nickname: user.nickname,
            status: user.status
        }
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const validationError = validateCredentialsInput({ username, password });

    if (validationError) {
        return res.status(422).json({ message: validationError.message });
    }

    const user = findUserByUsername(username);

    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ message: 'Invalid username or password' });
    }

    if (user.status === 'pending') {
        return res.status(403).json({ message: 'Account is pending administrator approval' });
    }

    if (user.status === 'rejected') {
        return res.status(403).json({ message: 'Account was rejected by administrator' });
    }

    if (user.status === 'deleted') {
        return res.status(403).json({ message: 'Account was deleted by administrator' });
    }

    if (user.status !== 'active') {
        return res.status(403).json({ message: 'Account is not active' });
    }

    const token = signUserToken(user);

    res.json({
        token,
        nickname: user.nickname,
        role: user.role || 'user',
        status: user.status || 'active'
    });
});

app.get('/admin/users', authenticateHttp, requireAdmin, (req, res) => {
    res.json({ users: listUsersForAdmin() });
});

app.post('/admin/users/:username/approve', authenticateHttp, requireAdmin, (req, res) => {
    const user = approveUser(req.params.username, req.user.username);

    if (!user) {
        return res.status(422).json({ message: 'Unable to approve this user' });
    }

    broadcastOnlineUsers();
    res.json({ user: publicUser(user) });
});

app.post('/admin/users/:username/reject', authenticateHttp, requireAdmin, (req, res) => {
    const user = rejectUser(req.params.username, req.user.username);

    if (!user) {
        return res.status(422).json({ message: 'Unable to reject this user' });
    }

    broadcastOnlineUsers();
    res.json({ user: publicUser(user) });
});

app.post('/admin/users/:username/delete', authenticateHttp, requireAdmin, (req, res) => {
    const user = deleteNormalUser(req.params.username, req.user.username);

    if (!user) {
        return res.status(422).json({ message: 'Unable to delete this account' });
    }

    forceDisconnectUser(user.username);
    broadcastOnlineUsers();
    res.json({ user: publicUser(user) });
});

app.get('/groups', authenticateHttp, (req, res) => {
    res.json({
        groups: listGroupsForUser(req.user.username),
        hidden_groups: listGroupsForUser(req.user.username, { hiddenOnly: true })
    });
});

app.post('/groups', authenticateHttp, (req, res) => {
    const result = createGroup({
        name: req.body.name,
        createdBy: req.user.username,
        members: req.body.members
    });

    if (result.error) {
        return res.status(422).json({ message: result.error });
    }

    result.members.forEach(sendGroupsToUser);
    res.status(201).json({ group: result.group, members: result.members });
});

app.post('/groups/:groupId/hide', authenticateHttp, (req, res) => {
    const group = setGroupHidden({
        groupId: Number(req.params.groupId),
        username: req.user.username,
        hidden: true
    });

    if (!group) {
        return res.status(404).json({ message: 'Group is not available' });
    }

    sendGroupsToUser(req.user.username);
    res.json({ group });
});

app.post('/groups/:groupId/unhide', authenticateHttp, (req, res) => {
    const group = setGroupHidden({
        groupId: Number(req.params.groupId),
        username: req.user.username,
        hidden: false
    });

    if (!group) {
        return res.status(404).json({ message: 'Group is not available' });
    }

    sendGroupsToUser(req.user.username);
    res.json({ group });
});

app.post('/groups/:groupId/delete', authenticateHttp, (req, res) => {
    const result = hardDeleteGroup({
        groupId: Number(req.params.groupId),
        username: req.user.username,
        role: req.user.role
    });

    if (!result) {
        return res.status(403).json({ message: 'Only the group creator or an administrator can delete this group' });
    }

    result.members.forEach((memberUsername) => {
        sendToUser(memberUsername, {
            type: 'group-deleted',
            group_id: result.id,
            name: result.name,
            deleted_by: req.user.username
        });
        sendGroupsToUser(memberUsername);
    });

    res.json({ group: result });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const onlineUsers = new Map();
const disconnectTimers = new Map();

function forceDisconnectUser(username) {
    const client = onlineUsers.get(username);
    if (client && client.readyState === WebSocket.OPEN) {
        client.close(1008, 'Account deleted');
    }
    onlineUsers.delete(username);

    const timer = disconnectTimers.get(username);
    if (timer) {
        clearTimeout(timer);
        disconnectTimers.delete(username);
    }
}

function sendToUser(username, payload) {
    const client = onlineUsers.get(username);

    if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(payload));
    }
}

function sendGroupsToUser(username) {
    sendToUser(username, {
        type: 'groups',
        groups: listGroupsForUser(username)
    });
}

function sendToGroupMembers(groupId, payload) {
    listGroupMemberUsernames(groupId).forEach((memberUsername) => {
        sendToUser(memberUsername, payload);
    });
}

function sendToConversationUsers(message, payload) {
    sendToUser(message.sender, payload);
    if (message.receiver !== message.sender) {
        sendToUser(message.receiver, payload);
    }
}

function broadcastOnlineUsers() {
    const usersList = listUsers().map(user => ({
        username: user.username,
        nickname: user.nickname || user.username,
        online: onlineUsers.has(user.username)
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

wss.on('connection', (ws, req) => {
    const requestUrl = new URL(req.url, 'http://localhost');
    const token = requestUrl.searchParams.get('token');

    if (!token) {
        ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
        ws.close();
        return;
    }

    let payload;
    let user;
    try {
        payload = jwt.verify(token, SECRET_KEY);
        user = findUserByUsername(payload.username);
    } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
        ws.close();
        return;
    }

    if (!user || user.status !== 'active') {
        ws.send(JSON.stringify({ type: 'error', message: 'Account is not active' }));
        ws.close();
        return;
    }

    ws.username = user.username;
    ws.nickname = user.nickname;

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
    broadcastOnlineUsers();
    sendGroupsToUser(ws.username);

    console.log(ws.nickname + ' connected');

    ws.on('message', (rawMsg) => {
        let msgObj;
        const msgStr = rawMsg.toString();
        try {
            msgObj = JSON.parse(msgStr);
        } catch {
            msgObj = { message: msgStr };
        }

        if (msgObj.type === 'history' && msgObj.with) {
            const otherUser = findUserByUsername(msgObj.with);
            if (!otherUser || otherUser.status !== 'active') {
                ws.send(JSON.stringify({ type: 'error', message: 'User is not available' }));
                return;
            }

            const history = loadConversation(ws.username, msgObj.with);
            ws.send(JSON.stringify({
                type: 'history',
                with: msgObj.with,
                messages: history
            }));
            return;
        }

        if (msgObj.type === 'group-history' && msgObj.group_id) {
            const groupId = Number(msgObj.group_id);
            const messages = loadGroupMessages({ groupId, username: ws.username });

            if (!messages) {
                ws.send(JSON.stringify({ type: 'error', message: 'Group is not available' }));
                return;
            }

            ws.send(JSON.stringify({
                type: 'group-history',
                group_id: groupId,
                messages
            }));
            return;
        }

        if (msgObj.type === 'group-chat' && msgObj.group_id) {
            const text = String(msgObj.message || '').trim();
            const groupId = Number(msgObj.group_id);

            if (!text) return;

            const message = saveGroupMessage({
                groupId,
                sender: ws.username,
                message: text
            });

            if (!message) {
                ws.send(JSON.stringify({ type: 'error', message: 'Unable to send group message' }));
                return;
            }

            sendToGroupMembers(groupId, {
                type: 'group-chat',
                id: message.id,
                group_id: message.group_id,
                sender: message.sender,
                sender_nickname: message.sender_nickname,
                message: message.message,
                timestamp: message.timestamp
            });
            return;
        }

        if (msgObj.type === 'edit-group-message') {
            const text = String(msgObj.message || '').trim();
            if (!text) {
                ws.send(JSON.stringify({ type: 'error', message: 'Message cannot be empty' }));
                return;
            }

            const message = updateGroupMessage({
                id: Number(msgObj.id),
                sender: ws.username,
                message: text
            });

            if (!message) {
                ws.send(JSON.stringify({ type: 'error', message: 'Unable to edit this group message' }));
                return;
            }

            sendToGroupMembers(message.group_id, {
                type: 'group-message-edited',
                id: message.id,
                group_id: message.group_id,
                sender: message.sender,
                message: message.message,
                edited_at: message.edited_at
            });
            return;
        }

        if (msgObj.type === 'delete-group-message') {
            const message = softDeleteGroupMessage({
                id: Number(msgObj.id),
                sender: ws.username
            });

            if (!message) {
                ws.send(JSON.stringify({ type: 'error', message: 'Unable to delete this group message' }));
                return;
            }

            sendToGroupMembers(message.group_id, {
                type: 'group-message-deleted',
                id: message.id,
                group_id: message.group_id,
                sender: message.sender
            });
            return;
        }

        if ((msgObj.type === 'group-typing' || msgObj.type === 'group-stop-typing') && msgObj.group_id) {
            const groupId = Number(msgObj.group_id);
            const members = listGroupMemberUsernames(groupId);

            if (!members.includes(ws.username)) {
                ws.send(JSON.stringify({ type: 'error', message: 'Group is not available' }));
                return;
            }

            members.forEach((memberUsername) => {
                if (memberUsername === ws.username) return;
                sendToUser(memberUsername, {
                    type: msgObj.type,
                    group_id: groupId,
                    sender: ws.username,
                    user: ws.nickname
                });
            });
            return;
        }

        if (msgObj.type === 'group-call-start' && msgObj.group_id) {
            const groupId = Number(msgObj.group_id);
            const members = listGroupMemberUsernames(groupId);

            if (!members.includes(ws.username)) {
                ws.send(JSON.stringify({ type: 'error', message: 'Group is not available for a call' }));
                return;
            }

            members.forEach((memberUsername) => {
                if (memberUsername === ws.username) return;
                sendToUser(memberUsername, {
                    type: 'group-call-invite',
                    group_id: groupId,
                    from: ws.username,
                    user: ws.nickname
                });
            });
            return;
        }

        if (msgObj.type === 'group-call-join' && msgObj.group_id) {
            const groupId = Number(msgObj.group_id);
            const members = listGroupMemberUsernames(groupId);

            if (!members.includes(ws.username)) {
                ws.send(JSON.stringify({ type: 'error', message: 'Group is not available for a call' }));
                return;
            }

            members.forEach((memberUsername) => {
                if (memberUsername === ws.username) return;
                sendToUser(memberUsername, {
                    type: 'group-call-join',
                    group_id: groupId,
                    from: ws.username,
                    user: ws.nickname
                });
            });
            return;
        }

        if (['group-call-offer', 'group-call-answer', 'group-ice-candidate'].includes(msgObj.type) && msgObj.group_id && msgObj.to) {
            const groupId = Number(msgObj.group_id);
            const members = listGroupMemberUsernames(groupId);

            if (!members.includes(ws.username) || !members.includes(msgObj.to)) {
                ws.send(JSON.stringify({ type: 'error', message: 'Group call participant is not available' }));
                return;
            }

            sendToUser(msgObj.to, {
                type: msgObj.type,
                group_id: groupId,
                from: ws.username,
                user: ws.nickname,
                offer: msgObj.offer,
                answer: msgObj.answer,
                candidate: msgObj.candidate
            });
            return;
        }

        if (['group-call-hangup', 'group-call-decline'].includes(msgObj.type) && msgObj.group_id) {
            const groupId = Number(msgObj.group_id);
            const members = listGroupMemberUsernames(groupId);

            if (!members.includes(ws.username)) {
                ws.send(JSON.stringify({ type: 'error', message: 'Group is not available for a call' }));
                return;
            }

            members.forEach((memberUsername) => {
                if (memberUsername === ws.username) return;
                sendToUser(memberUsername, {
                    type: msgObj.type,
                    group_id: groupId,
                    from: ws.username,
                    user: ws.nickname
                });
            });
            return;
        }

        if ((msgObj.type === 'typing' || msgObj.type === 'stop-typing') && msgObj.to) {
            sendToUser(msgObj.to, {
                type: msgObj.type,
                sender: ws.username,
                user: ws.nickname,
                to: msgObj.to
            });
            return;
        }

        if (['call-offer', 'call-answer', 'ice-candidate', 'call-hangup', 'call-decline'].includes(msgObj.type) && msgObj.to) {
            const recipient = findUserByUsername(msgObj.to);

            if (!recipient || recipient.status !== 'active') {
                ws.send(JSON.stringify({ type: 'error', message: 'User is not available for a call' }));
                return;
            }

            sendToUser(msgObj.to, {
                type: msgObj.type,
                from: ws.username,
                user: ws.nickname,
                offer: msgObj.offer,
                answer: msgObj.answer,
                candidate: msgObj.candidate
            });
            return;
        }

        if (msgObj.type === 'edit-message') {
            const text = String(msgObj.message || '').trim();
            if (!text) {
                ws.send(JSON.stringify({ type: 'error', message: 'Message cannot be empty' }));
                return;
            }

            const message = updateMessage({
                id: Number(msgObj.id),
                sender: ws.username,
                message: text
            });

            if (!message) {
                ws.send(JSON.stringify({ type: 'error', message: 'Unable to edit this message' }));
                return;
            }

            sendToConversationUsers(message, {
                type: 'message-edited',
                id: message.id,
                sender: message.sender,
                receiver: message.receiver,
                message: message.message,
                edited_at: message.edited_at
            });
            return;
        }

        if (msgObj.type === 'delete-message') {
            const message = softDeleteMessage({
                id: Number(msgObj.id),
                sender: ws.username
            });

            if (!message) {
                ws.send(JSON.stringify({ type: 'error', message: 'Unable to delete this message' }));
                return;
            }

            sendToConversationUsers(message, {
                type: 'message-deleted',
                id: message.id,
                sender: message.sender,
                receiver: message.receiver
            });
            return;
        }

        if (msgObj.to) {
            const recipient = findUserByUsername(msgObj.to);
            const text = String(msgObj.message || '').trim();

            if (!text) return;

            if (!recipient || recipient.status !== 'active') {
                ws.send(JSON.stringify({ type: 'error', message: 'User is not available' }));
                return;
            }

            const message = saveMessage(ws.username, msgObj.to, text);
            sendToConversationUsers(message, {
                type: 'chat',
                id: message.id,
                sender: message.sender,
                user: ws.nickname,
                receiver: message.receiver,
                message: message.message,
                timestamp: message.timestamp,
                edited_at: message.edited_at,
                to: message.receiver
            });
        }
    });

    ws.on('close', () => {
        const current = onlineUsers.get(ws.username);
        if (current !== ws) return;

        const timer = setTimeout(() => {
            const latest = onlineUsers.get(ws.username);
            if (latest === ws) {
                onlineUsers.delete(ws.username);
                broadcastOnlineUsers();
                console.log(ws.nickname + ' disconnected');
            }
            disconnectTimers.delete(ws.username);
        }, 2000);
        disconnectTimers.set(ws.username, timer);
    });
});

server.listen(3000, () => {
    console.log('MessenCharles server running on port 3000');
});
