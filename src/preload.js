const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('copybridge', {
  getState: () => ipcRenderer.invoke('get-state'),
  setSyncEnabled: (value) => ipcRenderer.invoke('set-sync-enabled', value),
  connectManual: (value) => ipcRenderer.invoke('connect-manual', value),
  copyDiagnostics: () => ipcRenderer.invoke('copy-diagnostics'),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('state', listener);
    return () => ipcRenderer.removeListener('state', listener);
  },
});
