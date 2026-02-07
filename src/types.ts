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
  position: number; // 再生位置（秒）
}

// ===== Config =====
export interface Config {
  musicFolder: string;
  webPort: number;
  supportedFormats: string[];
}

// ===== Settings =====
export interface Settings {
  volume: number;
  loop: LoopMode;
  shuffle: boolean;
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

// ===== WebSocket Events =====
export interface WSEvents {
  player_state: PlayerState;
  library_updated: { count: number };
  error: { message: string };
}
