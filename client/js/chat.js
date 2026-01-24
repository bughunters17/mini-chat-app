const username = sessionStorage.getItem('auth_user')
const password = sessionStorage.getItem('auth_pass')
const myNickname = sessionStorage.getItem('auth_nickname')

if (!username || !password) {
  // user is not logged in → redirect to login page
  window.location.href = 'login.html'
}

// Connect to WebSocket
const ws = new WebSocket(
  `ws://localhost:3000/?username=${username}&password=${password}`
)

ws.onmessage = (event) => {
  const data = JSON.parse(event.data)

  if (data.type === 'error') {
    alert(data.message)
    sessionStorage.clear()
    window.location.href = 'login.html'
    return
  }

  if (data.type === 'chat') {
    // Pass both username and nickname to addMessage
    addMessage(data.username, data.user, data.message)
  }
}

function sendMessage() {
  const input = document.getElementById('message')
  const msg = input.value.trim()
  if (!msg) return

  ws.send(msg)
  input.value = ''
}

// FIXED: now we know both senderUsername and senderNickname
function addMessage(senderUsername, senderNickname, message) {
  const chat = document.getElementById('chat')
  const div = document.createElement('div')

  // Use username to decide alignment
  div.classList.add('message', senderUsername === username ? 'self' : 'other')

  div.innerHTML = `<strong>${senderNickname}</strong> ${message}`
  chat.appendChild(div)
  chat.scrollTop = chat.scrollHeight
}

// Logout functionality
const logoutBtn = document.getElementById('logoutBtn')
logoutBtn.addEventListener('click', () => {
  // Close WebSocket connection
  ws.close()
  // Clear session storage
  sessionStorage.clear()
  // Redirect to login page
  window.location.href = 'login.html'
})
