import WS_BASE_URL from './config.js';

export function createSocket(token) {
    return new WebSocket(WS_BASE_URL + '?token=' + encodeURIComponent(token));
}
