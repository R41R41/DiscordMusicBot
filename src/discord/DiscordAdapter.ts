import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  VoiceConnection,
  AudioPlayer,
  AudioResource,
  StreamType,
  NoSubscriberBehavior,
} from '@discordjs/voice';
import { Client, GatewayIntentBits, VoiceChannel, Guild } from 'discord.js';
import { spawn } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import type { ConnectionStatus, GuildInfo, ChannelInfo } from '../types.js';

// ffmpegのパスを取得
const ffmpegPath = ffmpegStatic || 'ffmpeg';

export class DiscordAdapter {
  private client: Client;
  private connection: VoiceConnection | null = null;
  private player: AudioPlayer;
  private currentResource: AudioResource | null = null;
  private currentGuildId: string | null = null;
  private currentChannelId: string | null = null;

  // 再生位置トラッキング
  private playStartTime: number = 0;
  private seekOffset: number = 0;
  private currentFilePath: string | null = null;
  private currentVolume: number = 50;

  // イベントコールバック
  public onConnectionChange?: (status: ConnectionStatus) => void;
  public onTrackEnd?: () => void;
  public onError?: (error: Error) => void;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
      ],
    });

    this.player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play, // サブスクライバーがなくても再生継続
        maxMissedFrames: 250, // フレーム損失の許容値を上げる
      },
    });
    this.setupPlayerEvents();
  }

  private setupPlayerEvents(): void {
    this.player.on(AudioPlayerStatus.Idle, () => {
      // トラック再生完了
      this.onTrackEnd?.();
    });

    this.player.on('error', (error) => {
      console.error('Audio player error:', error);
      this.onError?.(error);
    });
  }

  async login(token: string): Promise<void> {
    await this.client.login(token);
    console.log(`Logged in as ${this.client.user?.tag}`);
  }

  async destroy(): Promise<void> {
    this.disconnect();
    await this.client.destroy();
  }

  isReady(): boolean {
    return this.client.isReady();
  }

  // ===== Guild/Channel 情報取得 =====
  getGuilds(): GuildInfo[] {
    return this.client.guilds.cache.map((guild) => ({
      id: guild.id,
      name: guild.name,
    }));
  }

  getVoiceChannels(guildId: string): ChannelInfo[] {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return [];

    return guild.channels.cache
      .filter((ch): ch is VoiceChannel => ch.isVoiceBased() && ch.type === 2) // GuildVoice = 2
      .map((ch) => ({
        id: ch.id,
        name: ch.name,
        guildId: guild.id,
      }));
  }

  // ===== VC接続 =====
  async join(guildId: string, channelId: string): Promise<void> {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) {
      throw new Error(`Guild not found: ${guildId}`);
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) {
      throw new Error(`Voice channel not found: ${channelId}`);
    }

    this.onConnectionChange?.('connecting');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.connection = joinVoiceChannel({
      channelId: channelId,
      guildId: guildId,
      adapterCreator: guild.voiceAdapterCreator as any,
      selfDeaf: true, // 自分をスピーカーミュートにして安定性向上
    });

    this.currentGuildId = guildId;
    this.currentChannelId = channelId;

    // 接続状態の監視
    this.connection.on(VoiceConnectionStatus.Ready, () => {
      this.onConnectionChange?.('connected');
    });

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // 再接続を試みる
        await Promise.race([
          entersState(this.connection!, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection!, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        // 再接続失敗
        this.connection?.destroy();
        this.connection = null;
        this.currentGuildId = null;
        this.currentChannelId = null;
        this.onConnectionChange?.('disconnected');
      }
    });

    this.connection.on(VoiceConnectionStatus.Destroyed, () => {
      this.connection = null;
      this.currentGuildId = null;
      this.currentChannelId = null;
      this.onConnectionChange?.('disconnected');
    });

    // 接続状態のログ
    this.connection.on('stateChange', (oldState, newState) => {
      console.log(`Voice connection: ${oldState.status} -> ${newState.status}`);
    });

    this.connection.on('error', (error) => {
      console.error('Voice connection error:', error);
    });

    // 接続完了を待つ
    try {
      console.log('Waiting for voice connection...');
      await entersState(this.connection, VoiceConnectionStatus.Ready, 30_000);
      console.log('Voice connection ready!');
      this.connection.subscribe(this.player);
    } catch (error) {
      console.error('Failed to connect:', error);
      this.connection.destroy();
      throw new Error('Failed to connect to voice channel');
    }
  }

  disconnect(): void {
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
      this.currentGuildId = null;
      this.currentChannelId = null;
    }
    this.player.stop();
  }

  // ===== 再生制御 =====
  play(filePath: string, volume: number = 50, seekSeconds: number = 0): void {
    if (!this.connection) {
      throw new Error('Not connected to a voice channel');
    }

    console.log(`[Play] filePath=${filePath}, volume=${volume}, seekSeconds=${seekSeconds}`);

    this.currentFilePath = filePath;
    this.currentVolume = volume;
    this.seekOffset = seekSeconds;
    this.playStartTime = Date.now();

    // ffmpegでシークするためにspawn経由で再生
    if (seekSeconds > 0) {
      console.log(`[Seek] Using ffmpeg: ${ffmpegPath}, seeking to ${seekSeconds}s`);

      const ffmpegProcess = spawn(ffmpegPath, [
        '-ss', seekSeconds.toString(),
        '-i', filePath,
        '-analyzeduration', '0',
        '-probesize', '32',
        '-loglevel', 'warning',
        '-f', 's16le',
        '-ar', '48000',
        '-ac', '2',
        '-threads', '0',
        'pipe:1'
      ], { stdio: ['ignore', 'pipe', 'pipe'] });

      ffmpegProcess.stderr?.on('data', (data) => {
        console.log(`[FFmpeg stderr] ${data}`);
      });

      ffmpegProcess.on('error', (err) => {
        console.error('[FFmpeg error]', err);
      });

      this.currentResource = createAudioResource(ffmpegProcess.stdout, {
        inlineVolume: true,
        inputType: StreamType.Raw,
        silencePaddingFrames: 5,
      });
    } else {
      this.currentResource = createAudioResource(filePath, {
        inlineVolume: true,
        silencePaddingFrames: 5,
      });
    }

    // 音量を4分の1に調整
    this.currentResource.volume?.setVolume(volume / 400);
    this.player.play(this.currentResource);
  }

  seek(seconds: number): void {
    console.log(`[Seek] Requesting seek to ${seconds}s`);
    if (!this.currentFilePath) {
      console.log('[Seek] No current file path, aborting');
      return;
    }
    this.play(this.currentFilePath, this.currentVolume, seconds);
  }

  getPlaybackPosition(): number {
    // 再生中のファイルがない場合は0
    if (!this.currentFilePath) return 0;
    // playStartTimeが設定されていない場合は0
    if (this.playStartTime === 0) return 0;
    
    const elapsed = (Date.now() - this.playStartTime) / 1000;
    return this.seekOffset + elapsed;
  }

  pause(): void {
    this.player.pause();
  }

  resume(): void {
    this.player.unpause();
  }

  stop(): void {
    this.player.stop();
  }

  setVolume(volume: number): void {
    if (this.currentResource?.volume) {
      // 音量を4分の1に調整
      this.currentResource.volume.setVolume(volume / 400);
    }
  }

  // ===== 状態取得 =====
  getConnectionStatus(): ConnectionStatus {
    if (!this.connection) return 'disconnected';
    
    switch (this.connection.state.status) {
      case VoiceConnectionStatus.Ready:
        return 'connected';
      case VoiceConnectionStatus.Connecting:
      case VoiceConnectionStatus.Signalling:
        return 'connecting';
      default:
        return 'disconnected';
    }
  }

  isPlaying(): boolean {
    return this.player.state.status === AudioPlayerStatus.Playing;
  }

  isPaused(): boolean {
    return this.player.state.status === AudioPlayerStatus.Paused;
  }

  getCurrentGuildId(): string | null {
    return this.currentGuildId;
  }

  getCurrentChannelId(): string | null {
    return this.currentChannelId;
  }
}
