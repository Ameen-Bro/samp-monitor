import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  AudioPlayer,
  VoiceConnection,
  getVoiceConnection,
} from '@discordjs/voice';
import { GuildMember } from 'discord.js';
import playdl from 'play-dl';
import { GuildMusicState, QueueTrack, LoopMode } from './types';
import { logger } from '../utils/logger';
import { getSetting, setSetting, deleteSetting, SETTING_KEYS } from '../database/settings';

// Configure FFMPEG path if ffmpeg-static is available
try {
  const ffmpegStatic = require('ffmpeg-static');
  if (ffmpegStatic && !process.env.FFMPEG_PATH) {
    process.env.FFMPEG_PATH = ffmpegStatic;
  }
} catch {
  // Use system ffmpeg
}

// Initialize SoundCloud fallback token once
let soundCloudReady = false;
async function ensureSoundCloud(): Promise<boolean> {
  if (soundCloudReady) return true;
  try {
    const clientID = await playdl.getFreeClientID();
    if (clientID) {
      await playdl.setToken({ soundcloud: { client_id: clientID } });
      soundCloudReady = true;
      logger.info('Music', 'SoundCloud audio provider initialized.');
      return true;
    }
  } catch (err) {
    logger.warn('Music', `SoundCloud init warning: ${err}`);
  }
  return false;
}

// Per-guild music state store
const guildStates = new Map<string, GuildMusicState>();

function getState(guildId: string): GuildMusicState {
  if (!guildStates.has(guildId)) {
    guildStates.set(guildId, {
      guildId,
      queue: [],
      currentTrack: null,
      loopMode: 'none',
      volume: 100,
      isPaused: false,
      is247: false,
      voiceChannelId: null,
    });
  }
  return guildStates.get(guildId)!;
}

// Per-guild audio players
const audioPlayers = new Map<string, AudioPlayer>();

function getPlayer(guildId: string): AudioPlayer {
  if (!audioPlayers.has(guildId)) {
    const player = createAudioPlayer();
    audioPlayers.set(guildId, player);
    setupPlayerListeners(guildId, player);
  }
  return audioPlayers.get(guildId)!;
}

function setupPlayerListeners(guildId: string, player: AudioPlayer): void {
  player.on(AudioPlayerStatus.Idle, () => {
    const state = getState(guildId);

    if (state.loopMode === 'track' && state.currentTrack) {
      playNext(guildId).catch((err) => logger.error('Music', `Loop error: ${err}`));
      return;
    }

    if (state.loopMode === 'queue' && state.currentTrack) {
      state.queue.push(state.currentTrack);
    }

    state.currentTrack = null;
    playNext(guildId).catch((err) => logger.error('Music', `Queue advance error: ${err}`));
  });

  player.on('error', (err) => {
    logger.error('Music', `Audio player error in guild ${guildId}: ${err.message}`);
    const state = getState(guildId);
    state.currentTrack = null;
    playNext(guildId).catch(() => {});
  });
}

// ─── Join Voice Channel ────────────────────────────────────────────────────────
async function joinChannel(member: GuildMember, guildId: string): Promise<VoiceConnection | null> {
  const voiceChannel = member.voice.channel;
  if (!voiceChannel) return null;

  const existing = getVoiceConnection(guildId);
  if (existing) {
    const state = getState(guildId);
    state.voiceChannelId = voiceChannel.id;
    return existing;
  }

  try {
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: member.guild.voiceAdapterCreator,
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
    const state = getState(guildId);
    state.voiceChannelId = voiceChannel.id;

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      const st = getState(guildId);
      if (!st.is247) {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch {
          connection.destroy();
          st.currentTrack = null;
          st.queue = [];
          st.voiceChannelId = null;
        }
      }
    });

    const player = getPlayer(guildId);
    connection.subscribe(player);
    return connection;
  } catch (err) {
    logger.error('Music', `Failed to join voice channel: ${err}`);
    return null;
  }
}

// ─── Play Next Track (with Dual-Provider Fallback) ──────────────────────────────
async function playNext(guildId: string): Promise<void> {
  const state = getState(guildId);
  const player = getPlayer(guildId);

  if (state.queue.length === 0) {
    if (!state.is247) {
      const connection = getVoiceConnection(guildId);
      if (connection) connection.destroy();
      state.voiceChannelId = null;
    }
    return;
  }

  const track = state.queue.shift()!;
  state.currentTrack = track;
  state.isPaused = false;

  try {
    let stream: any = null;

    // 1. Try primary stream URL
    try {
      stream = await playdl.stream(track.url, { quality: 2 });
    } catch (primaryErr: any) {
      logger.warn('Music', `Direct stream failed for "${track.title}" (${primaryErr?.message || primaryErr}). Trying fallback provider...`);

      // 2. Fallback to SoundCloud
      await ensureSoundCloud();
      const scResults = await playdl.search(track.title, { source: { soundcloud: 'tracks' }, limit: 1 });
      if (scResults && scResults.length > 0) {
        stream = await playdl.stream(scResults[0].url);
        logger.info('Music', `Playing "${track.title}" via fallback provider.`);
      } else {
        throw primaryErr;
      }
    }

    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true,
    });
    resource.volume?.setVolume(state.volume / 100);
    player.play(resource);
    logger.info('Music', `Now playing: ${track.title} in guild ${guildId}`);
  } catch (err) {
    logger.error('Music', `Failed to stream track "${track.title}": ${err}`);
    state.currentTrack = null;
    await playNext(guildId);
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export interface PlayResult {
  success: boolean;
  error?: string;
  track?: QueueTrack;
  position?: number;
}

export async function playTrack(member: GuildMember, url: string): Promise<PlayResult> {
  const guildId = member.guild.id;

  if (!member.voice.channel) {
    return { success: false, error: 'You must be connected to a voice channel to play music.' };
  }

  // Validate and get track info
  let trackInfo: QueueTrack | null = null;

  try {
    const validated = await playdl.validate(url);

    if (validated === 'yt_video') {
      const info = await playdl.video_info(url);
      trackInfo = {
        url,
        title: info.video_details.title ?? 'Unknown',
        duration: formatDuration(info.video_details.durationInSec ?? 0),
        durationSeconds: info.video_details.durationInSec ?? 0,
        requestedBy: member.user.tag,
        requestedByUserId: member.user.id,
        thumbnail: info.video_details.thumbnails?.[0]?.url,
      };
    } else if (validated === 'yt_playlist') {
      const playlistInfo = await playdl.playlist_info(url, { incomplete: true });
      const playlistVideos: any[] = (playlistInfo as any)?.videos ?? [];
      if (!playlistInfo || playlistVideos.length === 0) {
        return { success: false, error: 'Could not load playlist or playlist is empty.' };
      }
      const state = getState(guildId);
      const connection = await joinChannel(member, guildId);
      if (!connection) return { success: false, error: 'Could not join your voice channel. Check bot permissions.' };

      for (const v of playlistVideos) {
        state.queue.push({
          url: v.url,
          title: v.title ?? 'Unknown',
          duration: formatDuration(v.durationInSec ?? 0),
          durationSeconds: v.durationInSec ?? 0,
          requestedBy: member.user.tag,
          requestedByUserId: member.user.id,
        });
      }

      if (!state.currentTrack) {
        await playNext(guildId);
      }
      return {
        success: true,
        track: { url, title: `Playlist (${playlistVideos.length} tracks)`, duration: '', durationSeconds: 0, requestedBy: member.user.tag, requestedByUserId: member.user.id },
        position: state.queue.length,
      };
    } else if (validated === 'so_track') {
      await ensureSoundCloud();
      const scInfo = await playdl.soundcloud(url);
      trackInfo = {
        url: (scInfo as any).url || url,
        title: (scInfo as any).name || 'Unknown',
        duration: formatDuration(Math.floor(((scInfo as any).durationInMs || 0) / 1000)),
        durationSeconds: Math.floor(((scInfo as any).durationInMs || 0) / 1000),
        requestedBy: member.user.tag,
        requestedByUserId: member.user.id,
        thumbnail: (scInfo as any).thumbnail,
      };
    } else {
      // Search query — Try YouTube first, fallback to SoundCloud
      let found = false;

      try {
        const results = await playdl.search(url, { limit: 1 });
        if (results && results.length > 0) {
          const r = results[0];
          trackInfo = {
            url: r.url,
            title: r.title ?? 'Unknown',
            duration: formatDuration(r.durationInSec ?? 0),
            durationSeconds: r.durationInSec ?? 0,
            requestedBy: member.user.tag,
            requestedByUserId: member.user.id,
            thumbnail: r.thumbnails?.[0]?.url,
          };
          found = true;
        }
      } catch {
        // YouTube search rate limited, try SoundCloud
      }

      if (!found) {
        await ensureSoundCloud();
        const scResults = await playdl.search(url, { source: { soundcloud: 'tracks' }, limit: 1 });
        if (scResults && scResults.length > 0) {
          const sc = scResults[0];
          trackInfo = {
            url: sc.url,
            title: sc.name ?? 'Unknown',
            duration: formatDuration(sc.durationInSec ?? 0),
            durationSeconds: sc.durationInSec ?? 0,
            requestedBy: member.user.tag,
            requestedByUserId: member.user.id,
            thumbnail: sc.thumbnail,
          };
          found = true;
        }
      }

      if (!found || !trackInfo) {
        return { success: false, error: 'No songs found matching your search. Please try another title.' };
      }
    }
  } catch (err: any) {
    // If YouTube throws rate limit or error during video_info, try soundcloud search
    try {
      await ensureSoundCloud();
      const scResults = await playdl.search(url, { source: { soundcloud: 'tracks' }, limit: 1 });
      if (scResults && scResults.length > 0) {
        const sc = scResults[0];
        trackInfo = {
          url: sc.url,
          title: sc.name ?? 'Unknown',
          duration: formatDuration(sc.durationInSec ?? 0),
          durationSeconds: sc.durationInSec ?? 0,
          requestedBy: member.user.tag,
          requestedByUserId: member.user.id,
          thumbnail: sc.thumbnail,
        };
      } else {
        return { success: false, error: `Failed to load song: ${err?.message || err}` };
      }
    } catch {
      return { success: false, error: `Failed to load song: ${err?.message || err}` };
    }
  }

  if (!trackInfo) {
    return { success: false, error: 'Could not resolve track information.' };
  }

  const connection = await joinChannel(member, guildId);
  if (!connection) {
    return { success: false, error: 'Could not connect to your voice channel. Ensure the bot has "Connect" and "Speak" permissions!' };
  }

  const state = getState(guildId);
  state.queue.push(trackInfo);

  const position = state.queue.length;

  if (!state.currentTrack) {
    await playNext(guildId);
    return { success: true, track: trackInfo, position: 0 };
  }

  return { success: true, track: trackInfo, position };
}

export function pausePlayback(guildId: string): boolean {
  const player = audioPlayers.get(guildId);
  if (!player) return false;
  const state = getState(guildId);
  if (state.isPaused) return false;
  player.pause();
  state.isPaused = true;
  return true;
}

export function resumePlayback(guildId: string): boolean {
  const player = audioPlayers.get(guildId);
  if (!player) return false;
  const state = getState(guildId);
  if (!state.isPaused) return false;
  player.unpause();
  state.isPaused = false;
  return true;
}

export function skipTrack(guildId: string): QueueTrack | null {
  const player = audioPlayers.get(guildId);
  if (!player) return null;
  const state = getState(guildId);
  const skipped = state.currentTrack;
  state.loopMode = state.loopMode === 'track' ? 'none' : state.loopMode;
  player.stop(true);
  return skipped;
}

export function stopPlayback(guildId: string): void {
  const player = audioPlayers.get(guildId);
  const state = getState(guildId);
  state.queue = [];
  state.currentTrack = null;
  state.loopMode = 'none';
  state.is247 = false;
  player?.stop(true);
  const connection = getVoiceConnection(guildId);
  if (connection) connection.destroy();
  state.voiceChannelId = null;
}

export function getQueue(guildId: string): { current: QueueTrack | null; queue: QueueTrack[]; loopMode: LoopMode; volume: number; isPaused: boolean } {
  const state = getState(guildId);
  return {
    current: state.currentTrack,
    queue: state.queue,
    loopMode: state.loopMode,
    volume: state.volume,
    isPaused: state.isPaused,
  };
}

export function setVolume(guildId: string, volume: number): boolean {
  const vol = Math.max(0, Math.min(200, volume));
  const state = getState(guildId);
  state.volume = vol;

  const player = audioPlayers.get(guildId);
  if (player) {
    const resource = (player as any)._resource;
    if (resource?.volume) resource.volume.setVolume(vol / 100);
  }
  return true;
}

export function setLoopMode(guildId: string, mode: LoopMode): void {
  const state = getState(guildId);
  state.loopMode = mode;
}

export function shuffleQueue(guildId: string): boolean {
  const state = getState(guildId);
  if (state.queue.length === 0) return false;
  for (let i = state.queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.queue[i], state.queue[j]] = [state.queue[j], state.queue[i]];
  }
  return true;
}

// ─── 24/7 Mode ────────────────────────────────────────────────────────────────
export async function setup247Mode(member: GuildMember): Promise<{ success: boolean; error?: string }> {
  if (!member.voice.channel) {
    return { success: false, error: 'You must be in a voice channel.' };
  }

  const guildId = member.guild.id;
  const state = getState(guildId);

  const connection = await joinChannel(member, guildId);
  if (!connection) return { success: false, error: 'Could not join your voice channel.' };

  state.is247 = true;
  setSetting(SETTING_KEYS.MUSIC_247_ENABLED, '1');
  setSetting(SETTING_KEYS.MUSIC_247_CHANNEL_ID, member.voice.channel.id);
  setSetting(SETTING_KEYS.MUSIC_247_GUILD_ID, guildId);

  return { success: true };
}

export function disable247Mode(guildId: string): void {
  const state = getState(guildId);
  state.is247 = false;
  deleteSetting(SETTING_KEYS.MUSIC_247_ENABLED);
  deleteSetting(SETTING_KEYS.MUSIC_247_CHANNEL_ID);
  deleteSetting(SETTING_KEYS.MUSIC_247_GUILD_ID);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
