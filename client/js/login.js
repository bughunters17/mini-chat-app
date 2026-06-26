import { API_BASE_URL } from './config.js';

export async function login() {
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const error = document.getElementById('error');
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    error.textContent = '';

    if (!username || !password) {
        error.textContent = 'Please enter username and password';
        return;
    }

    try {
        const res = await fetch(API_BASE_URL + '/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Login failed');

        const payload = JSON.parse(atob(data.token.split('.')[1]));

        sessionStorage.setItem('token', data.token);
        sessionStorage.setItem('auth_user', payload.username);
        sessionStorage.setItem('auth_nickname', payload.nickname);
        sessionStorage.setItem('auth_role', payload.role || data.role || 'user');
        sessionStorage.setItem('auth_status', payload.status || data.status || 'active');

        window.location.href = 'dashboard.html';
    } catch (err) {
        error.textContent = err.message;
    }
}
