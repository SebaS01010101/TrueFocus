import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, RotateCcw, SkipForward, Coffee, Clock, Square } from 'lucide-react';
import type { PomodoroTelemetry } from '../shared/types';

const WORK_TIME = 5;//25 * 60; 
const BREAK_TIME = 5; //5 * 60; 

type TimerMode = 'WORK' | 'BREAK';

function Pomodoro() {
  const [timeLeft, setTimeLeft] = useState(WORK_TIME);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<TimerMode>('WORK');
  
  const totalTime = mode === 'WORK' ? WORK_TIME : BREAK_TIME;

  // 1. SOLICITAR PERMISO PARA NOTIFICACIONES AL CARGAR
  useEffect(() => {
    if (Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }, []);

  // 2. FUNCIÓN PARA GENERAR SONIDO (Sin archivos externos)
  const playNotificationSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Configuración del sonido (un "ding" agradable)
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(500, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.5);
    } catch (e) {
      console.error("Audio error", e);
    }
  };

  // 3. FUNCIÓN UNIFICADA DE NOTIFICACIÓN
  const notifyUser = (message: string) => {
    // Sonido
    playNotificationSound();

    // Notificación visual de escritorio (No bloqueante)
    if (Notification.permission === 'granted') {
      new Notification('TrueFocus', {
        body: message,
        icon: '/vite.svg', // Usa el logo de tu app si tienes uno
        silent: true // Silenciamos la nativa porque ya usamos nuestro propio sonido
      });
    }
  };

  const sendPomodoroUpdate = useCallback((newStatus: PomodoroTelemetry['status'], time: number) => {
    if (globalThis.api) {
        globalThis.api.sendPomodoroUpdate({
            status: newStatus,
            timeLeft: time,
            timestamp: Date.now()
        });
    }
  }, []);

  // --- LÓGICA DE FINALIZACIÓN ---
  const handleTimerComplete = useCallback(() => {
    sendPomodoroUpdate('COMPLETED', 0);
    
    const nextMode = mode === 'WORK' ? 'BREAK' : 'WORK';
    const nextTime = nextMode === 'WORK' ? WORK_TIME : BREAK_TIME;

    setMode(nextMode);
    setTimeLeft(nextTime);
    
    // CAMBIO: Usamos nuestra nueva función no bloqueante
    const msg = nextMode === 'BREAK' 
      ? "¡Buen trabajo! Es hora de un descanso de 5 minutos." 
      : "Descanso terminado. ¡A concentrarse de nuevo!";
      
    notifyUser(msg);

  }, [mode, sendPomodoroUpdate]);

  // Referencia mutable para el callback
  const handleTimerCompleteRef = useRef(handleTimerComplete);
  
  useEffect(() => {
    handleTimerCompleteRef.current = handleTimerComplete;
  }, [handleTimerComplete]);

  // --- EFECTO DEL TEMPORIZADOR ---
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Ejecutamos la finalización en el siguiente ciclo de eventos para evitar loops
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

  // --- CONTROLES ---
  const toggleTimer = () => {
    const nextState = !isActive;
    setIsActive(nextState);
    const newStatus = nextState ? 'RUNNING' : 'PAUSED';
    sendPomodoroUpdate(newStatus, timeLeft);
  };

  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(totalTime);
    sendPomodoroUpdate('IDLE', totalTime);
  };

  const skipTimer = () => {
    const nextMode = mode === 'WORK' ? 'BREAK' : 'WORK';
    const nextTime = nextMode === 'WORK' ? WORK_TIME : BREAK_TIME;
    
    setMode(nextMode);
    setTimeLeft(nextTime);
    setIsActive(false); 
    sendPomodoroUpdate('IDLE', nextTime);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = ((totalTime - timeLeft) / totalTime) * 100;

  return (
    <div className="glass-card rounded-3xl flex flex-col items-center w-full max-w-sm mx-auto p-6 mt-10">
      
      {/* HEADER: TABS */}
      <div className="bg-primary-50/20 backdrop-blur-sm p-1 rounded-full flex items-center justify-between w-full mb-12 border border-white/10">
        <button
          onClick={() => { setMode('WORK'); setTimeLeft(WORK_TIME); setIsActive(false); }}
          className={`flex items-center gap-2 px-6 py-2 rounded-full transition-all duration-300 ${
            mode === 'WORK' 
              ? 'bg-white text-brand-green-500 shadow-md font-bold' 
              : 'text-primary-100 hover:text-white'
          }`}
        >
          <Clock size={18} />
          <span>Trabajo</span>
        </button>

        <button
          onClick={() => { setMode('BREAK'); setTimeLeft(BREAK_TIME); setIsActive(false); }}
          className={`flex items-center gap-2 px-6 py-2 rounded-full transition-all duration-300 ${
            mode === 'BREAK' 
              ? 'bg-white text-brand-green-500 shadow-md font-bold' 
              : 'text-primary-100 hover:text-white'
          }`}
        >
          <span>Descanso</span>
          <Coffee size={18} />
        </button>
      </div>

      {/* TIMER */}
      <div className="mb-8 relative">
        <h1 className="text-display font-bold text-white tracking-wider drop-shadow-lg">
          {formatTime(timeLeft)}
        </h1>
      </div>

      {/* PROGRESS BAR */}
      <div className="w-full h-2 bg-white/10 rounded-full mb-12 overflow-hidden border border-white/5">
        <div 
          className="h-full bg-brand-green-400 transition-all duration-1000 ease-linear shadow-[0_0_10px_rgba(52,211,153,0.5)]"
          style={{ width: `${progressPercent}%` }} 
        />
      </div>

      {/* CONTROLS */}
      <div className="flex items-center gap-6">
        <button 
          onClick={resetTimer}
          className="w-14 h-14 bg-white rounded-full flex items-center justify-center text-primary-600 hover:bg-gray-100 transition shadow-lg hover:scale-105 active:scale-95"
          title="Reiniciar"
        >
          <RotateCcw size={24} />
        </button>

        <button 
          onClick={toggleTimer}
          className={`
            h-16 px-8 rounded-full flex items-center gap-3 shadow-xl hover:scale-105 active:scale-95 transition-all
            ${isActive ? 'bg-brand-green-500 hover:bg-brand-green-400' : 'bg-brand-green-500 hover:bg-brand-green-400'}
            text-white font-bold text-lg
          `}
        >
          {isActive ? (
            <>
              <Square fill="currentColor" size={20} />
              <span>Parar</span>
            </>
          ) : (
            <>
              <Play fill="currentColor" size={20} />
              <span>Iniciar</span>
            </>
          )}
        </button>

        <button 
          onClick={skipTimer}
          className="w-14 h-14 bg-white rounded-full flex items-center justify-center text-primary-600 hover:bg-gray-100 transition shadow-lg hover:scale-105 active:scale-95"
          title="Saltar"
        >
          <SkipForward fill="currentColor" size={24} />
        </button>
      </div>

    </div>
  );
}

export default Pomodoro;