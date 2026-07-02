import { createSocket } from './socket.js';
import { API_BASE_URL } from './config.js';

const token = sessionStorage.getItem('token');
const username = sessionStorage.getItem('auth_user');
const nickname = sessionStorage.getItem('auth_nickname');
const role = sessionStorage.getItem('auth_role') || 'user';

if (!token || !username) window.location.href = '/';

const ws = createSocket(token);
const usersEl = document.getElementById('online-users');
const usersEmptyEl = document.getElementById('online-empty');
const groupsEl = document.getElementById('group-list');
const groupsEmptyEl = document.getElementById('group-empty');
const hiddenGroupsPanelEl = document.getElementById('hidden-groups-panel');
const hiddenGroupsEl = document.getElementById('hidden-group-list');
const hiddenGroupsEmptyEl = document.getElementById('hidden-group-empty');
const newGroupBtn = document.getElementById('new-group-btn');
const toggleHiddenGroupsBtn = document.getElementById('toggle-hidden-groups');
const logoutBtn = document.getElementById('logout-btn');
const adminLink = document.getElementById('admin-link');
const sessionTitleEl = document.getElementById('session-title');
const sessionSubtitleEl = document.getElementById('session-subtitle');
const sessionStatusEl = document.getElementById('session-status');
const sessionVideoCallBtn = document.getElementById('session-video-call');
const sessionEmptyEl = document.getElementById('session-empty');
const messagesEl = document.getElementById('session-messages');
const formEl = document.getElementById('session-form');
const inputEl = document.getElementById('session-message');
const sendBtn = document.getElementById('session-send');
const typingEl = document.getElementById('typing-indicator');
const typingLabelEl = document.getElementById('typing-label');
const groupCallPanel = document.getElementById('group-call-panel');
const groupCallStatusEl = document.getElementById('group-call-status');
const groupAcceptCallBtn = document.getElementById('group-accept-call');
const groupDeclineCallBtn = document.getElementById('group-decline-call');
const groupHangupCallBtn = document.getElementById('group-hangup-call');
const groupTogglePipBtn = document.getElementById('group-toggle-pip');
const groupToggleCameraBtn = document.getElementById('group-toggle-camera');
const groupToggleMicBtn = document.getElementById('group-toggle-mic');
const groupLocalVideo = document.getElementById('group-local-video');
const groupRemoteVideosEl = document.getElementById('group-remote-videos');

let usersData = {};
let groupsData = {};
let hiddenGroupsData = {};
let showHiddenGroups = false;
let activeMode = null;
let activeUser = null;
let activeGroupId = null;
let activeNickname = null;
let isTyping = false;
let stopTypingTimer;
let remoteTypingTimer;
let unreadDirect = {};
let unreadGroups = {};
let groupCallActive = false;
let groupCallGroupId = null;
let pendingGroupCall = null;
let groupCallStream = null;
let groupCameraEnabled = true;
let groupMicEnabled = true;
let groupCallPeers = new Map();
const groupRtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

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

    if (data.type === 'groups') {
        renderGroups(data.groups || []);
        loadGroups().catch(() => {});
        refreshSessionHeader();
        return;
    }

    if (data.type === 'history') {
        if (activeMode !== 'direct' || data.with !== activeUser) return;
        messagesEl.textContent = '';
        data.messages.forEach((msg) => {
            addMessage(msg, msg.sender === username, { mode: 'direct' });
        });
        updateSessionEmpty();
        return;
    }

    if (data.type === 'group-history') {
        if (activeMode !== 'group' || Number(data.group_id) !== Number(activeGroupId)) return;
        messagesEl.textContent = '';
        data.messages.forEach((msg) => {
            addGroupMessage(msg, msg.sender === username);
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

    if (data.type === 'group-typing') {
        if (activeMode !== 'group' || Number(data.group_id) !== Number(activeGroupId) || data.sender === username) return;
        showTypingIndicator((data.user || data.sender) + ' is typing');
        return;
    }

    if (data.type === 'group-stop-typing') {
        if (activeMode !== 'group' || Number(data.group_id) !== Number(activeGroupId) || data.sender === username) return;
        hideTypingIndicator();
        return;
    }

    if (data.type === 'message-edited') {
        updateMessage(data.id, data.message, data.edited_at, 'direct');
        return;
    }

    if (data.type === 'message-deleted') {
        removeMessage(data.id, 'direct');
        updateSessionEmpty();
        return;
    }

    if (data.type === 'group-message-edited') {
        if (activeMode !== 'group' || Number(data.group_id) !== Number(activeGroupId)) return;
        updateMessage(data.id, data.message, data.edited_at, 'group');
        return;
    }

    if (data.type === 'group-message-deleted') {
        if (activeMode !== 'group' || Number(data.group_id) !== Number(activeGroupId)) return;
        removeMessage(data.id, 'group');
        updateSessionEmpty();
        return;
    }

    if (data.type === 'group-deleted') {
        clearActiveSessionIfGroup(data.group_id);
        loadGroups().catch(() => {});
        return;
    }

    if (data.type === 'chat') {
        const otherUser = data.sender === username ? data.receiver || data.to : data.sender;
        if (activeMode !== 'direct' || otherUser !== activeUser) {
            if (data.sender !== username) incrementDirectUnread(otherUser);
            return;
        }

        if (data.sender === activeUser) hideTypingIndicator();
        addMessage(data, data.sender === username, { mode: 'direct' });
        updateSessionEmpty();
        return;
    }

    if (data.type === 'group-call-invite') {
        handleGroupCallInvite(data);
        return;
    }

    if (data.type === 'group-call-join') {
        handleGroupCallJoin(data);
        return;
    }

    if (data.type === 'group-call-offer') {
        handleGroupCallOffer(data);
        return;
    }

    if (data.type === 'group-call-answer') {
        handleGroupCallAnswer(data);
        return;
    }

    if (data.type === 'group-ice-candidate') {
        handleGroupIceCandidate(data);
        return;
    }

    if (data.type === 'group-call-hangup') {
        handleGroupCallHangup(data);
        return;
    }

    if (data.type === 'group-call-decline') {
        handleGroupCallDecline(data);
        return;
    }

    if (data.type === 'group-chat') {
        const groupId = Number(data.group_id);
        if (activeMode !== 'group' || groupId !== Number(activeGroupId)) {
            if (data.sender !== username) incrementGroupUnread(groupId);
            return;
        }

        if (data.sender !== username) hideTypingIndicator();
        addGroupMessage(data, data.sender === username);
        updateSessionEmpty();
    }
};

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
    };
}

async function requestJson(path, options = {}) {
    const response = await fetch(API_BASE_URL + path, {
        ...options,
        headers: {
            ...authHeaders(),
            ...(options.headers || {})
        }
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || 'Request failed');
    }

    return data;
}

async function loadGroups() {
    const data = await requestJson('/groups');
    renderGroups(data.groups || []);
    renderHiddenGroups(data.hidden_groups || []);
}

function unreadLabel(count) {
    return count > 99 ? '99+' : String(count);
}

function renderUsersFromState() {
    renderUsers(Object.entries(usersData).map(([uName, data]) => ({
        username: uName,
        nickname: data.nickname,
        online: data.online
    })));
}

function renderGroupsFromState() {
    renderGroups(Object.values(groupsData));
    if (showHiddenGroups) renderHiddenGroups(Object.values(hiddenGroupsData));
}

function incrementDirectUnread(user) {
    if (!user || user === username) return;
    unreadDirect[user] = (unreadDirect[user] || 0) + 1;
    renderUsersFromState();
}

function incrementGroupUnread(groupId) {
    if (!groupId) return;
    unreadGroups[groupId] = (unreadGroups[groupId] || 0) + 1;
    renderGroupsFromState();
}

function clearDirectUnread(user) {
    if (!user || !unreadDirect[user]) return;
    unreadDirect[user] = 0;
}

function clearGroupUnread(groupId) {
    if (!groupId || !unreadGroups[groupId]) return;
    unreadGroups[groupId] = 0;
}

function createUnreadBadge(count) {
    const badge = document.createElement('span');
    badge.className = 'unread-badge';
    badge.textContent = unreadLabel(count || 0);
    badge.hidden = !count;
    return badge;
}

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
        const badge = createUnreadBadge(unreadDirect[uName] || 0);

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
        row.append(statusDot, content, badge);
        row.addEventListener('click', () => openSession(uName));
        usersEl.appendChild(row);
    });

    usersEmptyEl.hidden = usersEl.children.length > 0;
}

function renderGroups(groups) {
    groupsEl.textContent = '';
    groupsData = {};

    groups.forEach((group) => {
        groupsData[group.id] = group;
        groupsEl.appendChild(createGroupRow(group, false));
    });

    groupsEmptyEl.hidden = groupsEl.children.length > 0;
}

function renderHiddenGroups(groups) {
    hiddenGroupsEl.textContent = '';
    hiddenGroupsData = {};

    groups.forEach((group) => {
        hiddenGroupsData[group.id] = group;
        hiddenGroupsEl.appendChild(createGroupRow(group, true));
    });

    hiddenGroupsEmptyEl.hidden = hiddenGroupsEl.children.length > 0;
}

function createGroupRow(group, hidden) {
    const row = document.createElement('div');
    const icon = document.createElement('span');
    const content = document.createElement('span');
    const name = document.createElement('span');
    const status = document.createElement('span');
    const actions = document.createElement('span');
    const visibilityAction = document.createElement('button');
    const badge = createUnreadBadge(unreadGroups[group.id] || 0);

    row.className = 'user-row group-row';
    row.setAttribute('role', 'button');
    row.tabIndex = hidden ? -1 : 0;
    if (!hidden && activeMode === 'group' && Number(group.id) === Number(activeGroupId)) {
        row.classList.add('is-active');
    }

    icon.className = hidden ? 'presence-dot hidden-dot' : 'presence-dot group-dot';
    content.className = 'user-row-content';
    name.className = 'user-name';
    status.className = 'user-status';
    actions.className = 'group-row-actions';
    visibilityAction.type = 'button';
    visibilityAction.className = hidden ? 'group-row-action unhide' : 'group-row-action';
    visibilityAction.textContent = hidden ? 'Unhide' : 'Hide';

    name.textContent = group.name;
    status.textContent = (group.member_count || 0) + ' members';

    content.append(name, status);
    actions.append(visibilityAction);

    if (!hidden && (group.created_by === username || role === 'admin')) {
        const deleteAction = document.createElement('button');
        deleteAction.type = 'button';
        deleteAction.className = 'group-row-action delete';
        deleteAction.textContent = 'Delete';
        deleteAction.addEventListener('click', (event) => {
            event.stopPropagation();
            deleteGroup(group.id, group.name);
        });
        actions.append(deleteAction);
    }

    row.append(icon, content, badge, actions);
    row.addEventListener('click', () => {
        if (!hidden) openGroupSession(group.id);
    });
    row.addEventListener('keydown', (event) => {
        if (hidden || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        openGroupSession(group.id);
    });
    visibilityAction.addEventListener('click', (event) => {
        event.stopPropagation();
        if (hidden) {
            unhideGroup(group.id);
        } else {
            hideGroup(group.id);
        }
    });

    return row;
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

    clearDirectUnread(user);
    activeMode = 'direct';
    activeUser = user;
    activeGroupId = null;
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
    renderGroups(Object.values(groupsData));
}

function openGroupSession(groupId) {
    const group = groupsData[groupId];
    if (!group) return;

    clearGroupUnread(groupId);
    activeMode = 'group';
    activeUser = null;
    activeGroupId = Number(groupId);
    activeNickname = group.name;
    messagesEl.textContent = '';
    hideTypingIndicator();
    refreshSessionHeader();
    updateSessionEmpty();
    inputEl.disabled = false;
    sendBtn.disabled = false;
    inputEl.placeholder = 'Message ' + group.name + '...';
    inputEl.focus();

    ws.send(JSON.stringify({ type: 'group-history', group_id: activeGroupId }));
    renderUsers(Object.entries(usersData).map(([uName, data]) => ({
        username: uName,
        nickname: data.nickname,
        online: data.online
    })));
    renderGroups(Object.values(groupsData));
}

function clearActiveSessionIfGroup(groupId) {
    if (activeMode !== 'group' || Number(activeGroupId) !== Number(groupId)) return;

    activeMode = null;
    activeGroupId = null;
    activeNickname = null;
    messagesEl.textContent = '';
    inputEl.disabled = true;
    sendBtn.disabled = true;
    inputEl.placeholder = 'Select a user or group first...';
    refreshSessionHeader();
    updateSessionEmpty();
}

function refreshSessionHeader() {
    if (!activeMode) {
        sessionTitleEl.textContent = 'Conversation';
        sessionSubtitleEl.textContent = 'Select a user or group to view history and start chatting.';
        sessionStatusEl.textContent = 'Session';
        sessionVideoCallBtn.hidden = true;
        return;
    }

    if (activeMode === 'group') {
        const group = groupsData[activeGroupId] || { name: activeNickname || 'Group', member_count: 0 };
        activeNickname = group.name;
        sessionTitleEl.textContent = group.name;
        sessionSubtitleEl.textContent = 'Group chat';
        sessionStatusEl.textContent = (group.member_count || 0) + ' members';
        sessionVideoCallBtn.textContent = 'Video';
        sessionVideoCallBtn.hidden = false;
        return;
    }

    const user = usersData[activeUser] || { nickname: activeNickname || activeUser, online: false };
    activeNickname = user.nickname;
    sessionTitleEl.textContent = user.nickname;
    sessionSubtitleEl.textContent = user.online ? 'Online now' : 'Offline - history available';
    sessionStatusEl.textContent = user.online ? 'Online' : 'Offline';
    sessionVideoCallBtn.textContent = 'Video';
    sessionVideoCallBtn.hidden = false;
}

function updateSessionEmpty() {
    sessionEmptyEl.hidden = !!activeMode && messagesEl.children.length > 0;
    if (!activeMode) {
        sessionEmptyEl.textContent = 'Your selected conversation will open here.';
    } else {
        sessionEmptyEl.textContent = 'No messages yet. Start the conversation.';
    }
}

function sendTypingState(type) {
    if (ws.readyState !== WebSocket.OPEN) return;

    if (activeMode === 'direct' && activeUser) {
        ws.send(JSON.stringify({ type, to: activeUser }));
        return;
    }

    if (activeMode === 'group' && activeGroupId) {
        ws.send(JSON.stringify({
            type: type === 'typing' ? 'group-typing' : 'group-stop-typing',
            group_id: activeGroupId
        }));
    }
}

function startTyping() {
    if (!activeMode) return;

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

function showTypingIndicator(label) {
    typingLabelEl.textContent = label || ((activeNickname || activeUser) + ' is typing');
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
    if (!activeMode || !msg || ws.readyState !== WebSocket.OPEN) return;

    stopTyping();
    if (activeMode === 'group') {
        ws.send(JSON.stringify({ type: 'group-chat', group_id: activeGroupId, message: msg }));
    } else {
        ws.send(JSON.stringify({ to: activeUser, message: msg }));
    }
    inputEl.value = '';
    inputEl.focus();
}

function addGroupMessage(msg, self = false) {
    addMessage(msg, self, { mode: 'group' });
}

function addMessage(msg, self = false, options = {}) {
    const mode = options.mode || activeMode || 'direct';
    const div = document.createElement('div');
    const sender = document.createElement('span');
    const text = document.createElement('span');
    const meta = document.createElement('span');

    div.classList.add('message', self ? 'self' : 'other');
    div.dataset.messageId = msg.id;
    div.dataset.messageMode = mode;
    sender.className = 'message-user';
    text.className = 'message-text';
    meta.className = 'message-meta';

    if (self) {
        sender.textContent = nickname || username;
    } else if (mode === 'group') {
        sender.textContent = msg.sender_nickname || msg.sender || 'Unknown';
    } else {
        sender.textContent = activeNickname || msg.sender || 'Unknown';
    }

    text.textContent = msg.message || '';
    meta.textContent = msg.edited_at ? 'Edited' : '';

    div.append(sender, text, meta);

    if (self) {
        div.append(createMessageActions(msg, mode));
    }

    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function createMessageActions(msg, mode) {
    const actions = document.createElement('span');
    const editBtn = document.createElement('button');
    const deleteBtn = document.createElement('button');

    actions.className = 'message-actions';
    editBtn.type = 'button';
    deleteBtn.type = 'button';
    editBtn.textContent = 'Edit';
    deleteBtn.textContent = 'Delete';

    editBtn.addEventListener('click', () => editMessage(msg.id, mode));
    deleteBtn.addEventListener('click', () => deleteMessage(msg.id, mode));

    actions.append(editBtn, deleteBtn);
    return actions;
}

function findMessageEl(id, mode) {
    return messagesEl.querySelector('[data-message-id="' + id + '"][data-message-mode="' + mode + '"]');
}

function updateMessage(id, message, editedAt, mode) {
    const messageEl = findMessageEl(id, mode);
    if (!messageEl) return;

    messageEl.querySelector('.message-text').textContent = message;
    messageEl.querySelector('.message-meta').textContent = editedAt ? 'Edited' : '';
}

function removeMessage(id, mode) {
    const messageEl = findMessageEl(id, mode);
    if (messageEl) messageEl.remove();
}

function editMessage(id, mode) {
    const messageEl = findMessageEl(id, mode);
    if (!messageEl || ws.readyState !== WebSocket.OPEN) return;

    const currentText = messageEl.querySelector('.message-text')?.textContent || '';
    const nextText = window.prompt('Edit message', currentText);

    if (nextText === null) return;

    const trimmed = nextText.trim();
    if (!trimmed || trimmed === currentText) return;

    ws.send(JSON.stringify({
        type: mode === 'group' ? 'edit-group-message' : 'edit-message',
        id,
        message: trimmed
    }));
}

function deleteMessage(id, mode) {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (!window.confirm('Delete this message?')) return;

    ws.send(JSON.stringify({
        type: mode === 'group' ? 'delete-group-message' : 'delete-message',
        id
    }));
}

async function createCustomGroup() {
    const groupName = window.prompt('Group chat name');
    if (groupName === null) return;

    const trimmedName = groupName.trim();
    if (!trimmedName) return;

    const availableUsers = Object.keys(usersData);
    const memberHelp = availableUsers.length
        ? 'Available users: ' + availableUsers.join(', ')
        : 'No other active users are loaded yet.';
    const memberInput = window.prompt(memberHelp + '\\nEnter member usernames separated by comma.');
    if (memberInput === null) return;

    const members = memberInput
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

    try {
        const data = await requestJson('/groups', {
            method: 'POST',
            body: JSON.stringify({ name: trimmedName, members })
        });
        await loadGroups();
        if (data.group?.id) openGroupSession(data.group.id);
    } catch (error) {
        alert(error.message);
    }
}

async function hideGroup(groupId) {
    try {
        await requestJson('/groups/' + groupId + '/hide', { method: 'POST' });
        clearActiveSessionIfGroup(groupId);
        await loadGroups();
    } catch (error) {
        alert(error.message);
    }
}

async function unhideGroup(groupId) {
    try {
        await requestJson('/groups/' + groupId + '/unhide', { method: 'POST' });
        await loadGroups();
    } catch (error) {
        alert(error.message);
    }
}

async function deleteGroup(groupId, groupName) {
    const confirmed = window.confirm('Hard delete "' + groupName + '"? This will permanently remove the group and all group messages.');
    if (!confirmed) return;

    try {
        await requestJson('/groups/' + groupId + '/delete', { method: 'POST' });
        clearActiveSessionIfGroup(groupId);
        await loadGroups();
    } catch (error) {
        alert(error.message);
    }
}

function showGroupCallPanel(status) {
    groupCallPanel.hidden = false;
    groupCallStatusEl.textContent = status;
}

function setGroupIncomingMode(enabled) {
    groupAcceptCallBtn.hidden = !enabled;
    groupDeclineCallBtn.hidden = !enabled;
    groupHangupCallBtn.hidden = enabled;
}

function activeCallGroupMatches(groupId) {
    return Number(groupId) === Number(groupCallGroupId || activeGroupId);
}

function applyGroupMediaToggleState() {
    if (groupCallStream) {
        groupCallStream.getVideoTracks().forEach((track) => {
            track.enabled = groupCameraEnabled;
        });
        groupCallStream.getAudioTracks().forEach((track) => {
            track.enabled = groupMicEnabled;
        });
    }

    groupToggleCameraBtn.textContent = groupCameraEnabled ? 'Camera Off' : 'Camera On';
    groupToggleMicBtn.textContent = groupMicEnabled ? 'Mute' : 'Unmute';
    groupToggleCameraBtn.classList.toggle('is-off', !groupCameraEnabled);
    groupToggleMicBtn.classList.toggle('is-off', !groupMicEnabled);
}

function toggleGroupCamera() {
    groupCameraEnabled = !groupCameraEnabled;
    applyGroupMediaToggleState();
}

function toggleGroupMic() {
    groupMicEnabled = !groupMicEnabled;
    applyGroupMediaToggleState();
}

function getGroupPipVideo() {
    const remoteVideos = Array.from(groupRemoteVideosEl.querySelectorAll('video'));
    const remoteVideo = remoteVideos.find((video) => video.srcObject && video.readyState >= 1);
    if (remoteVideo) return remoteVideo;
    if (groupLocalVideo.srcObject && groupLocalVideo.readyState >= 1) return groupLocalVideo;
    return null;
}

async function toggleGroupPictureInPicture() {
    if (!document.pictureInPictureEnabled) {
        alert('Picture-in-Picture is not supported in this browser.');
        return;
    }

    try {
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
            return;
        }

        const video = getGroupPipVideo();
        if (!video) {
            alert('No active group video is ready to pop out yet.');
            return;
        }

        await video.requestPictureInPicture();
    } catch {
        alert('Unable to open Picture-in-Picture. Start or accept a group video call first.');
    }
}

function handleGroupPipShortcut(event) {
    if (!event.altKey || event.key.toLowerCase() !== 'p') return;
    if (activeMode !== 'group' && !groupCallActive) return;
    event.preventDefault();
    toggleGroupPictureInPicture();
}

function sendGroupCallSignal(payload) {
    const groupId = groupCallGroupId || activeGroupId;
    if (ws.readyState !== WebSocket.OPEN || !groupId) return;
    ws.send(JSON.stringify({ ...payload, group_id: groupId }));
}

async function ensureGroupCallStream() {
    if (groupCallStream) return groupCallStream;

    groupCallStream = await navigator.mediaDevices.getUserMedia({
        video: {
            width: { ideal: 640, max: 960 },
            height: { ideal: 360, max: 540 },
            frameRate: { ideal: 18, max: 24 }
        },
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        }
    });
    groupLocalVideo.srcObject = groupCallStream;
    applyGroupMediaToggleState();
    groupTogglePipBtn.hidden = false;
    groupToggleCameraBtn.hidden = false;
    groupToggleMicBtn.hidden = false;
    return groupCallStream;
}

function getGroupPeer(remoteUser, remoteName) {
    if (groupCallPeers.has(remoteUser)) return groupCallPeers.get(remoteUser);

    const state = {
        peer: new RTCPeerConnection(groupRtcConfig),
        pendingIce: [],
        remoteName: remoteName || remoteUser
    };

    state.peer.ontrack = (event) => {
        addGroupRemoteVideo(remoteUser, state.remoteName, event.streams[0]);
        showGroupCallPanel('Connected to group call');
    };

    state.peer.onicecandidate = (event) => {
        if (!event.candidate) return;
        sendGroupCallSignal({
            type: 'group-ice-candidate',
            to: remoteUser,
            candidate: event.candidate
        });
    };

    state.peer.onconnectionstatechange = () => {
        if (['failed', 'closed', 'disconnected'].includes(state.peer.connectionState)) {
            removeGroupPeer(remoteUser);
        }
    };

    if (groupCallStream) {
        groupCallStream.getTracks().forEach((track) => {
            state.peer.addTrack(track, groupCallStream);
        });
    }

    groupCallPeers.set(remoteUser, state);
    return state;
}

async function flushGroupIce(remoteUser) {
    const state = groupCallPeers.get(remoteUser);
    if (!state || !state.peer.remoteDescription) return;

    const candidates = state.pendingIce;
    state.pendingIce = [];

    for (const candidate of candidates) {
        try {
            await state.peer.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
            // Ignore candidates that arrive after a peer disconnects.
        }
    }
}

function addGroupRemoteVideo(remoteUser, label, stream) {
    let tile = groupRemoteVideosEl.querySelector('[data-remote-user="' + remoteUser + '"]');

    if (!tile) {
        tile = document.createElement('div');
        const video = document.createElement('video');
        const name = document.createElement('span');

        tile.className = 'group-remote-tile';
        tile.dataset.remoteUser = remoteUser;
        video.className = 'group-remote-video';
        video.autoplay = true;
        video.playsInline = true;
        name.className = 'group-remote-label';
        name.textContent = label || remoteUser;

        tile.append(video, name);
        groupRemoteVideosEl.appendChild(tile);
    }

    tile.querySelector('video').srcObject = stream;
}

function removeGroupPeer(remoteUser) {
    const state = groupCallPeers.get(remoteUser);
    if (state) {
        state.peer.ontrack = null;
        state.peer.onicecandidate = null;
        state.peer.onconnectionstatechange = null;
        state.peer.close();
        groupCallPeers.delete(remoteUser);
    }

    groupRemoteVideosEl.querySelector('[data-remote-user="' + remoteUser + '"]')?.remove();
}

async function createGroupOffer(remoteUser, remoteName) {
    if (!groupCallActive || !remoteUser || remoteUser === username) return;

    await ensureGroupCallStream();
    const state = getGroupPeer(remoteUser, remoteName);
    if (state.peer.signalingState !== 'stable' || state.peer.localDescription) return;

    const offer = await state.peer.createOffer();
    await state.peer.setLocalDescription(offer);
    sendGroupCallSignal({ type: 'group-call-offer', to: remoteUser, offer });
}

async function startGroupCall() {
    if (activeMode !== 'group' || !activeGroupId) return;

    try {
        pendingGroupCall = null;
        groupCallActive = true;
        groupCallGroupId = Number(activeGroupId);
        setGroupIncomingMode(false);
        groupHangupCallBtn.hidden = false;
        showGroupCallPanel('Starting group call...');
        await ensureGroupCallStream();
        sendGroupCallSignal({ type: 'group-call-start' });
        showGroupCallPanel('Waiting for members to join...');
    } catch {
        endGroupCall(false, 'Unable to start group call');
        alert('Unable to start group call. Please allow camera and microphone access.');
    }
}

function handleGroupCallInvite(data) {
    if (!activeCallGroupMatches(data.group_id)) return;
    if (data.from === username) return;

    pendingGroupCall = data;
    setGroupIncomingMode(true);
    showGroupCallPanel((data.user || data.from) + ' started a group call');
}

async function acceptGroupCall() {
    if (!pendingGroupCall || Number(pendingGroupCall.group_id) !== Number(activeGroupId)) return;

    try {
        groupCallActive = true;
        groupCallGroupId = Number(pendingGroupCall.group_id);
        setGroupIncomingMode(false);
        groupHangupCallBtn.hidden = false;
        showGroupCallPanel('Joining group call...');
        await ensureGroupCallStream();
        sendGroupCallSignal({ type: 'group-call-join' });
        pendingGroupCall = null;
    } catch {
        endGroupCall(false, 'Unable to join group call');
        alert('Unable to join group call. Please allow camera and microphone access.');
    }
}

function declineGroupCall() {
    if (pendingGroupCall) sendGroupCallSignal({ type: 'group-call-decline' });
    pendingGroupCall = null;
    setGroupIncomingMode(false);
    groupCallPanel.hidden = true;
}

async function handleGroupCallJoin(data) {
    if (!groupCallActive || !activeCallGroupMatches(data.group_id) || data.from === username) return;

    try {
        showGroupCallPanel((data.user || data.from) + ' joined the call');
        await createGroupOffer(data.from, data.user);
    } catch {
        removeGroupPeer(data.from);
    }
}

async function handleGroupCallOffer(data) {
    if (!activeCallGroupMatches(data.group_id) || data.from === username) return;

    try {
        groupCallActive = true;
        groupCallGroupId = Number(data.group_id);
        setGroupIncomingMode(false);
        groupHangupCallBtn.hidden = false;
        showGroupCallPanel('Connecting group call...');
        await ensureGroupCallStream();
        const state = getGroupPeer(data.from, data.user);
        await state.peer.setRemoteDescription(new RTCSessionDescription(data.offer));
        await flushGroupIce(data.from);
        const answer = await state.peer.createAnswer();
        await state.peer.setLocalDescription(answer);
        sendGroupCallSignal({ type: 'group-call-answer', to: data.from, answer });
    } catch {
        removeGroupPeer(data.from);
    }
}

async function handleGroupCallAnswer(data) {
    if (!activeCallGroupMatches(data.group_id) || data.from === username) return;
    const state = groupCallPeers.get(data.from);
    if (!state || !data.answer) return;

    await state.peer.setRemoteDescription(new RTCSessionDescription(data.answer));
    await flushGroupIce(data.from);
}

async function handleGroupIceCandidate(data) {
    if (!activeCallGroupMatches(data.group_id) || data.from === username || !data.candidate) return;

    const state = getGroupPeer(data.from, data.user);
    if (!state.peer.remoteDescription) {
        state.pendingIce.push(data.candidate);
        return;
    }

    try {
        await state.peer.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch {
        // Ignore late candidates after a peer disconnects.
    }
}

function handleGroupCallHangup(data) {
    if (!activeCallGroupMatches(data.group_id) || data.from === username) return;
    removeGroupPeer(data.from);
    showGroupCallPanel((data.user || data.from) + ' left the group call');
}

function handleGroupCallDecline(data) {
    if (!activeCallGroupMatches(data.group_id) || data.from === username) return;
    showGroupCallPanel((data.user || data.from) + ' declined the group call');
}

function endGroupCall(notify = true, status = 'Group call ended') {
    if (notify && groupCallActive) sendGroupCallSignal({ type: 'group-call-hangup' });

    groupCallPeers.forEach((_, remoteUser) => removeGroupPeer(remoteUser));
    groupCallPeers.clear();
    pendingGroupCall = null;
    groupCallActive = false;
    groupCallGroupId = null;

    if (groupCallStream) {
        groupCallStream.getTracks().forEach((track) => track.stop());
        groupCallStream = null;
    }

    groupLocalVideo.srcObject = null;
    groupRemoteVideosEl.textContent = '';
    groupTogglePipBtn.hidden = true;
    groupToggleCameraBtn.hidden = true;
    groupToggleMicBtn.hidden = true;
    groupCameraEnabled = true;
    groupMicEnabled = true;
    applyGroupMediaToggleState();
    setGroupIncomingMode(false);
    groupHangupCallBtn.hidden = true;
    groupCallStatusEl.textContent = status;
    groupCallPanel.hidden = true;
}

function toggleHiddenGroups() {
    showHiddenGroups = !showHiddenGroups;
    hiddenGroupsPanelEl.hidden = !showHiddenGroups;
    toggleHiddenGroupsBtn.classList.toggle('is-active', showHiddenGroups);
    if (showHiddenGroups) loadGroups().catch((error) => alert(error.message));
}

function openVideoCallScreen() {
    if (activeMode === 'group') {
        startGroupCall();
        return;
    }

    if (activeMode !== 'direct' || !activeUser) return;

    sessionStorage.setItem('chat_with', activeUser);
    sessionStorage.setItem('chat_with_nick', activeNickname || usersData[activeUser]?.nickname || activeUser);
    window.location.href = 'chat.html';
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

newGroupBtn.addEventListener('click', createCustomGroup);
toggleHiddenGroupsBtn.addEventListener('click', toggleHiddenGroups);
sessionVideoCallBtn.addEventListener('click', openVideoCallScreen);
groupAcceptCallBtn.addEventListener('click', acceptGroupCall);
groupDeclineCallBtn.addEventListener('click', declineGroupCall);
groupHangupCallBtn.addEventListener('click', () => endGroupCall(true));
groupTogglePipBtn.addEventListener('click', toggleGroupPictureInPicture);
window.addEventListener('keydown', handleGroupPipShortcut);
groupToggleCameraBtn.addEventListener('click', toggleGroupCamera);
groupToggleMicBtn.addEventListener('click', toggleGroupMic);
logoutBtn.addEventListener('click', () => {
    endGroupCall(true);
    logout();
});
updateSessionEmpty();
loadGroups().catch(() => {});
