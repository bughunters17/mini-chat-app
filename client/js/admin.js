import { API_BASE_URL } from './config.js';

const token = sessionStorage.getItem('token');
const role = sessionStorage.getItem('auth_role') || 'user';
const usersEl = document.getElementById('admin-users');
const emptyEl = document.getElementById('admin-empty');
const summaryEl = document.getElementById('admin-summary');
const logoutBtn = document.getElementById('logout-btn');

if (!token || role !== 'admin') {
    window.location.href = 'dashboard.html';
}

function authHeaders() {
    return {
        Authorization: 'Bearer ' + token
    };
}

async function requestJson(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            ...authHeaders(),
            ...(options.headers || {})
        }
    });
    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.message || 'Request failed');
    }

    return data;
}

function statusLabel(status) {
    if (status === 'pending') return 'Pending approval';
    if (status === 'rejected') return 'Rejected';
    if (status === 'deleted') return 'Deleted';
    return 'Active';
}

function createUserRow(user) {
    const row = document.createElement('article');
    const dot = document.createElement('span');
    const info = document.createElement('div');
    const name = document.createElement('h3');
    const meta = document.createElement('p');
    const badge = document.createElement('span');
    const actions = document.createElement('div');

    row.className = 'admin-user-row status-' + (user.status || 'active');
    dot.className = 'presence-dot';
    info.className = 'admin-user-info';
    badge.className = 'admin-status';
    actions.className = 'admin-actions';

    name.textContent = user.nickname + ' (' + user.username + ')';
    meta.textContent = (user.role || 'user').toUpperCase() + ' - Created ' + (user.created_at || 'unknown');
    badge.textContent = statusLabel(user.status);

    info.append(name, meta, badge);
    row.append(dot, info, actions);

    if (user.status === 'pending') {
        const approveBtn = document.createElement('button');
        const rejectBtn = document.createElement('button');

        approveBtn.type = 'button';
        rejectBtn.type = 'button';
        approveBtn.className = 'admin-action approve';
        rejectBtn.className = 'admin-action reject';
        approveBtn.textContent = 'Approve';
        rejectBtn.textContent = 'Reject';

        approveBtn.addEventListener('click', () => updateUser(user.username, 'approve'));
        rejectBtn.addEventListener('click', () => updateUser(user.username, 'reject'));
        actions.append(approveBtn, rejectBtn);
    }

    if ((user.role || 'user') !== 'admin') {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-action delete';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => deleteUser(user.username, user.nickname));
        actions.append(deleteBtn);
    }

    return row;
}

function renderUsers(users) {
    usersEl.textContent = '';
    users.forEach((user) => usersEl.appendChild(createUserRow(user)));

    const pendingCount = users.filter((user) => user.status === 'pending').length;
    summaryEl.textContent = users.length + ' users - ' + pendingCount + ' pending approval';
    emptyEl.hidden = users.length > 0;
}

async function loadUsers() {
    try {
        const data = await requestJson(API_BASE_URL + '/admin/users');
        renderUsers(data.users || []);
    } catch (err) {
        summaryEl.textContent = err.message;
        usersEl.textContent = '';
        emptyEl.hidden = true;
    }
}

async function deleteUser(username, nickname) {
    const label = nickname ? nickname + ' (' + username + ')' : username;
    if (!window.confirm('Hard delete normal account ' + label + '? This removes the user and their conversation records.')) return;

    await updateUser(username, 'delete');
}

async function updateUser(username, action) {
    try {
        await requestJson(API_BASE_URL + '/admin/users/' + encodeURIComponent(username) + '/' + action, {
            method: 'POST'
        });
        await loadUsers();
    } catch (err) {
        alert(err.message);
    }
}

function logout() {
    sessionStorage.clear();
    window.location.href = '/';
}

logoutBtn.addEventListener('click', logout);
loadUsers();
