// ==========================================================================
// The Watcher — UI Controller & Telemetry Engine
// ==========================================================================

const state = {
  unit: localStorage.getItem('cm-unit') || 'm',
  dpi: 1000,
  running: true,
  activeTab: 'apps',
  appRange: 'today',
  trendMetric: 'dist',
  trendRange: 7,
  selectedDayIndex: null,
  theme: localStorage.getItem('cm-theme') || 'cyber',
  soundEnabled: localStorage.getItem('cm-sound') === 'true',
  isPinned: false,
  isCompact: false,
  instantSpeed: 0,
  peakSpeed: 0,
  apm: 0,
  currentApp: 'Ready',
  today: {
    mousePixels: 0,
    leftClicks: 0,
    rightClicks: 0,
    middleClicks: 0,
    keyPresses: 0,
    keys: {},
    activeSeconds: 0,
    idleSeconds: 0,
    totalSeconds: 0,
    appsList: [],
    peakSpeed: 0,
  },
};

if (typeof window !== 'undefined') {
  window.state = state;
}

let historyCache = [];
let appsCache = [];
let lastAppsFetchTime = 0;
let resetTimeout = null;
let toastTimeout = null;
let audioCtx = null;

// Treat persisted app/key labels as untrusted text before placing them in HTML.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>\"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;',
  })[char]);
}

// --------------------------------------------------------------------------
// Sound FX (Web Audio API Synthesizer)
// --------------------------------------------------------------------------
function playTone(freq, type = 'sine', duration = 0.04) {
  if (!state.soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch {
    // Ignore audio context errors
  }
}

// --------------------------------------------------------------------------
// Toast Notifications
// --------------------------------------------------------------------------
function showToast(message, icon = String.fromCodePoint(0x2713)) {
  const toast = document.getElementById('toast');
  const toastIcon = document.getElementById('toastIcon');
  const toastMsg = document.getElementById('toastMsg');
  if (!toast || !toastMsg) return;

  toastMsg.textContent = message;
  if (toastIcon) toastIcon.textContent = icon;
  toast.classList.remove('hidden');

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2400);
}

// --------------------------------------------------------------------------
// Milestone Progression Engine
// --------------------------------------------------------------------------
const MILESTONES = [
  { dist: 10, name: 'Bowling Lane (10m)', emoji: '🎳' },
  { dist: 25, name: 'Blue Whale (25m)', emoji: '🐋' },
  { dist: 50, name: 'Olympic Pool (50m)', emoji: '🏊' },
  { dist: 100, name: 'Football Pitch (100m)', emoji: '🏟️' },
  { dist: 250, name: 'Tower Climb (250m)', emoji: '🗼' },
  { dist: 500, name: 'Golden Gate Span (500m)', emoji: '🌉' },
  { dist: 1000, name: '1K Mark (1.0km)', emoji: '🎯' },
  { dist: 2000, name: 'Runway Sprint (2.0km)', emoji: '🏃' },
  { dist: 3500, name: 'Mountain Trail (3.5km)', emoji: '🏔️' },
  { dist: 5000, name: '5K Cursor Marathon (5.0km)', emoji: '🚀' },
];

function getMilestone(meters) {
  let prevDist = 0;
  for (let i = 0; i < MILESTONES.length; i++) {
    const m = MILESTONES[i];
    if (meters < m.dist) {
      const span = m.dist - prevDist;
      const progress = ((meters - prevDist) / span) * 100;
      const remainingMeters = m.dist - meters;
      const remainingText = remainingMeters >= 1000 
        ? `${(remainingMeters / 1000).toFixed(2)}km remaining`
        : `${Math.round(remainingMeters)}m remaining`;

      return {
        current: m,
        percent: Math.min(100, Math.max(0, progress)),
        text: `Goal: ${m.name}`,
        emoji: m.emoji,
        remainingText,
      };
    }
    prevDist = m.dist;
  }
  return {
    current: MILESTONES[MILESTONES.length - 1],
    percent: 100,
    text: 'Daily Marathon Conquered!',
    emoji: '👑',
    remainingText: 'All daily milestones achieved!',
  };
}

// --------------------------------------------------------------------------
// DOM Elements Cache
// --------------------------------------------------------------------------
const els = {
  // Navigation & Header
  versionBadge: document.getElementById('versionBadge') || document.querySelector('.brand-version-badge'),
  currentAppBadge: document.getElementById('currentAppBadge'),
  statusBadge: document.getElementById('statusBadge'),
  statusText: document.getElementById('statusText'),
  themeBtn: document.getElementById('themeBtn'),
  settingsBtn: document.getElementById('settingsBtn'),

  // Drawers
  themeDrawer: document.getElementById('themeDrawer'),
  closeThemeBtn: document.getElementById('closeThemeBtn'),
  themeCards: document.querySelectorAll('.theme-card'),

  settingsDrawer: document.getElementById('settingsDrawer'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  dpiInput: document.getElementById('dpiInput'),
  presetChips: document.querySelectorAll('.chip'),
  autoStartInput: document.getElementById('autoStartInput'),

  // Hero Odometer & Speedometer
  distance: document.getElementById('distance'),
  distanceUnit: document.getElementById('distanceUnit'),
  unitBtns: document.querySelectorAll('.unit-btn'),
  milestoneIcon: document.getElementById('milestoneIcon'),
  milestoneDesc: document.getElementById('milestoneDesc'),
  milestonePct: document.getElementById('milestonePct'),
  milestoneProgress: document.getElementById('milestoneProgress'),
  milestoneProgressBar: document.getElementById('milestoneProgressBar'),
  milestoneRemaining: document.getElementById('milestoneRemaining'),

  speedBox: document.getElementById('speedBox'),
  speedArc: document.getElementById('speedArc'),
  speedValue: document.getElementById('speedValue'),
  speedUnit: document.getElementById('speedUnit'),
  speedAlt: document.getElementById('speedAlt'),
  peakSpeed: document.getElementById('peakSpeed'),
  apmBadge: document.getElementById('apmBadge'),

  // 5 Glanceable Tiles
  activeTime: document.getElementById('activeTime'),
  totalTime: document.getElementById('totalTime'),
  idleTime: document.getElementById('idleTime'),
  idlePct: document.getElementById('idlePct'),
  clicks: document.getElementById('clicks'),
  clicksSub: document.getElementById('clicksSub'),
  keys: document.getElementById('keys'),
  wordsSub: document.getElementById('wordsSub'),

  // Intel Tabs & Panes
  intelTabBtns: document.querySelectorAll('.intel-tab-btn'),
  intelPanes: document.querySelectorAll('.intel-pane'),
  appsRangeBtns: document.querySelectorAll('.apps-range-btn'),
  appUsage: document.getElementById('appUsage'),
  topKeys: document.getElementById('topKeys'),

  // Mouse Map
  mouseLeftZone: document.getElementById('mouseLeftZone'),
  mouseRightZone: document.getElementById('mouseRightZone'),
  mouseMidZone: document.getElementById('mouseMidZone'),
  mouseLeftPct: document.getElementById('mouseLeftPct'),
  mouseRightPct: document.getElementById('mouseRightPct'),
  mouseLeftTotal: document.getElementById('mouseLeftTotal'),
  mouseRightTotal: document.getElementById('mouseRightTotal'),
  mouseMidTotal: document.getElementById('mouseMidTotal'),

  // Trend Controls & Chart
  trendMetricBtns: document.querySelectorAll('.trend-metric-btn'),
  trendRangeBtns: document.querySelectorAll('.trend-range-btn'),
  chart: document.getElementById('chart'),
  chartTooltip: document.getElementById('chartTooltip'),
  trendTotalVal: document.getElementById('trendTotalVal'),
  trendAvgVal: document.getElementById('trendAvgVal'),
  trendPeakVal: document.getElementById('trendPeakVal'),

  // Day Inspector
  detailDayTitle: document.getElementById('detailDayTitle'),
  detailDayBadge: document.getElementById('detailDayBadge'),
  detailDist: document.getElementById('detailDist'),
  detailClicks: document.getElementById('detailClicks'),
  detailKeys: document.getElementById('detailKeys'),
  detailTime: document.getElementById('detailTime'),
  detailApp: document.getElementById('detailApp'),

  // Footer Actions
  toggle: document.getElementById('toggle'),
  toggleText: document.getElementById('toggleText'),
  toggleIcon: document.getElementById('toggleIcon'),
  shareBtn: document.getElementById('shareBtn'),
  shareText: document.getElementById('shareText'),
  reset: document.getElementById('reset'),
  resetText: document.getElementById('resetText'),
};

// --------------------------------------------------------------------------
// Conversions & Math Helpers
// --------------------------------------------------------------------------
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function pixelsToDisplay(px, unit, dpi) {
  const safeDpi = dpi > 0 ? dpi : 1000;
  const meters = (px / safeDpi) * 0.0254;
  if (unit === 'km') return { value: meters / 1000, label: 'km', meters };
  if (unit === 'mi') return { value: meters / 1609.344, label: 'mi', meters };
  if (unit === 'px') return { value: px, label: 'px', meters };
  return { value: meters, label: 'm', meters };
}

// --------------------------------------------------------------------------
// Speed Conversions (m/s, km/h, px/s, mph)
// --------------------------------------------------------------------------
function formatSpeed(speedPxPerSec, speedUnit, dpi) {
  const safeDpi = dpi > 0 ? dpi : 1000;
  const mps = (speedPxPerSec / safeDpi) * 0.0254;
  const kmh = mps * 3.6;
  const mph = mps * 2.23694;

  if (speedUnit === 'km/h') {
    return {
      primaryValue: kmh >= 10 ? kmh.toFixed(1) : kmh.toFixed(2),
      primaryUnit: 'km/h',
      altText: `${mps.toFixed(2)} m/s`,
      peakText: `${kmh.toFixed(1)} km/h`,
    };
  }
  if (speedUnit === 'px/s') {
    return {
      primaryValue: Math.round(speedPxPerSec).toLocaleString(),
      primaryUnit: 'px/s',
      altText: `${mps.toFixed(2)} m/s · ${kmh.toFixed(1)} km/h`,
      peakText: `${Math.round(speedPxPerSec).toLocaleString()} px/s`,
    };
  }
  if (speedUnit === 'mph') {
    return {
      primaryValue: mph >= 10 ? mph.toFixed(1) : mph.toFixed(2),
      primaryUnit: 'mph',
      altText: `${kmh.toFixed(1)} km/h`,
      peakText: `${mph.toFixed(1)} mph`,
    };
  }
  // Default: m/s
  return {
    primaryValue: mps >= 10 ? mps.toFixed(1) : mps.toFixed(2),
    primaryUnit: 'm/s',
    altText: `${kmh.toFixed(1)} km/h`,
    peakText: `${mps.toFixed(2)} m/s`,
  };
}

// --------------------------------------------------------------------------
// Master UI Render
// --------------------------------------------------------------------------
function render() {
  // 1. Hero Odometer
  const { value, label, meters } = pixelsToDisplay(state.today.mousePixels || 0, state.unit, state.dpi);
  if (label === 'px') {
    els.distance.textContent = Math.round(value).toLocaleString();
  } else if (label === 'km' || label === 'mi') {
    els.distance.textContent = value >= 10 ? value.toFixed(2) : value.toFixed(3);
  } else {
    els.distance.textContent = value >= 100 ? value.toFixed(1) : value.toFixed(2);
  }
  els.distanceUnit.textContent = label;

  // 2. Milestone Engine
  const milestone = getMilestone(meters);
  els.milestoneIcon.textContent = milestone.emoji;
  els.milestoneDesc.textContent = milestone.text;
  els.milestonePct.textContent = `${Math.round(milestone.percent)}%`;
  els.milestoneProgress.style.width = `${milestone.percent}%`;
  if (els.milestoneProgressBar) {
    els.milestoneProgressBar.setAttribute('aria-valuenow', Math.round(milestone.percent));
    els.milestoneProgressBar.setAttribute('aria-valuetext', `${Math.round(milestone.percent)}% of ${milestone.text}`);
  }
  if (els.milestoneRemaining) {
    els.milestoneRemaining.textContent = milestone.remainingText;
  }

  // 3. Speedometer Arc & Speed Value (m/s, km/h, px/s)
  // SVG arc stroke-dasharray is 110. Max expected speed ~3500 px/s
  const speed = state.instantSpeed || 0;
  const maxArcSpeed = 3500;
  const clampedRatio = Math.min(speed / maxArcSpeed, 1);
  const arcOffset = 110 - (clampedRatio * 110);
  els.speedArc.style.strokeDashoffset = arcOffset.toFixed(1);

  const speedData = formatSpeed(speed, state.speedUnit, state.dpi);
  els.speedValue.textContent = speedData.primaryValue;
  els.speedUnit.textContent = speedData.primaryUnit;
  if (els.speedAlt) {
    els.speedAlt.textContent = speedData.altText;
  }

  const peak = Math.max(state.peakSpeed || 0, state.today.peakSpeed || 0);
  const peakData = formatSpeed(peak, state.speedUnit, state.dpi);
  els.peakSpeed.textContent = peakData.peakText;

  // APM Level
  const apm = state.apm || 0;
  els.apmBadge.textContent = `${apm} APM`;
  if (apm > 180) {
    els.apmBadge.className = 'apm-pill beast';
  } else if (apm > 100) {
    els.apmBadge.className = 'apm-pill hyper';
  } else if (apm > 40) {
    els.apmBadge.className = 'apm-pill focused';
  } else {
    els.apmBadge.className = 'apm-pill chill';
  }

  // 4. Five Glanceable Tiles
  els.activeTime.textContent = formatDuration(state.today.activeSeconds);
  const totalSecs = (state.today.activeSeconds || 0) + (state.today.idleSeconds || 0);
  els.totalTime.textContent = formatDuration(state.today.totalSeconds || totalSecs);

  els.idleTime.textContent = formatDuration(state.today.idleSeconds);
  const idlePercent = totalSecs > 0 ? Math.round(((state.today.idleSeconds || 0) / totalSecs) * 100) : 0;
  els.idlePct.textContent = `${idlePercent}% of today`;

  const left = state.today.leftClicks || 0;
  const right = state.today.rightClicks || 0;
  const mid = state.today.middleClicks || 0;
  const totalClicks = left + right + mid;
  els.clicks.textContent = totalClicks.toLocaleString();
  els.clicksSub.textContent = `L: ${left.toLocaleString()} \u00b7 R: ${right.toLocaleString()}`;

  const keys = state.today.keyPresses || 0;
  els.keys.textContent = keys.toLocaleString();
  const words = Math.round(keys / 5);
  els.wordsSub.textContent = `~${words.toLocaleString()} words`;

  // 5. Header State & Live Indicator
  if (state.running) {
    els.statusBadge.className = 'status-pill live';
    els.statusBadge.setAttribute('aria-label', 'System telemetry is active');
    els.statusText.textContent = 'LIVE';
    els.toggleText.textContent = 'Pause';
    els.toggle.setAttribute('aria-label', 'Pause tracking');
    els.toggle.setAttribute('aria-pressed', 'false');
    els.toggle.className = 'btn btn-action-primary';
    els.toggleIcon.innerHTML = `
      <rect x="6" y="4" width="4" height="16" rx="1"></rect>
      <rect x="14" y="4" width="4" height="16" rx="1"></rect>
    `;
  } else {
    els.statusBadge.className = 'status-pill paused';
    els.statusBadge.setAttribute('aria-label', 'System telemetry is paused');
    els.statusText.textContent = 'PAUSED';
    els.toggleText.textContent = 'Resume';
    els.toggle.setAttribute('aria-label', 'Resume tracking');
    els.toggle.setAttribute('aria-pressed', 'true');
    els.toggle.className = 'btn btn-action-primary paused-state';
    els.toggleIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
  }

  if (state.currentApp && state.currentApp !== 'Unknown') {
    els.currentAppBadge.textContent = state.currentApp;
  }

  // 6. Detailed Panes
  renderApps();
  renderKeys();
  renderMouseMap();
}

// --------------------------------------------------------------------------
// Panes: Top Apps & Top Keys
// --------------------------------------------------------------------------
async function loadAppsRange(range = 'today') {
  try {
    if (window.api && window.api.getApps) {
      appsCache = await window.api.getApps(range);
      lastAppsFetchTime = Date.now();
    }
  } catch (err) {
    console.error('Failed fetching apps for range:', err);
  }
}

function renderApps() {
  try {
    // Always use DB-loaded today data (appsCache) so we get the full day,
    // not just the current runtime session's in-memory appsList.
    const apps = (appsCache && appsCache.length ? appsCache : (state.today.appsList || [])).slice(0, 8);
    if (!apps.length) {
      if (els.appUsage) els.appUsage.innerHTML = `<li class="empty-state">No app activity recorded yet today</li>`;
      return;
    }
    const maxSecs = Math.max(...apps.map((a) => {
      const value = Number(a.seconds);
      return Number.isFinite(value) && value > 0 ? value : 0;
    }), 1);
    if (els.appUsage) {
      els.appUsage.innerHTML = apps
        .map((a) => {
          const rawName = String(a.name || a.key || 'App');
          const name = escapeHtml(rawName);
          const secondsValue = Number(a.seconds);
          const secs = Number.isFinite(secondsValue) && secondsValue > 0 ? secondsValue : 0;
          const pct = Math.min(100, Math.round((secs / maxSecs) * 100));
          const initial = name.charAt(0).toUpperCase();
          const isCurrent = state.currentApp && state.currentApp.toLowerCase() === rawName.toLowerCase();
          return `
            <li class="visual-item">
              <div class="item-fill" data-pct="${pct}"></div>
              <div class="item-front">
                <span class="item-tag">${initial}</span>
                <span class="item-text" title="${escapeHtml(a.key || name)}">${name}</span>
                ${isCurrent ? '<span class="item-current-tag">ACTIVE</span>' : ''}
              </div>
              <span class="item-score">${formatDuration(secs)}</span>
            </li>
          `;
        })
        .join('');

      // Apply dynamic width via CSSOM rather than inline style attribute
      els.topApps.querySelectorAll('.item-fill').forEach((el) => {
        el.style.width = `${el.dataset.pct}%`;
      });
    }
  } catch (err) {
    console.error('renderApps error:', err);
  }
}

function renderKeys() {
  try {
    const top = Object.entries(state.today.keys || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    if (!top.length) {
      if (els.topKeys) els.topKeys.innerHTML = '<li class="empty-state">No keystrokes recorded yet today</li>';
      return;
    }

    const maxCount = Math.max(...top.map((k) => k[1]), 1);
    if (els.topKeys) {
      els.topKeys.innerHTML = top
        .map(([key, count]) => {
          const safeKey = escapeHtml(key);
          const safeCount = Math.max(0, Number(count) || 0);
          const pct = Math.min(100, Math.round((count / maxCount) * 100));
          return `
            <li class="visual-item">
              <div class="item-fill" data-pct="${pct}"></div>
              <div class="item-front">
                <span class="keycap-badge">${safeKey}</span>
                <span class="item-text">${safeKey} key</span>
              </div>
              <span class="item-score">${safeCount.toLocaleString()}</span>
            </li>
          `;
        })
        .join('');

      // Apply dynamic width via CSSOM rather than inline style attribute
      els.topKeys.querySelectorAll('.item-fill').forEach((el) => {
        el.style.width = `${el.dataset.pct}%`;
      });
    }
  } catch (err) {
    console.error('renderKeys error:', err);
  }
}

function renderMouseMap() {
  const left = state.today.leftClicks || 0;
  const right = state.today.rightClicks || 0;
  const mid = state.today.middleClicks || 0;
  const total = left + right;

  const leftPct = total > 0 ? Math.round((left / total) * 100) : 50;
  const rightPct = total > 0 ? 100 - leftPct : 50;

  els.mouseLeftPct.textContent = `${leftPct}%`;
  els.mouseRightPct.textContent = `${rightPct}%`;
  els.mouseLeftTotal.textContent = left.toLocaleString();
  els.mouseRightTotal.textContent = right.toLocaleString();
  els.mouseMidTotal.textContent = mid.toLocaleString();
}

// --------------------------------------------------------------------------
// Multi-Metric Canvas Chart & Day Inspector
// --------------------------------------------------------------------------
function getMetricValue(day, metric) {
  if (!day) return 0;
  let val = 0;
  if (metric === 'clicks') {
    val = (Number(day.leftClicks) || 0) + (Number(day.rightClicks) || 0) + (Number(day.middleClicks) || 0);
  } else if (metric === 'keys') {
    val = Number(day.keyPresses) || 0;
  } else if (metric === 'time') {
    val = Math.round((Number(day.activeSeconds) || 0) / 60); // minutes
  } else {
    // Default: distance in meters
    const dpi = (typeof state !== 'undefined' && state.dpi > 0) ? state.dpi : 1000;
    val = pixelsToDisplay(Number(day.mousePixels) || 0, 'm', dpi).value;
  }
  return Number.isFinite(val) && val >= 0 ? val : 0;
}

function formatMetricDisplay(val, metric) {
  const num = Number(val);
  const safeVal = Number.isFinite(num) && num >= 0 ? num : 0;

  if (metric === 'dist') {
    if (safeVal >= 1000000) return `${(safeVal / 1000000).toFixed(2)}M m`;
    if (safeVal >= 1000) return `${(safeVal / 1000).toFixed(2)} km`;
    return `${safeVal.toFixed(0)} m`;
  }
  if (metric === 'time') {
    return formatDuration(safeVal * 60);
  }
  if (metric === 'clicks' || metric === 'keys') {
    if (safeVal >= 10000000) return `${(safeVal / 1000000).toFixed(1)}M`;
    return Math.round(safeVal).toLocaleString();
  }
  return Math.round(safeVal).toLocaleString();
}

function colorWithAlpha(color, alphaHex = '44') {
  if (!color || typeof color !== 'string') return '#00f5d4' + alphaHex;
  const c = color.trim();
  if (c.startsWith('#')) {
    if (c.length === 7) return c + alphaHex;
    if (c.length === 4) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}${alphaHex}`;
    if (c.length === 9) return c.slice(0, 7) + alphaHex;
  }
  if (c.startsWith('rgb(')) {
    return c.replace('rgb(', 'rgba(').replace(')', ', 0.27)');
  }
  if (c.startsWith('rgba(')) {
    return c;
  }
  return c;
}

function renderChartEmptyState(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);

  // Subtle dotted reference line
  ctx.save();
  ctx.beginPath();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.moveTo(16, height / 2);
  ctx.lineTo(width - 16, height / 2);
  ctx.stroke();

  // Clean empty state label
  ctx.fillStyle = '#64748b';
  ctx.font = '600 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NO ACTIVITY HISTORY RECORDED YET', width / 2, height / 2 - 8);

  ctx.font = '400 9px "Inter", sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText('Activity trends will populate as data is recorded', width / 2, height / 2 + 8);
  ctx.restore();

  if (els.trendTotalVal) els.trendTotalVal.textContent = '--';
  if (els.trendAvgVal) els.trendAvgVal.textContent = '--';
  if (els.trendPeakVal) els.trendPeakVal.textContent = '--';
  if (els.chartTooltip) els.chartTooltip.classList.add('hidden');
  updateDayInspector(null);
}

function drawChart(history) {
  if (Array.isArray(history)) {
    historyCache = history;
  }
  const canvas = els.chart;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(rect.width || 340, 50);
  const height = Math.max(rect.height || 105, 50);

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  if (!history || !history.length) {
    renderChartEmptyState(ctx, width, height);
    return;
  }

  const displayList = history.slice(-state.trendRange);
  if (!displayList.length) {
    renderChartEmptyState(ctx, width, height);
    return;
  }

  const values = displayList.map((d) => getMetricValue(d, state.trendMetric));
  const rawMax = Math.max(...values, 0);
  const maxVal = rawMax > 0 ? rawMax : 1;
  const paddingBottom = 22;
  const paddingTop = 14;
  const paddingLeft = 20;
  const paddingRight = 20;
  const chartWidth = Math.max(width - paddingLeft - paddingRight, 10);
  const chartHeight = Math.max(height - paddingBottom - paddingTop, 10);

  // Calculate KPIs
  let totalMetric = 0;
  let peakVal = 0;
  let peakDay = displayList[0];
  displayList.forEach((d, i) => {
    const v = values[i];
    totalMetric += v;
    if (v >= peakVal) {
      peakVal = v;
      peakDay = d;
    }
  });

  const avgVal = totalMetric / displayList.length;
  if (els.trendTotalVal) els.trendTotalVal.textContent = formatMetricDisplay(totalMetric, state.trendMetric);
  if (els.trendAvgVal) els.trendAvgVal.textContent = formatMetricDisplay(avgVal, state.trendMetric);
  if (els.trendPeakVal) els.trendPeakVal.textContent = formatMetricDisplay(peakVal, state.trendMetric);

  const isSingle = displayList.length === 1;
  const stepX = isSingle ? 0 : chartWidth / (displayList.length - 1);

  // Compute point coordinates
  const points = displayList.map((d, i) => {
    const x = isSingle ? width / 2 : paddingLeft + i * stepX;
    const ratio = rawMax > 0 ? (values[i] / maxVal) : 0;
    const y = paddingTop + chartHeight - ratio * chartHeight;
    return {
      x,
      y,
      day: d,
      val: values[i],
      isToday: i === displayList.length - 1
    };
  });

  // Draw Gridlines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  [0, 0.5, 1].forEach((ratio) => {
    const lineY = paddingTop + chartHeight * ratio;
    ctx.beginPath();
    ctx.moveTo(paddingLeft - 4, lineY);
    ctx.lineTo(width - paddingRight + 4, lineY);
    ctx.stroke();
  });

  const accentColor = (getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()) || '#00f5d4';

  if (points.length > 1) {
    // Area Fill under curve
    ctx.beginPath();
    ctx.moveTo(points[0].x, paddingTop + chartHeight);
    ctx.lineTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const midX = (p0.x + p1.x) / 2;
      const midY = (p0.y + p1.y) / 2;
      ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
    }
    const lastP = points[points.length - 1];
    ctx.lineTo(lastP.x, lastP.y);
    ctx.lineTo(lastP.x, paddingTop + chartHeight);
    ctx.closePath();

    const areaGrad = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + chartHeight);
    areaGrad.addColorStop(0, colorWithAlpha(accentColor, '33'));
    areaGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = areaGrad;
    ctx.fill();

    // Curved Line Stroke
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const midX = (p0.x + p1.x) / 2;
      const midY = (p0.y + p1.y) / 2;
      ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
    }
    ctx.lineTo(lastP.x, lastP.y);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
  } else {
    // Single data point: subtle horizontal reference guideline at point level
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = colorWithAlpha(accentColor, '44');
    ctx.lineWidth = 1;
    ctx.moveTo(paddingLeft, points[0].y);
    ctx.lineTo(width - paddingRight, points[0].y);
    ctx.stroke();
    ctx.restore();
  }

  // Draw points & date labels
  points.forEach((p, idx) => {
    const isSelected = state.selectedDayIndex === idx || (state.selectedDayIndex === null && p.isToday);

    // Circle point
    ctx.beginPath();
    ctx.arc(p.x, p.y, isSelected ? 4.5 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? '#ffffff' : accentColor;
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = isSelected ? 10 : 4;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Date label decluttering: prevent overlapping when stepX is narrow
    let showLabel = true;
    if (!isSingle) {
      const isLast = idx === points.length - 1;
      if (stepX < 20) {
        // Very tight: show every 3rd, avoiding collision with last point
        showLabel = isSelected || isLast || (idx % 3 === 0 && idx < points.length - 2);
      } else if (stepX < 38) {
        // Tight (e.g. 14 points): show every 2nd, avoiding collision with last point
        showLabel = isSelected || isLast || (idx % 2 === 0 && idx < points.length - 2);
      }
    }

    if (showLabel) {
      const dateStr = p.day.date ? p.day.date.slice(5) : (p.isToday ? 'Today' : '');
      if (dateStr) {
        ctx.fillStyle = isSelected ? '#ffffff' : '#64748b';
        ctx.font = isSelected ? '700 9px "JetBrains Mono", monospace' : '500 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(dateStr, p.x, height - 6);
      }
    }
  });

  // Update Day Inspector with selected or current day
  const activeDay = (state.selectedDayIndex !== null && displayList[state.selectedDayIndex])
    ? displayList[state.selectedDayIndex]
    : displayList[displayList.length - 1];

  updateDayInspector(activeDay);
}

function updateDayInspector(day) {
  if (!day) {
    if (els.detailDayTitle) els.detailDayTitle.textContent = "Today's Live Record";
    if (els.detailDayBadge) {
      els.detailDayBadge.textContent = 'LIVE';
      els.detailDayBadge.className = 'trend-badge';
    }
    if (els.detailDist) els.detailDist.textContent = '0 m';
    if (els.detailClicks) els.detailClicks.textContent = '0';
    if (els.detailKeys) els.detailKeys.textContent = '0';
    if (els.detailTime) els.detailTime.textContent = '0s';
    if (els.detailApp) els.detailApp.textContent = 'None';
    return;
  }

  const now = new Date();
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isToday = !day.date || day.date === localToday;
  if (els.detailDayTitle) els.detailDayTitle.textContent = isToday ? "Today's Live Record" : `${day.date} Record`;
  if (els.detailDayBadge) {
    els.detailDayBadge.textContent = isToday ? 'LIVE' : 'ARCHIVE';
    els.detailDayBadge.className = isToday ? 'trend-badge' : 'trend-badge archived';
  }

  const m = pixelsToDisplay(Number(day.mousePixels) || 0, 'm', state.dpi).meters;
  if (els.detailDist) els.detailDist.textContent = m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(0)} m`;

  const totalClicks = (Number(day.leftClicks) || 0) + (Number(day.rightClicks) || 0) + (Number(day.middleClicks) || 0);
  if (els.detailClicks) els.detailClicks.textContent = totalClicks >= 10000000 ? `${(totalClicks / 1000000).toFixed(1)}M` : totalClicks.toLocaleString();

  const keyPresses = Number(day.keyPresses) || 0;
  if (els.detailKeys) els.detailKeys.textContent = keyPresses >= 10000000 ? `${(keyPresses / 1000000).toFixed(1)}M` : keyPresses.toLocaleString();

  if (els.detailTime) els.detailTime.textContent = formatDuration(Number(day.activeSeconds) || 0);

  // Top app
  let topAppName = 'None';
  if (day.appsList && day.appsList.length) {
    topAppName = day.appsList[0].name || 'None';
  } else if (day.apps && typeof day.apps === 'object') {
    const sorted = Object.entries(day.apps).sort((a, b) => (b[1] || 0) - (a[1] || 0));
    if (sorted.length) topAppName = sorted[0][0];
  }
  if (els.detailApp) els.detailApp.textContent = topAppName;
}

async function loadHistory() {
  try {
    historyCache = await window.api.getHistory(14);
    if (state.activeTab === 'chart') {
      drawChart(historyCache);
    }
  } catch (err) {
    console.error('History fetch error:', err);
  }
}

// --------------------------------------------------------------------------
// Share / Copy Daily Report
// --------------------------------------------------------------------------
async function shareDailyStats() {
  playTone(840, 'triangle', 0.06);
  const { value, label, meters } = pixelsToDisplay(state.today.mousePixels || 0, state.unit, state.dpi);
  const milestone = getMilestone(meters);
  const totalClicks = (state.today.leftClicks || 0) + (state.today.rightClicks || 0) + (state.today.middleClicks || 0);

const peakData = formatSpeed(state.peakSpeed || 0, state.speedUnit, state.dpi);
  const report = [
    "[The Watcher] Daily Telemetry Report",
    `Distance : ${value.toFixed(1)} ${label} (${milestone.emoji} ${milestone.text})`,
    `Clicks   : ${totalClicks.toLocaleString()} (Left: ${state.today.leftClicks || 0} / Right: ${state.today.rightClicks || 0})`,
    `Keys     : ${(state.today.keyPresses || 0).toLocaleString()} (~${Math.round((state.today.keyPresses || 0) / 5)} words)`,
    `Peak Spd : ${peakData.peakText} | ${state.apm || 0} APM`,
    `Active   : ${formatDuration(state.today.activeSeconds)} | App: ${state.currentApp || 'Desktop'}`,
  ].join('\n');

  try {
    if (window.api.copyToClipboard) {
      window.api.copyToClipboard(report);
    } else {
      await navigator.clipboard.writeText(report);
    }
    showToast('Telemetry copied to clipboard!');
    els.shareText.textContent = 'Copied!';
    setTimeout(() => {
      els.shareText.textContent = 'Share';
    }, 2000);
  } catch {
    showToast('Failed to copy report');
  }
}

// --------------------------------------------------------------------------
// Visual Theme Switcher
// --------------------------------------------------------------------------
function applyTheme(name) {
  state.theme = name;
  document.documentElement.dataset.theme = name;
  localStorage.setItem('cm-theme', name);
  els.themeCards.forEach((c) => {
    const isActive = c.dataset.themeName === name;
    c.classList.toggle('active', isActive);
    c.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  if (state.activeTab === 'chart') {
    drawChart(historyCache);
  }
  showToast('Theme: ' + name.charAt(0).toUpperCase() + name.slice(1));
}

// --------------------------------------------------------------------------
// Event Listeners Setup
// --------------------------------------------------------------------------

// 1. IPC stats update from Electron main process
window.api.onUpdate((payload) => {
  state.today = payload.today;
  state.running = payload.running;
  state.dpi = payload.dpi;
  state.instantSpeed = payload.instantSpeed || 0;
  state.peakSpeed = payload.peakSpeed || 0;
  state.apm = payload.apm || 0;
  if (payload.currentApp) state.currentApp = payload.currentApp;
  if (payload.version && els.versionBadge) els.versionBadge.textContent = `v${payload.version}`;

  // Refresh apps cache from DB every 10s so today's data stays fresh
  if (Date.now() - lastAppsFetchTime > 10000) {
    loadAppsRange('today').then(() => renderApps());
  }

  render();

  if (historyCache.length) {
    const last = historyCache[historyCache.length - 1];
    historyCache[historyCache.length - 1] = { ...last, ...state.today };
    if (state.activeTab === 'chart') {
      drawChart(historyCache);
    }
  }
});

// Speed Dial click or keyboard activation: cycle speed units (m/s -> km/h -> px/s)
if (els.speedBox) {
  const cycleSpeed = () => {
    playTone(680, 'sine', 0.03);
    const units = ['m/s', 'km/h', 'px/s'];
    const nextIdx = (units.indexOf(state.speedUnit) + 1) % units.length;
    state.speedUnit = units[nextIdx];
    localStorage.setItem('cm-speed-unit', state.speedUnit);
    render();
    showToast('Speed Unit: ' + state.speedUnit);
  };
  els.speedBox.addEventListener('click', cycleSpeed);
  els.speedBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      cycleSpeed();
    }
  });
}

// 2. Unit buttons
els.unitBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    playTone(600, 'sine', 0.03);
    els.unitBtns.forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    state.unit = btn.dataset.unit;
    if (state.unit === 'm') state.speedUnit = 'm/s';
    else if (state.unit === 'km') state.speedUnit = 'km/h';
    else if (state.unit === 'px') state.speedUnit = 'px/s';
    else if (state.unit === 'mi') state.speedUnit = 'mph';
    localStorage.setItem('cm-unit', state.unit);
    localStorage.setItem('cm-speed-unit', state.speedUnit);
    render();
    if (historyCache.length) drawChart(historyCache);
  });
});

// 3. Tab navigation
els.intelTabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    playTone(520, 'sine', 0.03);
    const tabName = btn.dataset.tab;
    state.activeTab = tabName;

    els.intelTabBtns.forEach((b) => {
      const isActive = b === btn;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    els.intelPanes.forEach((p) => {
      const isPaneActive = p.id === `tab-${tabName}`;
      p.classList.toggle('active', isPaneActive);
      p.setAttribute('aria-hidden', isPaneActive ? 'false' : 'true');
    });

    if (tabName === 'chart') {
      requestAnimationFrame(() => drawChart(historyCache));
    }
  });
});

// 3b. Apps Range buttons removed (today-only view; historical data in Trends tab)
// els.appsRangeBtns is now empty so this loop is a no-op kept for safety
els.appsRangeBtns.forEach((btn) => {
  btn.addEventListener('click', async () => {
    // no-op — range switching removed
  });
});

// 7. Theme Drawer & Focus Management
function openThemeDrawer() {
  els.themeDrawer.classList.remove('hidden');
  els.themeDrawer.setAttribute('aria-hidden', 'false');
  els.themeBtn.setAttribute('aria-expanded', 'true');
  closeSettingsDrawer(false);
  playTone(600, 'sine', 0.03);
  const activeCard = Array.from(els.themeCards).find((c) => c.classList.contains('active')) || els.themeCards[0];
  if (activeCard) activeCard.focus();
}

function closeThemeDrawer(returnFocus = true) {
  if (els.themeDrawer.classList.contains('hidden')) return;
  els.themeDrawer.classList.add('hidden');
  els.themeDrawer.setAttribute('aria-hidden', 'true');
  els.themeBtn.setAttribute('aria-expanded', 'false');
  if (returnFocus && els.themeBtn) els.themeBtn.focus();
}

els.themeBtn.addEventListener('click', () => {
  if (els.themeDrawer.classList.contains('hidden')) {
    openThemeDrawer();
  } else {
    closeThemeDrawer(false);
  }
});
els.closeThemeBtn.addEventListener('click', () => closeThemeDrawer(true));
els.themeCards.forEach((card) => {
  card.addEventListener('click', () => {
    applyTheme(card.dataset.themeName);
    playTone(650, 'sine', 0.04);
  });
});

// 8. Settings & Hardware DPI & Focus Management
function openSettingsDrawer() {
  els.settingsDrawer.classList.remove('hidden');
  els.settingsDrawer.setAttribute('aria-hidden', 'false');
  els.settingsBtn.setAttribute('aria-expanded', 'true');
  closeThemeDrawer(false);
  playTone(600, 'sine', 0.03);
  if (els.dpiInput) els.dpiInput.focus();
  if (window.api.getAutoStart) {
    window.api.getAutoStart().then((isAuto) => {
      els.autoStartInput.checked = Boolean(isAuto);
    });
  }
}

function closeSettingsDrawer(returnFocus = true) {
  if (els.settingsDrawer.classList.contains('hidden')) return;
  els.settingsDrawer.classList.add('hidden');
  els.settingsDrawer.setAttribute('aria-hidden', 'true');
  els.settingsBtn.setAttribute('aria-expanded', 'false');
  if (returnFocus && els.settingsBtn) els.settingsBtn.focus();
}

els.settingsBtn.addEventListener('click', () => {
  if (els.settingsDrawer.classList.contains('hidden')) {
    openSettingsDrawer();
  } else {
    closeSettingsDrawer(false);
  }
});
els.closeSettingsBtn.addEventListener('click', () => closeSettingsDrawer(true));

els.presetChips.forEach((chip) => {
  chip.addEventListener('click', async () => {
    const val = Number(chip.dataset.dpi);
    els.dpiInput.value = val;
    state.dpi = await window.api.setDpi(val);
    els.presetChips.forEach((c) => {
      const isActive = c === chip;
      c.classList.toggle('active', isActive);
      c.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    render();
    if (historyCache.length) drawChart(historyCache);
    playTone(600, 'sine', 0.03);
    showToast('Sensor calibrated: ' + val + ' DPI');
  });
});

els.dpiInput.addEventListener('change', async (e) => {
  const val = Number(e.target.value);
  if (val > 0) {
    state.dpi = await window.api.setDpi(val);
    els.presetChips.forEach((c) => {
      const isActive = Number(c.dataset.dpi) === val;
      c.classList.toggle('active', isActive);
      c.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    render();
    if (historyCache.length) drawChart(historyCache);
    showToast('Sensor calibrated: ' + val + ' DPI');
  }
});

els.autoStartInput.addEventListener('change', async (e) => {
  if (window.api.setAutoStart) {
    const enabled = await window.api.setAutoStart(e.target.checked);
    showToast(enabled ? 'Auto-start enabled' : 'Auto-start disabled');
  }
});

// 9. Trend Chart Metrics & Range Toggles
els.trendMetricBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    playTone(560, 'sine', 0.03);
    els.trendMetricBtns.forEach((b) => {
      const isActive = b === btn;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    state.trendMetric = btn.dataset.metric;
    state.selectedDayIndex = null;
    drawChart(historyCache);
  });
});

els.trendRangeBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    playTone(560, 'sine', 0.03);
    els.trendRangeBtns.forEach((b) => {
      const isActive = b === btn;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    state.trendRange = Number(btn.dataset.range);
    state.selectedDayIndex = null;
    drawChart(historyCache);
  });
});

// Interactive Chart Hover & Click
els.chart.addEventListener('mousemove', (e) => {
  if (!historyCache || !historyCache.length) return;
  const rect = els.chart.getBoundingClientRect();
  if (rect.width <= 0) return;

  const mouseX = e.clientX - rect.left;
  const displayList = historyCache.slice(-state.trendRange);
  if (!displayList.length) return;

  let index = 0;
  if (displayList.length > 1) {
    const paddingLeft = 20;
    const paddingRight = 20;
    const chartWidth = Math.max(rect.width - paddingLeft - paddingRight, 10);
    const stepX = chartWidth / (displayList.length - 1);
    const rawIdx = Math.round((mouseX - paddingLeft) / stepX);
    index = Math.max(0, Math.min(rawIdx, displayList.length - 1));
  }

  // Only redraw if the selected day index actually changed (avoid unnecessary redraws)
  if (state.selectedDayIndex !== index) {
    state.selectedDayIndex = index;
    drawChart(historyCache);
  }

  const day = displayList[index];
  const val = getMetricValue(day, state.trendMetric);
  els.chartTooltip.textContent = `${day.date || 'Today'}: ${formatMetricDisplay(val, state.trendMetric)}`;

  // Position tooltip on opposite side so it never covers the hovered point or cursor
  if (mouseX < rect.width / 2) {
    els.chartTooltip.style.left = 'auto';
    els.chartTooltip.style.right = '8px';
  } else {
    els.chartTooltip.style.right = 'auto';
    els.chartTooltip.style.left = '8px';
  }
  els.chartTooltip.classList.remove('hidden');
});

els.chart.addEventListener('mouseleave', () => {
  els.chartTooltip.classList.add('hidden');
  if (state.selectedDayIndex !== null) {
    state.selectedDayIndex = null;
    drawChart(historyCache);
  }
});

// 10. Mouse Silhouette Interactive Zones
els.mouseLeftZone.addEventListener('mousedown', () => {
  els.mouseLeftZone.classList.add('active-click');
  playTone(800, 'sine', 0.03);
});
els.mouseLeftZone.addEventListener('mouseup', () => {
  els.mouseLeftZone.classList.remove('active-click');
});
els.mouseRightZone.addEventListener('mousedown', () => {
  els.mouseRightZone.classList.add('active-click');
  playTone(600, 'sine', 0.03);
});
els.mouseRightZone.addEventListener('mouseup', () => {
  els.mouseRightZone.classList.remove('active-click');
});

// 11. Pause / Resume Tracking
els.toggle.addEventListener('click', async () => {
  playTone(500, 'square', 0.05);
  state.running = await window.api.toggleRunning();
  render();
  showToast(state.running ? 'Tracking Resumed' : 'Tracking Paused');
});

// 12. Share Stats
els.shareBtn.addEventListener('click', shareDailyStats);

// 13. Safe 2-Step Reset
els.reset.addEventListener('click', async () => {
  if (els.reset.classList.contains('confirm-state')) {
    playTone(380, 'sawtooth', 0.08);
    clearTimeout(resetTimeout);
    els.reset.classList.remove('confirm-state');
    els.resetText.textContent = 'Reset';
    els.reset.setAttribute('aria-label', 'Reset today\'s statistics');

    state.today = await window.api.resetToday();
    render();
    await loadHistory();
    showToast('Stats have been reset');
  } else {
    playTone(600, 'sine', 0.04);
    els.reset.classList.add('confirm-state');
    els.resetText.textContent = 'Sure?';
    els.reset.setAttribute('aria-label', 'Confirm reset: Click again to reset today\'s statistics');
    resetTimeout = setTimeout(() => {
      els.reset.classList.remove('confirm-state');
      els.resetText.textContent = 'Reset';
      els.reset.setAttribute('aria-label', 'Reset today\'s statistics');
    }, 3200);
  }
});

// 14. Keyboard Shortcuts & Window Resize
window.addEventListener('keydown', (e) => {
  if (e.key === 'F5' || (e.ctrlKey && e.key.toLowerCase() === 'r')) {
    window.location.reload();
    return;
  }
  if (e.key === 'Escape') {
    let handled = false;
    if (!els.themeDrawer.classList.contains('hidden')) {
      closeThemeDrawer(true);
      handled = true;
    }
    if (!els.settingsDrawer.classList.contains('hidden')) {
      closeSettingsDrawer(true);
      handled = true;
    }
    if (els.reset.classList.contains('confirm-state')) {
      clearTimeout(resetTimeout);
      els.reset.classList.remove('confirm-state');
      els.resetText.textContent = 'Reset';
      els.reset.setAttribute('aria-label', 'Reset today\'s statistics');
      handled = true;
    }
    if (handled) playTone(440, 'sine', 0.02);
  }
});

let chartResizeTimer = null;
window.addEventListener('resize', () => {
  if (state.activeTab === 'chart') {
    if (chartResizeTimer) cancelAnimationFrame(chartResizeTimer);
    chartResizeTimer = requestAnimationFrame(() => {
      drawChart(historyCache);
    });
  }
});

// --------------------------------------------------------------------------
// Initialization
// --------------------------------------------------------------------------
applyTheme(state.theme);

// Preset unit and range buttons with accessible ARIA states
els.unitBtns.forEach((b) => {
  const isActive = b.dataset.unit === state.unit;
  b.classList.toggle('active', isActive);
  b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
});
els.intelTabBtns.forEach((b) => {
  const isActive = b.dataset.tab === state.activeTab;
  b.classList.toggle('active', isActive);
  b.setAttribute('aria-selected', isActive ? 'true' : 'false');
});
els.intelPanes.forEach((p) => {
  const isActive = p.id === `tab-${state.activeTab}`;
  p.classList.toggle('active', isActive);
  p.setAttribute('aria-hidden', isActive ? 'false' : 'true');
});
els.trendMetricBtns.forEach((b) => {
  const isActive = b.dataset.metric === state.trendMetric;
  b.classList.toggle('active', isActive);
  b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
});
els.trendRangeBtns.forEach((b) => {
  const isActive = Number(b.dataset.range) === state.trendRange;
  b.classList.toggle('active', isActive);
  b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
});

// Render immediately with baseline data so there is zero latency/blank state
render();

// Single source of truth: synchronize brand version badge from package metadata
if (window.api && typeof window.api.getVersion === 'function' && els.versionBadge) {
  window.api.getVersion().then((v) => {
    if (v) els.versionBadge.textContent = `v${v}`;
  }).catch(() => {});
}

// Initial data fetch
(async () => {
  try {
    const initialStats = await window.api.getStats();
    if (initialStats) {
      state.today = initialStats.today;
      state.running = initialStats.running;
      state.dpi = initialStats.dpi;
      els.dpiInput.value = state.dpi;
      els.presetChips.forEach((c) => c.classList.toggle('active', Number(c.dataset.dpi) === state.dpi));
      state.instantSpeed = initialStats.instantSpeed || 0;
      state.peakSpeed = initialStats.peakSpeed || 0;
      state.apm = initialStats.apm || 0;
      if (initialStats.currentApp) state.currentApp = initialStats.currentApp;
      if (initialStats.version && els.versionBadge) els.versionBadge.textContent = `v${initialStats.version}`;
      // Immediately paint live telemetry from storage
      render();
    }
    // Fetch apps range and trends in background without stalling the initial render
    loadAppsRange('today').then(() => renderApps());
    loadHistory();
  } catch (err) {
    console.error('Initial stats error:', err);
    render();
  }
})();
