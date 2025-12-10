/**
 * TrueFocus - Electron Main Process
 * 
 * Este archivo maneja la comunicación con ThingsBoard IoT Platform.
 * 
 * ## Integración con ThingsBoard
 * 
 * ### Autenticación
 * - Endpoint: POST /api/auth/login
 * - Body: { username: email, password }
 * - Respuesta: { token: JWT }
 * 
 * ### Obtener dispositivos del cliente
 * - Endpoint: GET /api/customer/{customerId}/devices
 * - Header: X-Authorization: Bearer {JWT}
 * 
 * ### Credenciales del dispositivo
 * - Endpoint: GET /api/device/{deviceId}/credentials
 * - Retorna: { credentialsId: deviceToken }
 * 
 * ### Enviar telemetría
 * - Endpoint: POST /api/v1/{deviceToken}/telemetry
 * - Body: { status, timeLeft, timestamp }
 * 
 * ### Leer telemetría (sensores IoT)
 * - Endpoint: GET /api/plugins/telemetry/DEVICE/{deviceId}/values/timeseries/latest
 * - Query: keys=distance,presence
 * - Respuesta: { distance: [{ ts, value }], presence: [{ ts, value }] }
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('fs');
const axios = require('axios');

const STATS_FILE = path.join(app.getPath('userData'), 'truefocus-stats.json');
const TB_HOST = 'http://iot.ceisufro.cl:8080';

let getWindowsLib = null;
let mainWindow = null;
let currentDeviceToken = null;
let currentUserJwt = null;
let currentDeviceId = null;

const appUsageStats = {};
const iconCache = new Map();

function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const data = fs.readFileSync(STATS_FILE, 'utf-8');
      Object.assign(appUsageStats, JSON.parse(data));
    }
  } catch (err) {
    console.error('Error al cargar el archivo de estadísticas:', err);
  }
}

function saveStats() {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(appUsageStats, null, 2));
  } catch { /* Error de escritura */ }
}

/**
 * Obtiene el token del dispositivo ThingsBoard para enviar telemetría.
 * Flujo: Usuario JWT -> Customer ID -> Dispositivos -> Credenciales
 */
async function getDeviceToken(userJwt) {
  const authConfig = { headers: { 'X-Authorization': `Bearer ${userJwt}` } };
  
  const userResp = await axios.get(`${TB_HOST}/api/auth/user`, authConfig);
  const customerId = userResp.data.customerId.id;
  
  const devicesResp = await axios.get(
    `${TB_HOST}/api/customer/${customerId}/devices?pageSize=10&page=0`, 
    authConfig
  );
  
  if (!devicesResp.data.data.length) {
    throw new Error('No hay dispositivos asignados al usuario');
  }
  
  const myDevice = devicesResp.data.data[0];
  currentDeviceId = myDevice.id.id;
  
  const credsResp = await axios.get(
    `${TB_HOST}/api/device/${currentDeviceId}/credentials`, 
    authConfig
  );
  
  return credsResp.data.credentialsId;
}

const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 950,
    height: 720,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

async function startAppTracking() {
  loadStats();

  if (!getWindowsLib) {
    try {
      const mod = await import('get-windows');
      getWindowsLib = mod.activeWindow || mod.default?.activeWindow;
    } catch {
      return;
    }
  }

  setInterval(async () => {
    try {
      if (!mainWindow || mainWindow.isDestroyed() || !getWindowsLib) return;

      const windowInfo = await getWindowsLib();
      if (!windowInfo) return; 

      const appPath = windowInfo.owner.path;
      const appName = windowInfo.owner.name;
      const windowTitle = windowInfo.title;

      let iconDataUrl = iconCache.get(appPath);
      if (!iconDataUrl && appUsageStats[appName]?.icon) {
        iconDataUrl = appUsageStats[appName].icon;
        iconCache.set(appPath, iconDataUrl);
      }

      if (!iconDataUrl) {
        try {
          const nativeIcon = await app.getFileIcon(appPath);
          if (!nativeIcon.isEmpty()) {
            iconDataUrl = nativeIcon.toDataURL();
            iconCache.set(appPath, iconDataUrl);
          }
        } catch (e) {}
      }

      if (!appUsageStats[appName]) {
        appUsageStats[appName] = {
          name: appName,
          title: windowTitle,
          icon: iconDataUrl || null,
          seconds: 0,
          lastActive: Date.now()
        };
      }
      
      appUsageStats[appName].seconds += 1;
      appUsageStats[appName].lastActive = Date.now();
      appUsageStats[appName].title = windowTitle;
      
      if (iconDataUrl && !appUsageStats[appName].icon) {
        appUsageStats[appName].icon = iconDataUrl;
      }

      const sortedStats = Object.values(appUsageStats).sort((a, b) => b.seconds - a.seconds);
      mainWindow.webContents.send('app-usage:update', sortedStats);
    } catch { /* Ventana no disponible */ }
  }, 1000);

  setInterval(saveStats, 10000);
}

app.whenReady().then(() => {
  createWindow();
  startAppTracking();
});

app.on('window-all-closed', () => {
  saveStats();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC: Autenticación con ThingsBoard
ipcMain.handle('auth:login', async (_event, { email, password }) => {
  try {
    const loginResp = await axios.post(`${TB_HOST}/api/auth/login`, { 
      username: email, 
      password 
    });
    currentUserJwt = loginResp.data.token;
    currentDeviceToken = await getDeviceToken(currentUserJwt);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC: Enviar telemetría del Pomodoro a ThingsBoard
ipcMain.handle('telemetry:send', async (_event, data) => {
  if (!currentDeviceToken) return;
  try {
    await axios.post(`${TB_HOST}/api/v1/${currentDeviceToken}/telemetry`, data);
  } catch { /* Fallo silencioso */ }
});

// IPC: Leer datos de sensores IoT desde ThingsBoard
ipcMain.handle('iot:get-data', async () => {
  if (!currentUserJwt || !currentDeviceId) return null;
  
  try {
    const url = `${TB_HOST}/api/plugins/telemetry/DEVICE/${currentDeviceId}/values/timeseries/latest?keys=distance,presence`;
    const resp = await axios.get(url, { 
      headers: { 'X-Authorization': `Bearer ${currentUserJwt}` } 
    });
    
    return {
      distance: resp.data.distance?.[0] ?? null,
      presence: resp.data.presence?.[0] ?? null,
    };
  } catch {
    return null;
  }
});