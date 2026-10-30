// tracker.js — runs in the main process only.
// Wraps uiohook‑napi (a global input hook) and turns raw OS events into
// three kinds of aggregate deltas: distance moved, a click, or a key name.
// This module never reads or stores what was typed. It does hand each key
// name to `onKey` as it happens, though, so keeping typed text out of storage
// depends on what that callback does with them (count them; don't log order).

const { uIOhook, UiohookKey } = require('uiohook-napi');

/**
 * @typedef {Object} Tracker
 * @property {() => void} start        - start counting events
 * @property {() => void} pause        – temporarily stop counting
 * @property {() => void} resume       – resume after a pause
 * @property {() => boolean} isRunning – current running flag
 * @property {() => void} stop         – fully stop the native hook and listeners
 */

/**
 * Create a new input tracker.
 *
 * @param {{onDistance:(d:number)=>void,
 *         onClick:(field:string)=>void,
 *         onKey:(name:string)=>void}} callbacks
 * @returns {Tracker}
 */
function createTracker({ onDistance, onClick, onKey }) {
  // -----------------------------------------------------------------
  // 1️⃣  Internal state
  // -----------------------------------------------------------------
  let running = false;   // events are being counted
  let started = false;   // native hook is up AND our listeners are attached

  // Last mouse position – plain numbers to avoid churn.
  let hasLastPos = false;
  let lastX = 0;
  let lastY = 0;

  const heldKeys = new Set(); // suppress OS auto‑repeat while a key is held

  // -----------------------------------------------------------------
  // 2️⃣  Helpers
  // -----------------------------------------------------------------
  // Build a keycode → human‑readable name map once from uiohook's own constants.
  const KEY_NAMES = {};
  for (const [name, code] of Object.entries(UiohookKey)) {
    KEY_NAMES[code] = name;
  }
  const keyName = (code) => KEY_NAMES[code] || `code_${code}`;

  // libuiohook's mouse‑button numbering.
  const BUTTON_FIELDS = {
    1: 'leftClicks',
    2: 'rightClicks',
    3: 'middleClicks',
  };

  // -----------------------------------------------------------------
  // 3️⃣  Event listeners that forward to the user‑provided callbacks
  // -----------------------------------------------------------------
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
      if (heldKeys.has(e.keycode)) return; // ignore repeats while held down
      heldKeys.add(e.keycode);
      onKey(keyName(e.keycode));
    },

    keyup(e) {
      heldKeys.delete(e.keycode);
    },
  };
  const listenerEntries = Object.entries(listeners);

  // -----------------------------------------------------------------
  // 4️⃣  Hook lifecycle helpers
  // -----------------------------------------------------------------
  // Shared set of trackers that have actually started the native hook.
  // The `process.once('exit')` handler (added lazily) will stop the hook
  // for any tracker that is still running when the app exits normally.
  const activeTrackers = new Set();

  // Register a *single* exit handler the first time a hook is started.
  let exitHandlerInstalled = false;
  const ensureExitHandler = () => {
    if (!exitHandlerInstalled) {
      process.once('exit', () => {
        if (activeTrackers.size > 0) {
          try { uIOhook.stop(); } catch (e) { console.warn('[tracker] uIOhook.stop() failed on exit:', e); }
        }
        for (const tracker of activeTrackers) {
          for (const [event, fn] of listenerEntries) uIOhook.off(event, fn);
          tracker.__started = false;
        }
        activeTrackers.clear();
        exitHandlerInstalled = false; // not strictly needed after process exit
      });
      exitHandlerInstalled = true;
    }
  };


  function ensureHook() {
      // Register the global exit handler the first time we actually start the native hook.
      ensureExitHandler();
    if (started) return;
    try {
      uIOhook.start();
    } catch (err) {
      // Preserve the original error as the cause so callers can introspect it.
      const wrapped = new Error('Failed to initialise input hook');
      wrapped.cause = err;          // Node 16+ supports .cause
      console.error('[tracker] uIOhook.start() error:', err);
      throw wrapped;
    }
    // Attach listeners *once* per process – they are global, so we add them
    // only while the first tracker actually starts.
    for (const [event, fn] of listenerEntries) uIOhook.on(event, fn);
    started = true;
  }

  // -----------------------------------------------------------------
  // 5️⃣  Public API
  // -----------------------------------------------------------------
  return {
    /** Start counting input events. */
    start() {
      ensureHook();
      running = true;
      // Remember that this concrete tracker has a running hook.
      if (!activeTrackers.has(this)) activeTrackers.add(this);
    },

    /** Pause counting – state and mouse position are cleared. */
    pause() {
      running = false;
      hasLastPos = false;
      heldKeys.clear();
    },

    /** Resume after a pause – re‑initialises the mouse baseline. */
    resume() {
      hasLastPos = false;
      ensureHook();   // re‑attach if the hook was never started
      running = true;
      if (!activeTrackers.has(this)) activeTrackers.add(this);
    },

    /** Returns `true` while the tracker is counting events. */
    isRunning: () => running,

    /** Fully stop the native hook and detach listeners. */
    stop() {
      running = false;
      hasLastPos = false;
      heldKeys.clear();

      if (started) {
        // Remove this tracker from the exit‑cleanup set.
        activeTrackers.delete(this);

        // If *no* other trackers are active, we can safely stop the hook.
        if (activeTrackers.size === 0) {
          try {
            uIOhook.stop();
          } catch (e) {
            console.warn('[tracker] uIOhook.stop() error during stop():', e);
          }
          for (const [event, fn] of listenerEntries) uIOhook.off(event, fn);
          started = false;
        }
      }
    },

    // -----------------------------------------------------------------
    // Internal flag – used only by the exit handler to know whether we
    // have already detached the listeners for this instance.
    // -----------------------------------------------------------------
    __started: started,
  };
}

// ---------------------------------------------------------------------
// Export the factory
// ---------------------------------------------------------------------
module.exports = { createTracker };