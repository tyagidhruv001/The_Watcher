# The Watcher: Runtime, Security and Performance Review

## Baseline received

- Node.js reported by the user: 22.23.2
- npm reported by the user: 10.9.8
- Electron locked in `package-lock.json`: 41.10.7
- electron-builder locked in `package-lock.json`: 26.15.3
- uiohook-napi locked in `package-lock.json`: 1.5.5
- get-windows locked in `package-lock.json`: 9.3.0
- The broken `postinstall` script is absent from `package.json`.

## Changes in this review pass

### Reliability and runtime behavior
- Reset time and speed sampling baselines on system suspend/resume so sleep time is not incorrectly credited as active computer use and cursor speed does not spike after wake.
- Calculate cursor speed using measured elapsed time rather than assuming every interval callback fires exactly 200ms apart.
- Make native hook startup state reflect whether `uIOhook.start()` actually succeeded; allow a later resume attempt to retry startup.
- Catch native hook startup/shutdown errors so a hook failure does not immediately prevent the dashboard from opening.
- Warn when the global shortcut cannot be registered.
- Log renderer-process exits for diagnosis.
- Ensure the local data directory exists before writing activity data.
- Remove a duplicate stats push in the second-instance handler.

### Security and privacy
- Require actual booleans for always-on-top, compact mode and auto-start IPC inputs rather than coercing arbitrary values.
- Bound clipboard writes to strings of at most 100,000 characters.
- Remove remote Google Fonts requests. The interface now uses local system font stacks, and the CSP no longer permits Google font origins.
- Retain context isolation, sandboxing, disabled Node integration, main-frame-only IPC, navigation/window-open restrictions, and escaped persisted app/key labels.

### Performance and measurement
- Preserve cached app aggregation between foreground-window polls.
- Keep the asynchronous foreground-window poll overlap guard.
- Keep action timestamp pruning while the dashboard is hidden.
- Use `Math.hypot` for cursor distance.

## Static validation performed here

- `node --check` passed for all seven JavaScript files using the container's Node.js 22.16.0 runtime. This is not the same patch version as the user's reported Node.js 22.23.2.
- `package-lock.json` records Electron 41.10.7, electron-builder 26.15.3, uiohook-napi 1.5.5 and get-windows 9.3.0.
- Reviewed CSP, IPC handlers, renderer HTML insertion points, storage behavior and timer lifecycle.
- Storage behavior was exercised with a small mocked-Electron test (see validation report).

## Not verified in this environment

- Electron GUI launch on the user's Windows installation.
- Native global mouse/keyboard hooks on Windows.
- Actual foreground-window permissions and process identification on Windows.
- Sleep/wake behavior on physical hardware.
- NSIS installer creation and installation/uninstallation.
- The user's npm audit result. The audit notices described by the user were not independently re-audited here.

## Remaining considerations

- Global input hooks are privacy-sensitive. The app should remain visible to its user, disclose what it counts, and only run with informed consent. It stores key names/counts, not typed text.
- Foreground window titles are temporarily inspected to classify selected browser PWAs and terminal sessions, but are not persisted.
- JSON persistence is synchronous. It is suitable for the current small aggregate data set; if history grows substantially, consider a transactional store.
- CSP still permits inline styles because the dashboard uses inline progress-bar widths. A stricter `style-src` requires moving those dynamic styles to CSS classes or CSS custom properties.
