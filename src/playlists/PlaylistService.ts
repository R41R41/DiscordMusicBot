import type { Playlist } from '../types.js';
import { loadPlaylists, savePlaylists } from '../utils/config.js';

export class PlaylistService {
  private playlists: Playlist[] = [];

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      this.playlists = loadPlaylists();
    } catch (error) {
      console.warn('Failed to load playlists, starting with empty list');
      this.playlists = [];
    }
  }

  private save(): void {
    savePlaylists(this.playlists);
  }

  // ===== CRUD =====
  getAll(): Playlist[] {
    return [...this.playlists];
  }

  get(name: string): Playlist | undefined {
    return this.playlists.find((p) => p.name === name);
  }

  create(name: string): Playlist {
    if (this.playlists.some((p) => p.name === name)) {
      throw new Error(`Playlist already exists: ${name}`);
    }

    const playlist: Playlist = {
      name,
      trackIds: [],
    };
    this.playlists.push(playlist);
    this.save();
    return playlist;
  }

  delete(name: string): void {
    const index = this.playlists.findIndex((p) => p.name === name);
    if (index === -1) {
      throw new Error(`Playlist not found: ${name}`);
    }

    this.playlists.splice(index, 1);
    this.save();
  }

  // ===== 曲操作 =====
  addTrack(playlistName: string, trackId: string): void {
    const playlist = this.get(playlistName);
    if (!playlist) {
      throw new Error(`Playlist not found: ${playlistName}`);
    }

    if (!playlist.trackIds.includes(trackId)) {
      playlist.trackIds.push(trackId);
      this.save();
    }
  }

  removeTrack(playlistName: string, trackId: string): void {
    const playlist = this.get(playlistName);
    if (!playlist) {
      throw new Error(`Playlist not found: ${playlistName}`);
    }

    const index = playlist.trackIds.indexOf(trackId);
    if (index !== -1) {
      playlist.trackIds.splice(index, 1);
      this.save();
    }
  }

  // ===== 並び替え =====
  reorder(playlistName: string, trackIds: string[]): void {
    const playlist = this.get(playlistName);
    if (!playlist) {
      throw new Error(`Playlist not found: ${playlistName}`);
    }

    // 新しい順序に含まれるトラックのみを保持
    playlist.trackIds = trackIds.filter((id) => playlist.trackIds.includes(id));
    this.save();
  }
}
