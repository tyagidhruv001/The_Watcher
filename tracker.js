// tracker.js — runs in the main process only.
// Wraps uiohook-napi (a global input hook) and turns raw OS events into
// three kinds of aggregate deltas: distance moved, a click, or a key name.
// This module never reads or stores what was typed. It does hand each key
// name to onKey as it happens, though, so keeping typed text out of storage
// depends on what that callback does with them (count them; don't log order).

const { uIOhook, UiohookKey } = require('uiohook-napi');

/**
 * @typedef {Object} Tracker
 * @property {() => void} start        - start counting events
 * @property {() => void} pause        - temporarily stop counting
 * @property {() => void} resume       - resume after a pause
 * @property {() => boolean} isRunning - current running flag
 * @property {() => void} stop         - fully stop the native hook and listeners
 */

// Keycode -> name lookup table built once at module load
const KEY_NAMES = {};
for (const [name, code] of Object.entries(UiohookKey)) {
  KEY_NAMES[code] = name;
}
function keyName(code) {
  return KEY_NAMES[code] || `code_${code}`;
}

// libuiohook mouse-button numbering
const BUTTON_FIELDS = {
  1: 'leftClicks',
  2: 'rightClicks',
  3: 'middleClicks',
};

// Module-level tracking for process exit cleanup
let activeTracker = null;
let exitHandlerRegistered = false;

function ensureExitCleanup() {
  if (exitHandlerRegistered) return;
  exitHandlerRegistered = true;
  process.once('exit', () => {
    if (activeTracker) {
      activeTracker.stop();
    }
  });
}

/**
 * Create a new input tracker.
 *
 * @param {{onDistance: (d: number) => void,
 *          onClick: (field: string) => void,
 *          onKey: (name: string) => void}} callbacks
 * @returns {Tracker}
 */
function createTracker({ onDistance, onClick, onKey }) {
  let running = false;
  let started = false;

  let hasLastPos = false;
  let lastX = 0;
  let lastY = 0;

  const heldKeys = new Set(); // Suppress OS auto-repeat while key is held down

  const listeners = {
    mousemove(e) {
      if (!running) return;
      if (hasLastPos) {
        const dist = Math.hypot(e.x - lastX, e.y - lastY);
        if (dist > 0) onDistance(dist);
      }
      lastX = e.x;
      lastY = e.y;
      hasLastPos = true;
    },

    mousedown(e) {
      if (!running) return;
      const field = BUTTON_FIELDS[e.button];
      if (field) onClick(field);
    },

    keydown(e) {
      if (!running) return;
      if (heldKeys.has(e.keycode)) return; // Ignore repeats while held
      heldKeys.add(e.keycode);
      onKey(keyName(e.keycode));
    },

    keyup(e) {
      heldKeys.delete(e.keycode);
    },
  };
  const listenerEntries = Object.entries(listeners);

  function ensureHook() {
    ensureExitCleanup();
    if (started) return;
    try {
      uIOhook.start();
    } catch (err) {
      const wrapped = new Error(`Failed to initialise input hook: ${err.message}`);
      wrapped.cause = err;
      console.error('[tracker] uIOhook.start() error:', err);
      throw wrapped;
    }
    for (const [event, fn] of listenerEntries) {
      uIOhook.on(event, fn);
    }
    started = true;
  }

  const tracker = {
    start() {
      ensureHook();
      running = true;
      activeTracker = tracker;
    },

    pause() {
      running = false;
      hasLastPos = false;
      heldKeys.clear();
    },

    resume() {
      hasLastPos = false;
      ensureHook();
      running = true;
      activeTracker = tracker;
    },

    isRunning() {
      return running;
    },

    stop() {
      running = false;
      hasLastPos = false;
      heldKeys.clear();

      if (started) {
        try {
          uIOhook.stop();
        } catch (err) {
          console.warn('[tracker] uIOhook.stop() error during stop():', err);
        }
        for (const [event, fn] of listenerEntries) {
          uIOhook.off(event, fn);
        }
        started = false;
      }

      if (activeTracker === tracker) {
        activeTracker = null;
      }
    },
  };

  return tracker;
}

module.exports = { createTracker };
