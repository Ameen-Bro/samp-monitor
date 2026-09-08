import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { config } from '../config';
import { addOfficer, removeOfficer, getActiveOfficers, getOfficerByName } from '../database/officers';
import { getOfficerStats, getOfficerSessionHistory } from '../database/sessions';
import { saveDashboardConfig } from '../database/dashboardConfig';
import { tracker } from '../tracking/tracker';
import { buildDashboard, buildLeaderboardEmbed, buildPeriodEmbed } from './dashboard';
import { formatDuration, formatDateTime, formatTimeOnly } from '../utils/time';
import { logger } from '../utils/logger';

export const slashCommands = [
  new SlashCommandBuilder()
    .setName('pd-dashboard')
    .setDescription('Creates or re-initializes the permanent live PD Officer Activity Dashboard'),

  new SlashCommandBuilder()
    .setName('add-officer')
    .setDescription('Registers an officer by permanent in-game name (Admin only)')
    .addStringOption((opt) =>
      opt.setName('ig_name').setDescription('In-game name (e.g. John_Smith)').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('remove-officer')
    .setDescription('Deactivates a registered officer (Admin only)')
    .addStringOption((opt) =>
      opt.setName('ig_name').setDescription('In-game name of the officer to remove').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('officers')
    .setDescription('Displays all currently registered PD officers'),

  new SlashCommandBuilder()
    .setName('force-check')
    .setDescription('Immediately forces a server query and updates officer sessions'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Displays current SA-MP / Open.MP server status and player count'),

  new SlashCommandBuilder()
    .setName('online')
    .setDescription('Displays online status of all or a specific officer')
    .addStringOption((opt) =>
      opt.setName('ig_name').setDescription('Optional: specific officer in-game name').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('history')
    .setDescription('Displays recent session history for a specific officer')
    .addStringOption((opt) =>
      opt.setName('ig_name').setDescription('In-game name (e.g. John_Smith)').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Displays PD online leaderboard ranked by total patrol time'),

  new SlashCommandBuilder()
    .setName('weekly')
    .setDescription('Displays weekly accumulated patrol totals for all officers'),

  new SlashCommandBuilder()
    .setName('monthly')
    .setDescription('Displays monthly accumulated patrol totals for all officers'),
];

export async function registerSlashCommands(): Promise<void> {
  if (!config.discordToken || !config.discordClientId) {
    logger.warn('Commands', 'Discord Token or Client ID missing; skipping slash command registration.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  try {
    logger.info('Commands', 'Registering application (/) commands...');
    const body = slashCommands.map((c) => c.toJSON());

    if (config.discordGuildId) {
      await rest.put(
        Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId),
        { body }
      );
      logger.info('Commands', `Registered commands to Guild ${config.discordGuildId}`);
    } else {
      await rest.put(Routes.applicationCommands(config.discordClientId), { body });
      logger.info('Commands', 'Registered commands globally.');
    }
  } catch (err) {
    logger.error('Commands', 'Failed to register slash commands', err);
  }
}

function checkAdminPermission(interaction: ChatInputCommandInteraction): boolean {
  // If no admin role is configured, require Discord Administrator permission
  if (!config.adminRoleId) {
    return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  }

  // Check if member has the specified ADMIN_ROLE_ID or Discord Administrator permission
  const member = interaction.member;
  if (!member || typeof member.permissions === 'string') {
    return false;
  }

  const memberRoles = (interaction.member?.roles as any)?.cache;
  const hasRole = memberRoles ? memberRoles.has(config.adminRoleId) : false;
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;

  return hasRole || isAdmin;
}

export async function handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const { commandName } = interaction;

  try {
    if (commandName === 'pd-dashboard') {
      await interaction.deferReply();
      const status = tracker.getLastStatus() || (await tracker.checkNow());
      const payload = buildDashboard(status, 1);

      const msg = await interaction.editReply({
        embeds: payload.embeds,
        components: payload.components,
      });

      if (interaction.guildId && interaction.channelId) {
        saveDashboardConfig(interaction.guildId, interaction.channelId, msg.id);
        logger.info('Dashboard', `Permanent dashboard registered at Guild ${interaction.guildId} Ch ${interaction.channelId} Msg ${msg.id}`);
      }
      return;
    }

    if (commandName === 'add-officer') {
      if (!checkAdminPermission(interaction)) {
        await interaction.reply({ content: '🚫 You do not have permission to add officers.', ephemeral: true });
        return;
      }

      const name = interaction.options.getString('ig_name', true).trim();
      const officer = addOfficer(name);
      await interaction.reply({
        content: `✅ Officer **${officer.ig_name}** has been registered successfully.`,
      });
      return;
    }

    if (commandName === 'remove-officer') {
      if (!checkAdminPermission(interaction)) {
        await interaction.reply({ content: '🚫 You do not have permission to remove officers.', ephemeral: true });
        return;
      }

      const name = interaction.options.getString('ig_name', true).trim();
      const removed = removeOfficer(name);
      if (removed) {
        await interaction.reply({
          content: `🗑️ Officer **${name}** has been removed and deactivated.`,
        });
      } else {
        await interaction.reply({
          content: `⚠️ Officer **${name}** was not found in the active roster.`,
          ephemeral: true,
        });
      }
      return;
    }

    if (commandName === 'officers') {
      const officers = getActiveOfficers();
      if (officers.length === 0) {
        await interaction.reply({
          content: 'No officers registered yet. Use `/add-officer <name>` to add officers.',
          ephemeral: true,
        });
        return;
      }

      const lines = officers.map((o, idx) => `${idx + 1}. **${o.ig_name}** (Registered: ${formatDateTime(o.created_at)})`);
      const embed = new EmbedBuilder()
        .setTitle(`👮 Registered PD Officers (${officers.length})`)
        .setColor(0x3498db)
        .setDescription(lines.join('\n'));

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (commandName === 'force-check') {
      await interaction.deferReply();
      const status = await tracker.checkNow();
      if (status.online && status.info) {
        await interaction.editReply({
          content: `✅ Force check completed! Server: **Online** (${status.latencyMs}ms) | Players: **${status.info.players}/${status.info.maxPlayers}**`,
        });
      } else {
        await interaction.editReply({
          content: `⚠️ Force check failed! Error: ${status.error || 'Timeout'}`,
        });
      }
      return;
    }

    if (commandName === 'status') {
      await interaction.deferReply();
      const status = await tracker.checkNow();
      const embed = new EmbedBuilder();

      if (status.online && status.info) {
        embed
          .setTitle(`🌐 Server Status: Online`)
          .setColor(0x2ecc71)
          .addFields(
            { name: 'Host', value: `${status.ip}:${status.port}`, inline: true },
            { name: 'Latency', value: `${status.latencyMs}ms`, inline: true },
            { name: 'Players', value: `${status.info.players} / ${status.info.maxPlayers}`, inline: true },
            { name: 'Hostname', value: status.info.hostname || 'N/A' },
            { name: 'Gamemode', value: status.info.gamemode || 'N/A', inline: true },
            { name: 'Map', value: status.info.mapname || 'N/A', inline: true }
          )
          .setFooter({ text: `Checked at ${formatDateTime(status.lastQueriedAt)}` });
      } else {
        embed
          .setTitle(`🌐 Server Status: Offline / Unreachable`)
          .setColor(0xe74c3c)
          .setDescription(`Could not reach ${status.ip}:${status.port}\n**Error**: ${status.error || 'Timeout'}`)
          .setFooter({ text: `Attempted at ${formatDateTime(status.lastQueriedAt)}` });
      }

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (commandName === 'online') {
      const specificName = interaction.options.getString('ig_name');

      if (specificName) {
        const officer = getOfficerByName(specificName);
        if (!officer || officer.active === 0) {
          await interaction.reply({
            content: `Officer **${specificName}** is not in the active registry.`,
            ephemeral: true,
          });
          return;
        }

        const status = tracker.getLastStatus();
        const onlineNameSet = new Set((status?.players ?? []).map((p) => p.name.toLowerCase()));
        const isOnline = onlineNameSet.has(officer.normalized_name);
        const stats = getOfficerStats(officer.id, officer.ig_name, isOnline);

        const embed = new EmbedBuilder()
          .setTitle(`👮 Officer Details: ${officer.ig_name}`)
          .setColor(isOnline ? 0x2ecc71 : 0xe74c3c)
          .addFields(
            { name: 'Status', value: isOnline ? '🟢 Online' : '🔴 Offline', inline: true },
            { name: 'Current Session', value: formatDuration(stats.currentSessionSeconds), inline: true },
            { name: 'Today’s Patrol', value: formatDuration(stats.todaySeconds), inline: true },
            { name: 'Yesterday', value: formatDuration(stats.yesterdaySeconds), inline: true },
            { name: 'This Week', value: formatDuration(stats.weekSeconds), inline: true },
            { name: 'This Month', value: formatDuration(stats.monthSeconds), inline: true },
            { name: 'Lifetime Total', value: formatDuration(stats.lifetimeSeconds), inline: true },
            { name: 'Last Seen', value: stats.lastSeenAt ? formatDateTime(stats.lastSeenAt) : 'Never', inline: true }
          );

        await interaction.reply({ embeds: [embed] });
        return;
      }

      // Show summary for all
      const status = tracker.getLastStatus();
      const payload = buildDashboard(status, 1);
      await interaction.reply({ embeds: payload.embeds });
      return;
    }

    if (commandName === 'history') {
      const name = interaction.options.getString('ig_name', true);
      const officer = getOfficerByName(name);
      if (!officer) {
        await interaction.reply({ content: `Officer **${name}** not found.`, ephemeral: true });
        return;
      }

      const sessions = getOfficerSessionHistory(officer.id, 10);
      if (sessions.length === 0) {
        await interaction.reply({ content: `No session history recorded yet for **${officer.ig_name}**.` });
        return;
      }

      const lines = sessions.map((s, idx) => {
        const startStr = formatDateTime(s.started_at);
        const endStr = s.ended_at ? formatTimeOnly(s.ended_at) : 'Active now';
        const durStr = s.ended_at ? formatDuration(s.duration_seconds) : 'Ongoing';
        return `${idx + 1}. **${startStr}** → **${endStr}** (${durStr}) [${s.end_reason || 'IN_PROGRESS'}]`;
      });

      const embed = new EmbedBuilder()
        .setTitle(`📋 Session History: ${officer.ig_name}`)
        .setColor(0x3498db)
        .setDescription(lines.join('\n'));

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (commandName === 'leaderboard') {
      const embed = buildLeaderboardEmbed();
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (commandName === 'weekly') {
      const embed = buildPeriodEmbed('weekly');
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (commandName === 'monthly') {
      const embed = buildPeriodEmbed('monthly');
      await interaction.reply({ embeds: [embed] });
      return;
    }
  } catch (err) {
    logger.error('Commands', `Error handling command ${commandName}`, err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'An unexpected error occurred while executing the command.', ephemeral: true });
    }
  }
}
