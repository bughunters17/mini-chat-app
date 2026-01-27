import { createSocket } from './socket.js';
const token = sessionStorage.getItem('token');
const username = sessionStorage.getItem('auth_user');
const nickname = sessionStorage.getItem('auth_nickname');

if (!token || !username) window.location.href = '/';

const ws = createSocket(token);
const onlineEl = document.getElementById('online-users');
const recentEl = document.getElementById('recent-chats');

let recentChats = {};
let onlineUsersData = {}; // username -> nickname mapping

// ---------------- WebSocket ----------------
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'error') {
        alert(data.message);
        sessionStorage.clear();
        window.location.href = '/';
        return;
    }

    if (data.type === 'online-users') renderOnlineUsers(data.users);
    if (data.type === 'chat') {
        // Only display messages that involve this user
        const otherUser = data.sender === username ? data.to : data.sender;
        if (!otherUser) return;

        recentChats[otherUser] = data.message;
        renderRecentChats();
    }
};

// ---------------- Functions ----------------
function renderOnlineUsers(users) {
    onlineEl.innerHTML = '';
    onlineUsersData = {}; // reset

    users.forEach(({ username: uName, nickname: uNick }) => {
        if (uName === username) return; // exclude yourself

        onlineUsersData[uName] = uNick;

        const div = document.createElement('div');
        div.textContent = uNick; // show nickname
        div.onclick = () => openChat(uName);
        onlineEl.appendChild(div);
    });
}

function renderRecentChats() {
    recentEl.innerHTML = '';
    Object.keys(recentChats).forEach(user => {
        const userNick = onlineUsersData[user] || user;
        const div = document.createElement('div');
        div.textContent = `${userNick}: ${recentChats[user]}`;
        div.onclick = () => openChat(user);
        recentEl.appendChild(div);
    });
}

function openChat(user) {
    const chatNick = onlineUsersData[user] || user;
    sessionStorage.setItem('chat_with', user);
    sessionStorage.setItem('chat_with_nick', chatNick);
    window.location.href = 'chat.html';
}

function logout() {
    sessionStorage.clear();
    window.location.href = '/';
}
