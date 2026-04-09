/**
 * Definiciones de tipos para el renderer (React)
 *
 * Estas interfaces definen la API expuesta por Electron
 * a través del preload script usando contextBridge.
 */

import type {
  LoginCredentials,
  LoginResult,
  PomodoroTelemetry,
  AppUsageItem,
} from "./shared/types";

/**
 * Respuesta de sensores IoT desde ThingsBoard
 *
 * Obtenida de: GET /api/plugins/telemetry/DEVICE/{deviceId}/values/timeseries/latest
 */
export interface TelemetryValue {
  ts: number;
  value: string;
}

export interface IoTDataResponse {
  /** Distancia detectada por el sensor en milímetros */
  distanceMm?: TelemetryValue | null;
  /** Presencia detectada por ThingsBoard */
  presence?: TelemetryValue | null;
  /** Temperatura ambiente en grados Celsius */
  temperatureC?: TelemetryValue | null;
  /** eCO2 en ppm */
  eco2Ppm?: TelemetryValue | null;
  /** Score global de foco calculado en ThingsBoard */
  focusScore?: TelemetryValue | null;
  /** Score de entorno calculado en ThingsBoard */
  entornoScore?: TelemetryValue | null;
  /** Score ergonómico calculado en ThingsBoard */
  ergonomiaScore?: TelemetryValue | null;
  /** Score de CO2 calculado en ThingsBoard */
  co2Score?: TelemetryValue | null;
  /** Estado del pomodoro reflejado por el dispositivo */
  pomodoroStatus?: TelemetryValue | null;
}

/**
 * Estado de tracking de aplicaciones
 */
export interface TrackingStatus {
  /** Si el tracking está activo (basado en presencia) */
  isTracking: boolean;
  /** Si hay presencia detectada */
  presenceDetected: boolean;
  /** Si ya existe una lectura válida de presencia */
  hasPresenceData: boolean;
}

/**
 * Evento de cambio de presencia
 */
export interface PresenceChangedEvent {
  /** Si hay presencia detectada */
  isPresent: boolean;
  /** Timestamp del evento */
  timestamp: number;
}

export type AlarmSeverity =
  | "CRITICAL"
  | "MAJOR"
  | "MINOR"
  | "WARNING"
  | "INDETERMINATE";

export type AlarmStatus =
  | "ACTIVE_UNACK"
  | "ACTIVE_ACK"
  | "CLEARED_UNACK"
  | "CLEARED_ACK";

export interface DeviceAlarm {
  id: string;
  type: string;
  severity: AlarmSeverity;
  status: AlarmStatus;
  createdTime: number | null;
  startTs: number | null;
  endTs: number | null;
  ackTs: number | null;
  clearTs: number | null;
  originatorName: string | null;
  details: unknown;
}

/**
 * Estadísticas de uso de aplicaciones por fecha
 */
export interface AppUsageByDate {
  [appName: string]: AppUsageItem;
}

/**
 * Estadísticas de uso de aplicaciones por fecha y hora
 */
export interface AppUsageByDateHourly {
  [hour: string]: {
    [appName: string]: AppUsageItem;
  };
}

/**
 * Rango de fechas para consulta
 */
export interface DateRange {
  startDate: string;
  endDate: string;
}

/**
 * Resumen semanal de uso de aplicaciones
 */
export interface WeeklySummary {
  /** Array de fechas en formato YYYY-MM-DD */
  dates: string[];
  /** Total de segundos en la semana */
  totalSeconds: number;
  /** Total de segundos por día */
  dailyTotals: { [date: string]: number };
  /** Top aplicaciones de la semana */
  topApps: {
    [appName: string]: {
      name: string;
      icon: string | null;
      seconds: number;
    };
  };
}

/**
 * Comando RPC para enviar al dispositivo Arduino
 */
export interface RpcCommand {
  /** Nombre del método RPC */
  method: "setSessionState";
  /** Parámetros del método */
  params: {
    status: string;
    duration_sec: number;
  };
}

/**
 * Resultado del comando RPC
 */
export interface RpcResult {
  /** Si el comando fue exitoso */
  success: boolean;
  /** Mensaje de error (si falló) */
  error?: string;
}

/**
 * API de Electron expuesta al renderer
 *
 * Disponible globalmente como `window.api`
 */
export interface ElectronAPI {
  /** Autenticar usuario contra ThingsBoard */
  login: (creds: LoginCredentials) => Promise<LoginResult>;

  /** Enviar telemetría del Pomodoro a ThingsBoard */
  sendPomodoroUpdate: (data: PomodoroTelemetry) => Promise<void>;

  /** Obtener datos de sensores IoT desde ThingsBoard */
  getIoTData: () => Promise<IoTDataResponse | null>;

  /** Obtener alarmas activas del dispositivo en ThingsBoard */
  getActiveAlarms: () => Promise<DeviceAlarm[]>;

  /** Obtener estado actual del tracking */
  getTrackingStatus: () => Promise<TrackingStatus>;

  /** Suscribirse a actualizaciones de uso de aplicaciones */
  onAppUsageUpdate: (callback: (data: AppUsageItem[]) => void) => () => void;

  /** Suscribirse a cambios de presencia */
  onPresenceChanged: (
    callback: (data: PresenceChangedEvent) => void,
  ) => () => void;

  /** Obtener configuración de modo desarrollo */
  getDevMode: () => Promise<{ isDevMode: boolean; hasCredentials: boolean }>;

  /** Suscribirse a auto-login exitoso en modo desarrollo */
  onDevAutoLogin: (callback: () => void) => () => void;

  /** Enviar comando RPC al dispositivo Arduino */
  sendRpcCommand: (command: RpcCommand) => Promise<RpcResult>;

  /** Obtener estadísticas por fecha (YYYY-MM-DD) - agregadas por app */
  getStatsByDate: (dateKey: string) => Promise<AppUsageByDate>;

  /** Obtener estadísticas por fecha y hora (YYYY-MM-DD) */
  getStatsByDateHourly: (dateKey: string) => Promise<AppUsageByDateHourly>;

  /** Obtener todas las fechas con estadísticas */
  getStatsDates: () => Promise<string[]>;

  /** Obtener estadísticas de un rango de fechas */
  getStatsDateRange: (
    range: DateRange,
  ) => Promise<{ [date: string]: AppUsageByDate }>;

  /** Obtener resumen semanal */
  getWeeklySummary: (weekStartDate: string) => Promise<WeeklySummary>;
}

declare global {
  interface Window {
    api: ElectronAPI;
    webkitAudioContext: typeof AudioContext;
  }
  var api: ElectronAPI;
}
