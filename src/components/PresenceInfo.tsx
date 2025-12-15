import { useState, useEffect } from "react";
import { MonitorCheck, MonitorX, Bug } from "lucide-react";
import type { PomodoroSettings } from "../shared/types";

interface PresenceInfoProps {
  pomodoroCount: number;
  settings: PomodoroSettings;
}

function PresenceInfo({ pomodoroCount, settings }: PresenceInfoProps) {
  const [distance, setDistance] = useState<string>("--");
  const [isPresent, setIsPresent] = useState<boolean>(false);
  const [lastSeen, setLastSeen] = useState<string>("Esperando datos...");
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [rawData, setRawData] = useState<unknown>(null);
  const [lastUpdate, setLastUpdate] = useState<string>("--");
  const [updateCount, setUpdateCount] = useState<number>(0);

  const isLongBreak = (pomodoroCount + 1) % 4 === 0;
  const nextBreakDuration = isLongBreak
    ? settings.longBreakDuration
    : settings.shortBreakDuration;

  useEffect(() => {
    const fetchData = async () => {
      if (!window.api?.getIoTData) return;
      const data = await window.api.getIoTData();
      if (data) {
        setRawData(data);
        setLastUpdate(new Date().toLocaleTimeString());
        setUpdateCount((prev) => prev + 1);

        if (data.distance)
          setDistance(`${parseFloat(data.distance.value).toFixed(0)} cm`);
        if (data.presence) {
          const present =
            data.presence.value === "true" || data.presence.value === "1";
          setIsPresent(present);
          if (present) setLastSeen("Ahora mismo");
          else {
            const diff = Date.now() - data.presence.ts;
            const minutes = Math.floor(diff / 60000);
            setLastSeen(`hace ${minutes} minutos`);
          }
        }
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="glass-card rounded-3xl p-5 w-full h-full text-white shadow-xl border border-white/10 transition-all duration-500 flex flex-col">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h2
          className={`text-lg font-bold tracking-wide transition-colors ${isPresent ? "text-brand-green-500" : "text-red-400"}`}
        >
          {isPresent ? "Presencia detectada" : "Ausencia detectada"}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDebugMode(!debugMode)}
            className={`p-1.5 rounded-lg transition-all ${debugMode ? "bg-yellow-500/20 text-yellow-300" : "bg-white/5 text-white/50 hover:bg-white/10"}`}
            title="Modo Debug"
          >
            <Bug size={18} />
          </button>
          {isPresent ? (
            <MonitorCheck
              size={22}
              className="text-brand-green-500 animate-pulse"
            />
          ) : (
            <MonitorX size={22} className="text-red-400" />
          )}
        </div>
      </div>

      {debugMode ? (
        <div className="flex flex-col gap-2 text-xs font-mono flex-1 overflow-auto dark-scrollbar">
          <div className="bg-black/20 rounded-lg p-2 border border-white/5">
            <div className="text-yellow-300 font-bold mb-1">🐛 DEBUG MODE</div>
            <div className="text-white/70">Actualizaciones: {updateCount}</div>
            <div className="text-white/70">Última: {lastUpdate}</div>
          </div>

          <div className="bg-black/20 rounded-lg p-2 border border-white/5">
            <div className="text-blue-300 font-bold mb-1">📡 RAW DATA:</div>
            {rawData ? (
              <pre className="text-white/80 text-[10px] whitespace-pre-wrap break-all">
                {JSON.stringify(rawData, null, 2)}
              </pre>
            ) : (
              <div className="text-red-300">Sin datos</div>
            )}
          </div>

          <div className="bg-black/20 rounded-lg p-2 border border-white/5">
            <div className="text-green-300 font-bold mb-1">📊 PARSED:</div>
            <div className="text-white/80">Distance: {distance}</div>
            <div className="text-white/80">
              Present: {isPresent ? "true" : "false"}
            </div>
            <div className="text-white/80">Last Seen: {lastSeen}</div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 text-sm font-medium flex-1 justify-center">
          <div className="flex items-center gap-2">
            <span className="opacity-90">Ciclos pomodoro:</span>
            <span className="font-bold text-base">{pomodoroCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="opacity-90">Última detección:</span>
            <span className="font-bold">{lastSeen}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="opacity-90">Siguiente descanso:</span>
            <span
              className={`font-bold ${isLongBreak ? "text-brand-green-400" : "text-white"}`}
            >
              de {nextBreakDuration} minutos
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="opacity-90">Distancia:</span>
            <span className="font-bold font-mono">{distance}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default PresenceInfo;
