const db = require('./db');
const bcrypt = require('bcryptjs');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    nickname TEXT NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    status TEXT DEFAULT 'active',
    approved_by TEXT,
    approved_at DATETIME,
    rejected_at DATETIME,
    deleted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT NOT NULL,
    receiver TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    edited_at DATETIME,
    deleted_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS chat_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    hidden_at DATETIME,
    PRIMARY KEY (group_id, username),
    FOREIGN KEY (group_id) REFERENCES chat_groups(id)
  );

  CREATE TABLE IF NOT EXISTS group_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    sender TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    edited_at DATETIME,
    deleted_at DATETIME,
    FOREIGN KEY (group_id) REFERENCES chat_groups(id)
  );
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

ensureColumn('users', 'role', "role TEXT DEFAULT 'user'");
ensureColumn('users', 'status', "status TEXT DEFAULT 'active'");
ensureColumn('users', 'approved_by', 'approved_by TEXT');
ensureColumn('users', 'approved_at', 'approved_at DATETIME');
ensureColumn('users', 'rejected_at', 'rejected_at DATETIME');
ensureColumn('users', 'deleted_at', 'deleted_at DATETIME');
ensureColumn('users', 'created_at', 'created_at DATETIME');
ensureColumn('messages', 'edited_at', 'edited_at DATETIME');
ensureColumn('messages', 'deleted_at', 'deleted_at DATETIME');
ensureColumn('group_members', 'hidden_at', 'hidden_at DATETIME');
ensureColumn('group_messages', 'edited_at', 'edited_at DATETIME');
ensureColumn('group_messages', 'deleted_at', 'deleted_at DATETIME');

console.log('Tables created or verified');

const users = [
  { username: 'crz', nickname: 'Charles', password: '1234', role: 'admin', status: 'active' },
  { username: 'kmz', nickname: 'Karen', password: '4321', role: 'user', status: 'active' },
];

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (username, nickname, password, role, status, approved_at)
  VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

users.forEach(user => {
  const hashed = bcrypt.hashSync(user.password, 10);
  insertUser.run(user.username, user.nickname, hashed, user.role, user.status);
});

db.prepare(`
  UPDATE users
  SET role = 'admin',
      status = 'active',
      approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP),
      rejected_at = NULL,
      deleted_at = NULL
  WHERE username = 'crz'
`).run();

db.prepare(`
  UPDATE users
  SET role = COALESCE(role, 'user'),
      status = COALESCE(status, 'active')
  WHERE username <> 'crz'
`).run();

console.log('Initial users inserted if missing');

module.exports = db;
