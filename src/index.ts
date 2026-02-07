import 'dotenv/config';

import { DiscordAdapter } from './discord/DiscordAdapter.js';
import { LibraryService } from './library/LibraryService.js';
import { PlayerService } from './player/PlayerService.js';
import { PlaylistService } from './playlists/PlaylistService.js';
import { WebApiService } from './web/WebApiService.js';
import { loadConfig } from './utils/config.js';

async function main() {
  console.log('Starting Discord Music Bot...');

  // 環境変数チェック
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error('Error: DISCORD_TOKEN is not set in .env file');
    process.exit(1);
  }

  // 設定読み込み
  const config = loadConfig();
  console.log(`Music folder: ${config.musicFolder}`);
  console.log(`Web port: ${config.webPort}`);

  // サービス初期化
  const adapter = new DiscordAdapter();
  const library = new LibraryService(config);
  const playlists = new PlaylistService();
  const player = new PlayerService(adapter, library);
  const webApi = new WebApiService(config.webPort, player, library, playlists, adapter);

  // ライブラリスキャン
  console.log('Scanning music library...');
  await library.scan();

  // Discord Bot ログイン
  console.log('Logging in to Discord...');
  await adapter.login(token);

  // Web API 起動
  webApi.start();

  console.log('Bot is ready!');
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
