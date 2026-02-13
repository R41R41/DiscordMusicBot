const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// 開発モードかどうか
const isDev = process.argv.includes('--dev');

// バージョン情報を取得
const packageJson = require('../package.json');
const APP_VERSION = packageJson.version || '1.0.0';

let mainWindow = null;
let tray = null;
let backendProcess = null;
let logStream = null;

// アプリのユーザーデータディレクトリを取得
function getAppDataPath() {
  return path.join(app.getPath('userData'), 'DiscordMusicBot');
}

// ログファイルのパスを取得
function getLogPath() {
  const appDataPath = getAppDataPath();
  return path.join(appDataPath, 'app.log');
}

// ログを書き込む
function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  console.log(message);
  
  if (logStream) {
    logStream.write(logMessage);
  }
}

// 必要なディレクトリを作成
function ensureDirectories() {
  const appDataPath = getAppDataPath();
  const musicPath = path.join(appDataPath, 'music');
  const dataPath = path.join(appDataPath, 'data');
  
  [appDataPath, musicPath, dataPath].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  
  // ログファイルを初期化
  const logPath = getLogPath();
  logStream = fs.createWriteStream(logPath, { flags: 'a' });
  writeLog('=== App started ===');
  writeLog(`Version: ${APP_VERSION}`);
  writeLog(`App data path: ${appDataPath}`);
  writeLog(`Music path: ${musicPath}`);
  writeLog(`Data path: ${dataPath}`);
  
  return { appDataPath, musicPath, dataPath };
}

// バックエンドの起動
function startBackend() {
  // 開発モードではバックエンドは別途起動済みなのでスキップ
  if (isDev) {
    console.log('Development mode: Backend should be started separately (npm run dev)');
    return;
  }

  const { musicPath, dataPath } = ensureDirectories();
  const backendPath = path.join(process.resourcesPath, 'backend');
  
  writeLog(`Starting backend from: ${backendPath}`);
  writeLog(`Music folder: ${musicPath}`);
  writeLog(`Data folder: ${dataPath}`);
  
  // バックエンドのdistフォルダが存在するか確認
  const indexPath = path.join(backendPath, 'dist', 'index.js');
  if (!fs.existsSync(indexPath)) {
    writeLog(`ERROR: Backend not found at ${indexPath}`);
    return;
  }
  writeLog(`Backend index.js found at: ${indexPath}`);
  
  // 環境変数を設定
  const env = {
    ...process.env,
    MUSIC_FOLDER: musicPath,
    DATA_DIR: dataPath,
    WEB_PORT: '3001',
  };
  
  backendProcess = spawn('node', ['dist/index.js'], {
    cwd: backendPath,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: env
  });

  // バックエンドの出力をログに書き込む
  if (backendProcess.stdout) {
    backendProcess.stdout.on('data', (data) => {
      writeLog(`[Backend] ${data.toString().trim()}`);
    });
  }
  
  if (backendProcess.stderr) {
    backendProcess.stderr.on('data', (data) => {
      writeLog(`[Backend Error] ${data.toString().trim()}`);
    });
  }

  backendProcess.on('error', (err) => {
    writeLog(`Backend process error: ${err.message}`);
  });

  backendProcess.on('exit', (code) => {
    writeLog(`Backend exited with code: ${code}`);
  });
}

// バックエンドの準備完了を待つ
async function waitForBackend() {
  const http = require('http');
  const maxAttempts = 60; // 最大60回（約60秒）
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get('http://localhost:3001/api/system/status', (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`Status ${res.statusCode}`));
          }
          res.resume(); // データを消費してメモリリーク防止
        });
        req.on('error', reject);
        req.setTimeout(2000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
      writeLog(`Backend ready after ${i + 1} attempt(s)`);
      return;
    } catch (e) {
      // 1秒待ってリトライ
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  writeLog('WARNING: Backend did not become ready in time, opening window anyway');
}

// メインウィンドウの作成
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Discord Music Bot',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    show: false, // 準備ができるまで非表示
  });

  // 開発モードか本番モードかでURLを変える
  if (isDev) {
    // 開発モード: Vite dev serverに接続
    mainWindow.loadURL('http://localhost:5173');
    // DevToolsを開く（開発時のみ）
    // mainWindow.webContents.openDevTools();
  } else {
    // 本番モード: ビルド済みのHTMLを読み込む
    mainWindow.loadFile(path.join(__dirname, '../web-ui/dist/index.html'));
  }

  // 準備ができたら表示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 閉じるボタンでトレイに最小化
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // 外部リンクをブラウザで開く
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// システムトレイの作成
function createTray() {
  // トレイアイコン（仮のアイコン）
  const iconPath = path.join(__dirname, 'icon.png');
  let trayIcon;
  
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
  } catch {
    // アイコンがない場合は空のアイコンを作成
    trayIcon = nativeImage.createEmpty();
  }
  
  tray = new Tray(trayIcon.isEmpty() ? nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==') : trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '開く',
      click: () => {
        mainWindow.show();
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'ログを開く',
      click: () => {
        const logPath = getLogPath();
        shell.openPath(logPath);
      }
    },
    {
      label: 'データフォルダを開く',
      click: () => {
        shell.openPath(getAppDataPath());
      }
    },
    {
      label: 'DevTools',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.openDevTools();
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: `バージョン ${APP_VERSION}`,
      enabled: false
    },
    {
      type: 'separator'
    },
    {
      label: '終了',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip(`Discord Music Bot v${APP_VERSION}`);
  tray.setContextMenu(contextMenu);

  // トレイアイコンをダブルクリックでウィンドウを表示
  tray.on('double-click', () => {
    mainWindow.show();
  });
}

// シングルインスタンスロック
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // 既に別のインスタンスが起動している場合は終了
  app.quit();
} else {
  // 2つ目のインスタンスが起動しようとした場合
  app.on('second-instance', () => {
    // 既存のウィンドウをフォーカス
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // アプリケーションの準備完了
  app.whenReady().then(() => {
    // ポート3001を使っている既存のプロセスを終了（Windowsのみ）
    if (process.platform === 'win32' && !isDev) {
      const { execSync } = require('child_process');
      try {
        // netstatでポート3001を使っているPIDを取得して終了
        const result = execSync('netstat -ano | findstr ":3001"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        const lines = result.split('\n');
        const pids = new Set();
        lines.forEach(line => {
          const match = line.match(/LISTENING\s+(\d+)/);
          if (match) pids.add(match[1]);
        });
        pids.forEach(pid => {
          try {
            execSync(`taskkill /pid ${pid} /t /f`, { stdio: 'ignore' });
            writeLog(`Killed existing process on port 3001: ${pid}`);
          } catch (e) { /* ignore */ }
        });
      } catch (e) {
        // ポート3001を使っているプロセスがない場合は無視
      }
    }

    // バックエンドを起動
    startBackend();
    
    // バックエンドの準備完了を待ってからウィンドウを作成
    if (isDev) {
      // 開発モードでは既にバックエンドが起動しているはず
      setTimeout(() => {
        createWindow();
        createTray();
      }, 500);
    } else {
      waitForBackend().then(() => {
        createWindow();
        createTray();
      });
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

// 全ウィンドウが閉じられたとき
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// アプリ終了前
app.on('before-quit', () => {
  app.isQuitting = true;
  
  // バックエンドプロセスを終了
  if (backendProcess && backendProcess.pid) {
    writeLog(`Killing backend process: ${backendProcess.pid}`);
    
    // Windowsではtaskkillを使ってプロセスツリー全体を終了
    if (process.platform === 'win32') {
      const { execSync } = require('child_process');
      try {
        execSync(`taskkill /pid ${backendProcess.pid} /t /f`, { stdio: 'ignore' });
      } catch (e) {
        // 既に終了している場合は無視
      }
    } else {
      backendProcess.kill('SIGKILL');
    }
  }
});

// アプリ終了時（quit後）
app.on('will-quit', () => {
  // 念のためもう一度バックエンドを終了
  if (backendProcess && backendProcess.pid) {
    if (process.platform === 'win32') {
      const { execSync } = require('child_process');
      try {
        execSync(`taskkill /pid ${backendProcess.pid} /t /f`, { stdio: 'ignore' });
      } catch (e) { /* ignore */ }
    }
  }
});

// 未処理のエラーをキャッチ
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
