const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('appManagerAPI', {
  save:        (appsJson) => ipcRenderer.send('app-manager-save',   appsJson),
  cancel:      ()         => ipcRenderer.send('app-manager-cancel'),
  fetchTvApps: (ip)       => ipcRenderer.invoke('fetch-tv-apps', ip),
});
