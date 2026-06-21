const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  openIpDialog:         (ip)       => ipcRenderer.invoke('open-ip-dialog', ip),
  setNumpad:            (open)     => ipcRenderer.invoke('set-numpad', open),
  setIgnoreMouseEvents: (ignore)   => ipcRenderer.send('set-ignore-mouse-events', ignore),
  openAppManager:       (appsJson, ip) => ipcRenderer.invoke('open-app-manager', appsJson, ip),
  launchApp:            (ip, appId, metaTag) => ipcRenderer.invoke('launch-app', ip, appId, metaTag),
});
