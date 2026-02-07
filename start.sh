#!/bin/bash

echo "========================================"
echo "  Discord Music Bot 起動スクリプト"
echo "========================================"
echo

# Node.jsのチェック
if ! command -v node &> /dev/null; then
    echo "[エラー] Node.js がインストールされていません。"
    echo
    echo "以下のURLからNode.jsをインストールしてください："
    echo "https://nodejs.org/"
    echo
    exit 1
fi

# .envファイルのチェック
if [ ! -f ".env" ]; then
    echo "[初回セットアップ]"
    echo
    echo "Discord Bot Token を入力してください。"
    echo "（Discord Developer Portal で取得できます）"
    echo
    read -p "Token: " TOKEN
    echo "DISCORD_TOKEN=$TOKEN" > .env
    echo
    echo ".env ファイルを作成しました。"
    echo
fi

# 依存関係のインストールチェック
if [ ! -d "node_modules" ]; then
    echo "[依存関係をインストール中...] これには数分かかる場合があります。"
    echo
    npm install
    echo
fi

if [ ! -d "web-ui/node_modules" ]; then
    echo "[Web UI の依存関係をインストール中...]"
    echo
    cd web-ui
    npm install
    cd ..
    echo
fi

# musicフォルダの作成
if [ ! -d "music" ]; then
    mkdir music
    echo "[music フォルダを作成しました]"
    echo "音源ファイル（mp3, wav, flac など）をこのフォルダに入れてください。"
    echo
fi

echo "========================================"
echo "  起動中..."
echo "========================================"
echo
echo "バックエンドとWeb UIを起動します。"
echo "ブラウザで http://localhost:5173 を開いてください。"
echo
echo "終了するには Ctrl+C を押してください。"
echo

# バックグラウンドでバックエンドを起動
npm run dev &
BACKEND_PID=$!

# 少し待ってからWeb UIを起動
sleep 3
cd web-ui && npm run dev &
FRONTEND_PID=$!

echo
echo "起動しました！"
echo
echo "ブラウザで以下のURLを開いてください:"
echo "http://localhost:5173"
echo

# 終了時にプロセスを停止
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT

# 待機
wait
