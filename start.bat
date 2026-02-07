@echo off
chcp 65001 >nul
title Discord Music Bot

echo ========================================
echo   Discord Music Bot 起動スクリプト
echo ========================================
echo.

:: Node.jsのチェック
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [エラー] Node.js がインストールされていません。
    echo.
    echo 以下のURLからNode.jsをインストールしてください：
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: .envファイルのチェック
if not exist ".env" (
    echo [初回セットアップ]
    echo.
    echo Discord Bot Token を入力してください。
    echo （Discord Developer Portal で取得できます）
    echo.
    set /p TOKEN="Token: "
    echo DISCORD_TOKEN=%TOKEN%> .env
    echo.
    echo .env ファイルを作成しました。
    echo.
)

:: 依存関係のインストールチェック
if not exist "node_modules" (
    echo [依存関係をインストール中...] これには数分かかる場合があります。
    echo.
    call npm install
    echo.
)

if not exist "web-ui\node_modules" (
    echo [Web UI の依存関係をインストール中...]
    echo.
    cd web-ui
    call npm install
    cd ..
    echo.
)

:: musicフォルダの作成
if not exist "music" (
    mkdir music
    echo [music フォルダを作成しました]
    echo 音源ファイル（mp3, wav, flac など）をこのフォルダに入れてください。
    echo.
)

echo ========================================
echo   起動中...
echo ========================================
echo.
echo バックエンドとWeb UIを起動します。
echo ブラウザで http://localhost:5173 を開いてください。
echo.
echo 終了するには Ctrl+C を押してください。
echo.

:: 両方を並列起動
start "Discord Bot Backend" cmd /c "npm run dev"
timeout /t 3 >nul
start "Discord Bot Web UI" cmd /c "cd web-ui && npm run dev"

echo.
echo 起動しました！
echo.
echo ブラウザで以下のURLを開いてください:
echo http://localhost:5173
echo.
pause
