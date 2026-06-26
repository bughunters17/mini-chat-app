import { createSocket } from './socket.js';

const token = sessionStorage.getItem('token');
const username = sessionStorage.getItem('auth_user');
const nickname = sessionStorage.getItem('auth_nickname');
const role = sessionStorage.getItem('auth_role') || 'user';

if (!token || !username) window.location.href = '/';

const ws = createSocket(token);
const usersEl = document.getElementById('online-users');
const usersEmptyEl = document.getElementById('online-empty');
const logoutBtn = document.getElementById('logout-btn');
const adminLink = document.getElementById('admin-link');
const sessionTitleEl = document.getElementById('session-title');
const sessionSubtitleEl = document.getElementById('session-subtitle');
const sessionStatusEl = document.getElementById('session-status');
const sessionEmptyEl = document.getElementById('session-empty');
const messagesEl = document.getElementById('session-messages');
const formEl = document.getElementById('session-form');
const inputEl = document.getElementById('session-message');
const sendBtn = document.getElementById('session-send');
const typingEl = document.getElementById('typing-indicator');
const typingLabelEl = document.getElementById('typing-label');

let usersData = {};
let activeUser = null;
let activeNickname = null;
let isTyping = false;
let stopTypingTimer;
let remoteTypingTimer;

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'error') {
        alert(data.message);
        return;
    }

    if (data.type === 'online-users') {
        renderUsers(data.users);
        refreshSessionHeader();
        return;
    }

    if (data.type === 'history') {
        if (data.with !== activeUser) return;
        messagesEl.textContent = '';
        data.messages.forEach((msg) => {
            addMessage(msg, msg.sender === username);
        });
        updateSessionEmpty();
        return;
    }

    if (data.type === 'typing' && data.sender === activeUser) {
        showTypingIndicator();
        return;
    }

    if (data.type === 'stop-typing' && data.sender === activeUser) {
        hideTypingIndicator();
        return;
    }

    if (data.type === 'message-edited') {
        updateMessage(data.id, data.message, data.edited_at);
        return;
    }

    if (data.type === 'message-deleted') {
        removeMessage(data.id);
        updateSessionEmpty();
        return;
    }

    if (data.type === 'chat') {
        const otherUser = data.sender === username ? data.receiver || data.to : data.sender;
        if (otherUser !== activeUser) return;

        if (data.sender === activeUser) hideTypingIndicator();
        addMessage(data, data.sender === username);
        updateSessionEmpty();
    }
};

function renderUsers(users) {
    usersEl.textContent = '';
    usersData = {};

    users.forEach(({ username: uName, nickname: uNick, online = false }) => {
        if (uName === username) return;

        usersData[uName] = { nickname: uNick || uName, online };

        const row = document.createElement('button');
        const statusDot = document.createElement('span');
        const content = document.createElement('span');
        const name = document.createElement('span');
        const status = document.createElement('span');

        row.type = 'button';
        row.className = 'user-row ' + (online ? 'is-online' : 'is-offline');
        if (uName === activeUser) row.classList.add('is-active');
        statusDot.className = 'presence-dot';
        content.className = 'user-row-content';
        name.className = 'user-name';
        status.className = 'user-status';

        name.textContent = uNick || uName;
        status.textContent = online ? 'Online' : 'Offline - history available';

        content.append(name, status);
        row.append(statusDot, content);
        row.addEventListener('click', () => openSession(uName));
        usersEl.appendChild(row);
    });

    usersEmptyEl.hidden = usersEl.children.length > 0;
}

function shouldUseFullScreenChat() {
    return window.matchMedia('(max-width: 820px)').matches;
}

function openSession(user) {
    if (shouldUseFullScreenChat()) {
        const chatNick = usersData[user]?.nickname || user;
        sessionStorage.setItem('chat_with', user);
        sessionStorage.setItem('chat_with_nick', chatNick);
        window.location.href = 'chat.html';
        return;
    }

    activeUser = user;
    activeNickname = usersData[user]?.nickname || user;
    sessionStorage.setItem('chat_with', activeUser);
    sessionStorage.setItem('chat_with_nick', activeNickname);
    messagesEl.textContent = '';
    hideTypingIndicator();
    refreshSessionHeader();
    updateSessionEmpty();
    inputEl.disabled = false;
    sendBtn.disabled = false;
    inputEl.placeholder = 'Message ' + activeNickname + '...';
    inputEl.focus();

    ws.send(JSON.stringify({ type: 'history', with: activeUser }));
    renderUsers(Object.entries(usersData).map(([uName, data]) => ({
        username: uName,
        nickname: data.nickname,
        online: data.online
    })));
}

function refreshSessionHeader() {
    if (!activeUser) {
        sessionTitleEl.textContent = 'Conversation';
        sessionSubtitleEl.textContent = 'Select a user to view history and start chatting.';
        sessionStatusEl.textContent = 'Session';
        return;
    }

    const user = usersData[activeUser] || { nickname: activeNickname || activeUser, online: false };
    activeNickname = user.nickname;
    sessionTitleEl.textContent = user.nickname;
    sessionSubtitleEl.textContent = user.online ? 'Online now' : 'Offline - history available';
    sessionStatusEl.textContent = user.online ? 'Online' : 'Offline';
}

function updateSessionEmpty() {
    sessionEmptyEl.hidden = !!activeUser && messagesEl.children.length > 0;
    if (!activeUser) {
        sessionEmptyEl.textContent = 'Your selected conversation will open here.';
    } else {
        sessionEmptyEl.textContent = 'No messages yet. Start the conversation.';
    }
}

function sendTypingState(type) {
    if (!activeUser || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, to: activeUser }));
}

function startTyping() {
    if (!isTyping) {
        isTyping = true;
        sendTypingState('typing');
    }

    clearTimeout(stopTypingTimer);
    stopTypingTimer = setTimeout(stopTyping, 1100);
}

function stopTyping() {
    if (!isTyping) return;
    isTyping = false;
    clearTimeout(stopTypingTimer);
    sendTypingState('stop-typing');
}

function showTypingIndicator() {
    typingLabelEl.textContent = (activeNickname || activeUser) + ' is typing';
    typingEl.hidden = false;
    clearTimeout(remoteTypingTimer);
    remoteTypingTimer = setTimeout(hideTypingIndicator, 2200);
}

function hideTypingIndicator() {
    typingEl.hidden = true;
    clearTimeout(remoteTypingTimer);
}

function sendMessage() {
    const msg = inputEl.value.trim();
    if (!activeUser || !msg || ws.readyState !== WebSocket.OPEN) return;

    stopTyping();
    ws.send(JSON.stringify({ to: activeUser, message: msg }));
    inputEl.value = '';
    inputEl.focus();
}

function addMessage(msg, self = false) {
    const div = document.createElement('div');
    const sender = document.createElement('span');
    const text = document.createElement('span');
    const meta = document.createElement('span');

    div.classList.add('message', self ? 'self' : 'other');
    div.dataset.messageId = msg.id;
    sender.className = 'message-user';
    text.className = 'message-text';
    meta.className = 'message-meta';

    sender.textContent = self ? nickname : activeNickname || msg.sender || 'Unknown';
    text.textContent = msg.message || '';
    meta.textContent = msg.edited_at ? 'Edited' : '';

    div.append(sender, text, meta);

    if (self) {
        div.append(createMessageActions(msg));
    }

    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function createMessageActions(msg) {
    const actions = document.createElement('span');
    const editBtn = document.createElement('button');
    const deleteBtn = document.createElement('button');

    actions.className = 'message-actions';
    editBtn.type = 'button';
    deleteBtn.type = 'button';
    editBtn.textContent = 'Edit';
    deleteBtn.textContent = 'Delete';

    editBtn.addEventListener('click', () => editMessage(msg.id));
    deleteBtn.addEventListener('click', () => deleteMessage(msg.id));

    actions.append(editBtn, deleteBtn);
    return actions;
}

function findMessageEl(id) {
    return messagesEl.querySelector('[data-message-id="' + id + '"]');
}

function updateMessage(id, message, editedAt) {
    const messageEl = findMessageEl(id);
    if (!messageEl) return;

    messageEl.querySelector('.message-text').textContent = message;
    messageEl.querySelector('.message-meta').textContent = editedAt ? 'Edited' : '';
}

function removeMessage(id) {
    const messageEl = findMessageEl(id);
    if (messageEl) messageEl.remove();
}

function editMessage(id) {
    const messageEl = findMessageEl(id);
    if (!messageEl || ws.readyState !== WebSocket.OPEN) return;

    const currentText = messageEl.querySelector('.message-text')?.textContent || '';
    const nextText = window.prompt('Edit message', currentText);

    if (nextText === null) return;

    const trimmed = nextText.trim();
    if (!trimmed || trimmed === currentText) return;

    ws.send(JSON.stringify({
        type: 'edit-message',
        id,
        message: trimmed
    }));
}

function deleteMessage(id) {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (!window.confirm('Delete this message?')) return;

    ws.send(JSON.stringify({
        type: 'delete-message',
        id
    }));
}

function logout() {
    stopTyping();
    sessionStorage.clear();
    window.location.href = '/';
}

formEl.addEventListener('submit', (event) => {
    event.preventDefault();
    sendMessage();
});

inputEl.addEventListener('input', () => {
    if (inputEl.value.trim()) {
        startTyping();
        return;
    }

    stopTyping();
});

inputEl.addEventListener('blur', stopTyping);
if (adminLink && role === 'admin') {
    adminLink.hidden = false;
}

logoutBtn.addEventListener('click', logout);
updateSessionEmpty();
