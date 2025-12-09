const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
  sendPomodoroUpdate: (data) => ipcRenderer.invoke('telemetry:send', data),
  getIoTData: () => ipcRenderer.invoke('iot:get-data'),
  
  // NUEVO: Escuchar actualizaciones de uso de apps
  onAppUsageUpdate: (callback) => {
    // Filtramos para evitar múltiples listeners
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('app-usage:update', subscription);
    
    // Función de limpieza para React (useEffect return)
    return () => ipcRenderer.removeListener('app-usage:update', subscription);
  }
});