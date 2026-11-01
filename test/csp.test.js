// test/csp.test.js
// Automated test suite verifying strict Content Security Policy (CSP) and zero inline styling

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Content Security Policy (CSP) & Styling Hygiene', () => {
  const htmlPath = path.resolve(__dirname, '../index.html');
  const rendererPath = path.resolve(__dirname, '../renderer.js');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const renderer = fs.readFileSync(rendererPath, 'utf8');

  // Extract CSP meta tag content
  const cspMatch = html.match(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*content="([^"]+)"/i);

  it('1. index.html contains a valid Content-Security-Policy meta tag', () => {
    assert.ok(cspMatch, 'CSP meta tag must be present in index.html');
  });

  it('2. CSP enforces strict script-src (no unsafe-inline, no unsafe-eval)', () => {
    const csp = cspMatch[1];
    assert.match(csp, /script-src\s+'self'/, "script-src must be set to 'self'");
    assert.strictEqual(
      csp.includes("'unsafe-inline'") && csp.split(';').some((part) => part.includes('script-src') && part.includes('unsafe-inline')),
      false,
      "script-src must NOT contain 'unsafe-inline'"
    );
    assert.strictEqual(
      csp.includes("'unsafe-eval'"),
      false,
      "script-src must NOT contain 'unsafe-eval'"
    );
  });

  it('3. CSP enforces strict style-src (no unsafe-inline)', () => {
    const csp = cspMatch[1];
    assert.match(csp, /style-src\s+'self'/, "style-src must be set to 'self'");
    assert.strictEqual(
      csp.split(';').some((part) => part.includes('style-src') && part.includes('unsafe-inline')),
      false,
      "style-src must NOT contain 'unsafe-inline'"
    );
  });

  it('4. CSP blocks external network communication (connect-src none)', () => {
    const csp = cspMatch[1];
    assert.match(csp, /connect-src\s+'none'/, "connect-src must be 'none'");
    assert.match(csp, /object-src\s+'none'/, "object-src must be 'none'");
    assert.match(csp, /form-action\s+'none'/, "form-action must be 'none'");
  });

  it('5. index.html contains zero inline style attributes and zero style tags', () => {
    assert.strictEqual(
      /<style\b[^>]*>/i.test(html),
      false,
      'index.html must not contain any <style> tags'
    );
    assert.strictEqual(
      /\bstyle\s*=\s*["'][^"']*["']/i.test(html),
      false,
      'index.html must not contain any inline style="..." attributes'
    );
  });

  it('6. renderer.js generates no HTML with inline style attributes', () => {
    assert.strictEqual(
      /\bstyle\s*=\s*\\?["']/i.test(renderer),
      false,
      'renderer.js must not output HTML strings containing style="..." attributes'
    );
  });
});
