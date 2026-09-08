import { getDb } from './db';
import { nowUtc } from '../utils/time';

export function logQueryResult(
  success: boolean,
  playerCount: number = 0,
  latencyMs: number = 0,
  errorMessage?: string
): void {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO query_logs (queried_at, success, player_count, latency_ms, error_message)
      VALUES (?, ?, ?, ?, ?)
    `).run(nowUtc(), success ? 1 : 0, playerCount, latencyMs, errorMessage || null);
  } catch {}
}

export function getLastSuccessfulQuery(): { queried_at: string; player_count: number; latency_ms: number } | null {
  try {
    const db = getDb();
    const row = db
      .prepare('SELECT queried_at, player_count, latency_ms FROM query_logs WHERE success = 1 ORDER BY queried_at DESC LIMIT 1')
      .get() as any;
    return row ?? null;
  } catch {
    return null;
  }
}
