import { useState, useEffect, useCallback, useRef } from "react";
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
  Sun,
  Moon,
  Edit2,
  ArrowLeft,
} from "lucide-react";
import type {
  PlayerState,
  Track,
  Playlist,
  GuildInfo,
  ChannelInfo,
  LoopMode,
} from "./types";
import * as api from "./api";
import "./index.css";

type TabType = "library" | "playlists" | "queue" | "settings";

// コンテキストメニューの型
interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  trackId: string;
  trackTitle: string;
  source: "library" | "playlist" | "queue";
  index?: number; // キュー/プレイリスト内のインデックス
}

// 時間フォーマット（秒 -> mm:ss）
const formatTime = (seconds: number): string => {
  if (!seconds || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

function App() {
  // State
  const [rawPlayerState, setRawPlayerState] = useState<PlayerState | null>(null);
  // ローカル再生（VC未接続時）
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [localCurrent, setLocalCurrent] = useState<Track | null>(null);
  const [localPaused, setLocalPaused] = useState(false);
  const [localPosition, setLocalPosition] = useState(0);
  const [localQueue, setLocalQueue] = useState<Track[]>([]);
  const [guilds, setGuilds] = useState<GuildInfo[]>([]);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [selectedGuild, setSelectedGuild] = useState<string>("");
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>("library");
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [displayPosition, setDisplayPosition] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragContext, setDragContext] = useState<"queue" | "playlist" | "playlistList" | null>(
    null,
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    trackId: "",
    trackTitle: "",
    source: "library",
  });

  // 複数選択
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(
    new Set(),
  );
  const [lastClickedTrackId, setLastClickedTrackId] = useState<string | null>(
    null,
  );

  // テーマ
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("theme");
    return saved === "light" ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  // リネーム
  const [renamingPlaylist, setRenamingPlaylist] = useState<string | null>(null);
  const [renamePlaylistValue, setRenamePlaylistValue] = useState("");
  const [renameTrackId, setRenameTrackId] = useState<string | null>(null);
  const [renameTrackValue, setRenameTrackValue] = useState("");

  // 設定関連
  const [settings, setSettings] = useState<api.AppSettings | null>(null);
  const [systemStatus, setSystemStatus] = useState<api.SystemStatus | null>(
    null,
  );
  const [settingsForm, setSettingsForm] = useState({
    discordToken: "",
    musicFolder: "",
  });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  // WebSocket接続
  useEffect(() => {
    api.connectWebSocket(setRawPlayerState);
    return () => api.disconnectWebSocket();
  }, []);

  // ローカルaudio要素の音量を playerState に合わせる
  useEffect(() => {
    if (audioRef.current && rawPlayerState) {
      audioRef.current.volume = rawPlayerState.volume / 100;
    }
  }, [rawPlayerState?.volume]);

  // 接続状態に応じてローカル再生 or Discord再生の state を合成
  const isLocalMode = rawPlayerState?.connection !== "connected";
  const playerState: PlayerState | null = rawPlayerState
    ? isLocalMode
      ? {
          ...rawPlayerState,
          current: localCurrent,
          paused: localPaused,
          position: localPosition,
          queue: localQueue,
        }
      : rawPlayerState
    : null;

  // 再生位置の定期更新（シーク中は停止）
  useEffect(() => {
    if (!playerState?.current || playerState.paused || isSeeking) {
      return;
    }

    // ローカル再生モード: audio要素から currentTime を取得
    if (isLocalMode) {
      const interval = setInterval(() => {
        const audio = audioRef.current;
        if (audio) {
          setDisplayPosition(audio.currentTime);
          setLocalPosition(audio.currentTime);
        }
      }, 100);
      return () => clearInterval(interval);
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
  }, [
    playerState?.current?.id,
    playerState?.paused,
    playerState?.position,
    isSeeking,
  ]);

  // playerStateが更新されたらdisplayPositionも更新（シーク中は無視）
  useEffect(() => {
    if (playerState && !isSeeking) {
      setDisplayPosition(playerState.position);
    }
  }, [playerState?.position, isSeeking]);

  // 初期データ取得（バックエンド起動待ちのリトライ付き）
  useEffect(() => {
    let cancelled = false;
    const attemptLoad = async () => {
      const maxRetries = 30; // 最大30回（約60秒）
      for (let i = 0; i < maxRetries; i++) {
        if (cancelled) return;
        try {
          await loadInitialData();
          console.log(`Initial data loaded (attempt ${i + 1})`);
          return; // 成功したら終了
        } catch (error) {
          console.log(
            `Waiting for backend... (attempt ${i + 1}/${maxRetries})`,
          );
          // 最初は短く、徐々に長くする（1s, 1s, 2s, 2s, 3s... 最大5s）
          const delay = Math.min(1000 + Math.floor(i / 2) * 1000, 5000);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
      console.error("Failed to connect to backend after max retries");
    };
    attemptLoad();
    return () => {
      cancelled = true;
    };
  }, []);

  // タブ切り替え時に選択をクリア & 設定タブのステータス再取得
  useEffect(() => {
    setSelectedTrackIds(new Set());
    setLastClickedTrackId(null);
    if (activeTab === "settings") {
      api.getSystemStatus().then(setSystemStatus).catch(console.error);
      api.getSettings().then(setSettings).catch(console.error);
    }
  }, [activeTab]);

  // ギルド選択時にチャンネル取得
  useEffect(() => {
    if (selectedGuild) {
      api.getChannels(selectedGuild).then(setChannels);
    } else {
      setChannels([]);
      setSelectedChannel("");
    }
  }, [selectedGuild]);

  const loadInitialData = async () => {
    const [
      state,
      guildList,
      trackList,
      playlistList,
      settingsData,
      statusData,
    ] = await Promise.all([
      api.getPlayerState(),
      api.getGuilds(),
      api.getLibrary(),
      api.getPlaylists(),
      api.getSettings(),
      api.getSystemStatus(),
    ]);
    setRawPlayerState(state);
    setGuilds(guildList);
    setTracks(trackList);
    setPlaylists(playlistList);
    setSettings(settingsData);
    setSystemStatus(statusData);
    setSettingsForm({
      discordToken: "",
      musicFolder: settingsData.currentMusicFolder || "",
    });

    if (state.guildId) {
      setSelectedGuild(state.guildId);
      if (state.channelId) {
        setSelectedChannel(state.channelId);
      }
    }
  };

  // 全体再読み込み
  const handleReloadAll = async () => {
    setIsLoading(true);
    try {
      await loadInitialData();
    } catch (error) {
      console.error("Failed to reload data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // サーバーリスト再読み込み
  const handleReloadGuilds = async () => {
    try {
      const guildList = await api.getGuilds();
      setGuilds(guildList);
    } catch (error) {
      console.error("Failed to reload guilds:", error);
    }
  };

  // ===== 接続操作 =====
  const handleJoin = async () => {
    if (!selectedGuild || !selectedChannel) return;
    try {
      await api.joinChannel(selectedGuild, selectedChannel);
    } catch (error) {
      console.error("Failed to join:", error);
    }
  };

  const handleLeave = async () => {
    try {
      await api.leaveChannel();
    } catch (error) {
      console.error("Failed to leave:", error);
    }
  };

  // ===== ローカル再生ヘルパー =====
  const playLocalTrack = (track: Track) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = api.getTrackStreamUrl(track.id);
    audio.play().catch((err) => console.error("Local play failed:", err));
    setLocalCurrent(track);
    setLocalPaused(false);
    setLocalPosition(0);
    setDisplayPosition(0);
  };

  const findTrackById = (trackId: string): Track | undefined => {
    return (
      tracks.find((t) => t.id === trackId) ||
      localQueue.find((t) => t.id === trackId) ||
      (localCurrent?.id === trackId ? localCurrent : undefined) ||
      selectedPlaylist?.tracks?.find((t) => t.id === trackId)
    );
  };

  // ===== 再生操作 =====
  const handlePlay = async (trackId: string) => {
    if (isLocalMode) {
      const track = findTrackById(trackId);
      if (track) playLocalTrack(track);
      return;
    }
    try {
      await api.playTrack(trackId);
    } catch (error) {
      console.error("Failed to play:", error);
    }
  };

  const handleQueue = async (trackId: string) => {
    if (isLocalMode) {
      const track = findTrackById(trackId);
      if (!track) return;
      if (!localCurrent) {
        playLocalTrack(track);
      } else {
        setLocalQueue((q) => [...q, track]);
      }
      return;
    }
    try {
      await api.queueTrack(trackId);
    } catch (error) {
      console.error("Failed to queue:", error);
    }
  };

  const handlePlayNext = async (trackId: string) => {
    if (isLocalMode) {
      const track = findTrackById(trackId);
      if (!track) return;
      if (!localCurrent) {
        playLocalTrack(track);
      } else {
        setLocalQueue((q) => [track, ...q]);
      }
      return;
    }
    try {
      await api.playNextInQueue(trackId);
    } catch (error) {
      console.error("Failed to add to play next:", error);
    }
  };

  // ===== 複数選択 =====
  // クリックによる選択ハンドラ（trackListは現在表示中のリスト）
  const handleTrackClick = (
    e: React.MouseEvent,
    trackId: string,
    trackList: { id: string }[],
  ) => {
    // ダブルクリック再生の妨げにならないよう、修飾キーなしのクリックは選択解除
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      // 修飾キーなし: 選択中のものがあれば選択解除のみ（再生はdblclickで処理）
      if (selectedTrackIds.size > 0) {
        setSelectedTrackIds(new Set());
        setLastClickedTrackId(null);
      }
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+Click: トグル選択
      setSelectedTrackIds((prev) => {
        const next = new Set(prev);
        if (next.has(trackId)) {
          next.delete(trackId);
        } else {
          next.add(trackId);
        }
        return next;
      });
      setLastClickedTrackId(trackId);
    } else if (e.shiftKey && lastClickedTrackId) {
      // Shift+Click: 範囲選択
      const ids = trackList.map((t) => t.id);
      const startIdx = ids.indexOf(lastClickedTrackId);
      const endIdx = ids.indexOf(trackId);
      if (startIdx !== -1 && endIdx !== -1) {
        const from = Math.min(startIdx, endIdx);
        const to = Math.max(startIdx, endIdx);
        const rangeIds = ids.slice(from, to + 1);
        setSelectedTrackIds((prev) => {
          const next = new Set(prev);
          for (const id of rangeIds) {
            next.add(id);
          }
          return next;
        });
      }
    }
  };

  const clearSelection = () => {
    setSelectedTrackIds(new Set());
    setLastClickedTrackId(null);
  };

  // 一括操作
  const handleBulkQueue = async () => {
    const ids = Array.from(selectedTrackIds);
    if (ids.length === 0) return;
    if (isLocalMode) {
      const toAdd = ids.map(findTrackById).filter((t): t is Track => !!t);
      if (!localCurrent && toAdd.length > 0) {
        playLocalTrack(toAdd[0]);
        setLocalQueue((q) => [...q, ...toAdd.slice(1)]);
      } else {
        setLocalQueue((q) => [...q, ...toAdd]);
      }
      clearSelection();
      return;
    }
    try {
      await api.queueTracks(ids);
      clearSelection();
    } catch (error) {
      console.error("Failed to queue tracks:", error);
    }
  };

  const handleBulkPlayNext = async () => {
    const ids = Array.from(selectedTrackIds);
    if (ids.length === 0) return;
    if (isLocalMode) {
      const toAdd = ids.map(findTrackById).filter((t): t is Track => !!t);
      if (!localCurrent && toAdd.length > 0) {
        playLocalTrack(toAdd[0]);
        setLocalQueue((q) => [...toAdd.slice(1), ...q]);
      } else {
        setLocalQueue((q) => [...toAdd, ...q]);
      }
      clearSelection();
      return;
    }
    try {
      await api.playNextInQueueBulk(ids);
      clearSelection();
    } catch (error) {
      console.error("Failed to play next:", error);
    }
  };

  const handleBulkAddToPlaylist = async (playlistName: string) => {
    const ids = Array.from(selectedTrackIds);
    if (ids.length === 0) return;
    try {
      await api.addTracksToPlaylist(playlistName, ids);
      if (selectedPlaylist?.name === playlistName) {
        const fullPlaylist = await api.getPlaylist(playlistName);
        setSelectedPlaylist(fullPlaylist);
      }
      const playlistList = await api.getPlaylists();
      setPlaylists(playlistList);
      clearSelection();
    } catch (error) {
      console.error("Failed to add to playlist:", error);
    }
  };

  // コンテキストメニュー
  const handleContextMenu = (
    e: React.MouseEvent,
    trackId: string,
    trackTitle: string,
    source: "library" | "playlist" | "queue",
    index?: number,
  ) => {
    e.preventDefault();

    // 選択中のトラックの上で右クリックした場合、選択を維持
    // 選択外で右クリックした場合、選択をクリアしてそのトラックだけを対象に
    if (selectedTrackIds.size > 0 && !selectedTrackIds.has(trackId)) {
      clearSelection();
    }

    // メニューの推定高さ（基本項目 + プレイリスト数に応じて動的に計算）
    const baseItems = 5; // 再生、名前変更、次に再生、キューに追加、divider
    const playlistItems = playlists.length + 1; // ラベル + 各プレイリスト
    const itemHeight = 32;
    const menuHeight = Math.min((baseItems + playlistItems) * itemHeight + 40, window.innerHeight - 20);
    const menuWidth = 200;

    // 画面内に収まるように位置を調整
    let y = e.clientY;
    let x = e.clientX;

    if (y + menuHeight > window.innerHeight) {
      y = Math.max(10, window.innerHeight - menuHeight - 10);
    }
    if (x + menuWidth > window.innerWidth) {
      x = Math.max(10, window.innerWidth - menuWidth - 10);
    }

    setContextMenu({
      visible: true,
      x,
      y,
      trackId,
      trackTitle,
      source,
      index,
    });
  };

  const closeContextMenu = () => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  // コンテキストメニューの外側クリックで閉じる
  useEffect(() => {
    const handleClick = () => closeContextMenu();
    if (contextMenu.visible) {
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [contextMenu.visible]);

  const handleLocalSkip = () => {
    const next = localQueue[0];
    if (next) {
      setLocalQueue((q) => q.slice(1));
      playLocalTrack(next);
    } else {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = "";
      }
      setLocalCurrent(null);
      setLocalPaused(false);
      setLocalPosition(0);
      setDisplayPosition(0);
    }
  };

  const handlePause = () => {
    if (isLocalMode) {
      audioRef.current?.pause();
      setLocalPaused(true);
      return;
    }
    return api.pausePlayer();
  };
  const handleResume = () => {
    if (isLocalMode) {
      audioRef.current?.play().catch((err) => console.error(err));
      setLocalPaused(false);
      return;
    }
    return api.resumePlayer();
  };
  const handleSkip = () => {
    if (isLocalMode) {
      handleLocalSkip();
      return;
    }
    return api.skipTrack();
  };
  const handleStop = () => {
    if (isLocalMode) {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = "";
      }
      setLocalCurrent(null);
      setLocalPaused(false);
      setLocalPosition(0);
      setDisplayPosition(0);
      return;
    }
    return api.stopPlayer();
  };
  const handleClearQueue = () => {
    if (isLocalMode) {
      setLocalQueue([]);
      return;
    }
    return api.clearQueue();
  };

  const handleRemoveFromQueue = async (index: number) => {
    if (isLocalMode) {
      setLocalQueue((q) => q.filter((_, i) => i !== index));
      return;
    }
    try {
      await api.removeFromQueue(index);
    } catch (error) {
      console.error("Failed to remove from queue:", error);
    }
  };

  const handleVolumeChange = (volume: number) => {
    if (isLocalMode) {
      if (audioRef.current) audioRef.current.volume = volume / 100;
      setRawPlayerState((s) => (s ? { ...s, volume } : s));
      return;
    }
    api.updateSettings({ volume });
  };

  const handleLoopChange = () => {
    if (!playerState) return;
    const modes: LoopMode[] = ["off", "one", "all"];
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
    if (isLocalMode) {
      if (audioRef.current) audioRef.current.currentTime = position;
      setLocalPosition(position);
      setTimeout(() => setIsSeeking(false), 200);
      return;
    }
    try {
      await api.seekPlayer(position);
      // シーク完了後、少し待ってからサーバーの状態を反映
      setTimeout(() => {
        setIsSeeking(false);
      }, 500);
    } catch (error) {
      console.error("Failed to seek:", error);
      setIsSeeking(false);
    }
  };

  // ===== ドラッグ&ドロップ =====
  const handleDragStart = (index: number, context: "queue" | "playlist" | "playlistList") => {
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
    if (
      draggedIndex === null ||
      dragOverIndex === null ||
      draggedIndex === dragOverIndex
    ) {
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
      console.error("Failed to reorder queue:", error);
    }
    handleDragEnd();
  };

  const handlePlaylistDrop = async () => {
    const fromIndex = draggedIndex;
    const toIndex = dragOverIndex;
    if (
      !selectedPlaylist ||
      !selectedPlaylist.tracks ||
      fromIndex === null ||
      toIndex === null ||
      fromIndex === toIndex
    ) {
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
      console.error("Failed to reorder playlist:", error);
    }
    handleDragEnd();
  };

  const handlePlaylistListDrop = async () => {
    const fromIndex = draggedIndex;
    const toIndex = dragOverIndex;
    if (fromIndex === null || toIndex === null || fromIndex === toIndex) {
      handleDragEnd();
      return;
    }
    const reordered = getReorderedList(playlists);
    const names = reordered.map(p => p.name);
    setPlaylists(reordered);
    try {
      await api.reorderPlaylists(names);
    } catch (error) {
      console.error("Failed to reorder playlists:", error);
      const playlistList = await api.getPlaylists();
      setPlaylists(playlistList);
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
      console.error("Search failed:", error);
    }
  }, []);

  const handleRescan = async () => {
    setIsLoading(true);
    try {
      await api.rescanLibrary();
      const trackList = await api.getLibrary(searchQuery);
      setTracks(trackList);
    } catch (error) {
      console.error("Rescan failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // ===== プレイリスト操作 =====
  const [playlistError, setPlaylistError] = useState("");

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    setPlaylistError("");
    try {
      await api.createPlaylist(newPlaylistName.trim());
      setNewPlaylistName("");
      const playlistList = await api.getPlaylists();
      setPlaylists(playlistList);
    } catch (error: any) {
      console.error("Failed to create playlist:", error);
      const msg = error?.message || String(error);
      if (msg.includes("already exists")) {
        setPlaylistError("同名のプレイリストが既に存在します");
      } else {
        setPlaylistError("プレイリストの作成に失敗しました");
      }
      setTimeout(() => setPlaylistError(""), 3000);
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
      console.error("Failed to delete playlist:", error);
    }
  };

  const handleRenamePlaylist = async (oldName: string, newName: string) => {
    if (!newName.trim() || newName.trim() === oldName) {
      setRenamingPlaylist(null);
      return;
    }
    try {
      await api.renamePlaylist(oldName, newName.trim());
      const playlistList = await api.getPlaylists();
      setPlaylists(playlistList);
      if (selectedPlaylist?.name === oldName) {
        const fullPlaylist = await api.getPlaylist(newName.trim());
        setSelectedPlaylist(fullPlaylist);
      }
    } catch (error: any) {
      console.error("Failed to rename playlist:", error);
      setPlaylistError(error?.message || "プレイリスト名の変更に失敗しました");
      setTimeout(() => setPlaylistError(""), 3000);
    }
    setRenamingPlaylist(null);
  };

  const handleRenameTrack = async (trackId: string, newTitle: string) => {
    if (!newTitle.trim()) {
      setRenameTrackId(null);
      return;
    }
    try {
      await api.renameTrack(trackId, newTitle.trim());
      // ライブラリを再取得
      const libraryTracks = await api.getLibrary(searchQuery || undefined);
      setTracks(libraryTracks);
      // プレイリストも更新
      const playlistList = await api.getPlaylists();
      setPlaylists(playlistList);
      if (selectedPlaylist) {
        const fullPlaylist = await api.getPlaylist(selectedPlaylist.name);
        setSelectedPlaylist(fullPlaylist);
      }
    } catch (error: any) {
      console.error("Failed to rename track:", error);
    }
    setRenameTrackId(null);
  };

  const handleSelectPlaylist = async (playlist: Playlist) => {
    try {
      const fullPlaylist = await api.getPlaylist(playlist.name);
      setSelectedPlaylist(fullPlaylist);
    } catch (error) {
      console.error("Failed to load playlist:", error);
    }
  };

  const handlePlayPlaylist = async (
    name: string,
    mode: "replace" | "append" = "replace",
  ) => {
    if (isLocalMode) {
      try {
        const pl = await api.getPlaylist(name);
        const list = pl.tracks || [];
        if (list.length === 0) return;
        if (mode === "replace") {
          playLocalTrack(list[0]);
          setLocalQueue(list.slice(1));
        } else {
          if (!localCurrent) {
            playLocalTrack(list[0]);
            setLocalQueue((q) => [...q, ...list.slice(1)]);
          } else {
            setLocalQueue((q) => [...q, ...list]);
          }
        }
      } catch (error) {
        console.error("Failed to play playlist locally:", error);
      }
      return;
    }
    try {
      await api.playPlaylist(name, mode);
    } catch (error) {
      console.error("Failed to play playlist:", error);
    }
  };

  const handleAddToPlaylist = async (playlistName: string, trackId: string) => {
    try {
      await api.addTrackToPlaylist(playlistName, trackId);
      if (selectedPlaylist?.name === playlistName) {
        const fullPlaylist = await api.getPlaylist(playlistName);
        setSelectedPlaylist(fullPlaylist);
      }
      // プレイリスト一覧も更新（曲数の反映）
      const playlistList = await api.getPlaylists();
      setPlaylists(playlistList);
    } catch (error) {
      console.error("Failed to add to playlist:", error);
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
      console.error("Failed to remove from playlist:", error);
    }
  };

  // ===== 設定操作 =====
  const handleSaveSettings = async () => {
    try {
      setSettingsError("");
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
      setSettingsForm((prev) => ({ ...prev, discordToken: "" }));

      // ステータスを更新
      const statusData = await api.getSystemStatus();
      setSystemStatus(statusData);

      if (result.needsRestart) {
        setSettingsError("設定を反映するにはアプリを再起動してください");
      }

      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSettingsError("設定の保存に失敗しました");
    }
  };

  const handleOpenMusicFolder = async () => {
    try {
      await api.openMusicFolder();
    } catch (error) {
      console.error("Failed to open folder:", error);
    }
  };

  // ===== レンダリング =====
  const getLoopIcon = () => {
    if (playerState?.loop === "one") return <Repeat1 size={18} />;
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
          {systemStatus?.version && (
            <span className="version-badge">v{systemStatus.version}</span>
          )}
        </h1>
        <div className="header-actions">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            className="btn btn-ghost"
            onClick={handleReloadAll}
            disabled={isLoading}
            title="全体を再読み込み"
          >
            <RefreshCw size={18} className={isLoading ? "spin" : ""} />
          </button>
        </div>
      </header>

      <main className="main">
        {/* Left Panel - Library/Playlists */}
        <div className="card">
          {/* Tabs */}
          <div className="tabs">
            <button
              className={`tab ${activeTab === "library" ? "active" : ""}`}
              onClick={() => setActiveTab("library")}
            >
              <Library size={16} /> ライブラリ
            </button>
            <button
              className={`tab ${activeTab === "playlists" ? "active" : ""}`}
              onClick={() => setActiveTab("playlists")}
            >
              <List size={16} /> プレイリスト
            </button>
            <button
              className={`tab ${activeTab === "queue" ? "active" : ""}`}
              onClick={() => setActiveTab("queue")}
            >
              <ListPlus size={16} /> キュー
              {playerState && playerState.queue.length > 0 && (
                <span className="queue-count">
                  {" "}
                  ({playerState.queue.length})
                </span>
              )}
            </button>
            <button
              className={`tab ${activeTab === "settings" ? "active" : ""}`}
              onClick={() => setActiveTab("settings")}
            >
              <Settings size={16} /> 設定
            </button>
          </div>

          {/* Library Tab */}
          {activeTab === "library" && (
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
                  <button
                    className="btn btn-secondary"
                    onClick={handleRescan}
                    disabled={isLoading}
                  >
                    <RefreshCw size={16} className={isLoading ? "spin" : ""} />
                  </button>
                </div>
              </div>
              {selectedTrackIds.size > 0 && activeTab === "library" && (
                <div className="selection-bar">
                  <span>{selectedTrackIds.size} 曲を選択中</span>
                  <div className="selection-actions">
                    <button onClick={handleBulkPlayNext}>次に再生</button>
                    <button onClick={handleBulkQueue}>キューに追加</button>
                    <button onClick={clearSelection}>選択解除</button>
                  </div>
                </div>
              )}
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
                      className={`track-item ${playerState?.current?.id === track.id ? "playing" : ""} ${selectedTrackIds.has(track.id) ? "selected" : ""}`}
                      onClick={(e) =>
                        handleTrackClick(e, track.id, filteredTracks)
                      }
                      onDoubleClick={() => handlePlay(track.id)}
                      onContextMenu={(e) =>
                        handleContextMenu(e, track.id, track.title, "library")
                      }
                    >
                      <div className="track-info">
                        {renameTrackId === track.id ? (
                          <input
                            type="text"
                            className="input"
                            value={renameTrackValue}
                            onChange={(e) => setRenameTrackValue(e.target.value)}
                            onBlur={() => handleRenameTrack(track.id, renameTrackValue)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRenameTrack(track.id, renameTrackValue);
                              if (e.key === "Escape") setRenameTrackId(null);
                            }}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            style={{ fontSize: "0.875rem", padding: "2px 6px", width: "100%" }}
                          />
                        ) : (
                          <div className="track-title">{track.title}</div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* Playlists Tab */}
          {activeTab === "playlists" && (
            <>
              {!selectedPlaylist ? (
                <>
                  <div className="search-bar">
                    <div className="input-group">
                      <input
                        type="text"
                        className="input"
                        placeholder="新しいプレイリスト名..."
                        value={newPlaylistName}
                        onChange={(e) => setNewPlaylistName(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleCreatePlaylist()
                        }
                      />
                      <button
                        className="btn btn-primary"
                        onClick={handleCreatePlaylist}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    {playlistError && (
                      <div
                        style={{
                          color: "var(--error)",
                          fontSize: "0.8rem",
                          marginTop: "var(--space-xs)",
                        }}
                      >
                        {playlistError}
                      </div>
                    )}
                  </div>
                  <div className="playlist-list">
                    {playlists.length === 0 ? (
                      <div className="empty-state">
                        <List size={48} />
                        <p>プレイリストがありません</p>
                      </div>
                    ) : (
                      (dragContext === "playlistList" ? getReorderedList(playlists) : playlists).map((playlist, plIndex) => (
                        <div
                          key={playlist.name}
                          className={`playlist-item ${dragContext === "playlistList" && dragOverIndex === plIndex ? "dragging" : ""}`}
                          draggable
                          onDragStart={() => handleDragStart(plIndex, "playlistList")}
                          onDragOver={(e) => handleDragOver(e, plIndex)}
                          onDrop={handlePlaylistListDrop}
                          onDragEnd={handleDragEnd}
                          onDoubleClick={() => handleSelectPlaylist(playlist)}
                        >
                          <div>
                            {renamingPlaylist === playlist.name ? (
                              <input
                                type="text"
                                className="input"
                                value={renamePlaylistValue}
                                onChange={(e) => setRenamePlaylistValue(e.target.value)}
                                onBlur={() => handleRenamePlaylist(playlist.name, renamePlaylistValue)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleRenamePlaylist(playlist.name, renamePlaylistValue);
                                  if (e.key === "Escape") setRenamingPlaylist(null);
                                }}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                style={{ fontSize: "0.875rem", padding: "2px 6px" }}
                              />
                            ) : (
                              <div className="playlist-name">{playlist.name}</div>
                            )}
                            <div className="playlist-count">
                              {playlist.trackIds.length} 曲
                            </div>
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
                                setRenamingPlaylist(playlist.name);
                                setRenamePlaylistValue(playlist.name);
                              }}
                              title="名前を変更"
                            >
                              <Edit2 size={16} />
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
                </>
              ) : (
                <>
                  <div className="card-header" style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
                    <button
                      className="btn btn-icon btn-ghost"
                      onClick={() => setSelectedPlaylist(null)}
                      title="プレイリスト一覧に戻る"
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <span style={{ fontWeight: 600 }}>{selectedPlaylist.name}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                      ({selectedPlaylist.trackIds.length} 曲)
                    </span>
                  </div>
                  {selectedTrackIds.size > 0 && (
                    <div className="selection-bar">
                      <span>{selectedTrackIds.size} 曲を選択中</span>
                      <div className="selection-actions">
                        <button onClick={handleBulkPlayNext}>次に再生</button>
                        <button onClick={handleBulkQueue}>キューに追加</button>
                        <button onClick={clearSelection}>選択解除</button>
                      </div>
                    </div>
                  )}
                  <div className="track-list">
                    {selectedPlaylist.tracks && (dragContext === "playlist"
                      ? getReorderedList(selectedPlaylist.tracks)
                      : selectedPlaylist.tracks
                    ).map((track, index) => {
                      const isDragged =
                        dragContext === "playlist" &&
                        draggedIndex !== null &&
                        dragOverIndex !== null &&
                        index === dragOverIndex;

                      return (
                        <div
                          key={track.id}
                          className={`track-item ${isDragged ? "dragging" : ""} ${playerState?.current?.id === track.id ? "playing" : ""} ${selectedTrackIds.has(track.id) ? "selected" : ""}`}
                          draggable
                          onDragStart={() => handleDragStart(index, "playlist")}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDrop={handlePlaylistDrop}
                          onDragEnd={handleDragEnd}
                          onClick={(e) =>
                            handleTrackClick(
                              e,
                              track.id,
                              selectedPlaylist.tracks!,
                            )
                          }
                          onDoubleClick={() => handlePlay(track.id)}
                          onContextMenu={(e) =>
                            handleContextMenu(
                              e,
                              track.id,
                              track.title,
                              "playlist",
                              index,
                            )
                          }
                        >
                          <span
                            style={{
                              color: "var(--text-muted)",
                              fontSize: "0.75rem",
                              width: "24px",
                              flexShrink: 0,
                            }}
                          >
                            {index + 1}
                          </span>
                          <div className="track-info">
                            {renameTrackId === track.id ? (
                              <input
                                type="text"
                                className="input"
                                value={renameTrackValue}
                                onChange={(e) => setRenameTrackValue(e.target.value)}
                                onBlur={() => handleRenameTrack(track.id, renameTrackValue)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleRenameTrack(track.id, renameTrackValue);
                                  if (e.key === "Escape") setRenameTrackId(null);
                                }}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                style={{ fontSize: "0.875rem", padding: "2px 6px", width: "100%" }}
                              />
                            ) : (
                              <div className="track-title">{track.title}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}

          {/* Queue Tab */}
          {activeTab === "queue" && (
            <>
              <div className="card-header queue-header">
                <span>再生キュー</span>
                {playerState && playerState.queue.length > 0 && (
                  <button
                    className="btn btn-secondary"
                    onClick={handleClearQueue}
                  >
                    クリア
                  </button>
                )}
              </div>
              {selectedTrackIds.size > 0 && activeTab === "queue" && (
                <div className="selection-bar">
                  <span>{selectedTrackIds.size} 曲を選択中</span>
                  <div className="selection-actions">
                    <button onClick={handleBulkPlayNext}>次に再生</button>
                    <button onClick={handleBulkQueue}>キューに追加</button>
                    <button onClick={clearSelection}>選択解除</button>
                  </div>
                </div>
              )}
              <div className="track-list">
                {!playerState || playerState.queue.length === 0 ? (
                  <div className="empty-state">
                    <ListPlus size={48} />
                    <p>キューは空です</p>
                  </div>
                ) : (
                  (dragContext === "queue"
                    ? getReorderedList(playerState.queue)
                    : playerState.queue
                  ).map((track, index) => {
                    // 元のインデックスを計算（ドラッグ操作用）
                    const originalIndex =
                      dragContext === "queue" &&
                      draggedIndex !== null &&
                      dragOverIndex !== null
                        ? index === dragOverIndex
                          ? draggedIndex
                          : index >= Math.min(draggedIndex, dragOverIndex) &&
                              index <= Math.max(draggedIndex, dragOverIndex)
                            ? draggedIndex < dragOverIndex
                              ? index - 1
                              : index + 1
                            : index
                        : index;
                    const isDragged =
                      dragContext === "queue" && originalIndex === draggedIndex;

                    return (
                      <div
                        key={`${track.id}-${index}`}
                        className={`track-item ${isDragged ? "dragging" : ""} ${selectedTrackIds.has(track.id) ? "selected" : ""}`}
                        draggable
                        onDragStart={() => handleDragStart(index, "queue")}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={handleQueueDrop}
                        onDragEnd={handleDragEnd}
                        onClick={(e) =>
                          handleTrackClick(e, track.id, playerState.queue)
                        }
                        onDoubleClick={() => handlePlay(track.id)}
                        onContextMenu={(e) =>
                          handleContextMenu(
                            e,
                            track.id,
                            track.title,
                            "queue",
                            originalIndex,
                          )
                        }
                      >
                        <span
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "0.75rem",
                            width: "24px",
                            flexShrink: 0,
                          }}
                        >
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
          {activeTab === "settings" && (
            <div className="settings-panel">
              <div className="card-body">
                {/* ステータス */}
                <div className="settings-section">
                  <h3 className="settings-title">ステータス</h3>
                  <div className="status-grid">
                    <div className="status-item">
                      <span className="status-label">Discord接続</span>
                      <span
                        className={`status-value ${systemStatus?.discordConnected ? "success" : "error"}`}
                      >
                        {systemStatus?.discordConnected ? (
                          <>
                            <CheckCircle size={14} /> 接続中
                          </>
                        ) : (
                          <>
                            <AlertCircle size={14} /> 未接続
                          </>
                        )}
                      </span>
                    </div>
                    <div className="status-item">
                      <span className="status-label">曲数</span>
                      <span className="status-value">
                        {systemStatus?.trackCount || 0} 曲
                      </span>
                    </div>
                  </div>
                </div>

                {/* Discord Token */}
                <div className="settings-section">
                  <h3 className="settings-title">Discord Bot Token</h3>
                  <p className="settings-description">
                    {settings?.hasToken
                      ? `設定済み: ${settings.discordToken}`
                      : "トークンが設定されていません"}
                  </p>
                  <div className="input-group">
                    <input
                      type="password"
                      className="input"
                      placeholder="新しいトークンを入力..."
                      value={settingsForm.discordToken}
                      onChange={(e) =>
                        setSettingsForm((prev) => ({
                          ...prev,
                          discordToken: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                {/* Music Folder */}
                <div className="settings-section">
                  <h3 className="settings-title">音楽フォルダ</h3>
                  <p className="settings-description">
                    現在のフォルダ: {settings?.currentMusicFolder || "未設定"}
                  </p>
                  <div className="input-group">
                    <button
                      className="btn btn-secondary"
                      onClick={handleOpenMusicFolder}
                    >
                      <FolderOpen size={16} /> フォルダを開く
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={handleRescan}
                      disabled={isLoading}
                    >
                      <RefreshCw
                        size={16}
                        className={isLoading ? "spin" : ""}
                      />{" "}
                      再スキャン
                    </button>
                  </div>
      </div>

                {/* 保存ボタン */}
                <div className="settings-section">
                  <button
                    className="btn btn-primary"
                    onClick={handleSaveSettings}
                  >
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

                {/* デバッグ情報 */}
                <div className="settings-section">
                  <h3 className="settings-title">デバッグ情報</h3>
                  <div className="debug-info">
                    <p>
                      データディレクトリ:{" "}
                      <code>{systemStatus?.dataDir || "不明"}</code>
                    </p>
                    <p>
                      音楽フォルダ:{" "}
                      <code>{systemStatus?.musicFolder || "不明"}</code>
                    </p>
                    <p className="debug-hint">
                      ※
                      問題が発生した場合は、タスクトレイのアイコンを右クリックして「ログを開く」で詳細を確認できます。
        </p>
      </div>
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
                  className={`status-dot ${playerState?.connection || "disconnected"}`}
                />
                <span>
                  {playerState?.connection === "connected"
                    ? "接続中"
                    : playerState?.connection === "connecting"
                      ? "接続中..."
                      : "未接続"}
                </span>
              </div>
              <div className="connection-selects">
                <div className="select-with-reload">
                  <select
                    className="select"
                    value={selectedGuild}
                    onChange={(e) => setSelectedGuild(e.target.value)}
                    style={{ flex: 1 }}
                  >
                    <option value="">サーバーを選択</option>
                    {guilds.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleReloadGuilds}
                    title="サーバーリストを再読み込み"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
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
                {playerState?.connection === "connected" ? (
                  <button
                    className="btn btn-secondary"
                    onClick={handleLeave}
                    style={{ flex: 1 }}
                  >
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
                    {playerState.paused ? "一時停止中" : "再生中"}
                  </div>
                  <div className="now-playing-title">
                    {playerState.current.title}
                  </div>
                  {/* Progress Bar */}
                  <div className="progress-container">
                    <span className="progress-time">
                      {formatTime(displayPosition)}
                    </span>
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
                          width: `${
                            playerState.current.duration > 0
                              ? (displayPosition /
                                  playerState.current.duration) *
                                100
                              : 0
                          }%`,
                        }}
                      />
                      <div
                        className="progress-thumb"
                        style={{
                          left: `${
                            playerState.current.duration > 0
                              ? (displayPosition /
                                  playerState.current.duration) *
                                100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <span className="progress-time">
                      {formatTime(playerState.current.duration)}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="now-playing-status">停止中</div>
                  <div
                    className="now-playing-title"
                    style={{ color: "var(--text-muted)" }}
                  >
                    曲を選択してください
                  </div>
                </>
              )}
            </div>

            {/* Controls */}
            <div className="player-controls">
              <button
                className={`btn btn-icon shuffle-btn ${playerState?.shuffle ? "active" : ""}`}
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
                title={playerState?.paused ? "再生" : "一時停止"}
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
                className={`btn btn-icon loop-btn ${playerState?.loop || "off"}`}
                onClick={handleLoopChange}
                title={`ループ: ${playerState?.loop || "off"}`}
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
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    width: "32px",
                  }}
                >
                  {playerState?.volume || 50}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ローカル再生用の非表示audio要素 */}
      <audio
        ref={audioRef}
        onEnded={() => {
          if (isLocalMode) handleLocalSkip();
        }}
        onPlay={() => setLocalPaused(false)}
        onPause={() => {
          if (audioRef.current && !audioRef.current.ended) setLocalPaused(true);
        }}
        style={{ display: "none" }}
      />

      {/* コンテキストメニュー */}
      {contextMenu.visible && (() => {
        const isBulk = selectedTrackIds.size > 1 && selectedTrackIds.has(contextMenu.trackId);
        const bulkIds = Array.from(selectedTrackIds);

        return (
          <div
            className="context-menu"
            style={{
              position: "fixed",
              top: contextMenu.y,
              left: contextMenu.x,
              zIndex: 1000,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="context-menu-header">
              {isBulk
                ? `${selectedTrackIds.size} 曲を選択中`
                : contextMenu.trackTitle}
            </div>
            {!isBulk && (
              <button
                className="context-menu-item"
                onClick={() => {
                  handlePlay(contextMenu.trackId);
                  closeContextMenu();
                }}
              >
                再生
              </button>
            )}
            {!isBulk && (
              <button
                className="context-menu-item"
                onClick={() => {
                  setRenameTrackId(contextMenu.trackId);
                  setRenameTrackValue(contextMenu.trackTitle);
                  closeContextMenu();
                }}
              >
                名前を変更
              </button>
            )}
            <button
              className="context-menu-item"
              onClick={() => {
                if (isBulk) {
                  handleBulkPlayNext();
                } else {
                  handlePlayNext(contextMenu.trackId);
                }
                closeContextMenu();
              }}
            >
              次に再生{isBulk ? ` (${bulkIds.length}曲)` : ""}
            </button>
            <button
              className="context-menu-item"
              onClick={() => {
                if (isBulk) {
                  handleBulkQueue();
                } else {
                  handleQueue(contextMenu.trackId);
                }
                closeContextMenu();
              }}
            >
              キューに追加{isBulk ? ` (${bulkIds.length}曲)` : ""}
            </button>
            {playlists.length > 0 && (
              <>
                <div className="context-menu-divider" />
                <div className="context-menu-submenu" style={{ maxHeight: "40vh", overflowY: "auto" }}>
                  <span className="context-menu-label">プレイリストに追加</span>
                  {playlists.map((pl) => (
                    <button
                      key={pl.name}
                      className="context-menu-item context-menu-subitem"
                      onClick={() => {
                        if (isBulk) {
                          handleBulkAddToPlaylist(pl.name);
                        } else {
                          handleAddToPlaylist(pl.name, contextMenu.trackId);
                        }
                        closeContextMenu();
                      }}
                    >
                      {pl.name}
                      {isBulk ? ` (${bulkIds.length}曲)` : ""}
                    </button>
                  ))}
                </div>
              </>
            )}
            {!isBulk &&
              contextMenu.source === "playlist" &&
              contextMenu.index !== undefined && (
                <>
                  <div className="context-menu-divider" />
                  <button
                    className="context-menu-item context-menu-danger"
                    onClick={() => {
                      handleRemoveFromPlaylist(contextMenu.trackId);
                      closeContextMenu();
                    }}
                  >
                    プレイリストから削除
                  </button>
                </>
              )}
            {!isBulk &&
              contextMenu.source === "queue" &&
              contextMenu.index !== undefined && (
                <>
                  <div className="context-menu-divider" />
                  <button
                    className="context-menu-item context-menu-danger"
                    onClick={() => {
                      handleRemoveFromQueue(contextMenu.index!);
                      closeContextMenu();
                    }}
                  >
                    キューから削除
                  </button>
                </>
              )}
          </div>
        );
      })()}
    </div>
  );
}

export default App;
