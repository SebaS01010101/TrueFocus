const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
  sendPomodoroUpdate: (data) => ipcRenderer.invoke('telemetry:send', data),
  // Nueva función para pedir datos
  getIoTData: () => ipcRenderer.invoke('iot:get-data')
});