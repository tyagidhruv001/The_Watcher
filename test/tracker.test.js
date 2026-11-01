// test/tracker.test.js
// Automated test suite for tracker.js lifecycle management using Node.js node:test and node:assert

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('events');
const { createTracker, getActiveTracker, _resetExitCleanup } = require('../tracker.js');

// Mock implementation of the native uIOhook EventEmitter
class MockHook extends EventEmitter {
  constructor() {
    super();
    this.startCalls = 0;
    this.stopCalls = 0;
    this.started = false;
  }

  start() {
    this.startCalls++;
    this.started = true;
  }

  stop() {
    this.stopCalls++;
    this.started = false;
  }

  off(event, fn) {
    return this.removeListener(event, fn);
  }
}

describe('Tracker Lifecycle Management (tracker.js)', () => {
  let mockHook;
  let distanceRecords;
  let clickRecords;
  let keyRecords;
  let tracker;

  beforeEach(() => {
    mockHook = new MockHook();
    distanceRecords = [];
    clickRecords = [];
    keyRecords = [];

    _resetExitCleanup();

    tracker = createTracker(
      {
        onDistance: (d) => distanceRecords.push(d),
        onClick: (field) => clickRecords.push(field),
        onKey: (name) => keyRecords.push(name),
      },
      mockHook
    );
  });

  afterEach(() => {
    if (tracker) {
      tracker.stop();
    }
    _resetExitCleanup();
  });

  // 1. Start tracker
  it('1. Start tracker', () => {
    assert.strictEqual(tracker.isRunning(), false, 'Tracker should not be running before start()');

    tracker.start();

    assert.strictEqual(tracker.isRunning(), true, 'Tracker should be running after start()');
    assert.strictEqual(mockHook.startCalls, 1, 'mockHook.start() should be called once');
    assert.strictEqual(mockHook.started, true);

    // Verify listeners are registered
    assert.strictEqual(mockHook.listenerCount('mousemove'), 1);
    assert.strictEqual(mockHook.listenerCount('mousedown'), 1);
    assert.strictEqual(mockHook.listenerCount('keydown'), 1);
    assert.strictEqual(mockHook.listenerCount('keyup'), 1);
  });

  // 2. Start tracker twice without creating duplicate listeners
  it('2. Start tracker twice without creating duplicate listeners', () => {
    tracker.start();
    tracker.start();

    assert.strictEqual(tracker.isRunning(), true);
    assert.strictEqual(mockHook.startCalls, 1, 'Hook should only be started once');

    assert.strictEqual(mockHook.listenerCount('mousemove'), 1, 'mousemove listener should not be duplicated');
    assert.strictEqual(mockHook.listenerCount('mousedown'), 1, 'mousedown listener should not be duplicated');
    assert.strictEqual(mockHook.listenerCount('keydown'), 1, 'keydown listener should not be duplicated');
    assert.strictEqual(mockHook.listenerCount('keyup'), 1, 'keyup listener should not be duplicated');
  });

  // 3. Pause tracker
  it('3. Pause tracker', () => {
    tracker.start();
    assert.strictEqual(tracker.isRunning(), true);

    tracker.pause();

    assert.strictEqual(tracker.isRunning(), false, 'Tracker should report not running when paused');
    assert.strictEqual(mockHook.stopCalls, 0, 'Pausing should not stop the native hook');
    assert.strictEqual(mockHook.listenerCount('mousemove'), 1, 'Listeners should remain attached during pause');
  });

  // 4. Resume tracker
  it('4. Resume tracker', () => {
    tracker.start();
    tracker.pause();
    assert.strictEqual(tracker.isRunning(), false);

    tracker.resume();

    assert.strictEqual(tracker.isRunning(), true, 'Tracker should report running after resume()');
    assert.strictEqual(mockHook.startCalls, 1, 'resume() should not re-start an already running hook');
    assert.strictEqual(mockHook.listenerCount('mousemove'), 1, 'Listeners must not be duplicated on resume');
  });

  // 5. Stop tracker
  it('5. Stop tracker', () => {
    tracker.start();
    assert.strictEqual(tracker.isRunning(), true);

    tracker.stop();

    assert.strictEqual(tracker.isRunning(), false, 'Tracker should report not running after stop()');
    assert.strictEqual(mockHook.stopCalls, 1, 'mockHook.stop() should be called once');
    assert.strictEqual(mockHook.listenerCount('mousemove'), 0, 'Listeners should be completely removed');
    assert.strictEqual(mockHook.listenerCount('mousedown'), 0);
    assert.strictEqual(mockHook.listenerCount('keydown'), 0);
    assert.strictEqual(mockHook.listenerCount('keyup'), 0);
  });

  // 6. Restart tracker after stopping
  it('6. Restart tracker after stopping', () => {
    tracker.start();
    tracker.stop();
    assert.strictEqual(tracker.isRunning(), false);

    // Restart
    tracker.start();
    assert.strictEqual(tracker.isRunning(), true);
    assert.strictEqual(mockHook.startCalls, 2, 'Hook should be started again');
    assert.strictEqual(mockHook.listenerCount('mousemove'), 1, 'Listeners should be re-attached with count 1');
    assert.strictEqual(mockHook.listenerCount('mousedown'), 1);

    // Verify events work after restart
    mockHook.emit('mousedown', { button: 1 });
    assert.deepStrictEqual(clickRecords, ['leftClicks']);
  });

  // 7. Stop tracker twice safely
  it('7. Stop tracker twice safely', () => {
    tracker.start();
    tracker.stop();

    // Second stop should be a safe no-op
    assert.doesNotThrow(() => {
      tracker.stop();
    });

    assert.strictEqual(mockHook.stopCalls, 1, 'hook.stop() should not be called a second time');
    assert.strictEqual(tracker.isRunning(), false);
  });

  // 8. Ensure paused tracking does not record activity
  it('8. Ensure paused tracking does not record activity', () => {
    tracker.start();
    tracker.pause();

    // Emit simulated mouse and keyboard events while paused
    mockHook.emit('mousemove', { x: 10, y: 10 });
    mockHook.emit('mousemove', { x: 50, y: 50 });
    mockHook.emit('mousedown', { button: 1 });
    mockHook.emit('mousedown', { button: 2 });
    mockHook.emit('keydown', { keycode: 57 }); // Space

    assert.strictEqual(distanceRecords.length, 0, 'No mouse distance should be recorded while paused');
    assert.strictEqual(clickRecords.length, 0, 'No clicks should be recorded while paused');
    assert.strictEqual(keyRecords.length, 0, 'No keystrokes should be recorded while paused');
  });

  // 9. Ensure resumed tracking records activity
  it('9. Ensure resumed tracking records activity', () => {
    tracker.start();
    tracker.pause();
    tracker.resume();

    // 1. Mouse distance with teleport prevention:
    // First coordinate sets anchor position (0 distance)
    mockHook.emit('mousemove', { x: 100, y: 100 });
    assert.strictEqual(distanceRecords.length, 0, 'First position establishes anchor without jump distance');

    // Second move calculates actual distance: (100, 100) -> (100, 150) = 50px
    mockHook.emit('mousemove', { x: 100, y: 150 });
    assert.strictEqual(distanceRecords.length, 1);
    assert.strictEqual(Math.round(distanceRecords[0]), 50);

    // 2. Mouse clicks:
    mockHook.emit('mousedown', { button: 1 }); // Left
    mockHook.emit('mousedown', { button: 2 }); // Right
    mockHook.emit('mousedown', { button: 3 }); // Middle
    assert.deepStrictEqual(clickRecords, ['leftClicks', 'rightClicks', 'middleClicks']);

    // 3. Keystrokes and OS repeat suppression:
    mockHook.emit('keydown', { keycode: 57 }); // Space (code 57)
    mockHook.emit('keydown', { keycode: 57 }); // Repeated keydown while held
    mockHook.emit('keydown', { keycode: 57 }); // Repeated keydown while held
    assert.deepStrictEqual(keyRecords, ['Space'], 'Repeated keydowns while held must be suppressed');

    // Releasing key and pressing again records new keystroke
    mockHook.emit('keyup', { keycode: 57 });
    mockHook.emit('keydown', { keycode: 57 });
    assert.deepStrictEqual(keyRecords, ['Space', 'Space']);
  });

  // 10. Ensure listeners are not duplicated after repeated start/pause/resume cycles
  it('10. Ensure listeners are not duplicated after repeated start/pause/resume cycles', () => {
    tracker.start();

    // Perform multiple rapid transitions
    for (let i = 0; i < 10; i++) {
      tracker.pause();
      tracker.resume();
      tracker.start();
    }

    assert.strictEqual(tracker.isRunning(), true);
    assert.strictEqual(mockHook.listenerCount('mousemove'), 1);
    assert.strictEqual(mockHook.listenerCount('mousedown'), 1);
    assert.strictEqual(mockHook.listenerCount('keydown'), 1);
    assert.strictEqual(mockHook.listenerCount('keyup'), 1);

    // Emit single click, verify exactly one callback occurs
    mockHook.emit('mousedown', { button: 1 });
    assert.strictEqual(clickRecords.length, 1, 'Only one click event should be delivered, not duplicated');
  });

  // 11. Ensure the exit handler safely stops an active tracker
  it('11. Ensure the exit handler safely stops an active tracker', () => {
    tracker.start();
    assert.strictEqual(tracker.isRunning(), true);
    assert.strictEqual(getActiveTracker(), tracker, 'activeTracker should reference current tracker');

    // Simulate process exit event
    process.emit('exit');

    assert.strictEqual(tracker.isRunning(), false, 'Exit handler must stop running tracker');
    assert.strictEqual(mockHook.stopCalls, 1, 'Exit handler must stop native hook');
    assert.strictEqual(mockHook.listenerCount('mousemove'), 0, 'Listeners must be cleared');
    assert.strictEqual(getActiveTracker(), null, 'activeTracker should be cleared');
  });

  // 12. Real native hook integration test on Windows
  it('12. Real native hook integration test on Windows', () => {
    // Release the mock tracker from beforeEach to enforce singleton
    tracker.stop();

    // Tests actual uiohook-napi start/stop lifecycle without mock
    const realTracker = createTracker({
      onDistance: () => {},
      onClick: () => {},
      onKey: () => {},
    });

    assert.doesNotThrow(() => {
      realTracker.start();
      assert.strictEqual(realTracker.isRunning(), true);

      realTracker.pause();
      assert.strictEqual(realTracker.isRunning(), false);

      realTracker.resume();
      assert.strictEqual(realTracker.isRunning(), true);

      realTracker.stop();
      assert.strictEqual(realTracker.isRunning(), false);
    });
  });

  // 13. Prevent accidental creation of multiple active tracker instances (singleton enforcement)
  it('13. Prevent accidental creation of multiple active tracker instances', () => {
    // tracker is already active from beforeEach
    assert.throws(
      () => {
        createTracker({
          onDistance: () => {},
          onClick: () => {},
          onKey: () => {},
        });
      },
      {
        name: 'Error',
        message: /already exists/i,
      },
      'Should throw when creating a second tracker while one is already active'
    );
  });

  // 14. Prevent starting an orphaned tracker when another tracker is active
  it('14. Prevent starting an orphaned tracker when another tracker is active', () => {
    const firstTracker = tracker;
    firstTracker.stop(); // Releases singleton

    // Create second tracker
    const secondTracker = createTracker(
      {
        onDistance: () => {},
        onClick: () => {},
        onKey: () => {},
      },
      mockHook
    );
    tracker = secondTracker; // Ensure afterEach cleans up secondTracker
    secondTracker.start();

    // Attempting to start the orphaned firstTracker must be rejected
    assert.throws(
      () => {
        firstTracker.start();
      },
      {
        name: 'Error',
        message: /another tracker instance is currently active/i,
      }
    );

    // Attempting to resume the orphaned firstTracker must also be rejected
    assert.throws(
      () => {
        firstTracker.resume();
      },
      {
        name: 'Error',
        message: /another tracker instance is currently active/i,
      }
    );
  });
});

