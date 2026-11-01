// test/storage.test.js
// Automated test suite for storage.js using Node.js built-in node:test and node:assert

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Helper to create an isolated storage environment per test.
// Redirects APPDATA to a unique temporary directory and reloads storage.js.
function setupIsolatedStorage() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-storage-test-'));
  const originalAppData = process.env.APPDATA;
  process.env.APPDATA = tempDir;

  const storagePath = path.resolve(__dirname, '../storage.js');
  delete require.cache[storagePath];
  const storage = require(storagePath);

  const cleanup = () => {
    delete require.cache[storagePath];
    if (originalAppData !== undefined) {
      process.env.APPDATA = originalAppData;
    } else {
      delete process.env.APPDATA;
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Windows file-lock guard during temp dir removal
    }
  };

  return { storage, tempDir, cleanup };
}

describe('Storage Module (storage.js)', () => {
  let env;
  const origConsoleWarn = console.warn;
  const origConsoleError = console.error;
  const origConsoleLog = console.log;

  beforeEach(() => {
    // Suppress console output during tests to keep test runner output clean
    console.warn = () => {};
    console.error = () => {};
    console.log = () => {};
    env = setupIsolatedStorage();
  });

  afterEach(() => {
    console.warn = origConsoleWarn;
    console.error = origConsoleError;
    console.log = origConsoleLog;
    if (env) env.cleanup();
  });

  // 1. Create and load a new data file
  it('1. Create and load a new data file', () => {
    const { storage } = env;
    assert.strictEqual(fs.existsSync(storage.DATA_FILE), false, 'Primary data file should not exist initially');

    const data = storage.load();
    assert.ok(data, 'load() should return a valid data object');
    assert.strictEqual(typeof data.days, 'object', 'days should be an object');
    assert.strictEqual(Object.keys(data.days).length, 0, 'new dataset should have 0 days');
    assert.strictEqual(data.retentionDays, storage.DEFAULT_RETENTION_DAYS);

    // Save initial structure and verify file is created on disk
    const saved = storage.save(data);
    assert.strictEqual(saved, true, 'save() should succeed');
    assert.strictEqual(fs.existsSync(storage.DATA_FILE), true, 'Primary data file should now exist on disk');
  });

  // 2. Save activity data successfully
  it('2. Save activity data successfully', () => {
    const { storage } = env;
    const testData = {
      retentionDays: 365,
      days: {
        '2026-10-31': {
          mousePixels: 4500,
          leftClicks: 120,
          rightClicks: 15,
          middleClicks: 2,
          keyPresses: 650,
          keys: { Space: 50, Enter: 12 },
          activeSeconds: 1200,
          idleSeconds: 300,
          totalSeconds: 1500,
          apps: { 'code.exe': 1000, 'chrome.exe': 200 },
          peakSpeed: 1450,
        },
      },
    };

    const saved = storage.save(testData);
    assert.strictEqual(saved, true, 'save() should return true');

    const raw = fs.readFileSync(storage.DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    assert.strictEqual(parsed.days['2026-10-31'].mousePixels, 4500);
    assert.strictEqual(parsed.days['2026-10-31'].apps['code.exe'], 1000);
  });

  // 3. Load existing activity data
  it('3. Load existing activity data', () => {
    const { storage } = env;
    fs.mkdirSync(path.dirname(storage.DATA_FILE), { recursive: true });

    const existingData = {
      retentionDays: 180,
      days: {
        '2026-10-30': {
          mousePixels: 9999,
          leftClicks: 250,
          apps: { 'editor.exe': 3600 },
        },
      },
    };
    fs.writeFileSync(storage.DATA_FILE, JSON.stringify(existingData, null, 2), 'utf8');

    const loaded = storage.load();
    assert.strictEqual(loaded.retentionDays, 180);
    assert.ok(loaded.days['2026-10-30']);
    assert.strictEqual(loaded.days['2026-10-30'].mousePixels, 9999);
    assert.strictEqual(loaded.days['2026-10-30'].apps['editor.exe'], 3600);
    // Verifies normalization occurred on load
    assert.strictEqual(loaded.days['2026-10-30'].idleSeconds, 0);
  });

  // 4. Handle a missing primary file
  it('4. Handle a missing primary file', () => {
    const { storage } = env;
    assert.strictEqual(fs.existsSync(storage.DATA_FILE), false);
    assert.strictEqual(fs.existsSync(storage.BACKUP_FILE), false);

    assert.doesNotThrow(() => {
      const data = storage.load();
      assert.ok(data);
      assert.strictEqual(data.retentionDays, storage.DEFAULT_RETENTION_DAYS);
      assert.deepStrictEqual(data.days, {});
    });
  });

  // 5. Recover from a corrupted primary file using a valid backup
  it('5. Recover from a corrupted primary file using a valid backup', () => {
    const { storage } = env;
    fs.mkdirSync(path.dirname(storage.DATA_FILE), { recursive: true });

    const backupData = {
      retentionDays: 365,
      days: {
        '2026-10-25': {
          mousePixels: 8888,
          leftClicks: 77,
        },
      },
    };

    // Primary is corrupted, backup is valid
    fs.writeFileSync(storage.DATA_FILE, 'CORRUPT_JSON_DATA_#@!$%^', 'utf8');
    fs.writeFileSync(storage.BACKUP_FILE, JSON.stringify(backupData), 'utf8');

    const loaded = storage.load();
    assert.ok(loaded.days['2026-10-25'], 'Data should be recovered from backup');
    assert.strictEqual(loaded.days['2026-10-25'].mousePixels, 8888);

    // Verify primary DATA_FILE was restored with valid data
    const rawRestored = fs.readFileSync(storage.DATA_FILE, 'utf8');
    const parsedRestored = JSON.parse(rawRestored);
    assert.strictEqual(parsedRestored.days['2026-10-25'].mousePixels, 8888);
  });

  // 6. Preserve the valid backup during recovery
  it('6. Preserve the valid backup during recovery', () => {
    const { storage } = env;
    fs.mkdirSync(path.dirname(storage.DATA_FILE), { recursive: true });

    const backupData = {
      retentionDays: 365,
      days: {
        '2026-10-20': {
          mousePixels: 7777,
          keyPresses: 300,
        },
      },
    };
    const validBackupContent = JSON.stringify(backupData, null, 2);

    fs.writeFileSync(storage.DATA_FILE, 'CORRUPTED_PRIMARY_CONTENT', 'utf8');
    fs.writeFileSync(storage.BACKUP_FILE, validBackupContent, 'utf8');

    storage.load();

    // The backup file must NOT be overwritten with the corrupted primary content!
    const backupContentAfterRecovery = fs.readFileSync(storage.BACKUP_FILE, 'utf8');
    assert.strictEqual(
      backupContentAfterRecovery.includes('CORRUPTED_PRIMARY_CONTENT'),
      false,
      'Backup file must never contain corrupted data'
    );
    assert.strictEqual(
      backupContentAfterRecovery.includes('7777'),
      true,
      'Backup file must preserve its valid original data'
    );
  });

  // 7. Handle corrupted primary and backup files
  it('7. Handle corrupted primary and backup files', () => {
    const { storage } = env;
    fs.mkdirSync(path.dirname(storage.DATA_FILE), { recursive: true });

    fs.writeFileSync(storage.DATA_FILE, 'INVALID_PRIMARY_JSON{[[', 'utf8');
    fs.writeFileSync(storage.BACKUP_FILE, 'INVALID_BACKUP_JSON{[[', 'utf8');

    assert.doesNotThrow(() => {
      const loaded = storage.load();
      assert.ok(loaded);
      assert.strictEqual(loaded.retentionDays, storage.DEFAULT_RETENTION_DAYS);
      assert.deepStrictEqual(loaded.days, {});
    });
  });

  // 8. Reject invalid calendar dates
  it('8. Reject invalid calendar dates', () => {
    const { storage } = env;

    // Direct unit checks with isValidDateKey
    assert.strictEqual(storage.isValidDateKey('2026-02-31'), false, 'Feb 31 is invalid');
    assert.strictEqual(storage.isValidDateKey('2026-04-31'), false, 'April 31 is invalid');
    assert.strictEqual(storage.isValidDateKey('2026-06-31'), false, 'June 31 is invalid');
    assert.strictEqual(storage.isValidDateKey('2026-13-01'), false, 'Month 13 is invalid');
    assert.strictEqual(storage.isValidDateKey('2026-00-10'), false, 'Month 00 is invalid');
    assert.strictEqual(storage.isValidDateKey('not-a-date'), false, 'Non-date string is invalid');
    assert.strictEqual(storage.isValidDateKey('2026-1-5'), false, 'Single digit month/day is invalid');
    assert.strictEqual(storage.isValidDateKey(''), false, 'Empty string is invalid');

    // validateAndNormalizeData integration check
    const raw = {
      days: {
        '2026-02-31': { mousePixels: 100 },
        '2026-04-31': { mousePixels: 200 },
        '2026-13-01': { mousePixels: 300 },
        '2026-10-15': { mousePixels: 400 }, // valid
      },
    };

    const normalized = storage.validateAndNormalizeData(raw);
    assert.strictEqual(Object.keys(normalized.days).length, 1);
    assert.ok(normalized.days['2026-10-15']);
    assert.strictEqual(normalized.days['2026-02-31'], undefined);
    assert.strictEqual(normalized.days['2026-04-31'], undefined);
    assert.strictEqual(normalized.days['2026-13-01'], undefined);
  });

  // 9. Accept valid leap-year dates
  it('9. Accept valid leap-year dates', () => {
    const { storage } = env;

    // Leap year rules
    assert.strictEqual(storage.isValidDateKey('2024-02-29'), true, '2024 is a leap year');
    assert.strictEqual(storage.isValidDateKey('2026-02-29'), false, '2026 is NOT a leap year');
    assert.strictEqual(storage.isValidDateKey('2000-02-29'), true, '2000 is a leap year (div by 400)');
    assert.strictEqual(storage.isValidDateKey('1900-02-29'), false, '1900 is NOT a leap year (century not div by 400)');
    assert.strictEqual(storage.isValidDateKey('2100-02-29'), false, '2100 is NOT a leap year (century not div by 400)');
    assert.strictEqual(storage.isValidDateKey('2400-02-29'), true, '2400 is a leap year (div by 400)');

    // Normalization check
    const raw = {
      days: {
        '2024-02-29': { mousePixels: 1500 },
        '2026-02-29': { mousePixels: 2500 },
      },
    };
    const normalized = storage.validateAndNormalizeData(raw);
    assert.ok(normalized.days['2024-02-29'], 'Valid leap date must be kept');
    assert.strictEqual(normalized.days['2026-02-29'], undefined, 'Invalid leap date must be dropped');
  });

  // 10. Apply 30-day retention correctly
  it('10. Apply 30-day retention correctly', () => {
    const { storage } = env;

    const makeDateKey = (daysAgo) => {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      return storage.todayKey(d);
    };

    const key10DaysAgo = makeDateKey(10);
    const key25DaysAgo = makeDateKey(25);
    const key35DaysAgo = makeDateKey(35);
    const key60DaysAgo = makeDateKey(60);

    const testData = {
      retentionDays: 30,
      days: {
        [key10DaysAgo]: { mousePixels: 100 },
        [key25DaysAgo]: { mousePixels: 200 },
        [key35DaysAgo]: { mousePixels: 300 },
        [key60DaysAgo]: { mousePixels: 400 },
      },
    };

    const prunedCount = storage.pruneOldDays(testData, 30);
    assert.strictEqual(prunedCount, 2, 'Should prune exactly 2 records older than 30 days');
    assert.ok(testData.days[key10DaysAgo], '10-day-old record must be retained');
    assert.ok(testData.days[key25DaysAgo], '25-day-old record must be retained');
    assert.strictEqual(testData.days[key35DaysAgo], undefined, '35-day-old record must be pruned');
    assert.strictEqual(testData.days[key60DaysAgo], undefined, '60-day-old record must be pruned');
  });

  // 11. Apply unlimited retention correctly
  it('11. Apply unlimited retention correctly', () => {
    const { storage } = env;

    const testData = {
      retentionDays: 0, // 0 represents unlimited retention
      days: {
        '2020-01-01': { mousePixels: 5000 },
        '2022-05-15': { mousePixels: 6000 },
        '2024-08-20': { mousePixels: 7000 },
      },
    };

    const prunedCount = storage.pruneOldDays(testData, 0);
    assert.strictEqual(prunedCount, 0, 'Unlimited retention must prune 0 records');
    assert.strictEqual(Object.keys(testData.days).length, 3, 'All historical days must be preserved');
  });

  // 12. Reset today's data without modifying historical records
  it("12. Reset today's data without modifying historical records", () => {
    const { storage } = env;
    const today = storage.todayKey();

    const d = new Date();
    d.setDate(d.getDate() - 5);
    const pastKey = storage.todayKey(d);

    const data = {
      retentionDays: 365,
      days: {
        [pastKey]: {
          mousePixels: 8000,
          leftClicks: 200,
          keyPresses: 450,
          apps: { 'chrome.exe': 1200 },
        },
        [today]: {
          mousePixels: 2000,
          leftClicks: 50,
          keyPresses: 100,
          apps: { 'code.exe': 500 },
        },
      },
    };
    storage.save(data);

    // Reset today's data (matching reset-today logic in main.js)
    data.days[today] = storage.emptyDay();
    const saved = storage.save(data);
    assert.strictEqual(saved, true);

    // Verify today is zeroed but past records are completely untouched
    const reloaded = storage.load();
    assert.strictEqual(reloaded.days[today].mousePixels, 0);
    assert.strictEqual(reloaded.days[today].keyPresses, 0);
    assert.deepStrictEqual(reloaded.days[today].apps, {});

    assert.strictEqual(reloaded.days[pastKey].mousePixels, 8000);
    assert.strictEqual(reloaded.days[pastKey].leftClicks, 200);
    assert.strictEqual(reloaded.days[pastKey].keyPresses, 450);
    assert.strictEqual(reloaded.days[pastKey].apps['chrome.exe'], 1200);
  });

  // 13. Normalize missing or malformed fields
  it('13. Normalize missing or malformed fields', () => {
    const { storage } = env;

    const malformedDay = {
      mousePixels: '5200', // string number
      leftClicks: -10, // negative
      rightClicks: NaN, // non-finite
      keyPresses: Infinity, // non-finite
      keys: {
        Space: '150', // string count
        Enter: -5, // negative count
        Shift: null, // invalid count
      },
      apps: {
        'vscode.exe': '3600', // string seconds
        'broken.exe': -50, // negative seconds
      },
      // activeSeconds, idleSeconds, totalSeconds omitted entirely
    };

    const normalized = storage.normalizeDay(malformedDay);

    assert.strictEqual(normalized.mousePixels, 5200);
    assert.strictEqual(normalized.leftClicks, 0);
    assert.strictEqual(normalized.rightClicks, 0);
    assert.strictEqual(normalized.keyPresses, 0);
    assert.strictEqual(normalized.activeSeconds, 0);
    assert.strictEqual(normalized.idleSeconds, 0);
    assert.strictEqual(normalized.totalSeconds, 0);

    assert.strictEqual(normalized.keys.Space, 150);
    // Non-positive or invalid counts and durations are omitted to keep dictionaries compact
    assert.strictEqual(normalized.keys.Enter, undefined);
    assert.strictEqual(normalized.keys.Shift, undefined);

    assert.strictEqual(normalized.apps['vscode.exe'], 3600);
    assert.strictEqual(normalized.apps['broken.exe'], undefined);
  });

  // 14. Handle empty datasets correctly
  it('14. Handle empty datasets correctly', () => {
    const { storage } = env;

    // Test validateAndNormalizeData with empty/null/undefined inputs
    const emptyObj = storage.validateAndNormalizeData({});
    assert.strictEqual(emptyObj.retentionDays, storage.DEFAULT_RETENTION_DAYS);
    assert.deepStrictEqual(emptyObj.days, {});

    const nullData = storage.validateAndNormalizeData(null);
    assert.deepStrictEqual(nullData.days, {});

    const stringData = storage.validateAndNormalizeData('not-an-object');
    assert.deepStrictEqual(stringData.days, {});

    const arrayData = storage.validateAndNormalizeData([1, 2, 3]);
    assert.deepStrictEqual(arrayData.days, {});

    // Test helper functions with empty datasets
    const pruned = storage.pruneOldDays({ days: {} });
    assert.strictEqual(pruned, 0);

    const apps = storage.getAggregatedApps({ days: {} });
    assert.deepStrictEqual(apps, []);

    const history = storage.lastNDays({ days: {} }, 5);
    assert.strictEqual(history.length, 5);
    assert.strictEqual(history[0].mousePixels, 0);
  });
});
