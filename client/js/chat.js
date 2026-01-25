import { createSocket } from './socket';

const token = sessionStorage.getItem('token');
const username = sessionStorage.getItem('auth_user');
const nickname = sessionStorage.getItem('auth_nickname');

const chatWithUser = sessionStorage.getItem('chat_with');       // username
const chatWithNickname = sessionStorage.getItem('chat_with_nick'); // nickname

if (!token || !username || !chatWithUser) {
    window.location.href = '/dashboard.html';
}

const ws = createSocket(token);
const chatEl = document.getElementById('chat');
const headerEl = document.querySelector('.chat-header');

// Header shows who you are chatting with
headerEl.innerHTML = `💬 Chat with ${chatWithNickname} <button id="logoutBtn" class="logout-btn">Close</button>`;

// ---------------- WebSocket ----------------
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'error') {
        alert(data.message);
        sessionStorage.clear();
        window.location.href = '/dashboard.html';
        return;
    }

    // Load recent chat history
    if (data.type === 'history') {
        data.messages.forEach(msg => {
            if ((msg.sender === chatWithUser && msg.receiver === username) || 
                (msg.sender === username && msg.receiver === chatWithUser)) {
                const displayName = msg.sender === username ? nickname : chatWithNickname;
                addMessage(displayName, msg.message, msg.sender === username);
            }
        });
    }

    if (data.type === 'chat') {
        // Only show messages between you and the current chat user
        if (data.sender === chatWithUser || data.sender === username) {
            const displayName = data.sender === username ? nickname : chatWithNickname;
            addMessage(displayName, data.message, data.sender === username);
        }
    }
};

// ---------------- Functions ----------------
function sendMessage() {
    const input = document.getElementById('message');
    const msg = input.value.trim();
    if (!msg) return;

    // Send as { to, message } for private chat
    ws.send(JSON.stringify({ to: chatWithUser, message: msg }));

    input.value = '';
}

function addMessage(user, message, self = false) {
    const div = document.createElement('div');
    div.classList.add('message', self ? 'self' : 'other');
    div.innerHTML = `<strong>${user}</strong>: ${message}`;
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
}

// ---------------- Close Chat ----------------
document.getElementById('logoutBtn').onclick = () => {
    sessionStorage.removeItem('chat_with');
    sessionStorage.removeItem('chat_with_nick');
    window.location.href = '/dashboard.html';
};
