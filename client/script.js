const chat = document.getElementById('chat')
const ws = new WebSocket('ws://localhost:3000')

ws.onmessage = (event) => {
  addMessage(event.data)
}

function sendMessage() {
  const user = document.getElementById('username').value || 'Anonymous'
  const msgInput = document.getElementById('message')
  const msg = msgInput.value.trim()

  if (!msg) return

  ws.send(`${user}|${msg}`)
  msgInput.value = ''
}

function addMessage(data) {
  const currentUser = document.getElementById('username').value || 'Anonymous'
  const separatorIndex = data.indexOf('|')

  const user = data.substring(0, separatorIndex)
  const message = data.substring(separatorIndex + 1)

  const div = document.createElement('div')
  div.classList.add('message')

  div.classList.add(user === currentUser ? 'self' : 'other')

  div.innerHTML = `<strong>${user}</strong>${message}`
  chat.appendChild(div)
  chat.scrollTop = chat.scrollHeight
}

// Send on Enter key
document.getElementById('message').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage()
})
