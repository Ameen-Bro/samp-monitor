/**
 * /org-config — Admin command to fully customize organization branding.
 */
import {
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  EmbedBuilder,
} from 'discord.js';
import {
  getBrandingConfig,
  setSetting,
  SETTING_KEYS,
} from '../database/settings';
import { logger } from '../utils/logger';

export const ORG_CONFIG_MODAL_ID = 'modal_org_config';
export const ORG_CHANNELS_MODAL_ID = 'modal_org_channels';

// ─── /org-config set (main branding) ──────────────────────────────────────────
export async function handleOrgConfigCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (sub === 'branding') {
    const current = getBrandingConfig();
    const modal = new ModalBuilder().setCustomId(ORG_CONFIG_MODAL_ID).setTitle('Organization Branding');

    const orgNameInput = new TextInputBuilder()
      .setCustomId('org_name')
      .setLabel('Organization Name')
      .setStyle(TextInputStyle.Short)
      .setValue(current.orgName)
      .setRequired(true)
      .setMaxLength(50);

    const orgIconInput = new TextInputBuilder()
      .setCustomId('org_icon')
      .setLabel('Dashboard Icon/Emoji (e.g. 🛡️)')
      .setStyle(TextInputStyle.Short)
      .setValue(current.orgIcon)
      .setRequired(false)
      .setMaxLength(10);

    const memberLabelInput = new TextInputBuilder()
      .setCustomId('member_label')
      .setLabel('Member Label (e.g. Officer, Agent, Guard)')
      .setStyle(TextInputStyle.Short)
      .setValue(current.memberLabel)
      .setRequired(true)
      .setMaxLength(30);

    const footerInput = new TextInputBuilder()
      .setCustomId('footer_text')
      .setLabel('Dashboard Footer Text')
      .setStyle(TextInputStyle.Short)
      .setValue(current.footerText)
      .setRequired(false)
      .setMaxLength(80);

    const titleInput = new TextInputBuilder()
      .setCustomId('dashboard_title')
      .setLabel('Dashboard Title (e.g. ACTIVITY MONITOR)')
      .setStyle(TextInputStyle.Short)
      .setValue(current.dashboardTitle)
      .setRequired(true)
      .setMaxLength(50);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(orgNameInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(orgIconInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(memberLabelInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(footerInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput)
    );

    await interaction.showModal(modal);
    return;
  }

  if (sub === 'channels') {
    const current = getBrandingConfig();
    const modal = new ModalBuilder().setCustomId(ORG_CHANNELS_MODAL_ID).setTitle('Channel & Role Settings');

    const logChannelInput = new TextInputBuilder()
      .setCustomId('log_channel_id')
      .setLabel('Activity Log Channel ID (optional)')
      .setStyle(TextInputStyle.Short)
      .setValue(current.logChannelId ?? '')
      .setRequired(false)
      .setMaxLength(30);

    const staffRoleInput = new TextInputBuilder()
      .setCustomId('ticket_staff_role_id')
      .setLabel('Ticket Staff Role ID (optional)')
      .setStyle(TextInputStyle.Short)
      .setValue('')
      .setRequired(false)
      .setMaxLength(30);

    const ticketLogInput = new TextInputBuilder()
      .setCustomId('ticket_log_channel_id')
      .setLabel('Ticket Log Channel ID (optional)')
      .setStyle(TextInputStyle.Short)
      .setValue('')
      .setRequired(false)
      .setMaxLength(30);

    const adminRoleInput = new TextInputBuilder()
      .setCustomId('bot_admin_role_id')
      .setLabel('Bot Admin Role ID (optional)')
      .setStyle(TextInputStyle.Short)
      .setValue('')
      .setRequired(false)
      .setMaxLength(30);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(logChannelInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(staffRoleInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(ticketLogInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(adminRoleInput)
    );

    await interaction.showModal(modal);
    return;
  }

  if (sub === 'view') {
    await interaction.deferReply({ ephemeral: true });
    const cfg = getBrandingConfig();

    const embed = new EmbedBuilder()
      .setTitle('🎨 Current Organization Settings')
      .setColor(0x9b59b6)
      .addFields(
        { name: 'Organization Name', value: cfg.orgName, inline: true },
        { name: 'Icon', value: cfg.orgIcon || 'None', inline: true },
        { name: 'Member Label', value: cfg.memberLabel, inline: true },
        { name: 'Dashboard Title', value: cfg.dashboardTitle, inline: true },
        { name: 'Footer', value: cfg.footerText || 'None', inline: false },
        { name: 'Log Channel', value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : 'Not set', inline: true },
      );

    await interaction.editReply({ embeds: [embed] });
    return;
  }
}

// ─── Modal: branding ───────────────────────────────────────────────────────────
export async function handleOrgConfigModal(interaction: ModalSubmitInteraction): Promise<void> {
  const orgName = interaction.fields.getTextInputValue('org_name').trim();
  const orgIcon = interaction.fields.getTextInputValue('org_icon').trim();
  const memberLabel = interaction.fields.getTextInputValue('member_label').trim();
  const footerText = interaction.fields.getTextInputValue('footer_text').trim();
  const dashboardTitle = interaction.fields.getTextInputValue('dashboard_title').trim();

  if (orgName) setSetting(SETTING_KEYS.ORG_NAME, orgName);
  if (orgIcon) setSetting(SETTING_KEYS.ORG_ICON, orgIcon);
  if (memberLabel) setSetting(SETTING_KEYS.MEMBER_LABEL, memberLabel);
  if (footerText) setSetting(SETTING_KEYS.FOOTER_TEXT, footerText);
  if (dashboardTitle) setSetting(SETTING_KEYS.DASHBOARD_TITLE, dashboardTitle);

  logger.info('OrgConfig', `Branding updated by ${interaction.user.tag}`);
  await interaction.reply({
    content: `✅ **Branding updated!**\n**Name**: ${orgName}\n**Label**: ${memberLabel}\n**Title**: ${dashboardTitle}`,
    ephemeral: true,
  });
}

// ─── Modal: channels & roles ───────────────────────────────────────────────────
export async function handleOrgChannelsModal(interaction: ModalSubmitInteraction): Promise<void> {
  const logChannelId = interaction.fields.getTextInputValue('log_channel_id').trim();
  const staffRoleId = interaction.fields.getTextInputValue('ticket_staff_role_id').trim();
  const ticketLogChannelId = interaction.fields.getTextInputValue('ticket_log_channel_id').trim();
  const adminRoleId = interaction.fields.getTextInputValue('bot_admin_role_id').trim();

  if (logChannelId) setSetting(SETTING_KEYS.LOG_CHANNEL_ID, logChannelId);
  if (staffRoleId) setSetting(SETTING_KEYS.TICKET_STAFF_ROLE_ID, staffRoleId);
  if (ticketLogChannelId) setSetting(SETTING_KEYS.TICKET_LOG_CHANNEL_ID, ticketLogChannelId);
  if (adminRoleId) setSetting(SETTING_KEYS.BOT_ADMIN_ROLE_ID, adminRoleId);

  logger.info('OrgConfig', `Channels/roles updated by ${interaction.user.tag}`);
  await interaction.reply({ content: '✅ Channel and role settings saved!', ephemeral: true });
}
