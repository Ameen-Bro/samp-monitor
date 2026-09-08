import { Events, TextChannel } from 'discord.js';
import { config } from './config';
import { initDatabase, closeDatabase } from './database/db';
import { getDashboardConfig } from './database/dashboardConfig';
import { getAllActiveSessions, endSession } from './database/sessions';
import { tracker } from './tracking/tracker';
import { discordClient } from './discord/client';
import { registerSlashCommands, handleSlashCommand } from './discord/commands';
import { handleButtonInteraction } from './discord/buttons';
import { buildDashboard } from './discord/dashboard';
import { scheduleDailyReport } from './discord/dailyReport';
import { logger } from './utils/logger';
import { nowUtc } from './utils/time';

async function bootstrap() {
  logger.info('System', 'Starting SA-MP / Open.MP PD Officer Monitor...');

  // 1. Initialize Database
  initDatabase();

  // 2. Wire up dashboard auto-update callback
  tracker.registerUpdateCallback(async (status) => {
    try {
      const dashConfig = getDashboardConfig();
      if (!dashConfig || !discordClient.isReady()) return;

      const channel = (await discordClient.channels.fetch(dashConfig.channel_id).catch(() => null)) as TextChannel | null;
      if (!channel || !channel.isTextBased()) return;

      const message = await channel.messages.fetch(dashConfig.message_id).catch(() => null);
      if (!message) return;

      const payload = buildDashboard(status, 1);
      await message.edit({
        embeds: payload.embeds,
        components: payload.components,
      });
      logger.debug('Dashboard', 'Auto-updated permanent dashboard message.');
    } catch (err) {
      logger.error('Dashboard', 'Failed to auto-update dashboard message', err);
    }
  });

  // 3. Discord Event Listeners
  discordClient.on(Events.ClientReady, async (client) => {
    logger.info('Discord', `Logged in as ${client.user.tag}`);

    // Register slash commands
    await registerSlashCommands();

    // Start automated background server query loop
    tracker.startAutoCheck();

    // Schedule daily automated reports
    scheduleDailyReport(client);
  });

  discordClient.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        await handleSlashCommand(interaction);
      } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
      }
    } catch (err) {
      logger.error('Discord', 'Unhandled error in interaction handler', err);
    }
  });

  // 4. Handle Process Signals for Graceful Shutdown
  const handleShutdown = (signal: string) => {
    logger.info('System', `Received ${signal}, initiating graceful shutdown...`);
    tracker.stopAutoCheck();

    // Safely close open sessions
    try {
      const now = nowUtc();
      const openSessions = getAllActiveSessions();
      for (const s of openSessions) {
        endSession(s.officer_id, 'BOT_STOPPED', now);
      }
    } catch (err) {
      logger.error('System', 'Error closing sessions on shutdown', err);
    }

    closeDatabase();
    discordClient.destroy();
    logger.info('System', 'Shutdown complete.');
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  // 5. Connect to Discord
  if (!config.discordToken) {
    logger.warn('Discord', 'No DISCORD_TOKEN provided in .env! Running SA-MP tracker in console mode.');
    tracker.startAutoCheck();
    return;
  }

  try {
    await discordClient.login(config.discordToken);
  } catch (err) {
    logger.error('Discord', 'Failed to login to Discord. Check your DISCORD_TOKEN in .env', err);
  }
}

bootstrap().catch((err) => {
  logger.error('System', 'Fatal error during bootstrap', err);
  process.exit(1);
});
