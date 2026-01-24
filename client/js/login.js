async function login() {
  const username = document.getElementById('username').value
  const password = document.getElementById('password').value
  const error = document.getElementById('error')

  if (!username || !password) {
    error.textContent = 'Please enter username and password'
    return
  }

  try {
    const res = await fetch('http://localhost:3000/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message)

    // Store token and nickname
    const payload = JSON.parse(atob(data.token.split('.')[1]))
    sessionStorage.setItem('token', data.token)
    sessionStorage.setItem('auth_user', payload.username)
    sessionStorage.setItem('auth_nickname', payload.nickname)

    window.location.href = 'chat.html'
  } catch (err) {
    error.textContent = err.message
  }
}
