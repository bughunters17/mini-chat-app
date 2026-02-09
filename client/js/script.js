import { createSocket } from './socket.js';

const chatEl = document.getElementById('chat');
const username = document.getElementById('username').value || 'Anonymous'; // optional for demo
const token = sessionStorage.getItem('token');

// Use singleton WebSocket
const ws = createSocket(token);

// ---------------- WebSocket ----------------
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'chat') {
        const displayName = data.sender;
        addMessage(displayName, data.message, data.sender === username);
    }

    // Load history if sent by server
    if (data.type === 'history') {
        data.messages.forEach(msg => {
            addMessage(msg.sender, msg.message, msg.sender === username);
        });
    }
};

// ---------------- Send Message ----------------
function sendMessage() {
    const msgInput = document.getElementById('message');
    const msg = msgInput.value.trim();
    if (!msg) return;

    // Send as JSON object for private chat (or broadcast if you want)
    ws.send(JSON.stringify({ to: 'ALL', message: msg })); // 'ALL' can be replaced with private username
    msgInput.value = '';
}

// ---------------- Render Message ----------------
function addMessage(user, message, self = false) {
    const div = document.createElement('div');
    div.classList.add('message', self ? 'self' : 'other');
    div.innerHTML = `<strong>${user}</strong>: ${message}`;
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
}

// ---------------- Send on Enter ----------------
document.getElementById('message').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});
