import { getDb } from './db';
import { nowUtc } from '../utils/time';

export interface DashboardConfig {
  key: string;
  guild_id: string;
  channel_id: string;
  message_id: string;
  updated_at: string;
}

export function saveDashboardConfig(guildId: string, channelId: string, messageId: string, key: string = 'main_dashboard'): void {
  const db = getDb();
  const now = nowUtc();
  db.prepare(`
    INSERT INTO dashboard_config (key, guild_id, channel_id, message_id, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      guild_id = excluded.guild_id,
      channel_id = excluded.channel_id,
      message_id = excluded.message_id,
      updated_at = excluded.updated_at
  `).run(key, guildId, channelId, messageId, now);
}

export function getDashboardConfig(key: string = 'main_dashboard'): DashboardConfig | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM dashboard_config WHERE key = ?').get(key) as DashboardConfig | undefined;
  return row ?? null;
}
