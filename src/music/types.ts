// Music system types

export interface QueueTrack {
  url: string;
  title: string;
  duration: string; // formatted HH:MM:SS
  durationSeconds: number;
  requestedBy: string; // Discord user tag
  requestedByUserId: string;
  thumbnail?: string;
}

export type LoopMode = 'none' | 'track' | 'queue';

export interface GuildMusicState {
  guildId: string;
  queue: QueueTrack[];
  currentTrack: QueueTrack | null;
  loopMode: LoopMode;
  volume: number; // 0–200, default 100
  isPaused: boolean;
  is247: boolean;
  voiceChannelId: string | null;
}
