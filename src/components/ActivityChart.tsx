import { useMemo } from 'react';
import type { AppUsageItem } from '../shared/types';
import { calculateCategoryStats } from '../utils/categorizer';

interface ActivityChartProps {
  apps: AppUsageItem[];
}

export default function ActivityChart({ apps }: ActivityChartProps) {
  
  // 1. Cálculos optimizados
  const stats = useMemo(() => calculateCategoryStats(apps), [apps]);

  const totalSeconds = useMemo(() => {
    return Object.values(stats).reduce((a, b) => a + b, 0);
  }, [stats]);

  const formatTime = (totalSecs: number) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatAxisTime = (seconds: number) => {
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  // 2. Escala Inteligente (Mínimo 1 hora, crece si te pasas)
  const maxValue = useMemo(() => {
    const maxCategory = Math.max(stats.Productivity, stats.Social, stats.Entertainment + stats.Other);
    return Math.max(maxCategory, 3600);
  }, [stats]);

  const bars = useMemo(() => {
    return [
      { 
        label: 'Productividad', value: stats.Productivity, 
        height: (stats.Productivity / maxValue) * 100, 
        color: 'bg-blue-500', textColor: 'text-blue-400' 
      },
      { 
        label: 'Social', value: stats.Social, 
        height: (stats.Social / maxValue) * 100, 
        color: 'bg-teal-400', textColor: 'text-teal-400' 
      },
      { 
        label: 'Entretenimiento', value: stats.Entertainment + stats.Other, 
        height: ((stats.Entertainment + stats.Other) / maxValue) * 100, 
        color: 'bg-orange-400', textColor: 'text-orange-400' 
      }
    ];
  }, [stats, maxValue]);

  return (
    <div className="glass-card rounded-3xl p-5 w-full h-full text-white shadow-xl border border-white/10 transition-all duration-500 relative overflow-hidden flex flex-col">
      
      {/* Header */}
      <div className="mb-3 shrink-0">
        <h2 className="text-3xl font-bold tracking-tight">{formatTime(totalSeconds)}</h2>
        <span className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Tiempo Total Hoy</span>
      </div>

      {/* Gráfico */}
      <div className="relative flex-1 w-full min-h-0 mb-2 pr-10">
        {/* Ejes Fondo */}
        <div className="absolute inset-0 flex flex-col justify-between text-[10px] text-white/40 font-mono pointer-events-none z-0">
          <div className="w-full border-b border-white/10 h-0 flex justify-end relative"><span className="absolute right-[-38px] -mt-2">{formatAxisTime(maxValue)}</span></div>
          <div className="w-full border-b border-white/10 h-0 flex justify-end relative"><span className="absolute right-[-38px] -mt-2">{formatAxisTime(maxValue / 2)}</span></div>
          <div className="w-full border-b border-white/10 h-0 flex justify-end relative"><span className="absolute right-[-38px] -mt-2">0m</span></div>
        </div>

        {/* Barras */}
        <div className="absolute inset-0 flex items-end justify-around px-4 z-10 pb-[1px]">
          {bars.map((bar) => (
            <div key={bar.label} className="group relative flex flex-col justify-end h-full w-12 items-center">
              <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 px-2 py-1 rounded text-[10px] whitespace-nowrap z-20">
                {formatTime(bar.value)}
              </div>
              <div 
                className={`w-full rounded-t-md transition-all duration-1000 ease-out ${bar.color} opacity-90 hover:opacity-100 shadow-[0_0_15px_rgba(255,255,255,0.15)]`}
                style={{ height: `${Math.max(bar.height, 2)}%` }} 
              />
            </div>
          ))}
        </div>
      </div>

      {/* Footer / Leyenda */}
      <div className="grid grid-cols-3 gap-1 pt-2 border-t border-white/10 shrink-0">
        {bars.map((bar) => (
          <div key={bar.label} className="flex flex-col items-center">
            <span className={`text-[9px] font-bold uppercase tracking-wide ${bar.textColor} mb-0.5`}>{bar.label}</span>
            <span className="text-xs font-bold text-white/90">{formatTime(bar.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}