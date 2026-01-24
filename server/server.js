const express = require('express')
const http = require('http')
const WebSocket = require('ws')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const bodyParser = require('body-parser')
const cors = require('cors')

const SECRET_KEY = 'MessenCharlesSecretKey'

const users = {
    crz: { password: bcrypt.hashSync('1234', 10), nickname: 'Charles' },
    kmz: { password: bcrypt.hashSync('4321', 10), nickname: 'Karen' }
}

// ------------------- EXPRESS LOGIN -------------------

const app = express()

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}))

app.use(bodyParser.json())


app.post('/login', (req, res) => {
    const { username, password } = req.body
    const user = users[username]

    if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ message: 'Invalid username or password' })
}

const token = jwt.sign(
    { username, nickname: user.nickname },
    SECRET_KEY,
    { expiresIn: '2h' }
)

    res.json({ token })
})

// ------------------- WEBSOCKET SERVER -------------------
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

wss.on('connection', (ws, req) => {
    const params = new URLSearchParams(req.url.replace('/?', ''))
    const token = params.get('token')

    if (!token) {
        ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }))
        ws.close()
        return
    }

  let payload
  try {
    payload = jwt.verify(token, SECRET_KEY)
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }))
    ws.close()
    return
  }

  ws.username = payload.username
  ws.nickname = payload.nickname

  ws.send(JSON.stringify({ type: 'system', message: 'Authenticated' }))
  console.log(`✅ ${ws.nickname} connected via JWT`)

  ws.on('message', (msg) => {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'chat',
          username: ws.username,
          user: ws.nickname,
          message: msg.toString()
        }))
      }
    })
  })

  ws.on('close', () => {
    console.log(`❌ ${ws.nickname} disconnected`)
  })
})

server.listen(3000, () => {
  console.log('MessenCharles server running on port 3000')
})
