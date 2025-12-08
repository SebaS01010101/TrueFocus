// Lo que el Frontend le manda al Backend para loguearse
export interface LoginCredentials {
  email: string;
  password: string;
}

// La respuesta del Backend al Frontend tras intentar login
export interface LoginResult {
  success: boolean;
  error?: string;
}

// La estructura de datos del Pomodoro
export interface PomodoroTelemetry {
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED';
  timeLeft: number;
  timestamp: number;
}

// Agrega esto al final de src/shared/types.ts
export interface PomodoroSettings {
  workDuration: number;       // Minutos
  shortBreakDuration: number; // Minutos
  longBreakDuration: number;  // Minutos
}