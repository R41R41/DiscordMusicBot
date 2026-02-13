import { readdirSync, readFileSync, writeFileSync, unlinkSync, renameSync, existsSync, mkdirSync } from 'fs';
import { join, basename, extname } from 'path';
import type { Playlist } from '../types.js';

export class PlaylistService {
  private playlists: Playlist[] = [];
  private musicFolder: string;
  private playlistsDir: string;

  constructor(musicFolder: string, dataDir?: string) {
    this.musicFolder = musicFolder;
    this.playlistsDir = join(musicFolder, 'playlists');
    console.log(`[Playlist] playlistsDir: ${this.playlistsDir}`);
    this.load();

    // 旧 data/playlists.json からの移行
    if (dataDir) {
      this.migrateFromJson(dataDir);
    }
  }

  // ===== 旧形式 (data/playlists.json) からの移行 =====
  private migrateFromJson(dataDir: string): void {
    const oldPath = join(dataDir, 'playlists.json');
    if (!existsSync(oldPath)) return;

    try {
      console.log(`[Playlist] Found old playlists.json at ${oldPath}, migrating...`);
      const raw = readFileSync(oldPath, 'utf-8');
      const data = JSON.parse(raw);
      const oldPlaylists: Playlist[] = data.playlists || [];
      let migrated = 0;

      for (const pl of oldPlaylists) {
        if (!pl.name) continue;
        // 同名のプレイリストが既にあればスキップ
        if (this.playlists.some(p => p.name === pl.name)) {
          console.log(`[Playlist] Skipping migration for "${pl.name}" (already exists)`);
          continue;
        }
        const playlist: Playlist = { name: pl.name, trackIds: pl.trackIds || [] };
        this.playlists.push(playlist);
        this.savePlaylist(playlist);
        migrated++;
        console.log(`[Playlist] Migrated "${pl.name}" (${playlist.trackIds.length} tracks)`);
      }

      if (migrated > 0) {
        console.log(`[Playlist] Migration complete: ${migrated} playlists migrated`);
      }
      // 旧ファイルをバックアップにリネーム（再移行防止）
      const bakPath = oldPath + '.bak';
      renameSync(oldPath, bakPath);
      console.log(`[Playlist] Old file renamed to ${bakPath}`);
    } catch (error) {
      console.error('[Playlist] Failed to migrate old playlists:', error);
    }
  }

  // ===== .m3u ファイルからプレイリストを読み込み =====
  private load(): void {
    try {
      // playlistsフォルダがなければ作成
      if (!existsSync(this.playlistsDir)) {
        console.log(`[Playlist] Creating playlists directory: ${this.playlistsDir}`);
        mkdirSync(this.playlistsDir, { recursive: true });
      }

      const files = readdirSync(this.playlistsDir);
      this.playlists = [];

      for (const file of files) {
        if (extname(file).toLowerCase() !== '.m3u') continue;

        const name = basename(file, '.m3u');
        const filePath = join(this.playlistsDir, file);
        
        try {
          const content = readFileSync(filePath, 'utf-8');
          const trackIds = content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
          
          this.playlists.push({ name, trackIds });
          console.log(`[Playlist] Loaded "${name}" (${trackIds.length} tracks) from ${file}`);
        } catch (error) {
          console.error(`[Playlist] Failed to load playlist "${name}":`, error);
        }
      }

      console.log(`[Playlist] Total: ${this.playlists.length} playlists loaded from ${this.playlistsDir}`);
    } catch (error) {
      console.error('[Playlist] Failed to load playlists:', error);
      this.playlists = [];
    }
  }

  // ===== 個別のプレイリストを .m3u ファイルに保存 =====
  private savePlaylist(playlist: Playlist): void {
    try {
      if (!existsSync(this.playlistsDir)) {
        mkdirSync(this.playlistsDir, { recursive: true });
      }

      const filePath = join(this.playlistsDir, `${playlist.name}.m3u`);
      const content = `#EXTM3U\n#PLAYLIST:${playlist.name}\n${playlist.trackIds.join('\n')}\n`;
      writeFileSync(filePath, content, 'utf-8');
      console.log(`[Playlist] Saved "${playlist.name}" (${playlist.trackIds.length} tracks) to ${filePath}`);
    } catch (error) {
      console.error(`[Playlist] Failed to save playlist "${playlist.name}":`, error);
      throw error;
    }
  }

  // ===== プレイリストの .m3u ファイルを削除 =====
  private deletePlaylistFile(name: string): void {
    try {
      const filePath = join(this.playlistsDir, `${name}.m3u`);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        console.log(`[Playlist] Deleted file: ${filePath}`);
      }
    } catch (error) {
      console.error(`[Playlist] Failed to delete playlist file "${name}":`, error);
    }
  }

  // ===== CRUD =====
  getAll(): Playlist[] {
    return [...this.playlists];
  }

  get(name: string): Playlist | undefined {
    return this.playlists.find((p) => p.name === name);
  }

  create(name: string): Playlist {
    console.log(`[Playlist] Creating playlist: "${name}"`);
    if (this.playlists.some((p) => p.name === name)) {
      throw new Error(`Playlist already exists: ${name}`);
    }

    const playlist: Playlist = {
      name,
      trackIds: [],
    };
    this.playlists.push(playlist);
    this.savePlaylist(playlist);
    console.log(`[Playlist] Created playlist: "${name}" (total: ${this.playlists.length})`);
    return playlist;
  }

  delete(name: string): void {
    console.log(`[Playlist] Deleting playlist: "${name}"`);
    const index = this.playlists.findIndex((p) => p.name === name);
    if (index === -1) {
      throw new Error(`Playlist not found: ${name}`);
    }

    this.playlists.splice(index, 1);
    this.deletePlaylistFile(name);
  }

  // ===== 曲操作 =====
  addTrack(playlistName: string, trackId: string): void {
    const playlist = this.get(playlistName);
    if (!playlist) {
      throw new Error(`Playlist not found: ${playlistName}`);
    }

    if (!playlist.trackIds.includes(trackId)) {
      playlist.trackIds.push(trackId);
      this.savePlaylist(playlist);
      console.log(`[Playlist] Added track ${trackId} to "${playlistName}" (now ${playlist.trackIds.length} tracks)`);
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
      this.savePlaylist(playlist);
    }
  }

  // ===== 並び替え =====
  reorder(playlistName: string, trackIds: string[]): void {
    const playlist = this.get(playlistName);
    if (!playlist) {
      throw new Error(`Playlist not found: ${playlistName}`);
    }

    playlist.trackIds = trackIds.filter((id) => playlist.trackIds.includes(id));
    this.savePlaylist(playlist);
  }

  // ===== 再読み込み =====
  reload(): void {
    this.load();
  }
}
