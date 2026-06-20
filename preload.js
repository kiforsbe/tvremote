const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  openIpDialog: (ip)   => ipcRenderer.invoke('open-ip-dialog', ip),
  setNumpad:    (open) => ipcRenderer.invoke('set-numpad', open),
});
