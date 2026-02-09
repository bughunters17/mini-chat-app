const Database = require('better-sqlite3');
const path = require('path');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'chat.db');

// Open or create database
const dbOptions = {};
if (process.env.DB_VERBOSE === '1') {
  dbOptions.verbose = console.log;
}
const db = new Database(DB_FILE, dbOptions);

console.log('✅ Connected to SQLite via better-sqlite3');

module.exports = db;

