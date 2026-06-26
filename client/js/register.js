import { API_BASE_URL } from './config.js';

export async function register() {
    const nicknameInput = document.getElementById('nickname');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const error = document.getElementById('error');
    const nickname = nicknameInput.value.trim();
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    error.textContent = '';
    error.classList.remove('success');

    if (!nickname || !username || !password) {
        error.textContent = 'Please enter nickname, username, and password';
        return;
    }

    try {
        const res = await fetch(API_BASE_URL + '/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname, username, password })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Registration failed');

        error.classList.add('success');
        error.textContent = data.message || 'Registration submitted. Wait for administrator approval before logging in.';
        nicknameInput.value = '';
        usernameInput.value = '';
        passwordInput.value = '';
    } catch (err) {
        error.classList.remove('success');
        error.textContent = err.message;
    }
}
