const http = require('http')
const WebSocket = require('ws')

const users = {
    crz: { password: '1234', nickname: 'Charles' },
    kmz: { password: '4321', nickname: 'Karen' }
}

const server = http.createServer()
const wss = new WebSocket.Server({ server })

server.listen(3000, () => {
    console.log('MessenCharles server running on port 3000')
})

wss.on('connection', (ws, req) => {
    const params = new URLSearchParams(req.url.replace('/?', ''))
    const username = params.get('username')
    const password = params.get('password')

    // 🔐 AUTHENTICATION CHECK
    if (!users[username] || users[username].password !== password) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid username or password' }))
        ws.close()
        return
    }
    ws.username = username
    ws.nickname = users[username].nickname
    
    ws.send(JSON.stringify({
            type: 'system',
            message: 'Authenticated'
        })
    )

    ws.on('message', (message) => {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'chat',
                    username: ws.username,
                    user: ws.nickname, // for display
                    message: message.toString()
                }))
            }
        })
    })

    ws.on('close', () => {
        console.log(`❌ ${ws.username} disconnected`)
    })
})
