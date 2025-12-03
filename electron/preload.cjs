const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Función para Login
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),

  // Función para Telemetría
  sendPomodoroUpdate: (data) => ipcRenderer.invoke('telemetry:send', data)
});