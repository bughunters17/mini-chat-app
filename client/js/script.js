import { createSocket } from './socket.js';

const chatEl = document.getElementById('chat');
const usernameInput = document.getElementById('username');
const token = sessionStorage.getItem('token');
const username = usernameInput?.value || 'Anonymous';

if (chatEl && token) {
    const ws = createSocket(token);

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'chat') {
            addMessage(data.sender, data.message, data.sender === username);
        }

        if (data.type === 'history') {
            data.messages.forEach((msg) => {
                addMessage(msg.sender, msg.message, msg.sender === username);
            });
        }
    };
}

function addMessage(user, message, self = false) {
    const div = document.createElement('div');
    const sender = document.createElement('span');
    const text = document.createElement('span');

    div.classList.add('message', self ? 'self' : 'other');
    sender.className = 'message-user';
    text.className = 'message-text';

    sender.textContent = user || 'Unknown';
    text.textContent = message || '';

    div.append(sender, text);
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
}
