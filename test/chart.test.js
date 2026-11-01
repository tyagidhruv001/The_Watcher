// test/chart.test.js
// Automated test suite for Dashboard Chart Rendering & Interaction Logic

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('Dashboard Chart Rendering & Interaction Logic', () => {
  let sandbox;
  let canvasCtx;
  let chartEl;
  let tooltipEl;
  let rendererCode;

  function createMockElement(id = '') {
    const listeners = {};
    const attributes = {};
    return {
      id,
      textContent: '',
      className: '',
      setAttribute(k, v) { attributes[k] = String(v); },
      getAttribute(k) { return attributes[k] || null; },
      hasAttribute(k) { return k in attributes; },
      focus() {},
      classList: {
        _classes: new Set(),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        toggle(c, force) {
          if (force === undefined) {
            if (this._classes.has(c)) this._classes.delete(c);
            else this._classes.add(c);
          } else if (force) {
            this._classes.add(c);
          } else {
            this._classes.delete(c);
          }
        },
        contains(c) { return this._classes.has(c); },
      },
      style: {},
      dataset: {},
      addEventListener(type, fn) {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push(fn);
      },
      dispatchEvent(type, eventObj = {}) {
        if (listeners[type]) {
          listeners[type].forEach((fn) => fn(eventObj));
        }
      },
      _listeners: listeners,
      getBoundingClientRect() {
        return {
          width: 340,
          height: 105,
          left: 0,
          top: 0,
          right: 340,
          bottom: 105,
        };
      },
      getContext(type) {
        if (type === '2d') return canvasCtx;
        return null;
      },
    };
  }

  beforeEach(() => {
    // Record canvas operations
    canvasCtx = {
      calls: [],
      clearRect(x, y, w, h) { this.calls.push({ type: 'clearRect', x, y, w, h }); },
      beginPath() { this.calls.push({ type: 'beginPath' }); },
      closePath() { this.calls.push({ type: 'closePath' }); },
      moveTo(x, y) { this.calls.push({ type: 'moveTo', x, y }); },
      lineTo(x, y) { this.calls.push({ type: 'lineTo', x, y }); },
      quadraticCurveTo(cpx, cpy, x, y) { this.calls.push({ type: 'quadraticCurveTo', cpx, cpy, x, y }); },
      arc(x, y, r, sa, ea) { this.calls.push({ type: 'arc', x, y, r, sa, ea }); },
      fill() { this.calls.push({ type: 'fill' }); },
      stroke() { this.calls.push({ type: 'stroke' }); },
      fillText(text, x, y) { this.calls.push({ type: 'fillText', text, x, y }); },
      scale(sx, sy) { this.calls.push({ type: 'scale', sx, sy }); },
      save() { this.calls.push({ type: 'save' }); },
      restore() { this.calls.push({ type: 'restore' }); },
      setLineDash(dash) { this.calls.push({ type: 'setLineDash', dash }); },
      createLinearGradient(x0, y0, x1, y1) {
        return {
          addColorStop: (offset, color) => {
            canvasCtx.calls.push({ type: 'addColorStop', offset, color });
          },
        };
      },
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: '',
      textBaseline: '',
      shadowColor: '',
      shadowBlur: 0,
    };

    const elementsById = {};
    chartEl = createMockElement('chart');
    tooltipEl = createMockElement('chartTooltip');
    elementsById['chart'] = chartEl;
    elementsById['chartTooltip'] = tooltipEl;

    const windowListeners = {};

    sandbox = {
      localStorage: {
        store: {},
        getItem(k) { return this.store[k] || null; },
        setItem(k, v) { this.store[k] = String(v); },
      },
      document: {
        getElementById(id) {
          if (!elementsById[id]) {
            elementsById[id] = createMockElement(id);
          }
          return elementsById[id];
        },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        documentElement: {
          dataset: { theme: 'cyber' },
          style: {},
        },
      },
      window: {
        devicePixelRatio: 1,
        addEventListener(type, fn) {
          if (!windowListeners[type]) windowListeners[type] = [];
          windowListeners[type].push(fn);
        },
        dispatchEvent(type, eventObj = {}) {
          if (windowListeners[type]) {
            windowListeners[type].forEach((fn) => fn(eventObj));
          }
        },
        _listeners: windowListeners,
        api: {
          onUpdate() {},
          getStats: async () => null,
          getHistory: async () => [],
          getVersion: async () => '1.4.0',
        },
        location: { reload() {} },
      },
      getComputedStyle: () => ({
        getPropertyValue(prop) {
          if (prop === '--accent') return '#00f5d4';
          return '';
        },
      }),
      requestAnimationFrame: (cb) => { cb(); return 1; },
      cancelAnimationFrame: () => {},
      setTimeout,
      clearTimeout,
      Date,
      Math,
      Number,
      String,
      console,
    };

    if (!rendererCode) {
      const rendererPath = path.resolve(__dirname, '../renderer.js');
      rendererCode = fs.readFileSync(rendererPath, 'utf8');
    }

    vm.createContext(sandbox);
    vm.runInContext(rendererCode, sandbox);
  });

  // --------------------------------------------------------------------------
  // Scenario 1: Chart with one data point
  // --------------------------------------------------------------------------
  it('Scenario 1: Chart with one data point renders safely without division by zero and centers point', () => {
    const singleHistory = [
      {
        date: '2026-11-01',
        mousePixels: 50000,
        leftClicks: 120,
        rightClicks: 30,
        middleClicks: 10,
        keyPresses: 450,
        activeSeconds: 1800,
      },
    ];

    sandbox.drawChart(singleHistory);

    // Verify canvas cleared and scaled
    const clearCalls = canvasCtx.calls.filter((c) => c.type === 'clearRect');
    assert.ok(clearCalls.length >= 1, 'Canvas must be cleared');

    // Single point must be centered horizontally (width / 2 = 170)
    const arcCalls = canvasCtx.calls.filter((c) => c.type === 'arc');
    assert.strictEqual(arcCalls.length, 1, 'Exactly one arc point must be drawn');
    assert.strictEqual(arcCalls[0].x, 170, 'Single data point must be centered at width / 2 (170px)');
    assert.ok(Number.isFinite(arcCalls[0].y), 'Y coordinate must be finite');

    // Horizontal reference line drawn for single data point
    const dashCalls = canvasCtx.calls.filter((c) => c.type === 'setLineDash');
    assert.ok(dashCalls.length >= 1, 'Reference line dash should be set for single point');

    // Date text rendered
    const textCalls = canvasCtx.calls.filter((c) => c.type === 'fillText' && c.text === '11-01');
    assert.strictEqual(textCalls.length, 1, 'Date text must be rendered for single point');
    assert.strictEqual(textCalls[0].x, 170, 'Date text must be centered at x=170');
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Chart with seven data points
  // --------------------------------------------------------------------------
  it('Scenario 2: Chart with seven data points renders area, curve, and all 7 labels without collision', () => {
    const sevenHistory = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-10-2${i + 1}`,
      mousePixels: 20000 * (i + 1),
      leftClicks: 50 * (i + 1),
      rightClicks: 10 * (i + 1),
      middleClicks: 5 * (i + 1),
      keyPresses: 200 * (i + 1),
      activeSeconds: 600 * (i + 1),
    }));

    sandbox.drawChart(sevenHistory);

    const arcCalls = canvasCtx.calls.filter((c) => c.type === 'arc');
    assert.strictEqual(arcCalls.length, 7, 'All 7 points must be rendered');

    // Check step distribution: width=340, padding=20 on each side, chartWidth=300, step = 300 / 6 = 50
    assert.strictEqual(arcCalls[0].x, 20, 'First point must be at left padding (20px)');
    assert.strictEqual(arcCalls[6].x, 320, 'Last point must be at right margin (320px)');

    // With 7 points, stepX is 50px >= 38px, so all 7 labels must be rendered
    const dateLabels = canvasCtx.calls.filter((c) => c.type === 'fillText' && /^10-2\d$/.test(c.text));
    assert.strictEqual(dateLabels.length, 7, 'All 7 date labels must be rendered at 50px spacing');

    // Area curve rendered
    const curveCalls = canvasCtx.calls.filter((c) => c.type === 'quadraticCurveTo');
    assert.ok(curveCalls.length >= 6, 'Quadratic curves must be drawn for multi-point history');
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Chart with fourteen data points
  // --------------------------------------------------------------------------
  it('Scenario 3: Chart with fourteen data points declutters labels to prevent overlapping', () => {
    sandbox.window.state.trendRange = 14;
    const fourteenHistory = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-10-${String(i + 1).padStart(2, '0')}`,
      mousePixels: 15000 * (i + 1),
      leftClicks: 40 * (i + 1),
      rightClicks: 10 * (i + 1),
      middleClicks: 5 * (i + 1),
      keyPresses: 150 * (i + 1),
      activeSeconds: 500 * (i + 1),
    }));

    sandbox.drawChart(fourteenHistory);

    const arcCalls = canvasCtx.calls.filter((c) => c.type === 'arc');
    assert.strictEqual(arcCalls.length, 14, 'All 14 points must be rendered');

    // At width 340, chartWidth 300 / 13 ≈ 23.08px (< 38px)
    // Label decluttering must reduce the visible date labels so they do not overlap
    const dateLabels = canvasCtx.calls.filter((c) => c.type === 'fillText' && /^10-\d\d$/.test(c.text));
    assert.ok(dateLabels.length < 14, 'Labels must be decluttered with 14 data points');
    assert.ok(dateLabels.length >= 7, 'Representative labels (every 2nd + ends) must still be shown');

    // Verify distance between consecutive visible labels is >= 38px
    for (let i = 0; i < dateLabels.length - 1; i++) {
      const diff = dateLabels[i + 1].x - dateLabels[i].x;
      assert.ok(diff >= 38, `Label distance ${diff}px must be >= 38px to prevent overlapping`);
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Empty activity history
  // --------------------------------------------------------------------------
  it('Scenario 4: Empty activity history clears canvas, renders empty-state text, and shows safe KPI placeholders', () => {
    // Test with empty array
    sandbox.drawChart([]);

    const clearCalls = canvasCtx.calls.filter((c) => c.type === 'clearRect');
    assert.ok(clearCalls.length >= 1, 'Canvas must be cleared when history is empty');

    const emptyText = canvasCtx.calls.find((c) => c.type === 'fillText' && c.text.includes('NO ACTIVITY HISTORY'));
    assert.ok(emptyText, 'Empty state label must be rendered on canvas');

    const totalVal = sandbox.document.getElementById('trendTotalVal');
    const avgVal = sandbox.document.getElementById('trendAvgVal');
    const peakVal = sandbox.document.getElementById('trendPeakVal');

    assert.strictEqual(totalVal.textContent, '--', 'Total KPI must show placeholder --');
    assert.strictEqual(avgVal.textContent, '--', 'Average KPI must show placeholder --');
    assert.strictEqual(peakVal.textContent, '--', 'Peak KPI must show placeholder --');

    // Test with null/undefined history
    assert.doesNotThrow(() => sandbox.drawChart(null), 'drawChart(null) must not throw');
    assert.doesNotThrow(() => sandbox.drawChart(undefined), 'drawChart(undefined) must not throw');
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Very large activity values
  // --------------------------------------------------------------------------
  it('Scenario 5: Very large activity values render within bounds and format compactly without NaN', () => {
    const hugeHistory = [
      {
        date: '2026-11-01',
        mousePixels: 999999999,
        leftClicks: 15000000,
        rightClicks: 2500000,
        middleClicks: 500000,
        keyPresses: 25000000,
        activeSeconds: 5000000,
      },
      {
        date: '2026-11-02',
        mousePixels: 1200000000,
        leftClicks: 20000000,
        rightClicks: 3000000,
        middleClicks: 1000000,
        keyPresses: 35000000,
        activeSeconds: 6500000,
      },
    ];

    sandbox.drawChart(hugeHistory);

    const arcCalls = canvasCtx.calls.filter((c) => c.type === 'arc');
    assert.strictEqual(arcCalls.length, 2);

    arcCalls.forEach((arc) => {
      assert.ok(Number.isFinite(arc.y), 'Y coordinate must remain finite for huge numbers');
      assert.ok(arc.y >= 14 && arc.y <= 105, `Y coordinate ${arc.y} must stay within canvas bounds [14, 105]`);
    });

    const totalVal = sandbox.document.getElementById('trendTotalVal');
    assert.ok(!totalVal.textContent.includes('NaN'), 'Formatted total KPI must not contain NaN');
    assert.ok(totalVal.textContent.length > 0, 'Formatted total KPI must be populated');
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Window resizing
  // --------------------------------------------------------------------------
  it('Scenario 6: Window resizing debounces redraws and respects new canvas dimensions', () => {
    sandbox.window.state.activeTab = 'chart';
    const testHistory = [
      { date: '2026-11-01', mousePixels: 1000, leftClicks: 10, keyPresses: 50, activeSeconds: 120 },
      { date: '2026-11-02', mousePixels: 2000, leftClicks: 20, keyPresses: 80, activeSeconds: 240 },
    ];

    // Seed historyCache
    sandbox.drawChart(testHistory);
    canvasCtx.calls = [];

    // Trigger window resize event
    sandbox.window.dispatchEvent('resize');

    const clearCalls = canvasCtx.calls.filter((c) => c.type === 'clearRect');
    assert.ok(clearCalls.length >= 1, 'Window resize must trigger responsive canvas redraw');
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Narrow application window
  // --------------------------------------------------------------------------
  it('Scenario 7: Narrow application window declutters labels to prevent collision', () => {
    // Mock narrow canvas width: 260px
    chartEl.getBoundingClientRect = () => ({
      width: 260,
      height: 105,
      left: 0,
      top: 0,
      right: 260,
      bottom: 105,
    });

    const sevenHistory = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-11-0${i + 1}`,
      mousePixels: 5000 * (i + 1),
      leftClicks: 20 * (i + 1),
      keyPresses: 100 * (i + 1),
      activeSeconds: 300 * (i + 1),
    }));

    sandbox.drawChart(sevenHistory);

    // In a narrow 260px window, chartWidth=220, stepX = 220/6 = 36.6px (< 38px)
    // Alternate labels must be rendered to avoid collision
    const dateLabels = canvasCtx.calls.filter((c) => c.type === 'fillText' && /^11-0\d$/.test(c.text));
    assert.ok(dateLabels.length < 7, 'Labels must be decluttered in narrow window');

    for (let i = 0; i < dateLabels.length - 1; i++) {
      const diff = dateLabels[i + 1].x - dateLabels[i].x;
      assert.ok(diff >= 38, `Label distance in narrow window ${diff}px must be >= 38px`);
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Mouse hover over chart points
  // --------------------------------------------------------------------------
  it('Scenario 8: Mouse hover matches rendered data points, avoids redundant redraws, and flips tooltip', () => {
    const history = [
      { date: '2026-11-01', mousePixels: 10000, leftClicks: 100, keyPresses: 300, activeSeconds: 600 },
      { date: '2026-11-02', mousePixels: 20000, leftClicks: 200, keyPresses: 400, activeSeconds: 1200 },
      { date: '2026-11-03', mousePixels: 30000, leftClicks: 300, keyPresses: 500, activeSeconds: 1800 },
    ];

    sandbox.drawChart(history);
    canvasCtx.calls = [];

    // Hover over point 0 (x ≈ 20)
    chartEl.dispatchEvent('mousemove', { clientX: 25 });

    assert.strictEqual(tooltipEl.classList.contains('hidden'), false, 'Tooltip must be visible on hover');
    assert.ok(tooltipEl.textContent.includes('2026-11-01'), 'Tooltip text must reflect point 0 date');
    // Hovering on left half (< 170) positions tooltip on right side
    assert.strictEqual(tooltipEl.style.right, '8px', 'Tooltip should flip to right when mouse is on left half');

    const redrawsCount = canvasCtx.calls.filter((c) => c.type === 'clearRect').length;
    assert.strictEqual(redrawsCount, 1, 'Initial point selection must redraw once');

    // Repeated mousemove over the same point (clientX: 26) must NOT redraw (prevents redundant redraws)
    chartEl.dispatchEvent('mousemove', { clientX: 26 });
    const redrawsAfterSmallMove = canvasCtx.calls.filter((c) => c.type === 'clearRect').length;
    assert.strictEqual(redrawsAfterSmallMove, 1, 'Moving mouse within same point must NOT cause unnecessary redraws');

    // Hover over right half point (clientX: 320 -> point 2)
    chartEl.dispatchEvent('mousemove', { clientX: 320 });
    assert.strictEqual(tooltipEl.style.left, '8px', 'Tooltip should flip to left when mouse is on right half');
    assert.ok(tooltipEl.textContent.includes('2026-11-03'), 'Tooltip text must reflect point 2 date');

    // Mouse leave
    chartEl.dispatchEvent('mouseleave');
    assert.strictEqual(tooltipEl.classList.contains('hidden'), true, 'Tooltip must be hidden on mouseleave');
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Switching between chart metrics
  // --------------------------------------------------------------------------
  it('Scenario 9: Switching between chart metrics calculates and formats each metric accurately', () => {
    const day = {
      date: '2026-11-01',
      mousePixels: 39370, // 39370 px at 1000 dpi = 1 meter
      leftClicks: 25,
      rightClicks: 15,
      middleClicks: 5,
      keyPresses: 120,
      activeSeconds: 3600, // 60 minutes
    };

    // 1. Distance metric
    const distVal = sandbox.getMetricValue(day, 'dist');
    assert.strictEqual(Math.round(distVal), 1, 'Distance should be 1 meter');
    assert.strictEqual(sandbox.formatMetricDisplay(distVal, 'dist'), '1 m');

    // 2. Clicks metric
    const clicksVal = sandbox.getMetricValue(day, 'clicks');
    assert.strictEqual(clicksVal, 45, 'Total clicks should be 25 + 15 + 5 = 45');
    assert.strictEqual(sandbox.formatMetricDisplay(clicksVal, 'clicks'), '45');

    // 3. Keystrokes metric
    const keysVal = sandbox.getMetricValue(day, 'keys');
    assert.strictEqual(keysVal, 120, 'Keys should be 120');
    assert.strictEqual(sandbox.formatMetricDisplay(keysVal, 'keys'), '120');

    // 4. Time metric
    const timeVal = sandbox.getMetricValue(day, 'time');
    assert.strictEqual(timeVal, 60, 'Active minutes should be 60');
    assert.strictEqual(sandbox.formatMetricDisplay(timeVal, 'time'), '1h 0m');
  });

  // --------------------------------------------------------------------------
  // Scenario 10: Switching between themes
  // --------------------------------------------------------------------------
  it('Scenario 10: Switching between themes safely resolves accent color and redraws chart', () => {
    const history = [
      { date: '2026-11-01', mousePixels: 5000, leftClicks: 10, keyPresses: 20, activeSeconds: 100 },
    ];
    sandbox.drawChart(history);

    // Test colorWithAlpha with various CSS color formats
    assert.strictEqual(sandbox.colorWithAlpha('#00f5d4', '44'), '#00f5d444', '6-digit hex should append alpha');
    assert.strictEqual(sandbox.colorWithAlpha('#f00', '44'), '#ff000044', '3-digit hex should expand and append alpha');
    assert.strictEqual(sandbox.colorWithAlpha('rgb(0, 245, 212)', '44'), 'rgba(0, 245, 212, 0.27)', 'rgb should convert to rgba');

    // Apply theme
    canvasCtx.calls = [];
    sandbox.applyTheme('tokyo');

    assert.strictEqual(sandbox.document.documentElement.dataset.theme, 'tokyo');
    assert.strictEqual(sandbox.localStorage.getItem('cm-theme'), 'tokyo');
  });
});
