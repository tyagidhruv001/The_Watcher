// windowTracker.js — runs in the main process only.
//
// Two jobs:
//   1. Idle detection — via Electron's own `powerMonitor.getSystemIdleTime()`.
//      No native addon needed for this; Electron ships it, and it works the
//      same way on Windows, macOS, and Linux.
//   2. Active window — via the `get-windows` package (the current name for
//      what used to be published as `active-win`). It also works across all
//      three platforms without you writing any native Win32/Cocoa/X11 code.
//
// get-windows is an ESM-only package. This file is CommonJS (to match the
// rest of the app), so it's loaded with a dynamic import() the first time
// it's needed — a plain require('get-windows') would throw.

const path = require('path');
const { powerMonitor } = require('electron');
const { friendlyName } = require('./appNames');

const IDLE_THRESHOLD_SECONDS = 60; // no mouse/keyboard input for this long = idle

let getWindowsModule = null;
async function loadGetWindows() {
  if (!getWindowsModule) getWindowsModule = import('get-windows');
  try {
    return await getWindowsModule;
  } catch (err) {
    // A transient import failure must not poison every future polling attempt.
    getWindowsModule = null;
    throw err;
  }
}

// Windows/Linux don't reliably give a "friendly app name" the way macOS
// bundles do, so identify apps primarily by their executable's file name
// (e.g. "chrome.exe").
// However, Chrome/Edge PWAs (like Claude or ChatGPT) run inside chrome.exe/msedge.exe,
// and terminal tools like Claude Code run inside windowsterminal.exe/cmd.exe.
// We check for these specifically so they are counted under their real names!
function exeKeyFor(win) {
  const raw = (win.owner && (win.owner.path ? path.basename(win.owner.path) : win.owner.name)) || 'unknown';
  const exe = raw.toLowerCase();
  const title = (win.title || '').trim();

  const ownerName = (win.owner && win.owner.name) ? win.owner.name : '';

  // 1. Detect Chrome / Edge / Brave PWAs (e.g. Claude desktop shortcut, ChatGPT PWA)
  if (exe === 'chrome.exe' || exe === 'msedge.exe' || exe === 'brave.exe' || exe === 'chrome_proxy.exe') {
    if (/claude/i.test(title) || /claude/i.test(ownerName)) {
      return 'claude.exe';
    }
    if (/chatgpt/i.test(title) || /chatgpt/i.test(ownerName)) {
      return 'chatgpt.exe';
    }
  }

  // 2. Detect Claude Code CLI running inside a terminal or cmd
  if (exe === 'windowsterminal.exe' || exe === 'cmd.exe' || exe === 'powershell.exe' || exe === 'conhost.exe' || exe === 'terminal.exe') {
    if (/claude/i.test(title)) {
      return 'claude-code.exe';
    }
  }

  return exe;
}

async function pollActivity() {
  const idleSeconds = powerMonitor.getSystemIdleTime();
  const isIdle = idleSeconds >= IDLE_THRESHOLD_SECONDS;

  try {
    const { activeWindow } = await loadGetWindows();
    // Ask for the least amount of macOS permission we can get away with:
    // we only need the owning process, not the window title or browser URL.
    const win = await activeWindow({ accessibilityPermission: false, screenRecordingPermission: false });
    if (!win || !win.owner) return { isIdle, exeKey: null, displayName: null };
    const exeKey = exeKeyFor(win);
    const rawOwnerName = win.owner && win.owner.name ? win.owner.name : null;
    return { isIdle, exeKey, displayName: friendlyName(exeKey, rawOwnerName) };
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[windowTracker] activeWindow poll error:', err && err.message ? err.message : err);
    }
    return { isIdle, exeKey: null, displayName: null };
  }
}

module.exports = { pollActivity, IDLE_THRESHOLD_SECONDS };
