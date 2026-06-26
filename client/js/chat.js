import { createSocket } from './socket.js';

const token = sessionStorage.getItem('token');
const username = sessionStorage.getItem('auth_user');
const nickname = sessionStorage.getItem('auth_nickname');
const chatWithUser = sessionStorage.getItem('chat_with');
const chatWithNickname = sessionStorage.getItem('chat_with_nick');

if (!token || !username || !chatWithUser) {
    window.location.href = '/dashboard.html';
}

const ws = createSocket(token);
const chatEl = document.getElementById('chat');
const titleEl = document.querySelector('.chat-title');
const subtitleEl = document.querySelector('.chat-subtitle');
const formEl = document.getElementById('chat-form');
const inputEl = document.getElementById('message');
const sendBtn = document.getElementById('send-btn');
const closeBtn = document.getElementById('logoutBtn');
const typingEl = document.getElementById('typing-indicator');
const typingLabelEl = document.getElementById('typing-label');

let isTyping = false;
let stopTypingTimer;
let remoteTypingTimer;

if (titleEl) titleEl.textContent = chatWithNickname || chatWithUser;
if (subtitleEl) subtitleEl.textContent = `Private chat as ${nickname || username}`;

sendBtn.disabled = true;

ws.addEventListener('open', () => {
    sendBtn.disabled = false;
    ws.send(JSON.stringify({ type: 'history', with: chatWithUser }));
});

ws.addEventListener('close', () => {
    sendBtn.disabled = true;
    stopTyping();
    hideTypingIndicator();
});

ws.addEventListener('error', () => {
    sendBtn.disabled = true;
});

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'error') {
        alert(data.message);
        return;
    }

    if (data.type === 'history') {
        chatEl.textContent = '';
        data.messages.forEach((msg) => {
            if ((msg.sender === chatWithUser && msg.receiver === username) ||
                (msg.sender === username && msg.receiver === chatWithUser)) {
                const displayName = msg.sender === username ? nickname : chatWithNickname;
                addMessage(msg, displayName, msg.sender === username);
            }
        });
        return;
    }

    if (data.type === 'typing' && data.sender === chatWithUser) {
        showTypingIndicator();
        return;
    }

    if (data.type === 'stop-typing' && data.sender === chatWithUser) {
        hideTypingIndicator();
        return;
    }

    if (data.type === 'message-edited') {
        updateMessage(data.id, data.message, data.edited_at);
        return;
    }

    if (data.type === 'message-deleted') {
        removeMessage(data.id);
        return;
    }

    if (data.type === 'chat') {
        if (data.sender === chatWithUser || data.sender === username) {
            const displayName = data.sender === username ? nickname : chatWithNickname;
            if (data.sender === chatWithUser) hideTypingIndicator();
            addMessage(data, displayName, data.sender === username);
        }
    }
};

function sendTypingState(type) {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, to: chatWithUser }));
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
    typingLabelEl.textContent = `${chatWithNickname || chatWithUser} is typing`;
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
    if (!msg || ws.readyState !== WebSocket.OPEN) return;

    stopTyping();
    ws.send(JSON.stringify({ to: chatWithUser, message: msg }));
    inputEl.value = '';
    inputEl.focus();
}

function addMessage(msg, user, self = false) {
    const div = document.createElement('div');
    const sender = document.createElement('span');
    const text = document.createElement('span');
    const meta = document.createElement('span');

    div.classList.add('message', self ? 'self' : 'other');
    div.dataset.messageId = msg.id;
    sender.className = 'message-user';
    text.className = 'message-text';
    meta.className = 'message-meta';

    sender.textContent = user || 'Unknown';
    text.textContent = msg.message || '';
    meta.textContent = msg.edited_at ? 'Edited' : '';

    div.append(sender, text, meta);

    if (self) {
        div.append(createMessageActions(msg));
    }

    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
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
    return chatEl.querySelector(`[data-message-id="${id}"]`);
}

function updateMessage(id, message, editedAt) {
    const messageEl = findMessageEl(id);
    if (!messageEl) return;

    const textEl = messageEl.querySelector('.message-text');
    const metaEl = messageEl.querySelector('.message-meta');

    textEl.textContent = message;
    metaEl.textContent = editedAt ? 'Edited' : '';
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

closeBtn.addEventListener('click', () => {
    stopTyping();
    sessionStorage.removeItem('chat_with');
    sessionStorage.removeItem('chat_with_nick');
    window.location.href = '/dashboard.html';
});
