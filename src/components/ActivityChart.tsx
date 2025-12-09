import { useMemo } from 'react';
import type { AppUsageItem } from '../shared/types';
import { calculateCategoryStats } from '../utils/categorizer';

interface ActivityChartProps {
  apps: AppUsageItem[];
}

export default function ActivityChart({ apps }: ActivityChartProps) {
  
  // 1. Calcular estadísticas
  const stats = useMemo(() => calculateCategoryStats(apps), [apps]);

  const totalSeconds = useMemo(() => {
    return Object.values(stats).reduce((a, b) => a + b, 0);
  }, [stats]);

  // Formateador para las etiquetas de los ejes (ej: "60m" o "2h")
  const formatAxisTime = (seconds: number) => {
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  // Formateador general
  const formatTime = (totalSecs: number) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  // 2. ESCALA INTELIGENTE
  const maxValue = useMemo(() => {
    const maxCategory = Math.max(
      stats.Productivity, 
      stats.Social, 
      stats.Entertainment + stats.Other
    );
    // La escala será la mayor categoría, PERO nunca menos de 60 minutos (3600s)
    // Esto evita que 1 minuto de uso se vea como una barra gigante.
    return Math.max(maxCategory, 3600);
  }, [stats]);

  // 3. Configuración de Barras
  const bars = useMemo(() => {
    return [
      { 
        label: 'Productivity', 
        displayLabel: 'Productividad',
        value: stats.Productivity, 
        // Altura relativa a la escala dinámica
        height: (stats.Productivity / maxValue) * 100,
        color: 'bg-blue-500', 
        textColor: 'text-blue-400'
      },
      { 
        label: 'Social', 
        displayLabel: 'Social',
        value: stats.Social, 
        height: (stats.Social / maxValue) * 100,
        color: 'bg-teal-400', 
        textColor: 'text-teal-400'
      },
      { 
        label: 'Entertainment', 
        displayLabel: 'Entretenim.',
        value: stats.Entertainment + stats.Other, 
        height: ((stats.Entertainment + stats.Other) / maxValue) * 100,
        color: 'bg-orange-400', 
        textColor: 'text-orange-400'
      }
    ];
  }, [stats, maxValue]);

  return (
    <div className="glass-card rounded-3xl p-6 w-full text-white shadow-xl border border-white/10 transition-all duration-500 relative overflow-hidden shrink-0">
      
      {/* HEADER: Tiempo Total */}
      <div className="mb-8">
        <h2 className="text-4xl font-bold tracking-tight text-white drop-shadow-md">
          {formatTime(totalSeconds)}
        </h2>
        <span className="text-xs text-white/50 font-bold uppercase tracking-wider">Tiempo Total Hoy</span>
      </div>

      {/* ÁREA DEL GRÁFICO */}
      <div className="relative h-32 w-full mb-6 pr-8"> {/* Padding derecho para las etiquetas */}
        
        {/* Ejes y Etiquetas Dinámicas (Fondo) */}
        <div className="absolute inset-0 flex flex-col justify-between text-xs text-white/40 font-mono pointer-events-none z-0">
          
          {/* Línea Superior (Tope dinámico) */}
          <div className="w-full border-b border-white/10 h-0 flex items-center justify-end relative">
            <span className="absolute right-[-35px] -mt-2">{formatAxisTime(maxValue)}</span>
          </div>
          
          {/* Línea Media (Mitad dinámica) */}
          <div className="w-full border-b border-white/10 h-0 flex items-center justify-end relative">
            <span className="absolute right-[-35px] -mt-2">{formatAxisTime(maxValue / 2)}</span>
          </div>
          
          {/* Línea Base (0m) */}
          <div className="w-full border-b border-white/10 h-0 flex items-center justify-end relative">
            <span className="absolute right-[-35px] -mt-2">0m</span>
          </div>
        </div>

        {/* Las Barras */}
        <div className="absolute inset-0 flex items-end justify-around px-2 z-10 pb-[1px]">
          {bars.map((bar) => (
            <div key={bar.label} className="group relative flex flex-col justify-end h-full w-12 items-center">
              
              {/* Tooltip Hover (Flotante) */}
              <div className="absolute -top-8 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 px-2 py-1 rounded text-xs whitespace-nowrap pointer-events-none z-20 border border-white/10">
                {formatTime(bar.value)}
              </div>

              {/* Barra Visual */}
              <div 
                className={`w-full rounded-t-md transition-all duration-1000 ease-out ${bar.color} opacity-90 hover:opacity-100 shadow-[0_0_15px_rgba(255,255,255,0.15)]`}
                style={{ height: `${Math.max(bar.height, 2)}%` }} // Mínimo 2% para que siempre se vea la base
              />
            </div>
          ))}
        </div>
      </div>

      {/* LEYENDA (Pie del gráfico) */}
      <div className="grid grid-cols-3 gap-1 pt-2 border-t border-white/10">
        {bars.map((bar) => (
          <div key={bar.label} className="flex flex-col items-center">
            <span className={`text-[10px] font-bold uppercase tracking-wide ${bar.textColor} mb-0.5`}>
              {bar.displayLabel}
            </span>
            <span className="text-sm font-bold text-white/90">
              {formatTime(bar.value)}
            </span>
          </div>
        ))}
      </div>

    </div>
  );
}