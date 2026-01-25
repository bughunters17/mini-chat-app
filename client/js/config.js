const WS_BASE_URL =
    window.location.hostname === 'localhost'
        ? 'ws://localhost:3000'
        : 'wss://mini-chat-app-server.onrender.com';

export default WS_BASE_URL;
