const Database = require('better-sqlite3');
const path = require('path');

const DB_FILE = path.join(__dirname, 'chat.db');

// Open or create database
const db = new Database(DB_FILE, {
  verbose: console.log
});

console.log('✅ Connected to SQLite via better-sqlite3');

module.exports = db;
