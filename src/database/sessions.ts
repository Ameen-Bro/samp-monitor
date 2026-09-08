import { getDb } from './db';
import {
  nowUtc,
  getTodayBounds,
  getYesterdayBounds,
  getThisWeekBounds,
  getThisMonthBounds,
  calculateOverlapSeconds,
  getDayBoundsInTz,
} from '../utils/time';

export interface OfficerSession {
  id: number;
  officer_id: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  end_reason: string | null;
}

export interface OfficerStats {
  officerId: number;
  igName: string;
  isOnline: boolean;
  currentSessionSeconds: number;
  todaySeconds: number;
  yesterdaySeconds: number;
  weekSeconds: number;
  monthSeconds: number;
  lifetimeSeconds: number;
  lastSeenAt?: string;
}

/**
 * Starts a new session for an officer if one is not already open.
 */
export function startSession(officerId: number, startTime?: string): OfficerSession {
  const db = getDb();
  const startedAt = startTime || nowUtc();

  // Check if session is already open
  const existing = db
    .prepare('SELECT * FROM sessions WHERE officer_id = ? AND ended_at IS NULL')
    .get(officerId) as OfficerSession | undefined;

  if (existing) {
    return existing;
  }

  const result = db.prepare(`
    INSERT INTO sessions (officer_id, started_at, ended_at, duration_seconds, end_reason)
    VALUES (?, ?, NULL, 0, NULL)
  `).run(officerId, startedAt);

  return {
    id: Number(result.lastInsertRowid),
    officer_id: officerId,
    started_at: startedAt,
    ended_at: null,
    duration_seconds: 0,
    end_reason: null,
  };
}

/**
 * Ends the currently active session for an officer.
 */
export function endSession(officerId: number, reason: string = 'DISCONNECTED', endTime?: string): OfficerSession | null {
  const db = getDb();
  const endedAt = endTime || nowUtc();

  const active = db
    .prepare('SELECT * FROM sessions WHERE officer_id = ? AND ended_at IS NULL')
    .get(officerId) as OfficerSession | undefined;

  if (!active) return null;

  const startMs = new Date(active.started_at).getTime();
  const endMs = new Date(endedAt).getTime();
  const duration = Math.max(0, Math.floor((endMs - startMs) / 1000));

  db.prepare(`
    UPDATE sessions
    SET ended_at = ?, duration_seconds = ?, end_reason = ?
    WHERE id = ?
  `).run(endedAt, duration, reason, active.id);

  return {
    ...active,
    ended_at: endedAt,
    duration_seconds: duration,
    end_reason: reason,
  };
}

/**
 * Retrieves the currently open session for an officer, if any.
 */
export function getActiveSession(officerId: number): OfficerSession | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM sessions WHERE officer_id = ? AND ended_at IS NULL')
    .get(officerId) as OfficerSession | undefined;
  return row ?? null;
}

/**
 * Retrieves all currently open sessions.
 */
export function getAllActiveSessions(): OfficerSession[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM sessions WHERE ended_at IS NULL')
    .all() as unknown as OfficerSession[];
  return rows;
}

/**
 * Calculates aggregated statistics for a specific officer.
 */
export function getOfficerStats(officerId: number, igName: string, isOnline: boolean): OfficerStats {
  const db = getDb();
  const now = new Date();

  // 1. Current session
  let currentSessionSeconds = 0;
  const active = getActiveSession(officerId);
  if (active && isOnline) {
    const startMs = new Date(active.started_at).getTime();
    currentSessionSeconds = Math.max(0, Math.floor((now.getTime() - startMs) / 1000));
  }

  // Windows
  const todayBounds = getTodayBounds();
  const yesterdayBounds = getYesterdayBounds();
  const weekBounds = getThisWeekBounds();
  const monthBounds = getThisMonthBounds();

  // Load all sessions for this officer that could overlap (or all)
  const sessions = db
    .prepare('SELECT * FROM sessions WHERE officer_id = ? ORDER BY started_at ASC')
    .all(officerId) as unknown as OfficerSession[];

  let todaySeconds = 0;
  let yesterdaySeconds = 0;
  let weekSeconds = 0;
  let monthSeconds = 0;
  let lifetimeSeconds = 0;
  let lastSeenAt: string | undefined = undefined;

  for (const s of sessions) {
    const sStart = new Date(s.started_at);
    const sEnd = s.ended_at ? new Date(s.ended_at) : now;

    if (s.ended_at) {
      lastSeenAt = s.ended_at;
    } else {
      lastSeenAt = now.toISOString();
    }

    // Overlaps with time windows (handles midnight crossing accurately)
    todaySeconds += calculateOverlapSeconds(sStart, sEnd, todayBounds.start, todayBounds.end);
    yesterdaySeconds += calculateOverlapSeconds(sStart, sEnd, yesterdayBounds.start, yesterdayBounds.end);
    weekSeconds += calculateOverlapSeconds(sStart, sEnd, weekBounds.start, weekBounds.end);
    monthSeconds += calculateOverlapSeconds(sStart, sEnd, monthBounds.start, monthBounds.end);

    // Lifetime
    lifetimeSeconds += Math.max(0, Math.floor((sEnd.getTime() - sStart.getTime()) / 1000));
  }

  return {
    officerId,
    igName,
    isOnline,
    currentSessionSeconds,
    todaySeconds,
    yesterdaySeconds,
    weekSeconds,
    monthSeconds,
    lifetimeSeconds,
    lastSeenAt,
  };
}

/**
 * Returns recent sessions for an officer.
 */
export function getOfficerSessionHistory(officerId: number, limit: number = 10): OfficerSession[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM sessions WHERE officer_id = ? ORDER BY started_at DESC LIMIT ?')
    .all(officerId, limit) as unknown as OfficerSession[];
  return rows;
}

/**
 * Gets attendance data for a specific date in timezone for daily reports.
 */
export function getDailyAttendance(dateKey: string): Array<{ officerId: number; igName: string; totalSeconds: number }> {
  const db = getDb();
  const bounds = getDayBoundsInTz(dateKey);

  const officers = db.prepare('SELECT * FROM officers WHERE active = 1 ORDER BY ig_name ASC').all() as any[];
  const results: Array<{ officerId: number; igName: string; totalSeconds: number }> = [];

  for (const off of officers) {
    const sessions = db
      .prepare('SELECT * FROM sessions WHERE officer_id = ? AND started_at <= ? AND (ended_at IS NULL OR ended_at >= ?)')
      .all(off.id, bounds.end.toISOString(), bounds.start.toISOString()) as unknown as OfficerSession[];

    let daySeconds = 0;
    for (const s of sessions) {
      const sStart = new Date(s.started_at);
      const sEnd = s.ended_at ? new Date(s.ended_at) : bounds.end;
      daySeconds += calculateOverlapSeconds(sStart, sEnd, bounds.start, bounds.end);
    }

    if (daySeconds > 0) {
      results.push({
        officerId: off.id,
        igName: off.ig_name,
        totalSeconds: daySeconds,
      });
    }
  }

  // Sort descending by patrol time
  results.sort((a, b) => b.totalSeconds - a.totalSeconds);
  return results;
}
