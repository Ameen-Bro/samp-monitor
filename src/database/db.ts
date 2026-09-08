import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

let dbInstance: DatabaseSync | null = null;

export function initDatabase(dbPath?: string): DatabaseSync {
  if (dbInstance) return dbInstance;

  const defaultDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true });
  }

  const resolvedPath = dbPath || path.join(defaultDir, 'samp_monitor.sqlite');
  logger.info('Database', `Initializing SQLite database at ${resolvedPath}`);

  const db = new DatabaseSync(resolvedPath);

  // Performance and integrity settings
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA synchronous = NORMAL;');

  // Schema creation
  db.exec(`
    CREATE TABLE IF NOT EXISTS officers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ig_name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_officers_normalized ON officers (normalized_name);
    CREATE INDEX IF NOT EXISTS idx_officers_active ON officers (active);

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      officer_id INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_seconds INTEGER DEFAULT 0,
      end_reason TEXT,
      FOREIGN KEY (officer_id) REFERENCES officers (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_officer_id ON sessions (officer_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions (started_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_ended_at ON sessions (ended_at);

    CREATE TABLE IF NOT EXISTS query_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      queried_at TEXT NOT NULL,
      success INTEGER NOT NULL,
      player_count INTEGER DEFAULT 0,
      latency_ms INTEGER DEFAULT 0,
      error_message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_query_logs_queried_at ON query_logs (queried_at);

    CREATE TABLE IF NOT EXISTS dashboard_config (
      key TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  dbInstance = db;
  return db;
}

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (e) {
      logger.error('Database', 'Error closing database', e);
    }
    dbInstance = null;
  }
}
