const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  openIpDialog:         (ip)       => ipcRenderer.invoke('open-ip-dialog', ip),
  openTextDialog:       ()         => ipcRenderer.invoke('open-text-dialog'),
  setNumpad:            (open)     => ipcRenderer.invoke('set-numpad', open),
  setInteractiveBounds: (b)        => ipcRenderer.send('set-interactive-bounds', b),
  openAppManager:       (appsJson, ip, region) => ipcRenderer.invoke('open-app-manager', appsJson, ip, region),
  launchApp:            (ip, appId, metaTag) => ipcRenderer.invoke('launch-app', ip, appId, metaTag),
});
