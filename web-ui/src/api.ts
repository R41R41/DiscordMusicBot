import { io, Socket } from 'socket.io-client';
import type { Track, Playlist, PlayerState, GuildInfo, ChannelInfo, LoopMode } from './types';

const API_BASE = 'http://localhost:3001';

// ===== HTTP API =====
async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || 'Request failed');
  }
  return res.json();
}

// Discord
export const getGuilds = () => fetchJson<GuildInfo[]>('/api/discord/guilds');
export const getChannels = (guildId: string) =>
  fetchJson<ChannelInfo[]>(`/api/discord/guilds/${guildId}/channels`);

// Library
export const getLibrary = (query?: string) =>
  fetchJson<Track[]>(`/api/library${query ? `?query=${encodeURIComponent(query)}` : ''}`);
export const rescanLibrary = () =>
  fetchJson<{ success: boolean; count: number }>('/api/library/rescan', { method: 'POST' });

// Playlists
export const getPlaylists = () => fetchJson<Playlist[]>('/api/playlists');
export const getPlaylist = (name: string) =>
  fetchJson<Playlist & { tracks: Track[] }>(`/api/playlists/${encodeURIComponent(name)}`);
export const createPlaylist = (name: string) =>
  fetchJson<Playlist>('/api/playlists', { method: 'POST', body: JSON.stringify({ name }) });
export const deletePlaylist = (name: string) =>
  fetchJson<{ success: boolean }>(`/api/playlists/${encodeURIComponent(name)}`, { method: 'DELETE' });
export const addTrackToPlaylist = (playlistName: string, trackId: string) =>
  fetchJson<{ success: boolean }>(`/api/playlists/${encodeURIComponent(playlistName)}/tracks`, {
    method: 'POST',
    body: JSON.stringify({ trackId }),
  });
export const addTracksToPlaylist = (playlistName: string, trackIds: string[]) =>
  fetchJson<{ success: boolean }>(`/api/playlists/${encodeURIComponent(playlistName)}/tracks`, {
    method: 'POST',
    body: JSON.stringify({ trackIds }),
  });
export const removeTrackFromPlaylist = (playlistName: string, trackId: string) =>
  fetchJson<{ success: boolean }>(
    `/api/playlists/${encodeURIComponent(playlistName)}/tracks/${trackId}`,
    { method: 'DELETE' }
  );
export const reorderPlaylist = (playlistName: string, trackIds: string[]) =>
  fetchJson<{ success: boolean }>(`/api/playlists/${encodeURIComponent(playlistName)}/order`, {
    method: 'PUT',
    body: JSON.stringify({ trackIds }),
  });

// Player
export const getPlayerState = () => fetchJson<PlayerState>('/api/player/state');
export const joinChannel = (guildId: string, channelId: string) =>
  fetchJson<{ success: boolean }>('/api/player/join', {
    method: 'POST',
    body: JSON.stringify({ guildId, channelId }),
  });
export const leaveChannel = () =>
  fetchJson<{ success: boolean }>('/api/player/leave', { method: 'POST' });
export const playTrack = (trackId: string) =>
  fetchJson<{ success: boolean }>('/api/player/play', {
    method: 'POST',
    body: JSON.stringify({ trackId }),
  });
export const queueTrack = (trackId: string) =>
  fetchJson<{ success: boolean }>('/api/player/queue', {
    method: 'POST',
    body: JSON.stringify({ trackId }),
  });
export const queueTracks = (trackIds: string[]) =>
  fetchJson<{ success: boolean }>('/api/player/queue', {
    method: 'POST',
    body: JSON.stringify({ trackIds }),
  });
export const playPlaylist = (name: string, mode: 'replace' | 'append' = 'replace') =>
  fetchJson<{ success: boolean }>('/api/player/playlist', {
    method: 'POST',
    body: JSON.stringify({ name, mode }),
  });
export const pausePlayer = () =>
  fetchJson<{ success: boolean }>('/api/player/pause', { method: 'POST' });
export const resumePlayer = () =>
  fetchJson<{ success: boolean }>('/api/player/resume', { method: 'POST' });
export const skipTrack = () =>
  fetchJson<{ success: boolean }>('/api/player/skip', { method: 'POST' });
export const stopPlayer = () =>
  fetchJson<{ success: boolean }>('/api/player/stop', { method: 'POST' });
export const seekPlayer = (position: number) =>
  fetchJson<{ success: boolean }>('/api/player/seek', {
    method: 'POST',
    body: JSON.stringify({ position }),
  });
export const clearQueue = () =>
  fetchJson<{ success: boolean }>('/api/player/queue', { method: 'DELETE' });
export const playNextInQueue = (trackId: string) =>
  fetchJson<{ success: boolean }>('/api/player/queue/next', {
    method: 'POST',
    body: JSON.stringify({ trackId }),
  });
export const playNextInQueueBulk = (trackIds: string[]) =>
  fetchJson<{ success: boolean }>('/api/player/queue/next', {
    method: 'POST',
    body: JSON.stringify({ trackIds }),
  });
export const removeFromQueue = (index: number) =>
  fetchJson<{ success: boolean }>(`/api/player/queue/${index}`, { method: 'DELETE' });
export const reorderQueue = (fromIndex: number, toIndex: number) =>
  fetchJson<{ success: boolean }>('/api/player/queue/reorder', {
    method: 'PUT',
    body: JSON.stringify({ fromIndex, toIndex }),
  });
export const updateSettings = (settings: { volume?: number; loop?: LoopMode; shuffle?: boolean }) =>
  fetchJson<{ success: boolean }>('/api/player/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
  });

// Settings
export interface AppSettings {
  discordToken: string;
  musicFolder: string;
  webPort: number;
  hasToken: boolean;
  isConfigured: boolean;
  currentMusicFolder: string;
}

export interface SystemStatus {
  discordConnected: boolean;
  musicFolder: string;
  trackCount: number;
  isConfigured: boolean;
  version: string;
  dataDir: string;
}

export const getSettings = () => fetchJson<AppSettings>('/api/settings');
export const saveSettings = (settings: { discordToken?: string; musicFolder?: string; webPort?: number }) =>
  fetchJson<{ success: boolean; config: AppSettings; needsRestart: boolean }>('/api/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
  });
export const openMusicFolder = () =>
  fetchJson<{ success: boolean; path: string }>('/api/system/open-folder', { method: 'POST' });
export const getSystemStatus = () => fetchJson<SystemStatus>('/api/system/status');

// ===== WebSocket =====
let socket: Socket | null = null;

export function connectWebSocket(onStateChange: (state: PlayerState) => void): Socket {
  if (socket) return socket;

  socket = io(API_BASE);

  socket.on('connect', () => {
    console.log('WebSocket connected');
  });

  socket.on('player_state', (state: PlayerState) => {
    onStateChange(state);
  });

  socket.on('disconnect', () => {
    console.log('WebSocket disconnected');
  });

  return socket;
}

export function disconnectWebSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
