/**
 * /server-config — Admin command to configure the SA-MP/Open.MP server.
 * Supports: set (modal), test, remove, status
 */
import {
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
} from 'discord.js';
import { querySampServer } from '../samp/query';
import { setServerConfig, removeServerConfig, getServerConfig } from '../database/settings';
import { tracker } from '../tracking/tracker';
import { logger } from '../utils/logger';
import dns from 'dns';

// ─── Modal IDs ─────────────────────────────────────────────────────────────────
export const SERVER_CONFIG_MODAL_ID = 'modal_server_config';
export const SERVER_CONFIG_SET_BTN = 'btn_server_config_set';
export const SERVER_CONFIG_REMOVE_BTN = 'btn_server_config_remove';

// ─── Slash handler ─────────────────────────────────────────────────────────────
export async function handleServerConfigCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (sub === 'set') {
    const modal = new ModalBuilder()
      .setCustomId(SERVER_CONFIG_MODAL_ID)
      .setTitle('Configure SA-MP / Open.MP Server');

    const ipInput = new TextInputBuilder()
      .setCustomId('server_ip')
      .setLabel('Server IP Address')
      .setPlaceholder('e.g. 123.45.67.89')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);

    const portInput = new TextInputBuilder()
      .setCustomId('server_port')
      .setLabel('Server Port')
      .setPlaceholder('e.g. 7777')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(6)
      .setValue('7777');

    const intervalInput = new TextInputBuilder()
      .setCustomId('query_interval')
      .setLabel('Query Interval (seconds, min 10)')
      .setPlaceholder('e.g. 30')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(4)
      .setValue('30');

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(ipInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(portInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(intervalInput)
    );

    await interaction.showModal(modal);
    return;
  }

  if (sub === 'status') {
    await interaction.deferReply({ ephemeral: true });
    const cfg = getServerConfig();

    if (!cfg.ip || !cfg.port) {
      await interaction.editReply({
        content: '⚠️ **No server configured.** Use `/server-config set` to configure a server.',
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🌐 Current Server Configuration')
      .setColor(0x3498db)
      .addFields(
        { name: 'IP Address', value: cfg.ip, inline: true },
        { name: 'Port', value: String(cfg.port), inline: true },
        { name: 'Query Interval', value: `${cfg.queryInterval}s`, inline: true },
        { name: 'Monitoring', value: cfg.monitoringEnabled ? '✅ Enabled' : '❌ Disabled', inline: true }
      );

    const server = tracker.getCurrentServer();
    const trackerInfo = server.ip
      ? `Tracker running on **${server.ip}:${server.port}**`
      : '⚠️ Tracker is not actively running.';
    embed.setDescription(trackerInfo);

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (sub === 'remove') {
    await interaction.deferReply({ ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle('⚠️ Remove Server Configuration?')
      .setColor(0xe74c3c)
      .setDescription(
        'This will **stop monitoring** the server.\n\n' +
        '✅ All member/officer data, sessions, and statistics are **preserved**.\n' +
        '❌ The server IP and port will be cleared.\n\n' +
        'Are you sure?'
      );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(SERVER_CONFIG_REMOVE_BTN)
        .setLabel('🗑️ Yes, Remove Server')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('btn_cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
    return;
  }

  if (sub === 'test') {
    await interaction.deferReply({ ephemeral: true });
    const cfg = getServerConfig();

    if (!cfg.ip || !cfg.port) {
      await interaction.editReply({ content: '⚠️ No server configured to test. Use `/server-config set` first.' });
      return;
    }

    await interaction.editReply({ content: `🔍 Testing connection to **${cfg.ip}:${cfg.port}**...` });

    const result = await querySampServer(cfg.ip, cfg.port, { timeoutMs: 5000 });
    if (result.online && result.info) {
      await interaction.editReply({
        content:
          `✅ **Server is ONLINE!**\n\n` +
          `**Host**: ${cfg.ip}:${cfg.port}\n` +
          `**Hostname**: ${result.info.hostname}\n` +
          `**Players**: ${result.info.players}/${result.info.maxPlayers}\n` +
          `**Gamemode**: ${result.info.gamemode}\n` +
          `**Latency**: ${result.latencyMs}ms`,
      });
    } else {
      await interaction.editReply({
        content: `❌ **Server is OFFLINE / Unreachable**\n\nError: ${result.error || 'Timeout'}`,
      });
    }
    return;
  }
}

// ─── Modal submit handler ──────────────────────────────────────────────────────
export async function handleServerConfigModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  let ip = interaction.fields.getTextInputValue('server_ip').trim();
  let portRaw = interaction.fields.getTextInputValue('server_port').trim();
  const intervalRaw = interaction.fields.getTextInputValue('query_interval').trim();

  // If user entered IP:port in the IP field (e.g. 139.99.52.211:7777)
  if (ip.includes(':')) {
    const parts = ip.split(':');
    ip = parts[0].trim();
    if (!portRaw || portRaw === '7777') {
      portRaw = parts[1].trim();
    }
  }

  // Resolve hostname if a domain name was provided instead of IPv4
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    try {
      const lookup = await dns.promises.lookup(ip);
      ip = lookup.address;
    } catch {
      await interaction.editReply({ content: `❌ Could not resolve hostname "${ip}". Please enter a valid IPv4 address.` });
      return;
    }
  }

  const port = parseInt(portRaw, 10);
  const interval = Math.max(10, parseInt(intervalRaw || '30', 10));

  if (!ip || isNaN(port) || port < 1 || port > 65535) {
    await interaction.editReply({ content: '❌ Invalid IP or port. Port must be between 1 and 65535.' });
    return;
  }

  // Live UDP test before saving
  await interaction.editReply({ content: `🔍 Testing connection to **${ip}:${port}**... Please wait.` });

  try {
    const result = await querySampServer(ip, port, { timeoutMs: 5000 });

    if (!result.online) {
      await interaction.editReply({
        content:
          `❌ **Could not connect to ${ip}:${port}**\n\n` +
          `Error: ${result.error || 'Timeout'}\n\n` +
          `Please verify the server is running and reachable over UDP port ${port}, then try again.`,
      });
      return;
    }

    // Save to DB only on success
    setServerConfig(ip, port, interval);
    tracker.updateServer(ip, port, interval);
    tracker.startAutoCheck();

    await interaction.editReply({
      content:
        `✅ **Server configured successfully!**\n\n` +
        `**Host**: \`${ip}:${port}\`\n` +
        `**Hostname**: ${result.info?.hostname || 'N/A'}\n` +
        `**Players**: ${result.info?.players ?? 0}/${result.info?.maxPlayers ?? 0}\n` +
        `**Gamemode**: ${result.info?.gamemode || 'N/A'}\n` +
        `**Latency**: ${result.latencyMs}ms\n` +
        `**Query Interval**: ${interval}s\n\n` +
        `Monitoring has started! ✅`,
    });

    logger.info('ServerConfig', `Server configured: ${ip}:${port}, interval ${interval}s`);
  } catch (err) {
    logger.error('ServerConfig', 'Error testing server', err);
    await interaction.editReply({ content: '❌ An error occurred while testing the server. Please try again.' });
  }
}

// ─── Button: confirm remove ────────────────────────────────────────────────────
export async function handleServerConfigRemoveBtn(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();
  removeServerConfig();
  tracker.clearServer();
  await interaction.editReply({
    content:
      '🗑️ **Server configuration removed.**\n\n' +
      '✅ All member data, sessions, and statistics have been preserved.\n' +
      'Use `/server-config set` to configure a new server.',
    embeds: [],
    components: [],
  });
}
