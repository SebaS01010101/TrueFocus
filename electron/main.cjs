const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('fs');
const axios = require('axios');

// --- CONFIGURACIÓN ---
const STATS_FILE = path.join(app.getPath('userData'), 'truefocus-stats.json');
const TB_HOST = 'http://iot.ceisufro.cl:8080';

// --- ESTADO GLOBAL ---
let activeWindowFn = null;
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
  } catch (e) { /* Ignorar errores de lectura inicial */ }
}

function saveStats() {
  try {
    // Convertimos a JSON con formato legible
    fs.writeFileSync(STATS_FILE, JSON.stringify(appUsageStats, null, 2));
  } catch (e) { /* Ignorar errores de escritura */ }
}

// --- IOT ---
async function getDeviceToken(userJwt) {
  const authConfig = { headers: { 'X-Authorization': `Bearer ${userJwt}` } };
  try {
    // 1. Obtener ID del cliente
    const userResp = await axios.get(`${TB_HOST}/api/auth/user`, authConfig);
    const customerId = userResp.data.customerId.id;
    
    // 2. Buscar dispositivos del cliente
    const devicesResp = await axios.get(
      `${TB_HOST}/api/customer/${customerId}/devices?pageSize=10&page=0`, 
      authConfig
    );
    
    if (!devicesResp.data.data.length) throw new Error("Sin dispositivos asignados.");
    
    const myDevice = devicesResp.data.data[0];
    currentDeviceId = myDevice.id.id;
    
    // 3. Obtener credenciales
    const credsResp = await axios.get(
      `${TB_HOST}/api/device/${currentDeviceId}/credentials`, 
      authConfig
    );
    
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
    width: 322,
    height: 700,
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

// --- TRACKING DE VENTANAS (NUEVA LIBRERÍA get-windows) ---
async function startAppTracking() {
  loadStats();

  if (!activeWindowFn) {
    try {
      // CAMBIO CLAVE: Usamos 'get-windows' en lugar de 'active-win'
      const mod = await import('get-windows');
      // Probamos exportaciones típicas de ESM
      activeWindowFn = mod.default || mod.activeWindow || mod;
      
      console.log("✅ Librería de tracking (get-windows) cargada correctamente.");
    } catch (e) {
      console.error("❌ Error cargando get-windows. Asegúrate de instalarlo con: pnpm add get-windows");
      console.error(e);
      return;
    }
  }

  // Bucle de monitoreo cada 1 segundo
  setInterval(async () => {
    try {
      if (!mainWindow || mainWindow.isDestroyed() || !activeWindowFn) return;

      const windowInfo = await activeWindowFn();

      if (!windowInfo) return; // Si no hay ventana activa detectable

      const appPath = windowInfo.owner.path;
      const appName = windowInfo.owner.name;
      const windowTitle = windowInfo.title;

      // 1. Obtener Icono (Solo si no lo tenemos ya en RAM o Disco)
      let iconDataUrl = iconCache.get(appPath);
      
      if (!iconDataUrl && appUsageStats[appName]?.icon) {
        iconDataUrl = appUsageStats[appName].icon; // Recuperar de persistencia
        iconCache.set(appPath, iconDataUrl);
      }

      if (!iconDataUrl) {
        try {
          // Electron nativo para extraer icono
          const nativeIcon = await app.getFileIcon(appPath);
          if (!nativeIcon.isEmpty()) {
            iconDataUrl = nativeIcon.toDataURL();
            iconCache.set(appPath, iconDataUrl);
          }
        } catch (e) { /* Icono no disponible, usar genérico */ }
      }

      // 2. Actualizar Estadísticas
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
      
      // Guardar icono nuevo en persistencia si apareció
      if (iconDataUrl && !appUsageStats[appName].icon) {
        appUsageStats[appName].icon = iconDataUrl;
      }

      // 3. Enviar al Frontend
      const sortedStats = Object.values(appUsageStats).sort((a, b) => b.seconds - a.seconds);
      
      // Descomenta para ver logs en vivo
      // console.log(`Enviando ${sortedStats.length} apps. Activa: ${appName}`);
      
      mainWindow.webContents.send('app-usage:update', sortedStats);

    } catch (error) {
      console.error("Tracking Loop Error:", error.message);
    }
  }, 1000);

  // Guardado automático en disco cada 10s
  setInterval(saveStats, 10000);
}

// --- ARRANQUE DE LA APP ---
app.whenReady().then(() => {
  createWindow();
  startAppTracking();
});

app.on('window-all-closed', () => {
  saveStats(); // Guardar al cerrar
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