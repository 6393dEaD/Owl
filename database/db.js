const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "eqbot.db");
const db = new sqlite3.Database(dbPath);

function init() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        message_count INTEGER DEFAULT 0,
        level INTEGER DEFAULT -1
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_chat_id ON chat_history (chat_id)`);
  });
}

function addMessageToHistory(chatId, role, content) {
  db.run(
    `INSERT INTO chat_history (chat_id, role, content) VALUES (?, ?, ?)`,
    [chatId, role, content],
    (err) => {
      if (err) console.error("DB history write error:", err);
    }
  );
}

function getChatHistory(chatId, limit = 10, callback) {
  db.all(
    `SELECT role, content FROM (
        SELECT * FROM chat_history WHERE chat_id = ? ORDER BY timestamp DESC LIMIT ?
     ) ORDER BY timestamp ASC`,
    [chatId, limit],
    (err, rows) => {
      if (err) {
        console.error("DB history read error:", err);
        return callback([]);
      }
      const formattedRows = rows.map(row => ({
        role: row.role,
        parts: [{ text: row.content }]
      }));
      callback(formattedRows);
    }
  );
}

function incrementMessageCount(userId, callback) {
  db.get(
    `SELECT message_count, level FROM users WHERE user_id = ?`,
    [userId],
    (err, row) => {
      if (err) return console.error("DB read error:", err);
      if (!row) {
        db.run(
          `INSERT INTO users (user_id, message_count, level) VALUES (?, 1, -1)`,
          [userId],
          () => callback(1, -1)
        );
      } else {
        const newCount = row.message_count + 1;
        db.run(
          `UPDATE users SET message_count = ? WHERE user_id = ?`,
          [newCount, userId],
          () => callback(newCount, row.level)
        );
      }
    }
  );
}

function setUserLevel(userId, level) {
  db.run(
    `UPDATE users SET level = ? WHERE user_id = ?`,
    [level, userId],
    (err) => {
      if (err) console.error("DB update level error:", err);
    }
  );
}

function clearChatHistory(chatId, callback) {
  db.run(`DELETE FROM chat_history WHERE chat_id = ?`, [chatId], (err) => {
    if (err) {
      console.error("DB history delete error:", err);
      return callback(err);
    }
    callback(null);
  });
}

module.exports = {
  init,
  incrementMessageCount,
  setUserLevel,
  addMessageToHistory,
  getChatHistory,
  clearChatHistory,
};
