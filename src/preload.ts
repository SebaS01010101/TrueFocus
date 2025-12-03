import { contextBridge, ipcRenderer } from 'electron';
import type { LoginCredentials, LoginResult, PomodoroTelemetry } from './shared/types';

const api = {
  login: (creds: LoginCredentials): Promise<LoginResult> => 
    ipcRenderer.invoke('auth:login', creds),

  sendPomodoroUpdate: (data: PomodoroTelemetry): Promise<void> => 
    ipcRenderer.invoke('telemetry:send', data),
};

contextBridge.exposeInMainWorld('api', api);

export type ElectronAPI = typeof api;