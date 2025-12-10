/**
 * Tipos compartidos entre Electron (main) y React (renderer)
 * 
 * ## Integración con ThingsBoard
 * 
 * ThingsBoard es una plataforma IoT que usamos para:
 * - Autenticación de usuarios
 * - Almacenar telemetría del Pomodoro (status, timeLeft)
 * - Leer datos de sensores (distancia, presencia)
 * 
 * @see https://thingsboard.io/docs/reference/rest-api/
 */

/** Credenciales para login en ThingsBoard */
export interface LoginCredentials {
  email: string;
  password: string;
}

/** Respuesta del proceso de autenticación */
export interface LoginResult {
  success: boolean;
  error?: string;
}

/**
 * Telemetría del Pomodoro enviada a ThingsBoard
 * 
 * Se envía a: POST /api/v1/{deviceToken}/telemetry
 */
export interface PomodoroTelemetry {
  /** Estado actual del temporizador */
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED';
  /** Segundos restantes */
  timeLeft: number;
  /** Marca de tiempo Unix */
  timestamp: number;
}

/** Configuración del temporizador Pomodoro */
export interface PomodoroSettings {
  /** Duración del trabajo en minutos */
  workDuration: number;
  /** Duración del descanso corto en minutos */
  shortBreakDuration: number;
  /** Duración del descanso largo en minutos (cada 4 ciclos) */
  longBreakDuration: number;
}

/**
 * Información de uso de una aplicación
 * Trackeada localmente por Electron usando get-windows
 */
export interface AppUsageItem {
  /** Nombre de la aplicación (ej: "Code", "Spotify") */
  name: string;
  /** Título de la ventana activa */
  title: string;
  /** Icono en formato Base64 Data URL */
  icon: string | null;
  /** Tiempo de uso acumulado en segundos */
  seconds: number;
  /** Timestamp de última actividad */
  lastActive: number;
}