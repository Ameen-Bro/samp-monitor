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
import { getSetting, SETTING_KEYS } from '../database/settings';
import { tracker } from '../tracking/tracker';
import { buildDashboard, buildLeaderboardEmbed, buildPeriodEmbed } from './dashboard';
import { formatDuration, formatDateTime, formatTimeOnly } from '../utils/time';
import { handleServerConfigCommand } from './serverConfig';
import { handleOrgConfigCommand } from './branding';
import { handleMusicCommand } from './musicCommands';
import { handleTicketSetupCommand } from './ticketCommands';
import { logger } from '../utils/logger';

// ─── All slash command definitions ─────────────────────────────────────────────
export const slashCommands = [
  // ── Activity Monitor ────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Creates or re-initializes the permanent live Activity Dashboard'),

  // Backward-compatible PD alias
  new SlashCommandBuilder()
    .setName('pd-dashboard')
    .setDescription('Alias for /dashboard (legacy)'),

  new SlashCommandBuilder()
    .setName('add-member')
    .setDescription('Registers a member by permanent in-game name (Admin only)')
    .addStringOption((opt) =>
      opt.setName('ig_name').setDescription('In-game name (e.g. John_Smith)').setRequired(true)
    ),

  // Backward-compatible alias
  new SlashCommandBuilder()
    .setName('add-officer')
    .setDescription('Alias for /add-member (legacy)')
    .addStringOption((opt) =>
      opt.setName('ig_name').setDescription('In-game name (e.g. John_Smith)').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('remove-member')
    .setDescription('Deactivates a registered member (Admin only)')
    .addStringOption((opt) =>
      opt.setName('ig_name').setDescription('In-game name of the member to remove').setRequired(true)
    ),

  // Backward-compatible alias
  new SlashCommandBuilder()
    .setName('remove-officer')
    .setDescription('Alias for /remove-member (legacy)')
    .addStringOption((opt) =>
      opt.setName('ig_name').setDescription('In-game name of the officer to remove').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('members')
    .setDescription('Displays all currently registered members'),

  // Backward-compatible alias
  new SlashCommandBuilder()
    .setName('officers')
    .setDescription('Alias for /members (legacy)'),

  new SlashCommandBuilder()
    .setName('force-check')
    .setDescription('Immediately forces a server query and updates member sessions'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Displays current SA-MP / Open.MP server status and player count'),

  new SlashCommandBuilder()
    .setName('online')
    .setDescription('Displays online status of all or a specific member')
    .addStringOption((opt) =>
      opt.setName('ig_name').setDescription('Optional: specific member in-game name').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('history')
    .setDescription('Displays recent session history for a specific member')
    .addStringOption((opt) =>
      opt.setName('ig_name').setDescription('In-game name (e.g. John_Smith)').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Displays activity leaderboard ranked by total time'),

  new SlashCommandBuilder()
    .setName('weekly')
    .setDescription('Displays weekly accumulated activity totals'),

  new SlashCommandBuilder()
    .setName('monthly')
    .setDescription('Displays monthly accumulated activity totals'),

  // ── Server Config (Admin) ───────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('server-config')
    .setDescription('Configure the SA-MP / Open.MP server to monitor (Admin only)')
    .addSubcommand((sub) => sub.setName('set').setDescription('Set server IP and port via modal'))
    .addSubcommand((sub) => sub.setName('status').setDescription('View current server configuration'))
    .addSubcommand((sub) => sub.setName('test').setDescription('Test connection to the configured server'))
    .addSubcommand((sub) => sub.setName('remove').setDescription('Remove server configuration (stops monitoring, preserves all data)')),

  // ── Organization Branding (Admin) ───────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('org-config')
    .setDescription('Configure organization branding and channel settings (Admin only)')
    .addSubcommand((sub) => sub.setName('branding').setDescription('Set org name, icon, member label, dashboard title'))
    .addSubcommand((sub) => sub.setName('channels').setDescription('Set log channel, staff role, ticket log channel'))
    .addSubcommand((sub) => sub.setName('view').setDescription('View current organization settings')),

  // ── Music ────────────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song from YouTube, Spotify, SoundCloud, or keyword search')
    .addStringOption((opt) =>
      opt.setName('query').setDescription('Song name, YouTube URL, Spotify link, or SoundCloud link').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the currently playing track'),

  new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume paused playback'),

  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the currently playing track'),

  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback and clear the entire queue'),

  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Display the current music queue'),

  new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Display the currently playing track'),

  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set playback volume (0–200)')
    .addIntegerOption((opt) =>
      opt.setName('level').setDescription('Volume level 0–200 (default 100)').setRequired(true).setMinValue(0).setMaxValue(200)
    ),

  new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set loop mode for music playback')
    .addStringOption((opt) =>
      opt
        .setName('mode')
        .setDescription('Loop mode')
        .setRequired(true)
        .addChoices(
          { name: '➡️ Off', value: 'none' },
          { name: '🔂 Track', value: 'track' },
          { name: '🔁 Queue', value: 'queue' }
        )
    ),

  new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Shuffle the current music queue'),

  new SlashCommandBuilder()
    .setName('247')
    .setDescription('24/7 music mode — bot stays in voice channel')
    .addSubcommand((sub) => sub.setName('setup').setDescription('Join and enable 24/7 mode'))
    .addSubcommand((sub) => sub.setName('enable').setDescription('Enable 24/7 mode'))
    .addSubcommand((sub) => sub.setName('disable').setDescription('Disable 24/7 mode'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Check 24/7 mode status')),

  // ── Tickets ──────────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('ticket-setup')
    .setDescription('Post the ticket panel in this channel (Admin only)'),
];

// ─── Register commands ─────────────────────────────────────────────────────────
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
      logger.info('Commands', `Registered ${body.length} commands to Guild ${config.discordGuildId}`);
    } else {
      await rest.put(Routes.applicationCommands(config.discordClientId), { body });
      logger.info('Commands', 'Registered commands globally.');
    }
  } catch (err) {
    logger.error('Commands', 'Failed to register slash commands', err);
  }
}

// ─── Admin permission check ────────────────────────────────────────────────────
function checkAdminPermission(interaction: ChatInputCommandInteraction): boolean {
  // Guild owner is ALWAYS permitted
  if (interaction.guild?.ownerId === interaction.user.id) {
    return true;
  }

  // Check if user is configured directly as a bot admin user ID
  const adminUserId = getSetting(SETTING_KEYS.BOT_ADMIN_USER_ID) || config.adminUserId;
  if (adminUserId) {
    const allowedIds = adminUserId.split(',').map((id) => id.trim());
    if (allowedIds.includes(interaction.user.id)) {
      return true;
    }
  }

  const adminRoleId = getSetting(SETTING_KEYS.BOT_ADMIN_ROLE_ID) || config.adminRoleId;

  if (!adminRoleId) {
    return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  }

  const memberRoles = (interaction.member?.roles as any)?.cache;
  const hasRole = memberRoles ? memberRoles.has(adminRoleId) : false;
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;

  return hasRole || isAdmin;
}

// ─── Main slash command router ─────────────────────────────────────────────────
export async function handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const { commandName } = interaction;

  try {
    // ── Admin-only commands ────────────────────────────────────────────────
    if (commandName === 'server-config') {
      if (!checkAdminPermission(interaction)) {
        await interaction.reply({ content: '🚫 Admin only.', ephemeral: true });
        return;
      }
      await handleServerConfigCommand(interaction);
      return;
    }

    if (commandName === 'org-config') {
      if (!checkAdminPermission(interaction)) {
        await interaction.reply({ content: '🚫 Admin only.', ephemeral: true });
        return;
      }
      await handleOrgConfigCommand(interaction);
      return;
    }

    if (commandName === 'ticket-setup') {
      if (!checkAdminPermission(interaction)) {
        await interaction.reply({ content: '🚫 Admin only.', ephemeral: true });
        return;
      }
      await handleTicketSetupCommand(interaction);
      return;
    }

    // ── Music commands ─────────────────────────────────────────────────────
    const MUSIC_COMMANDS = ['play', 'pause', 'resume', 'skip', 'stop', 'queue', 'nowplaying', 'volume', 'loop', 'shuffle', '247'];
    if (MUSIC_COMMANDS.includes(commandName)) {
      if (!interaction.guildId) {
        await interaction.reply({ content: '🚫 Music commands only work in a server.', ephemeral: true });
        return;
      }
      await handleMusicCommand(interaction);
      return;
    }

    // ── Dashboard (+ legacy pd-dashboard) ─────────────────────────────────
    if (commandName === 'dashboard' || commandName === 'pd-dashboard') {
      await interaction.deferReply();
      const status = tracker.getLastStatus() || (tracker.isServerConfigured() ? await tracker.checkNow() : null);
      const payload = buildDashboard(status, 1);

      const msg = await interaction.editReply({
        embeds: payload.embeds,
        components: payload.components,
      });

      if (interaction.guildId && interaction.channelId) {
        saveDashboardConfig(interaction.guildId, interaction.channelId, msg.id);
        logger.info('Dashboard', `Dashboard registered at Guild ${interaction.guildId} Ch ${interaction.channelId} Msg ${msg.id}`);
      }
      return;
    }

    // ── Add member / add-officer (alias) ───────────────────────────────────
    if (commandName === 'add-member' || commandName === 'add-officer') {
      if (!checkAdminPermission(interaction)) {
        await interaction.reply({ content: '🚫 You do not have permission to add members.', ephemeral: true });
        return;
      }
      const name = interaction.options.getString('ig_name', true).trim();
      const member = addOfficer(name);
      await interaction.reply({ content: `✅ **${member.ig_name}** has been registered successfully.` });
      return;
    }

    // ── Remove member / remove-officer (alias) ─────────────────────────────
    if (commandName === 'remove-member' || commandName === 'remove-officer') {
      if (!checkAdminPermission(interaction)) {
        await interaction.reply({ content: '🚫 You do not have permission to remove members.', ephemeral: true });
        return;
      }
      const name = interaction.options.getString('ig_name', true).trim();
      const removed = removeOfficer(name);
      if (removed) {
        await interaction.reply({ content: `🗑️ **${name}** has been removed and deactivated.` });
      } else {
        await interaction.reply({ content: `⚠️ **${name}** was not found in the active roster.`, ephemeral: true });
      }
      return;
    }

    // ── Members list / officers alias ──────────────────────────────────────
    if (commandName === 'members' || commandName === 'officers') {
      const members = getActiveOfficers();
      if (members.length === 0) {
        await interaction.reply({ content: 'No members registered yet. Use `/add-member <name>` to add members.', ephemeral: true });
        return;
      }

      const lines = members.map((o, idx) => `${idx + 1}. **${o.ig_name}** (Registered: ${formatDateTime(o.created_at)})`);
      const embed = new EmbedBuilder()
        .setTitle(`👥 Registered Members (${members.length})`)
        .setColor(0x3498db)
        .setDescription(lines.join('\n'));

      await interaction.reply({ embeds: [embed] });
      return;
    }

    // ── Force check ────────────────────────────────────────────────────────
    if (commandName === 'force-check') {
      if (!tracker.isServerConfigured()) {
        await interaction.reply({ content: '⚠️ No server configured. Use `/server-config set` first.', ephemeral: true });
        return;
      }
      await interaction.deferReply();
      const status = await tracker.checkNow();
      if (status.online && status.info) {
        await interaction.editReply({
          content: `✅ Check complete! **Online** (${status.latencyMs}ms) | Players: **${status.info.players}/${status.info.maxPlayers}**`,
        });
      } else {
        await interaction.editReply({ content: `⚠️ Check failed! Error: ${status.error || 'Timeout'}` });
      }
      return;
    }

    // ── Status ─────────────────────────────────────────────────────────────
    if (commandName === 'status') {
      if (!tracker.isServerConfigured()) {
        await interaction.reply({ content: '⚠️ No server configured. Use `/server-config set` first.', ephemeral: true });
        return;
      }
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
          .setDescription(`Could not reach \`${status.ip}:${status.port}\`\n**Error**: ${status.error || 'Timeout'}`)
          .setFooter({ text: `Attempted at ${formatDateTime(status.lastQueriedAt)}` });
      }

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ── Online ─────────────────────────────────────────────────────────────
    if (commandName === 'online') {
      const specificName = interaction.options.getString('ig_name');

      if (specificName) {
        const officer = getOfficerByName(specificName);
        if (!officer || officer.active === 0) {
          await interaction.reply({ content: `Member **${specificName}** is not in the active registry.`, ephemeral: true });
          return;
        }

        const status = tracker.getLastStatus();
        const onlineNameSet = new Set((status?.players ?? []).map((p) => p.name.toLowerCase()));
        const isOnline = onlineNameSet.has(officer.normalized_name);
        const stats = getOfficerStats(officer.id, officer.ig_name, isOnline);

        const embed = new EmbedBuilder()
          .setTitle(`👤 Member: ${officer.ig_name}`)
          .setColor(isOnline ? 0x2ecc71 : 0xe74c3c)
          .addFields(
            { name: 'Status', value: isOnline ? '🟢 Online' : '🔴 Offline', inline: true },
            { name: 'Current Session', value: formatDuration(stats.currentSessionSeconds), inline: true },
            { name: "Today's Time", value: formatDuration(stats.todaySeconds), inline: true },
            { name: 'Yesterday', value: formatDuration(stats.yesterdaySeconds), inline: true },
            { name: 'This Week', value: formatDuration(stats.weekSeconds), inline: true },
            { name: 'This Month', value: formatDuration(stats.monthSeconds), inline: true },
            { name: 'Lifetime Total', value: formatDuration(stats.lifetimeSeconds), inline: true },
            { name: 'Last Seen', value: stats.lastSeenAt ? formatDateTime(stats.lastSeenAt) : 'Never', inline: true }
          );

        await interaction.reply({ embeds: [embed] });
        return;
      }

      const status = tracker.getLastStatus() || (tracker.isServerConfigured() ? await tracker.checkNow() : null);
      const payload = buildDashboard(status, 1);
      await interaction.reply({ embeds: payload.embeds, components: payload.components });
      return;
    }

    // ── History ────────────────────────────────────────────────────────────
    if (commandName === 'history') {
      const name = interaction.options.getString('ig_name', true);
      const officer = getOfficerByName(name);
      if (!officer) {
        await interaction.reply({ content: `Member **${name}** not found.`, ephemeral: true });
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

    // ── Leaderboard / Weekly / Monthly ─────────────────────────────────────
    if (commandName === 'leaderboard') {
      await interaction.reply({ embeds: [buildLeaderboardEmbed()] });
      return;
    }

    if (commandName === 'weekly') {
      await interaction.reply({ embeds: [buildPeriodEmbed('weekly')] });
      return;
    }

    if (commandName === 'monthly') {
      await interaction.reply({ embeds: [buildPeriodEmbed('monthly')] });
      return;
    }
  } catch (err: any) {
    logger.error('Commands', `Error handling command ${commandName}`, err);
    const errorMsg = err?.message || 'An unexpected error occurred while executing the command.';
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `❌ ${errorMsg}`, ephemeral: true }).catch(() => {});
    } else if (interaction.deferred) {
      await interaction.editReply({ content: `❌ ${errorMsg}` }).catch(() => {});
    }
  }
}
