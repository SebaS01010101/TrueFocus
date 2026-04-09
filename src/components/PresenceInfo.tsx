import { useEffect, useState } from "react";
import { Bug, MonitorCheck, MonitorX } from "lucide-react";
import type { DeviceAlarm, IoTDataResponse, TelemetryValue } from "../renderer";
import type { PomodoroSettings } from "../shared/types";
import { usePresenceStatus } from "../usePresenceStatus";

interface PresenceInfoProps {
  activeAlarms: DeviceAlarm[];
  pomodoroCount: number;
  settings: PomodoroSettings;
}

interface ScoreCard {
  label: string;
  value: number | null;
}

const parseNumericTelemetry = (entry?: TelemetryValue | null) => {
  if (!entry) {
    return null;
  }

  const parsedValue = Number.parseFloat(entry.value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const parsePresenceTelemetry = (entry?: TelemetryValue | null) => {
  if (!entry) {
    return null;
  }

  return entry.value === "true" || entry.value === "1";
};

const formatScore = (score: number | null) => {
  if (score === null) {
    return "--";
  }

  return `${Math.round(score)}`;
};

const getScoreColor = (score: number | null) => {
  if (score === null) {
    return "text-white";
  }

  if (score >= 80) {
    return "text-brand-green-400";
  }

  if (score >= 60) {
    return "text-yellow-300";
  }

  return "text-red-300";
};

const formatDistance = (distanceMm: number | null) => {
  if (distanceMm === null) {
    return "--";
  }

  return `${Math.round(distanceMm)} mm`;
};

const formatTemperature = (temperatureC: number | null) => {
  if (temperatureC === null) {
    return "--";
  }

  return `${temperatureC.toFixed(1)} °C`;
};

const formatEco2 = (eco2Ppm: number | null) => {
  if (eco2Ppm === null) {
    return "--";
  }

  return `${Math.round(eco2Ppm)} ppm`;
};

const formatAlarmLabel = (type: string) => type.replaceAll("_", " ");

const formatAlarmTimestamp = (timestamp: number | null) => {
  if (!timestamp) {
    return "--";
  }

  return new Date(timestamp).toLocaleTimeString();
};

function PresenceInfo({
  activeAlarms,
  pomodoroCount,
  settings,
}: PresenceInfoProps) {
  const [lastSeen, setLastSeen] = useState("Esperando datos...");
  const [debugMode, setDebugMode] = useState(false);
  const [iotData, setIotData] = useState<IoTDataResponse | null>(null);
  const [rawData, setRawData] = useState<IoTDataResponse | { error: string } | null>(
    null,
  );
  const [lastUpdate, setLastUpdate] = useState("--");
  const [updateCount, setUpdateCount] = useState(0);
  const { isPresent } = usePresenceStatus(true);

  const isLongBreak = (pomodoroCount + 1) % 4 === 0;
  const nextBreakDuration = isLongBreak
    ? settings.longBreakDuration
    : settings.shortBreakDuration;

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      if (!window.api?.getIoTData) {
        return;
      }

      try {
        const data = await window.api.getIoTData();
        if (!isMounted || !data) {
          return;
        }

        setIotData(data);
        setRawData(data);
        setLastUpdate(new Date().toLocaleTimeString());
        setUpdateCount((prev) => prev + 1);

        const presenceEntry = data.presence;
        const present = parsePresenceTelemetry(presenceEntry);

        if (present === null || !presenceEntry) {
          setLastSeen("Sin datos de presencia");
          return;
        }

        if (present) {
          setLastSeen("Ahora mismo");
          return;
        }

        const diff = Date.now() - presenceEntry.ts;
        const minutes = Math.floor(diff / 60000);
        setLastSeen(`hace ${minutes} minutos`);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setIotData(null);
        setRawData({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    void fetchData();

    const interval = setInterval(() => {
      void fetchData();
    }, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const distanceMm = parseNumericTelemetry(iotData?.distanceMm);
  const temperatureC = parseNumericTelemetry(iotData?.temperatureC);
  const eco2Ppm = parseNumericTelemetry(iotData?.eco2Ppm);
  const focusScore = parseNumericTelemetry(iotData?.focusScore);
  const entornoScore = parseNumericTelemetry(iotData?.entornoScore);
  const ergonomiaScore = parseNumericTelemetry(iotData?.ergonomiaScore);
  const co2Score = parseNumericTelemetry(iotData?.co2Score);
  const pomodoroStatus = iotData?.pomodoroStatus?.value || "--";
  const scoreCards: ScoreCard[] = [
    { label: "Foco", value: focusScore },
    { label: "Entorno", value: entornoScore },
    { label: "Ergonomía", value: ergonomiaScore },
    { label: "CO2", value: co2Score },
  ];

  return (
    <div className="glass-card flex h-full min-h-0 w-full flex-col overflow-hidden rounded-3xl border border-white/10 p-4 text-white shadow-xl transition-all duration-500">
      <div className="mb-2.5 flex items-center justify-between shrink-0">
        <h2
          className={`text-lg font-bold tracking-wide transition-colors ${isPresent ? "text-brand-green-500" : "text-red-400"}`}
        >
          {isPresent ? "Presencia detectada" : "Ausencia detectada"}
        </h2>
        <div className="flex items-center gap-1.5">
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
        <div className="flex flex-1 flex-col gap-2 overflow-auto text-xs font-mono dark-scrollbar">
          <div className="bg-black/20 rounded-lg p-2 border border-white/5">
            <div className="text-yellow-300 font-bold mb-1">🐛 DEBUG MODE</div>
            <div className="text-white/70">Actualizaciones: {updateCount}</div>
            <div className="text-white/70">Última: {lastUpdate}</div>
          </div>

          <div className="bg-black/20 rounded-lg p-2 border border-white/5">
            <div className="text-green-300 font-bold mb-1">📊 SCORES</div>
            {scoreCards.map((score) => (
              <div key={score.label} className="text-white/80">
                {score.label}: {formatScore(score.value)}
              </div>
            ))}
          </div>

          <div className="bg-black/20 rounded-lg p-2 border border-white/5">
            <div className="text-cyan-300 font-bold mb-1">📍 SENSOR DATA</div>
            <div className="text-white/80">Distancia: {formatDistance(distanceMm)}</div>
            <div className="text-white/80">Temperatura: {formatTemperature(temperatureC)}</div>
            <div className="text-white/80">eCO2: {formatEco2(eco2Ppm)}</div>
            <div className="text-white/80">Pomodoro: {pomodoroStatus}</div>
            <div className="text-white/80">Presente: {isPresent ? "true" : "false"}</div>
            <div className="text-white/80">Última detección: {lastSeen}</div>
          </div>

          <div className="bg-black/20 rounded-lg p-2 border border-white/5">
            <div className="text-red-300 font-bold mb-1">🚨 ACTIVE ALARMS</div>
            {activeAlarms.length > 0 ? (
              activeAlarms.map((alarm) => (
                <div key={alarm.id} className="text-white/80 mt-1">
                  <div>{formatAlarmLabel(alarm.type)} [{alarm.severity}]</div>
                  <div className="text-white/50">
                    Estado: {alarm.status} | Inicio: {formatAlarmTimestamp(alarm.startTs)}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-white/60">Sin alarmas activas</div>
            )}
          </div>

          <div className="bg-black/20 rounded-lg p-2 border border-white/5">
            <div className="text-blue-300 font-bold mb-1">📡 RAW DATA</div>
            {rawData ? (
              <pre className="text-white/80 text-[10px] whitespace-pre-wrap break-all">
                {JSON.stringify(rawData, null, 2)}
              </pre>
            ) : (
              <div className="text-red-300">Sin datos</div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            {scoreCards.map((score) => (
              <div
                key={score.label}
                className="rounded-2xl border border-white/10 bg-black/15 px-3 py-2"
              >
                <div className="text-[10px] uppercase tracking-wide text-white/60">
                  {score.label}
                </div>
                <div className={`text-[1.65rem] leading-none font-bold ${getScoreColor(score.value)}`}>
                  {formatScore(score.value)}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] leading-4 font-medium text-white/75">
            <div className="text-white/55">Estado device</div>
            <div className="text-right font-semibold font-mono">{pomodoroStatus}</div>
            <div className="text-white/55">Siguiente descanso</div>
            <div
              className={`text-right font-semibold ${isLongBreak ? "text-brand-green-300" : "text-white"}`}
            >
              {nextBreakDuration} min
            </div>
            <div className="text-white/55">Ultima deteccion</div>
            <div className="text-right font-semibold">{lastSeen}</div>
            <div className="text-white/55">Ciclos pomodoro</div>
            <div className="text-right font-semibold">{pomodoroCount}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PresenceInfo;
