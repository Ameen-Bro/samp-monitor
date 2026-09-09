import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { getActiveOfficers } from '../database/officers';
import { getOfficerStats, getActiveSession } from '../database/sessions';
import { getLastSuccessfulQuery } from '../database/queryLogs';
import { getBrandingConfig, getServerConfig } from '../database/settings';
import { SampServerStatus, ServerPlayer } from '../samp/types';
import { formatDuration, formatDateTime, formatTimeOnly } from '../utils/time';
import { normalizeName } from '../utils/normalizeName';

const OFFICERS_PER_PAGE = 10;

export interface DashboardPayload {
  embeds: [EmbedBuilder];
  components: ActionRowBuilder<ButtonBuilder>[];
}

/**
 * Builds the complete dashboard payload (embed and buttons) for a specific page.
 * All labels come from the settings DB — fully rebrandable.
 */
export function buildDashboard(
  status: SampServerStatus | null,
  page: number = 1
): DashboardPayload {
  const branding = getBrandingConfig();
  const serverCfg = getServerConfig();
  const activeOfficers = getActiveOfficers();
  const lastSuccess = getLastSuccessfulQuery();

  // Map of online player names
  const onlinePlayers = status?.players ?? [];
  const onlineNameMap = new Map<string, ServerPlayer>();
  for (const p of onlinePlayers) {
    onlineNameMap.set(normalizeName(p.name), p);
  }

  // Calculate stats for each officer
  const officerStatsList = activeOfficers.map((officer) => {
    const isOnline =
      onlineNameMap.has(officer.normalized_name) ||
      (getActiveSession(officer.id) !== null && status?.online === false);
    return getOfficerStats(officer.id, officer.ig_name, isOnline);
  });

  // Sort: Online first, then by today's patrol time descending
  officerStatsList.sort((a, b) => {
    if (a.isOnline && !b.isOnline) return -1;
    if (!a.isOnline && b.isOnline) return 1;
    return b.todaySeconds - a.todaySeconds;
  });

  const totalOfficers = officerStatsList.length;
  const onlineCount = officerStatsList.filter((s) => s.isOnline).length;
  const offlineCount = totalOfficers - onlineCount;
  const totalTimeTodaySeconds = officerStatsList.reduce((acc, s) => acc + s.todaySeconds, 0);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(totalOfficers / OFFICERS_PER_PAGE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (currentPage - 1) * OFFICERS_PER_PAGE;
  const pageOfficers = officerStatsList.slice(startIndex, startIndex + OFFICERS_PER_PAGE);

  // Server query banner
  let serverBanner = '';
  if (!serverCfg.ip || !serverCfg.port) {
    serverBanner = `⚙️ **Server not configured.** Use \`/server-config set\` to connect a SA-MP/Open.MP server.`;
  } else if (status && status.online && status.info) {
    serverBanner = `🌐 **Server**: 🟢 Online (${status.latencyMs}ms) • **Players**: ${status.info.players}/${status.info.maxPlayers}`;
  } else {
    const lastSuccessTimeStr = lastSuccess ? formatTimeOnly(lastSuccess.queried_at) : 'None';
    serverBanner = `🌐 **Server**: 🔴 Query Error • **Last Success**: ${lastSuccessTimeStr}`;
  }

  // Member cards
  let memberSection = '';
  if (pageOfficers.length === 0) {
    const addCmd = '`/add-member`';
    memberSection = `_No ${branding.memberLabel.toLowerCase()}s registered yet. Use ${addCmd} to register._\n`;
  } else {
    const lines: string[] = [];
    for (const off of pageOfficers) {
      if (off.isOnline) {
        lines.push(
          `🟢 **${off.igName}**\n` +
          `${branding.onlineLabel} — Session: **${formatDuration(off.currentSessionSeconds)}**\n` +
          `Today: **${formatDuration(off.todaySeconds)}**\n`
        );
      } else {
        lines.push(
          `🔴 **${off.igName}**\n` +
          `${branding.offlineLabel}\n` +
          `Today: **${formatDuration(off.todaySeconds)}**\n`
        );
      }
    }
    memberSection = lines.join('\n');
  }

  const lastCheckedStr = status?.lastQueriedAt
    ? formatDateTime(status.lastQueriedAt)
    : formatDateTime(new Date());

  const summarySection =
    `━━━━━━━━━━━━━━━━━━\n` +
    `👥 ${branding.memberLabel}s: **${totalOfficers}**\n` +
    `🟢 Online: **${onlineCount}**\n` +
    `🔴 Offline: **${offlineCount}**\n\n` +
    `⏱️ Total Time Today: **${formatDuration(totalTimeTodaySeconds)}**\n\n` +
    `*Last checked:*\n${lastCheckedStr}` +
    (totalPages > 1 ? `\n\n📄 **Page ${currentPage} / ${totalPages}**` : '');

  const titleStr = `${branding.orgIcon} ${branding.orgName} — ${branding.dashboardTitle}`;
  const footerStr = serverCfg.ip
    ? `${branding.footerText} • ${serverCfg.ip}:${serverCfg.port}`
    : branding.footerText;

  const embed = new EmbedBuilder()
    .setTitle(titleStr)
    .setColor(onlineCount > 0 ? 0x2ecc71 : 0x3498db)
    .setDescription(`${serverBanner}\n\n${memberSection}\n${summarySection}`)
    .setFooter({ text: footerStr });

  // Action Rows
  const primaryRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_refresh')
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('btn_today')
      .setLabel('📊 Today')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_weekly')
      .setLabel('📅 Weekly')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_monthly')
      .setLabel('📆 Monthly')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_leaderboard')
      .setLabel('🏆 Leaderboard')
      .setStyle(ButtonStyle.Success)
  );

  const rows: ActionRowBuilder<ButtonBuilder>[] = [primaryRow];

  if (totalPages > 1) {
    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_page_${currentPage - 1}`)
        .setLabel('⬅️ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage <= 1),
      new ButtonBuilder()
        .setCustomId('btn_page_info')
        .setLabel(`Page ${currentPage}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`btn_page_${currentPage + 1}`)
        .setLabel('➡️ Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= totalPages)
    );
    rows.push(navRow);
  }

  return { embeds: [embed], components: rows };
}

/**
 * Builds the Leaderboard Embed with dynamic branding.
 */
export function buildLeaderboardEmbed(): EmbedBuilder {
  const branding = getBrandingConfig();
  const activeOfficers = getActiveOfficers();
  const statsList = activeOfficers.map((o) => getOfficerStats(o.id, o.ig_name, false));

  statsList.sort((a, b) => b.lifetimeSeconds - a.lifetimeSeconds);

  const medals = ['🥇', '🥈', '🥉'];
  const lines: string[] = [];

  if (statsList.length === 0) {
    lines.push(`_No ${branding.memberLabel.toLowerCase()}s registered yet._`);
  } else {
    statsList.forEach((stat, index) => {
      const rank = index < 3 ? medals[index] : `**#${index + 1}**`;
      lines.push(`${rank} **${stat.igName}** — ${formatDuration(stat.lifetimeSeconds)}`);
    });
  }

  return new EmbedBuilder()
    .setTitle(`🏆 ${branding.orgName.toUpperCase()} LEADERBOARD`)
    .setColor(0xf1c40f)
    .setDescription(lines.join('\n') || 'No records')
    .setFooter({ text: 'All-time accumulated activity time' });
}

/**
 * Builds Today/Weekly/Monthly Stats Embed with dynamic branding.
 */
export function buildPeriodEmbed(period: 'today' | 'weekly' | 'monthly'): EmbedBuilder {
  const branding = getBrandingConfig();
  const activeOfficers = getActiveOfficers();
  const statsList = activeOfficers.map((o) => getOfficerStats(o.id, o.ig_name, false));

  let title = '';
  let color = 0x3498db;
  let getSecs: (s: any) => number;

  if (period === 'today') {
    title = `📊 TODAY'S ${branding.orgName.toUpperCase()} STATS`;
    color = 0x2ecc71;
    getSecs = (s) => s.todaySeconds;
  } else if (period === 'weekly') {
    title = `📅 THIS WEEK — ${branding.orgName.toUpperCase()}`;
    color = 0x9b59b6;
    getSecs = (s) => s.weekSeconds;
  } else {
    title = `📆 THIS MONTH — ${branding.orgName.toUpperCase()}`;
    color = 0xe67e22;
    getSecs = (s) => s.monthSeconds;
  }

  statsList.sort((a, b) => getSecs(b) - getSecs(a));

  const totalTimeSecs = statsList.reduce((acc, s) => acc + getSecs(s), 0);
  const lines: string[] = [];

  for (const s of statsList) {
    lines.push(`• **${s.igName}**: ${formatDuration(getSecs(s))}`);
  }

  lines.push('\n━━━━━━━━━━━━━━━━━━');
  lines.push(`⏱️ **Total Time**: ${formatDuration(totalTimeSecs)}`);

  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setDescription(lines.join('\n'))
    .setTimestamp();
}
