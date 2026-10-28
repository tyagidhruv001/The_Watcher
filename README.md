# The Watcher

A personal input-activity and screen-time dashboard that tracks mouse distance, click counts, keystrokes, active/idle time, and foreground application usage on a live cybernetic HUD.

## Privacy, read this first

This app uses a **global input hook** — the same low-level mechanism a
keylogger uses — so it can count clicks and key presses even when its own
window isn't focused. To keep that from turning into something creepy:

- It only ever stores **counts** (`Space: 412`, `leftClicks: 88`, ...). It
  never reads, stores, or transmits the actual text you type.
- Application usage is stored as **classified app key + seconds** (e.g.
  `chrome.exe: 4820`). The app reads the foreground window title briefly to
  distinguish selected PWAs (such as ChatGPT/Claude) and terminal sessions,
  but it does **not** persist or transmit window titles or browser tab URLs.
  This still means the app temporarily processes window-title text, so treat
  foreground-app tracking as a privacy-sensitive feature.
- Activity data stays in a local JSON file on your own machine
  (`app.getPath('userData')/activity-data.json`); the app does not upload
  telemetry. The UI uses local system fonts and makes no external font requests.
- Only run this on your own machine, on your own account. If you share a
  computer with someone else, tell them it's running.

## What it does

- **Cursor Distance Today**: shown in pixels, meters, or km (with real-time speedometer & DPI calibration)
- **Mouse Clicks**: left, right, and middle clicks with visual Left/Right click ratio map
- **Keystrokes**: total keys typed, approximate word count (~5 chars/word), and top key breakdown
- **Active Time, Idle Time & PC On Time**: tracks when you're actively working, idle (e.g. watching movies), and total uptime
- **App Foreground Usage**: live tracking of which app is focused and for how long
- **7-Day Trend Chart**: daily distance chart comparing the last 7 days with weekly totals
- **Controls & Extras**: Pause/Resume, Mini HUD mode, Always-on-Top pin, Sound FX synthesizer, Themes, and Share Daily Report

## Tech stack

| Part               | Technology                          |
|---------------------|-------------------------------------|
| Shell                | Electron                            |
| Input tracking       | [`uiohook-napi`](https://www.npmjs.com/package/uiohook-napi) (global mouse/keyboard hook) |
| Idle detection        | Electron's built-in `powerMonitor.getSystemIdleTime()` — no extra package |
| Active window         | [`get-windows`](https://www.npmjs.com/package/get-windows) (the current name for what used to be `active-win`) |
| UI                    | Plain HTML/CSS/JS (no framework)    |
| Storage               | JSON file (swap for SQLite if you want querying/history beyond a rolling window) |
| Packaging             | `electron-builder`                  |

### Notes on the screen-time / app-usage pieces

A few things I deliberately did differently from "the obvious plan" for this
part, worth knowing about:

- **No native Windows API code, no custom native addon.** You don't need to
  write `GetForegroundWindow()`/`GetWindowThreadProcessId()` calls yourself —
  `get-windows` already wraps the platform-specific work (Win32 on Windows,
  Cocoa on macOS, X11 on Linux) behind one cross-platform `activeWindow()`
  call. Same story for idle time: Electron's own `powerMonitor` already does
  this, so there's no separate "systemIdle" native module to write either.
- **`get-windows` is ESM-only.** The rest of this app is CommonJS
  (`require`), and a plain `require('get-windows')` throws
  `ERR_REQUIRE_ESM`. `windowTracker.js` loads it with a dynamic
  `await import('get-windows')` instead — the standard way to pull an
  ESM-only package into CJS code.
- **App usage stores an app key, not window titles or URLs.** `windowTracker.js`
  reads the foreground title temporarily for a narrow classification step
  (for example, distinguishing ChatGPT/Claude PWAs inside a browser and
  Claude Code in a terminal). The title itself is not written to the stats
  file. `get-windows` is called with accessibility and screen-recording
  permission requests disabled.
- **Active-window polling runs every 2s, not 1s**, folded into the same
  interval that already saves/pushes stats — one timer instead of several,
  and it halves how often the (relatively expensive) native window lookup
  runs. Mouse/key/click counting is unaffected — those are still
  event-driven, not polled.
- **Kept JSON storage, not SQLite.** The earlier plan's suggestion to move to
  SQLite with four separate tables is reasonable if you want ad-hoc querying
  over months of history, but it's more moving parts than this feature
  currently needs — daily aggregates plus a 7-day rolling window are cheap
  to compute from one JSON file. Worth revisiting if you add long-range
  history/analytics later.
- **Didn't adopt the deeper `src/services/…/database/…` folder split** from
  that plan. The existing main.js/tracker.js/storage.js + preload.js split
  already keeps system access out of the renderer (the important rule that
  plan called out) — restructuring into a dozen folders for ~7 files would
  be churn without benefit at this size. Reconsider once the app actually
  grows into having several trackers, a real DB layer, and a component-based
  UI.
- **One sharp edge:** on Linux, `get-windows`' native dependency needs X11
  dev headers to build from source (similar to what `uiohook-napi` needs).
  If `npm install` fails specifically on `get-windows`, install your distro's
  X11 development package (e.g. `libx11-dev`) first. This isn't an issue on
  the prebuilt binaries Windows and macOS normally get.

## Security and performance notes

- The renderer runs with context isolation, Node integration disabled, and
  Chromium sandboxing enabled. IPC handlers accept calls only from the main
  application frame, and the preload exposes narrow, named operations.
- A Content Security Policy blocks scripts, network connections, and remote
  resources. The interface uses local system fonts and does not contact Google
  Fonts or other third-party font servers.
- App and key labels loaded from local data are HTML-escaped before rendering.
- Active-window polling is guarded against overlapping asynchronous calls;
  delayed timer callbacks are capped so a sleep/resume gap cannot add hours to
  a single activity bucket. App-list aggregation is cached between polls.
- Saves report success/failure so a failed disk write does not silently clear
  the dirty flag. A backup and temporary-file replacement remain in place.

## Setup

```bash
npm install
npm start
```

`uiohook-napi` ships prebuilt binaries for the common platforms, so
`npm install` should just work. If it tries to compile from source and fails,
you're missing build tools for your OS (Xcode Command Line Tools on macOS,
`build-essential` + `python3` on Linux, `windows-build-tools`/Visual Studio
Build Tools on Windows).

### OS permissions

- **macOS**: the first time you run it, macOS will ask you to grant
  **Accessibility** (and sometimes **Input Monitoring**) permission under
  *System Settings → Privacy & Security*. Without it, the hook silently sees
  nothing.
- **Windows**: no special permission is normally needed, but some antivirus
  tools flag global input hooks — that's expected for this category of app,
  not a sign of a real problem.
- **Linux**: needs an X11 session (Wayland support for global hooks is
  spottier depending on your compositor).

## Building an installer

```bash
npm run build
```

Produces an installer in `dist/` (`.exe`/NSIS on Windows by default — see
`build.mac`/`build.linux` in `package.json` for other targets).

## How it's structured

```
main.js        Electron entry point — owns the window, the tracker, and IPC
tracker.js     Wraps uiohook-napi: raw events -> distance/click/key deltas
storage.js     Reads/writes the daily JSON stats file
preload.js     contextBridge: exposes a small safe API to the UI
index.html     Dashboard markup
styles.css     Dashboard styling
renderer.js    Dashboard behavior (no direct Node access — uses window.api)
```

Design choice: `uiohook-napi` and file access only ever run in the main
process. The renderer (the actual window UI) only talks to `window.api`,
which is the small set of functions `preload.js` exposes. That keeps the
window's web content from ever getting raw Node/OS access.

## Possible future extensions

- CSV export of daily and per-app history.
- Optional retention controls to delete old daily records automatically.
- A visible privacy indicator and a first-run consent screen explaining the
  global input hook and temporary foreground-title classification.
- SQLite if long-range history or multi-year analytics outgrow JSON storage.
