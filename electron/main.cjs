const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const axios = require('axios');

const TB_HOST = 'http://iot.ceisufro.cl:8080';

// Variables globales para mantener la sesión
let currentDeviceToken = null;
let currentUserJwt = null;
let currentDeviceId = null;

async function getDeviceToken(userJwt) {
  const authConfig = { headers: { 'X-Authorization': `Bearer ${userJwt}` } };
  try {
    const userResp = await axios.get(`${TB_HOST}/api/auth/user`, authConfig);
    const customerId = userResp.data.customerId.id;
    
    console.log("Usuario identificado. Customer ID:", customerId);
    
    const devicesResp = await axios.get(
      `${TB_HOST}/api/customer/${customerId}/devices?pageSize=10&page=0`, 
      authConfig
    );
    
    const devices = devicesResp.data.data;

    if (!devices || devices.length === 0) {
      throw new Error("Este usuario no tiene ningún dispositivo asignado en ThingsBoard.");
    }

    const myDevice = devices[0];
    currentDeviceId = myDevice.id.id; // GUARDAMOS EL ID DEL DISPOSITIVO
    console.log(`Dispositivo encontrado: ${myDevice.name} (ID: ${currentDeviceId})`);
    
    const credsResp = await axios.get(
      `${TB_HOST}/api/device/${currentDeviceId}/credentials`, 
      authConfig
    );
    
    return credsResp.data.credentialsId;

  } catch (error) {
    console.error("Error al obtener dispositivo:", error.response?.data || error.message);
    throw error;
  }
}

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'), 
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- IPC HANDLERS ---

// 1. LOGIN
ipcMain.handle('auth:login', async (event, { email, password }) => {
  try {
    console.log(`Intentando login para: ${email} en ${TB_HOST}`);
    
    const loginResp = await axios.post(`${TB_HOST}/api/auth/login`, { 
      username: email, 
      password: password 
    });
    
    currentUserJwt = loginResp.data.token; // GUARDAMOS EL TOKEN DE USUARIO
    currentDeviceToken = await getDeviceToken(currentUserJwt);
    
    console.log("¡Conexión IoT Exitosa!");
    return { success: true };

  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    console.error("Fallo en login/dispositivo:", msg);
    return { success: false, error: msg };
  }
});

// 2. ENVIAR TELEMETRÍA
ipcMain.handle('telemetry:send', async (event, data) => {
  if (!currentDeviceToken) return; 
  try {
    await axios.post(`${TB_HOST}/api/v1/${currentDeviceToken}/telemetry`, data);
  } catch (error) {
    console.error("Error enviando telemetría:", error.message);
  }
});

// 3. OBTENER DATOS IOT (NUEVO)
ipcMain.handle('iot:get-data', async () => {
  if (!currentUserJwt || !currentDeviceId) return null;

  try {
    const config = { headers: { 'X-Authorization': `Bearer ${currentUserJwt}` } };
    // Pedimos las últimas series de tiempo para las claves 'distance' y 'presence'
    const url = `${TB_HOST}/api/plugins/telemetry/DEVICE/${currentDeviceId}/values/timeseries/latest?keys=distance,presence`;
    
    const resp = await axios.get(url, config);
    
    // ThingsBoard devuelve un objeto tipo: { distance: [{ts:..., value:...}], presence: [...] }
    const data = resp.data;
    
    return {
      distance: data.distance ? data.distance[0] : null,
      presence: data.presence ? data.presence[0] : null
    };
  } catch (error) {
    console.error("Error leyendo IoT:", error.message);
    return null;
  }
});