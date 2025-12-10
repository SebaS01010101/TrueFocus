/**
 * Preload Script - Puente seguro entre Electron y React
 * 
 * Expone la API de ThingsBoard al renderer de forma segura
 * usando contextBridge para mantener contextIsolation.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
  sendPomodoroUpdate: (data) => ipcRenderer.invoke('telemetry:send', data),
  getIoTData: () => ipcRenderer.invoke('iot:get-data'),
  
  onAppUsageUpdate: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('app-usage:update', subscription);
    return () => ipcRenderer.removeListener('app-usage:update', subscription);
  }
});