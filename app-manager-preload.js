const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('appManagerAPI', {
  save:        (json)         => ipcRenderer.send('app-manager-save',   json),
  cancel:      ()             => ipcRenderer.send('app-manager-cancel'),
  getTvInfo:   (ip)           => ipcRenderer.invoke('get-tv-info',    ip),
  probeTvApps: (ip, appIds)   => ipcRenderer.invoke('probe-tv-apps',  ip, appIds),
});
