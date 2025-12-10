/**
 * Definiciones de tipos para el renderer (React)
 * 
 * Estas interfaces definen la API expuesta por Electron
 * a través del preload script usando contextBridge.
 */

import type { LoginCredentials, LoginResult, PomodoroTelemetry, AppUsageItem } from './shared/types';

/**
 * Respuesta de sensores IoT desde ThingsBoard
 * 
 * Obtenida de: GET /api/plugins/telemetry/DEVICE/{deviceId}/values/timeseries/latest
 */
export interface IoTDataResponse {
  /** Sensor de distancia ultrasónico (cm) */
  distance?: { ts: number; value: string };
  /** Sensor de presencia (booleano como string) */
  presence?: { ts: number; value: string };
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
  
  /** Suscribirse a actualizaciones de uso de aplicaciones */
  onAppUsageUpdate: (callback: (data: AppUsageItem[]) => void) => () => void;
}

declare global {
  interface Window {
    api: ElectronAPI;
    webkitAudioContext: typeof AudioContext;
  }
  var api: ElectronAPI;
}