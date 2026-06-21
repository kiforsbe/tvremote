const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('appManagerAPI', {
  save:        (json)         => ipcRenderer.send('app-manager-save',   json),
  cancel:      ()             => ipcRenderer.send('app-manager-cancel'),
  minimize:    ()             => ipcRenderer.send('window-minimize'),
  maximize:    ()             => ipcRenderer.send('window-maximize'),
  onWindowState: (cb)        => ipcRenderer.on('window-state-changed', (_e, v) => cb(v)),
  getTvInfo:   (ip)           => ipcRenderer.invoke('get-tv-info',    ip),
  probeTvApps: (ip, appIds)   => ipcRenderer.invoke('probe-tv-apps',  ip, appIds),
});
