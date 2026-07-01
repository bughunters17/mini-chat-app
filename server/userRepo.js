const bcrypt = require('bcryptjs');
const db = require('./db');

function normalizeUsername(username) {
    return String(username || '').trim().toLowerCase();
}

function normalizeNickname(nickname) {
    return String(nickname || '').trim();
}

function mapPublicUser(row) {
    return {
        username: row.username,
        nickname: row.nickname,
        role: row.role || 'user',
        status: row.status || 'active',
        created_at: row.created_at || null,
        approved_by: row.approved_by || null,
        approved_at: row.approved_at || null,
        rejected_at: row.rejected_at || null,
        deleted_at: row.deleted_at || null
    };
}

function findUserByUsername(username) {
    return db.prepare(`
        SELECT id, username, nickname, password, role, status, created_at, approved_by, approved_at, rejected_at, deleted_at
        FROM users
        WHERE username = ?
    `).get(normalizeUsername(username));
}

function listUsers() {
    return db.prepare(`
        SELECT username, nickname, role, status
        FROM users
        WHERE status = 'active'
        ORDER BY nickname COLLATE NOCASE ASC, username COLLATE NOCASE ASC
    `).all().map(mapPublicUser);
}

function listUsersForAdmin() {
    return db.prepare(`
        SELECT username, nickname, role, status, created_at, approved_by, approved_at, rejected_at, deleted_at
        FROM users
        ORDER BY
            CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END,
            created_at DESC,
            nickname COLLATE NOCASE ASC
    `).all().map(mapPublicUser);
}

function createUser({ username, nickname, password }) {
    const normalizedUsername = normalizeUsername(username);
    const normalizedNickname = normalizeNickname(nickname);
    const passwordHash = bcrypt.hashSync(String(password), 10);

    const stmt = db.prepare(`
        INSERT INTO users (username, nickname, password, role, status, created_at)
        VALUES (?, ?, ?, 'user', 'pending', CURRENT_TIMESTAMP)
    `);

    const result = stmt.run(normalizedUsername, normalizedNickname, passwordHash);

    return {
        id: result.lastInsertRowid,
        username: normalizedUsername,
        nickname: normalizedNickname,
        role: 'user',
        status: 'pending'
    };
}

function approveUser(username, approverUsername) {
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedUsername || normalizedUsername === normalizeUsername(approverUsername)) {
        return null;
    }

    db.prepare(`
        UPDATE users
        SET status = 'active',
            approved_by = ?,
            approved_at = CURRENT_TIMESTAMP,
            rejected_at = NULL,
            deleted_at = NULL
        WHERE username = ? AND status IN ('pending', 'rejected')
    `).run(normalizeUsername(approverUsername), normalizedUsername);

    return findUserByUsername(normalizedUsername);
}

function rejectUser(username, approverUsername) {
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedUsername || normalizedUsername === 'crz' || normalizedUsername === normalizeUsername(approverUsername)) {
        return null;
    }

    db.prepare(`
        UPDATE users
        SET status = 'rejected',
            approved_by = ?,
            approved_at = NULL,
            rejected_at = CURRENT_TIMESTAMP
        WHERE username = ? AND status = 'pending'
    `).run(normalizeUsername(approverUsername), normalizedUsername);

    return findUserByUsername(normalizedUsername);
}

function deleteNormalUser(username, adminUsername) {
    const normalizedUsername = normalizeUsername(username);
    const normalizedAdmin = normalizeUsername(adminUsername);
    const user = findUserByUsername(normalizedUsername);

    if (!user || !normalizedUsername || normalizedUsername === normalizedAdmin) {
        return null;
    }

    if ((user.role || 'user') === 'admin') {
        return null;
    }

    const deletedUser = mapPublicUser(user);

    const result = db.transaction(() => {
        const directMessages = db.prepare(`
            DELETE FROM messages
            WHERE sender = ? OR receiver = ?
        `).run(normalizedUsername, normalizedUsername);

        const groupMessages = db.prepare(`
            DELETE FROM group_messages
            WHERE sender = ?
        `).run(normalizedUsername);

        db.prepare(`
            DELETE FROM group_members
            WHERE username = ?
        `).run(normalizedUsername);

        const users = db.prepare(`
            DELETE FROM users
            WHERE username = ? AND role <> 'admin'
        `).run(normalizedUsername);

        return {
            messagesDeleted: directMessages.changes + groupMessages.changes,
            usersDeleted: users.changes
        };
    })();

    if (result.usersDeleted !== 1) {
        return null;
    }

    return {
        ...deletedUser,
        status: 'deleted',
        hard_deleted: true,
        messages_deleted: result.messagesDeleted
    };
}

module.exports = {
    approveUser,
    createUser,
    deleteNormalUser,
    findUserByUsername,
    listUsers,
    listUsersForAdmin,
    normalizeNickname,
    normalizeUsername,
    rejectUser
};
