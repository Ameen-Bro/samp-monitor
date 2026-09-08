import cron from 'node-cron';
import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { config } from '../config';
import { getDailyAttendance } from '../database/sessions';
import { getTodayBounds, formatDuration, formatDateTime } from '../utils/time';
import { logger } from '../utils/logger';

export function scheduleDailyReport(client: Client): void {
  if (!config.logChannelId) {
    logger.info('DailyReport', 'No LOG_CHANNEL_ID configured. Automated daily report scheduler disabled.');
    return;
  }

  // Cron pattern: minute hour * * *
  const minute = config.dailyReportMinute;
  const hour = config.dailyReportHour;
  const cronExpression = `${minute} ${hour} * * *`;

  logger.info(
    'DailyReport',
    `Scheduling daily report at ${hour.toString().padStart(2, '0')}:${minute
      .toString()
      .padStart(2, '0')} (${config.timezone}) to channel ${config.logChannelId}`
  );

  cron.schedule(
    cronExpression,
    async () => {
      try {
        await sendDailyReport(client);
      } catch (err) {
        logger.error('DailyReport', 'Error sending daily report', err);
      }
    },
    {
      timezone: config.timezone,
    }
  );
}

export async function sendDailyReport(client: Client): Promise<void> {
  if (!config.logChannelId) return;

  const channel = (await client.channels.fetch(config.logChannelId).catch(() => null)) as TextChannel | null;
  if (!channel || !channel.isTextBased()) {
    logger.warn('DailyReport', `Could not find text channel with ID ${config.logChannelId}`);
    return;
  }

  const { dateKey } = getTodayBounds();
  const attendance = getDailyAttendance(dateKey);

  const formattedDate = formatDateTime(new Date());
  const lines: string[] = [];

  if (attendance.length === 0) {
    lines.push('_No officers recorded patrol activity today._');
  } else {
    for (const record of attendance) {
      lines.push(`• **${record.igName}** — ${formatDuration(record.totalSeconds)}`);
    }
  }

  const totalTimeSecs = attendance.reduce((acc, r) => acc + r.totalSeconds, 0);
  const highest = attendance.length > 0 ? attendance[0] : null;

  let footerSummary = `\n━━━━━━━━━━━━━━━━━━\n⏱️ **Total PD Time**: ${formatDuration(totalTimeSecs)}`;
  if (highest) {
    footerSummary += `\n🌟 **Highest**: **${highest.igName}** (${formatDuration(highest.totalSeconds)})`;
  }

  const embed = new EmbedBuilder()
    .setTitle('📋 PD DAILY REPORT')
    .setColor(0x3498db)
    .setDescription(`**Date**: ${dateKey} (${config.timezone})\n\n${lines.join('\n')}\n${footerSummary}`)
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  logger.info('DailyReport', `Daily report sent successfully for ${dateKey}`);
}
