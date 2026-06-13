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

  // ===== プレイリスト並び順の保存/読み込み =====
  private get orderFilePath(): string {
    return join(this.playlistsDir, '_order.json');
  }

  private loadOrder(): string[] {
    try {
      if (existsSync(this.orderFilePath)) {
        return JSON.parse(readFileSync(this.orderFilePath, 'utf-8'));
      }
    } catch (error) {
      console.error('[Playlist] Failed to load order:', error);
    }
    return [];
  }

  private saveOrder(): void {
    try {
      const order = this.playlists.map(p => p.name);
      writeFileSync(this.orderFilePath, JSON.stringify(order, null, 2), 'utf-8');
    } catch (error) {
      console.error('[Playlist] Failed to save order:', error);
    }
  }

  private applyOrder(): void {
    const order = this.loadOrder();
    if (order.length === 0) return;

    const map = new Map(this.playlists.map(p => [p.name, p]));
    const ordered: Playlist[] = [];
    for (const name of order) {
      const pl = map.get(name);
      if (pl) {
        ordered.push(pl);
        map.delete(name);
      }
    }
    // 順番ファイルにないプレイリストは末尾に追加
    for (const pl of map.values()) {
      ordered.push(pl);
    }
    this.playlists = ordered;
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

      this.applyOrder();
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
    this.saveOrder();
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
    this.saveOrder();
  }

  // ===== プレイリスト名変更 =====
  rename(oldName: string, newName: string): Playlist {
    if (!newName || !newName.trim()) {
      throw new Error('New playlist name is required');
    }
    newName = newName.trim();

    const playlist = this.playlists.find(p => p.name === oldName);
    if (!playlist) {
      throw new Error(`Playlist not found: ${oldName}`);
    }
    if (this.playlists.some(p => p.name === newName)) {
      throw new Error(`Playlist already exists: ${newName}`);
    }

    // 古い .m3u ファイルを削除
    this.deletePlaylistFile(oldName);

    // プレイリスト名を更新して新しいファイルに保存
    playlist.name = newName;
    this.savePlaylist(playlist);

    this.saveOrder();
    console.log(`[Playlist] Renamed "${oldName}" -> "${newName}"`);
    return playlist;
  }

  // ===== トラックIDの一括置換（曲名変更時）=====
  replaceTrackId(oldId: string, newId: string): void {
    for (const playlist of this.playlists) {
      const index = playlist.trackIds.indexOf(oldId);
      if (index !== -1) {
        playlist.trackIds[index] = newId;
        this.savePlaylist(playlist);
        console.log(`[Playlist] Updated trackId ${oldId} -> ${newId} in "${playlist.name}"`);
      }
    }
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

  // ===== プレイリスト一覧の並び替え =====
  reorderPlaylists(names: string[]): void {
    const map = new Map(this.playlists.map(p => [p.name, p]));
    const ordered: Playlist[] = [];
    for (const name of names) {
      const pl = map.get(name);
      if (pl) {
        ordered.push(pl);
        map.delete(name);
      }
    }
    for (const pl of map.values()) {
      ordered.push(pl);
    }
    this.playlists = ordered;
    this.saveOrder();
    console.log(`[Playlist] Reordered playlists: ${names.join(', ')}`);
  }

  // ===== 再読み込み =====
  reload(): void {
    this.load();
  }
}
