import express, { Express, Request, Response, NextFunction } from 'express';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';

import type { PlayerState, LoopMode } from '../types.js';
import { PlayerService } from '../player/PlayerService.js';
import { LibraryService } from '../library/LibraryService.js';
import { PlaylistService } from '../playlists/PlaylistService.js';
import { DiscordAdapter } from '../discord/DiscordAdapter.js';

export class WebApiService {
  private app: Express;
  private httpServer: HttpServer;
  private io: SocketIOServer;
  private port: number;

  private player: PlayerService;
  private library: LibraryService;
  private playlists: PlaylistService;
  private adapter: DiscordAdapter;

  constructor(
    port: number,
    player: PlayerService,
    library: LibraryService,
    playlists: PlaylistService,
    adapter: DiscordAdapter
  ) {
    this.port = port;
    this.player = player;
    this.library = library;
    this.playlists = playlists;
    this.adapter = adapter;

    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
      },
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupPlayerEvents();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    // ===== Discord =====
    this.app.get('/api/discord/guilds', (req, res) => {
      res.json(this.adapter.getGuilds());
    });

    this.app.get('/api/discord/guilds/:guildId/channels', (req, res) => {
      res.json(this.adapter.getVoiceChannels(req.params.guildId));
    });

    // ===== Library =====
    this.app.get('/api/library', (req, res) => {
      const query = req.query.query as string | undefined;
      res.json(this.library.search(query));
    });

    this.app.post('/api/library/rescan', async (req, res) => {
      try {
        const count = await this.library.scan();
        this.io.emit('library_updated', { count });
        res.json({ success: true, count });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // ===== Playlists =====
    this.app.get('/api/playlists', (req, res) => {
      res.json(this.playlists.getAll());
    });

    this.app.post('/api/playlists', (req, res) => {
      try {
        const { name } = req.body;
        const playlist = this.playlists.create(name);
        res.json(playlist);
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.delete('/api/playlists/:name', (req, res) => {
      try {
        this.playlists.delete(req.params.name);
        res.json({ success: true });
      } catch (error) {
        res.status(404).json({ error: String(error) });
      }
    });

    this.app.get('/api/playlists/:name', (req, res) => {
      const playlist = this.playlists.get(req.params.name);
      if (!playlist) {
        return res.status(404).json({ error: 'Playlist not found' });
      }
      // トラック情報も含めて返す
      const tracks = this.library.getTracksByIds(playlist.trackIds);
      res.json({ ...playlist, tracks });
    });

    this.app.post('/api/playlists/:name/tracks', (req, res) => {
      try {
        const { trackId } = req.body;
        this.playlists.addTrack(req.params.name, trackId);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.delete('/api/playlists/:name/tracks/:trackId', (req, res) => {
      try {
        this.playlists.removeTrack(req.params.name, req.params.trackId);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.put('/api/playlists/:name/order', (req, res) => {
      try {
        const { trackIds } = req.body;
        this.playlists.reorder(req.params.name, trackIds);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    // ===== Player =====
    this.app.get('/api/player/state', (req, res) => {
      res.json(this.player.getState());
    });

    this.app.post('/api/player/join', async (req, res) => {
      try {
        const { guildId, channelId } = req.body;
        await this.player.join(guildId, channelId);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.post('/api/player/leave', (req, res) => {
      this.player.leave();
      res.json({ success: true });
    });

    this.app.post('/api/player/play', (req, res) => {
      try {
        const { trackId } = req.body;
        this.player.playNow(trackId);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.post('/api/player/queue', (req, res) => {
      try {
        const { trackId } = req.body;
        this.player.addToQueue(trackId);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    // 次に再生（キューの先頭に追加）
    this.app.post('/api/player/queue/next', (req, res) => {
      try {
        const { trackId } = req.body;
        this.player.playNextInQueue(trackId);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.post('/api/player/playlist', (req, res) => {
      try {
        const { name, mode = 'replace' } = req.body;
        const playlist = this.playlists.get(name);
        if (!playlist) {
          return res.status(404).json({ error: 'Playlist not found' });
        }
        this.player.playPlaylist(playlist.trackIds, mode);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.post('/api/player/pause', (req, res) => {
      this.player.pause();
      res.json({ success: true });
    });

    this.app.post('/api/player/resume', (req, res) => {
      this.player.resume();
      res.json({ success: true });
    });

    this.app.post('/api/player/skip', (req, res) => {
      this.player.skip();
      res.json({ success: true });
    });

    this.app.post('/api/player/stop', (req, res) => {
      this.player.stop();
      res.json({ success: true });
    });

    this.app.post('/api/player/seek', (req, res) => {
      try {
        const { position } = req.body;
        this.player.seek(position);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.delete('/api/player/queue', (req, res) => {
      this.player.clearQueue();
      res.json({ success: true });
    });

    this.app.delete('/api/player/queue/:index', (req, res) => {
      try {
        const index = parseInt(req.params.index, 10);
        this.player.removeFromQueue(index);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.put('/api/player/queue/reorder', (req, res) => {
      try {
        const { fromIndex, toIndex } = req.body;
        this.player.reorderQueue(fromIndex, toIndex);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.post('/api/player/settings', (req, res) => {
      try {
        const { volume, loop, shuffle } = req.body;
        if (volume !== undefined) {
          this.player.setVolume(volume);
        }
        if (loop !== undefined) {
          this.player.setLoop(loop as LoopMode);
        }
        if (shuffle !== undefined) {
          this.player.setShuffle(shuffle);
        }
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    // エラーハンドラー
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('API Error:', err);
      res.status(500).json({ error: err.message });
    });
  }

  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      console.log('WebSocket client connected:', socket.id);

      // 接続時に現在の状態を送信
      socket.emit('player_state', this.player.getState());

      socket.on('disconnect', () => {
        console.log('WebSocket client disconnected:', socket.id);
      });
    });
  }

  private setupPlayerEvents(): void {
    this.player.onStateChange = (state: PlayerState) => {
      this.io.emit('player_state', state);
    };
  }

  start(): void {
    this.httpServer.listen(this.port, () => {
      console.log(`Web API server running at http://localhost:${this.port}`);
    });
  }

  stop(): void {
    this.io.close();
    this.httpServer.close();
  }
}
