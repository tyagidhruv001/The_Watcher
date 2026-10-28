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
    } catch {}
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

function mergeDays(targetDay, sourceDay) {
  if (!targetDay) return { ...emptyDay(), ...sourceDay };
  if (!sourceDay) return targetDay;

  const merged = { ...emptyDay(), ...targetDay };
  merged.mousePixels = (merged.mousePixels || 0) + (sourceDay.mousePixels || 0);
  merged.leftClicks = (merged.leftClicks || 0) + (sourceDay.leftClicks || 0);
  merged.rightClicks = (merged.rightClicks || 0) + (sourceDay.rightClicks || 0);
  merged.middleClicks = (merged.middleClicks || 0) + (sourceDay.middleClicks || 0);
  merged.keyPresses = (merged.keyPresses || 0) + (sourceDay.keyPresses || 0);
  merged.activeSeconds = (merged.activeSeconds || 0) + (sourceDay.activeSeconds || 0);
  merged.idleSeconds = (merged.idleSeconds || 0) + (sourceDay.idleSeconds || 0);
  merged.totalSeconds = (merged.totalSeconds || 0) + (sourceDay.totalSeconds || 0);
  merged.peakSpeed = Math.max(merged.peakSpeed || 0, sourceDay.peakSpeed || 0);

  merged.keys = { ...(merged.keys || {}) };
  if (sourceDay.keys) {
    for (const [k, count] of Object.entries(sourceDay.keys)) {
      merged.keys[k] = (merged.keys[k] || 0) + Number(count || 0);
    }
  }

  merged.apps = { ...(merged.apps || {}) };
  if (sourceDay.apps) {
    for (const [appKey, secs] of Object.entries(sourceDay.apps)) {
      merged.apps[appKey] = (merged.apps[appKey] || 0) + Number(secs || 0);
    }
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
        const data = JSON.parse(raw);
        if (data && typeof data === 'object' && data.days) {
          parsed = data;
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
        const dataBak = JSON.parse(rawBak);
        if (dataBak && typeof dataBak === 'object' && dataBak.days) {
          parsed = dataBak;
          // Restore primary from backup
          fs.writeFileSync(DATA_FILE, rawBak, 'utf8');
          console.warn('Successfully recovered activity data from backup file!');
        }
      }
    } catch (bakErr) {
      console.error('Failed reading backup data file:', bakErr);
    }
  }

  if (!parsed) {
    parsed = { days: {} };
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
        for (const [dayKey, dayData] of Object.entries(oldParsed.days)) {
          if (!parsed.days[dayKey]) {
            parsed.days[dayKey] = { ...emptyDay(), ...dayData };
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
      try { fs.unlinkSync(TEMP_FILE); } catch {}
    }
    return true;
  } catch (err) {
    console.error('Failed saving activity data:', err);
    return false;
  }
}

function getDay(data, key = todayKey()) {
  if (!data.days[key]) data.days[key] = emptyDay();
  if (!data.days[key].apps) data.days[key].apps = {};
  if (!data.days[key].keys) data.days[key].keys = {};
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
  getDay,
  lastNDays,
  getAggregatedApps,
  DATA_FILE,
  BACKUP_FILE,
};
