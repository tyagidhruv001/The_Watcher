// test/version.test.js
// Automated test suite to verify version consistency across package.json and the UI

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Version Information & Single Source of Truth', () => {
  const pkgPath = path.resolve(__dirname, '../package.json');
  const htmlPath = path.resolve(__dirname, '../index.html');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const html = fs.readFileSync(htmlPath, 'utf8');

  it('1. package.json contains a valid semantic version', () => {
    assert.ok(pkg.version, 'package.json must define a version');
    const semverRegex = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
    assert.match(
      pkg.version,
      semverRegex,
      `package.json version "${pkg.version}" must be a valid semantic version`
    );
  });

  it('2. index.html contains the versionBadge element matching package.json', () => {
    assert.match(
      html,
      /id=["']versionBadge["']/,
      'index.html must include id="versionBadge" for dynamic version binding'
    );

    // If static fallback text exists in HTML, it must match package.json version
    const badgeMatch = html.match(/id=["']versionBadge["'][^>]*>([^<]*)<\/span>/);
    assert.ok(badgeMatch, 'versionBadge span element must exist in index.html');
    const staticText = badgeMatch[1].trim();
    if (staticText.length > 0) {
      assert.strictEqual(
        staticText,
        `v${pkg.version}`,
        `Static HTML fallback "${staticText}" must match package.json "v${pkg.version}"`
      );
    }
  });

  it('3. UI does not have conflicting hardcoded versions', () => {
    // Ensure old outdated hardcoded versions like v1.2 or v1.4 are not lingering without versionBadge
    assert.strictEqual(
      html.includes('<span class="brand-version-badge">v1.2</span>'),
      false,
      'Old v1.2 hardcoded badge must not exist'
    );
    assert.strictEqual(
      html.includes('<span class="brand-version-badge">v1.4</span>'),
      false,
      'Unbound v1.4 hardcoded badge must not exist'
    );
  });

  it('4. package.json build.appId is a stable production-ready reverse-DNS identifier', () => {
    assert.ok(pkg.build, 'package.json must contain a build config');
    assert.ok(pkg.build.appId, 'build.appId must be defined');
    assert.strictEqual(
      pkg.build.appId.includes('example'),
      false,
      'Placeholder "example" must not be present in appId'
    );
    const reverseDnsRegex = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i;
    assert.match(
      pkg.build.appId,
      reverseDnsRegex,
      `appId "${pkg.build.appId}" must follow reverse-DNS convention`
    );
    assert.strictEqual(pkg.build.appId, 'com.thewatcher.app');
  });
});

