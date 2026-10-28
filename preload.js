const { contextBridge, ipcRenderer, clipboard } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onUpdate: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('stats:update', listener);
    return () => ipcRenderer.removeListener('stats:update', listener);
  },
  getStats: () => ipcRenderer.invoke('get-stats'),
  toggleRunning: () => ipcRenderer.invoke('toggle-running'),
  resetToday: () => ipcRenderer.invoke('reset-today'),
  getHistory: (days) => ipcRenderer.invoke('get-history', days),
  setDpi: (value) => ipcRenderer.invoke('set-dpi', value),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('set-always-on-top', flag),
  setCompactMode: (compact) => ipcRenderer.invoke('set-compact-mode', compact),
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
  setAutoStart: (flag) => ipcRenderer.invoke('set-auto-start', flag),
  getApps: (range) => ipcRenderer.invoke('get-apps', range),
  copyToClipboard: (text) => {
    if (typeof text !== 'string' || text.length > 100000) return false;
    clipboard.writeText(text);
    return true;
  },
});
