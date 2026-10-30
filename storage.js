// storage.js — runs in the main process only.
// Persists activity stats as plain aggregate counters, grouped by day.
// Nothing that was typed is ever stored — only counts per key name.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function getUserDataPath() {
  if (app && typeof app.getPath === 'function') {
    try {
      return app.getPath('userData');
    } catch { }
  }
  return path.join(process.env.APPDATA || process.env.HOME || '.', 'the-watcher');
}

const DATA_FILE = path.join(getUserDataPath(), 'activity-data.json');
const BACKUP_FILE = path.join(getUserDataPath(), 'activity-data.json.bak');
const TEMP_FILE = path.join(getUserDataPath(), 'activity-data.json.tmp');

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function toSafeNumber(val, defaultVal = 0) {
  const n = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(n) && n >= 0 ? n : defaultVal;
}

function emptyDay() {
  return {
    mousePixels: 0,
    leftClicks: 0,
    rightClicks: 0,
    middleClicks: 0,
    keyPresses: 0,
    keys: {}, // e.g. { Space: 412, A: 88 } — counts only, never typed text
    activeSeconds: 0, // input detected recently (laptop actively being used)
    idleSeconds: 0, // no input for longer than the idle threshold
    totalSeconds: 0, // total time laptop was on (Cursor Meter running)
    apps: {}, // e.g. { 'chrome.exe': 4820 } — seconds of active foreground time
    peakSpeed: 0, // peak cursor velocity in px/s today
  };
}

// Validates and repairs an individual day object, replacing missing,
// negative, or non-finite values with safe defaults.
function normalizeDay(rawDay) {
  const base = emptyDay();
  if (!rawDay || typeof rawDay !== 'object' || Array.isArray(rawDay)) {
    return base;
  }

  base.mousePixels = toSafeNumber(rawDay.mousePixels, 0);
  base.leftClicks = Math.floor(toSafeNumber(rawDay.leftClicks, 0));
  base.rightClicks = Math.floor(toSafeNumber(rawDay.rightClicks, 0));
  base.middleClicks = Math.floor(toSafeNumber(rawDay.middleClicks, 0));
  base.keyPresses = Math.floor(toSafeNumber(rawDay.keyPresses, 0));
  base.activeSeconds = toSafeNumber(rawDay.activeSeconds, 0);
  base.idleSeconds = toSafeNumber(rawDay.idleSeconds, 0);
  base.totalSeconds = toSafeNumber(rawDay.totalSeconds, 0);
  base.peakSpeed = toSafeNumber(rawDay.peakSpeed, 0);

  // Normalize key-press counter dictionary
  base.keys = {};
  if (rawDay.keys && typeof rawDay.keys === 'object' && !Array.isArray(rawDay.keys)) {
    for (const [k, count] of Object.entries(rawDay.keys)) {
      if (typeof k === 'string' && k.length > 0) {
        const safeCount = Math.floor(toSafeNumber(count, 0));
        if (safeCount > 0) {
          base.keys[k] = safeCount;
        }
      }
    }
  }

  // Normalize app-duration dictionary
  base.apps = {};
  if (rawDay.apps && typeof rawDay.apps === 'object' && !Array.isArray(rawDay.apps)) {
    for (const [appKey, secs] of Object.entries(rawDay.apps)) {
      if (typeof appKey === 'string' && appKey.length > 0) {
        const safeSecs = toSafeNumber(secs, 0);
        if (safeSecs > 0) {
          base.apps[appKey] = safeSecs;
        }
      }
    }
  }

  return base;
}

const DEFAULT_RETENTION_DAYS = 365;

// Prunes records older than `daysLimit` (defaults to data.retentionDays or 365).
// A daysLimit of 0, null, or 'unlimited' skips pruning (infinite retention).
// Returns the count of deleted records.
function pruneOldDays(data, daysLimit) {
  if (!data || !data.days) return 0;
  const limit = daysLimit !== undefined ? daysLimit : (data.retentionDays ?? DEFAULT_RETENTION_DAYS);
  if (!limit || limit <= 0 || limit === 'unlimited') return 0;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Number(limit));
  const cutoffKey = todayKey(cutoff);

  let prunedCount = 0;
  for (const dayKey of Object.keys(data.days)) {
    if (dayKey < cutoffKey) {
      delete data.days[dayKey];
      prunedCount++;
    }
  }
  return prunedCount;
}

// Validates the root storage object and repairs all daily records.
// Discards malformed date keys while recovering valid entries.
function validateAndNormalizeData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { retentionDays: DEFAULT_RETENTION_DAYS, days: {} };
  }

  let retentionDays = DEFAULT_RETENTION_DAYS;
  if (raw.retentionDays === 0 || raw.retentionDays === 'unlimited' || raw.retentionDays === null) {
    retentionDays = 0; // 0 represents unlimited retention
  } else if (Number.isFinite(Number(raw.retentionDays)) && Number(raw.retentionDays) > 0) {
    retentionDays = Math.floor(Number(raw.retentionDays));
  }

  const normalized = {
    ...raw,
    retentionDays,
    days: {},
  };

  if (raw.days && typeof raw.days === 'object' && !Array.isArray(raw.days)) {
    for (const [key, dayVal] of Object.entries(raw.days)) {
      if (!DATE_KEY_REGEX.test(key) || isNaN(Date.parse(key))) {
        console.warn(`[storage] Discarding invalid date key: "${key}"`);
        continue;
      }
      normalized.days[key] = normalizeDay(dayVal);
    }
  }

  return normalized;
}

function mergeDays(targetDay, sourceDay) {
  const target = normalizeDay(targetDay);
  const source = normalizeDay(sourceDay);

  const merged = { ...emptyDay() };
  merged.mousePixels = target.mousePixels + source.mousePixels;
  merged.leftClicks = target.leftClicks + source.leftClicks;
  merged.rightClicks = target.rightClicks + source.rightClicks;
  merged.middleClicks = target.middleClicks + source.middleClicks;
  merged.keyPresses = target.keyPresses + source.keyPresses;
  merged.activeSeconds = target.activeSeconds + source.activeSeconds;
  merged.idleSeconds = target.idleSeconds + source.idleSeconds;
  merged.totalSeconds = target.totalSeconds + source.totalSeconds;
  merged.peakSpeed = Math.max(target.peakSpeed, source.peakSpeed);

  merged.keys = { ...target.keys };
  for (const [k, count] of Object.entries(source.keys)) {
    merged.keys[k] = (merged.keys[k] || 0) + count;
  }

  merged.apps = { ...target.apps };
  for (const [appKey, secs] of Object.entries(source.apps)) {
    merged.apps[appKey] = (merged.apps[appKey] || 0) + secs;
  }

  return merged;
}

function load() {
  let parsed = null;

  // 1. Try reading the primary DATA_FILE
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      if (raw && raw.trim().length > 0) {
        const rawJson = JSON.parse(raw);
        if (rawJson && typeof rawJson === 'object') {
          parsed = validateAndNormalizeData(rawJson);
        }
      }
    }
  } catch (err) {
    console.error('Failed reading primary data file:', err);
  }

  // 2. Auto-Recovery: if primary file was corrupted (e.g. from sudden PC restart/crash), recover from backup
  if (!parsed && fs.existsSync(BACKUP_FILE)) {
    try {
      console.warn('Attempting recovery from backup file:', BACKUP_FILE);
      const rawBak = fs.readFileSync(BACKUP_FILE, 'utf8');
      if (rawBak && rawBak.trim().length > 0) {
        const rawJsonBak = JSON.parse(rawBak);
        if (rawJsonBak && typeof rawJsonBak === 'object') {
          parsed = validateAndNormalizeData(rawJsonBak);
          // Restore primary from validated backup
          save(parsed);
          console.warn('Successfully recovered activity data from backup file!');
        }
      }
    } catch (bakErr) {
      console.error('Failed reading backup data file:', bakErr);
    }
  }

  if (!parsed) {
    parsed = { retentionDays: DEFAULT_RETENTION_DAYS, days: {} };
  }

  // Automatic Migration: check old cursor-meter folder if not migrated yet
  try {
    let oldDataFile = '';
    try {
      oldDataFile = path.join(app.getPath('appData'), 'cursor-meter', 'activity-data.json');
    } catch {
      oldDataFile = path.join(path.dirname(DATA_FILE), '..', 'cursor-meter', 'activity-data.json');
    }

    if (fs.existsSync(oldDataFile) && !parsed._migratedFromCursorMeter) {
      const oldRaw = fs.readFileSync(oldDataFile, 'utf8');
      const oldParsed = JSON.parse(oldRaw);
      if (oldParsed && oldParsed.days) {
        const normalizedOld = validateAndNormalizeData(oldParsed);
        // Ensure migration never restores expired records:
        pruneOldDays(normalizedOld, parsed.retentionDays);

        for (const [dayKey, dayData] of Object.entries(normalizedOld.days)) {
          if (!parsed.days[dayKey]) {
            parsed.days[dayKey] = dayData;
          } else {
            parsed.days[dayKey] = mergeDays(parsed.days[dayKey], dayData);
          }
        }
        parsed._migratedFromCursorMeter = true;
        save(parsed);
      }
    }
  } catch (err) {
    console.error('Migration error:', err);
  }

  // Prune expired historical records on startup and save cleaned data
  const pruned = pruneOldDays(parsed);
  if (pruned > 0) {
    console.log(`[storage] Pruned ${pruned} historical record(s) older than ${parsed.retentionDays} days.`);
    save(parsed);
  }

  return parsed;
}

function save(data) {
  if (!data || !data.days) return false;

  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const jsonStr = JSON.stringify(data, null, 2);

    // 1. Write atomically to a temp file first
    fs.writeFileSync(TEMP_FILE, jsonStr, 'utf8');

    // 2. Create/update a safety backup of the existing valid data file
    if (fs.existsSync(DATA_FILE)) {
      try {
        fs.copyFileSync(DATA_FILE, BACKUP_FILE);
      } catch {
        // Non-fatal if backup copy fails
      }
    }

    // 3. Atomically replace DATA_FILE with the verified TEMP_FILE
    try {
      fs.renameSync(TEMP_FILE, DATA_FILE);
    } catch (renameErr) {
      // Windows file-locking fallback
      fs.copyFileSync(TEMP_FILE, DATA_FILE);
      try { fs.unlinkSync(TEMP_FILE); } catch { }
    }
    return true;
  } catch (err) {
    console.error('Failed saving activity data:', err);
    return false;
  }
}

function getDay(data, key = todayKey()) {
  if (!data.days[key]) {
    data.days[key] = emptyDay();
  } else if (!data.days[key].apps || !data.days[key].keys) {
    data.days[key] = normalizeDay(data.days[key]);
  }
  return data.days[key];
}

function lastNDays(data, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    out.push({ date: key, ...emptyDay(), ...(data.days[key] || {}) });
  }
  return out;
}

function getAggregatedApps(data, range = 'today', friendlyNameFn = (k) => k) {
  if (!data || !data.days) return [];

  const appsMap = {};
  const today = todayKey();
  const allDays = Object.entries(data.days);

  let targetEntries = [];

  if (range === 'today') {
    const todayObj = data.days[today];
    if (todayObj && todayObj.apps) {
      targetEntries = [[today, todayObj]];
    }
  } else if (range === 'yesterday') {
    const yDate = new Date();
    yDate.setDate(yDate.getDate() - 1);
    const yKey = todayKey(yDate);
    const yObj = data.days[yKey];
    if (yObj && yObj.apps) {
      targetEntries = [[yKey, yObj]];
    }
  } else if (range === '7d') {
    const keys7d = new Set();
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      keys7d.add(todayKey(d));
    }
    targetEntries = allDays.filter(([k]) => keys7d.has(k));
  } else if (range === '30d') {
    const keys30d = new Set();
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      keys30d.add(todayKey(d));
    }
    targetEntries = allDays.filter(([k]) => keys30d.has(k));
  } else {
    // 'all'
    targetEntries = allDays;
  }

  for (const [_dayKey, dayObj] of targetEntries) {
    if (!dayObj || !dayObj.apps) continue;
    for (const [key, secs] of Object.entries(dayObj.apps)) {
      const name = friendlyNameFn(key);
      if (!appsMap[name]) {
        appsMap[name] = { key, name, seconds: 0 };
      }
      appsMap[name].seconds += Number(secs || 0);
    }
  }

  return Object.values(appsMap).sort((a, b) => b.seconds - a.seconds);
}

module.exports = {
  load,
  save,
  todayKey,
  emptyDay,
  normalizeDay,
  validateAndNormalizeData,
  pruneOldDays,
  DEFAULT_RETENTION_DAYS,
  getDay,
  lastNDays,
  getAggregatedApps,
  DATA_FILE,
  BACKUP_FILE,
};
