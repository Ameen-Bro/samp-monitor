import { ButtonInteraction } from 'discord.js';
import { tracker } from '../tracking/tracker';
import { buildDashboard, buildLeaderboardEmbed, buildPeriodEmbed } from './dashboard';
import { logger } from '../utils/logger';

export async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  try {
    if (customId === 'btn_refresh') {
      // Defer message update so Discord knows we're handling it
      await interaction.deferUpdate();

      // 1. Send ONE server query
      // 2. Retrieve current player list
      // 3. Compare with registered officers & update sessions in SQLite
      const updatedStatus = await tracker.checkNow();

      // 4. Edit the EXISTING dashboard message
      const payload = buildDashboard(updatedStatus, 1);
      await interaction.editReply({
        embeds: payload.embeds,
        components: payload.components,
      });

      logger.info('Buttons', `User ${interaction.user.tag} refreshed the dashboard.`);
      return;
    }

    if (customId.startsWith('btn_page_')) {
      const pageStr = customId.replace('btn_page_', '');
      const page = parseInt(pageStr, 10);
      if (isNaN(page)) return;

      await interaction.deferUpdate();
      const status = tracker.getLastStatus();
      const payload = buildDashboard(status, page);

      await interaction.editReply({
        embeds: payload.embeds,
        components: payload.components,
      });
      return;
    }

    if (customId === 'btn_today') {
      const embed = buildPeriodEmbed('today');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (customId === 'btn_weekly') {
      const embed = buildPeriodEmbed('weekly');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (customId === 'btn_monthly') {
      const embed = buildPeriodEmbed('monthly');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (customId === 'btn_leaderboard') {
      const embed = buildLeaderboardEmbed();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
  } catch (err) {
    logger.error('Buttons', `Error handling button interaction: ${customId}`, err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ An error occurred while processing this action.', ephemeral: true });
    }
  }
}
