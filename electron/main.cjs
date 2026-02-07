const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// 開発モードかどうか
const isDev = process.argv.includes('--dev');

let mainWindow = null;
let tray = null;
let backendProcess = null;

// バックエンドの起動
function startBackend() {
  // 開発モードではバックエンドは別途起動済みなのでスキップ
  if (isDev) {
    console.log('Development mode: Backend should be started separately (npm run dev)');
    return;
  }

  const backendPath = path.join(process.resourcesPath, 'backend');
  
  console.log('Starting backend from:', backendPath);
  
  backendProcess = spawn('node', ['dist/index.js'], {
    cwd: backendPath,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env }
  });

  backendProcess.on('error', (err) => {
    console.error('Backend error:', err);
  });

  backendProcess.on('exit', (code) => {
    console.log('Backend exited with code:', code);
  });
}

// メインウィンドウの作成
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
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
      label: '終了',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Discord Music Bot');
  tray.setContextMenu(contextMenu);

  // トレイアイコンをダブルクリックでウィンドウを表示
  tray.on('double-click', () => {
    mainWindow.show();
  });
}

// アプリケーションの準備完了
app.whenReady().then(() => {
  // バックエンドを起動
  startBackend();
  
  // 少し待ってからウィンドウを作成（バックエンド起動待ち）
  // 開発モードでは既にバックエンドが起動しているので待機時間を短く
  const waitTime = isDev ? 500 : 2000;
  setTimeout(() => {
    createWindow();
    createTray();
  }, waitTime);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

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
  if (backendProcess) {
    backendProcess.kill();
  }
});

// 未処理のエラーをキャッチ
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
