const db = require('./db');

function mapGroup(row) {
    if (!row) return null;

    return {
        id: row.id,
        name: row.name,
        created_by: row.created_by || null,
        created_at: row.created_at || null,
        hidden_at: row.hidden_at || null,
        member_count: row.member_count || 0
    };
}

function mapGroupMessage(row) {
    if (!row) return null;

    return {
        id: row.id,
        group_id: row.group_id,
        sender: row.sender,
        sender_nickname: row.sender_nickname || row.sender,
        message: row.message,
        timestamp: row.timestamp,
        edited_at: row.edited_at || null
    };
}

function normalizeGroupName(name) {
    return String(name || '').trim().replace(/\s+/g, ' ');
}

function normalizeMemberList(members, creator) {
    const input = Array.isArray(members) ? members : [];
    const seen = new Set();
    const normalized = [];

    [creator, ...input].forEach((member) => {
        const username = String(member || '').trim().toLowerCase();
        if (!username || seen.has(username)) return;
        seen.add(username);
        normalized.push(username);
    });

    return normalized;
}

function getActiveUsers(usernames) {
    if (!usernames.length) return [];

    const placeholders = usernames.map(() => '?').join(', ');
    return db.prepare(`
        SELECT username
        FROM users
        WHERE status = 'active'
          AND username IN (${placeholders})
    `).all(...usernames).map((row) => row.username);
}

function createGroup({ name, createdBy, members }) {
    const groupName = normalizeGroupName(name);
    const creator = String(createdBy || '').trim().toLowerCase();

    if (!groupName || groupName.length < 2 || groupName.length > 60) {
        return { error: 'Group name must be 2-60 characters' };
    }

    const existing = db.prepare(`
        SELECT id
        FROM chat_groups
        WHERE lower(name) = lower(?)
    `).get(groupName);

    if (existing) {
        return { error: 'Group name is already used' };
    }

    const requestedMembers = normalizeMemberList(members, creator);
    const activeMembers = getActiveUsers(requestedMembers);

    if (!activeMembers.includes(creator)) {
        return { error: 'Creator account is not active' };
    }

    if (activeMembers.length < 2) {
        return { error: 'Add at least one active member besides yourself' };
    }

    const transaction = db.transaction(() => {
        const result = db.prepare(`
            INSERT INTO chat_groups (name, created_by)
            VALUES (?, ?)
        `).run(groupName, creator);

        const insertMember = db.prepare(`
            INSERT OR IGNORE INTO group_members (group_id, username, hidden_at)
            VALUES (?, ?, NULL)
        `);

        activeMembers.forEach((username) => {
            insertMember.run(result.lastInsertRowid, username);
        });

        return result.lastInsertRowid;
    });

    const groupId = transaction();
    return {
        group: getGroupForUser({ groupId, username: creator, includeHidden: true }),
        members: activeMembers
    };
}

function getGroupForUser({ groupId, username, includeHidden = false }) {
    const hiddenFilter = includeHidden ? '' : 'AND gm.hidden_at IS NULL';

    return mapGroup(db.prepare(`
        SELECT g.id, g.name, g.created_by, g.created_at, gm.hidden_at, COUNT(gm_all.username) AS member_count
        FROM chat_groups g
        INNER JOIN group_members gm ON gm.group_id = g.id AND gm.username = ?
        LEFT JOIN group_members gm_all ON gm_all.group_id = g.id
        WHERE g.id = ?
          ${hiddenFilter}
        GROUP BY g.id, g.name, g.created_by, g.created_at, gm.hidden_at
    `).get(username, groupId));
}

function listGroupsForUser(username, options = {}) {
    const includeHidden = !!options.includeHidden;
    const hiddenOnly = !!options.hiddenOnly;
    let hiddenFilter = 'AND gm.hidden_at IS NULL';

    if (hiddenOnly) {
        hiddenFilter = 'AND gm.hidden_at IS NOT NULL';
    } else if (includeHidden) {
        hiddenFilter = '';
    }

    return db.prepare(`
        SELECT g.id, g.name, g.created_by, g.created_at, gm.hidden_at, COUNT(gm_all.username) AS member_count
        FROM chat_groups g
        INNER JOIN group_members gm ON gm.group_id = g.id AND gm.username = ?
        LEFT JOIN group_members gm_all ON gm_all.group_id = g.id
        WHERE 1 = 1
          ${hiddenFilter}
        GROUP BY g.id, g.name, g.created_by, g.created_at, gm.hidden_at
        ORDER BY g.created_at DESC, g.name COLLATE NOCASE ASC
    `).all(username).map(mapGroup);
}

function isGroupMember(groupId, username) {
    const row = db.prepare(`
        SELECT 1 AS allowed
        FROM group_members
        WHERE group_id = ? AND username = ?
    `).get(groupId, username);

    return !!row;
}

function listGroupMemberUsernames(groupId) {
    return db.prepare(`
        SELECT username
        FROM group_members
        WHERE group_id = ?
    `).all(groupId).map((row) => row.username);
}

function setGroupHidden({ groupId, username, hidden }) {
    if (!isGroupMember(groupId, username)) return null;

    db.prepare(`
        UPDATE group_members
        SET hidden_at = ${hidden ? 'CURRENT_TIMESTAMP' : 'NULL'}
        WHERE group_id = ? AND username = ?
    `).run(groupId, username);

    return getGroupForUser({ groupId, username, includeHidden: true });
}

function hardDeleteGroup({ groupId, username, role }) {
    const group = db.prepare(`
        SELECT id, name, created_by
        FROM chat_groups
        WHERE id = ?
    `).get(groupId);

    if (!group) return null;

    const isAdmin = String(role || 'user') === 'admin';
    const isCreator = String(group.created_by || '').toLowerCase() === String(username || '').toLowerCase();

    if (!isAdmin && !isCreator) return null;

    const members = listGroupMemberUsernames(groupId);
    const transaction = db.transaction(() => {
        const messagesDeleted = db.prepare(`
            DELETE FROM group_messages
            WHERE group_id = ?
        `).run(groupId).changes;

        const membersDeleted = db.prepare(`
            DELETE FROM group_members
            WHERE group_id = ?
        `).run(groupId).changes;

        const groupsDeleted = db.prepare(`
            DELETE FROM chat_groups
            WHERE id = ?
        `).run(groupId).changes;

        return { messagesDeleted, membersDeleted, groupsDeleted };
    });

    const result = transaction();
    return {
        id: group.id,
        name: group.name,
        created_by: group.created_by,
        members,
        messages_deleted: result.messagesDeleted,
        members_deleted: result.membersDeleted,
        hard_deleted: result.groupsDeleted === 1
    };
}

function loadGroupMessages({ groupId, username }) {
    if (!isGroupMember(groupId, username)) return null;

    return db.prepare(`
        SELECT gm.id, gm.group_id, gm.sender, u.nickname AS sender_nickname, gm.message, gm.timestamp, gm.edited_at
        FROM group_messages gm
        LEFT JOIN users u ON u.username = gm.sender
        WHERE gm.group_id = ? AND gm.deleted_at IS NULL
        ORDER BY gm.timestamp ASC, gm.id ASC
    `).all(groupId).map(mapGroupMessage);
}

function saveGroupMessage({ groupId, sender, message }) {
    if (!isGroupMember(groupId, sender)) return null;

    const result = db.prepare(`
        INSERT INTO group_messages (group_id, sender, message)
        VALUES (?, ?, ?)
    `).run(groupId, sender, message);

    return getGroupMessageById(result.lastInsertRowid);
}

function getGroupMessageById(id) {
    return mapGroupMessage(db.prepare(`
        SELECT gm.id, gm.group_id, gm.sender, u.nickname AS sender_nickname, gm.message, gm.timestamp, gm.edited_at
        FROM group_messages gm
        LEFT JOIN users u ON u.username = gm.sender
        WHERE gm.id = ?
    `).get(id));
}

function updateGroupMessage({ id, sender, message }) {
    const existing = db.prepare(`
        SELECT id
        FROM group_messages
        WHERE id = ? AND sender = ? AND deleted_at IS NULL
    `).get(id, sender);

    if (!existing) return null;

    db.prepare(`
        UPDATE group_messages
        SET message = ?, edited_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(message, id);

    return getGroupMessageById(id);
}

function softDeleteGroupMessage({ id, sender }) {
    const existing = db.prepare(`
        SELECT id
        FROM group_messages
        WHERE id = ? AND sender = ? AND deleted_at IS NULL
    `).get(id, sender);

    if (!existing) return null;

    db.prepare(`
        UPDATE group_messages
        SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(id);

    return getGroupMessageById(id);
}

module.exports = {
    createGroup,
    listGroupsForUser,
    listGroupMemberUsernames,
    loadGroupMessages,
    saveGroupMessage,
    setGroupHidden,
    hardDeleteGroup,
    updateGroupMessage,
    softDeleteGroupMessage
};
