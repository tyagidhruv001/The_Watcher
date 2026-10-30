const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut, powerMonitor } = require('electron');
const path = require('path');
const storage = require('./storage');
const { createTracker } = require('./tracker');
const windowTracker = require('./windowTracker');
const { friendlyName } = require('./appNames');

const DEFAULT_DPI = 1000;
const FAST_TICK_MS = 200; // 5 times/second for live speed and APM when window is visible
const SLOW_TICK_MS = 2000; // 2 seconds for app window polling
const DISK_SAVE_INTERVAL_MS = 10000; // Save to disk at most every 10s if dirty (safer against crashes)

let win = null;
let tray = null;
let data = null;
let dpi = DEFAULT_DPI;
let tracker = null;

let isDirty = false;
let lastSaveTime = Date.now();
let recentPixels = 0;
let instantSpeed = 0;
let actionTimestamps = [];
let lastActionPruneAt = 0;
let cachedAppsList = [];
let appsListDirty = true;
let lastCurrentApp = 'Ready';
let isAlwaysOnTop = false;
let lastSlowTickAt = Date.now();
let lastFastTickAt = Date.now();

app.isQuitting = false;

function createWindow() {
  win = new BrowserWindow({
    width: 420,
    height: 740,
    minWidth: 360,
    minHeight: 420,
    show: false,
    backgroundColor: '#08090d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.setTitle('The Watcher');

  win.once('ready-to-show', () => {
    win.show();
    pushStatsToWindow();
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, targetUrl) => {
    // This app is a local file-based UI. Do not allow navigation away from it.
    if (targetUrl !== win.webContents.getURL()) event.preventDefault();
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[The Watcher] Renderer process exited:', details);
  });

  // Close to System Tray (keep tracking in background)
  win.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      win.hide();
      if (isDirty && data) {
        if (storage.save(data)) {
          isDirty = false;
          lastSaveTime = Date.now();
        }
      }
    }
  });

  win.webContents.on('did-finish-load', () => {
    pushStatsToWindow();
  });

  win.on('show', () => {
    pushStatsToWindow();
  });
}

function toggleWindow() {
  if (!win || win.isDestroyed()) {
    createWindow();
    return;
  }
  if (win.isVisible() && !win.isMinimized()) {
    win.hide();
  } else {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    pushStatsToWindow();
  }
}

function setupTray() {
  const iconPath = path.join(__dirname, 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip('The Watcher');

  function updateContextMenu() {
    if (!tray) return;
    const day = storage.getDay(data);
    const meters = ((day.mousePixels || 0) / dpi) * 0.0254;
    const distStr = meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters.toFixed(1)} m`;

    const isRunning = tracker ? tracker.isRunning() : true;
    const isVisible = win && !win.isDestroyed() && win.isVisible() && !win.isMinimized();

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'The Watcher',
        enabled: false,
      },
      {
        label: `Today: ${distStr} · ${isRunning ? 'Live' : 'Paused'}`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: isVisible ? 'Hide Window' : 'Open Window (Ctrl+Shift+M)',
        click: () => toggleWindow(),
      },
      {
        label: isRunning ? 'Pause Tracking' : 'Resume Tracking',
        click: () => {
          if (tracker.isRunning()) tracker.pause();
          else tracker.resume();
          pushStatsToWindow();
          updateContextMenu();
        },
      },
      { type: 'separator' },
      {
        label: 'Launch on Windows Startup',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => {
          app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true });
        },
      },
      { type: 'separator' },
      {
        label: 'Quit The Watcher',
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray.setContextMenu(contextMenu);
  }

  tray.on('click', () => toggleWindow());
  tray.on('double-click', () => toggleWindow());
  updateContextMenu();
  return updateContextMenu;
}

function pruneActionTimestamps(now = Date.now()) {
  const cutoff = now - 60000;
  let firstValid = 0;
  while (firstValid < actionTimestamps.length && actionTimestamps[firstValid] < cutoff) firstValid += 1;
  if (firstValid) actionTimestamps = actionTimestamps.slice(firstValid);
}

function recordAction() {
  const now = Date.now();
  actionTimestamps.push(now);
  // Also prune while the dashboard is hidden, so the queue cannot grow forever.
  if (now - lastActionPruneAt >= 5000) {
    pruneActionTimestamps(now);
    lastActionPruneAt = now;
  }
  isDirty = true;
}

function getApm() {
  pruneActionTimestamps();
  return actionTimestamps.length;
}

function buildStatsPayload() {
  const day = storage.getDay(data);
  // App aggregation/sorting changes only on the 2-second app poll, not every
  // 200ms dashboard refresh. Reuse the cached list between those updates.
  if (appsListDirty) {
    const appsMap = {};
    for (const [key, secs] of Object.entries(day.apps || {})) {
      const name = friendlyName(key);
      if (!appsMap[name]) appsMap[name] = { key, name, seconds: 0 };
      appsMap[name].seconds += secs;
    }
    cachedAppsList = Object.values(appsMap).sort((a, b) => b.seconds - a.seconds);
    appsListDirty = false;
  }
  const appsList = cachedAppsList;

  return {
    today: { ...day, appsList },
    running: tracker ? tracker.isRunning() : true,
    dpi,
    idleThresholdSeconds: windowTracker.IDLE_THRESHOLD_SECONDS,
    instantSpeed: Math.round(instantSpeed),
    peakSpeed: day.peakSpeed || 0,
    apm: getApm(),
    currentApp: tracker && !tracker.isRunning() ? 'Paused' : lastCurrentApp,
  };
}

function pushStatsToWindow() {
  if (!win || win.isDestroyed() || !win.isVisible() || win.isMinimized()) return;
  win.webContents.send('stats:update', buildStatsPayload());
}

function isTrustedIpc(event) {
  return Boolean(
    win && !win.isDestroyed() && event.sender === win.webContents &&
    event.senderFrame === event.sender.mainFrame
  );
}

function handleTrusted(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedIpc(event)) throw new Error(`Blocked IPC request: ${channel}`);
    return handler(event, ...args);
  });
}

// Enforce single instance: prevent multiple processes fighting over caches & ports
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
      pushStatsToWindow();
    }
  });

  app.whenReady().then(() => {
    data = storage.load();
    const updateTray = setupTray();

    // Register all IPC Handlers BEFORE creating window to guarantee zero race condition
    handleTrusted('get-stats', () => buildStatsPayload());

    handleTrusted('toggle-running', () => {
      if (tracker && tracker.isRunning()) tracker.pause();
      else if (tracker) tracker.resume();
      if (updateTray) updateTray();
      return tracker ? tracker.isRunning() : false;
    });

    handleTrusted('reset-today', () => {
      data.days[storage.todayKey()] = storage.emptyDay();
      appsListDirty = true;
      instantSpeed = 0;
      actionTimestamps = [];
      isDirty = !storage.save(data);
      if (!isDirty) lastSaveTime = Date.now();
      if (updateTray) updateTray();
      return storage.getDay(data);
    });

    handleTrusted('get-history', (_event, days = 7) => {
      const count = Math.min(90, Math.max(1, Math.floor(Number(days) || 7)));
      return storage.lastNDays(data, count);
    });

    handleTrusted('set-dpi', (_event, value) => {
      const n = Number(value);
      dpi = Number.isFinite(n) && n >= 100 && n <= 32000 ? n : DEFAULT_DPI;
      if (updateTray) updateTray();
      return dpi;
    });

    handleTrusted('set-always-on-top', (_event, flag) => {
      if (win && !win.isDestroyed()) {
        if (typeof flag !== 'boolean') return isAlwaysOnTop;
        isAlwaysOnTop = flag;
        win.setAlwaysOnTop(isAlwaysOnTop);
      }
      return isAlwaysOnTop;
    });

    handleTrusted('set-compact-mode', (_event, compact) => {
      if (typeof compact !== 'boolean') return false;
      if (win && !win.isDestroyed()) {
        if (compact) {
          win.setSize(360, 200, true);
        } else {
          win.setSize(420, 740, true);
        }
      }
      return compact;
    });

    handleTrusted('get-auto-start', () => {
      return app.getLoginItemSettings().openAtLogin;
    });

    handleTrusted('set-auto-start', (_event, flag) => {
      if (typeof flag !== 'boolean') return app.getLoginItemSettings().openAtLogin;
      app.setLoginItemSettings({ openAtLogin: flag, openAsHidden: true });
      if (updateTray) updateTray();
      return app.getLoginItemSettings().openAtLogin;
    });

    handleTrusted('get-apps', (_event, range = 'today') => {
      const allowedRanges = new Set(['today', 'yesterday', '7d', '30d', 'all']);
      const safeRange = allowedRanges.has(range) ? range : 'today';
      return storage.getAggregatedApps(data, safeRange, friendlyName);
    });

    handleTrusted('get-retention', () => {
      return data.retentionDays ?? storage.DEFAULT_RETENTION_DAYS;
    });

    handleTrusted('set-retention', (_event, days) => {
      const parsedDays = Number(days);
      if (days === 'unlimited' || days === 0 || days === null) {
        data.retentionDays = 0; // 0 = unlimited
      } else if (Number.isFinite(parsedDays) && parsedDays > 0) {
        data.retentionDays = Math.min(Math.floor(parsedDays), storage.MAX_RETENTION_DAYS);
      } else {
        return data.retentionDays ?? storage.DEFAULT_RETENTION_DAYS;
      }
      storage.pruneOldDays(data);
      if (storage.save(data)) {
        isDirty = false;
        lastSaveTime = Date.now();
      }
      return data.retentionDays;
    });

    // Safety persistence: save dirty state on system shutdown, restart or user logoff
    app.on('session-end', () => {
      if (data && isDirty) {
        if (storage.save(data)) isDirty = false;
      }
    });

    if (powerMonitor) {
      powerMonitor.on('suspend', () => {
        // Discard the sleep interval so it is never counted as computer usage.
        lastSlowTickAt = Date.now();
        lastFastTickAt = Date.now();
        recentPixels = 0;
        instantSpeed = 0;
        if (data && isDirty) {
          if (storage.save(data)) isDirty = false;
        }
      });
      powerMonitor.on('resume', () => {
        // Start a fresh measurement window after waking from sleep/hibernate.
        lastSlowTickAt = Date.now();
        lastFastTickAt = Date.now();
        recentPixels = 0;
        instantSpeed = 0;
      });
      powerMonitor.on('shutdown', () => {
        if (data && isDirty) {
          if (storage.save(data)) isDirty = false;
        }
      });
    }

    createWindow();

  tracker = createTracker({
    onDistance: (d) => {
      storage.getDay(data).mousePixels += d;
      recentPixels += d;
      isDirty = true;
    },
    onClick: (field) => {
      storage.getDay(data)[field] += 1;
      recordAction();
    },
    onKey: (name) => {
      const day = storage.getDay(data);
      day.keyPresses += 1;
      day.keys[name] = (day.keys[name] || 0) + 1;
      recordAction();
    },
  });
  try {
    tracker.start();
  } catch (err) {
    console.error('[The Watcher] Global input tracking could not start:', err);
    if (updateTray) updateTray();
  }

  // Register Global Hotkey: Ctrl+Shift+M toggles the HUD anywhere in Windows
  const hotkeyRegistered = globalShortcut.register('CommandOrControl+Shift+M', () => {
    toggleWindow();
  });
  if (!hotkeyRegistered) {
    console.warn('[The Watcher] Ctrl+Shift+M is unavailable; use the system tray to open the dashboard.');
  }

  // 1. Slow Cadence (every 2s): Active window detection + intelligent dirty-flag disk save
  let slowTickRunning = false;
  const slowTick = setInterval(async () => {
    if (slowTickRunning) return; // never overlap slow async window polls
    slowTickRunning = true;
    try {
    const nowTick = Date.now();
    // Cap delayed callbacks after sleep/debug pauses so one tick cannot add hours.
    const seconds = Math.min(Math.max((nowTick - lastSlowTickAt) / 1000, 0), 10);
    lastSlowTickAt = nowTick;
    const day = storage.getDay(data);

    // Total laptop-on time: always increments regardless of tracking state or idle
    day.totalSeconds += seconds;
    isDirty = true;

    if (tracker.isRunning()) {
      const activity = await windowTracker.pollActivity();
      // While tracking is active:
      // - activeSeconds: increments when mouse/keyboard input is detected.
      // - idleSeconds: increments during input inactivity (e.g. reading/watching videos).
      // - Foreground app duration is tracked in both active and idle states.
      // When tracking is PAUSED by the user, all polling and foreground app tracking is halted.
      if (activity.isIdle) {
        day.idleSeconds += seconds;
      } else {
        day.activeSeconds += seconds;
      }
      // Record foreground application time during active tracking:
      if (activity.exeKey) {
        day.apps[activity.exeKey] = (day.apps[activity.exeKey] || 0) + seconds;
        appsListDirty = true;
        lastCurrentApp = activity.displayName || friendlyName(activity.exeKey);
      }
    }

    // Persist dirty aggregates periodically without writing on every input event.
    const now = Date.now();
    if (isDirty && (now - lastSaveTime >= DISK_SAVE_INTERVAL_MS)) {
      if (storage.save(data)) {
        isDirty = false;
        lastSaveTime = now;
      }
      if (updateTray) updateTray();
    }
    } catch (err) {
      console.error('[The Watcher] Background tracking tick failed:', err);
    } finally {
      slowTickRunning = false;
    }
  }, SLOW_TICK_MS);

  // 2. Fast Cadence (every 200ms): Live velocity & APM
  const fastTick = setInterval(() => {
    const isWindowVisible = win && !win.isDestroyed() && win.isVisible() && !win.isMinimized();

    const tickNow = Date.now();
    const intervalSec = Math.max((tickNow - lastFastTickAt) / 1000, 0.05);
    lastFastTickAt = tickNow;
    if (tracker.isRunning()) {
      const rawSpeed = recentPixels / intervalSec;
      instantSpeed = instantSpeed * 0.4 + rawSpeed * 0.6;
      recentPixels = 0;

      const day = storage.getDay(data);
      if (instantSpeed > (day.peakSpeed || 0)) {
        day.peakSpeed = Math.round(instantSpeed);
        isDirty = true;
      }
    } else {
      instantSpeed = 0;
      recentPixels = 0;
    }

    // EFFICIENCY OPTIMIZATION: If window is hidden or in tray, do NOT serialize or send IPC!
    if (!isWindowVisible) return;

    pushStatsToWindow();
  }, FAST_TICK_MS);

  app.on('before-quit', () => {
    app.isQuitting = true;
    clearInterval(slowTick);
    clearInterval(fastTick);
    if (data) {
      if (storage.save(data)) isDirty = false;
    }
    if (tracker) {
      try { tracker.stop(); }
      catch (err) { console.error('[The Watcher] Failed to stop input hook cleanly:', err); }
    }
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
});

app.on('window-all-closed', () => {
  // On Windows, keep running in tray even if window is closed
  if (app.isQuitting) {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else toggleWindow();
});
}
