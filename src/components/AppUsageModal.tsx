import { X, LayoutGrid } from 'lucide-react';
import type { AppUsageItem } from '../shared/types';

interface AppUsageModalProps {
  isOpen: boolean;
  onClose: () => void;
  apps: AppUsageItem[];
}

export default function AppUsageModal({ isOpen, onClose, apps }: AppUsageModalProps) {
  if (!isOpen) return null;

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const h = Math.floor(m / 60);
    const minsRemaining = m % 60;
    if (h > 0) return `${h}h ${minsRemaining}m`;
    return `${m}m`;
  };

  return (
    // Overlay fijo que cubre toda la pantalla
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      
      {/* Contenedor del Modal */}
      <div className="glass-card rounded-3xl w-full max-w-md max-h-[80vh] flex flex-col text-white shadow-2xl border border-white/20 animate-in fade-in zoom-in duration-200">
        
        {/* Cabecera Fija */}
        <div className="flex justify-between items-center p-6 border-b border-white/10">
          <h2 className="text-h4 font-bold">Actividad de Aplicaciones</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition">
            <X size={24} />
          </button>
        </div>

        {/* Lista Scrollable */}
        <div className="overflow-y-auto p-4 space-y-2 scrollbar-hide">
          {apps.map((app) => (
            <div key={app.name} className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition group">
              
              {/* Icono */}
              <div className="w-12 h-12 bg-white/10 rounded-xl flex-shrink-0 flex items-center justify-center border border-white/5">
                {app.icon ? (
                  <img src={app.icon} alt={app.name} className="w-8 h-8 object-contain" />
                ) : (
                  <LayoutGrid className="text-white/50 w-6 h-6" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <h3 className="font-bold text-sm truncate pr-2">{app.name}</h3>
                  <span className="text-brand-green-400 font-mono text-sm whitespace-nowrap">
                    {formatTime(app.seconds)}
                  </span>
                </div>
                <p className="text-xs text-white/50 truncate" title={app.title}>
                  {app.title}
                </p>
              </div>
            </div>
          ))}
          
          {apps.length === 0 && (
            <div className="text-center py-10 text-white/50">
              No hay actividad registrada aún.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}