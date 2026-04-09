import { useState, useEffect, useCallback, useRef } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Coffee,
  Clock,
  Armchair,
  UserX,
  Bug,
  TriangleAlert,
} from "lucide-react";
import type { WidgetNoticeDraft, WidgetNoticeSeverity } from "./WidgetNoticeCenter";
import type { PomodoroTelemetry, PomodoroSettings } from "../shared/types";
import { usePresenceStatus } from "../usePresenceStatus";

interface PomodoroProps {
  alarmBlockingReason?: "CO2_CRITICO" | null;
  criticalAlarmActive?: boolean;
  onCycleComplete?: () => void;
  settings: PomodoroSettings;
  currentCycle: number;
  onNotice?: (notice: WidgetNoticeDraft) => void;
  onStateChange?: (state: { mode: TimerMode; isActive: boolean }) => void;
}

type TimerMode = "WORK" | "BREAK";
type AutoPauseReason = "presence" | "break_presence" | "critical_alarm" | null;

function Pomodoro({
  alarmBlockingReason = null,
  criticalAlarmActive = false,
  onCycleComplete,
  settings,
  currentCycle,
  onNotice,
  onStateChange,
}: PomodoroProps) {
  const { isPresent, hasLoaded } = usePresenceStatus(true);
  const workDurationMinutes = Math.max(1, settings.workDuration);
  const shortBreakDurationMinutes = Math.max(1, settings.shortBreakDuration);
  const longBreakDurationMinutes = Math.max(1, settings.longBreakDuration);
  const [timeLeft, setTimeLeft] = useState(workDurationMinutes * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<TimerMode>("WORK");
  const [autoPauseReason, setAutoPauseReason] = useState<AutoPauseReason>(null);
  const [wasManuallyStarted, setWasManuallyStarted] = useState<boolean>(false);
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [iotDebugData, setIotDebugData] = useState<unknown>(null);
  const [lastIotCheck, setLastIotCheck] = useState<string>("--");
  const [presenceDuringBreak, setPresenceDuringBreak] = useState<number>(0);
  const [breakWarningShown, setBreakWarningShown] = useState<boolean>(false);

  const wasAutoPaused = autoPauseReason !== null;

  // Refs para mantener valores actualizados sin reiniciar el efecto
  const isActiveRef = useRef(isActive);
  const autoPauseReasonRef = useRef(autoPauseReason);
  const modeRef = useRef(mode);
  const timeLeftRef = useRef(timeLeft);
  const isPresentRef = useRef(isPresent);
  const hasLoadedRef = useRef(hasLoaded);
  const warningShownRef = useRef(breakWarningShown);
  const previousAlarmBlockingReasonRef = useRef<typeof alarmBlockingReason>(null);

  // Actualizar refs cuando cambian los estados
  useEffect(() => {
    isActiveRef.current = isActive;
    autoPauseReasonRef.current = autoPauseReason;
    modeRef.current = mode;
    timeLeftRef.current = timeLeft;
    isPresentRef.current = isPresent;
    hasLoadedRef.current = hasLoaded;
    warningShownRef.current = breakWarningShown;
  }, [
    isActive,
    autoPauseReason,
    mode,
    timeLeft,
    isPresent,
    hasLoaded,
    presenceDuringBreak,
    breakWarningShown,
  ]);

  useEffect(() => {
    onStateChange?.({ mode, isActive });
  }, [isActive, mode, onStateChange]);

  const isLongBreak =
    mode === "WORK"
      ? (currentCycle + 1) % 4 === 0
      : currentCycle > 0 && currentCycle % 4 === 0;

  const targetTime =
    mode === "WORK"
      ? workDurationMinutes * 60
      : isLongBreak
        ? longBreakDurationMinutes * 60
        : shortBreakDurationMinutes * 60;

  // Sincronizar tiempo cuando cambia la configuración (solo si no está activo, no fue pausado automáticamente, y no fue iniciado manualmente)
  useEffect(() => {
    if (
      !isActive &&
      !wasAutoPaused &&
      !wasManuallyStarted &&
      timeLeft !== targetTime
    ) {
      const timerId = setTimeout(() => setTimeLeft(targetTime), 0);
      return () => clearTimeout(timerId);
    }
  }, [targetTime, isActive, timeLeft, wasAutoPaused, wasManuallyStarted]);

  // Solicitar permisos de notificación al montar
  useEffect(() => {
    if (Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  }, []);

  // Reproducir sonido de notificación usando Web Audio API
  const playNotificationSound = () => {
    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      const audioCtx = new AudioContextClass();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(500, audioCtx.currentTime);

      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioCtx.currentTime + 0.5,
      );

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (error) {
      // Log audio errors for debugging purposes
      console.error("Audio notification error:", error);
    }
  };

  // Notificar al usuario con sonido y notificación del sistema
  const notifyUser = useCallback(
    (
      message: string,
      options?: {
        title?: string;
        severity?: WidgetNoticeSeverity;
        system?: boolean;
        ttlMs?: number;
        dedupeKey?: string;
      },
    ) => {
      playNotificationSound();

      if (onNotice) {
        onNotice({
          title: options?.title || "Pomodoro",
          message,
          severity: options?.severity || "info",
          source: "Pomodoro",
          system: options?.system,
          ttlMs: options?.ttlMs,
          dedupeKey: options?.dedupeKey,
        });
        return;
      }

      if (Notification.permission === "granted") {
        new Notification("TrueFocus", {
          body: message,
          silent: !(options?.system ?? false),
        });
      }
    },
    [onNotice],
  );

  // Enviar comando RPC al Arduino
  const sendRpcToArduino = useCallback(
    (status: string, durationSec: number) => {
      if (globalThis.api?.sendRpcCommand) {
        globalThis.api
          .sendRpcCommand({
            method: "setSessionState",
            params: {
              status: status,
              duration_sec: durationSec,
            },
          })
          .then((result) => {
            if (result.success) {
              console.log(`✅ RPC enviado al Arduino: ${status}`);
            } else {
              console.error(
                `❌ Error al enviar RPC al Arduino: ${result.error}`,
              );
            }
          })
          .catch((err) => {
            console.error("❌ Error al enviar RPC:", err);
          });
      }
    },
    [],
  );

  const sendPomodoroUpdate = useCallback(
    (newStatus: PomodoroTelemetry["status"], time: number) => {
      // Enviar telemetría a ThingsBoard
      if (globalThis.api)
        globalThis.api.sendPomodoroUpdate({
          status: newStatus,
          timeLeft: time,
          timestamp: Date.now(),
        });

      // Mapear estado de telemetría a estado del Arduino
      let arduinoStatus = "IDLE";
      if (newStatus === "RUNNING") {
        arduinoStatus = "RUNNING";
      } else if (newStatus === "PAUSED") {
        arduinoStatus = "PAUSED";
      } else if (newStatus === "IDLE") {
        arduinoStatus = "IDLE";
      }

      // Enviar comando RPC al Arduino
      sendRpcToArduino(arduinoStatus, time);
    },
    [sendRpcToArduino],
  );

  useEffect(() => {
    if (!debugMode || !window.api?.getIoTData) return;

    let isMounted = true;

    const fetchIotDebugData = async () => {
      try {
        const data = await window.api.getIoTData();
        if (!isMounted) return;

        setIotDebugData(data);
        setLastIotCheck(new Date().toLocaleTimeString());
      } catch (error) {
        if (!isMounted) return;

        setIotDebugData({
          error: error instanceof Error ? error.message : String(error),
        });
        setLastIotCheck(new Date().toLocaleTimeString());
      }
    };

    void fetchIotDebugData();

    const interval = setInterval(() => {
      void fetchIotDebugData();
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [debugMode]);

  useEffect(() => {
    if (!window.api?.onPresenceChanged) return;

    const unsubscribe = window.api.onPresenceChanged((event) => {
      if (modeRef.current !== "WORK") return;

      if (!event.isPresent && isActiveRef.current) {
        setIsActive(false);
        setAutoPauseReason("presence");
        sendPomodoroUpdate("PAUSED", timeLeftRef.current);
        notifyUser("Ausencia detectada. Timer pausado automáticamente.", {
          title: "Trabajo pausado",
          severity: "warning",
          system: true,
          dedupeKey: "pomodoro-work-absence-paused",
        });
        return;
      }

      if (
        event.isPresent &&
        autoPauseReasonRef.current === "presence" &&
        !isActiveRef.current
      ) {
        setIsActive(true);
        setAutoPauseReason(null);
        sendPomodoroUpdate("RUNNING", timeLeftRef.current);
        notifyUser("Presencia detectada. Timer reanudado.", {
          title: "Trabajo reanudado",
          severity: "success",
          dedupeKey: "pomodoro-work-resumed",
        });
      }
    });

    return () => unsubscribe();
  }, [notifyUser, sendPomodoroUpdate]);

  useEffect(() => {
    if (mode !== "WORK" || !hasLoaded || isPresent || !isActive) {
      return;
    }

    setIsActive(false);
    setAutoPauseReason("presence");
    sendPomodoroUpdate("PAUSED", timeLeft);
    notifyUser("Ausencia detectada. Timer pausado automáticamente.", {
      title: "Trabajo pausado",
      severity: "warning",
      system: true,
      dedupeKey: "pomodoro-work-absence-paused",
    });
  }, [hasLoaded, isActive, isPresent, mode, notifyUser, sendPomodoroUpdate, timeLeft]);

  useEffect(() => {
    if (mode !== "BREAK") return;

    const interval = setInterval(() => {
      if (!hasLoadedRef.current) return;

      if (isPresentRef.current && isActiveRef.current) {
        setPresenceDuringBreak((prev) => {
          const newCount = prev + 1;

          if (newCount === 1 && !warningShownRef.current) {
            notifyUser(
              "Estas en descanso. Alejate del PC para aprovechar la pausa.",
              {
                title: "Recordatorio de descanso",
                severity: "info",
                dedupeKey: "pomodoro-break-presence-warning",
              },
            );
            setBreakWarningShown(true);
            sendRpcToArduino("WARNING", timeLeftRef.current);
          }

          if (newCount >= 3) {
            setIsActive(false);
            setAutoPauseReason("break_presence");
            sendPomodoroUpdate("PAUSED", timeLeftRef.current);
            notifyUser(
              "Descanso pausado. Los descansos lejos del PC ayudan a tu productividad.",
              {
                title: "Descanso pausado",
                severity: "warning",
                dedupeKey: "pomodoro-break-paused",
              },
            );
            setBreakWarningShown(false);
            return 0;
          }

          return newCount;
        });

        return;
      }

      if (!isPresentRef.current) {
        if (
          autoPauseReasonRef.current === "break_presence" &&
          !isActiveRef.current
        ) {
          setIsActive(true);
          setAutoPauseReason(null);
          sendPomodoroUpdate("RUNNING", timeLeftRef.current);
          notifyUser("Te alejaste del PC. Descanso reanudado.", {
            title: "Descanso reanudado",
            severity: "success",
            dedupeKey: "pomodoro-break-resumed",
          });
        } else if (warningShownRef.current && isActiveRef.current) {
          sendRpcToArduino("RUNNING", timeLeftRef.current);
        }

        setPresenceDuringBreak(0);
        setBreakWarningShown(false);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [hasLoaded, mode, notifyUser, sendPomodoroUpdate, sendRpcToArduino]);

  useEffect(() => {
    const previousReason = previousAlarmBlockingReasonRef.current;
    previousAlarmBlockingReasonRef.current = alarmBlockingReason;

    if (
      previousReason === "CO2_CRITICO" &&
      alarmBlockingReason !== "CO2_CRITICO" &&
      autoPauseReasonRef.current === "critical_alarm" &&
      !isActiveRef.current
    ) {
      notifyUser("La alarma critica se despejo. Puedes reanudar manualmente.", {
        title: "Alarma critica resuelta",
        severity: "success",
        system: true,
        dedupeKey: "pomodoro-critical-alarm-cleared",
      });
    }

    if (!alarmBlockingReason || !isActiveRef.current) {
      return;
    }

    if (alarmBlockingReason === "CO2_CRITICO") {
      setIsActive(false);
      setAutoPauseReason("critical_alarm");
      sendPomodoroUpdate("PAUSED", timeLeftRef.current);
      notifyUser(
        "CO2 critico detectado. Pomodoro pausado hasta que revises el ambiente.",
        {
          title: "CO2 critico",
          severity: "critical",
          system: true,
          dedupeKey: "pomodoro-critical-alarm-pause",
          ttlMs: 9000,
        },
      );
      return;
    }

  }, [alarmBlockingReason, notifyUser, sendPomodoroUpdate]);

  const handleTimerComplete = useCallback(() => {
    sendPomodoroUpdate("COMPLETED", 0);

    let nextMode: TimerMode = mode;
    let nextTime = 0;
    let nextIsActive = true;
    let nextAutoPauseReason: AutoPauseReason = null;

    if (mode === "WORK") {
      if (onCycleComplete) onCycleComplete();
      nextMode = "BREAK";

      const cyclesCompleted = currentCycle + 1;
      const isLong = cyclesCompleted % 4 === 0;
      nextTime = isLong
        ? longBreakDurationMinutes * 60
        : shortBreakDurationMinutes * 60;

      notifyUser(
        isLong ? "Gran trabajo. Toca un descanso largo." : "Empieza tu descanso corto.",
        {
          title: "Sesion completada",
          severity: "success",
          dedupeKey: isLong
            ? "pomodoro-break-long-start"
            : "pomodoro-break-short-start",
        },
      );
    } else {
      nextMode = "WORK";
      nextTime = workDurationMinutes * 60;

      if (hasLoadedRef.current && !isPresentRef.current) {
        nextIsActive = false;
        nextAutoPauseReason = "presence";
        notifyUser("Descanso completado. El trabajo queda en pausa porque sigues ausente.", {
          title: "Trabajo en espera",
          severity: "warning",
          system: true,
          dedupeKey: "pomodoro-work-paused-after-break",
        });
      } else {
        notifyUser("Es momento de volver al trabajo.", {
          title: "Vuelta al foco",
          severity: "success",
          dedupeKey: "pomodoro-work-start",
        });
      }
    }

    setTimeLeft(nextTime);
    setIsActive(nextIsActive);
    setAutoPauseReason(nextAutoPauseReason);
    setPresenceDuringBreak(0);
    setBreakWarningShown(false);
    setMode(nextMode);
    sendPomodoroUpdate(nextIsActive ? "RUNNING" : "PAUSED", nextTime);
  }, [
    mode,
    sendPomodoroUpdate,
    onCycleComplete,
    currentCycle,
    longBreakDurationMinutes,
    notifyUser,
    shortBreakDurationMinutes,
    workDurationMinutes,
  ]);

  const handleTimerCompleteRef = useRef(handleTimerComplete);

  useEffect(() => {
    handleTimerCompleteRef.current = handleTimerComplete;
  }, [handleTimerComplete]);

  // Intervalo del reloj
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setTimeout(() => {
            handleTimerCompleteRef.current();
          }, 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive]);

  const toggleTimer = () => {
    // Si el usuario pausa manualmente, cancelar el estado de pausa automática
    if (isActive) {
      setAutoPauseReason(null);
    } else {
      if (criticalAlarmActive) {
        notifyUser(
          "No puedes reanudar mientras siga activa una alarma critica de CO2.",
          {
            title: "CO2 critico",
            severity: "critical",
            system: true,
            dedupeKey: "pomodoro-critical-alarm-start-blocked",
          },
        );
        return;
      }

      // Si el usuario inicia manualmente, marcarlo
      setAutoPauseReason(null);
      setWasManuallyStarted(true);
    }

    const newActiveState = !isActive;
    setIsActive(newActiveState);
    sendPomodoroUpdate(newActiveState ? "RUNNING" : "PAUSED", timeLeft);
  };

  const resetTimer = () => {
    setIsActive(false);
    setAutoPauseReason(null);
    setWasManuallyStarted(false);
    setTimeLeft(targetTime);
    sendPomodoroUpdate("IDLE", targetTime);
  };

  const skipTimer = () => {
    const nextMode = mode === "WORK" ? "BREAK" : "WORK";
    setMode(nextMode);

    if (nextMode === "WORK") {
      setTimeLeft(workDurationMinutes * 60);
    } else {
      const isLong = (currentCycle + 1) % 4 === 0;
      setTimeLeft(
        isLong
          ? longBreakDurationMinutes * 60
          : shortBreakDurationMinutes * 60,
      );
    }

    setIsActive(false);
    setAutoPauseReason(null);
    setPresenceDuringBreak(0);
    setBreakWarningShown(false);
    sendPomodoroUpdate("IDLE", 0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };
  const progressPercent =
    targetTime > 0
      ? Math.min(100, Math.max(0, ((targetTime - timeLeft) / targetTime) * 100))
      : 0;

  return (
    <div className="glass-card relative flex h-full min-h-0 w-full flex-col items-center justify-between overflow-hidden rounded-3xl p-4 transition-all duration-300">
      {/* Botón Debug */}
      <button
        onClick={() => setDebugMode(!debugMode)}
        className={`absolute top-3 right-3 z-10 rounded-lg p-1.5 transition-all ${debugMode ? "bg-yellow-500/20 text-yellow-300" : "bg-white/5 text-white/50 hover:bg-white/10"}`}
        title="Modo Debug IoT"
      >
        <Bug size={16} />
      </button>

      {/* Panel Debug IoT */}
      {debugMode && (
        <div className="absolute top-12 right-2 z-10 max-h-56 w-64 overflow-auto rounded-xl border border-white/20 bg-black/90 p-3 text-xs font-mono text-white shadow-xl backdrop-blur-md dark-scrollbar">
          <div className="text-yellow-300 font-bold mb-2">
            🐛 DEBUG - IoT Connection
          </div>
          <div className="space-y-1 text-xs text-white/80">
            <div>⏰ Last Check: {lastIotCheck}</div>
            <div>👤 Present: {isPresent ? "✓ YES" : "✗ NO"}</div>
            <div>⏸️ Auto-Paused: {wasAutoPaused ? "YES" : "NO"}</div>
            <div>🧩 Pause Reason: {autoPauseReason || "NONE"}</div>
            <div>🚨 Alarm Block: {alarmBlockingReason || "NONE"}</div>
            <div>🎯 Mode: {mode}</div>
            <div>▶️ Active: {isActive ? "YES" : "NO"}</div>
            {mode === "BREAK" && (
              <>
                <div>⏱️ Presence Count: {presenceDuringBreak}</div>
                <div>⚠️ Warning Shown: {breakWarningShown ? "YES" : "NO"}</div>
              </>
            )}
          </div>
          <div className="mt-2 pt-2 border-t border-white/20">
            <div className="text-blue-300 font-bold mb-1">📡 Raw Data:</div>
            {iotDebugData ? (
              <pre className="text-[10px] text-white/70 whitespace-pre-wrap break-all">
                {JSON.stringify(iotDebugData, null, 2)}
              </pre>
            ) : (
              <div className="text-red-300">No data received</div>
            )}
          </div>
        </div>
      )}

      {/* Indicador de alarma critica */}
      {criticalAlarmActive && (
        <div className="mb-2 flex w-full shrink-0 items-center gap-2 rounded-2xl border border-red-300/60 bg-red-950/55 p-2 text-xs text-red-100 shadow-[0_0_18px_rgba(127,29,29,0.18)]">
          <TriangleAlert size={18} className="shrink-0 text-red-200" />
          <span className="font-semibold leading-4">
            CO2 critico detectado. Revisa la ventilacion antes de reanudar.
          </span>
        </div>
      )}

      {/* Indicador de ausencia */}
      {!criticalAlarmActive && !isPresent && mode === "WORK" && (
        <div className="mb-2 flex w-full shrink-0 items-center gap-2 rounded-2xl border border-red-400/50 bg-red-500/20 p-2 text-xs text-red-300 animate-pulse">
          <UserX size={18} />
          <span className="font-semibold leading-4">
            Ausencia detectada - Timer pausado automáticamente
          </span>
        </div>
      )}

      {/* TABS */}
      <div className="flex w-full max-w-[260px] shrink-0 items-center justify-between rounded-full border border-white/10 bg-primary-50/20 p-1 backdrop-blur-sm">
        <button
          onClick={() => {
            setMode("WORK");
            setTimeLeft(workDurationMinutes * 60);
            setIsActive(false);
            setAutoPauseReason(null);
            setPresenceDuringBreak(0);
            setBreakWarningShown(false);
          }}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs transition-all duration-300 ${
            mode === "WORK"
              ? "bg-white text-brand-green-500 shadow-md font-bold"
              : "text-primary-100 hover:text-white"
          }`}
        >
          <Clock size={16} />
          <span>Trabajo</span>
        </button>

        <button
          onClick={() => {
            setMode("BREAK");
            const isLong = (currentCycle + 1) % 4 === 0;
            setTimeLeft(
              isLong
                ? longBreakDurationMinutes * 60
                : shortBreakDurationMinutes * 60,
            );
            setIsActive(false);
            setAutoPauseReason(null);
            setPresenceDuringBreak(0);
            setBreakWarningShown(false);
          }}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs transition-all duration-300 ${
            mode === "BREAK"
              ? "bg-white text-brand-green-500 shadow-md font-bold"
              : "text-primary-100 hover:text-white"
          }`}
        >
          <span>Descanso</span>
          {isLongBreak ? <Armchair size={16} /> : <Coffee size={16} />}
        </button>
      </div>

      {/* TIMER */}
      <div className="flex min-h-0 flex-1 items-center justify-center py-2">
        <h1 className="text-[clamp(3.15rem,7.2vw,4.7rem)] leading-none font-bold text-white tracking-[0.04em] drop-shadow-lg">
          {formatTime(timeLeft)}
        </h1>
      </div>

      {/* BARRA */}
      <div className="mb-4 h-1.5 w-full shrink-0 overflow-hidden rounded-full border border-white/5 bg-white/10">
        <div
          className="h-full bg-brand-green-400 transition-all duration-1000 ease-linear shadow-[0_0_10px_rgba(52,211,153,0.5)]"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* CONTROLES */}
      <div className="flex shrink-0 items-center gap-3">
        <button
          onClick={resetTimer}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-primary-600 shadow-lg transition hover:scale-105 hover:bg-gray-100 active:scale-95"
        >
          <RotateCcw size={18} />
        </button>

        <button
          onClick={toggleTimer}
          disabled={(!isPresent && mode === "WORK") || criticalAlarmActive}
          className={`flex h-11 items-center gap-2 rounded-full px-5 text-sm font-bold shadow-xl transition-all hover:scale-105 active:scale-95 ${
            ((!isPresent && mode === "WORK") || criticalAlarmActive)
              ? "bg-gray-500 cursor-not-allowed opacity-50"
              : "bg-brand-green-500 hover:bg-brand-green-400 text-white"
          }`}
        >
          {criticalAlarmActive && !isActive ? (
            <>
              <TriangleAlert size={16} />
              <span>Bloqueado</span>
            </>
          ) : isActive ? (
            <>
              <Pause fill="currentColor" size={16} />
              <span>Pausar</span>
            </>
          ) : (
            <>
              <Play fill="currentColor" size={16} />
              <span>Iniciar</span>
            </>
          )}
        </button>

        <button
          onClick={skipTimer}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-primary-600 shadow-lg transition hover:scale-105 hover:bg-gray-100 active:scale-95"
        >
          <SkipForward fill="currentColor" size={18} />
        </button>
      </div>
    </div>
  );
}
export default Pomodoro;
