/**
 * Music slash commands:
 * /play, /pause, /resume, /skip, /stop, /queue, /nowplaying, /volume, /loop, /shuffle, /247
 */
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
} from 'discord.js';
import {
  playTrack,
  pausePlayback,
  resumePlayback,
  skipTrack,
  stopPlayback,
  getQueue,
  setVolume,
  setLoopMode,
  shuffleQueue,
  setup247Mode,
  disable247Mode,
} from '../music/player';
import { getSetting, setSetting, SETTING_KEYS } from '../database/settings';
import { logger } from '../utils/logger';

export async function handleMusicCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const { commandName } = interaction;
  const guildId = interaction.guildId!;
  const member = interaction.member as GuildMember;

  try {
    // ── /play ──────────────────────────────────────────────────────────────
    if (commandName === 'play') {
      await interaction.deferReply();
      const query = interaction.options.getString('query', true);
      const result = await playTrack(member, query);

      if (!result.success) {
        await interaction.editReply({ content: `❌ ${result.error}` });
        return;
      }

      const track = result.track!;
      const isNowPlaying = result.position === 0;

      const embed = new EmbedBuilder()
        .setColor(0x1db954)
        .setTitle(isNowPlaying ? '🎵 Now Playing' : '📋 Added to Queue')
        .setDescription(`**[${track.title}](${track.url})**`)
        .addFields(
          { name: 'Duration', value: track.duration || 'Unknown', inline: true },
          { name: 'Requested by', value: track.requestedBy, inline: true },
          ...(isNowPlaying ? [] : [{ name: 'Position', value: `#${result.position}`, inline: true }])
        );

      if (track.thumbnail) embed.setThumbnail(track.thumbnail);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ── /pause ─────────────────────────────────────────────────────────────
    if (commandName === 'pause') {
      const paused = pausePlayback(guildId);
      await interaction.reply(paused ? '⏸️ Paused.' : '⚠️ Nothing is playing or already paused.');
      return;
    }

    // ── /resume ────────────────────────────────────────────────────────────
    if (commandName === 'resume') {
      const resumed = resumePlayback(guildId);
      await interaction.reply(resumed ? '▶️ Resumed.' : '⚠️ Nothing is paused.');
      return;
    }

    // ── /skip ──────────────────────────────────────────────────────────────
    if (commandName === 'skip') {
      const skipped = skipTrack(guildId);
      await interaction.reply(skipped ? `⏭️ Skipped **${skipped.title}**.` : '⚠️ Nothing is currently playing.');
      return;
    }

    // ── /stop ──────────────────────────────────────────────────────────────
    if (commandName === 'stop') {
      stopPlayback(guildId);
      await interaction.reply('⏹️ Stopped playback and cleared the queue.');
      return;
    }

    // ── /nowplaying ────────────────────────────────────────────────────────
    if (commandName === 'nowplaying') {
      const { current, volume, loopMode, isPaused } = getQueue(guildId);
      if (!current) {
        await interaction.reply({ content: '⚠️ Nothing is currently playing.', ephemeral: true });
        return;
      }

      const loopStr = loopMode === 'track' ? '🔂 Track' : loopMode === 'queue' ? '🔁 Queue' : 'None';
      const embed = new EmbedBuilder()
        .setColor(0x1db954)
        .setTitle('🎵 Now Playing')
        .setDescription(`**[${current.title}](${current.url})**`)
        .addFields(
          { name: 'Duration', value: current.duration || 'Unknown', inline: true },
          { name: 'Volume', value: `${volume}%`, inline: true },
          { name: 'Loop', value: loopStr, inline: true },
          { name: 'Status', value: isPaused ? '⏸️ Paused' : '▶️ Playing', inline: true },
          { name: 'Requested by', value: current.requestedBy, inline: true }
        );

      if (current.thumbnail) embed.setThumbnail(current.thumbnail);
      await interaction.reply({ embeds: [embed] });
      return;
    }

    // ── /queue ─────────────────────────────────────────────────────────────
    if (commandName === 'queue') {
      const { current, queue, loopMode } = getQueue(guildId);
      if (!current && queue.length === 0) {
        await interaction.reply({ content: '📋 The queue is empty.', ephemeral: true });
        return;
      }

      const loopStr = loopMode === 'track' ? '🔂 Track' : loopMode === 'queue' ? '🔁 Queue' : 'None';
      const lines: string[] = [];
      if (current) lines.push(`▶️ **Now:** ${current.title}`);
      const upcoming = queue.slice(0, 15);
      upcoming.forEach((t, i) => lines.push(`${i + 1}. ${t.title} — ${t.duration}`));
      if (queue.length > 15) lines.push(`... and ${queue.length - 15} more`);

      const embed = new EmbedBuilder()
        .setTitle('📋 Music Queue')
        .setColor(0x3498db)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Loop: ${loopStr} • ${queue.length} track(s) in queue` });

      await interaction.reply({ embeds: [embed] });
      return;
    }

    // ── /volume ────────────────────────────────────────────────────────────
    if (commandName === 'volume') {
      const vol = interaction.options.getInteger('level', true);
      setVolume(guildId, vol);
      await interaction.reply(`🔊 Volume set to **${vol}%**.`);
      return;
    }

    // ── /loop ──────────────────────────────────────────────────────────────
    if (commandName === 'loop') {
      const mode = interaction.options.getString('mode', true) as 'none' | 'track' | 'queue';
      setLoopMode(guildId, mode);
      const labels: Record<string, string> = { none: '➡️ Off', track: '🔂 Track', queue: '🔁 Queue' };
      await interaction.reply(`Loop mode set to: **${labels[mode] || mode}**`);
      return;
    }

    // ── /shuffle ───────────────────────────────────────────────────────────
    if (commandName === 'shuffle') {
      const shuffled = shuffleQueue(guildId);
      await interaction.reply(shuffled ? '🔀 Queue shuffled!' : '⚠️ Queue is empty.');
      return;
    }

    // ── /247 ───────────────────────────────────────────────────────────────
    if (commandName === '247') {
      const sub = interaction.options.getSubcommand();

      if (sub === 'setup' || sub === 'enable') {
        await interaction.deferReply({ ephemeral: true });
        const result = await setup247Mode(member);
        if (!result.success) {
          await interaction.editReply({ content: `❌ ${result.error}` });
          return;
        }
        await interaction.editReply({ content: '✅ **24/7 mode enabled!** The bot will stay in your voice channel.' });
        return;
      }

      if (sub === 'disable') {
        disable247Mode(guildId);
        await interaction.reply({ content: '🔕 **24/7 mode disabled.** Bot will leave when queue ends.', ephemeral: true });
        return;
      }

      if (sub === 'status') {
        const enabled = getSetting(SETTING_KEYS.MUSIC_247_ENABLED) === '1';
        const chId = getSetting(SETTING_KEYS.MUSIC_247_CHANNEL_ID);
        await interaction.reply({
          content: enabled
            ? `✅ **24/7 mode is ON** — Channel: ${chId ? `<#${chId}>` : 'Unknown'}`
            : '❌ **24/7 mode is OFF**',
          ephemeral: true,
        });
        return;
      }
    }
  } catch (err) {
    logger.error('Music', `Error in command ${commandName}`, err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
    } else if (interaction.deferred) {
      await interaction.editReply({ content: '❌ An error occurred.' });
    }
  }
}
