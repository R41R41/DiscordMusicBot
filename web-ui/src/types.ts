// ===== Track =====
export interface Track {
  id: string;
  title: string;
  path: string;
  duration: number; // 秒
}

// ===== Playlist =====
export interface Playlist {
  name: string;
  trackIds: string[];
  tracks?: Track[];
}

// ===== Player State =====
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';
export type LoopMode = 'off' | 'one' | 'all';

export interface PlayerState {
  connection: ConnectionStatus;
  guildId: string | null;
  channelId: string | null;
  current: Track | null;
  queue: Track[];
  paused: boolean;
  loop: LoopMode;
  shuffle: boolean;
  volume: number;
  position: number;
}

// ===== Guild/Channel Info =====
export interface GuildInfo {
  id: string;
  name: string;
}

export interface ChannelInfo {
  id: string;
  name: string;
  guildId: string;
}
