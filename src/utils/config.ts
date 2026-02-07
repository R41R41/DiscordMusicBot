import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Config, Settings, Playlist } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');

// ===== Config =====
export function loadConfig(): Config {
  const configPath = join(DATA_DIR, 'config.json');
  if (!existsSync(configPath)) {
    throw new Error('config.json not found in data folder');
  }
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}

// ===== Settings =====
export function loadSettings(): Settings {
  const settingsPath = join(DATA_DIR, 'settings.json');
  if (!existsSync(settingsPath)) {
    return { volume: 50, loop: 'off', shuffle: false };
  }
  return JSON.parse(readFileSync(settingsPath, 'utf-8'));
}

export function saveSettings(settings: Settings): void {
  const settingsPath = join(DATA_DIR, 'settings.json');
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

// ===== Playlists =====
export function loadPlaylists(): Playlist[] {
  const playlistsPath = join(DATA_DIR, 'playlists.json');
  if (!existsSync(playlistsPath)) {
    return [];
  }
  const data = JSON.parse(readFileSync(playlistsPath, 'utf-8'));
  return data.playlists || [];
}

export function savePlaylists(playlists: Playlist[]): void {
  const playlistsPath = join(DATA_DIR, 'playlists.json');
  writeFileSync(playlistsPath, JSON.stringify({ playlists }, null, 2), 'utf-8');
}
