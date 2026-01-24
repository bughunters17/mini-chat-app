const WebSocket = require('ws')

const PORT = 3000
const wss = new WebSocket.Server({ port: PORT })

console.log(`WebSocket server running on ws://localhost:${PORT}`)

wss.on('connection', (ws) => {
  console.log('New client connected')

  ws.on('message', (message) => {
    // Broadcast message to all clients
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message.toString())
      }
    })
  })

  ws.on('close', () => {
    console.log('Client disconnected')
  })
})
