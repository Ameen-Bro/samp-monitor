import dotenv from 'dotenv';

dotenv.config();

export interface BotConfig {
  discordToken: string;
  discordClientId: string;
  discordGuildId?: string;

  sampServerIp: string;
  sampServerPort: number;

  timezone: string;

  queryIntervalSeconds: number;
  missedQueryThreshold: number;

  adminRoleId?: string;
  logChannelId?: string;
  dailyReportHour: number; // 0-23 in configured timezone
  dailyReportMinute: number;
}

export const config: BotConfig = {
  discordToken: process.env.DISCORD_TOKEN || '',
  discordClientId: process.env.DISCORD_CLIENT_ID || '',
  discordGuildId: process.env.DISCORD_GUILD_ID || undefined,

  sampServerIp: process.env.SAMP_SERVER_IP || '139.99.52.211',
  sampServerPort: parseInt(process.env.SAMP_SERVER_PORT || '7777', 10),

  timezone: process.env.TIMEZONE || 'Asia/Kolkata',

  queryIntervalSeconds: Math.max(5, parseInt(process.env.QUERY_INTERVAL_SECONDS || '30', 10)),
  missedQueryThreshold: Math.max(1, parseInt(process.env.MISSED_QUERY_THRESHOLD || '3', 10)),

  adminRoleId: process.env.ADMIN_ROLE_ID || undefined,
  logChannelId: process.env.LOG_CHANNEL_ID || undefined,
  dailyReportHour: parseInt(process.env.DAILY_REPORT_HOUR || '23', 10),
  dailyReportMinute: parseInt(process.env.DAILY_REPORT_MINUTE || '59', 10),
};
