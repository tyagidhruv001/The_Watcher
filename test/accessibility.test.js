// test/accessibility.test.js
// Automated test suite for Dashboard Accessibility, Keyboard Navigation & ARIA Compliance

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Dashboard Accessibility & Keyboard Usability', () => {
  const htmlPath = path.resolve(__dirname, '../index.html');
  const cssPath = path.resolve(__dirname, '../styles.css');
  const rendererPath = path.resolve(__dirname, '../renderer.js');

  const html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const renderer = fs.readFileSync(rendererPath, 'utf8');

  // --------------------------------------------------------------------------
  // 1. Focus Visibility
  // --------------------------------------------------------------------------
  it('1. styles.css provides distinct :focus-visible indicators for interactive elements', () => {
    assert.match(css, /:focus-visible\s*\{/, 'Global :focus-visible rule must exist in styles.css');
    assert.match(css, /outline:\s*2px\s+solid\s+var\(--accent\)/, 'Focus outline must use high-contrast var(--accent)');
    assert.match(css, /outline-offset:\s*2px/, 'Focus outline must have clear outline-offset');
  });

  // --------------------------------------------------------------------------
  // 2. Buttons and Interactive Controls
  // --------------------------------------------------------------------------
  it('2. Interactive controls have accessible labels and keyboard accessibility', () => {
    // Theme and Settings trigger buttons
    assert.match(html, /id="themeBtn"[^>]*aria-label="Theme Palette"/, 'themeBtn must have descriptive aria-label');
    assert.match(html, /id="settingsBtn"[^>]*aria-label="Hardware Settings & DPI"/, 'settingsBtn must have descriptive aria-label');

    // Close buttons
    assert.match(html, /id="closeThemeBtn"[^>]*aria-label="Close Theme Palette"/, 'closeThemeBtn must have descriptive aria-label');
    assert.match(html, /id="closeSettingsBtn"[^>]*aria-label="Close Hardware Settings"/, 'closeSettingsBtn must have descriptive aria-label');

    // SpeedBox div has role="button" and tabindex="0" for keyboard activation
    assert.match(html, /id="speedBox"[^>]*role="button"/, 'speedBox must have role="button"');
    assert.match(html, /id="speedBox"[^>]*tabindex="0"/, 'speedBox must be keyboard focusable (tabindex="0")');
    assert.match(html, /id="speedBox"[^>]*aria-label="Cycle speed unit"/, 'speedBox must have aria-label');

    // Keyboard activation (Enter/Space) handled in renderer.js
    assert.match(renderer, /e\.key === 'Enter' \|\| e\.key === ' '/, 'speedBox must respond to Enter and Space keys');
  });

  // --------------------------------------------------------------------------
  // 3. Toggle Controls Expose State (aria-pressed / aria-checked)
  // --------------------------------------------------------------------------
  it('3. Toggle controls expose their current active state via aria-pressed and aria-checked', () => {
    // Main toggle tracking button
    assert.match(html, /id="toggle"[^>]*aria-pressed="false"/, 'Toggle button must have aria-pressed');
    assert.match(renderer, /els\.toggle\.setAttribute\('aria-pressed',\s*'true'\)/, 'Pause tracking must set aria-pressed="true"');
    assert.match(renderer, /els\.toggle\.setAttribute\('aria-pressed',\s*'false'\)/, 'Resume tracking must set aria-pressed="false"');

    // Unit toggle buttons
    assert.match(html, /class="unit-toggle-strip"[^>]*role="group"/, 'unit-toggle-strip must be role="group"');
    assert.match(renderer, /btn\.setAttribute\('aria-pressed',\s*'true'\)/, 'Active unit button must expose aria-pressed="true"');

    // Preset DPI chips
    assert.match(html, /class="dpi-preset-chips"[^>]*role="group"/, 'dpi-preset-chips must be role="group"');
    assert.match(renderer, /c\.setAttribute\('aria-pressed',\s*isActive \? 'true' : 'false'\)/, 'DPI chips must expose aria-pressed state');

    // Trend Metric and Range buttons
    assert.match(html, /class="trend-metrics-group"[^>]*role="group"/, 'trend-metrics-group must have role="group"');
    assert.match(html, /class="trend-range-group"[^>]*role="group"/, 'trend-range-group must have role="group"');
    assert.match(renderer, /els\.trendMetricBtns\.forEach/, 'renderer.js must manage trend metric button states');
    assert.match(renderer, /els\.trendRangeBtns\.forEach/, 'renderer.js must manage trend range button states');

    // AutoStart checkbox switch
    assert.match(html, /id="autoStartInput"[^>]*aria-label="Start with Windows on boot"/, 'autoStartInput must have an accessible label');
  });

  // --------------------------------------------------------------------------
  // 4. Tab Navigation and Tabpanels
  // --------------------------------------------------------------------------
  it('4. Intel navigation conforms to WAI-ARIA tablist/tab/tabpanel pattern', () => {
    assert.match(html, /<nav class="intel-tabs"[^>]*role="tablist"/, 'intel-tabs must have role="tablist"');
    assert.match(html, /id="tab-btn-apps"[^>]*role="tab"/, 'Tab buttons must have role="tab"');
    assert.match(html, /id="tab-btn-apps"[^>]*aria-controls="tab-apps"/, 'Tab buttons must have aria-controls matching panel id');
    assert.match(html, /id="tab-btn-apps"[^>]*aria-selected="true"/, 'Active tab button must have aria-selected="true"');

    assert.match(html, /id="tab-apps"[^>]*role="tabpanel"/, 'Tab panes must have role="tabpanel"');
    assert.match(html, /id="tab-apps"[^>]*aria-labelledby="tab-btn-apps"/, 'Tab panes must be aria-labelledby their tab button');
    assert.match(html, /id="tab-apps"[^>]*tabindex="0"/, 'Tab panels must be focusable (tabindex="0")');
  });

  // --------------------------------------------------------------------------
  // 5. Dialogs & Confirmation Screens
  // --------------------------------------------------------------------------
  it('5. Drawers have appropriate accessible dialog semantics and Escape key handling', () => {
    // Theme Drawer
    assert.match(html, /id="themeDrawer"[^>]*role="dialog"/, 'themeDrawer must have role="dialog"');
    assert.match(html, /id="themeDrawer"[^>]*aria-modal="true"/, 'themeDrawer must have aria-modal="true"');
    assert.match(html, /id="themeDrawer"[^>]*aria-labelledby="themeDrawerTitle"/, 'themeDrawer must be labelled by themeDrawerTitle');
    assert.match(html, /id="themeBtn"[^>]*aria-haspopup="dialog"/, 'themeBtn must have aria-haspopup="dialog"');
    assert.match(html, /id="themeBtn"[^>]*aria-expanded="false"/, 'themeBtn must have aria-expanded');

    // Settings Drawer
    assert.match(html, /id="settingsDrawer"[^>]*role="dialog"/, 'settingsDrawer must have role="dialog"');
    assert.match(html, /id="settingsDrawer"[^>]*aria-modal="true"/, 'settingsDrawer must have aria-modal="true"');
    assert.match(html, /id="settingsDrawer"[^>]*aria-labelledby="settingsDrawerTitle"/, 'settingsDrawer must be labelled by settingsDrawerTitle');
    assert.match(html, /id="settingsBtn"[^>]*aria-haspopup="dialog"/, 'settingsBtn must have aria-haspopup="dialog"');

    // Escape key handling
    assert.match(renderer, /e\.key === 'Escape'/, 'Escape key must close open drawers and cancel confirmation states');
  });

  // --------------------------------------------------------------------------
  // 6. Tracking Status Indicators
  // --------------------------------------------------------------------------
  it('6. Status badge exposes live/paused status to assistive technology', () => {
    assert.match(html, /id="statusBadge"[^>]*role="status"/, 'statusBadge must have role="status"');
    assert.match(html, /id="statusBadge"[^>]*aria-live="polite"/, 'statusBadge must have aria-live="polite"');
    assert.match(renderer, /els\.statusBadge\.setAttribute\('aria-label',\s*'System telemetry is active'\)/, 'Active state must announce active status');
    assert.match(renderer, /els\.statusBadge\.setAttribute\('aria-label',\s*'System telemetry is paused'\)/, 'Paused state must announce paused status');
  });

  // --------------------------------------------------------------------------
  // 7. Theme Controls
  // --------------------------------------------------------------------------
  it('7. Theme picker exposes accessible options with aria-pressed states', () => {
    assert.match(html, /class="theme-grid"[^>]*role="group"/, 'theme-grid must be role="group"');
    assert.match(html, /data-theme-name="cyber"[^>]*aria-pressed="true"/, 'Active theme card must have aria-pressed="true"');
    assert.match(html, /class="theme-swatch[^"]*"[^>]*aria-hidden="true"/, 'Visual swatches must be aria-hidden="true"');
    assert.match(renderer, /c\.setAttribute\('aria-pressed',\s*isActive \? 'true' : 'false'\)/, 'applyTheme must synchronize aria-pressed on theme cards');
  });

  // --------------------------------------------------------------------------
  // 8. Chart & Milestone Accessibility
  // --------------------------------------------------------------------------
  it('8. Canvas chart and progress bar provide accessible text and progressbar semantics', () => {
    assert.match(html, /id="chart"[^>]*role="img"/, 'Canvas chart must have role="img"');
    assert.match(html, /id="chart"[^>]*aria-label=/, 'Canvas chart must have an accessible description');
    assert.match(html, /<canvas id="chart"[^>]*>[\s\S]*?<p>Activity trend graph showing telemetry over time\.<\/p>[\s\S]*?<\/canvas>/, 'Canvas chart must have fallback text');

    assert.match(html, /id="chartTooltip"[^>]*role="status"/, 'Chart tooltip must have role="status"');
    assert.match(html, /id="chartTooltip"[^>]*aria-live="polite"/, 'Chart tooltip must have aria-live="polite"');

    assert.match(html, /id="milestoneProgressBar"[^>]*role="progressbar"/, 'Milestone progress bar must have role="progressbar"');
    assert.match(html, /id="milestoneProgressBar"[^>]*aria-valuemin="0"/, 'Milestone progress bar must have aria-valuemin="0"');
    assert.match(html, /id="milestoneProgressBar"[^>]*aria-valuemax="100"/, 'Milestone progress bar must have aria-valuemax="100"');
    assert.match(renderer, /els\.milestoneProgressBar\.setAttribute\('aria-valuenow'/, 'render() must dynamically update aria-valuenow on milestone progress bar');
  });

  // --------------------------------------------------------------------------
  // 9. Reduced-Motion Support
  // --------------------------------------------------------------------------
  it('9. styles.css maintains comprehensive prefers-reduced-motion support', () => {
    assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, 'prefers-reduced-motion media query must be present in styles.css');
    assert.match(css, /animation-duration:\s*0\.01ms\s*!important/, 'Animations must be minimized for users who prefer reduced motion');
    assert.match(css, /transition-duration:\s*0\.01ms\s*!important/, 'Transitions must be minimized for users who prefer reduced motion');
    assert.match(css, /scroll-behavior:\s*auto\s*!important/, 'Smooth scrolling must be disabled when reduced motion is preferred');
  });
});

