import 'dotenv/config';
import path from 'path';

import { DiscordAdapter } from './discord/DiscordAdapter.js';
import { LibraryService } from './library/LibraryService.js';
import { PlayerService } from './player/PlayerService.js';
import { PlaylistService } from './playlists/PlaylistService.js';
import { WebApiService } from './web/WebApiService.js';
import { ConfigService } from './config/ConfigService.js';
import { loadConfig } from './utils/config.js';

async function main() {
  console.log('Starting Discord Music Bot...');

  // 設定サービス初期化（環境変数優先）
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  console.log(`Data directory: ${dataDir}`);
  const configService = new ConfigService(dataDir);

  // 設定読み込み（環境変数優先）
  const config = loadConfig();
  const token = configService.getDiscordToken();
  
  console.log(`Music folder: ${config.musicFolder}`);
  console.log(`Web port: ${config.webPort}`);

  // サービス初期化
  const adapter = new DiscordAdapter();
  const library = new LibraryService(config);
  const playlists = new PlaylistService(config.musicFolder, dataDir);
  const player = new PlayerService(adapter, library);
  const webApi = new WebApiService(
    config.webPort, 
    player, 
    library, 
    playlists, 
    adapter,
    configService,
    config.musicFolder
  );

  // ライブラリスキャン
  console.log('Scanning music library...');
  await library.scan();

  // Discord Bot ログイン（トークンがある場合のみ）
  if (token) {
    console.log('Logging in to Discord...');
    try {
      await adapter.login(token);
      console.log('Bot is ready!');
    } catch (error) {
      console.error('Failed to login to Discord:', error);
      console.log('Please check your Discord token in settings.');
    }
  } else {
    console.log('Discord token not configured. Please set it in the settings.');
  }

  // Web API 起動
  webApi.start();

  console.log(`Open http://localhost:${config.webPort} in your browser`);

  // 終了処理
  const shutdown = async () => {
    console.log('\nShutting down...');
    webApi.stop();
    await adapter.destroy();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
