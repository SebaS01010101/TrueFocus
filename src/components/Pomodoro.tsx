import { useState, useEffect, useCallback, useRef } from 'react';
import type { PomodoroTelemetry } from '../shared/types';

const WORK_TIME = 25 * 60; // 25 minutos

function Pomodoro() {
  const [timeLeft, setTimeLeft] = useState(WORK_TIME);
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<PomodoroTelemetry['status']>('IDLE');
  const isActiveRef = useRef(isActive);

  // Mantener la ref sincronizada con el estado
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // Función para enviar datos a ThingsBoard
  const sendPomodoroUpdate = useCallback((newStatus: PomodoroTelemetry['status'], time: number) => {
    globalThis.api.sendPomodoroUpdate({
      status: newStatus,
      timeLeft: time,
      timestamp: Date.now()
    });
  }, []);

  // Handler para cuando el timer llega a cero
  const handleTimerComplete = useCallback(() => {
    if (isActiveRef.current) {
      setIsActive(false);
      setStatus('COMPLETED');
      sendPomodoroUpdate('COMPLETED', 0);
      alert("¡Tiempo terminado!");
    }
  }, [sendPomodoroUpdate]);

  // Timer Lógica - maneja countdown y completación
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      setTimeLeft((prevTime) => {
        if (prevTime <= 1) {
          clearInterval(interval);
          setTimeout(handleTimerComplete, 0);
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, handleTimerComplete]);

  const toggleTimer = () => {
    const nextState = !isActive;
    setIsActive(nextState);
    const newStatus = nextState ? 'RUNNING' : 'PAUSED';
    setStatus(newStatus);
    sendPomodoroUpdate(newStatus, timeLeft);
  };

  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(WORK_TIME);
    setStatus('IDLE');
    sendPomodoroUpdate('IDLE', WORK_TIME);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <h1 className="text-5xl font-mono text-white mb-8">{formatTime(timeLeft)}</h1>
      <div className="flex gap-4">
        <button 
          onClick={toggleTimer}
          className={`px-6 py-2 rounded font-bold ${isActive ? 'bg-yellow-500' : 'bg-green-500'} text-white`}
        >
          {isActive ? 'PAUSAR' : 'INICIAR'}
        </button>
        <button 
          onClick={resetTimer}
          className="px-6 py-2 rounded bg-red-500 text-white font-bold"
        >
          RESET
        </button>
      </div>
      <p className="mt-4 text-gray-400">Estado IoT: {status}</p>
    </div>
  );
}

export default Pomodoro;