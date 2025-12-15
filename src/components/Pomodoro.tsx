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
} from "lucide-react";
import type { PomodoroTelemetry, PomodoroSettings } from "../shared/types";

interface PomodoroProps {
  onCycleComplete?: () => void;
  settings: PomodoroSettings;
  currentCycle: number;
}

type TimerMode = "WORK" | "BREAK";

function Pomodoro({ onCycleComplete, settings, currentCycle }: PomodoroProps) {
  const [timeLeft, setTimeLeft] = useState(settings.workDuration * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<TimerMode>("WORK");
  const [isPresent, setIsPresent] = useState<boolean>(true);
  const [wasAutoPaused, setWasAutoPaused] = useState<boolean>(false);
  const [wasManuallyStarted, setWasManuallyStarted] = useState<boolean>(false);
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [iotDebugData, setIotDebugData] = useState<unknown>(null);
  const [lastIotCheck, setLastIotCheck] = useState<string>("--");
  const [presenceDuringBreak, setPresenceDuringBreak] = useState<number>(0);
  const [breakWarningShown, setBreakWarningShown] = useState<boolean>(false);

  // Refs para mantener valores actualizados sin reiniciar el efecto
  const isActiveRef = useRef(isActive);
  const wasPausedRef = useRef(wasAutoPaused);
  const modeRef = useRef(mode);
  const timeLeftRef = useRef(timeLeft);
  const presenceCountRef = useRef(presenceDuringBreak);
  const warningShownRef = useRef(breakWarningShown);

  // Actualizar refs cuando cambian los estados
  useEffect(() => {
    isActiveRef.current = isActive;
    wasPausedRef.current = wasAutoPaused;
    modeRef.current = mode;
    timeLeftRef.current = timeLeft;
    presenceCountRef.current = presenceDuringBreak;
    warningShownRef.current = breakWarningShown;
  }, [
    isActive,
    wasAutoPaused,
    mode,
    timeLeft,
    presenceDuringBreak,
    breakWarningShown,
  ]);

  const isLongBreak =
    mode === "WORK"
      ? (currentCycle + 1) % 4 === 0
      : currentCycle > 0 && currentCycle % 4 === 0;

  const targetTime =
    mode === "WORK"
      ? settings.workDuration * 60
      : isLongBreak
        ? settings.longBreakDuration * 60
        : settings.shortBreakDuration * 60;

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
  const notifyUser = useCallback((message: string) => {
    playNotificationSound();
    if (Notification.permission === "granted") {
      new Notification("TrueFocus", { body: message, silent: true });
    }
  }, []);

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

  // Monitorear presencia del usuario desde el dispositivo IoT
  useEffect(() => {
    const previousPresenceRef = { current: isPresent };

    const checkPresence = async () => {
      if (!window.api?.getIoTData) return;

      try {
        const data = await window.api.getIoTData();
        setIotDebugData(data);
        setLastIotCheck(new Date().toLocaleTimeString());

        if (data?.presence) {
          const present =
            data.presence.value === "true" || data.presence.value === "1";

          // Detectar cambio de presencia
          const presenceChanged = present !== previousPresenceRef.current;

          if (presenceChanged) {
            setIsPresent(present);

            // === LÓGICA PARA MODO WORK ===
            if (modeRef.current === "WORK") {
              // Si la persona se fue y el timer estaba activo
              if (!present && isActiveRef.current) {
                setIsActive(false);
                setWasAutoPaused(true);
                sendPomodoroUpdate("PAUSED", timeLeftRef.current);
                notifyUser(
                  "⚠️ Ausencia detectada. Timer pausado automáticamente.",
                );
              }

              // Si la persona regresó y fue pausado automáticamente
              if (present && wasPausedRef.current && !isActiveRef.current) {
                setIsActive(true);
                setWasAutoPaused(false);
                sendPomodoroUpdate("RUNNING", timeLeftRef.current);
                notifyUser("✅ Presencia detectada. Timer reanudado.");
              }
            }

            previousPresenceRef.current = present;
          }

          // === LÓGICA PARA MODO BREAK ===
          if (modeRef.current === "BREAK") {
            if (present && isActiveRef.current) {
              // Incrementar contador de presencia durante descanso
              setPresenceDuringBreak((prev) => {
                const newCount = prev + 1;

                // Primera advertencia (1 check = 3 segundos)
                if (newCount === 1 && !warningShownRef.current) {
                  notifyUser(
                    "⏸️ Estás en descanso. Aléjate del PC para aprovechar tu pausa.",
                  );
                  setBreakWarningShown(true);
                  // Enviar estado WARNING al Arduino
                  sendRpcToArduino("WARNING", timeLeftRef.current);
                }

                // Segunda advertencia y pausa (3 checks = ~10 segundos)
                if (newCount >= 3) {
                  setIsActive(false);
                  setWasAutoPaused(true);
                  sendPomodoroUpdate("PAUSED", timeLeftRef.current);
                  notifyUser(
                    "⏸️ Descanso pausado. Recuerda: los descansos son importantes para tu productividad.",
                  );
                  setBreakWarningShown(false);
                  // El Arduino ya recibirá PAUSED a través de sendPomodoroUpdate
                  return 0; // Resetear contador
                }

                return newCount;
              });
            } else if (!present) {
              // Si la persona se va y el timer fue pausado automáticamente, reanudarlo
              if (wasPausedRef.current && !isActiveRef.current) {
                setIsActive(true);
                setWasAutoPaused(false);
                sendPomodoroUpdate("RUNNING", timeLeftRef.current);
                notifyUser("✅ Ausencia detectada. Descanso reanudado.");
              } else if (warningShownRef.current && isActiveRef.current) {
                // Si la persona se va durante el warning, volver a RUNNING normal
                sendRpcToArduino("RUNNING", timeLeftRef.current);
              }
              // Resetear contadores si la persona se va
              setPresenceDuringBreak(0);
              setBreakWarningShown(false);
            }
          }
        }
      } catch (error) {
        console.error("Error al verificar presencia:", error);
      }
    };

    // Verificar presencia cada 3 segundos
    const interval = setInterval(checkPresence, 3000);
    checkPresence(); // Llamada inicial
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendPomodoroUpdate, notifyUser]); // Solo dependencias de funciones estables

  const handleTimerComplete = useCallback(() => {
    sendPomodoroUpdate("COMPLETED", 0);

    let nextMode: TimerMode = mode;

    if (mode === "WORK") {
      if (onCycleComplete) onCycleComplete();
      nextMode = "BREAK";

      const cyclesCompleted = currentCycle + 1;
      const isLong = cyclesCompleted % 4 === 0;

      setTimeLeft(
        isLong
          ? settings.longBreakDuration * 60
          : settings.shortBreakDuration * 60,
      );
      notifyUser(
        isLong ? "¡Gran trabajo! Toca descanso largo." : "Descanso corto.",
      );

      // Resetear contadores de descanso
      setPresenceDuringBreak(0);
      setBreakWarningShown(false);
    } else {
      nextMode = "WORK";
      setTimeLeft(settings.workDuration * 60);
      notifyUser("¡A trabajar!");
    }

    setMode(nextMode);
  }, [
    mode,
    sendPomodoroUpdate,
    onCycleComplete,
    settings,
    currentCycle,
    notifyUser,
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
      setWasAutoPaused(false);
    } else {
      // Si el usuario inicia manualmente, marcarlo
      setWasManuallyStarted(true);
    }

    const newActiveState = !isActive;
    setIsActive(newActiveState);
    sendPomodoroUpdate(newActiveState ? "RUNNING" : "PAUSED", timeLeft);
  };

  const resetTimer = () => {
    setIsActive(false);
    setWasAutoPaused(false);
    setWasManuallyStarted(false);
    setTimeLeft(targetTime);
    sendPomodoroUpdate("IDLE", targetTime);
  };

  const skipTimer = () => {
    const nextMode = mode === "WORK" ? "BREAK" : "WORK";
    setMode(nextMode);

    if (nextMode === "WORK") {
      setTimeLeft(settings.workDuration * 60);
    } else {
      const isLong = (currentCycle + 1) % 4 === 0;
      setTimeLeft(
        isLong
          ? settings.longBreakDuration * 60
          : settings.shortBreakDuration * 60,
      );
    }

    setIsActive(false);
    setWasAutoPaused(false);
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
  const progressPercent = ((targetTime - timeLeft) / targetTime) * 100;

  return (
    <div className="glass-card rounded-3xl flex flex-col items-center justify-between w-full h-full p-5 transition-all duration-300">
      {/* Botón Debug */}
      <button
        onClick={() => setDebugMode(!debugMode)}
        className={`absolute top-2 right-2 p-1.5 rounded-lg transition-all z-10 ${debugMode ? "bg-yellow-500/20 text-yellow-300" : "bg-white/5 text-white/50 hover:bg-white/10"}`}
        title="Modo Debug IoT"
      >
        <Bug size={16} />
      </button>

      {/* Panel Debug IoT */}
      {debugMode && (
        <div className="absolute top-12 right-2 bg-black/90 backdrop-blur-md rounded-xl p-3 text-xs font-mono text-white w-72 max-h-64 overflow-auto z-10 border border-white/20 shadow-xl dark-scrollbar">
          <div className="text-yellow-300 font-bold mb-2">
            🐛 DEBUG - IoT Connection
          </div>
          <div className="space-y-1 text-xs text-white/80">
            <div>⏰ Last Check: {lastIotCheck}</div>
            <div>👤 Present: {isPresent ? "✓ YES" : "✗ NO"}</div>
            <div>⏸️ Auto-Paused: {wasAutoPaused ? "YES" : "NO"}</div>
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

      {/* Indicador de ausencia */}
      {!isPresent && mode === "WORK" && (
        <div className="w-full mb-3 bg-red-500/20 border border-red-400/50 rounded-2xl p-3 flex items-center gap-2 text-red-300 text-sm animate-pulse shrink-0">
          <UserX size={18} />
          <span className="font-semibold">
            Ausencia detectada - Timer pausado automáticamente
          </span>
        </div>
      )}

      {/* TABS */}
      <div className="bg-primary-50/20 backdrop-blur-sm p-1 rounded-full flex items-center justify-between w-full max-w-[280px] border border-white/10 shrink-0">
        <button
          onClick={() => {
            setMode("WORK");
            setTimeLeft(settings.workDuration * 60);
            setIsActive(false);
            setWasAutoPaused(false);
            setPresenceDuringBreak(0);
            setBreakWarningShown(false);
          }}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full transition-all duration-300 text-sm ${
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
                ? settings.longBreakDuration * 60
                : settings.shortBreakDuration * 60,
            );
            setIsActive(false);
            setWasAutoPaused(false);
            setPresenceDuringBreak(0);
            setBreakWarningShown(false);
          }}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full transition-all duration-300 text-sm ${
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
      <div className="flex-1 flex items-center justify-center">
        <h1 className="text-6xl font-bold text-white tracking-wider drop-shadow-lg">
          {formatTime(timeLeft)}
        </h1>
      </div>

      {/* BARRA */}
      <div className="w-full h-1.5 bg-white/10 rounded-full mb-6 overflow-hidden border border-white/5 shrink-0">
        <div
          className="h-full bg-brand-green-400 transition-all duration-1000 ease-linear shadow-[0_0_10px_rgba(52,211,153,0.5)]"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* CONTROLES */}
      <div className="flex items-center gap-5 shrink-0">
        <button
          onClick={resetTimer}
          className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-primary-600 hover:bg-gray-100 transition shadow-lg hover:scale-105 active:scale-95"
        >
          <RotateCcw size={20} />
        </button>

        <button
          onClick={toggleTimer}
          disabled={!isPresent && mode === "WORK"}
          className={`h-12 px-6 rounded-full flex items-center gap-2 shadow-xl hover:scale-105 active:scale-95 transition-all font-bold text-base ${
            !isPresent && mode === "WORK"
              ? "bg-gray-500 cursor-not-allowed opacity-50"
              : "bg-brand-green-500 hover:bg-brand-green-400 text-white"
          }`}
        >
          {isActive ? (
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
          className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-primary-600 hover:bg-gray-100 transition shadow-lg hover:scale-105 active:scale-95"
        >
          <SkipForward fill="currentColor" size={20} />
        </button>
      </div>
    </div>
  );
}
export default Pomodoro;
