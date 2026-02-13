---
title: "DiscordのVCで自作BGMを流したくて、Web UI付きの音楽Botをデスクトップアプリにした話"
emoji: "🎵"
type: "idea"
topics: ["discord", "electron", "typescript", "react", "discordjs"]
published: false
---

## これは何？

Discord のボイスチャンネルで、ローカルに保存した音楽ファイルを再生できる Bot を作りました。
ブラウザの Web UI から選曲・プレイリスト管理・再生操作ができて、Electron でデスクトップアプリとして配布できるようにしてあります。

![Discord Music Bot の概要図](/images/discord-music-bot-overview.png)
*↑ あとで実際のスクリーンショットに差し替え推奨*

## なぜ作ったのか

自分で作った曲を Discord の VC で友達に聴いてもらいたい、というのが始まりです。

既存の手段だと、こんな問題がありました：

- **画面共有 + OBS**: 音質が配信品質に依存する。BGM として流したいだけなのに大げさ
- **既存の音楽Bot（Rythm系）**: YouTube等のストリーミング前提で、ローカルファイルを流せない
- **ファイルを直接送る**: VCでリアルタイムに流せない。「今この曲聴いて！」ができない

**「ローカルの音楽ファイルを、Botが直接VCに流してくれる」** というシンプルなものが欲しかった。
それなら自分で作るか、と。

## 完成したもの

### 主な機能

- ローカル音源の再生（mp3 / wav / flac / ogg / m4a）
- キュー管理（追加・削除・並び替え・「次に再生」）
- プレイリスト管理（作成・削除・曲の追加/削除・並び替え）
- シャッフル・ループ再生（off / 1曲 / 全曲）
- 音量調整・シーク（再生位置の変更）
- 曲の複数選択 → 一括でキュー/プレイリストに追加
- ダーク/ライトテーマ切り替え
- Electron でデスクトップアプリとしてワンクリックインストール

### 技術スタック

| レイヤー | 技術 |
|---------|------|
| バックエンド | Node.js + TypeScript, Express, Socket.IO |
| Discord連携 | discord.js v14, @discordjs/voice, ffmpeg |
| フロントエンド | React (Vite), Socket.IO client |
| デスクトップ | Electron + electron-builder |

## アーキテクチャ

全体は 3 層構成です。

```
┌─────────────────────────────────────────────┐
│              Electron Shell                  │
│  ┌───────────────────────────────────────┐  │
│  │         Web UI (React + Vite)         │  │
│  │  ライブラリ | プレイリスト | キュー | 設定  │  │
│  └──────────────┬──────────┬─────────────┘  │
│           REST API    WebSocket              │
│  ┌──────────────┴──────────┴─────────────┐  │
│  │        Backend (Node.js/TS)           │  │
│  │                                       │  │
│  │  WebApiService ─→ PlayerService       │  │
│  │                     ├→ LibraryService  │  │
│  │                     ├→ PlaylistService │  │
│  │                     └→ DiscordAdapter  │  │
│  │                          ↓             │  │
│  │                    Discord VC 🔊       │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

1 つの Node.js プロセスの中に Discord Bot・REST API・WebSocket サーバーが同居しています。
Electron はそれをラップして、バックエンドプロセスの起動管理とフロントエンドの表示を担当。

### なぜこの構成にしたか

**Bot と Web UI を別プロセスにしなかった理由：**

Discord Bot と Web UI は同じ `PlayerService` の状態を共有する必要があります。
別プロセスにすると IPC やデータ同期の仕組みが必要になりますが、用途的にそこまでの規模じゃない。
1 プロセスにまとめることで、状態管理がシンプルになりました。

**Socket.IO を使った理由：**

再生状態（今何の曲が流れてるか、再生位置、キューの中身）は頻繁に変わります。
REST API のポーリングでも実現できますが、Socket.IO なら状態変化時に即座にプッシュできるので、UI の応答性が良い。

## Discord Bot + Web UI の連携

ここが一番おもしろかったところです。

### 再生の流れ

```
ユーザーがWeb UIで「再生」をクリック
       ↓
  POST /api/player/play { trackId }
       ↓
  WebApiService → PlayerService.playNow(trackId)
       ↓
  PlayerService → LibraryService.getTrack(trackId) でファイルパス取得
       ↓
  PlayerService → DiscordAdapter.play(filePath, volume)
       ↓
  DiscordAdapter → ffmpeg でデコード → @discordjs/voice で VC に送出
       ↓
  PlayerService → onStateChange コールバック発火
       ↓
  WebApiService → Socket.IO で全クライアントに player_state をブロードキャスト
       ↓
  Web UI がリアルタイムに更新 🎶
```

### DiscordAdapter の分離

設計書にも書いたのですが、Discord の音声仕様（DAVE / E2EE）が変わる可能性を考慮して、`PlayerService` と `DiscordAdapter` を分離しました。

```typescript
// PlayerService は「何を再生するか」を管理
// DiscordAdapter は「どうやって音を出すか」を担当

class PlayerService {
  constructor(private adapter: DiscordAdapter, ...) {}

  async playNow(trackId: string) {
    const track = this.library.getTrack(trackId);
    this.adapter.play(track.path, this.volume);
    // ...状態更新
  }
}
```

`DiscordAdapter` を差し替えれば、Discord以外の出力先にも対応できる構造です。
実際にはやっていませんが、こうしておくと安心感がある。

### シーク機能の実装

再生位置を変更するシーク機能は、少しトリッキーでした。

`@discordjs/voice` には直接シークする API がないので、ffmpeg を使って指定位置からデコードし直す方式にしています：

```typescript
// DiscordAdapter 内のシーク処理（簡略化）
play(filePath: string, volume: number, seekSeconds: number = 0) {
  const ffmpegArgs = [
    '-ss', String(seekSeconds),  // ← ここで開始位置を指定
    '-i', filePath,
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1'
  ];
  const process = spawn(ffmpegPath, ffmpegArgs);
  const resource = createAudioResource(process.stdout);
  this.player.play(resource);
}
```

再生を止めて → ffmpeg で指定位置から再デコード → 新しいストリームで再生再開、という流れです。

## Electron でデスクトップアプリにする

ここが一番苦労しました。

### なぜ Electron？

**非エンジニアにも使ってもらいたかった**からです。

Node.js をインストールして、ターミナルで `npm install` して、`.env` にトークンを書いて…というのは、エンジニア以外にはハードルが高すぎる。

Electron でインストーラーにすれば、ダブルクリックでインストール → 起動 → UIからトークンを設定、で使い始められます。

### ハマりポイント 1: ES Module 問題

TypeScript で `"type": "module"` を使っているプロジェクトを Electron にバンドルすると、バックエンドの `index.js` が `require` で読み込まれてしまいます。

```
SyntaxError: Cannot use import statement outside a module
```

**解決策：** バックエンド用に `"type": "module"` を指定した別の `package.json` を用意して、`extraResources` で同梱しました。

```json
// backend-package.json
{
  "name": "discord-music-bot-backend",
  "type": "module",
  "version": "2.4.0"
}
```

```json
// package.json の build 設定
"extraResources": [
  { "from": "backend-package.json", "to": "backend/package.json" }
]
```

### ハマりポイント 2: EADDRINUSE（ポート競合）

Electron アプリを閉じても、バックエンドの Node.js プロセスが残ってしまうことがありました。
次回起動時にポート 3001 が使えず、`EADDRINUSE` エラーで落ちる。

**解決策：** 起動時に既存のプロセスを強制終了 + シングルインスタンスロック。

```javascript
// electron/main.cjs（起動時）
if (process.platform === 'win32') {
  // ポート3001を使っているプロセスを検索して終了
  const result = execSync('netstat -ano | findstr ":3001"');
  // ...PIDを取得してtaskkillで終了
}

// 多重起動防止
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) app.quit();
```

### ハマりポイント 3: バックエンド起動が間に合わない

これが一番厄介でした。

Electron がウィンドウを開く → フロントエンドが API を叩く → **バックエンドがまだ起動していない** → 全データ取得失敗 → プレイリストもライブラリも空のまま。

ライブラリのスキャン（ffprobe で全曲のメタデータ取得）に約 20 秒かかるため、固定の `setTimeout(2000)` では全然足りませんでした。

**解決策：** バックエンドの準備完了をポーリングで確認してからウィンドウを開く + フロントエンド側にもリトライロジックを追加。

```javascript
// electron/main.cjs
async function waitForBackend() {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch('http://localhost:3001/api/system/status');
      return; // 応答があれば準備完了
    } catch {
      await sleep(1000); // 1秒待ってリトライ
    }
  }
}

// バックエンド起動 → 準備完了を待つ → ウィンドウ作成
startBackend();
await waitForBackend();
createWindow();
```

```typescript
// フロントエンド側（App.tsx）でもリトライ
useEffect(() => {
  const attemptLoad = async () => {
    for (let i = 0; i < 30; i++) {
      try {
        await loadInitialData();
        return;
      } catch {
        await sleep(Math.min(1000 + i * 500, 5000));
      }
    }
  };
  attemptLoad();
}, []);
```

二重の安全策で、バックエンドの起動タイミングに関係なく確実にデータを取得できるようにしました。

## プレイリストの永続化

最初はプレイリストを `data/playlists.json` に保存していましたが、音楽フォルダ配下に `.m3u` ファイルとして保存する方式に変えました。

### なぜ .m3u にしたか

- ユーザーが**ファイルマネージャーからプレイリストの存在を確認**できる
- 他の音楽プレーヤーでも読める標準フォーマット
- プレイリストが音楽フォルダと一緒に管理される（バックアップしやすい）

```
music/
├── playlists/
│   ├── お気に入り.m3u
│   └── 作業用BGM.m3u
├── track1.mp3
├── track2.wav
└── ...
```

旧形式（JSON）からの自動移行も実装して、アップデートしてもプレイリストが消えないようにしました。

## ダーク/ライトテーマ

CSS 変数でテーマを管理しています。

```css
[data-theme="dark"] {
  --bg-primary: #1e1f22;
  --text-primary: #f2f3f5;
  --accent: #5865f2;        /* Discord風ブルー */
}

[data-theme="light"] {
  --bg-primary: #ffffff;
  --text-primary: #1a1a1a;
  --accent: #e53935;         /* YouTube風レッド */
}
```

`localStorage` にテーマ設定を保存し、ページ読み込み時にインラインスクリプトで即座に適用することで、テーマ切り替え時のちらつき（FOUC）を防いでいます。

## 開発を通じて学んだこと

### 1. 「動く」と「使える」の差は大きい

コア機能（VC接続して曲を再生）は比較的すぐできましたが、実際に使い始めると細かい問題が次々出てきました：

- コンテキストメニューが画面下で見切れる
- 曲リストが画面の高さに収まらない
- 再生バーをクリックしても位置が反映されない
- プレイリストが再起動で消える

「自分で使って自分でバグを見つけて直す」のサイクルを何十回もやりました。

### 2. Electron のパッケージングは甘くない

開発モード（`npm run dev`）では完璧に動くのに、Electron でビルドすると動かない、というパターンが多かった。パスの解決、モジュールシステムの違い、プロセス管理、ポート競合…。

特にバックエンドの起動タイミング問題は、ログを丹念に読んでタイムスタンプを比較することで初めて原因がわかりました。

### 3. ログは正義

Electron アプリはコンソールが見えないので、ファイルへのログ出力が命綱でした。

バックエンドの各サービスに `console.log` を入れて、Electron 側でそれをファイルに書き出す仕組みにしたおかげで、「プレイリストが読み込めない」→ ログを見る → 「あ、フロントエンドがバックエンド起動前にAPIを叩いてる」とすぐ分かりました。

## まとめ

「ローカルの音楽ファイルを Discord VC で流す」という、割とニッチな需要のために作ったプロジェクトですが、結果として以下を一通り経験できました：

- **サービス分離のアーキテクチャ設計**
- **REST API + WebSocket のリアルタイム通信**
- **Discord Bot の音声送出**
- **React SPA の状態管理**
- **Electron でのデスクトップアプリ配布**
- **本番環境特有のデバッグ（タイミング問題、プロセス管理）**

同じようなことをやりたい人の参考になれば嬉しいです。

## リンク

- [GitHub リポジトリ](https://github.com/yourname/DiscordMusicBot) ← *実際のURLに差し替え*

---

*この記事で紹介しているコードは一部簡略化しています。完全なコードは GitHub リポジトリをご覧ください。*
