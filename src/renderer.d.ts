import { LoginCredentials, LoginResult, PomodoroTelemetry } from './shared/types';

export interface IoTDataResponse {
  distance?: { ts: number; value: string };
  presence?: { ts: number; value: string };
}

export interface ElectronAPI {
  login: (creds: LoginCredentials) => Promise<LoginResult>;
  sendPomodoroUpdate: (data: PomodoroTelemetry) => Promise<void>;
  getIoTData: () => Promise<IoTDataResponse | null>;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
  var api: ElectronAPI;
}