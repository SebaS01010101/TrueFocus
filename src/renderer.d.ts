// src/renderer.d.ts
import { ElectronAPI } from './preload';

declare global {
  interface Window {
    api: ElectronAPI;
  }
  var api: ElectronAPI;
}