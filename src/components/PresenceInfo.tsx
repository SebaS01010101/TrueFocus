import { useState, useEffect } from 'react';
import { MonitorCheck, MonitorX } from 'lucide-react';
import type { PomodoroSettings } from '../shared/types';

interface PresenceInfoProps {
  pomodoroCount: number;
  settings: PomodoroSettings; // Recibimos settings
}

function PresenceInfo({ pomodoroCount, settings }: PresenceInfoProps) {
  const [distance, setDistance] = useState<string>('--');
  const [isPresent, setIsPresent] = useState<boolean>(false);
  const [lastSeen, setLastSeen] = useState<string>('Esperando datos...');

  // --- LÓGICA DINÁMICA ---
  const isLongBreak = (pomodoroCount + 1) % 4 === 0;
  const nextBreakDuration = isLongBreak ? settings.longBreakDuration : settings.shortBreakDuration;

  useEffect(() => {
    const fetchData = async () => {
      if (!window.api?.getIoTData) return;
      const data = await window.api.getIoTData();
      if (data) {
        if (data.distance) setDistance(`${parseFloat(data.distance.value).toFixed(0)} cm`);
        if (data.presence) {
          const present = data.presence.value === 'true' || data.presence.value === '1';
          setIsPresent(present);
          if (present) setLastSeen('Ahora mismo');
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
    <div className="glass-card rounded-3xl p-6 w-full max-w-sm mx-auto text-white shadow-xl border border-white/10 transition-all duration-500">
      <div className="flex items-center justify-between mb-6">
        <h2 className={`text-h4 font-bold tracking-wide transition-colors ${isPresent ? 'text-brand-green-500' : 'text-red-400'}`}>
          {isPresent ? 'Presencia detectada' : 'Ausencia detectada'}
        </h2>
        {isPresent ? (
          <MonitorCheck size={28} className="text-brand-green-500 animate-pulse" />
        ) : (
          <MonitorX size={28} className="text-red-400" />
        )}
      </div>

      <div className="flex flex-col gap-4 text-body font-medium">
        <div className="flex items-center gap-2">
          <span className="opacity-90">Ciclos pomodoro:</span>
          <span className="font-bold text-xl">{pomodoroCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="opacity-90">Última detección:</span>
          <span className="font-bold">{lastSeen}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="opacity-90">Siguiente descanso:</span>
          {/* Aquí usamos el valor dinámico calculado */}
          <span className={`font-bold ${isLongBreak ? 'text-brand-green-400' : 'text-white'}`}>
            de {nextBreakDuration} minutos
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="opacity-90">Distancia:</span>
          <span className="font-bold font-mono text-lg">{distance}</span>
        </div>
      </div>
    </div>
  );
}

export default PresenceInfo;