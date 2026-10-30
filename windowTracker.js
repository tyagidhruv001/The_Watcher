// windowTracker.js — runs in the main process only.
//
// Two jobs:
//   1. Idle detection — via Electron's own `powerMonitor.getSystemIdleTime()`.
//      No native addon needed; it works the same on Windows, macOS and Linux.
//   2. Active window — via the `get-windows` package (formerly `active-win`).
//
// get-windows is ESM-only and this file is CommonJS, so it is loaded lazily with
// a dynamic import() — a plain require('get-windows') would throw.

const path = require('path');
const { app, powerMonitor } = require('electron');
const { friendlyName } = require('./appNames');

const IDLE_THRESHOLD_SECONDS = 60; // no mouse/keyboard input for this long = idle

// Ask for the least macOS permission we can get away with.
// NOTE: on macOS this means `title` always comes back empty, so the title-based
// matching below only has an effect on Windows.
const ACTIVE_WINDOW_OPTIONS = {
  accessibilityPermission: false,
  screenRecordingPermission: false,
};

// Apps are identified by their executable's file name (e.g. "chrome.exe").
// Two kinds of host process hide the "real" app, so we look inside them:
//   - Browsers, which run PWAs such as Claude or ChatGPT
//   - Terminals, which run CLI tools such as Claude Code
// Rules are checked in order and the first match wins.
// (Don't add the /g flag to these patterns — .test() would become stateful.)
const BROWSER_EXES = new Set(['chrome.exe', 'msedge.exe', 'brave.exe', 'chrome_proxy.exe']);
const BROWSER_APP_RULES = [
  { pattern: /claude/i, key: 'claude.exe' },
  { pattern: /chatgpt/i, key: 'chatgpt.exe' },
];

const TERMINAL_EXES = new Set(['windowsterminal.exe', 'cmd.exe', 'powershell.exe', 'conhost.exe', 'terminal.exe']);
const TERMINAL_APP_RULES = [
  { pattern: /claude/i, key: 'claude-code.exe' },
];

// Cache the import *promise* so concurrent polls share one load. If it fails,
// clear the cache so a transient error doesn't poison every future poll.
let getWindowsPromise = null;
function loadGetWindows() {
  if (!getWindowsPromise) {
    getWindowsPromise = import('get-windows').catch((err) => {
      getWindowsPromise = null;
      throw err;
    });
  }
  return getWindowsPromise;
}

function exeKeyFor(win) {
  const owner = win.owner || {};
  const raw = (owner.path ? path.basename(owner.path) : owner.name) || 'unknown';
  const exe = raw.toLowerCase();
  const title = win.title || '';
  const ownerName = owner.name || '';

  if (BROWSER_EXES.has(exe)) {
    for (const { pattern, key } of BROWSER_APP_RULES) {
      if (pattern.test(title) || pattern.test(ownerName)) return key;
    }
  } else if (TERMINAL_EXES.has(exe)) {
    for (const { pattern, key } of TERMINAL_APP_RULES) {
      if (pattern.test(title)) return key;
    }
  }
  return exe;
}

// A persistent failure (e.g. a missing permission) would otherwise log on every
// poll, so only log when the message changes. Dev builds only.
let lastWarning = null;
function warnOnce(err) {
  if (app.isPackaged) return;
  const message = err?.message ?? String(err);
  if (message === lastWarning) return;
  lastWarning = message;
  console.warn('[windowTracker] activeWindow poll error:', message);
}

async function pollActivity() {
  // Read idle time *before* the await so it reflects the moment of the poll.
  const isIdle = powerMonitor.getSystemIdleTime() >= IDLE_THRESHOLD_SECONDS;

  try {
    const { activeWindow } = await loadGetWindows();
    const win = await activeWindow(ACTIVE_WINDOW_OPTIONS);
    lastWarning = null;

    if (!win?.owner) return { isIdle, exeKey: null, displayName: null };

    const exeKey = exeKeyFor(win);
    return { isIdle, exeKey, displayName: friendlyName(exeKey, win.owner.name || null) };
  } catch (err) {
    warnOnce(err);
    return { isIdle, exeKey: null, displayName: null };
  }
}

module.exports = { pollActivity, IDLE_THRESHOLD_SECONDS };