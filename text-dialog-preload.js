const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('textDialogAPI', {
  sendText: (text) => ipcRenderer.send('text-dialog-send-text', text),
  sendKey:  (key)  => ipcRenderer.send('text-dialog-send-key', key),
  end:      ()     => ipcRenderer.send('text-dialog-end'),
  close:    ()     => ipcRenderer.send('text-dialog-close'),
});
