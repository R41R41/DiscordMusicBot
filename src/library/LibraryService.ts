import { readdirSync, statSync, existsSync } from 'fs';
import { join, basename, extname } from 'path';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import type { Track, Config } from '../types.js';

export class LibraryService {
  private tracks: Map<string, Track> = new Map();
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  // ===== ID生成（パスベース）=====
  private generateId(filePath: string): string {
    return createHash('md5').update(filePath).digest('hex').substring(0, 12);
  }

  // ===== 音声ファイルの長さを取得 =====
  private getDuration(filePath: string): number {
    try {
      const result = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
        { encoding: 'utf-8', timeout: 5000 }
      );
      const duration = parseFloat(result.trim());
      return isNaN(duration) ? 0 : Math.floor(duration);
    } catch {
      return 0;
    }
  }

  // ===== フォルダスキャン =====
  async scan(): Promise<number> {
    this.tracks.clear();

    console.log(`Scanning folder: ${this.config.musicFolder}`);
    console.log(`Supported formats: ${this.config.supportedFormats.join(', ')}`);

    if (!existsSync(this.config.musicFolder)) {
      console.warn(`Music folder not found: ${this.config.musicFolder}`);
      return 0;
    }

    this.scanDirectory(this.config.musicFolder);
    console.log(`Library scanned: ${this.tracks.size} tracks found`);
    return this.tracks.size;
  }

  private scanDirectory(dirPath: string): void {
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // サブフォルダも再帰的にスキャン
          this.scanDirectory(fullPath);
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase(); // .mp3, .wav など
          if (this.config.supportedFormats.includes(ext)) {
            const track: Track = {
              id: this.generateId(fullPath),
              title: basename(entry.name, extname(entry.name)),
              path: fullPath,
              duration: this.getDuration(fullPath),
            };
            this.tracks.set(track.id, track);
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dirPath}:`, error);
    }
  }

  // ===== 検索 =====
  search(query?: string): Track[] {
    const allTracks = Array.from(this.tracks.values());

    if (!query || query.trim() === '') {
      return allTracks;
    }

    const lowerQuery = query.toLowerCase();
    return allTracks.filter((track) =>
      track.title.toLowerCase().includes(lowerQuery)
    );
  }

  // ===== ID から取得 =====
  getTrack(id: string): Track | undefined {
    return this.tracks.get(id);
  }

  // ===== 全トラック =====
  getAllTracks(): Track[] {
    return Array.from(this.tracks.values());
  }

  // ===== トラック数 =====
  getTrackCount(): number {
    return this.tracks.size;
  }

  // ===== 複数ID から取得 =====
  getTracksByIds(ids: string[]): Track[] {
    return ids
      .map((id) => this.tracks.get(id))
      .filter((track): track is Track => track !== undefined);
  }
}
