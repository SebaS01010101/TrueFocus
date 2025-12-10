import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, RotateCcw, SkipForward, Coffee, Clock, Square, Armchair } from 'lucide-react';
import type { PomodoroTelemetry, PomodoroSettings } from '../shared/types';

interface PomodoroProps {
  onCycleComplete?: () => void;
  settings: PomodoroSettings; 
  currentCycle: number;       
}

type TimerMode = 'WORK' | 'BREAK';

function Pomodoro({ onCycleComplete, settings, currentCycle }: PomodoroProps) {
  const [timeLeft, setTimeLeft] = useState(settings.workDuration * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<TimerMode>('WORK');
  
  const isLongBreak = mode === 'WORK' 
    ? (currentCycle + 1) % 4 === 0 
    : currentCycle > 0 && currentCycle % 4 === 0;
  
  const targetTime = mode === 'WORK' 
    ? settings.workDuration * 60 
    : (isLongBreak ? settings.longBreakDuration * 60 : settings.shortBreakDuration * 60);

  // Sincronizar tiempo cuando cambia la configuración (solo si no está activo)
  useEffect(() => {
    if (!isActive && timeLeft !== targetTime) {
      const timerId = setTimeout(() => setTimeLeft(targetTime), 0);
      return () => clearTimeout(timerId);
    }
  }, [targetTime, isActive, timeLeft]); 

  // Solicitar permisos de notificación al montar
  useEffect(() => {
    if (Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }, []);

  // Reproducir sonido de notificación usando Web Audio API
  const playNotificationSound = () => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      const audioCtx = new AudioContextClass();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(500, audioCtx.currentTime);
      
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (error) {
      // Log audio errors for debugging purposes
      console.error('Audio notification error:', error);
    }
  };
  
  // Notificar al usuario con sonido y notificación del sistema
  const notifyUser = useCallback((message: string) => {
    playNotificationSound();
    if (Notification.permission === 'granted') {
      new Notification('TrueFocus', { body: message, silent: true });
    }
  }, []);

  const sendPomodoroUpdate = useCallback((newStatus: PomodoroTelemetry['status'], time: number) => {
    if (globalThis.api) globalThis.api.sendPomodoroUpdate({ status: newStatus, timeLeft: time, timestamp: Date.now() });
  }, []);

  const handleTimerComplete = useCallback(() => {
    sendPomodoroUpdate('COMPLETED', 0);
    
    let nextMode: TimerMode = mode;
    
    if (mode === 'WORK') {
      if (onCycleComplete) onCycleComplete();
      nextMode = 'BREAK';
      
      const cyclesCompleted = currentCycle + 1;
      const isLong = cyclesCompleted % 4 === 0;
      
      setTimeLeft(isLong ? settings.longBreakDuration * 60 : settings.shortBreakDuration * 60);
      notifyUser(isLong ? "¡Gran trabajo! Toca descanso largo." : "Descanso corto.");
    } else {
      nextMode = 'WORK';
      setTimeLeft(settings.workDuration * 60);
      notifyUser("¡A trabajar!");
    }

    setMode(nextMode);
  }, [mode, sendPomodoroUpdate, onCycleComplete, settings, currentCycle, notifyUser]);

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
          setTimeout(() => { handleTimerCompleteRef.current(); }, 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive]);

  const toggleTimer = () => {
    const newActiveState = !isActive;
    setIsActive(newActiveState);
    sendPomodoroUpdate(newActiveState ? 'RUNNING' : 'PAUSED', timeLeft);
  };
  
  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(targetTime);
    sendPomodoroUpdate('IDLE', targetTime);
  };
  
  const skipTimer = () => {
    const nextMode = mode === 'WORK' ? 'BREAK' : 'WORK';
    setMode(nextMode);
    
    if (nextMode === 'WORK') {
      setTimeLeft(settings.workDuration * 60);
    } else {
      const isLong = (currentCycle + 1) % 4 === 0;
      setTimeLeft(isLong ? settings.longBreakDuration * 60 : settings.shortBreakDuration * 60);
    }
    
    setIsActive(false);
    sendPomodoroUpdate('IDLE', 0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };
  const progressPercent = ((targetTime - timeLeft) / targetTime) * 100;

  return (
     <div className="glass-card rounded-3xl flex flex-col items-center justify-between w-full h-full p-5 transition-all duration-300">
        
        {/* TABS */}
        <div className="bg-primary-50/20 backdrop-blur-sm p-1 rounded-full flex items-center justify-between w-full max-w-[280px] border border-white/10 shrink-0">
          <button
            onClick={() => {
              setMode('WORK');
              setTimeLeft(settings.workDuration * 60);
              setIsActive(false);
            }}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full transition-all duration-300 text-sm ${
              mode === 'WORK'
                ? 'bg-white text-brand-green-500 shadow-md font-bold'
                : 'text-primary-100 hover:text-white'
            }`}
          >
            <Clock size={16} />
            <span>Trabajo</span>
          </button>
          
          <button
            onClick={() => {
              setMode('BREAK');
              const isLong = (currentCycle + 1) % 4 === 0;
              setTimeLeft(isLong ? settings.longBreakDuration * 60 : settings.shortBreakDuration * 60);
              setIsActive(false);
            }}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full transition-all duration-300 text-sm ${
              mode === 'BREAK'
                ? 'bg-white text-brand-green-500 shadow-md font-bold'
                : 'text-primary-100 hover:text-white'
            }`}
          >
            <span>Descanso</span>
            {isLongBreak ? <Armchair size={16} /> : <Coffee size={16} />}
          </button>
        </div>

        {/* TIMER */}
        <div className="flex-1 flex items-center justify-center">
          <h1 className="text-6xl font-bold text-white tracking-wider drop-shadow-lg">{formatTime(timeLeft)}</h1>
        </div>
        
        {/* BARRA */}
        <div className="w-full h-1.5 bg-white/10 rounded-full mb-6 overflow-hidden border border-white/5 shrink-0">
            <div className="h-full bg-brand-green-400 transition-all duration-1000 ease-linear shadow-[0_0_10px_rgba(52,211,153,0.5)]" style={{width:`${progressPercent}%`}}/>
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
            className="h-12 px-6 rounded-full flex items-center gap-2 shadow-xl hover:scale-105 active:scale-95 transition-all bg-brand-green-500 hover:bg-brand-green-400 text-white font-bold text-base"
          >
            {isActive ? (
              <><Square fill="currentColor" size={16} /><span>Parar</span></>
            ) : (
              <><Play fill="currentColor" size={16} /><span>Iniciar</span></>
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