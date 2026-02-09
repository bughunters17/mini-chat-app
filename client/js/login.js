async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const error = document.getElementById('error');

    if (!username || !password) {
        error.textContent = 'Please enter username and password';
        return;
    }

    try {
        const res = await fetch(
            window.location.hostname === 'localhost'
                ? 'http://localhost:3000/login'
                : 'https://mini-chat-app-server.onrender.com/login',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            }
        );

        const data = await res.json();
        if (!res.ok) throw new Error(data.message);

        // Decode JWT payload
        const payload = JSON.parse(atob(data.token.split('.')[1]));

        // Persist session
        sessionStorage.setItem('token', data.token);
        sessionStorage.setItem('auth_user', payload.username);
        sessionStorage.setItem('auth_nickname', payload.nickname);

        // Redirect AFTER auth
        window.location.href = 'dashboard.html';

    } catch (err) {
        error.textContent = err.message;
    }
}
