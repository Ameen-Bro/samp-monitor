import { getDb } from './db';
import { logger } from '../utils/logger';

// ─── Settings Keys ─────────────────────────────────────────────────────────────
export const SETTING_KEYS = {
  // Server
  SERVER_IP: 'server_ip',
  SERVER_PORT: 'server_port',
  MONITORING_ENABLED: 'monitoring_enabled',
  QUERY_INTERVAL: 'query_interval',

  // Branding
  ORG_NAME: 'org_name',
  ORG_ICON: 'org_icon',
  DASHBOARD_TITLE: 'dashboard_title',
  MEMBER_LABEL: 'member_label',
  ONLINE_LABEL: 'online_label',
  OFFLINE_LABEL: 'offline_label',
  FOOTER_TEXT: 'footer_text',

  // Channels
  DASHBOARD_CHANNEL_ID: 'dashboard_channel_id',
  DASHBOARD_MESSAGE_ID: 'dashboard_message_id',
  LOG_CHANNEL_ID: 'log_channel_id',
  TICKET_STAFF_ROLE_ID: 'ticket_staff_role_id',
  TICKET_LOG_CHANNEL_ID: 'ticket_log_channel_id',
  TICKET_NEXT_NUMBER: 'ticket_next_number',
  BOT_ADMIN_ROLE_ID: 'bot_admin_role_id',

  // Music 24/7
  MUSIC_247_ENABLED: 'music_247_enabled',
  MUSIC_247_CHANNEL_ID: 'music_247_channel_id',
  MUSIC_247_GUILD_ID: 'music_247_guild_id',
} as const;

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface ServerConfig {
  ip: string | null;
  port: number | null;
  monitoringEnabled: boolean;
  queryInterval: number;
}

export interface BrandingConfig {
  orgName: string;
  orgIcon: string;
  dashboardTitle: string;
  memberLabel: string;
  onlineLabel: string;
  offlineLabel: string;
  footerText: string;
  dashboardChannelId: string | null;
  dashboardMessageId: string | null;
  logChannelId: string | null;
}

// ─── Core helpers ──────────────────────────────────────────────────────────────
export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, now);
}

export function deleteSetting(key: string): void {
  const db = getDb();
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

// ─── Server Config ─────────────────────────────────────────────────────────────
export function getServerConfig(): ServerConfig {
  return {
    ip: getSetting(SETTING_KEYS.SERVER_IP),
    port: getSetting(SETTING_KEYS.SERVER_PORT) ? parseInt(getSetting(SETTING_KEYS.SERVER_PORT)!, 10) : null,
    monitoringEnabled: getSetting(SETTING_KEYS.MONITORING_ENABLED) === '1',
    queryInterval: parseInt(getSetting(SETTING_KEYS.QUERY_INTERVAL) || '30', 10),
  };
}

export function setServerConfig(ip: string, port: number, queryInterval?: number): void {
  setSetting(SETTING_KEYS.SERVER_IP, ip);
  setSetting(SETTING_KEYS.SERVER_PORT, String(port));
  setSetting(SETTING_KEYS.MONITORING_ENABLED, '1');
  if (queryInterval) setSetting(SETTING_KEYS.QUERY_INTERVAL, String(queryInterval));
  logger.info('Settings', `Server configured: ${ip}:${port}`);
}

export function removeServerConfig(): void {
  deleteSetting(SETTING_KEYS.SERVER_IP);
  deleteSetting(SETTING_KEYS.SERVER_PORT);
  setSetting(SETTING_KEYS.MONITORING_ENABLED, '0');
  logger.info('Settings', 'Server configuration removed. Monitoring disabled. All member data preserved.');
}

// ─── Branding Config ───────────────────────────────────────────────────────────
export function getBrandingConfig(): BrandingConfig {
  return {
    orgName: getSetting(SETTING_KEYS.ORG_NAME) || 'Organization',
    orgIcon: getSetting(SETTING_KEYS.ORG_ICON) || '🏢',
    dashboardTitle: getSetting(SETTING_KEYS.DASHBOARD_TITLE) || 'ACTIVITY MONITOR',
    memberLabel: getSetting(SETTING_KEYS.MEMBER_LABEL) || 'Member',
    onlineLabel: getSetting(SETTING_KEYS.ONLINE_LABEL) || '🟢 Online',
    offlineLabel: getSetting(SETTING_KEYS.OFFLINE_LABEL) || '🔴 Offline',
    footerText: getSetting(SETTING_KEYS.FOOTER_TEXT) || 'SA-MP Activity Monitor',
    dashboardChannelId: getSetting(SETTING_KEYS.DASHBOARD_CHANNEL_ID),
    dashboardMessageId: getSetting(SETTING_KEYS.DASHBOARD_MESSAGE_ID),
    logChannelId: getSetting(SETTING_KEYS.LOG_CHANNEL_ID),
  };
}

// ─── Music 24/7 Config ────────────────────────────────────────────────────────
export function getMusic247Config(): { enabled: boolean; channelId: string | null; guildId: string | null } {
  return {
    enabled: getSetting(SETTING_KEYS.MUSIC_247_ENABLED) === '1',
    channelId: getSetting(SETTING_KEYS.MUSIC_247_CHANNEL_ID),
    guildId: getSetting(SETTING_KEYS.MUSIC_247_GUILD_ID),
  };
}

// ─── Ticket Config ─────────────────────────────────────────────────────────────
export function getNextTicketNumber(): number {
  const db = getDb();
  const current = parseInt(getSetting(SETTING_KEYS.TICKET_NEXT_NUMBER) || '1', 10);
  setSetting(SETTING_KEYS.TICKET_NEXT_NUMBER, String(current + 1));
  return current;
}
