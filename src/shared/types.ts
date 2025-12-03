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