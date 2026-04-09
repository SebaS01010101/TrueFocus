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

require("dotenv").config();

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("fs");
const axios = require("axios");

const STATS_FILE = path.join(app.getPath("userData"), "truefocus-stats.json");
const TB_HOST = "http://iot.ceisufro.cl:8080";

function padDatePart(value) {
  return value.toString().padStart(2, "0");
}

// Función auxiliar para obtener fecha local en formato YYYY-MM-DD
function getDateKey(date = new Date()) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey
    .split("-")
    .map((part) => Number.parseInt(part, 10));

  return new Date(year, month - 1, day);
}

// Configuración del dispositivo IoT TrueFocus
const DEVICE_CONFIG = {
  id: "76f07260-cb35-11f0-a6b4-77216114eb61",
  accessToken: "354ee7omsirwgui3zdzx",
  name: "Prototipo-TrueFocus",
};

// Modo desarrollo - Auto-login
const DEV_MODE = process.env.DEV_MODE === "true";
const DEV_CREDENTIALS = {
  email: process.env.DEV_EMAIL || "",
  password: process.env.DEV_PASSWORD || "",
};

let getWindowsLib = null;
let mainWindow = null;
let currentDeviceToken = DEVICE_CONFIG.accessToken; // Usar token directo del dispositivo
let currentUserJwt = null;
let currentDeviceId = DEVICE_CONFIG.id; // Usar ID directo del dispositivo
let hasPresenceData = false;
let isPollingPresence = false;
let isTrackingActiveWindow = false;

// Nueva estructura: { "YYYY-MM-DD": { "HH": { appName: { name, title, icon, seconds, lastActive } } } }
const appUsageStatsByDay = {};
const iconCache = new Map();
let currentPresence = false; // Estado de presencia actual
let lastPresenceState = false; // Para detectar cambios
let currentDateKey = getDateKey();
const ALLOWED_RPC_METHODS = new Set(["setSessionState"]);

function isValidRpcCommand(command) {
  if (!command || typeof command !== "object") {
    return false;
  }

  const { method, params } = command;

  if (!ALLOWED_RPC_METHODS.has(method)) {
    return false;
  }

  if (!params || typeof params !== "object") {
    return false;
  }

  return (
    typeof params.status === "string" &&
    typeof params.duration_sec === "number" &&
    Number.isFinite(params.duration_sec)
  );
}

function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const data = fs.readFileSync(STATS_FILE, "utf-8");
      const loaded = JSON.parse(data);

      // Si el archivo tiene el formato antiguo (sin fechas), migrar
      if (
        loaded &&
        !Object.keys(loaded).some((key) => /^\d{4}-\d{2}-\d{2}$/.test(key))
      ) {
        // Formato muy antiguo, migrar al nuevo con fecha y hora de hoy
        const currentHour = new Date().getHours().toString();
        appUsageStatsByDay[currentDateKey] = { [currentHour]: loaded };
        console.log("📦 Migrado formato muy antiguo de estadísticas");
      } else {
        // Verificar si tiene formato por hora o solo por día
        Object.keys(loaded).forEach((dateKey) => {
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
            const dayData = loaded[dateKey];
            // Verificar si tiene estructura por hora
            const hasHourlyStructure = Object.keys(dayData).some((key) =>
              /^\d{1,2}$/.test(key),
            );

            if (!hasHourlyStructure) {
              // Migrar de formato por día a formato por hora
              const currentHour = new Date().getHours().toString();
              appUsageStatsByDay[dateKey] = { [currentHour]: dayData };
              console.log(`📦 Migrado día ${dateKey} a formato por hora`);
            } else {
              // Ya tiene formato por hora
              appUsageStatsByDay[dateKey] = dayData;
            }
          }
        });
      }
    }
  } catch (err) {
    console.error("Error al cargar el archivo de estadísticas:", err);
  }
}

function saveStats() {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(appUsageStatsByDay, null, 2));
  } catch {
    /* Error de escritura */
  }
}

// Obtener estadísticas del día y hora actual
function getCurrentHourStats() {
  const currentHour = new Date().getHours().toString();

  if (!appUsageStatsByDay[currentDateKey]) {
    appUsageStatsByDay[currentDateKey] = {};
  }
  if (!appUsageStatsByDay[currentDateKey][currentHour]) {
    appUsageStatsByDay[currentDateKey][currentHour] = {};
  }

  return appUsageStatsByDay[currentDateKey][currentHour];
}

// Obtener todas las estadísticas del día (todas las horas)
function getTodayAllHours() {
  if (!appUsageStatsByDay[currentDateKey]) {
    appUsageStatsByDay[currentDateKey] = {};
  }
  return appUsageStatsByDay[currentDateKey];
}

/**
 * Ya no necesitamos buscar el dispositivo dinámicamente,
 * usamos el dispositivo específico configurado al inicio.
 */

const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 950,
    height: 720,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Auto-login en modo desarrollo
  if (DEV_MODE && DEV_CREDENTIALS.email && DEV_CREDENTIALS.password) {
    mainWindow.webContents.once("did-finish-load", async () => {
      console.log("🔧 DEV MODE: Auto-login activado");
      try {
        const loginResp = await axios.post(`${TB_HOST}/api/auth/login`, {
          username: DEV_CREDENTIALS.email,
          password: DEV_CREDENTIALS.password,
        });
        currentUserJwt = loginResp.data.token;
        console.log("✅ DEV MODE: Login exitoso");

        // Enviar auto-login al renderer
        mainWindow.webContents.send("dev:auto-login-success");
      } catch (error) {
        console.error("❌ DEV MODE: Error en auto-login:", error.message);
        mainWindow.webContents.send("dev:auto-login-error", {
          success: false,
          error: error.message,
        });
      }
    });
  }
}

async function startAppTracking() {
  loadStats();

  if (!getWindowsLib) {
    try {
      const mod = await import("get-windows");
      getWindowsLib = mod.activeWindow || mod.default?.activeWindow;
    } catch {
      return;
    }
  }

  // Verificar presencia cada 2 segundos
  setInterval(async () => {
    if (isPollingPresence) return;
    if (currentUserJwt && currentDeviceId) {
      isPollingPresence = true;

      try {
        const url = `${TB_HOST}/api/plugins/telemetry/DEVICE/${currentDeviceId}/values/timeseries?keys=presence`;
        const resp = await axios.get(url, {
          headers: { "X-Authorization": `Bearer ${currentUserJwt}` },
        });

        if (resp.data.presence && resp.data.presence[0]) {
          hasPresenceData = true;
          const presenceValue = resp.data.presence[0].value;
          currentPresence = presenceValue === "true" || presenceValue === "1";

          // Notificar al renderer si cambió el estado
          if (currentPresence !== lastPresenceState) {
            lastPresenceState = currentPresence;
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("presence:changed", {
                isPresent: currentPresence,
                timestamp: Date.now(),
              });
            }
          }
        }
      } catch {
        if (!hasPresenceData) {
          isPollingPresence = false;
          return;
        }

        // Si falla, asumir que no hay presencia
        const previousState = currentPresence;
        currentPresence = false;
        if (
          previousState !== currentPresence &&
          mainWindow &&
          !mainWindow.isDestroyed()
        ) {
          lastPresenceState = currentPresence;
          mainWindow.webContents.send("presence:changed", {
            isPresent: currentPresence,
            timestamp: Date.now(),
          });
        }
      } finally {
        isPollingPresence = false;
      }
    }
  }, 2000);

  setInterval(async () => {
    if (isTrackingActiveWindow) return;
    isTrackingActiveWindow = true;

    try {
      // Verificar si cambió el día
      const newDateKey = getDateKey();
      if (newDateKey !== currentDateKey) {
        currentDateKey = newDateKey;
        console.log(`📅 Nuevo día detectado: ${currentDateKey}`);
      }

      // Solo trackear si hay presencia detectada
      if (!currentPresence) return;

      if (!mainWindow || mainWindow.isDestroyed() || !getWindowsLib) return;

      const windowInfo = await getWindowsLib();
      if (!windowInfo) return;

      const appPath = windowInfo.owner.path;
      const appName = windowInfo.owner.name;
      const windowTitle = windowInfo.title;

      const currentHourStats = getCurrentHourStats();

      let iconDataUrl = iconCache.get(appPath);
      if (!iconDataUrl && currentHourStats[appName]?.icon) {
        iconDataUrl = currentHourStats[appName].icon;
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

      if (!currentHourStats[appName]) {
        currentHourStats[appName] = {
          name: appName,
          title: windowTitle,
          icon: iconDataUrl || null,
          seconds: 0,
          lastActive: Date.now(),
        };
      }

      currentHourStats[appName].seconds += 1;
      currentHourStats[appName].lastActive = Date.now();
      currentHourStats[appName].title = windowTitle;

      if (iconDataUrl && !currentHourStats[appName].icon) {
        currentHourStats[appName].icon = iconDataUrl;
      }

      // Obtener stats agregadas del día completo para el display
      const allHoursToday = getTodayAllHours();
      const aggregatedStats = {};

      for (const hour in allHoursToday) {
        for (const app in allHoursToday[hour]) {
          if (!aggregatedStats[app]) {
            aggregatedStats[app] = { ...allHoursToday[hour][app], seconds: 0 };
          }
          aggregatedStats[app].seconds += allHoursToday[hour][app].seconds;
        }
      }

      const sortedStats = Object.values(aggregatedStats).sort(
        (a, b) => b.seconds - a.seconds,
      );
      mainWindow.webContents.send("app-usage:update", sortedStats);
    } catch {
      /* Ventana no disponible */
    } finally {
      isTrackingActiveWindow = false;
    }
  }, 1000);

  setInterval(saveStats, 10000);
}

app.whenReady().then(() => {
  createWindow();
  startAppTracking();
});

app.on("window-all-closed", () => {
  saveStats();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC: Autenticación con ThingsBoard
ipcMain.handle("auth:login", async (_event, { email, password }) => {
  try {
    const loginResp = await axios.post(`${TB_HOST}/api/auth/login`, {
      username: email,
      password,
    });
    currentUserJwt = loginResp.data.token;
    // El token del dispositivo ya está configurado
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC: Verificar si está en modo desarrollo
ipcMain.handle("dev:get-mode", () => {
  return {
    isDevMode: DEV_MODE,
    hasCredentials: !!(DEV_CREDENTIALS.email && DEV_CREDENTIALS.password),
  };
});

// IPC: Verificar si está en modo desarrollo
ipcMain.handle("dev:check-mode", () => {
  return {
    isDevMode: process.env.DEV_MODE === "true",
    hasCredentials: !!(process.env.DEV_EMAIL && process.env.DEV_PASSWORD),
  };
});

// IPC: Enviar telemetría del Pomodoro a ThingsBoard
ipcMain.handle("telemetry:send", async (_event, data) => {
  if (!currentDeviceToken) return;
  try {
    await axios.post(`${TB_HOST}/api/v1/${currentDeviceToken}/telemetry`, data);
  } catch {
    /* Fallo silencioso */
  }
});

// IPC: Leer datos de sensores IoT desde ThingsBoard
ipcMain.handle("iot:get-data", async () => {
  if (!currentUserJwt || !currentDeviceId) return null;

  try {
    // Leer telemetría usando el endpoint de plugins con autenticación JWT
    const url = `${TB_HOST}/api/plugins/telemetry/DEVICE/${currentDeviceId}/values/timeseries?keys=distance,presence`;
    const resp = await axios.get(url, {
      headers: { "X-Authorization": `Bearer ${currentUserJwt}` },
    });

    return {
      distance: resp.data.distance?.[0] ?? null,
      presence: resp.data.presence?.[0] ?? null,
    };
  } catch (error) {
    console.error("Error al obtener datos IoT:", error.message);
    return null;
  }
});

// IPC: Obtener estado actual de tracking
ipcMain.handle("tracking:get-status", () => {
  return {
    isTracking: hasPresenceData ? currentPresence : true,
    presenceDetected: hasPresenceData ? currentPresence : true,
    hasPresenceData,
  };
});

// IPC: Obtener estadísticas por fecha (agregadas por app, todas las horas)
ipcMain.handle("stats:get-by-date", async (_event, dateKey) => {
  const dayData = appUsageStatsByDay[dateKey] || {};
  const aggregatedStats = {};

  // Agregar todas las horas
  for (const hour in dayData) {
    for (const app in dayData[hour]) {
      if (!aggregatedStats[app]) {
        aggregatedStats[app] = { ...dayData[hour][app], seconds: 0 };
      }
      aggregatedStats[app].seconds += dayData[hour][app].seconds;
    }
  }

  return aggregatedStats;
});

// IPC: Obtener estadísticas por fecha y hora
ipcMain.handle("stats:get-by-date-hourly", async (_event, dateKey) => {
  return appUsageStatsByDay[dateKey] || {};
});

// IPC: Obtener todas las fechas con estadísticas
ipcMain.handle("stats:get-dates", async () => {
  return Object.keys(appUsageStatsByDay).sort().reverse();
});

// IPC: Obtener estadísticas de un rango de fechas
ipcMain.handle(
  "stats:get-date-range",
  async (_event, { startDate, endDate }) => {
    const result = {};
    const dates = Object.keys(appUsageStatsByDay)
      .filter((date) => date >= startDate && date <= endDate)
      .sort();

    for (const date of dates) {
      const dayData = appUsageStatsByDay[date];
      const aggregatedStats = {};

      // Agregar todas las horas
      for (const hour in dayData) {
        for (const app in dayData[hour]) {
          if (!aggregatedStats[app]) {
            aggregatedStats[app] = { ...dayData[hour][app], seconds: 0 };
          }
          aggregatedStats[app].seconds += dayData[hour][app].seconds;
        }
      }

      result[date] = aggregatedStats;
    }

    return result;
  },
);

// IPC: Obtener resumen semanal
ipcMain.handle("stats:get-weekly-summary", async (_event, weekStartDate) => {
  const summary = {
    dates: [],
    totalSeconds: 0,
    dailyTotals: {},
    topApps: {},
  };

  // Calcular 7 días desde weekStartDate
  const startDate = parseDateKey(weekStartDate);

  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateKey = getDateKey(date);

    summary.dates.push(dateKey);
    summary.dailyTotals[dateKey] = 0;

    const dayData = appUsageStatsByDay[dateKey];
    if (dayData) {
      // Iterar por todas las horas del día
      for (const hour in dayData) {
        for (const appName in dayData[hour]) {
          const app = dayData[hour][appName];
          summary.totalSeconds += app.seconds;
          summary.dailyTotals[dateKey] += app.seconds;

          if (!summary.topApps[appName]) {
            summary.topApps[appName] = {
              name: app.name,
              icon: app.icon,
              seconds: 0,
            };
          }
          summary.topApps[appName].seconds += app.seconds;
        }
      }
    }
  }

  return summary;
});

// IPC: Enviar comando RPC al dispositivo Arduino
ipcMain.handle("rpc:send-command", async (_event, { method, params }) => {
  if (!currentUserJwt || !currentDeviceId) {
    return {
      success: false,
      error: "No hay autenticación o dispositivo configurado",
    };
  }

  if (!isValidRpcCommand({ method, params })) {
    return {
      success: false,
      error: "Comando RPC inválido",
    };
  }

  try {
    const rpcPayload = {
      method,
      params,
      timeout: 5000,
    };

    const url = `${TB_HOST}/api/plugins/rpc/oneway/${currentDeviceId}`;
    await axios.post(url, rpcPayload, {
      headers: {
        "X-Authorization": `Bearer ${currentUserJwt}`,
        "Content-Type": "application/json",
      },
    });

    console.log(`✅ RPC enviado: ${method}`, params);
    return { success: true };
  } catch (error) {
    console.error("❌ Error al enviar RPC:", error.message);
    return { success: false, error: error.message };
  }
});
