/**
 * Ticket system manager — channel creation, permissions, lifecycle, transcript.
 */
import {
  Guild,
  TextChannel,
  OverwriteType,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GuildMember,
} from 'discord.js';
import {
  createTicket,
  getTicketByChannel,
  closeTicket,
  logTicketAction,
  getOpenTicketsByUser,
} from '../database/tickets';
import { getSetting, SETTING_KEYS, getBrandingConfig } from '../database/settings';
import { formatDateTime } from '../utils/time';
import { logger } from '../utils/logger';

export const TICKET_CATEGORIES = [
  { id: 'complaint', label: '📢 Complaint', description: 'File a complaint' },
  { id: 'staff_assistance', label: '🛠️ Staff Assistance', description: 'Get help from staff' },
  { id: 'recruitment', label: '📝 Recruitment', description: 'Apply to join the organization' },
  { id: 'report_player', label: '🚨 Report Player', description: 'Report a rule-breaking player' },
  { id: 'technical_support', label: '💻 Technical Support', description: 'Get technical help' },
  { id: 'general_support', label: '❓ General Support', description: 'Any other inquiry' },
] as const;

export type TicketCategoryId = typeof TICKET_CATEGORIES[number]['id'];

// ─── Build the ticket panel ────────────────────────────────────────────────────
export function buildTicketPanelEmbed(): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  const branding = getBrandingConfig();

  const embed = new EmbedBuilder()
    .setTitle(`🎫 ${branding.orgName} — Support Tickets`)
    .setColor(0x3498db)
    .setDescription(
      'Need help? Click a button below to open a support ticket.\n\n' +
      TICKET_CATEGORIES.map((c) => `${c.label} — ${c.description}`).join('\n')
    )
    .setFooter({ text: 'One open ticket per user at a time.' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...TICKET_CATEGORIES.map((cat) =>
      new ButtonBuilder()
        .setCustomId(`ticket_open_${cat.id}`)
        .setLabel(cat.label)
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { embed, row };
}

// ─── Open a ticket ─────────────────────────────────────────────────────────────
export async function openTicket(
  guild: Guild,
  member: GuildMember,
  categoryId: string,
  subject?: string
): Promise<{ success: boolean; channelId?: string; error?: string }> {
  // Limit: 1 open ticket per user per guild
  const existingTickets = getOpenTicketsByUser(guild.id, member.user.id);
  if (existingTickets.length > 0) {
    return {
      success: false,
      error: `You already have an open ticket: <#${existingTickets[0].channel_id}>. Please close it before opening a new one.`,
    };
  }

  const category = TICKET_CATEGORIES.find((c) => c.id === categoryId);
  const categoryLabel = category?.label ?? categoryId;

  const branding = getBrandingConfig();
  const staffRoleId = getSetting(SETTING_KEYS.TICKET_STAFF_ROLE_ID);

  try {
    // Create the ticket channel
    const channel = await guild.channels.create({
      name: `ticket-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user'}`,
      type: ChannelType.GuildText,
      topic: `${categoryLabel} — ${member.user.username}`,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
          type: OverwriteType.Role,
        },
        {
          id: member.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
          ],
          type: OverwriteType.Member,
        },
        ...(staffRoleId
          ? [
              {
                id: staffRoleId,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.ReadMessageHistory,
                  PermissionFlagsBits.ManageMessages,
                  PermissionFlagsBits.AttachFiles,
                ],
                type: OverwriteType.Role as OverwriteType,
              },
            ]
          : []),
      ],
    }) as TextChannel;

    // Store ticket in DB
    const ticket = createTicket(guild.id, channel.id, member.user.id, member.user.username, categoryLabel, subject);

    // Send opening message in ticket channel
    const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('🔒 Close Ticket')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('ticket_claim')
        .setLabel('✋ Claim')
        .setStyle(ButtonStyle.Success)
    );

    const openEmbed = new EmbedBuilder()
      .setTitle(`🎫 Ticket #${ticket.ticket_number} — ${categoryLabel}`)
      .setColor(0x2ecc71)
      .setDescription(
        `Welcome, ${member}!\n\n` +
        `**Category**: ${categoryLabel}\n` +
        (subject ? `**Subject**: ${subject}\n\n` : '\n') +
        `Please describe your issue and a staff member will assist you shortly.\n\n` +
        `Click **🔒 Close Ticket** when your issue is resolved.`
      )
      .setFooter({ text: `${branding.orgName} Support • Ticket #${ticket.ticket_number}` })
      .setTimestamp();

    await channel.send({
      content: `${member} ${staffRoleId ? `<@&${staffRoleId}>` : ''}`,
      embeds: [openEmbed],
      components: [controlRow],
    });

    logTicketAction(ticket.id, member.user.id, member.user.username, 'OPENED', categoryLabel);
    logger.info('Tickets', `Ticket #${ticket.ticket_number} opened by ${member.user.username} in guild ${guild.id}`);

    return { success: true, channelId: channel.id };
  } catch (err: unknown) {
    // Surface full Discord API error (code + message) for easier debugging
    const errMsg = err instanceof Error ? err.message : String(err);
    const errCode = (err as Record<string, unknown>)?.code ?? 'unknown';
    logger.error('Tickets', `Failed to open ticket (code=${errCode}): ${errMsg}`);
    return {
      success: false,
      error: `Failed to create ticket channel (error ${errCode}). Make sure the bot has **Manage Channels** permission and the **GuildMembers** intent is enabled in the Discord Developer Portal.`,
    };
  }
}

// ─── Close a ticket ────────────────────────────────────────────────────────────
export async function closeTicketChannel(
  channel: TextChannel,
  closedBy: GuildMember
): Promise<void> {
  const ticket = getTicketByChannel(channel.id);
  if (!ticket) {
    await channel.send('⚠️ Could not find ticket record for this channel.');
    return;
  }

  closeTicket(channel.id, closedBy.user.username);
  logTicketAction(ticket.id, closedBy.user.id, closedBy.user.username, 'CLOSED');

  const branding = getBrandingConfig();

  // Collect transcript
  const messages = await channel.messages.fetch({ limit: 100 });
  const transcript = messages
    .reverse()
    .map((m) => `[${formatDateTime(m.createdAt)}] ${m.author.tag}: ${m.content}`)
    .join('\n');

  // Log to ticket log channel
  const ticketLogChannelId = getSetting(SETTING_KEYS.TICKET_LOG_CHANNEL_ID);
  if (ticketLogChannelId) {
    try {
      const logChannel = channel.guild.channels.cache.get(ticketLogChannelId) as TextChannel | undefined;
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle(`📋 Ticket #${ticket.ticket_number} Closed`)
          .setColor(0xe74c3c)
          .addFields(
            { name: 'Category', value: ticket.category, inline: true },
            { name: 'Opened by', value: ticket.creator_tag, inline: true },
            { name: 'Closed by', value: closedBy.user.tag, inline: true },
            { name: 'Opened at', value: formatDateTime(ticket.created_at), inline: true }
          )
          .setFooter({ text: `${branding.orgName} Support` });

        await logChannel.send({ embeds: [logEmbed] });

        if (transcript.length < 1900) {
          await logChannel.send({ content: `\`\`\`\n${transcript.slice(0, 1800)}\n\`\`\`` });
        }
      }
    } catch (logErr) {
      logger.error('Tickets', `Failed to log transcript: ${logErr}`);
    }
  }

  // Send closing message, then delete channel after 5 seconds
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle('🔒 Ticket Closed')
        .setColor(0xe74c3c)
        .setDescription(`This ticket has been closed by **${closedBy.user.tag}**.\nThis channel will be deleted in 5 seconds.`)
        .setTimestamp(),
    ],
  });

  setTimeout(() => {
    channel.delete(`Ticket #${ticket.ticket_number} closed by ${closedBy.user.tag}`).catch((err) => {
      logger.error('Tickets', `Failed to delete ticket channel: ${err}`);
    });
  }, 5000);
}
