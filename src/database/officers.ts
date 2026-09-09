import { getDb } from './db';
import { normalizeName } from '../utils/normalizeName';
import { nowUtc } from '../utils/time';
import { logger } from '../utils/logger';

export interface Officer {
  id: number;
  ig_name: string;
  normalized_name: string;
  active: number;
  created_at: string;
  discord_user_id?: string | null;
  display_name?: string | null;
}

// ─── CRUD ──────────────────────────────────────────────────────────────────────

export function addOfficer(igName: string, discordUserId?: string): Officer {
  const db = getDb();
  const normalized = normalizeName(igName);

  // Check if previously deactivated
  const existing = db.prepare('SELECT * FROM officers WHERE normalized_name = ?').get(normalized) as Officer | undefined;
  if (existing) {
    if (existing.active === 1) {
      throw new Error(`Member "${igName}" is already registered.`);
    }
    db.prepare('UPDATE officers SET active = 1, ig_name = ?, discord_user_id = ? WHERE id = ?').run(
      igName,
      discordUserId ?? null,
      existing.id
    );
    logger.info('Officers', `Re-activated member: ${igName}`);
    return { ...existing, active: 1, ig_name: igName };
  }

  const now = nowUtc();
  const result = db.prepare(
    'INSERT INTO officers (ig_name, normalized_name, active, created_at, discord_user_id) VALUES (?, ?, 1, ?, ?)'
  ).run(igName, normalized, now, discordUserId ?? null);

  return {
    id: Number(result.lastInsertRowid),
    ig_name: igName,
    normalized_name: normalized,
    active: 1,
    created_at: now,
    discord_user_id: discordUserId ?? null,
  };
}

export function removeOfficer(igName: string): boolean {
  const db = getDb();
  const normalized = normalizeName(igName);
  const result = db.prepare(
    "UPDATE officers SET active = 0 WHERE normalized_name = ? AND active = 1"
  ).run(normalized);
  return Number(result.changes) > 0;
}

export function getActiveOfficers(): Officer[] {
  const db = getDb();
  return db.prepare('SELECT * FROM officers WHERE active = 1 ORDER BY ig_name ASC').all() as unknown as Officer[];
}

export function getOfficerByName(igName: string): Officer | null {
  const db = getDb();
  const normalized = normalizeName(igName);
  const row = db.prepare('SELECT * FROM officers WHERE normalized_name = ?').get(normalized) as Officer | undefined;
  return row ?? null;
}

export function getAllOfficers(): Officer[] {
  const db = getDb();
  return db.prepare('SELECT * FROM officers ORDER BY ig_name ASC').all() as unknown as Officer[];
}

export function updateOfficerDiscordId(officerId: number, discordUserId: string): void {
  const db = getDb();
  db.prepare('UPDATE officers SET discord_user_id = ? WHERE id = ?').run(discordUserId, officerId);
}

// ─── Generic "member" aliases (used in sellable/reusable contexts) ─────────────
export const addMember = addOfficer;
export const removeMember = removeOfficer;
export const getActiveMembers = getActiveOfficers;
export const getMemberByName = getOfficerByName;
