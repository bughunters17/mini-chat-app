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
