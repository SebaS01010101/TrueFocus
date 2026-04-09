import { useState, useEffect, useRef } from "react";
import { LayoutGrid, ChevronRight, Pause, Clock } from "lucide-react";
import type { AppUsageItem } from "../shared/types";
import AppUsageModal from "./AppUsageModal";
import ScreenTime from "./ScreenTime";
import { usePresenceStatus } from "../usePresenceStatus";

interface AppUsageProps {
  apps: AppUsageItem[];
}

export default function AppUsage({ apps }: AppUsageProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScreenTimeOpen, setIsScreenTimeOpen] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const { isPresent } = usePresenceStatus(true);
  const notificationTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!window.api?.onPresenceChanged) return;

    const unsubscribe = window.api.onPresenceChanged(() => {
      setShowNotification(true);

      if (notificationTimeoutRef.current !== null) {
        window.clearTimeout(notificationTimeoutRef.current);
      }

      notificationTimeoutRef.current = window.setTimeout(() => {
        setShowNotification(false);
        notificationTimeoutRef.current = null;
      }, 3000);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current !== null) {
        window.clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, []);

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
      <div className="glass-card rounded-3xl p-4 w-full h-full text-white shadow-xl border border-white/10 transition-all duration-500 flex flex-col overflow-hidden">
        {/* Header con botón de Screen Time */}
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h3 className="text-sm font-semibold text-white/80">Aplicaciones</h3>
          <button
            onClick={() => setIsScreenTimeOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors border border-white/10"
            title="Ver tiempo en pantalla"
          >
            <Clock size={14} />
            <span className="text-xs font-semibold">Screen Time</span>
          </button>
        </div>

        {/* Indicador de tracking pausado */}
        {!isPresent && (
          <div
            className={`mb-2 bg-orange-500/20 border border-orange-400/50 rounded-lg p-2 flex items-center gap-2 text-orange-300 text-[11px] font-semibold shrink-0 ${showNotification ? "animate-pulse" : ""}`}
          >
            <Pause size={14} className="shrink-0" />
            <span className="truncate">Tracking pausado</span>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3 flex-1 content-start overflow-y-auto pr-1">
          {topApps.length > 0 ? (
            topApps.map((app) => (
              <div
                key={app.name}
                className="flex flex-col items-center gap-1.5 text-center group"
              >
                <div className="w-11 h-11 bg-white/10 rounded-xl flex items-center justify-center border border-white/5 shadow-sm group-hover:bg-white/20 transition-colors p-2">
                  {app.icon ? (
                    <img
                      src={app.icon}
                      alt={app.name}
                      className="w-full h-full object-contain drop-shadow-md"
                    />
                  ) : (
                    <LayoutGrid className="text-white/50 w-5 h-5" />
                  )}
                </div>
                <div className="flex flex-col w-full overflow-hidden">
                  <span
                    className="text-xs font-bold truncate w-full"
                    title={app.title}
                  >
                    {app.name}
                  </span>
                  <span className="text-[10px] text-brand-green-100/70 font-medium font-mono">
                    {formatTime(app.seconds)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-3 text-center py-4 text-white/50 text-xs">
              Esperando actividad...
            </div>
          )}
        </div>

        {apps.length > 6 && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full mt-auto pt-2 pb-1 flex items-center justify-center gap-1 text-[11px] font-bold text-white/60 hover:text-white transition-colors border-t border-white/10 shrink-0"
          >
            Ver más ({apps.length - 6})
            <ChevronRight size={12} />
          </button>
        )}
      </div>
      <AppUsageModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        apps={apps}
      />
      {isScreenTimeOpen && (
        <ScreenTime onClose={() => setIsScreenTimeOpen(false)} />
      )}
    </>
  );
}
