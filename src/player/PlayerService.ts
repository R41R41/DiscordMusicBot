import { existsSync } from 'fs';
import type { Track, PlayerState, LoopMode, Settings } from '../types.js';
import { DiscordAdapter } from '../discord/DiscordAdapter.js';
import { LibraryService } from '../library/LibraryService.js';
import { loadSettings, saveSettings } from '../utils/config.js';

export class PlayerService {
  private adapter: DiscordAdapter;
  private library: LibraryService;

  // 状態
  private current: Track | null = null;
  private queue: Track[] = [];
  private originalQueue: Track[] = []; // シャッフル前のキュー
  private paused: boolean = false;
  private loop: LoopMode = 'off';
  private shuffle: boolean = false;
  private volume: number = 50;

  // イベントコールバック
  public onStateChange?: (state: PlayerState) => void;

  constructor(adapter: DiscordAdapter, library: LibraryService) {
    this.adapter = adapter;
    this.library = library;

    // 設定を読み込む
    this.loadSettings();

    // DiscordAdapterのイベントを設定
    this.adapter.onConnectionChange = () => {
      this.emitState();
    };

    this.adapter.onTrackEnd = () => {
      this.handleTrackEnd();
    };

    this.adapter.onError = (error) => {
      console.error('Player error:', error);
      // エラー時はスキップ
      this.handleTrackEnd();
    };
  }

  private loadSettings(): void {
    try {
      const settings = loadSettings();
      this.volume = settings.volume;
      this.loop = settings.loop;
      this.shuffle = settings.shuffle;
    } catch (error) {
      console.warn('Failed to load settings, using defaults');
    }
  }

  private saveCurrentSettings(): void {
    const settings: Settings = {
      volume: this.volume,
      loop: this.loop,
      shuffle: this.shuffle,
    };
    saveSettings(settings);
  }

  // ===== 状態取得 =====
  getState(): PlayerState {
    return {
      connection: this.adapter.getConnectionStatus(),
      guildId: this.adapter.getCurrentGuildId(),
      channelId: this.adapter.getCurrentChannelId(),
      current: this.current,
      queue: [...this.queue],
      paused: this.paused,
      loop: this.loop,
      shuffle: this.shuffle,
      volume: this.volume,
      position: this.adapter.getPlaybackPosition(),
    };
  }

  // ===== シーク =====
  seek(seconds: number): void {
    if (!this.current) return;
    const wasPaused = this.paused;
    this.adapter.seek(seconds);
    // 一時停止中だった場合、シーク後も一時停止を維持
    if (wasPaused) {
      // 少し待ってから一時停止（再生開始を待つ）
      setTimeout(() => {
        this.adapter.pause();
      }, 100);
    }
    this.emitState();
  }

  private emitState(): void {
    this.onStateChange?.(this.getState());
  }

  // ===== VC接続 =====
  async join(guildId: string, channelId: string): Promise<void> {
    await this.adapter.join(guildId, channelId);
    this.emitState();
  }

  leave(): void {
    this.adapter.disconnect();
    this.stop();
    this.emitState();
  }

  // ===== 再生制御 =====
  play(trackId: string): void {
    const track = this.library.getTrack(trackId);
    if (!track) {
      throw new Error(`Track not found: ${trackId}`);
    }

    if (!existsSync(track.path)) {
      throw new Error(`File not found: ${track.path}`);
    }

    this.current = track;
    this.paused = false;
    this.adapter.play(track.path, this.volume);
    this.emitState();
  }

  playNow(trackId: string): void {
    // 今すぐ再生（キューの先頭に追加してから再生）
    const track = this.library.getTrack(trackId);
    if (!track) {
      throw new Error(`Track not found: ${trackId}`);
    }

    // 現在の曲があればキューの先頭に戻す（オプション）
    // if (this.current) {
    //   this.queue.unshift(this.current);
    // }

    this.play(trackId);
  }

  pause(): void {
    if (this.current && !this.paused) {
      this.adapter.pause();
      this.paused = true;
      this.emitState();
    }
  }

  resume(): void {
    if (this.current && this.paused) {
      this.adapter.resume();
      this.paused = false;
      this.emitState();
    }
  }

  skip(): void {
    this.handleTrackEnd();
  }

  stop(): void {
    this.adapter.stop();
    this.current = null;
    this.paused = false;
    this.emitState();
  }

  // ===== キュー操作 =====
  addToQueue(trackId: string): void {
    const track = this.library.getTrack(trackId);
    if (!track) {
      throw new Error(`Track not found: ${trackId}`);
    }

    this.queue.push(track);
    this.originalQueue.push(track);

    // 何も再生していない場合は再生開始
    if (!this.current && this.adapter.getConnectionStatus() === 'connected') {
      this.playNext();
    }
    this.emitState();
  }

  // 次に再生（キューの先頭に追加）
  playNextInQueue(trackId: string): void {
    const track = this.library.getTrack(trackId);
    if (!track) {
      throw new Error(`Track not found: ${trackId}`);
    }

    this.queue.unshift(track);
    this.originalQueue.unshift(track);

    // 何も再生していない場合は再生開始
    if (!this.current && this.adapter.getConnectionStatus() === 'connected') {
      this.playNext();
    }

    this.emitState();
  }

  clearQueue(): void {
    this.queue = [];
    this.originalQueue = [];
    this.emitState();
  }

  removeFromQueue(index: number): void {
    if (index >= 0 && index < this.queue.length) {
      const removed = this.queue.splice(index, 1)[0];
      // originalQueueからも削除
      const origIndex = this.originalQueue.findIndex((t) => t.id === removed.id);
      if (origIndex !== -1) {
        this.originalQueue.splice(origIndex, 1);
      }
      this.emitState();
    }
  }

  reorderQueue(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || fromIndex >= this.queue.length) return;
    if (toIndex < 0 || toIndex >= this.queue.length) return;
    if (fromIndex === toIndex) return;

    const [moved] = this.queue.splice(fromIndex, 1);
    this.queue.splice(toIndex, 0, moved);
    this.emitState();
  }

  moveQueueItem(fromIndex: number, toIndex: number): void {
    this.reorderQueue(fromIndex, toIndex);
  }

  // ===== プレイリスト再生 =====
  playPlaylist(trackIds: string[], mode: 'replace' | 'append' = 'replace'): void {
    const tracks = this.library.getTracksByIds(trackIds);

    if (mode === 'replace') {
      this.queue = [...tracks];
      this.originalQueue = [...tracks];
    } else {
      this.queue.push(...tracks);
      this.originalQueue.push(...tracks);
    }

    if (this.shuffle) {
      this.shuffleQueue();
    }

    // replaceモードで何も再生していない場合は再生開始
    if (mode === 'replace' && this.adapter.getConnectionStatus() === 'connected') {
      this.playNext();
    }

    this.emitState();
  }

  // ===== 設定変更 =====
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(100, volume));
    this.adapter.setVolume(this.volume);
    this.saveCurrentSettings();
    this.emitState();
  }

  setLoop(mode: LoopMode): void {
    this.loop = mode;
    this.saveCurrentSettings();
    this.emitState();
  }

  setShuffle(enabled: boolean): void {
    this.shuffle = enabled;

    if (enabled && this.queue.length > 0) {
      this.shuffleQueue();
    } else if (!enabled && this.originalQueue.length > 0) {
      // シャッフル解除時は元の順序に戻す
      this.queue = this.originalQueue.filter((t) =>
        this.queue.some((q) => q.id === t.id)
      );
    }

    this.saveCurrentSettings();
    this.emitState();
  }

  // ===== 内部処理 =====
  private handleTrackEnd(): void {
    if (this.loop === 'one' && this.current) {
      // 同じ曲をリピート
      this.adapter.play(this.current.path, this.volume);
      this.emitState();
      return;
    }

    // キューから次の曲を取得
    if (this.queue.length > 0) {
      if (this.loop === 'all' && this.current) {
        // 現在の曲をキューの末尾に追加
        this.queue.push(this.current);
        this.originalQueue.push(this.current);
      }
      this.playNext();
    } else if (this.loop === 'all' && this.current) {
      // キューが空でもloop=allなら同じ曲を続ける
      this.adapter.play(this.current.path, this.volume);
      this.emitState();
    } else {
      // 再生終了
      this.current = null;
      this.paused = false;
      this.emitState();
    }
  }

  private playNext(): void {
    if (this.queue.length === 0) {
      this.current = null;
      this.paused = false;
      this.emitState();
      return;
    }

    const nextTrack = this.queue.shift()!;
    
    // originalQueueからも削除
    const origIndex = this.originalQueue.findIndex((t) => t.id === nextTrack.id);
    if (origIndex !== -1) {
      this.originalQueue.splice(origIndex, 1);
    }

    // ファイル存在チェック
    if (!existsSync(nextTrack.path)) {
      console.warn(`File not found, skipping: ${nextTrack.path}`);
      this.playNext(); // 次の曲へスキップ
      return;
    }

    this.current = nextTrack;
    this.paused = false;
    this.adapter.play(nextTrack.path, this.volume);
    this.emitState();
  }

  private shuffleQueue(): void {
    // Fisher-Yatesシャッフル
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
  }
}
