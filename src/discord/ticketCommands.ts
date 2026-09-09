/**
 * Ticket slash commands: /ticket-setup
 * Ticket button handlers are dispatched from buttons.ts
 */
import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  TextChannel,
  GuildMember,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import {
  buildTicketPanelEmbed,
  openTicket,
  closeTicketChannel,
  TICKET_CATEGORIES,
} from '../tickets/ticketManager';
import { logger } from '../utils/logger';

export async function handleTicketSetupCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    const { embed, row } = buildTicketPanelEmbed();
    const channel = interaction.channel as TextChannel;

    await channel.send({ embeds: [embed], components: [row] });
    await interaction.editReply({ content: '✅ Ticket panel created in this channel!' });
    logger.info('Tickets', `Ticket panel created by ${interaction.user.tag} in guild ${interaction.guildId}`);
  } catch (err) {
    logger.error('Tickets', `Failed to setup ticket panel: ${err}`);
    await interaction.editReply({ content: '❌ Failed to create ticket panel. Check bot permissions.' });
  }
}

// ─── Button: open ticket (from panel) ─────────────────────────────────────────
export async function handleTicketOpenButton(
  interaction: ButtonInteraction,
  categoryId: string
): Promise<void> {
  // Show a modal to get optional subject
  const modal = new ModalBuilder()
    .setCustomId(`ticket_subject_modal_${categoryId}`)
    .setTitle('Open a Support Ticket');

  const subjectInput = new TextInputBuilder()
    .setCustomId('ticket_subject')
    .setLabel('Brief subject (optional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100)
    .setPlaceholder('e.g. I was unfairly banned');

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(subjectInput));
  await interaction.showModal(modal);
}

// ─── Modal: subject submitted → create ticket ──────────────────────────────────
export async function handleTicketSubjectModal(
  interaction: ModalSubmitInteraction,
  categoryId: string
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const subject = interaction.fields.getTextInputValue('ticket_subject').trim() || undefined;
  const member = interaction.member as GuildMember;

  const result = await openTicket(interaction.guild!, member, categoryId, subject);

  if (!result.success) {
    await interaction.editReply({ content: `❌ ${result.error}` });
    return;
  }

  await interaction.editReply({
    content: `✅ Your ticket has been created: <#${result.channelId}>`,
  });
}

// ─── Button: close ticket ──────────────────────────────────────────────────────
export async function handleTicketCloseButton(interaction: ButtonInteraction): Promise<void> {
  const channel = interaction.channel as TextChannel;
  const member = interaction.member as GuildMember;

  await interaction.deferUpdate();
  await closeTicketChannel(channel, member);
}

// ─── Button: claim ticket ──────────────────────────────────────────────────────
export async function handleTicketClaimButton(interaction: ButtonInteraction): Promise<void> {
  const member = interaction.member as GuildMember;
  await interaction.reply({
    content: `✋ **${member.user.tag}** has claimed this ticket and will assist you shortly.`,
  });
}
