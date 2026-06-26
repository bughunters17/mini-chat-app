const API_BASE_URL = window.location.origin + '/api';
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE_URL = wsProtocol + '//' + window.location.host + '/ws';

export { API_BASE_URL };
export default WS_BASE_URL;
