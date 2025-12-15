/**
 * Preload Script - Puente seguro entre Electron y React
 *
 * Expone la API de ThingsBoard al renderer de forma segura
 * usando contextBridge para mantener contextIsolation.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  login: (credentials) => ipcRenderer.invoke("auth:login", credentials),
  sendPomodoroUpdate: (data) => ipcRenderer.invoke("telemetry:send", data),
  getIoTData: () => ipcRenderer.invoke("iot:get-data"),
  getTrackingStatus: () => ipcRenderer.invoke("tracking:get-status"),
  getDevMode: () => ipcRenderer.invoke("dev:get-mode"),
  sendRpcCommand: (command) => ipcRenderer.invoke("rpc:send-command", command),

  // Funciones de estadísticas por fecha
  getStatsByDate: (dateKey) => ipcRenderer.invoke("stats:get-by-date", dateKey),
  getStatsByDateHourly: (dateKey) =>
    ipcRenderer.invoke("stats:get-by-date-hourly", dateKey),
  getStatsDates: () => ipcRenderer.invoke("stats:get-dates"),
  getStatsDateRange: (range) =>
    ipcRenderer.invoke("stats:get-date-range", range),
  getWeeklySummary: (weekStartDate) =>
    ipcRenderer.invoke("stats:get-weekly-summary", weekStartDate),

  onAppUsageUpdate: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on("app-usage:update", subscription);
    return () => ipcRenderer.removeListener("app-usage:update", subscription);
  },

  onPresenceChanged: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on("presence:changed", subscription);
    return () => ipcRenderer.removeListener("presence:changed", subscription);
  },

  onDevAutoLogin: (callback) => {
    const subscription = (_event) => callback();
    ipcRenderer.on("dev:auto-login-success", subscription);
    return () =>
      ipcRenderer.removeListener("dev:auto-login-success", subscription);
  },
});
