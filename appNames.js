// appNames.js — runs in the main process only.
// Maps an executable name (lowercased) to a friendly display name.
// Anything not listed falls back to a cleaned-up version of its own name,
// so unknown apps still show up sensibly instead of being dropped.

const APP_NAMES = {
  // Browsers
  'chrome.exe': 'Google Chrome',
  'msedge.exe': 'Microsoft Edge',
  'firefox.exe': 'Firefox',
  'brave.exe': 'Brave Browser',
  'opera.exe': 'Opera',
  'vivaldi.exe': 'Vivaldi',
  'arc.exe': 'Arc Browser',

  // Dev & Code Editors
  'code.exe': 'Visual Studio Code',
  'devenv.exe': 'Visual Studio',
  'idea64.exe': 'IntelliJ IDEA',
  'pycharm64.exe': 'PyCharm',
  'webstorm64.exe': 'WebStorm',
  'rider64.exe': 'JetBrains Rider',
  'clion64.exe': 'CLion',
  'goland64.exe': 'GoLand',
  'sublime_text.exe': 'Sublime Text',
  'notepad++.exe': 'Notepad++',
  'studio64.exe': 'Android Studio',
  'postman.exe': 'Postman',
  'docker desktop.exe': 'Docker Desktop',
  'gitkraken.exe': 'GitKraken',
  'antigravity ide.exe': 'Antigravity IDE',
  'windowsterminal.exe': 'Windows Terminal',
  'cmd.exe': 'Command Prompt',
  'powershell.exe': 'PowerShell',
  'pwsh.exe': 'PowerShell 7',
  'conhost.exe': 'Console Window',

  // AI & Chat Tools
  'claude.exe': 'Claude',
  'claude-code.exe': 'Claude Code',
  'chatgpt.exe': 'ChatGPT',
  'chatgpt classic.exe': 'ChatGPT Classic',

  // Communication & Social
  'discord.exe': 'Discord',
  'slack.exe': 'Slack',
  'teams.exe': 'Microsoft Teams',
  'ms-teams.exe': 'Microsoft Teams',
  'zoom.exe': 'Zoom',
  'telegram.exe': 'Telegram',
  'whatsapp.exe': 'WhatsApp',
  'skype.exe': 'Skype',

  // Productivity & Office
  'winword.exe': 'Microsoft Word',
  'excel.exe': 'Microsoft Excel',
  'powerpnt.exe': 'Microsoft PowerPoint',
  'onenote.exe': 'Microsoft OneNote',
  'outlook.exe': 'Outlook',
  'notion.exe': 'Notion',
  'obsidian.exe': 'Obsidian',
  'evernote.exe': 'Evernote',
  'notepad.exe': 'Notepad',

  // Creative & Media
  'photoshop.exe': 'Adobe Photoshop',
  'illustrator.exe': 'Adobe Illustrator',
  'premiere.exe': 'Adobe Premiere Pro',
  'afterfx.exe': 'Adobe After Effects',
  'figma.exe': 'Figma',
  'blender.exe': 'Blender',
  'canva.exe': 'Canva',
  'spotify.exe': 'Spotify',
  'vlc.exe': 'VLC Media Player',
  'netflix.exe': 'Netflix',
  'obs64.exe': 'OBS Studio',

  // Windows & Utilities
  'explorer.exe': 'File Explorer',
  'snippingtool.exe': 'Snipping Tool',
  'taskmgr.exe': 'Task Manager',
  'systemsettings.exe': 'Windows Settings',

  // Gaming
  'steam.exe': 'Steam',
  'epicgameslauncher.exe': 'Epic Games',
  'riotclientservices.exe': 'Riot Client',

  // The Watcher itself
  'electron.exe': 'The Watcher',
  'the watcher.exe': 'The Watcher',
  'the-watcher.exe': 'The Watcher',
};

function friendlyName(exeKey, fallbackName = null) {
  if (!exeKey || exeKey === 'unknown') return fallbackName || 'Unknown';
  const lower = exeKey.toLowerCase();
  if (APP_NAMES[lower]) return APP_NAMES[lower];
  if (fallbackName && fallbackName.trim() && !fallbackName.toLowerCase().endsWith('.exe')) {
    return fallbackName.trim();
  }
  // Fallback: "some-tool.exe" -> "Some-tool"
  const stripped = lower.replace(/\.(exe|app)$/i, '');
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

module.exports = { friendlyName, APP_NAMES };
