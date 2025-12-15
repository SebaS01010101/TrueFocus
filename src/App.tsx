import { useState, useEffect } from "react";
import { Settings, Bug, X } from "lucide-react";
import Login from "./components/Login";
import Pomodoro from "./components/Pomodoro";
import PresenceInfo from "./components/PresenceInfo";
import SettingsModal from "./components/SettingsModal";
import AppUsage from "./components/AppUsage";
import ActivityChart from "./components/ActivityChart";
import type { PomodoroSettings, AppUsageItem } from "./shared/types";
import type { IoTDataResponse } from "./renderer";

interface DebugData {
  iotData: IoTDataResponse | null | { error: string };
  lastUpdate: string;
  apiAvailable: boolean;
  updateCount: number;
  isPresent: boolean;
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [appsData, setAppsData] = useState<AppUsageItem[]>([]);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [debugData, setDebugData] = useState<DebugData>({
    iotData: null,
    lastUpdate: "--",
    apiAvailable: false,
    updateCount: 0,
    isPresent: true,
  });

  // Auto-login en modo desarrollo
  useEffect(() => {
    const checkDevMode = async () => {
      if (window.api?.getDevMode) {
        const { isDevMode, hasCredentials } = await window.api.getDevMode();
        if (isDevMode && hasCredentials) {
          console.log("🔧 DEV MODE: Esperando auto-login...");
        }
      }
    };
    checkDevMode();

    if (window.api?.onDevAutoLogin) {
      const unsubscribe = window.api.onDevAutoLogin(() => {
        console.log("✅ DEV MODE: Auto-login recibido");
        setIsLoggedIn(true);
      });
      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    if (window.api?.onAppUsageUpdate) {
      const unsubscribe = window.api.onAppUsageUpdate((data) => {
        setAppsData(data);
      });
      return () => unsubscribe();
    }
  }, []);

  // Polling para debug data
  useEffect(() => {
    if (!isLoggedIn) return;

    const fetchDebugData = async () => {
      if (window.api?.getIoTData) {
        setDebugData((prev) => ({
          ...prev,
          apiAvailable: true,
        }));
        try {
          const data = await window.api.getIoTData();
          const present =
            data?.presence?.value === "true" || data?.presence?.value === "1";
          setDebugData((prev) => ({
            iotData: data,
            lastUpdate: new Date().toLocaleTimeString(),
            apiAvailable: true,
            updateCount: prev.updateCount + 1,
            isPresent: present,
          }));
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          setDebugData((prev) => ({
            ...prev,
            iotData: { error: errorMessage },
            lastUpdate: new Date().toLocaleTimeString(),
          }));
        }
      } else {
        setDebugData((prev) => ({
          ...prev,
          apiAvailable: false,
        }));
      }
    };

    if (isDebugOpen) {
      fetchDebugData();
      const interval = setInterval(fetchDebugData, 2000);
      return () => clearInterval(interval);
    }
  }, [isDebugOpen, isLoggedIn]);

  const [settings, setSettings] = useState<PomodoroSettings>({
    workDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 30,
  });

  const handleCycleComplete = () => {
    setCycleCount((prev) => prev + 1);
  };

  return (
    <div className="h-screen w-screen text-white overflow-hidden flex flex-col items-center justify-center bg-transparent">
      {isLoggedIn && (
        <div className="absolute top-6 right-6 flex gap-3 z-50">
          <button
            onClick={() => setIsDebugOpen(!isDebugOpen)}
            className={`p-3 rounded-full backdrop-blur-md transition border border-white/10 ${isDebugOpen ? "bg-yellow-500/20 text-yellow-300" : "bg-white/10 hover:bg-white/20 text-white/80 hover:text-white"}`}
            title="Debug Mode"
          >
            <Bug size={24} />
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md transition border border-white/10 text-white/80 hover:text-white"
          >
            <Settings size={24} />
          </button>
        </div>
      )}

      {/* Panel de Debug Global */}
      {isDebugOpen && isLoggedIn && (
        <div className="absolute top-24 right-6 bg-black/95 backdrop-blur-xl rounded-2xl p-5 text-sm font-mono text-white w-96 max-h-[600px] overflow-auto z-50 border border-white/20 shadow-2xl dark-scrollbar">
          <div className="flex items-center justify-between mb-4">
            <div className="text-yellow-300 font-bold text-lg">
              🐛 DEBUG PANEL
            </div>
            <button
              onClick={() => setIsDebugOpen(false)}
              className="p-1 rounded-lg bg-white/10 hover:bg-white/20 transition"
            >
              <X size={18} />
            </button>
          </div>

          {/* API Status */}
          <div className="mb-4 pb-4 border-b border-white/10">
            <div className="text-blue-300 font-bold mb-2">📡 API STATUS</div>
            <div className="space-y-1 text-xs">
              <div>Available: {debugData.apiAvailable ? "✓ YES" : "✗ NO"}</div>
              <div>Updates: {debugData.updateCount}</div>
              <div>Last Update: {debugData.lastUpdate}</div>
            </div>
          </div>

          {/* IoT Data */}
          <div className="mb-4 pb-4 border-b border-white/10">
            <div className="text-green-300 font-bold mb-2">🤖 IOT DATA</div>
            {debugData.iotData ? (
              <div className="space-y-1 text-xs">
                {"distance" in debugData.iotData &&
                  debugData.iotData.distance && (
                    <div className="bg-white/5 rounded p-2">
                      <div className="text-cyan-300">Distance:</div>
                      <div className="text-white/80 ml-2">
                        Value: {debugData.iotData.distance.value}
                      </div>
                      <div className="text-white/80 ml-2">
                        Timestamp:{" "}
                        {new Date(
                          debugData.iotData.distance.ts,
                        ).toLocaleString()}
                      </div>
                    </div>
                  )}
                {"presence" in debugData.iotData &&
                  debugData.iotData.presence && (
                    <div className="bg-white/5 rounded p-2 mt-2">
                      <div className="text-cyan-300">Presence:</div>
                      <div className="text-white/80 ml-2">
                        Value: {debugData.iotData.presence.value}
                      </div>
                      <div className="text-white/80 ml-2">
                        Timestamp:{" "}
                        {new Date(
                          debugData.iotData.presence.ts,
                        ).toLocaleString()}
                      </div>
                    </div>
                  )}
                {"error" in debugData.iotData && debugData.iotData.error && (
                  <div className="text-red-300">
                    Error: {debugData.iotData.error}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-white/50 text-xs">No data received</div>
            )}
          </div>

          {/* Raw JSON */}
          <div className="mb-4">
            <div className="text-purple-300 font-bold mb-2">📄 RAW JSON</div>
            <pre className="text-[10px] text-white/70 bg-white/5 rounded p-2 whitespace-pre-wrap break-all max-h-40 overflow-auto">
              {JSON.stringify(debugData.iotData, null, 2) || "null"}
            </pre>
          </div>

          {/* System Info */}
          <div className="mb-4 pb-4 border-b border-white/10">
            <div className="text-orange-300 font-bold mb-2">⚙️ SYSTEM INFO</div>
            <div className="space-y-1 text-xs text-white/70">
              <div>Logged In: {isLoggedIn ? "YES" : "NO"}</div>
              <div>Pomodoro Cycles: {cycleCount}</div>
              <div>Apps Tracked: {appsData.length}</div>
              <div>
                Window API: {window.api ? "Available" : "Not Available"}
              </div>
            </div>
          </div>

          {/* Tracking Status */}
          <div>
            <div className="text-pink-300 font-bold mb-2">
              📊 TRACKING STATUS
            </div>
            <div className="space-y-1 text-xs">
              <div
                className={
                  debugData.isPresent ? "text-green-400" : "text-red-400"
                }
              >
                Presence:{" "}
                {debugData.isPresent ? "✓ DETECTED" : "✗ NOT DETECTED"}
              </div>
              <div
                className={
                  debugData.isPresent ? "text-green-400" : "text-orange-400"
                }
              >
                App Tracking: {debugData.isPresent ? "ACTIVE" : "PAUSED"}
              </div>
              <div className="text-white/60">
                {debugData.isPresent
                  ? "Recording app usage normally"
                  : "Not recording - user not present"}
              </div>
            </div>
          </div>
        </div>
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentSettings={settings}
        onSave={setSettings}
      />

      {!isLoggedIn ? (
        <Login onLoginSuccess={() => setIsLoggedIn(true)} />
      ) : (
        <div className="flex items-center justify-center w-full h-full p-6">
          <div className="grid grid-cols-[1fr_340px] grid-rows-[320px_220px] gap-4 w-full max-w-[920px]">
            {/* Gráfico de Actividad (arriba izquierda) */}
            <ActivityChart apps={appsData} />

            {/* Pomodoro (arriba derecha) */}
            <Pomodoro
              onCycleComplete={handleCycleComplete}
              settings={settings}
              currentCycle={cycleCount}
            />

            {/* Apps (abajo izquierda) */}
            <AppUsage apps={appsData} />

            {/* Presencia (abajo derecha) */}
            <PresenceInfo pomodoroCount={cycleCount} settings={settings} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
