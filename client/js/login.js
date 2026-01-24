function login() {
    const username = document.getElementById('username').value
    const password = document.getElementById('password').value
    const error = document.getElementById('error')
  
    if (!username || !password) {
      error.textContent = 'Please enter username and password'
      return
    }
  
    // Save temporarily (simple approach)
    sessionStorage.setItem('auth_user', username)
    sessionStorage.setItem('auth_pass', password)
  
    // Redirect
    window.location.href = 'chat.html'
  }
  