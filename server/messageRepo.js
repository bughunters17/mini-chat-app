const db = require('./db');

/* Save message */
function saveMessage(sender, receiver, message) {
    const stmt = db.prepare(`
        INSERT INTO messages (sender, receiver, message)
        VALUES (?, ?, ?)
    `);
    stmt.run(sender, receiver, message);
}

/* Load conversation history (A <-> B) */
function loadConversation(userA, userB) {
    const stmt = db.prepare(`
        SELECT sender, receiver, message, timestamp
        FROM messages
        WHERE
            (sender = ? AND receiver = ?)
        OR
            (sender = ? AND receiver = ?)
        ORDER BY timestamp ASC
    `);

    return stmt.all(userA, userB, userB, userA);
}

/* Load recent chats for dashboard */
function loadRecentChats(username) {
    const stmt = db.prepare(`
        SELECT
            CASE
            WHEN sender = ? THEN receiver
            ELSE sender
            END AS chatUser,
            message,
            MAX(timestamp) AS lastTime
        FROM messages
        WHERE sender = ? OR receiver = ?
        GROUP BY chatUser
        ORDER BY lastTime DESC
    `);

    return stmt.all(username, username, username);
}

module.exports = {
    saveMessage,
    loadConversation,
    loadRecentChats
};
