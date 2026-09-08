import { getDb } from './db';
import { normalizeName } from '../utils/normalizeName';
import { nowUtc } from '../utils/time';

export interface Officer {
  id: number;
  ig_name: string;
  normalized_name: string;
  active: number;
  created_at: string;
}

/**
 * Registers an officer. If previously deactivated, reactivates them and updates display casing.
 */
export function addOfficer(igName: string): Officer {
  const db = getDb();
  const normalized = normalizeName(igName);
  const now = nowUtc();

  const existing = db.prepare('SELECT * FROM officers WHERE normalized_name = ?').get(normalized) as Officer | undefined;

  if (existing) {
    if (existing.active === 1) {
      // Update display name casing if changed
      if (existing.ig_name !== igName.trim()) {
        db.prepare('UPDATE officers SET ig_name = ? WHERE id = ?').run(igName.trim(), existing.id);
        existing.ig_name = igName.trim();
      }
      return existing;
    } else {
      // Reactivate
      db.prepare('UPDATE officers SET active = 1, ig_name = ? WHERE id = ?').run(igName.trim(), existing.id);
      return {
        ...existing,
        active: 1,
        ig_name: igName.trim(),
      };
    }
  }

  const result = db.prepare(`
    INSERT INTO officers (ig_name, normalized_name, active, created_at)
    VALUES (?, ?, 1, ?)
  `).run(igName.trim(), normalized, now);

  const newId = Number(result.lastInsertRowid);
  return {
    id: newId,
    ig_name: igName.trim(),
    normalized_name: normalized,
    active: 1,
    created_at: now,
  };
}

/**
 * Deactivates an officer (soft delete).
 */
export function removeOfficer(igName: string): boolean {
  const db = getDb();
  const normalized = normalizeName(igName);
  const officer = db.prepare('SELECT * FROM officers WHERE normalized_name = ? AND active = 1').get(normalized) as Officer | undefined;

  if (!officer) return false;

  db.prepare('UPDATE officers SET active = 0 WHERE id = ?').run(officer.id);

  // Also close any currently open session
  const now = nowUtc();
  const openSession = db.prepare('SELECT * FROM sessions WHERE officer_id = ? AND ended_at IS NULL').get(officer.id) as any;
  if (openSession) {
    const startedAt = new Date(openSession.started_at).getTime();
    const endedAt = new Date(now).getTime();
    const duration = Math.max(0, Math.floor((endedAt - startedAt) / 1000));
    db.prepare(`
      UPDATE sessions
      SET ended_at = ?, duration_seconds = ?, end_reason = 'OFFICER_REMOVED'
      WHERE id = ?
    `).run(now, duration, openSession.id);
  }

  return true;
}

/**
 * Retrieves an officer by in-game name (case-insensitive).
 */
export function getOfficerByName(name: string): Officer | null {
  const db = getDb();
  const normalized = normalizeName(name);
  const row = db.prepare('SELECT * FROM officers WHERE normalized_name = ?').get(normalized) as Officer | undefined;
  return row ?? null;
}

/**
 * Retrieves an officer by database ID.
 */
export function getOfficerById(id: number): Officer | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM officers WHERE id = ?').get(id) as Officer | undefined;
  return row ?? null;
}

/**
 * Returns all active registered officers.
 */
export function getActiveOfficers(): Officer[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM officers WHERE active = 1 ORDER BY ig_name ASC').all() as unknown as Officer[];
  return rows;
}

/**
 * Returns all registered officers (active and inactive).
 */
export function getAllOfficers(): Officer[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM officers ORDER BY active DESC, ig_name ASC').all() as unknown as Officer[];
  return rows;
}
