import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize SQLite database
const db = new Database(join(__dirname, 'baobao.db'));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    file_data TEXT,
    references TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation 
    ON messages(conversation_id, created_at);
`);

// Conversation CRUD
export const conversationDB = {
  // Get all conversations
  getAll() {
    return db.prepare(`
      SELECT * FROM conversations 
      ORDER BY updated_at DESC
    `).all();
  },

  // Get single conversation
  get(id) {
    return db.prepare(`
      SELECT * FROM conversations WHERE id = ?
    `).get(id);
  },

  // Create new conversation
  create(id, title) {
    const now = Date.now();
    return db.prepare(`
      INSERT INTO conversations (id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(id, title, now, now);
  },

  // Update conversation
  update(id, updates) {
    const { title } = updates;
    return db.prepare(`
      UPDATE conversations 
      SET title = ?, updated_at = ?
      WHERE id = ?
    `).run(title, Date.now(), id);
  },

  // Update updated_at timestamp
  touch(id) {
    return db.prepare(`
      UPDATE conversations 
      SET updated_at = ?
      WHERE id = ?
    `).run(Date.now(), id);
  },

  // Delete conversation
  delete(id) {
    return db.prepare(`
      DELETE FROM conversations WHERE id = ?
    `).run(id);
  }
};

// Message CRUD
export const messageDB = {
  // Get all messages for a conversation
  getByConversation(conversationId) {
    return db.prepare(`
      SELECT * FROM messages 
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `).all(conversationId);
  },

  // Add message
  create(message) {
    const { id, conversation_id, role, content, file_data, references } = message;
    return db.prepare(`
      INSERT INTO messages 
      (id, conversation_id, role, content, file_data, references, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      conversation_id,
      role,
      content,
      file_data ? JSON.stringify(file_data) : null,
      references,
      Date.now()
    );
  },

  // Delete all messages in conversation
  deleteByConversation(conversationId) {
    return db.prepare(`
      DELETE FROM messages WHERE conversation_id = ?
    `).run(conversationId);
  }
};

export default db;
