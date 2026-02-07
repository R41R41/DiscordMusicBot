import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Config, Settings, Playlist } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 環境変数優先でデータディレクトリを決定
function getDataDir(): string {
  return process.env.DATA_DIR || join(__dirname, '../../data');
}

// ===== Config =====
export function loadConfig(): Config {
  const dataDir = getDataDir();
  const configPath = join(dataDir, 'config.json');
  
  // デフォルト値
  const defaultConfig: Config = {
    musicFolder: process.env.MUSIC_FOLDER || join(process.cwd(), 'music'),
    webPort: parseInt(process.env.WEB_PORT || '3001', 10),
    supportedFormats: ['.mp3', '.wav', '.flac', '.ogg', '.m4a'],
  };
  
  // config.jsonがあれば読み込み、なければデフォルト
  if (existsSync(configPath)) {
    try {
      const loaded = JSON.parse(readFileSync(configPath, 'utf-8'));
      return { ...defaultConfig, ...loaded };
    } catch {
      return defaultConfig;
    }
  }
  
  return defaultConfig;
}

// ===== Settings =====
export function loadSettings(): Settings {
  const dataDir = getDataDir();
  const settingsPath = join(dataDir, 'settings.json');
  if (!existsSync(settingsPath)) {
    return { volume: 50, loop: 'off', shuffle: false };
  }
  return JSON.parse(readFileSync(settingsPath, 'utf-8'));
}

export function saveSettings(settings: Settings): void {
  const dataDir = getDataDir();
  // ディレクトリがなければ作成
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  const settingsPath = join(dataDir, 'settings.json');
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

// ===== Playlists =====
export function loadPlaylists(): Playlist[] {
  const dataDir = getDataDir();
  const playlistsPath = join(dataDir, 'playlists.json');
  if (!existsSync(playlistsPath)) {
    return [];
  }
  const data = JSON.parse(readFileSync(playlistsPath, 'utf-8'));
  return data.playlists || [];
}

export function savePlaylists(playlists: Playlist[]): void {
  const dataDir = getDataDir();
  // ディレクトリがなければ作成
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  const playlistsPath = join(dataDir, 'playlists.json');
  writeFileSync(playlistsPath, JSON.stringify({ playlists }, null, 2), 'utf-8');
}
