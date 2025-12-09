import { LoginCredentials, LoginResult, PomodoroTelemetry } from './shared/types';

export interface IoTDataResponse {
  distance?: { ts: number; value: string };
  presence?: { ts: number; value: string };
}

// NUEVO: Estructura de una App Trackeada
export interface AppUsageItem {
  name: string;       // Ej: "Code", "Spotify"
  title: string;      // Ej: "main.cjs - TrueFocus - Visual Studio Code"
  icon: string | null;// Base64 Image Data URL
  seconds: number;    // Tiempo acumulado
  lastActive: number; // Timestamp
}

export interface ElectronAPI {
  login: (creds: LoginCredentials) => Promise<LoginResult>;
  sendPomodoroUpdate: (data: PomodoroTelemetry) => Promise<void>;
  getIoTData: () => Promise<IoTDataResponse | null>;
  
  // NUEVO: Definición del listener
  onAppUsageUpdate: (callback: (data: AppUsageItem[]) => void) => () => void;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
  var api: ElectronAPI;
}