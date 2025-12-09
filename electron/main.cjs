const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('fs');
const axios = require('axios');

// --- CONFIGURACIÓN ---
const STATS_FILE = path.join(app.getPath('userData'), 'truefocus-stats.json');
const TB_HOST = 'http://iot.ceisufro.cl:8080';

// --- ESTADO ---
let getWindowsLib = null; 
let mainWindow = null;
let currentDeviceToken = null;
let currentUserJwt = null;
let currentDeviceId = null;

const appUsageStats = {}; 
const iconCache = new Map(); 

// --- PERSISTENCIA ---
function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const data = fs.readFileSync(STATS_FILE, 'utf-8');
      Object.assign(appUsageStats, JSON.parse(data));
      console.log(`📂 Datos cargados: ${Object.keys(appUsageStats).length} apps.`);
    }
  } catch (e) { /* Ignorar errores de inicio */ }
}

function saveStats() {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(appUsageStats, null, 2));
  } catch (e) { /* Ignorar errores de escritura */ }
}

// --- IOT ---
async function getDeviceToken(userJwt) {
  const authConfig = { headers: { 'X-Authorization': `Bearer ${userJwt}` } };
  try {
    const userResp = await axios.get(`${TB_HOST}/api/auth/user`, authConfig);
    const customerId = userResp.data.customerId.id;
    const devicesResp = await axios.get(`${TB_HOST}/api/customer/${customerId}/devices?pageSize=10&page=0`, authConfig);
    
    if (!devicesResp.data.data.length) throw new Error("Sin dispositivos.");
    const myDevice = devicesResp.data.data[0];
    currentDeviceId = myDevice.id.id;
    
    const credsResp = await axios.get(`${TB_HOST}/api/device/${currentDeviceId}/credentials`, authConfig);
    return credsResp.data.credentialsId;
  } catch (error) {
    console.error("Error IoT:", error.message);
    throw error;
  }
}

// --- VENTANA PRINCIPAL ---
const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    // CAMBIO IMPORTANTE: Tamaño aumentado para el diseño de 2 columnas
    width: 950,
    height: 720,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'), 
    },
    // frame: false, // Descomenta si quieres quitar el marco de Windows
    // transparent: true,
  });

  if (isDev) mainWindow.loadURL('http://localhost:5173');
  else mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
}

// --- TRACKING LOOP ---
async function startAppTracking() {
  loadStats();

  if (!getWindowsLib) {
    try {
      const mod = await import('get-windows');
      getWindowsLib = mod.activeWindow || mod.default?.activeWindow;
      console.log("✅ Librería 'get-windows' lista.");
    } catch (e) {
      console.error("❌ Error importando get-windows:", e);
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

    } catch (error) {
      // console.error("Tracking Loop Error:", error.message);
    }
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

// --- IPC HANDLERS ---
ipcMain.handle('auth:login', async (event, { email, password }) => {
  try {
    const loginResp = await axios.post(`${TB_HOST}/api/auth/login`, { username: email, password });
    currentUserJwt = loginResp.data.token;
    currentDeviceToken = await getDeviceToken(currentUserJwt);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telemetry:send', async (event, data) => {
  if (!currentDeviceToken) return; 
  try {
    await axios.post(`${TB_HOST}/api/v1/${currentDeviceToken}/telemetry`, data);
  } catch (error) {}
});

ipcMain.handle('iot:get-data', async () => {
  if (!currentUserJwt || !currentDeviceId) return null;
  try {
    const url = `${TB_HOST}/api/plugins/telemetry/DEVICE/${currentDeviceId}/values/timeseries/latest?keys=distance,presence`;
    const resp = await axios.get(url, { headers: { 'X-Authorization': `Bearer ${currentUserJwt}` } });
    return {
      distance: resp.data.distance ? resp.data.distance[0] : null,
      presence: resp.data.presence ? resp.data.presence[0] : null
    };
  } catch (error) {
    return null;
  }
});