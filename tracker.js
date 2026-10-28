// tracker.js — runs in the main process only.
// Wraps uiohook-napi (a global input hook) and turns raw OS events into
// three kinds of aggregate deltas: distance moved, a click, or a key name.
// It never reads or stores what was typed — only which key, and how often.

const { uIOhook, UiohookKey } = require('uiohook-napi');

// Build a keycode -> human-readable name lookup once, from uiohook's own
// key-name constants (e.g. UiohookKey.Space === 44 becomes 44 -> 'Space').
const KEY_NAMES = {};
for (const [name, code] of Object.entries(UiohookKey)) {
  KEY_NAMES[code] = name;
}
function keyName(keycode) {
  return KEY_NAMES[keycode] || `code_${keycode}`;
}

// libuiohook's mouse-button numbering.
const BUTTON_FIELDS = { 1: 'leftClicks', 2: 'rightClicks', 3: 'middleClicks' };

function createTracker({ onDistance, onClick, onKey }) {
  let lastPos = null;
  let running = false;
  let started = false;
  const heldKeys = new Set(); // suppresses OS auto-repeat while a key is held

  uIOhook.on('mousemove', (e) => {
    if (!running) return;
    if (lastPos) {
      const dx = e.x - lastPos.x;
      const dy = e.y - lastPos.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0) onDistance(dist);
    }
    lastPos = { x: e.x, y: e.y };
  });

  uIOhook.on('mousedown', (e) => {
    if (!running) return;
    const field = BUTTON_FIELDS[e.button];
    if (field) onClick(field);
  });

  uIOhook.on('keydown', (e) => {
    if (!running) return;
    if (heldKeys.has(e.keycode)) return; // ignore repeats while held down
    heldKeys.add(e.keycode);
    onKey(keyName(e.keycode));
  });

  uIOhook.on('keyup', (e) => {
    heldKeys.delete(e.keycode);
  });

  return {
    start() {
      if (started) { running = true; return; }
      // Mark the hook active only after the native module starts successfully.
      uIOhook.start();
      started = true;
      running = true;
    },
    pause() {
      running = false;
      lastPos = null;
      heldKeys.clear();
    },
    resume() {
      lastPos = null; // avoid a huge fake jump from the gap while paused
      if (!started) {
        uIOhook.start();
        started = true;
      }
      running = true;
    },
    isRunning: () => running,
    stop() {
      running = false;
      lastPos = null;
      heldKeys.clear();
      if (started) {
        uIOhook.stop();
        started = false;
      }
    },
  };
}

module.exports = { createTracker };
