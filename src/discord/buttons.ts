import { ButtonInteraction, TextChannel } from 'discord.js';
import { tracker } from '../tracking/tracker';
import { buildDashboard, buildLeaderboardEmbed, buildPeriodEmbed } from './dashboard';
import { handleServerConfigRemoveBtn, SERVER_CONFIG_REMOVE_BTN } from './serverConfig';
import { handleTicketOpenButton, handleTicketCloseButton, handleTicketClaimButton } from './ticketCommands';
import { logger } from '../utils/logger';

export async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  try {
    // ── Dashboard: Refresh ─────────────────────────────────────────────────
    if (customId === 'btn_refresh') {
      await interaction.deferUpdate();
      const updatedStatus = tracker.isServerConfigured()
        ? await tracker.checkNow()
        : null;
      const payload = buildDashboard(updatedStatus, 1);
      await interaction.editReply({ embeds: payload.embeds, components: payload.components });
      logger.info('Buttons', `User ${interaction.user.tag} refreshed the dashboard.`);
      return;
    }

    // ── Dashboard: Pagination ──────────────────────────────────────────────
    if (customId.startsWith('btn_page_')) {
      const pageStr = customId.replace('btn_page_', '');
      const page = parseInt(pageStr, 10);
      if (isNaN(page)) return;

      await interaction.deferUpdate();
      const status = tracker.getLastStatus();
      const payload = buildDashboard(status, page);
      await interaction.editReply({ embeds: payload.embeds, components: payload.components });
      return;
    }

    // ── Dashboard: Period stats ────────────────────────────────────────────
    if (customId === 'btn_today') {
      await interaction.reply({ embeds: [buildPeriodEmbed('today')], ephemeral: true });
      return;
    }

    if (customId === 'btn_weekly') {
      await interaction.reply({ embeds: [buildPeriodEmbed('weekly')], ephemeral: true });
      return;
    }

    if (customId === 'btn_monthly') {
      await interaction.reply({ embeds: [buildPeriodEmbed('monthly')], ephemeral: true });
      return;
    }

    if (customId === 'btn_leaderboard') {
      await interaction.reply({ embeds: [buildLeaderboardEmbed()], ephemeral: true });
      return;
    }

    // ── Server Config: Remove confirmation ────────────────────────────────
    if (customId === SERVER_CONFIG_REMOVE_BTN) {
      await handleServerConfigRemoveBtn(interaction);
      return;
    }

    // ── Cancel button (generic dismiss) ───────────────────────────────────
    if (customId === 'btn_cancel') {
      await interaction.update({ content: '❌ Cancelled.', embeds: [], components: [] });
      return;
    }

    // ── Ticket: Open (from panel) ──────────────────────────────────────────
    if (customId.startsWith('ticket_open_')) {
      const categoryId = customId.replace('ticket_open_', '');
      await handleTicketOpenButton(interaction, categoryId);
      return;
    }

    // ── Ticket: Close ──────────────────────────────────────────────────────
    if (customId === 'ticket_close') {
      await handleTicketCloseButton(interaction);
      return;
    }

    // ── Ticket: Claim ──────────────────────────────────────────────────────
    if (customId === 'ticket_claim') {
      await handleTicketClaimButton(interaction);
      return;
    }
  } catch (err) {
    logger.error('Buttons', `Error handling button interaction: ${customId}`, err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ An error occurred while processing this action.', ephemeral: true });
    }
  }
}
