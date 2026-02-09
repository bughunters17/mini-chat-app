const db = require('./db');
const bcrypt = require('bcryptjs');

// ---------------- Create Tables ----------------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    nickname TEXT,
    password TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT,
    receiver TEXT,
    message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log('✅ Tables created (if not existed)');

// ---------------- Insert Initial Users ----------------
const users = [
  { username: 'crz', nickname: 'Charles', password: '1234' },
  { username: 'kmz', nickname: 'Karen', password: '4321' },
];

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (username, nickname, password)
  VALUES (?, ?, ?)
`);

users.forEach(user => {
  const hashed = bcrypt.hashSync(user.password, 10);
  insertUser.run(user.username, user.nickname, hashed);
});

console.log('✅ Initial users inserted (if not existed)');

module.exports = db;
