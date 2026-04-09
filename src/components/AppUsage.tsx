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

  const topApps = apps.slice(0, 4);

  return (
    <>
        <div className="glass-card flex h-full min-h-0 w-full flex-col overflow-hidden rounded-3xl border border-white/10 p-3.5 text-white shadow-xl transition-all duration-500">
          {/* Header con botón de Screen Time */}
          <div className="mb-2.5 flex items-center justify-between gap-2 shrink-0">
            <h3 className="text-sm font-semibold text-white/80">Aplicaciones</h3>
            <button
              onClick={() => setIsScreenTimeOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-2.5 py-1.5 transition-colors hover:bg-white/20"
              title="Ver tiempo en pantalla"
            >
              <Clock size={14} />
              <span className="text-xs font-semibold">Screen Time</span>
            </button>
        </div>

        {/* Indicador de tracking pausado */}
        {!isPresent && (
          <div
            className={`mb-2 flex shrink-0 items-center gap-2 rounded-lg border border-orange-400/50 bg-orange-500/20 p-2 text-[11px] font-semibold text-orange-300 ${showNotification ? "animate-pulse" : ""}`}
          >
            <Pause size={14} className="shrink-0" />
            <span className="truncate">Tracking pausado</span>
          </div>
        )}
        <div className="grid flex-1 min-h-0 grid-cols-4 content-start gap-2.5 overflow-y-auto pr-1">
          {topApps.length > 0 ? (
            topApps.map((app) => (
              <div
                key={app.name}
                className="flex flex-col items-center gap-1.5 text-center group"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/5 bg-white/10 p-2 shadow-sm transition-colors group-hover:bg-white/20">
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
                    className="w-full truncate text-[11px] font-bold"
                    title={app.title}
                  >
                    {app.name}
                  </span>
                  <span className="font-mono text-[10px] font-medium text-brand-green-100/70">
                    {formatTime(app.seconds)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-4 py-4 text-center text-xs text-white/50">
              Esperando actividad...
            </div>
          )}
        </div>

        {apps.length > 4 && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-auto flex w-full shrink-0 items-center justify-center gap-1 border-t border-white/10 pt-2 pb-1 text-[11px] font-bold text-white/60 transition-colors hover:text-white"
          >
            Ver más ({apps.length - 4})
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
