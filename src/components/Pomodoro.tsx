import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, RotateCcw, SkipForward, Coffee, Clock, Square, Armchair } from 'lucide-react';
import type { PomodoroTelemetry, PomodoroSettings } from '../shared/types';

interface PomodoroProps {
  onCycleComplete?: () => void;
  settings: PomodoroSettings; 
  currentCycle: number;       
}

type TimerMode = 'WORK' | 'BREAK';

function Pomodoro({ onCycleComplete, settings, currentCycle }: PomodoroProps) {
  // Inicialización (esto está bien)
  const [timeLeft, setTimeLeft] = useState(settings.workDuration * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<TimerMode>('WORK');
  
  // Lógica de descanso largo
  const isLongBreak = mode === 'WORK' 
    ? (currentCycle + 1) % 4 === 0 
    : currentCycle > 0 && currentCycle % 4 === 0;
  
  // Calcular el tiempo que DEBERÍA tener el temporizador según la configuración actual
  const targetTime = mode === 'WORK' 
    ? settings.workDuration * 60 
    : (isLongBreak ? settings.longBreakDuration * 60 : settings.shortBreakDuration * 60);

  // --- EFECTO CORREGIDO: Sincronización segura ---
  useEffect(() => {
    // Solo actualizamos si NO está activo y si el tiempo es diferente (para evitar loops)
    if (!isActive && timeLeft !== targetTime) {
        // CORRECCIÓN: Usamos setTimeout para evitar "SetState synchronously in effect"
        const timerId = setTimeout(() => {
            setTimeLeft(targetTime);
        }, 0);
        return () => clearTimeout(timerId);
    }
  }, [targetTime, isActive, timeLeft]); 

  // ... (Resto del código de notificaciones y lógica igual que antes) ...
  useEffect(() => { if (Notification.permission !== 'granted') Notification.requestPermission(); }, []);
  const playNotificationSound = () => { try { const AudioContext = window.AudioContext || (window as any).webkitAudioContext; if (AudioContext) { const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.type='sine'; o.frequency.setValueAtTime(500, ctx.currentTime); g.gain.setValueAtTime(0.1, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime+0.5); o.start(); o.stop(ctx.currentTime+0.5); } } catch(e){} };
  
  const notifyUser = (message: string) => {
    playNotificationSound();
    if (Notification.permission === 'granted') new Notification('TrueFocus', { body: message, silent: true });
  };

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
  }, [mode, sendPomodoroUpdate, onCycleComplete, settings, currentCycle]);

  const handleTimerCompleteRef = useRef(handleTimerComplete);
  useEffect(() => { handleTimerCompleteRef.current = handleTimerComplete; }, [handleTimerComplete]);

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

  const toggleTimer = () => { setIsActive(!isActive); sendPomodoroUpdate(!isActive?'RUNNING':'PAUSED', timeLeft); };
  
  const resetTimer = () => { 
    setIsActive(false); 
    setTimeLeft(targetTime); // Usamos la variable calculada
    sendPomodoroUpdate('IDLE', targetTime); 
  };
  
  const skipTimer = () => { 
      const nextMode = mode === 'WORK' ? 'BREAK' : 'WORK';
      setMode(nextMode);
      
      if (nextMode === 'WORK') {
          setTimeLeft(settings.workDuration * 60);
      } else {
          // Lógica de skip manual
          const isLong = (currentCycle + 1) % 4 === 0;
          setTimeLeft(isLong ? settings.longBreakDuration * 60 : settings.shortBreakDuration * 60);
      }
      
      setIsActive(false); 
      sendPomodoroUpdate('IDLE', 0);
  };

  const formatTime = (s:number) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
  const progressPercent = ((targetTime - timeLeft) / targetTime) * 100;

  return (
     <div className="glass-card rounded-3xl flex flex-col items-center justify-between w-full h-full p-5 transition-all duration-300">
        
        {/* TABS */}
        <div className="bg-primary-50/20 backdrop-blur-sm p-1 rounded-full flex items-center justify-between w-full max-w-[280px] border border-white/10 shrink-0">
            <button onClick={()=>{setMode('WORK');setTimeLeft(settings.workDuration*60);setIsActive(false)}} className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full transition-all duration-300 text-sm ${mode==='WORK'?'bg-white text-brand-green-500 shadow-md font-bold':'text-primary-100 hover:text-white'}`}>
                <Clock size={16}/><span>Trabajo</span>
            </button>
            <button onClick={()=>{setMode('BREAK');setTimeLeft(settings.shortBreakDuration*60);setIsActive(false)}} className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full transition-all duration-300 text-sm ${mode==='BREAK'?'bg-white text-brand-green-500 shadow-md font-bold':'text-primary-100 hover:text-white'}`}>
                <span>Descanso</span>
                {isLongBreak ? <Armchair size={16}/> : <Coffee size={16}/>}
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
            <button onClick={resetTimer} className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-primary-600 hover:bg-gray-100 transition shadow-lg hover:scale-105 active:scale-95"><RotateCcw size={20}/></button>
            <button onClick={toggleTimer} className={`h-12 px-6 rounded-full flex items-center gap-2 shadow-xl hover:scale-105 active:scale-95 transition-all ${isActive?'bg-brand-green-500 hover:bg-brand-green-400':'bg-brand-green-500 hover:bg-brand-green-400'} text-white font-bold text-base`}>
                {isActive?<><Square fill="currentColor" size={16}/><span>Parar</span></>:<><Play fill="currentColor" size={16}/><span>Iniciar</span></>}
            </button>
            <button onClick={skipTimer} className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-primary-600 hover:bg-gray-100 transition shadow-lg hover:scale-105 active:scale-95"><SkipForward fill="currentColor" size={20}/></button>
        </div>
     </div>
  );
}
export default Pomodoro;