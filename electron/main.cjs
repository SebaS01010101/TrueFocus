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
 * - Query: keys=distancia_mm,presencia,temperatura_c,eco2_ppm,...
 * - Respuesta: pares `{ ts, value }` normalizados luego para el renderer
 */

require("dotenv").config();

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("fs");
const axios = require("axios");
const dbus = require("dbus-next");

const { Interface } = dbus.interface;

const STATS_FILE = path.join(app.getPath("userData"), "truefocus-stats.json");
const TB_HOST = "https://thingsboard.200.13.4.217.nip.io";
const DBUS_BRIDGE_NAME = "cl.ceisufro.TrueFocus.ActiveWindowBridge";
const DBUS_BRIDGE_PATH = "/cl/ceisufro/TrueFocus/ActiveWindowBridge";
const DBUS_BRIDGE_INTERFACE = "cl.ceisufro.TrueFocus.ActiveWindowBridge";
const KWIN_SCRIPT_PLUGIN = "truefocus-active-window-tracker";
const KWIN_SCRIPT_TEMPLATE = path.join(__dirname, "kwin-active-window.js");
const KWIN_SCRIPT_RUNTIME = path.join(
  app.getPath("userData"),
  "truefocus-kwin-active-window.js",
);
const DESKTOP_ENTRY_DIRS = [
  path.join(process.env.HOME || "", ".local/share/applications"),
  "/usr/local/share/applications",
  "/usr/share/applications",
];
const PRESENCE_TELEMETRY_KEY = "presencia";
const IOT_TELEMETRY_KEYS = Object.freeze([
  "distancia_mm",
  PRESENCE_TELEMETRY_KEY,
  "temperatura_c",
  "eco2_ppm",
  "focus_score",
  "entorno_score",
  "ergonomia_score",
  "co2_score",
  "pomodoro_status",
]);
const ACTIVE_ALARM_QUERY =
  "searchStatus=ACTIVE&pageSize=20&page=0&sortProperty=createdTime&sortOrder=DESC&fetchOriginator=false";

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

function isPlasmaWaylandSession() {
  const sessionType = (process.env.XDG_SESSION_TYPE || "").toLowerCase();
  const desktop =
    `${process.env.XDG_CURRENT_DESKTOP || ""} ${process.env.DESKTOP_SESSION || ""}`.toLowerCase();

  return (
    sessionType === "wayland" &&
    (desktop.includes("kde") || desktop.includes("plasma"))
  );
}

function normalizeDesktopFileId(desktopFileName) {
  if (!desktopFileName || typeof desktopFileName !== "string") {
    return "";
  }

  const baseName = path.basename(desktopFileName);
  return baseName.endsWith(".desktop")
    ? baseName.slice(0, -".desktop".length)
    : baseName;
}

function getDesktopEntryInfo(desktopFileName) {
  if (!desktopFileName || typeof desktopFileName !== "string") {
    return null;
  }

  if (desktopEntryCache.has(desktopFileName)) {
    return desktopEntryCache.get(desktopFileName);
  }

  const candidateNames = desktopFileName.endsWith(".desktop")
    ? [desktopFileName]
    : [desktopFileName, `${desktopFileName}.desktop`];

  let desktopEntryPath = null;

  if (path.isAbsolute(desktopFileName) && fs.existsSync(desktopFileName)) {
    desktopEntryPath = desktopFileName;
  } else {
    for (const dir of DESKTOP_ENTRY_DIRS) {
      if (!dir || !fs.existsSync(dir)) {
        continue;
      }

      const matchedPath = candidateNames
        .map((candidate) => path.join(dir, candidate))
        .find((candidatePath) => fs.existsSync(candidatePath));

      if (matchedPath) {
        desktopEntryPath = matchedPath;
        break;
      }
    }
  }

  if (!desktopEntryPath) {
    desktopEntryCache.set(desktopFileName, null);
    return null;
  }

  try {
    const desktopEntry = {
      path: desktopEntryPath,
      name: null,
    };
    const lines = fs.readFileSync(desktopEntryPath, "utf-8").split(/\r?\n/);
    let isDesktopEntrySection = false;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue;
      }

      if (/^\[.*\]$/.test(trimmedLine)) {
        isDesktopEntrySection = trimmedLine === "[Desktop Entry]";
        continue;
      }

      if (!isDesktopEntrySection) {
        continue;
      }

      if (!desktopEntry.name && trimmedLine.startsWith("Name=")) {
        desktopEntry.name = trimmedLine.slice("Name=".length).trim();
      }

      if (desktopEntry.name) {
        break;
      }
    }

    desktopEntryCache.set(desktopFileName, desktopEntry);
    return desktopEntry;
  } catch {
    desktopEntryCache.set(desktopFileName, null);
    return null;
  }
}

function getProcessExecutablePath(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }

  if (processPathCache.has(pid)) {
    return processPathCache.get(pid);
  }

  try {
    const executablePath = fs.readlinkSync(`/proc/${pid}/exe`);
    processPathCache.set(pid, executablePath);
    return executablePath;
  } catch {
    processPathCache.set(pid, null);
    return null;
  }
}

function buildKWinTrackedWindow(payload) {
  const desktopEntry = getDesktopEntryInfo(payload.desktopFileName);
  const fallbackName =
    normalizeDesktopFileId(payload.desktopFileName) ||
    payload.resourceClass ||
    payload.caption ||
    "Unknown";

  return {
    name: desktopEntry?.name || fallbackName,
    title: payload.caption || desktopEntry?.name || fallbackName,
    appPath: getProcessExecutablePath(payload.pid),
    desktopEntryPath: desktopEntry?.path || null,
  };
}

async function applyKWinActiveWindowPayload(payloadJson) {
  const revision = ++activeWindowRevision;

  if (!payloadJson) {
    currentActiveWindow = null;
    return;
  }

  try {
    const payload = JSON.parse(payloadJson);
    const nextActiveWindow = buildKWinTrackedWindow(payload);

    if (revision === activeWindowRevision) {
      currentActiveWindow = nextActiveWindow;
    }
  } catch (error) {
    console.error("Error al procesar ventana activa de KWin:", error.message);
  }
}

function buildX11TrackedWindow(windowInfo) {
  const appName = windowInfo?.owner?.name || windowInfo?.title || "Unknown";

  return {
    name: appName,
    title: windowInfo?.title || appName,
    appPath: windowInfo?.owner?.path || null,
    desktopEntryPath: null,
  };
}

async function refreshX11ActiveWindow() {
  if (!getWindowsLib) {
    currentActiveWindow = null;
    return;
  }

  try {
    const windowInfo = await getWindowsLib();
    currentActiveWindow = windowInfo ? buildX11TrackedWindow(windowInfo) : null;
  } catch {
    currentActiveWindow = null;
  }
}

async function ensureDbusBridge() {
  if (dbusBus) {
    return dbusBus;
  }

  const bus = dbus.sessionBus();
  bus.on("error", (error) => {
    console.error("Error de D-Bus:", error.message);
  });

  await bus.requestName(DBUS_BRIDGE_NAME);

  if (!dbusBridgeExported) {
    bus.export(DBUS_BRIDGE_PATH, new ActiveWindowBridge());
    dbusBridgeExported = true;
  }

  dbusBus = bus;
  return dbusBus;
}

function writeKWinScriptRuntimeFile() {
  const template = fs.readFileSync(KWIN_SCRIPT_TEMPLATE, "utf-8");
  const runtimeScript = template
    .replaceAll("__DBUS_SERVICE__", DBUS_BRIDGE_NAME)
    .replaceAll("__DBUS_PATH__", DBUS_BRIDGE_PATH)
    .replaceAll("__DBUS_INTERFACE__", DBUS_BRIDGE_INTERFACE);

  fs.writeFileSync(KWIN_SCRIPT_RUNTIME, runtimeScript);
  return KWIN_SCRIPT_RUNTIME;
}

async function startKWinActiveWindowProvider() {
  try {
    const bus = await ensureDbusBridge();
    const scriptPath = writeKWinScriptRuntimeFile();
    const scriptingObject = await bus.getProxyObject(
      "org.kde.KWin",
      "/Scripting",
    );

    kwinScripting = scriptingObject.getInterface("org.kde.kwin.Scripting");

    try {
      await kwinScripting.unloadScript(KWIN_SCRIPT_PLUGIN);
    } catch {
      /* Script previo no cargado */
    }

    const loadScriptReply = await bus.call(
      new dbus.Message({
        destination: "org.kde.KWin",
        path: "/Scripting",
        interface: "org.kde.kwin.Scripting",
        member: "loadScript",
        signature: "ss",
        body: [scriptPath, KWIN_SCRIPT_PLUGIN],
      }),
    );
    const scriptId = loadScriptReply.body[0];
    const scriptObject = await bus.getProxyObject(
      "org.kde.KWin",
      `/Scripting/Script${scriptId}`,
    );
    const scriptInterface = scriptObject.getInterface("org.kde.kwin.Script");

    await scriptInterface.run();

    return {
      type: "kwin",
      refresh: async () => {},
      stop: async () => {
        currentActiveWindow = null;

        if (!kwinScripting) {
          return;
        }

        try {
          await kwinScripting.unloadScript(KWIN_SCRIPT_PLUGIN);
        } catch {
          /* Script ya descargado */
        }
      },
    };
  } catch (error) {
    console.error("No se pudo iniciar tracking con KWin:", error.message);
    return null;
  }
}

async function startX11ActiveWindowProvider() {
  if (!getWindowsLib) {
    try {
      const mod = await import("get-windows");
      getWindowsLib = mod.activeWindow || mod.default?.activeWindow;
    } catch {
      return null;
    }
  }

  return {
    type: "x11",
    refresh: refreshX11ActiveWindow,
    stop: async () => {
      currentActiveWindow = null;
    },
  };
}

async function startActiveWindowProvider() {
  if (isPlasmaWaylandSession()) {
    const kwinProvider = await startKWinActiveWindowProvider();

    if (kwinProvider) {
      console.log("Tracking activo usando KWin en Plasma Wayland");
      return kwinProvider;
    }

    console.warn("Fallback a get-windows tras fallo de KWin");
  }

  const x11Provider = await startX11ActiveWindowProvider();

  if (x11Provider) {
    console.log("Tracking activo usando get-windows");
  }

  return x11Provider;
}

async function stopActiveWindowProvider() {
  if (activeWindowProvider?.stop) {
    await activeWindowProvider.stop();
  }

  activeWindowProvider = null;
  currentActiveWindow = null;
}

async function resolveTrackedWindowIcon(trackedWindow, currentHourStats) {
  const existingIcon = currentHourStats[trackedWindow.name]?.icon;
  if (existingIcon) {
    return existingIcon;
  }

  const iconSources = [
    trackedWindow.desktopEntryPath,
    trackedWindow.appPath,
  ].filter(Boolean);

  for (const iconSource of iconSources) {
    const cachedIcon = iconCache.get(iconSource);
    if (cachedIcon) {
      return cachedIcon;
    }
  }

  for (const iconSource of iconSources) {
    try {
      const nativeIcon = await app.getFileIcon(iconSource);
      if (!nativeIcon.isEmpty()) {
        const iconDataUrl = nativeIcon.toDataURL();
        iconCache.set(iconSource, iconDataUrl);
        return iconDataUrl;
      }
    } catch {
      /* No se pudo resolver el icono */
    }
  }

  return null;
}

async function recordActiveWindowUsage(trackedWindow) {
  const currentHourStats = getCurrentHourStats();
  const iconDataUrl = await resolveTrackedWindowIcon(
    trackedWindow,
    currentHourStats,
  );

  if (!currentHourStats[trackedWindow.name]) {
    currentHourStats[trackedWindow.name] = {
      name: trackedWindow.name,
      title: trackedWindow.title,
      icon: iconDataUrl,
      seconds: 0,
      lastActive: Date.now(),
    };
  }

  currentHourStats[trackedWindow.name].seconds += 1;
  currentHourStats[trackedWindow.name].lastActive = Date.now();
  currentHourStats[trackedWindow.name].title = trackedWindow.title;

  if (iconDataUrl && !currentHourStats[trackedWindow.name].icon) {
    currentHourStats[trackedWindow.name].icon = iconDataUrl;
  }
}

function getAggregatedStatsForCurrentDay() {
  const allHoursToday = getTodayAllHours();
  const aggregatedStats = {};

  for (const hour in allHoursToday) {
    for (const appName in allHoursToday[hour]) {
      if (!aggregatedStats[appName]) {
        aggregatedStats[appName] = {
          ...allHoursToday[hour][appName],
          seconds: 0,
        };
      }

      aggregatedStats[appName].seconds += allHoursToday[hour][appName].seconds;
    }
  }

  return Object.values(aggregatedStats).sort((a, b) => b.seconds - a.seconds);
}

// Configuración del dispositivo IoT TrueFocus
const DEVICE_CONFIG = {
  id: "816cb4f0-31b6-11f1-bf6b-e981cdecdeb1",
  accessToken: "4kwdakvsfqg08rl5wngz",
  name: "truefocus-desk-1",
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
let activeWindowProvider = null;
let currentActiveWindow = null;
let activeWindowRevision = 0;
let dbusBus = null;
let dbusBridgeExported = false;
let kwinScripting = null;

// Nueva estructura: { "YYYY-MM-DD": { "HH": { appName: { name, title, icon, seconds, lastActive } } } }
const appUsageStatsByDay = {};
const iconCache = new Map();
const desktopEntryCache = new Map();
const processPathCache = new Map();
let currentPresence = false; // Estado de presencia actual
let lastPresenceState = false; // Para detectar cambios
let currentDateKey = getDateKey();
const ALLOWED_RPC_METHODS = new Set(["setSessionState"]);

class ActiveWindowBridge extends Interface {
  constructor() {
    super(DBUS_BRIDGE_INTERFACE);
  }

  UpdateActiveWindow(payloadJson) {
    void applyKWinActiveWindowPayload(payloadJson);
    return true;
  }
}

ActiveWindowBridge.configureMembers({
  methods: {
    UpdateActiveWindow: {
      inSignature: "s",
      outSignature: "b",
    },
  },
});

function getLatestTelemetryEntry(data, key) {
  if (!data || !Array.isArray(data[key])) {
    return null;
  }

  return data[key][0] ?? null;
}

function parseTelemetryBoolean(entry) {
  if (!entry || typeof entry.value !== "string") {
    return false;
  }

  return entry.value === "true" || entry.value === "1";
}

async function fetchDeviceTelemetry(keys) {
  if (!currentUserJwt || !currentDeviceId) {
    return null;
  }

  const url = `${TB_HOST}/api/plugins/telemetry/DEVICE/${currentDeviceId}/values/timeseries?keys=${keys.join(",")}`;
  const response = await axios.get(url, {
    headers: { "X-Authorization": `Bearer ${currentUserJwt}` },
  });

  return response.data;
}

function normalizeIoTDataResponse(data) {
  if (!data) {
    return null;
  }

  return {
    distanceMm: getLatestTelemetryEntry(data, "distancia_mm"),
    presence: getLatestTelemetryEntry(data, PRESENCE_TELEMETRY_KEY),
    temperatureC: getLatestTelemetryEntry(data, "temperatura_c"),
    eco2Ppm: getLatestTelemetryEntry(data, "eco2_ppm"),
    focusScore: getLatestTelemetryEntry(data, "focus_score"),
    entornoScore: getLatestTelemetryEntry(data, "entorno_score"),
    ergonomiaScore: getLatestTelemetryEntry(data, "ergonomia_score"),
    co2Score: getLatestTelemetryEntry(data, "co2_score"),
    pomodoroStatus: getLatestTelemetryEntry(data, "pomodoro_status"),
  };
}

async function fetchActiveDeviceAlarms() {
  if (!currentUserJwt || !currentDeviceId) {
    return [];
  }

  const url = `${TB_HOST}/api/alarm/DEVICE/${currentDeviceId}?${ACTIVE_ALARM_QUERY}`;
  const response = await axios.get(url, {
    headers: { "X-Authorization": `Bearer ${currentUserJwt}` },
  });

  return Array.isArray(response.data?.data) ? response.data.data : [];
}

function normalizeAlarmResponse(alarm) {
  if (!alarm || typeof alarm !== "object") {
    return null;
  }

  return {
    id: alarm.id?.id || "",
    type: alarm.type || "UNKNOWN_ALARM",
    severity: alarm.severity || "WARNING",
    status: alarm.status || "ACTIVE_UNACK",
    createdTime: alarm.createdTime || alarm.startTs || null,
    startTs: alarm.startTs || alarm.createdTime || null,
    endTs: alarm.endTs || null,
    ackTs: alarm.ackTs || null,
    clearTs: alarm.clearTs || null,
    originatorName: alarm.originatorName || null,
    details: alarm.details || null,
  };
}

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
    width: 820,
    height: 640,
    minWidth: 760,
    minHeight: 620,
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
  activeWindowProvider = await startActiveWindowProvider();

  // Verificar presencia cada 2 segundos
  setInterval(async () => {
    if (isPollingPresence) return;
    if (currentUserJwt && currentDeviceId) {
      isPollingPresence = true;

      try {
        const telemetry = await fetchDeviceTelemetry([PRESENCE_TELEMETRY_KEY]);
        const presenceEntry = getLatestTelemetryEntry(
          telemetry,
          PRESENCE_TELEMETRY_KEY,
        );

        if (presenceEntry) {
          hasPresenceData = true;
          currentPresence = parseTelemetryBoolean(presenceEntry);

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

      if (!mainWindow || mainWindow.isDestroyed()) return;

      if (activeWindowProvider?.refresh) {
        await activeWindowProvider.refresh();
      }

      if (!currentActiveWindow) return;

      await recordActiveWindowUsage(currentActiveWindow);

      mainWindow.webContents.send(
        "app-usage:update",
        getAggregatedStatsForCurrentDay(),
      );
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
  void startAppTracking();
});

app.on("before-quit", () => {
  void stopActiveWindowProvider();
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
    const telemetry = await fetchDeviceTelemetry(IOT_TELEMETRY_KEYS);
    return normalizeIoTDataResponse(telemetry);
  } catch (error) {
    console.error("Error al obtener datos IoT:", error.message);
    return null;
  }
});

// IPC: Obtener alarmas activas desde ThingsBoard
ipcMain.handle("alarms:get-active", async () => {
  try {
    const alarms = await fetchActiveDeviceAlarms();
    return alarms.map(normalizeAlarmResponse).filter(Boolean);
  } catch (error) {
    console.error("Error al obtener alarmas activas:", error.message);
    return [];
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
