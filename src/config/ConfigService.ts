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
  private dataDir: string;
  private config: AppConfig;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.configPath = path.join(dataDir, 'config.json');
    console.log('ConfigService: configPath =', this.configPath);
    this.config = this.load();
  }

  private load(): AppConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const loaded = JSON.parse(data);
        console.log('ConfigService: loaded config from', this.configPath);
        return { ...DEFAULT_CONFIG, ...loaded };
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
    console.log('ConfigService: using default config');
    return { ...DEFAULT_CONFIG };
  }

  private save(): void {
    try {
      // ディレクトリがなければ作成
      if (!fs.existsSync(this.dataDir)) {
        console.log('ConfigService: creating data directory:', this.dataDir);
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      console.log('ConfigService: saving config to', this.configPath);
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      console.log('ConfigService: config saved successfully');
    } catch (error) {
      console.error('Failed to save config:', error);
      throw error;
    }
  }

  get(): AppConfig {
    return { ...this.config };
  }

  update(updates: Partial<AppConfig>): AppConfig {
    console.log('ConfigService: updating config with', updates);
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

  getDataDir(): string {
    return this.dataDir;
  }
}
