const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('dialogAPI', {
  save:   (ip) => ipcRenderer.send('ip-dialog-save', ip),
  cancel: ()   => ipcRenderer.send('ip-dialog-cancel'),
});
