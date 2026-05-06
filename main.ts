// eslint-disable-next-line
require('source-map-support').install({
  handleUncaughtException: false,
  environment: 'node',
});

import { emitMainProcessError } from 'backend/helpers';
import {
  app,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  nativeImage,
  protocol,
  ProtocolRequest,
  ProtocolResponse,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import registerAppLifecycleListeners from './main/registerAppLifecycleListeners';
import registerAutoUpdaterListeners from './main/registerAutoUpdaterListeners';
import registerIpcMainActionListeners from './main/registerIpcMainActionListeners';
import registerIpcMainMessageListeners from './main/registerIpcMainMessageListeners';
import { MAC_DEV_APP_LABEL } from './main/macDevBranding';
import registerProcessListeners from './main/registerProcessListeners';
import {
  attachLivebooksCloudMain,
  registerLivebooksDeepLinkListeners,
} from './main/livebooksCloudBridge';

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

export class Main {
  title = 'LiveBooks Desktop';
  icon: string;

  winURL = '';
  checkedForUpdate = false;
  mainWindow: BrowserWindow | null = null;

  WIDTH = 1200;
  HEIGHT = process.platform === 'win32' ? 826 : 800;

  constructor() {
    attachLivebooksCloudMain(this);
    this.icon = this.resolveWindowIcon();

    protocol.registerSchemesAsPrivileged([
      { scheme: 'app', privileges: { secure: true, standard: true } },
    ]);

    if (this.isDevelopment) {
      autoUpdater.logger = console;
      app.setName(MAC_DEV_APP_LABEL);
      this.title = MAC_DEV_APP_LABEL;
    }

    // https://github.com/electron-userland/electron-builder/issues/4987
    app.commandLine.appendSwitch('disable-http2');
    autoUpdater.requestHeaders = {
      'Cache-Control':
        'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    };

    this.registerListeners();
  }

  resolveWindowIcon(): string {
    // In production we ship a small set of icon assets alongside the main bundle.
    // Prefer platform-native formats where possible to avoid OS fallbacks.
    if (!this.isDevelopment) {
      const packagedCandidates =
        process.platform === 'win32'
          ? [path.join(__dirname, 'icons', 'icon.ico')]
          : [path.join(__dirname, 'icons', '512x512.png')];

      const packaged = packagedCandidates.find((p) => fs.existsSync(p));
      if (packaged) {
        return packaged;
      }
    }

    // Dev / fallback paths (project root)
    if (process.platform === 'win32') {
      const ico = path.join(__dirname, '..', '..', 'build', 'icon.ico');
      if (fs.existsSync(ico)) {
        return ico;
      }
    }

    const appIcon = path.join(__dirname, '..', '..', 'app-icon.png');
    if (fs.existsSync(appIcon)) {
      return appIcon;
    }

    return path.join(__dirname, '..', '..', 'build', 'icon.png');
  }

  /**
   * macOS: set Dock icon as early as possible when creating a window.
   * Packaged apps ship `Contents/Resources/icon.icns` (see electron-builder);
   * dev runs use repo `LiveBooks.icns` / PNG fallbacks.
   */
  setMacDockIcon(): void {
    if (!this.isMac || !app.dock) {
      return;
    }

    if (app.isPackaged) {
      const bundledIcns = path.join(process.resourcesPath, 'icon.icns');
      if (fs.existsSync(bundledIcns)) {
        try {
          app.dock.setIcon(path.resolve(bundledIcns));
          return;
        } catch {
          /* fall through */
        }
      }
    }

    const projectRoot = path.resolve(path.join(__dirname, '..', '..'));
    const icnsCandidates = [
      path.join(projectRoot, 'LiveBooks.icns'),
      path.join(projectRoot, 'build', 'LiveBooks.icns'),
    ];
    const icns = icnsCandidates.find((p) => fs.existsSync(p));

    if (icns) {
      const icnsAbs = path.resolve(icns);
      try {
        app.dock.setIcon(icnsAbs);
        return;
      } catch {
        const rasterPath = rasterizeIcnsToTempPng(icnsAbs);
        if (rasterPath) {
          try {
            const img = nativeImage.createFromPath(rasterPath);
            if (!img.isEmpty()) {
              app.dock.setIcon(img);
              return;
            }
          } catch {
            /* fall through */
          } finally {
            try {
              fs.unlinkSync(rasterPath);
            } catch {
              /* ignore */
            }
          }
        }
      }
    }

    try {
      const img = nativeImage.createFromPath(path.resolve(this.icon));
      if (!img.isEmpty()) {
        app.dock.setIcon(img);
      }
    } catch {
      /* ignore */
    }
  }

  get isDevelopment() {
    return process.env.NODE_ENV === 'development';
  }

  get isTest() {
    return !!process.env.IS_TEST;
  }

  get isMac() {
    return process.platform === 'darwin';
  }

  get isLinux() {
    return process.platform === 'linux';
  }

  registerListeners() {
    registerLivebooksDeepLinkListeners();
    registerIpcMainMessageListeners(this);
    registerIpcMainActionListeners(this);
    registerAutoUpdaterListeners(this);
    registerAppLifecycleListeners(this);
    registerProcessListeners(this);
  }

  getOptions(): BrowserWindowConstructorOptions {
    const preload = path.join(__dirname, 'main', 'preload.js');
    const options: BrowserWindowConstructorOptions = {
      width: this.WIDTH,
      height: this.HEIGHT,
      title: this.title,
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 16, y: 16 },
      /** Avoid a visible window (and taskbar/dock tile) before icon + first paint. */
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        preload,
      },
      autoHideMenuBar: true,
      frame: !this.isMac,
      resizable: true,
    };

    // Always set explicitly so Windows/Linux never fall back to Electron's default.
    Object.assign(options, { icon: this.icon });

    return options;
  }

  async createWindow() {
    if (this.isMac) {
      this.setMacDockIcon();
    }

    const options = this.getOptions();
    this.mainWindow = new BrowserWindow(options);

    if (this.isDevelopment) {
      this.setViteServerURL();
    } else {
      this.registerAppProtocol();
    }

    this.setMainWindowListeners();

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
    });

    await this.mainWindow.loadURL(this.winURL);
    if (this.isDevelopment && !this.isTest) {
      this.mainWindow.webContents.openDevTools();
    }
  }

  setViteServerURL() {
    let port = 6969;
    let host = '0.0.0.0';

    if (process.env.VITE_PORT && process.env.VITE_HOST) {
      port = Number(process.env.VITE_PORT);
      host = process.env.VITE_HOST;
    }

    // Load the url of the dev server if in development mode
    this.winURL = `http://${host}:${port}/`;
  }

  registerAppProtocol() {
    protocol.registerBufferProtocol('app', bufferProtocolCallback);

    // Use the registered protocol url to load the files.
    this.winURL = 'app://./index.html';
  }

  setMainWindowListeners() {
    if (this.mainWindow === null) {
      return;
    }

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    this.mainWindow.webContents.on('did-fail-load', () => {
      this.mainWindow!.loadURL(this.winURL).catch((err) =>
        emitMainProcessError(err)
      );
    });
  }
}

function rasterizeIcnsToTempPng(icnsPath: string): string | null {
  const out = path.join(os.tmpdir(), `livebooks-dock-${process.pid}.png`);
  try {
    if (fs.existsSync(out)) {
      fs.unlinkSync(out);
    }
    execFileSync('sips', ['-s', 'format', 'png', icnsPath, '--out', out], {
      stdio: 'ignore',
    });
    return fs.existsSync(out) ? out : null;
  } catch {
    return null;
  }
}

/**
 * Callback used to register the custom app protocol,
 * during prod, files are read and served by using this
 * protocol.
 */
function bufferProtocolCallback(
  request: ProtocolRequest,
  callback: (response: ProtocolResponse) => void
) {
  const { pathname, host } = new URL(request.url);
  const filePath = path.join(
    __dirname,
    'src',
    decodeURI(host),
    decodeURI(pathname)
  );

  fs.readFile(filePath, (_, data) => {
    const extension = path.extname(filePath).toLowerCase();
    const mimeType =
      {
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.svg': 'image/svg+xml',
        '.json': 'application/json',
      }[extension] ?? '';

    callback({ mimeType, data });
  });
}

export default new Main();
