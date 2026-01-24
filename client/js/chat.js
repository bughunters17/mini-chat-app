const username = sessionStorage.getItem('auth_user')
const myNickname = sessionStorage.getItem('auth_nickname')
const token = sessionStorage.getItem('token')

if (!token) {
  window.location.href = 'login.html'
}

const ws = new WebSocket(`ws://localhost:3000/?token=${token}`)

ws.onmessage = (event) => {
  const data = JSON.parse(event.data)

  if (data.type === 'error') {
    alert(data.message)
    sessionStorage.clear()
    window.location.href = 'login.html'
    return
  }

  if (data.type === 'chat') {
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

function addMessage(senderUsername, senderNickname, message) {
  const chat = document.getElementById('chat')
  const div = document.createElement('div')
  div.classList.add('message', senderUsername === username ? 'self' : 'other')
  div.innerHTML = `<strong>${senderNickname}</strong> ${message}`
  chat.appendChild(div)
  chat.scrollTop = chat.scrollHeight
}

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
  ws.close()
  sessionStorage.clear()
  window.location.href = 'login.html'
})
