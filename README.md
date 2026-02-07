# 🎵 Discord Music Bot

ローカルに保存した音楽をDiscordのボイスチャンネルで再生できるBotです。  
Web UIから簡単に操作できます。

---

## ✨ 機能

- 🎧 ローカル音源の再生（mp3/wav/flac/ogg/m4a）
- 📋 プレイリスト管理
- 🔀 シャッフル・ループ再生
- 🔊 音量調整
- ⏩ シーク（再生位置の変更）
- 🖥️ ブラウザから操作できるWeb UI

---

## 🚀 セットアップ（初めての方）

### ステップ1: Node.js のインストール

1. [Node.js公式サイト](https://nodejs.org/) にアクセス
2. **「LTS」** と書かれた緑色のボタンをクリックしてダウンロード
3. ダウンロードしたファイルを実行してインストール（すべて「Next」でOK）

### ステップ2: Discord Bot の作成

1. [Discord Developer Portal](https://discord.com/developers/applications) にアクセス
2. 右上の **「New Application」** をクリック
3. 名前を入力（例: `Music Bot`）して **「Create」**

#### Bot Token の取得

4. 左メニューの **「Bot」** をクリック
5. **「Reset Token」** をクリック → **「Yes, do it!」**
6. 表示されたTokenをコピー（⚠️ **これは秘密にしてください！**）

#### Bot の権限設定

7. 下にスクロールして **「Privileged Gateway Intents」** を見つける
8. 以下の2つを **ON** にする：
   - ✅ **SERVER MEMBERS INTENT**
   - ✅ **MESSAGE CONTENT INTENT**
9. **「Save Changes」** をクリック

#### Bot をサーバーに招待

10. 左メニューの **「OAuth2」** → **「URL Generator」** をクリック
11. **SCOPES** で以下にチェック：
    - ✅ `bot`
    - ✅ `applications.commands`
12. **BOT PERMISSIONS** で以下にチェック：
    - ✅ `Connect`（接続）
    - ✅ `Speak`（発言）
    - ✅ `Use Voice Activity`
13. 一番下の **「Generated URL」** をコピー
14. そのURLをブラウザで開き、Botを招待したいサーバーを選んで **「認証」**

### ステップ3: Bot の起動

#### Windows の場合

1. `start.bat` をダブルクリック
2. 初回は Discord Bot Token の入力を求められるので、コピーしたTokenを貼り付けてEnter
3. 自動でセットアップが行われます（数分かかります）
4. ブラウザで http://localhost:5173 を開く

#### Mac/Linux の場合

```bash
chmod +x start.sh
./start.sh
```

### ステップ4: 音楽ファイルの追加

`music` フォルダに音楽ファイルを入れてください。  
対応形式: mp3, wav, flac, ogg, m4a

---

## 📖 使い方

1. ブラウザで http://localhost:5173 を開く
2. **サーバー** と **ボイスチャンネル** を選択
3. **「接続」** をクリック
4. **ライブラリ** から曲をダブルクリックで再生
5. 右クリックで「キューに追加」「次に再生」などの操作

---

## ⚙️ 設定

### 音源フォルダの変更

`data/config.json` を編集：

```json
{
  "musicFolder": "C:/Users/あなたの名前/Music"
}
```

### Web UIのポート変更

`data/config.json`:
```json
{
  "webPort": 3001
}
```

---

## ❓ よくある質問

### Q: Botがボイスチャンネルに接続できない

- Discord Developer Portal で **「Privileged Gateway Intents」** がONになっているか確認
- Botに「接続」「発言」の権限があるか確認

### Q: 音楽が再生されない

- `music` フォルダに音楽ファイルが入っているか確認
- Web UIで「ライブラリ」の更新ボタン（🔄）をクリック

### Q: Web UIが開けない

- バックエンドが起動しているか確認（コマンドプロンプトが開いているか）
- http://localhost:5173 にアクセス

---

## 🐳 Docker で起動（上級者向け）

```bash
# .env ファイルを作成
echo "DISCORD_TOKEN=あなたのトークン" > .env

# 起動
docker-compose up -d
```

---

## 📁 ファイル構成

```
├── music/           # 音源フォルダ（ここに音楽を入れる）
├── data/            # 設定ファイル
├── start.bat        # Windows用起動スクリプト
├── start.sh         # Mac/Linux用起動スクリプト
├── src/             # バックエンドのソースコード
└── web-ui/          # Web UIのソースコード
```

---

## 📄 ライセンス

MIT License - 自由に使用・改変・再配布できます。

---

## 🙏 クレジット

- [Discord.js](https://discord.js.org/)
- [React](https://react.dev/)
- [Lucide Icons](https://lucide.dev/)
