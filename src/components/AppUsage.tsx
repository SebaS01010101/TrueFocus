import { useState } from 'react';
import { LayoutGrid, ChevronRight } from 'lucide-react';
import type { AppUsageItem } from '../shared/types';
import AppUsageModal from './AppUsageModal';

interface AppUsageProps {
  apps: AppUsageItem[]; // Recibe datos desde App
}

export default function AppUsage({ apps }: AppUsageProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const h = Math.floor(m / 60);
    const minsRemaining = m % 60;
    if (h > 0) return `${h}h ${minsRemaining}m`;
    return `${m}m`;
  };

  const topApps = apps.slice(0, 6);

  return (
    <>
      {/* AGREGADO: shrink-0 aquí también por seguridad */}
      <div className="glass-card rounded-3xl p-5 w-full text-white shadow-xl border border-white/10 transition-all duration-500 shrink-0">
        
        <div className="grid grid-cols-3 gap-4 mb-2">
          {topApps.length > 0 ? (
            topApps.map((app) => (
              <div key={app.name} className="flex flex-col items-center gap-2 text-center group">
                <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center border border-white/5 shadow-sm group-hover:bg-white/20 transition-colors p-2.5">
                  {app.icon ? (
                    <img src={app.icon} alt={app.name} className="w-full h-full object-contain drop-shadow-md" />
                  ) : (
                    <LayoutGrid className="text-white/50 w-6 h-6" />
                  )}
                </div>
                <div className="flex flex-col w-full overflow-hidden">
                  <span className="text-sm font-bold truncate w-full" title={app.title}>
                    {app.name}
                  </span>
                  <span className="text-xs text-brand-green-100/70 font-medium font-mono">
                    {formatTime(app.seconds)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-3 text-center py-4 text-white/50 text-sm">
              Esperando actividad...
            </div>
          )}
        </div>

        {apps.length > 6 && (
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full mt-2 py-2 flex items-center justify-center gap-1 text-xs font-bold text-white/60 hover:text-white transition-colors border-t border-white/10"
          >
            Ver más ({apps.length - 6})
            <ChevronRight size={14} />
          </button>
        )}
      </div>
      <AppUsageModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} apps={apps} />
    </>
  );
}