# The Watcher

A personal input-activity and screen-time dashboard that tracks cursor distance, clicks, keystrokes, active/idle time, and foreground application usage on a live cybernetic HUD.

Built with Electron, HTML/CSS/JavaScript, and Node.js. All data stays 100% local on your machine.

---

## Privacy & Security (Read This First)

The Watcher uses a low-level global input hook ([`uiohook-napi`](https://www.npmjs.com/package/uiohook-napi)) to count clicks and keystrokes even when its own window is minimized or out of focus. Privacy was designed into the architecture from day one:

- **No Keylogging (Counts Only)**: The application **never** records, logs, or transmits what you type. Keystrokes are strictly recorded as aggregate counters per key name (e.g. `Space: 412`, `Enter: 88`). Sequence and timing order are never stored, meaning passwords, credit card numbers, and written messages **cannot be reconstructed**.
- **No Window Titles or URLs Saved**: The active application tracker uses [`get-windows`](https://www.npmjs.com/package/get-windows) to identify the focused executable (e.g. `chrome.exe`, `code.exe`). Window titles are inspected only in-memory to classify recognized web applications (e.g. distinguishing a Claude or ChatGPT PWA from a generic browser tab). Window titles, website URLs, and document paths are **never persisted to disk or transmitted**.
- **100% Local Storage**: All telemetry is saved exclusively to a local JSON file on your machine. There is **zero telemetry upload**, no analytics, and no remote server communication.
- **Strict Content Security Policy (CSP)**: The renderer runs with Node integration disabled, context isolation enabled, and a strict CSP blocking remote network access (`connect-src 'none'`). All UI assets and fonts are local.

---

## Features

### Input Telemetry
- **Cursor Distance**: Real-time odometer tracking cursor movement in pixels, meters, or kilometers.
- **Live Speedometer & APM**: Real-time velocity gauge (with configurable units: px/s, m/s, km/h, mph), peak velocity today, and live Actions Per Minute (APM).
- **Hardware DPI Calibration**: Calibrate your mouse sensor DPI (default: 1000 DPI, with presets from 400 to 3200 DPI) for accurate real-world distance calculation.
- **Click Breakdown**: Tracks Left, Right, and Middle clicks, plus an interactive Left vs. Right click ratio map.
- **Keystroke Analytics**: Total keystrokes typed today, estimated word count (~5 characters/word), and top key breakdown with held-key auto-repeat suppression.

### Time & Screen-Time Intelligence
- **Active Time**: Tracks time where mouse or keyboard input was actively detected.
- **Idle Time**: Uses Electron's native `powerMonitor.getSystemIdleTime()` to detect inactivity (> 2 minutes without input, e.g. watching video or reading).
- **Laptop-On (PC Awake) Time**: Measures total session uptime independent of input or pause status.
- **Top Applications**: Live tracking of the focused window executable and total active duration. View rankings across **Today**, **Yesterday**, **Last 7 Days**, **Last 30 Days**, or **All-Time**.
- **7-Day Trend Chart**: Interactive daily distance history comparing the past 7 days against your personal daily average.

### User Controls & Customization
- **Pause & Resume**: Temporarily halt all input and application tracking at any moment.
- **System Tray Integration**: Background tracking with tray status (`Today: X.Xm · Live`), quick pause/resume toggle, and auto-start on Windows boot toggle.
- **Global Hotkey**: Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>M</kbd> anywhere in Windows to toggle the HUD.
- **Theme Engine**: 6 cyberpunk/neon palettes (Cyber, Amber, Emerald, Violet, Crimson, Midnight) with instant switching.
- **Audio Synthesizer**: Optional Web Audio API click/odometer sound effects with adjustable volume.
- **Share Summary**: One-click formatted daily summary copied to clipboard for standups or daily logs.
- **Safe 2-Step Reset**: Reset today's live counters without affecting historical days.

---

## Tracking States & Privacy Controls

| Component / Metric | Live (Running) | Paused (Soft Pause) | Stopped / Revoked (Hard Stop) | Idle (> 2m Inactivity) |
| :--- | :--- | :--- | :--- | :--- |
| **Native Hook (`uIOhook`)** | **Running** | **Standby** | **Completely Uninstalled** | **Running** |
| **Input Counters** | **Active** | **Halted** (events discarded) | **Halted** (listeners detached) | **Active** (awaits next input) |
| **Foreground App Polling** | **Active** (every 2s) | **Halted** | **Halted** | **Active** (tracks idle app time) |
| **Active Seconds** | Accumulating | Frozen | Frozen | Frozen |
| **Idle Seconds** | Frozen | Frozen | Frozen | Accumulating |
| **Laptop-On Time** | Accumulating | **Accumulating** | **Accumulating** (if app is open) | Accumulating |
| **Current App Badge** | Focused App Name | **`'Paused'`** | **`'Paused'`** | Focused App Name |
| **Status Pill (HUD)** | `LIVE` | `PAUSED` | `PAUSED` | `LIVE` |
| **Tray Menu & Hotkey** | Functional | Functional | Functional | Functional |

### Pause vs. Stop Lifecycle
- **Pause (Soft Pause)**: Setting the dashboard or tray to "Pause" suppresses all event counting and halts foreground app polling. The native hook remains on standby to ensure instantaneous (0ms) resumption without Windows hook churn. Coordinate anchors are wiped so resuming never records false cursor "teleport" distance spikes.
- **Stop / Revocation (Hard Stop)**: Triggered during app exit or when tracking is explicitly terminated. `uIOhook.stop()` is called, completely unregistering low-level hooks from the Windows kernel/user32 hook chain and detaching all listeners. Historical data remains safe and preserved on disk.

---

## Data Storage & Retention Policy

### Storage Location
All data is stored in a clean, human-readable JSON database on your local drive:
- **Windows**: `%APPDATA%\the-watcher\activity-data.json`
- **macOS**: `~/Library/Application Support/the-watcher/activity-data.json`
- **Linux**: `~/.config/the-watcher/activity-data.json`

### Storage Resilience & Auto-Recovery
- **Atomic Writes**: Writes first to a `.tmp` file and atomically replaces the primary file, preventing corruption during power cuts or crashes.
- **Automated Backup**: Generates an `activity-data.json.bak` safety copy before updates.
- **Corrupted File Recovery**: If the primary file is ever damaged or empty, the app automatically recovers validated historical records from the backup without overwriting the backup with corrupted data.
- **Strict Date Validation**: Validates all dates as genuine calendar dates (`YYYY-MM-DD`), correctly handling leap years and rejecting impossible dates (e.g. Feb 31).

### Configurable Data Retention
- Configurable retention periods: **30 days**, **90 days**, **180 days**, **365 days** (default), or **0** for unlimited history.
- Automatically prunes expired historical records on startup and upon updating retention settings.
- Bounded at a safe maximum of 3,650 days (10 years) with date overflow protection.

---

## Installation & Development

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18, 20, or 22+ recommended)
- `npm`

### Setup
```bash
# Clone the repository
git clone https://github.com/tyagidhruv001/The_Watcher.git
cd TheWatcher

# Install dependencies
npm install

# Run application in development mode
npm start
```

### Running Tests
The test suite uses Node.js's native test runner (`node:test` and `node:assert/strict`) with zero external testing dependencies:

```bash
npm test
```

Runs 32 automated tests covering:
- Storage serialization, schema normalization, and atomic file recovery.
- Strict calendar date validation and leap year handling.
- 30-day and unlimited data retention pruning.
- Tracker lifecycle management (start, pause, resume, stop, restart, double-stop).
- Singleton tracker enforcement and listener deduplication.
- Live Windows native hook integration.
- Single-source-of-truth version consistency.

### Building an Installer
To package the app into a standalone production installer:

```bash
npm run build
```

Generates a Windows NSIS installer in the `dist/` directory (e.g. `The Watcher Setup 1.4.0.exe`).

---

## Project Structure

```
TheWatcher/
├── main.js             # Electron main process (lifecycle, IPC, window management, tray)
├── tracker.js          # Input tracking wrapper around uiohook-napi (singleton state machine)
├── windowTracker.js    # Foreground application detection & classification via get-windows
├── storage.js          # Persistence, backup recovery, schema normalization, and retention
├── appNames.js         # Process executable to friendly display name mapping table
├── preload.js          # Secure contextBridge API exposed to the renderer
├── index.html          # Cybernetic HUD markup
├── styles.css          # Cyberpunk styling, responsive layouts, and animations
├── renderer.js         # Dashboard UI controller, charts, themes, and sound effects
└── test/
    ├── storage.test.js # Persistence, validation, recovery, and retention tests
    ├── tracker.test.js # Tracker lifecycle, pause/resume, and singleton tests
    └── version.test.js # Metadata and version consistency tests
```

---

## Platform Notes & Permissions

- **Windows**: No special OS permissions required. Some aggressive antivirus tools may flag global keyboard/mouse hooks (`WH_KEYBOARD_LL`). This is a standard heuristic false positive for global input trackers.
- **macOS**: Requires explicit **Accessibility** and **Input Monitoring** permissions in *System Settings → Privacy & Security*.
- **Linux**: Requires an **X11** desktop session. Global input hooks under Wayland are restricted by compositor security models.

---

## Roadmap

- [ ] Export daily and per-app history to CSV / JSON.
- [ ] Custom date-range picker for long-term trend analysis.
- [ ] Configurable idle timeout threshold directly from the settings drawer.
