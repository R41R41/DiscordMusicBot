import fs from 'fs';
import path from 'path';

export interface AppConfig {
  discordToken: string;
  musicFolder: string;
  webPort: number;
}

const DEFAULT_CONFIG: AppConfig = {
  discordToken: '',
  musicFolder: '',
  webPort: 3001,
};

export class ConfigService {
  private configPath: string;
  private config: AppConfig;

  constructor(dataDir: string) {
    this.configPath = path.join(dataDir, 'config.json');
    this.config = this.load();
  }

  private load(): AppConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const loaded = JSON.parse(data);
        return { ...DEFAULT_CONFIG, ...loaded };
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
    return { ...DEFAULT_CONFIG };
  }

  private save(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save config:', error);
      throw error;
    }
  }

  get(): AppConfig {
    return { ...this.config };
  }

  update(updates: Partial<AppConfig>): AppConfig {
    this.config = { ...this.config, ...updates };
    this.save();
    return this.get();
  }

  getDiscordToken(): string {
    // 環境変数を優先、なければ設定ファイルから
    return process.env.DISCORD_TOKEN || this.config.discordToken;
  }

  getMusicFolder(): string {
    return process.env.MUSIC_FOLDER || this.config.musicFolder;
  }

  getWebPort(): number {
    const envPort = process.env.WEB_PORT;
    if (envPort) {
      return parseInt(envPort, 10);
    }
    return this.config.webPort;
  }

  isConfigured(): boolean {
    return !!this.getDiscordToken() && !!this.getMusicFolder();
  }

  // .envファイルにトークンを保存（互換性のため）
  saveToEnv(token: string): void {
    const envPath = path.join(process.cwd(), '.env');
    let content = '';
    
    try {
      if (fs.existsSync(envPath)) {
        content = fs.readFileSync(envPath, 'utf-8');
      }
    } catch {
      // ファイルが存在しない場合は空で開始
    }

    // DISCORD_TOKEN行を更新または追加
    const lines = content.split('\n');
    let found = false;
    const newLines = lines.map(line => {
      if (line.startsWith('DISCORD_TOKEN=')) {
        found = true;
        return `DISCORD_TOKEN=${token}`;
      }
      return line;
    });

    if (!found) {
      newLines.push(`DISCORD_TOKEN=${token}`);
    }

    fs.writeFileSync(envPath, newLines.join('\n').trim() + '\n');
  }
}
