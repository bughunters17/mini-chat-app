const db = require('./db');

function mapMessage(row) {
    if (!row) return null;

    return {
        id: row.id,
        sender: row.sender,
        receiver: row.receiver,
        message: row.message,
        timestamp: row.timestamp,
        edited_at: row.edited_at || null
    };
}

function getMessageById(id) {
    const row = db.prepare(`
        SELECT id, sender, receiver, message, timestamp, edited_at, deleted_at
        FROM messages
        WHERE id = ?
    `).get(id);

    return row || null;
}

function saveMessage(sender, receiver, message) {
    const stmt = db.prepare(`
        INSERT INTO messages (sender, receiver, message)
        VALUES (?, ?, ?)
    `);
    const result = stmt.run(sender, receiver, message);

    return mapMessage(getMessageById(result.lastInsertRowid));
}

function loadConversation(userA, userB) {
    const stmt = db.prepare(`
        SELECT id, sender, receiver, message, timestamp, edited_at
        FROM messages
        WHERE deleted_at IS NULL
          AND (
            (sender = ? AND receiver = ?)
            OR
            (sender = ? AND receiver = ?)
          )
        ORDER BY timestamp ASC, id ASC
    `);

    return stmt.all(userA, userB, userB, userA).map(mapMessage);
}

function updateMessage({ id, sender, message }) {
    const existing = getMessageById(id);

    if (!existing || existing.deleted_at || existing.sender !== sender) {
        return null;
    }

    db.prepare(`
        UPDATE messages
        SET message = ?, edited_at = CURRENT_TIMESTAMP
        WHERE id = ? AND sender = ? AND deleted_at IS NULL
    `).run(message, id, sender);

    return mapMessage(getMessageById(id));
}

function softDeleteMessage({ id, sender }) {
    const existing = getMessageById(id);

    if (!existing || existing.deleted_at || existing.sender !== sender) {
        return null;
    }

    db.prepare(`
        UPDATE messages
        SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = ? AND sender = ? AND deleted_at IS NULL
    `).run(id, sender);

    return mapMessage(existing);
}

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
        WHERE deleted_at IS NULL
          AND (sender = ? OR receiver = ?)
        GROUP BY chatUser
        ORDER BY lastTime DESC
    `);

    return stmt.all(username, username, username);
}

module.exports = {
    saveMessage,
    loadConversation,
    loadRecentChats,
    updateMessage,
    softDeleteMessage
};
