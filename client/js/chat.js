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
const callBtn = document.getElementById('callBtn');
const callPanel = document.getElementById('call-panel');
const callStatusEl = document.getElementById('call-status');
const acceptCallBtn = document.getElementById('accept-call');
const declineCallBtn = document.getElementById('decline-call');
const hangupCallBtn = document.getElementById('hangup-call');
const togglePipBtn = document.getElementById('toggle-pip');
const toggleCameraBtn = document.getElementById('toggle-camera');
const toggleMicBtn = document.getElementById('toggle-mic');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const typingEl = document.getElementById('typing-indicator');
const typingLabelEl = document.getElementById('typing-label');

let isTyping = false;
let stopTypingTimer;
let remoteTypingTimer;
let peerConnection = null;
let localStream = null;
let pendingOffer = null;
let pendingIceCandidates = [];
let cameraEnabled = true;
let micEnabled = true;
const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

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

    if (data.type === 'call-offer' && data.from === chatWithUser) {
        receiveCallOffer(data);
        return;
    }

    if (data.type === 'call-answer' && data.from === chatWithUser) {
        receiveCallAnswer(data);
        return;
    }

    if (data.type === 'ice-candidate' && data.from === chatWithUser) {
        receiveIceCandidate(data);
        return;
    }

    if (data.type === 'call-hangup' && data.from === chatWithUser) {
        endCall(false, (data.user || chatWithNickname || chatWithUser) + ' ended the call');
        return;
    }

    if (data.type === 'call-decline' && data.from === chatWithUser) {
        endCall(false, (data.user || chatWithNickname || chatWithUser) + ' declined the call');
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

function showCallPanel(status) {
    callPanel.hidden = false;
    callStatusEl.textContent = status;
}

function setIncomingCallMode(enabled) {
    acceptCallBtn.hidden = !enabled;
    declineCallBtn.hidden = !enabled;
    hangupCallBtn.hidden = enabled;
}

function applyMediaToggleState() {
    if (localStream) {
        localStream.getVideoTracks().forEach((track) => {
            track.enabled = cameraEnabled;
        });
        localStream.getAudioTracks().forEach((track) => {
            track.enabled = micEnabled;
        });
    }

    toggleCameraBtn.textContent = cameraEnabled ? 'Camera Off' : 'Camera On';
    toggleMicBtn.textContent = micEnabled ? 'Mute' : 'Unmute';
    toggleCameraBtn.classList.toggle('is-off', !cameraEnabled);
    toggleMicBtn.classList.toggle('is-off', !micEnabled);
}

function toggleCamera() {
    cameraEnabled = !cameraEnabled;
    applyMediaToggleState();
}

function toggleMic() {
    micEnabled = !micEnabled;
    applyMediaToggleState();
}

function getDirectPipVideo() {
    if (remoteVideo.srcObject && remoteVideo.readyState >= 1) return remoteVideo;
    if (localVideo.srcObject && localVideo.readyState >= 1) return localVideo;
    return null;
}

async function togglePictureInPicture() {
    if (!document.pictureInPictureEnabled) {
        alert('Picture-in-Picture is not supported in this browser.');
        return;
    }

    try {
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
            return;
        }

        const video = getDirectPipVideo();
        if (!video) {
            alert('No active video is ready to pop out yet.');
            return;
        }

        await video.requestPictureInPicture();
    } catch {
        alert('Unable to open Picture-in-Picture. Start or accept a video call first.');
    }
}

function handlePipShortcut(event) {
    if (!event.altKey || event.key.toLowerCase() !== 'p') return;
    event.preventDefault();
    togglePictureInPicture();
}

function sendCallSignal(payload) {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ ...payload, to: chatWithUser }));
}

async function ensureLocalStream() {
    if (localStream) return localStream;

    localStream = await navigator.mediaDevices.getUserMedia({
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
    localVideo.srcObject = localStream;
    applyMediaToggleState();
    togglePipBtn.hidden = false;
    toggleCameraBtn.hidden = false;
    toggleMicBtn.hidden = false;
    return localStream;
}

async function createPeerConnection() {
    if (peerConnection) return peerConnection;

    const stream = await ensureLocalStream();
    peerConnection = new RTCPeerConnection(rtcConfig);

    stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
    });

    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
        showCallPanel('Connected');
    };

    peerConnection.onicecandidate = (event) => {
        if (!event.candidate) return;
        sendCallSignal({ type: 'ice-candidate', candidate: event.candidate });
    };

    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'connected') showCallPanel('Connected');
        if (['failed', 'closed', 'disconnected'].includes(peerConnection.connectionState)) {
            endCall(false, 'Call ended');
        }
    };

    return peerConnection;
}

async function startCall() {
    try {
        setIncomingCallMode(false);
        showCallPanel('Calling ' + (chatWithNickname || chatWithUser) + '...');
        const peer = await createPeerConnection();
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        sendCallSignal({ type: 'call-offer', offer });
    } catch (error) {
        endCall(false, error.message || 'Unable to start video call');
        alert('Unable to start video call. Please allow camera and microphone access.');
    }
}

function receiveCallOffer(data) {
    pendingOffer = data.offer;
    setIncomingCallMode(true);
    showCallPanel((data.user || chatWithNickname || chatWithUser) + ' is calling...');
}

async function acceptCall() {
    if (!pendingOffer) return;

    try {
        setIncomingCallMode(false);
        showCallPanel('Connecting...');
        const peer = await createPeerConnection();
        await peer.setRemoteDescription(new RTCSessionDescription(pendingOffer));
        await flushPendingIceCandidates();
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        sendCallSignal({ type: 'call-answer', answer });
        pendingOffer = null;
    } catch (error) {
        endCall(true, error.message || 'Unable to answer call');
        alert('Unable to answer video call. Please allow camera and microphone access.');
    }
}

async function receiveCallAnswer(data) {
    if (!peerConnection || !data.answer) return;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    await flushPendingIceCandidates();
    showCallPanel('Connecting...');
}

async function flushPendingIceCandidates() {
    if (!peerConnection || !peerConnection.remoteDescription) return;

    const candidates = pendingIceCandidates;
    pendingIceCandidates = [];

    for (const candidate of candidates) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
            // Ignore late ICE candidates after a call is already closed.
        }
    }
}

async function receiveIceCandidate(data) {
    if (!data.candidate) return;

    if (!peerConnection || !peerConnection.remoteDescription) {
        pendingIceCandidates.push(data.candidate);
        return;
    }

    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch {
        // Ignore late ICE candidates after a call is already closed.
    }
}

function declineCall() {
    sendCallSignal({ type: 'call-decline' });
    endCall(false, 'Call declined');
}

function hangupCall() {
    sendCallSignal({ type: 'call-hangup' });
    endCall(false, 'Call ended');
}

function endCall(keepPanel = false, status = 'Call ended') {
    pendingOffer = null;
    pendingIceCandidates = [];
    setIncomingCallMode(false);

    if (peerConnection) {
        peerConnection.ontrack = null;
        peerConnection.onicecandidate = null;
        peerConnection.onconnectionstatechange = null;
        peerConnection.close();
        peerConnection = null;
    }

    if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
        localStream = null;
    }

    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    callStatusEl.textContent = status;
    callPanel.hidden = !keepPanel && status === 'Call ended';
}

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
callBtn.addEventListener('click', startCall);
acceptCallBtn.addEventListener('click', acceptCall);
declineCallBtn.addEventListener('click', declineCall);
hangupCallBtn.addEventListener('click', hangupCall);
togglePipBtn.addEventListener('click', togglePictureInPicture);
window.addEventListener('keydown', handlePipShortcut);
toggleCameraBtn.addEventListener('click', toggleCamera);
toggleMicBtn.addEventListener('click', toggleMic);

closeBtn.addEventListener('click', () => {
    if (peerConnection || localStream || pendingOffer) hangupCall();
    stopTyping();
    sessionStorage.removeItem('chat_with');
    sessionStorage.removeItem('chat_with_nick');
    window.location.href = '/dashboard.html';
});
