import { useState, useEffect, useCallback } from 'react';
import {
  Music,
  Play,
  Pause,
  SkipForward,
  Square,
  Volume2,
  Repeat,
  Repeat1,
  Shuffle,
  List,
  Library,
  Plus,
  Trash2,
  Search,
  RefreshCw,
  ListPlus,
  Settings,
  FolderOpen,
  Save,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import type { PlayerState, Track, Playlist, GuildInfo, ChannelInfo, LoopMode } from './types';
import * as api from './api';
import './index.css';

type TabType = 'library' | 'playlists' | 'queue' | 'settings';

// コンテキストメニューの型
interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  trackId: string;
  trackTitle: string;
  source: 'library' | 'playlist' | 'queue';
  index?: number; // キュー/プレイリスト内のインデックス
}

// 時間フォーマット（秒 -> mm:ss）
const formatTime = (seconds: number): string => {
  if (!seconds || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

function App() {
  // State
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [guilds, setGuilds] = useState<GuildInfo[]>([]);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [selectedGuild, setSelectedGuild] = useState<string>('');
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('library');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [displayPosition, setDisplayPosition] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragContext, setDragContext] = useState<'queue' | 'playlist' | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    trackId: '',
    trackTitle: '',
    source: 'library',
  });

  // 設定関連
  const [settings, setSettings] = useState<api.AppSettings | null>(null);
  const [systemStatus, setSystemStatus] = useState<api.SystemStatus | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    discordToken: '',
    musicFolder: '',
  });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState('');

  // WebSocket接続
  useEffect(() => {
    api.connectWebSocket(setPlayerState);
    return () => api.disconnectWebSocket();
  }, []);

  // 再生位置の定期更新（シーク中は停止）
  useEffect(() => {
    if (!playerState?.current || playerState.paused || isSeeking) {
      return;
    }

    const startPosition = playerState.position;
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const newPosition = startPosition + elapsed;
      const duration = playerState.current?.duration || 0;
      setDisplayPosition(Math.min(newPosition, duration));
    }, 100);

    return () => clearInterval(interval);
  }, [playerState?.current?.id, playerState?.paused, playerState?.position, isSeeking]);

  // playerStateが更新されたらdisplayPositionも更新（シーク中は無視）
  useEffect(() => {
    if (playerState && !isSeeking) {
      setDisplayPosition(playerState.position);
    }
  }, [playerState?.position, isSeeking]);

  // 初期データ取得
  useEffect(() => {
    loadInitialData();
  }, []);

  // ギルド選択時にチャンネル取得
  useEffect(() => {
    if (selectedGuild) {
      api.getChannels(selectedGuild).then(setChannels);
    } else {
      setChannels([]);
      setSelectedChannel('');
    }
  }, [selectedGuild]);

  const loadInitialData = async () => {
    try {
      const [state, guildList, trackList, playlistList, settingsData, statusData] = await Promise.all([
        api.getPlayerState(),
        api.getGuilds(),
        api.getLibrary(),
        api.getPlaylists(),
        api.getSettings(),
        api.getSystemStatus(),
      ]);
      setPlayerState(state);
      setGuilds(guildList);
      setTracks(trackList);
      setPlaylists(playlistList);
      setSettings(settingsData);
      setSystemStatus(statusData);
      setSettingsForm({
        discordToken: '',
        musicFolder: settingsData.currentMusicFolder || '',
      });

      if (state.guildId) {
        setSelectedGuild(state.guildId);
        if (state.channelId) {
          setSelectedChannel(state.channelId);
        }
      }
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  };

  // ===== 接続操作 =====
  const handleJoin = async () => {
    if (!selectedGuild || !selectedChannel) return;
    try {
      await api.joinChannel(selectedGuild, selectedChannel);
    } catch (error) {
      console.error('Failed to join:', error);
    }
  };

  const handleLeave = async () => {
    try {
      await api.leaveChannel();
    } catch (error) {
      console.error('Failed to leave:', error);
    }
  };

  // ===== 再生操作 =====
  const handlePlay = async (trackId: string) => {
    try {
      await api.playTrack(trackId);
    } catch (error) {
      console.error('Failed to play:', error);
    }
  };

  const handleQueue = async (trackId: string) => {
    try {
      await api.queueTrack(trackId);
    } catch (error) {
      console.error('Failed to queue:', error);
    }
  };

  const handlePlayNext = async (trackId: string) => {
    try {
      await api.playNextInQueue(trackId);
    } catch (error) {
      console.error('Failed to add to play next:', error);
    }
  };

  // コンテキストメニュー
  const handleContextMenu = (
    e: React.MouseEvent,
    trackId: string,
    trackTitle: string,
    source: 'library' | 'playlist' | 'queue',
    index?: number
  ) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      trackId,
      trackTitle,
      source,
      index,
    });
  };

  const closeContextMenu = () => {
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  // コンテキストメニューの外側クリックで閉じる
  useEffect(() => {
    const handleClick = () => closeContextMenu();
    if (contextMenu.visible) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu.visible]);

  const handlePause = () => api.pausePlayer();
  const handleResume = () => api.resumePlayer();
  const handleSkip = () => api.skipTrack();
  const handleStop = () => api.stopPlayer();
  const handleClearQueue = () => api.clearQueue();

  const handleRemoveFromQueue = async (index: number) => {
    try {
      await api.removeFromQueue(index);
    } catch (error) {
      console.error('Failed to remove from queue:', error);
    }
  };

  const handleVolumeChange = (volume: number) => {
    api.updateSettings({ volume });
  };

  const handleLoopChange = () => {
    if (!playerState) return;
    const modes: LoopMode[] = ['off', 'one', 'all'];
    const currentIndex = modes.indexOf(playerState.loop);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    api.updateSettings({ loop: nextMode });
  };

  const handleShuffleToggle = () => {
    if (!playerState) return;
    api.updateSettings({ shuffle: !playerState.shuffle });
  };

  const handleSeek = async (position: number) => {
    setIsSeeking(true);
    setDisplayPosition(position);
    try {
      await api.seekPlayer(position);
      // シーク完了後、少し待ってからサーバーの状態を反映
      setTimeout(() => {
        setIsSeeking(false);
      }, 500);
    } catch (error) {
      console.error('Failed to seek:', error);
      setIsSeeking(false);
    }
  };

  // ===== ドラッグ&ドロップ =====
  const handleDragStart = (index: number, context: 'queue' | 'playlist') => {
    setDraggedIndex(index);
    setDragContext(context);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && index !== draggedIndex) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    setDragContext(null);
  };

  // ドラッグ中の並び替えプレビューを計算
  const getReorderedList = <T,>(list: T[]): T[] => {
    if (draggedIndex === null || dragOverIndex === null || draggedIndex === dragOverIndex) {
      return list;
    }
    const result = [...list];
    const [dragged] = result.splice(draggedIndex, 1);
    result.splice(dragOverIndex, 0, dragged);
    return result;
  };

  const handleQueueDrop = async () => {
    const fromIndex = draggedIndex;
    const toIndex = dragOverIndex;
    if (fromIndex === null || toIndex === null || fromIndex === toIndex) {
      handleDragEnd();
      return;
    }
    try {
      await api.reorderQueue(fromIndex, toIndex);
    } catch (error) {
      console.error('Failed to reorder queue:', error);
    }
    handleDragEnd();
  };

  const handlePlaylistDrop = async () => {
    const fromIndex = draggedIndex;
    const toIndex = dragOverIndex;
    if (!selectedPlaylist || !selectedPlaylist.tracks || fromIndex === null || toIndex === null || fromIndex === toIndex) {
      handleDragEnd();
      return;
    }
    // 新しい順序を計算
    const newTrackIds = [...selectedPlaylist.trackIds];
    const [moved] = newTrackIds.splice(fromIndex, 1);
    newTrackIds.splice(toIndex, 0, moved);

    try {
      await api.reorderPlaylist(selectedPlaylist.name, newTrackIds);
      const fullPlaylist = await api.getPlaylist(selectedPlaylist.name);
      setSelectedPlaylist(fullPlaylist);
    } catch (error) {
      console.error('Failed to reorder playlist:', error);
    }
    handleDragEnd();
  };

  // ===== ライブラリ操作 =====
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    try {
      const results = await api.getLibrary(query);
      setTracks(results);
    } catch (error) {
      console.error('Search failed:', error);
    }
  }, []);

  const handleRescan = async () => {
    setIsLoading(true);
    try {
      await api.rescanLibrary();
      const trackList = await api.getLibrary(searchQuery);
      setTracks(trackList);
    } catch (error) {
      console.error('Rescan failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // ===== プレイリスト操作 =====
  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    try {
      await api.createPlaylist(newPlaylistName.trim());
      setNewPlaylistName('');
      const playlistList = await api.getPlaylists();
      setPlaylists(playlistList);
    } catch (error) {
      console.error('Failed to create playlist:', error);
    }
  };

  const handleDeletePlaylist = async (name: string) => {
    try {
      await api.deletePlaylist(name);
      const playlistList = await api.getPlaylists();
      setPlaylists(playlistList);
      if (selectedPlaylist?.name === name) {
        setSelectedPlaylist(null);
      }
    } catch (error) {
      console.error('Failed to delete playlist:', error);
    }
  };

  const handleSelectPlaylist = async (playlist: Playlist) => {
    try {
      const fullPlaylist = await api.getPlaylist(playlist.name);
      setSelectedPlaylist(fullPlaylist);
    } catch (error) {
      console.error('Failed to load playlist:', error);
    }
  };

  const handlePlayPlaylist = async (name: string, mode: 'replace' | 'append' = 'replace') => {
    try {
      await api.playPlaylist(name, mode);
    } catch (error) {
      console.error('Failed to play playlist:', error);
    }
  };

  const handleAddToPlaylist = async (playlistName: string, trackId: string) => {
    try {
      await api.addTrackToPlaylist(playlistName, trackId);
      if (selectedPlaylist?.name === playlistName) {
        const fullPlaylist = await api.getPlaylist(playlistName);
        setSelectedPlaylist(fullPlaylist);
      }
    } catch (error) {
      console.error('Failed to add to playlist:', error);
    }
  };

  const handleRemoveFromPlaylist = async (trackId: string) => {
    if (!selectedPlaylist) return;
    try {
      await api.removeTrackFromPlaylist(selectedPlaylist.name, trackId);
      const fullPlaylist = await api.getPlaylist(selectedPlaylist.name);
      setSelectedPlaylist(fullPlaylist);
      // プレイリスト一覧も更新
      const playlistList = await api.getPlaylists();
      setPlaylists(playlistList);
    } catch (error) {
      console.error('Failed to remove from playlist:', error);
    }
  };

  // ===== 設定操作 =====
  const handleSaveSettings = async () => {
    try {
      setSettingsError('');
      setSettingsSaved(false);
      
      const updates: { discordToken?: string; musicFolder?: string } = {};
      if (settingsForm.discordToken) {
        updates.discordToken = settingsForm.discordToken;
      }
      if (settingsForm.musicFolder) {
        updates.musicFolder = settingsForm.musicFolder;
      }

      const result = await api.saveSettings(updates);
      setSettings(result.config);
      setSettingsSaved(true);
      setSettingsForm(prev => ({ ...prev, discordToken: '' }));
      
      // ステータスを更新
      const statusData = await api.getSystemStatus();
      setSystemStatus(statusData);

      if (result.needsRestart) {
        setSettingsError('設定を反映するにはアプリを再起動してください');
      }

      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSettingsError('設定の保存に失敗しました');
    }
  };

  const handleOpenMusicFolder = async () => {
    try {
      await api.openMusicFolder();
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
  };

  // ===== レンダリング =====
  const getLoopIcon = () => {
    if (playerState?.loop === 'one') return <Repeat1 size={18} />;
    return <Repeat size={18} />;
  };

  const filteredTracks = tracks;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <h1>
          <Music size={24} />
          Discord Music Bot
        </h1>
      </header>

      <main className="main">
        {/* Left Panel - Library/Playlists */}
        <div className="card">
          {/* Tabs */}
          <div className="tabs">
            <button
              className={`tab ${activeTab === 'library' ? 'active' : ''}`}
              onClick={() => setActiveTab('library')}
            >
              <Library size={16} /> ライブラリ
            </button>
            <button
              className={`tab ${activeTab === 'playlists' ? 'active' : ''}`}
              onClick={() => setActiveTab('playlists')}
            >
              <List size={16} /> プレイリスト
            </button>
            <button
              className={`tab ${activeTab === 'queue' ? 'active' : ''}`}
              onClick={() => setActiveTab('queue')}
            >
              <ListPlus size={16} /> キュー
              {playerState && playerState.queue.length > 0 && (
                <span className="queue-count"> ({playerState.queue.length})</span>
              )}
            </button>
            <button
              className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <Settings size={16} /> 設定
            </button>
          </div>

          {/* Library Tab */}
          {activeTab === 'library' && (
            <>
              <div className="search-bar">
                <div className="input-group">
                  <input
                    type="text"
                    className="input"
                    placeholder="曲を検索..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                  />
                  <button className="btn btn-secondary" onClick={handleRescan} disabled={isLoading}>
                    <RefreshCw size={16} className={isLoading ? 'spin' : ''} />
                  </button>
                </div>
              </div>
              <div className="track-list">
                {filteredTracks.length === 0 ? (
                  <div className="empty-state">
                    <Search size={48} />
                    <p>曲が見つかりません</p>
                  </div>
                ) : (
                  filteredTracks.map((track) => (
                    <div
                      key={track.id}
                      className={`track-item ${playerState?.current?.id === track.id ? 'playing' : ''}`}
                      onDoubleClick={() => handlePlay(track.id)}
                      onContextMenu={(e) => handleContextMenu(e, track.id, track.title, 'library')}
                    >
                      <div className="track-info">
                        <div className="track-title">{track.title}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* Playlists Tab */}
          {activeTab === 'playlists' && (
            <>
              <div className="search-bar">
                <div className="input-group">
                  <input
                    type="text"
                    className="input"
                    placeholder="新しいプレイリスト名..."
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
                  />
                  <button className="btn btn-primary" onClick={handleCreatePlaylist}>
                    <Plus size={16} />
                  </button>
                </div>
              </div>
              <div className="playlist-list">
                {playlists.length === 0 ? (
                  <div className="empty-state">
                    <List size={48} />
                    <p>プレイリストがありません</p>
                  </div>
                ) : (
                  playlists.map((playlist) => (
                    <div
                      key={playlist.name}
                      className={`playlist-item ${selectedPlaylist?.name === playlist.name ? 'selected' : ''}`}
                      onClick={() => handleSelectPlaylist(playlist)}
                    >
                      <div>
                        <div className="playlist-name">{playlist.name}</div>
                        <div className="playlist-count">{playlist.trackIds.length} 曲</div>
                      </div>
                      <div className="track-actions" style={{ opacity: 1 }}>
                        <button
                          className="btn btn-icon btn-ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePlayPlaylist(playlist.name);
                          }}
                          title="再生"
                        >
                          <Play size={16} />
                        </button>
                        <button
                          className="btn btn-icon btn-ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePlaylist(playlist.name);
                          }}
                          title="削除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {selectedPlaylist && selectedPlaylist.tracks && (
                <div className="card-body" style={{ borderTop: '1px solid var(--border)' }}>
                  <h3 style={{ marginBottom: 'var(--space-md)', fontSize: '0.875rem', flexShrink: 0 }}>
                    {selectedPlaylist.name} の曲
                  </h3>
                  <div className="track-list">
                    {(dragContext === 'playlist' ? getReorderedList(selectedPlaylist.tracks) : selectedPlaylist.tracks).map((track, index) => {
                      const isDragged = dragContext === 'playlist' && draggedIndex !== null && dragOverIndex !== null && index === dragOverIndex;
                      
                      return (
                        <div
                          key={track.id}
                          className={`track-item ${isDragged ? 'dragging' : ''} ${playerState?.current?.id === track.id ? 'playing' : ''}`}
                          draggable
                          onDragStart={() => handleDragStart(index, 'playlist')}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDrop={handlePlaylistDrop}
                          onDragEnd={handleDragEnd}
                          onDoubleClick={() => handlePlay(track.id)}
                          onContextMenu={(e) => handleContextMenu(e, track.id, track.title, 'playlist', index)}
                        >
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', width: '24px', flexShrink: 0 }}>
                            {index + 1}
                          </span>
                          <div className="track-info">
                            <div className="track-title">{track.title}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Queue Tab */}
          {activeTab === 'queue' && (
            <>
              <div className="card-header queue-header">
                <span>再生キュー</span>
                {playerState && playerState.queue.length > 0 && (
                  <button className="btn btn-secondary" onClick={handleClearQueue}>
                    クリア
                  </button>
                )}
              </div>
              <div className="track-list">
                {!playerState || playerState.queue.length === 0 ? (
                  <div className="empty-state">
                    <ListPlus size={48} />
                    <p>キューは空です</p>
                  </div>
                ) : (
                  (dragContext === 'queue' ? getReorderedList(playerState.queue) : playerState.queue).map((track, index) => {
                    // 元のインデックスを計算（ドラッグ操作用）
                    const originalIndex = dragContext === 'queue' && draggedIndex !== null && dragOverIndex !== null
                      ? (index === dragOverIndex ? draggedIndex 
                         : index >= Math.min(draggedIndex, dragOverIndex) && index <= Math.max(draggedIndex, dragOverIndex)
                           ? (draggedIndex < dragOverIndex ? index - 1 : index + 1)
                           : index)
                      : index;
                    const isDragged = dragContext === 'queue' && originalIndex === draggedIndex;
                    
                    return (
                      <div
                        key={`${track.id}-${index}`}
                        className={`track-item ${isDragged ? 'dragging' : ''}`}
                        draggable
                        onDragStart={() => handleDragStart(index, 'queue')}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={handleQueueDrop}
                        onDragEnd={handleDragEnd}
                        onDoubleClick={() => handlePlay(track.id)}
                        onContextMenu={(e) => handleContextMenu(e, track.id, track.title, 'queue', originalIndex)}
                      >
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', width: '24px', flexShrink: 0 }}>
                          {index + 1}
                        </span>
                        <div className="track-info">
                          <div className="track-title">{track.title}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="settings-panel">
              <div className="card-body">
                {/* ステータス */}
                <div className="settings-section">
                  <h3 className="settings-title">ステータス</h3>
                  <div className="status-grid">
                    <div className="status-item">
                      <span className="status-label">Discord接続</span>
                      <span className={`status-value ${systemStatus?.discordConnected ? 'success' : 'error'}`}>
                        {systemStatus?.discordConnected ? (
                          <><CheckCircle size={14} /> 接続中</>
                        ) : (
                          <><AlertCircle size={14} /> 未接続</>
                        )}
                      </span>
                    </div>
                    <div className="status-item">
                      <span className="status-label">曲数</span>
                      <span className="status-value">{systemStatus?.trackCount || 0} 曲</span>
                    </div>
                  </div>
                </div>

                {/* Discord Token */}
                <div className="settings-section">
                  <h3 className="settings-title">Discord Bot Token</h3>
                  <p className="settings-description">
                    {settings?.hasToken 
                      ? `設定済み: ${settings.discordToken}`
                      : 'トークンが設定されていません'}
                  </p>
                  <div className="input-group">
                    <input
                      type="password"
                      className="input"
                      placeholder="新しいトークンを入力..."
                      value={settingsForm.discordToken}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, discordToken: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Music Folder */}
                <div className="settings-section">
                  <h3 className="settings-title">音楽フォルダ</h3>
                  <p className="settings-description">
                    現在のフォルダ: {settings?.currentMusicFolder || '未設定'}
                  </p>
                  <div className="input-group">
                    <button className="btn btn-secondary" onClick={handleOpenMusicFolder}>
                      <FolderOpen size={16} /> フォルダを開く
                    </button>
                    <button className="btn btn-secondary" onClick={handleRescan} disabled={isLoading}>
                      <RefreshCw size={16} className={isLoading ? 'spin' : ''} /> 再スキャン
                    </button>
                  </div>
                </div>

                {/* 保存ボタン */}
                <div className="settings-section">
                  <button className="btn btn-primary" onClick={handleSaveSettings}>
                    <Save size={16} /> 設定を保存
                  </button>
                  {settingsSaved && (
                    <span className="save-success">
                      <CheckCircle size={14} /> 保存しました
                    </span>
                  )}
                  {settingsError && (
                    <span className="save-error">
                      <AlertCircle size={14} /> {settingsError}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Player */}
        <div className="player-panel">
          <div className="card">
            {/* Connection */}
            <div className="connection-panel">
              <div className="connection-status">
                <span
                  className={`status-dot ${playerState?.connection || 'disconnected'}`}
                />
                <span>
                  {playerState?.connection === 'connected'
                    ? '接続中'
                    : playerState?.connection === 'connecting'
                    ? '接続中...'
                    : '未接続'}
                </span>
              </div>
              <div className="connection-selects">
                <select
                  className="select"
                  value={selectedGuild}
                  onChange={(e) => setSelectedGuild(e.target.value)}
                >
                  <option value="">サーバーを選択</option>
                  {guilds.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  value={selectedChannel}
                  onChange={(e) => setSelectedChannel(e.target.value)}
                  disabled={!selectedGuild}
                >
                  <option value="">VCを選択</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                {playerState?.connection === 'connected' ? (
                  <button className="btn btn-secondary" onClick={handleLeave} style={{ flex: 1 }}>
                    切断
                  </button>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={handleJoin}
                    disabled={!selectedGuild || !selectedChannel}
                    style={{ flex: 1 }}
                  >
                    接続
                  </button>
                )}
              </div>
            </div>

            {/* Now Playing */}
            <div className="now-playing">
              {playerState?.current ? (
                <>
                  <div className="now-playing-status">
                    {playerState.paused ? '一時停止中' : '再生中'}
                  </div>
                  <div className="now-playing-title">{playerState.current.title}</div>
                  {/* Progress Bar */}
                  <div className="progress-container">
                    <span className="progress-time">{formatTime(displayPosition)}</span>
                    <div
                      className="progress-bar"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const percentage = x / rect.width;
                        const duration = playerState.current?.duration || 0;
                        if (duration > 0) {
                          handleSeek(percentage * duration);
                        }
                      }}
                    >
                      <div
                        className="progress-fill"
                        style={{
                          width: `${playerState.current.duration > 0
                            ? (displayPosition / playerState.current.duration) * 100
                            : 0}%`
                        }}
                      />
                      <div
                        className="progress-thumb"
                        style={{
                          left: `${playerState.current.duration > 0
                            ? (displayPosition / playerState.current.duration) * 100
                            : 0}%`
                        }}
                      />
                    </div>
                    <span className="progress-time">{formatTime(playerState.current.duration)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="now-playing-status">停止中</div>
                  <div className="now-playing-title" style={{ color: 'var(--text-muted)' }}>
                    曲を選択してください
                  </div>
                </>
              )}
            </div>

            {/* Controls */}
            <div className="player-controls">
              <button
                className={`btn btn-icon shuffle-btn ${playerState?.shuffle ? 'active' : ''}`}
                onClick={handleShuffleToggle}
                title="シャッフル"
              >
                <Shuffle size={18} />
              </button>
              <button
                className="btn btn-icon btn-ghost"
                onClick={handleStop}
                title="停止"
              >
                <Square size={20} />
              </button>
              <button
                className="btn btn-icon btn-primary large"
                onClick={playerState?.paused ? handleResume : handlePause}
                disabled={!playerState?.current}
                title={playerState?.paused ? '再生' : '一時停止'}
              >
                {playerState?.paused ? <Play size={24} /> : <Pause size={24} />}
              </button>
              <button
                className="btn btn-icon btn-ghost"
                onClick={handleSkip}
                title="次へ"
              >
                <SkipForward size={20} />
              </button>
              <button
                className={`btn btn-icon loop-btn ${playerState?.loop || 'off'}`}
                onClick={handleLoopChange}
                title={`ループ: ${playerState?.loop || 'off'}`}
              >
                {getLoopIcon()}
              </button>
            </div>

            {/* Settings */}
            <div className="player-settings">
              <div className="setting-row">
                <span className="setting-label">
                  <Volume2 size={16} />
                  音量
                </span>
                <input
                  type="range"
                  className="volume-slider"
                  min={0}
                  max={100}
                  value={playerState?.volume || 50}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '32px' }}>
                  {playerState?.volume || 50}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* コンテキストメニュー */}
      {contextMenu.visible && (
        <div
          className="context-menu"
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 1000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-header">{contextMenu.trackTitle}</div>
          <button
            className="context-menu-item"
            onClick={() => { handlePlay(contextMenu.trackId); closeContextMenu(); }}
          >
            再生
          </button>
          <button
            className="context-menu-item"
            onClick={() => { handlePlayNext(contextMenu.trackId); closeContextMenu(); }}
          >
            次に再生
          </button>
          <button
            className="context-menu-item"
            onClick={() => { handleQueue(contextMenu.trackId); closeContextMenu(); }}
          >
            キューに追加
          </button>
          {playlists.length > 0 && (
            <>
              <div className="context-menu-divider" />
              <div className="context-menu-submenu">
                <span className="context-menu-label">プレイリストに追加</span>
                {playlists.map((pl) => (
                  <button
                    key={pl.name}
                    className="context-menu-item context-menu-subitem"
                    onClick={() => { handleAddToPlaylist(pl.name, contextMenu.trackId); closeContextMenu(); }}
                  >
                    {pl.name}
                  </button>
                ))}
              </div>
            </>
          )}
          {contextMenu.source === 'playlist' && contextMenu.index !== undefined && (
            <>
              <div className="context-menu-divider" />
              <button
                className="context-menu-item context-menu-danger"
                onClick={() => { handleRemoveFromPlaylist(contextMenu.trackId); closeContextMenu(); }}
              >
                プレイリストから削除
              </button>
            </>
          )}
          {contextMenu.source === 'queue' && contextMenu.index !== undefined && (
            <>
              <div className="context-menu-divider" />
              <button
                className="context-menu-item context-menu-danger"
                onClick={() => { handleRemoveFromQueue(contextMenu.index!); closeContextMenu(); }}
              >
                キューから削除
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
