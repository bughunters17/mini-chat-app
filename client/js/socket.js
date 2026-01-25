import WS_BASE_URL from './config';

export function createSocket(token) {
    return new WebSocket(`${WS_BASE_URL}/?token=${token}`);
}
