# Discord Music Bot

ローカルに保存した音楽を Discord のボイスチャンネルで再生できる Bot です。
デスクトップアプリとしてインストールでき、Web UI から簡単に操作できます。

---

## 機能

- ローカル音源の再生（mp3 / wav / flac / ogg / m4a）
- プレイリスト管理（.m3u ファイルとして自動保存）
- キュー管理（追加・次に再生・並び替え・削除）
- シャッフル・ループ再生（off / 1曲 / 全曲）
- 音量調整・シーク（再生位置の変更）
- 曲の複数選択 → 一括操作
- ダーク / ライトテーマ切り替え
- 右クリックメニューからの操作
- ドラッグ&ドロップで並び替え

---

## セットアップ

### ステップ1: Discord Bot の作成

1. [Discord Developer Portal](https://discord.com/developers/applications) にアクセス
2. 右上の **「New Application」** をクリック
3. 名前を入力（例: `Music Bot`）して **「Create」**

#### Bot Token の取得

4. 左メニューの **「Bot」** をクリック
5. **「Reset Token」** をクリック → **「Yes, do it!」**
6. 表示された Token をコピー（**これは秘密にしてください**）

#### Bot の権限設定

7. 下にスクロールして **「Privileged Gateway Intents」** を見つける
8. 以下の2つを **ON** にする：
   - **SERVER MEMBERS INTENT**
   - **MESSAGE CONTENT INTENT**
9. **「Save Changes」** をクリック

#### Bot をサーバーに招待

10. 左メニューの **「OAuth2」** → **「URL Generator」** をクリック
11. **SCOPES** で以下にチェック：
    - `bot`
    - `applications.commands`
12. **BOT PERMISSIONS** で以下にチェック：
    - `Connect`（接続）
    - `Speak`（発言）
    - `Use Voice Activity`
13. 一番下の **「Generated URL」** をコピー
14. その URL をブラウザで開き、Bot を招待したいサーバーを選んで **「認証」**

### ステップ2: アプリのインストール

1. [Releases](https://github.com/R41R41/DiscordMusicBot/releases) から最新のインストーラー（`Discord Music Bot Setup x.x.x.exe`）をダウンロード
2. ダウンロードしたファイルを実行してインストール

### ステップ3: 初期設定

1. アプリを起動
2. **設定タブ** を開く
3. **Discord Bot Token** に、ステップ1でコピーした Token を貼り付け
4. **「設定を保存」** をクリック
5. アプリを再起動

### ステップ4: 音楽ファイルの追加

1. **設定タブ** の **「フォルダを開く」** ボタンをクリック
2. 開いたフォルダに音楽ファイルをコピー
3. **ライブラリタブ** の更新ボタンをクリック

対応形式: mp3, wav, flac, ogg, m4a

---

## 使い方

1. アプリを起動
2. **サーバー** と **ボイスチャンネル** を選択して **「接続」**
3. **ライブラリ** から曲をダブルクリックで再生
4. 右クリックで「キューに追加」「次に再生」「プレイリストに追加」
5. Ctrl+Click / Shift+Click で複数選択 → 一括操作

### テーマ切り替え

ヘッダーの太陽/月アイコンでダーク/ライトテーマを切り替えられます。

### プレイリスト

- **プレイリストタブ** で新しいプレイリスト名を入力して作成
- 曲を右クリック → 「プレイリストに追加」で曲を追加
- プレイリストは音楽フォルダ内の `playlists/` に `.m3u` ファイルとして自動保存されます

---

## 開発者向け

### 必要なもの

- Node.js LTS（v20以上）
- npm

### セットアップ

```bash
# 依存関係のインストール
npm install
cd web-ui && npm install && cd ..

# .env ファイルを作成
cp .env.example .env
# DISCORD_TOKEN にBotのTokenを設定
```

### 開発モード

```bash
# バックエンド
npm run dev

# フロントエンド（別ターミナル）
npm run dev:web

# Electron（さらに別ターミナル）
npm run dev:electron
```

### ビルド

```bash
# Windows インストーラーを生成
npm run dist:win
# → release/ フォルダにインストーラーが生成されます
```

---

## ファイル構成

```
├── electron/          # Electron メインプロセス
├── src/               # バックエンド (TypeScript)
│   ├── config/        # 設定管理
│   ├── discord/       # Discord 連携
│   ├── library/       # 音楽ライブラリ
│   ├── player/        # 再生制御
│   ├── playlists/     # プレイリスト管理
│   └── web/           # REST API + WebSocket
├── web-ui/            # フロントエンド (React + Vite)
├── data/              # 設定ファイル
├── music/             # 音源フォルダ + playlists/
└── release/           # ビルド出力
```

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| バックエンド | Node.js, TypeScript, Express, Socket.IO |
| Discord連携 | discord.js v14, @discordjs/voice, ffmpeg |
| フロントエンド | React, Vite, Socket.IO client |
| デスクトップ | Electron, electron-builder |

---

## ライセンス

MIT License - 自由に使用・改変・再配布できます。

---

## クレジット

- [Discord.js](https://discord.js.org/)
- [React](https://react.dev/)
- [Lucide Icons](https://lucide.dev/)
- [Electron](https://www.electronjs.org/)
