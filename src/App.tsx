import { useState, useEffect, useCallback, useRef } from "react";
import { Settings, Bug, X } from "lucide-react";
import Login from "./components/Login";
import Pomodoro from "./components/Pomodoro";
import PresenceInfo from "./components/PresenceInfo";
import SettingsModal from "./components/SettingsModal";
import AppUsage from "./components/AppUsage";
import ScreenTimeWidget from "./components/ScreenTimeWidget";
import PersistentRecommendationBar from "./components/PersistentRecommendationBar";
import WidgetNoticeCenter, {
  type WidgetNotice,
  type WidgetNoticeDraft,
} from "./components/WidgetNoticeCenter";
import type { PomodoroSettings, AppUsageItem } from "./shared/types";
import type { DeviceAlarm, IoTDataResponse, TelemetryValue } from "./renderer";

interface DebugData {
  iotData: IoTDataResponse | null | { error: string };
  lastUpdate: string;
  apiAvailable: boolean;
  updateCount: number;
  isPresent: boolean;
}

interface PersistentAlarmRecommendation {
  alarmId: string;
  alarmType: string;
  normalizedType: string;
  title: string;
  message: string;
  severity: WidgetNoticeDraft["severity"];
  startedAt: number | null;
}

type PomodoroWidgetState = {
  mode: "WORK" | "BREAK";
  isActive: boolean;
};

type PomodoroAlarmBlockingReason = "CO2_CRITICO" | null;

type NormalizedAlarmType =
  | "CO2_CRITICO"
  | "CO2_ALTO"
  | "MALA_POSTURA"
  | "AUSENCIA"
  | "FOCO_BAJO"
  | "TEMPERATURA_INCOMODA"
  | "UNKNOWN";

const ALARM_NOTICE_COOLDOWNS: Record<string, number> = {
  CO2_CRITICO: 60000,
  CO2_ALTO: 180000,
  FOCO_BAJO: 180000,
  MALA_POSTURA: 60000,
  TEMPERATURA_INCOMODA: 180000,
  AUSENCIA: 90000,
};
const DEFAULT_ALARM_NOTICE_COOLDOWN = 240000;
const ALARM_SEVERITY_PRIORITY: Record<DeviceAlarm["severity"], number> = {
  CRITICAL: 0,
  MAJOR: 1,
  WARNING: 2,
  MINOR: 3,
  INDETERMINATE: 4,
};

const formatNumericTelemetry = (
  entry: TelemetryValue | null | undefined,
  unit: string,
  digits = 0,
) => {
  if (!entry) {
    return "--";
  }

  const parsedValue = Number.parseFloat(entry.value);
  if (!Number.isFinite(parsedValue)) {
    return entry.value;
  }

  return `${parsedValue.toFixed(digits)}${unit}`;
};

const formatTelemetryTimestamp = (entry: TelemetryValue | null | undefined) => {
  if (!entry) {
    return "--";
  }

  return new Date(entry.ts).toLocaleString();
};

const formatPresenceTelemetry = (entry: TelemetryValue | null | undefined) => {
  if (!entry) {
    return "--";
  }

  return entry.value === "true" || entry.value === "1" ? "true" : "false";
};

const formatAlarmLabel = (type: string) => type.replaceAll("_", " ");

const buildActiveAlarmSummary = (alarms: DeviceAlarm[]) => {
  if (alarms.length === 0) {
    return "Sin alertas activas";
  }

  const labels = alarms.slice(0, 3).map((alarm) => formatAlarmLabel(alarm.type));

  if (alarms.length <= 3) {
    return labels.join(" · ");
  }

  return `${labels.join(" · ")} · +${alarms.length - 3} mas`;
};

const getAlarmTextColor = (severity: DeviceAlarm["severity"]) => {
  if (severity === "CRITICAL") {
    return "text-red-300";
  }

  if (severity === "MAJOR") {
    return "text-orange-300";
  }

  if (severity === "MINOR") {
    return "text-amber-200";
  }

  return "text-yellow-200";
};

const normalizeAlarmType = (alarmType: string): NormalizedAlarmType => {
  switch (alarmType) {
    case "CO2_CRITICO":
      return "CO2_CRITICO";
    case "CO2_ALTO":
      return "CO2_ALTO";
    case "MALA_POSTURA":
    case "POSTURA_MALA":
      return "MALA_POSTURA";
    case "AUSENCIA":
      return "AUSENCIA";
    case "FOCO_BAJO":
      return "FOCO_BAJO";
    case "TEMPERATURA_INCOMODA":
    case "TEMPERATURA_EXTREMA":
      return "TEMPERATURA_INCOMODA";
    default:
      return "UNKNOWN";
  }
};

const getAlarmBlockingReason = (
  alarm: DeviceAlarm,
  pomodoroState: PomodoroWidgetState,
): PomodoroAlarmBlockingReason => {
  const normalizedType = normalizeAlarmType(alarm.type);

  if (normalizedType === "CO2_CRITICO" && pomodoroState.isActive) {
    return "CO2_CRITICO";
  }

  return null;
};

const getAlarmRecommendationPriority = (
  alarm: DeviceAlarm,
  pomodoroState: PomodoroWidgetState,
) => {
  const normalizedType = normalizeAlarmType(alarm.type);

  switch (normalizedType) {
    case "CO2_CRITICO":
      return 0;
    case "AUSENCIA":
      return pomodoroState.mode === "WORK" ? 1 : 99;
    case "CO2_ALTO":
      return 2;
    case "MALA_POSTURA":
      return pomodoroState.mode === "WORK" ? 3 : 99;
    case "TEMPERATURA_INCOMODA":
      return 4;
    case "FOCO_BAJO":
      return pomodoroState.mode === "WORK" ? 5 : 99;
    default:
      if (alarm.severity === "CRITICAL") {
        return 6;
      }

      if (alarm.severity === "MAJOR" || alarm.severity === "WARNING") {
        return 7;
      }

      return 8;
  }
};

const buildAlarmRecommendation = (
  alarm: DeviceAlarm,
  pomodoroState: PomodoroWidgetState,
): WidgetNoticeDraft | null => {
  const normalizedType = normalizeAlarmType(alarm.type);

  switch (normalizedType) {
    case "CO2_CRITICO":
      return {
        title: "CO2 critico",
        message: "Ventila el espacio ahora. El CO2 esta demasiado alto para mantener un buen foco.",
        severity: "critical",
        source: "Alarma",
        system: true,
        dedupeKey: `alarm:${normalizedType}`,
        ttlMs: 9000,
      };
    case "CO2_ALTO":
      return {
        title: "Calidad del aire",
        message: "Abre una ventana o cambia de aire unos minutos para recuperar claridad mental.",
        severity: "warning",
        source: "Alarma",
        dedupeKey: `alarm:${normalizedType}`,
      };
    case "MALA_POSTURA":
      if (pomodoroState.mode !== "WORK") {
        return null;
      }

      return {
        title: "Postura",
        message: "Ajusta tu distancia a la pantalla y endereza la espalda antes de seguir.",
        severity: "warning",
        source: "Alarma",
        dedupeKey: `alarm:${normalizedType}`,
      };
    case "TEMPERATURA_INCOMODA":
      return {
        title: "Entorno",
        message: "La temperatura no es ideal. Ajustala si puedes para trabajar mas comodo.",
        severity: "warning",
        source: "Alarma",
        dedupeKey: `alarm:${normalizedType}`,
      };
    case "FOCO_BAJO":
      if (pomodoroState.mode !== "WORK") {
        return null;
      }

      return {
        title: "Foco bajo",
        message: "Tu score de foco cayo. Revisa postura, aire y posibles distracciones.",
        severity: "info",
        source: "Alarma",
        dedupeKey: `alarm:${normalizedType}`,
      };
    case "AUSENCIA":
      if (pomodoroState.mode === "WORK") {
        return {
          title: "Ausencia",
          message: pomodoroState.isActive
            ? "No deberias seguir en trabajo mientras estas ausente. Regresa o manten la sesion en pausa."
            : "Sigues ausente. El trabajo permanece en pausa hasta que regreses.",
          severity: "warning",
          source: "Alarma",
          dedupeKey: `alarm:${normalizedType}:${pomodoroState.mode}:${pomodoroState.isActive ? "running" : "paused"}`,
        };
      }

      return null;
    default:
      if (alarm.severity === "CRITICAL") {
        return {
          title: formatAlarmLabel(alarm.type),
          message: "Hay una alarma critica activa. Revisa el estado del entorno antes de continuar.",
          severity: "critical",
          source: "Alarma",
          system: true,
          dedupeKey: `alarm:${alarm.type}`,
          ttlMs: 9000,
        };
      }

      if (alarm.severity === "MAJOR" || alarm.severity === "WARNING") {
        return {
          title: formatAlarmLabel(alarm.type),
          message: "Hay una alerta activa en el entorno. Revisa tu postura, el aire o la temperatura antes de seguir.",
          severity: "warning",
          source: "Alarma",
          dedupeKey: `alarm:${alarm.type}`,
        };
      }

      if (alarm.severity === "MINOR") {
        return {
          title: formatAlarmLabel(alarm.type),
          message: "Hay una recomendacion leve activa. Ajusta el entorno para mantener un mejor foco.",
          severity: "info",
          source: "Alarma",
          dedupeKey: `alarm:${alarm.type}`,
        };
      }

      return {
        title: formatAlarmLabel(alarm.type),
        message: "Hay una alerta activa en el entorno. Revisa el panel y ajusta las condiciones antes de seguir.",
        severity: "info",
        source: "Alarma",
        dedupeKey: `alarm:${alarm.type}`,
      };
  }
};

const buildPersistentAlarmRecommendation = (
  alarm: DeviceAlarm,
  pomodoroState: PomodoroWidgetState,
): PersistentAlarmRecommendation | null => {
  const notice = buildAlarmRecommendation(alarm, pomodoroState);
  const normalizedType = normalizeAlarmType(alarm.type);

  if (!notice) {
    return null;
  }

  return {
    alarmId: alarm.id,
    alarmType: alarm.type,
    normalizedType,
    title: notice.title,
    message: notice.message,
    severity: notice.severity,
    startedAt: alarm.startTs || alarm.createdTime || null,
  };
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [appsData, setAppsData] = useState<AppUsageItem[]>([]);
  const [activeAlarms, setActiveAlarms] = useState<DeviceAlarm[]>([]);
  const [pomodoroState, setPomodoroState] = useState<PomodoroWidgetState>({
    mode: "WORK",
    isActive: false,
  });
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [widgetNotices, setWidgetNotices] = useState<WidgetNotice[]>([]);
  const [debugData, setDebugData] = useState<DebugData>({
    iotData: null,
    lastUpdate: "--",
    apiAvailable: false,
    updateCount: 0,
    isPresent: true,
  });
  const noticeTimersRef = useRef<Record<string, number>>({});
  const noticeDedupeRef = useRef<Record<string, number>>({});
  const announcedAlarmIdsRef = useRef<Set<string>>(new Set());
  const alarmCooldownRef = useRef<Record<string, number>>({});

  const dismissNotice = useCallback((noticeId: string) => {
    const timeoutId = noticeTimersRef.current[noticeId];

    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete noticeTimersRef.current[noticeId];
    }

    setWidgetNotices((previous) =>
      previous.filter((notice) => notice.id !== noticeId),
    );
  }, []);

  const emitWidgetNotice = useCallback(
    (draft: WidgetNoticeDraft) => {
      const now = Date.now();
      const dedupeKey =
        draft.dedupeKey || `${draft.source}:${draft.title}:${draft.message}`;
      const lastSeenAt = noticeDedupeRef.current[dedupeKey];

      if (lastSeenAt && now - lastSeenAt < 5000) {
        return;
      }

      noticeDedupeRef.current[dedupeKey] = now;

      const noticeId = `${now}-${Math.random().toString(36).slice(2, 9)}`;
      const nextNotice: WidgetNotice = {
        ...draft,
        id: noticeId,
        createdAt: now,
      };

      setWidgetNotices((previous) => [nextNotice, ...previous].slice(0, 3));

      const ttlMs =
        draft.ttlMs || (draft.severity === "critical" ? 9000 : 6500);
      noticeTimersRef.current[noticeId] = window.setTimeout(() => {
        dismissNotice(noticeId);
      }, ttlMs);

      if (draft.system && Notification.permission === "granted") {
        new Notification(`TrueFocus · ${draft.title}`, {
          body: draft.message,
          silent: draft.severity !== "critical",
        });
      }
    },
    [dismissNotice],
  );

  const handlePomodoroNotice = useCallback(
    (notice: WidgetNoticeDraft) => {
      emitWidgetNotice(notice);
    },
    [emitWidgetNotice],
  );

  const handlePomodoroStateChange = useCallback(
    (nextState: PomodoroWidgetState) => {
      setPomodoroState((previous) => {
        if (
          previous.mode === nextState.mode &&
          previous.isActive === nextState.isActive
        ) {
          return previous;
        }

        return nextState;
      });
    },
    [],
  );

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
    return () => {
      Object.values(noticeTimersRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      noticeTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (window.api?.onAppUsageUpdate) {
      const unsubscribe = window.api.onAppUsageUpdate((data) => {
        setAppsData(data);
      });
      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !window.api?.getActiveAlarms) {
      setActiveAlarms([]);
      announcedAlarmIdsRef.current = new Set();
      return;
    }

    let isMounted = true;

    const fetchActiveAlarms = async () => {
      try {
        const alarms = await window.api.getActiveAlarms();

        if (!isMounted) {
          return;
        }

        setActiveAlarms(alarms);

        const currentIds = new Set(alarms.map((alarm) => alarm.id));

        alarms.forEach((alarm) => {
          if (announcedAlarmIdsRef.current.has(alarm.id)) {
            return;
          }

          const normalizedType = normalizeAlarmType(alarm.type);
          const blockingReason = getAlarmBlockingReason(alarm, pomodoroState);
          const notice = buildAlarmRecommendation(alarm, pomodoroState);
          if (!notice || blockingReason || normalizedType === "AUSENCIA") {
            return;
          }

          const cooldownKey =
            normalizedType === "UNKNOWN" ? alarm.type : normalizedType;
          const lastTypeNoticeAt = alarmCooldownRef.current[cooldownKey] || 0;
          const cooldown =
            ALARM_NOTICE_COOLDOWNS[cooldownKey] || DEFAULT_ALARM_NOTICE_COOLDOWN;

          if (Date.now() - lastTypeNoticeAt < cooldown) {
            return;
          }

          alarmCooldownRef.current[cooldownKey] = Date.now();
          emitWidgetNotice(notice);
        });

        announcedAlarmIdsRef.current = currentIds;
      } catch {
        if (isMounted) {
          setActiveAlarms([]);
        }
      }
    };

    void fetchActiveAlarms();

    const interval = setInterval(() => {
      void fetchActiveAlarms();
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [emitWidgetNotice, isLoggedIn, pomodoroState]);

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

  const telemetryData =
    debugData.iotData && !("error" in debugData.iotData) ? debugData.iotData : null;
  const scoreEntries = telemetryData
    ? [
        {
          label: "Focus Score",
          entry: telemetryData.focusScore,
          value: formatNumericTelemetry(telemetryData.focusScore, "", 0),
        },
        {
          label: "Entorno Score",
          entry: telemetryData.entornoScore,
          value: formatNumericTelemetry(telemetryData.entornoScore, "", 0),
        },
        {
          label: "Ergonomía Score",
          entry: telemetryData.ergonomiaScore,
          value: formatNumericTelemetry(telemetryData.ergonomiaScore, "", 0),
        },
        {
          label: "CO2 Score",
          entry: telemetryData.co2Score,
          value: formatNumericTelemetry(telemetryData.co2Score, "", 0),
        },
      ]
    : [];
  const sensorEntries = telemetryData
    ? [
        {
          label: "Distancia",
          entry: telemetryData.distanceMm,
          value: formatNumericTelemetry(telemetryData.distanceMm, " mm", 0),
        },
        {
          label: "Presencia",
          entry: telemetryData.presence,
          value: formatPresenceTelemetry(telemetryData.presence),
        },
        {
          label: "Temperatura",
          entry: telemetryData.temperatureC,
          value: formatNumericTelemetry(telemetryData.temperatureC, " °C", 1),
        },
        {
          label: "eCO2",
          entry: telemetryData.eco2Ppm,
          value: formatNumericTelemetry(telemetryData.eco2Ppm, " ppm", 0),
        },
        {
          label: "Pomodoro Status",
          entry: telemetryData.pomodoroStatus,
          value: telemetryData.pomodoroStatus?.value || "--",
        },
      ]
    : [];
  const alarmEntries = activeAlarms;
  const criticalAlarmActive = activeAlarms.some(
    (alarm) => normalizeAlarmType(alarm.type) === "CO2_CRITICO",
  );
  const blockingAlarmReason = activeAlarms
    .map((alarm) => ({
      alarm,
      blockingReason: getAlarmBlockingReason(alarm, pomodoroState),
    }))
    .filter(
      (
        entry,
      ): entry is {
        alarm: DeviceAlarm;
        blockingReason: Exclude<PomodoroAlarmBlockingReason, null>;
      } => entry.blockingReason !== null,
    )
    .sort((left, right) => {
      const leftPriority = left.blockingReason === "CO2_CRITICO" ? 0 : 1;
      const rightPriority = right.blockingReason === "CO2_CRITICO" ? 0 : 1;

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return (
        (right.alarm.createdTime ?? right.alarm.startTs ?? 0) -
        (left.alarm.createdTime ?? left.alarm.startTs ?? 0)
      );
    })[0]?.blockingReason ?? null;
  const recommendedAlarms = activeAlarms
    .map((alarm) => ({
      alarm,
      recommendation: buildPersistentAlarmRecommendation(alarm, pomodoroState),
    }))
    .filter(
      (
        entry,
      ): entry is {
        alarm: DeviceAlarm;
        recommendation: PersistentAlarmRecommendation;
      } => entry.recommendation !== null,
    )
    .sort((left, right) => {
      const priorityDelta =
        getAlarmRecommendationPriority(left.alarm, pomodoroState) -
        getAlarmRecommendationPriority(right.alarm, pomodoroState);

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      const severityDelta =
        ALARM_SEVERITY_PRIORITY[left.alarm.severity] -
        ALARM_SEVERITY_PRIORITY[right.alarm.severity];

      if (severityDelta !== 0) {
        return severityDelta;
      }

      return (
        (right.alarm.createdTime ?? right.alarm.startTs ?? 0) -
        (left.alarm.createdTime ?? left.alarm.startTs ?? 0)
      );
    });
  const primaryAlarmRecommendation =
    recommendedAlarms[0]?.recommendation ?? null;
  const extraRecommendationCount = Math.max(0, recommendedAlarms.length - 1);
  const activeAlarmSummary = buildActiveAlarmSummary(activeAlarms);

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

      {isLoggedIn && (
        <WidgetNoticeCenter
          notices={widgetNotices}
          onDismiss={dismissNotice}
        />
      )}

      {/* Panel de Debug Global */}
      {isDebugOpen && isLoggedIn && (
        <div className="absolute top-20 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm max-h-[calc(100vh-6rem)] overflow-auto rounded-2xl border border-white/20 bg-black/95 p-5 text-sm font-mono text-white shadow-2xl backdrop-blur-xl dark-scrollbar">
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
                {scoreEntries.length > 0 && (
                  <div className="bg-white/5 rounded p-2">
                    <div className="text-cyan-300">Scores:</div>
                    {scoreEntries.map((score) => (
                      <div key={score.label} className="text-white/80 ml-2">
                        {score.label}: {score.value}
                      </div>
                    ))}
                  </div>
                )}
                {sensorEntries.length > 0 && (
                  <div className="bg-white/5 rounded p-2 mt-2">
                    <div className="text-cyan-300">Sensores y estado:</div>
                    {sensorEntries.map((field) => (
                      <div key={field.label} className="text-white/80 ml-2 mt-1">
                        <div>
                          {field.label}: {field.value}
                        </div>
                        <div className="text-white/50">
                          Timestamp: {formatTelemetryTimestamp(field.entry)}
                        </div>
                      </div>
                    ))}
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

          <div className="mb-4 pb-4 border-b border-white/10">
            <div className="text-red-300 font-bold mb-2">🚨 ACTIVE ALARMS</div>
            {alarmEntries.length > 0 ? (
              <div className="space-y-2 text-xs">
                {alarmEntries.map((alarm) => (
                  <div key={alarm.id} className="bg-white/5 rounded p-2">
                    <div className={`font-bold ${getAlarmTextColor(alarm.severity)}`}>
                      {formatAlarmLabel(alarm.type)}
                    </div>
                    <div className="text-white/80 ml-2">
                      Severity: {alarm.severity}
                    </div>
                    <div className="text-white/80 ml-2">
                      Status: {alarm.status}
                    </div>
                    <div className="text-white/50 ml-2">
                      Start: {alarm.startTs ? new Date(alarm.startTs).toLocaleString() : "--"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-white/50 text-xs">Sin alarmas activas</div>
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
        key={`${isSettingsOpen ? "open" : "closed"}-${settings.workDuration}-${settings.shortBreakDuration}-${settings.longBreakDuration}`}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentSettings={settings}
        onSave={setSettings}
      />

      {!isLoggedIn ? (
        <Login onLoginSuccess={() => setIsLoggedIn(true)} />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-4 sm:p-5">
          <div className="grid h-full max-h-[620px] w-full max-w-[840px] min-h-0 grid-cols-[minmax(0,1.22fr)_minmax(17rem,0.88fr)] grid-rows-[minmax(0,1fr)_minmax(0,0.88fr)_minmax(5.6rem,0.34fr)] gap-3">
            {/* Screen Time (arriba izquierda) */}
            <div className="min-h-0 min-w-0">
              <ScreenTimeWidget />
            </div>

            {/* Pomodoro (arriba derecha) */}
            <div className="min-h-0 min-w-0">
              <Pomodoro
                alarmBlockingReason={blockingAlarmReason}
                criticalAlarmActive={criticalAlarmActive}
                onCycleComplete={handleCycleComplete}
                settings={settings}
                currentCycle={cycleCount}
                onNotice={handlePomodoroNotice}
                onStateChange={handlePomodoroStateChange}
              />
            </div>

            {/* Apps (abajo izquierda) */}
            <div className="min-h-0 min-w-0">
              <AppUsage apps={appsData} />
            </div>

            {/* Presencia (abajo derecha) */}
            <div className="min-h-0 min-w-0">
              <PresenceInfo
                activeAlarms={activeAlarms}
                pomodoroCount={cycleCount}
                settings={settings}
              />
            </div>

            <div className="col-span-2 min-h-0 min-w-0">
              <PersistentRecommendationBar
                activeAlarmCount={activeAlarms.length}
                activeAlarmSummary={activeAlarmSummary}
                recommendation={primaryAlarmRecommendation}
                extraRecommendationCount={extraRecommendationCount}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
