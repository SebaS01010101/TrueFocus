import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import type { AppUsageItem } from "../shared/types";
import {
  calculateCategoryStats,
  CATEGORY_INFO,
  type CategoryType,
} from "../utils/categorizer";

type ViewMode = "daily" | "weekly";

export default function ScreenTimeWidget() {
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [selectedDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [weeklyData, setWeeklyData] = useState<
    Record<string, Record<CategoryType, number>>
  >({});
  const [dailyData, setDailyData] = useState<
    Record<number, Record<CategoryType, number>>
  >({});
  // Obtener el lunes de la semana
  const getWeekStart = (dateStr: string): string => {
    const date = new Date(dateStr);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    return monday.toISOString().split("T")[0];
  };

  // Cargar datos semanales
  useEffect(() => {
    if (viewMode === "weekly" && window.api?.getWeeklySummary) {
      const weekStart = getWeekStart(selectedDate);
      window.api.getWeeklySummary(weekStart).then((summary) => {
        const weekData: Record<string, Record<CategoryType, number>> = {};

        // Procesar cada día de la semana
        for (const date of summary.dates) {
          // Obtener estadísticas del día
          if (window.api?.getStatsByDate) {
            window.api.getStatsByDate(date).then((stats) => {
              const dayApps: AppUsageItem[] = Object.values(stats);
              weekData[date] = calculateCategoryStats(dayApps);
            });
          }
        }

        setWeeklyData(weekData);
      });
    }
  }, [viewMode, selectedDate]);

  // Cargar datos diarios reales (por hora)
  useEffect(() => {
    if (viewMode === "daily" && window.api?.getStatsByDateHourly) {
      window.api.getStatsByDateHourly(selectedDate).then((hourlyStats) => {
        const hourlyData: Record<number, Record<CategoryType, number>> = {};

        // Inicializar todas las horas
        for (let hour = 0; hour < 24; hour++) {
          hourlyData[hour] = {
            Entertainment: 0,
            Productivity: 0,
            Browsing: 0,
            Social: 0,
            Creativity: 0,
            Reading: 0,
            Other: 0,
          };
        }

        // Procesar datos reales por hora
        for (const hourStr in hourlyStats) {
          const hour = parseInt(hourStr);
          const hourApps: AppUsageItem[] = Object.values(hourlyStats[hourStr]);
          hourlyData[hour] = calculateCategoryStats(hourApps);
        }

        setDailyData(hourlyData);
      });
    }
  }, [viewMode, selectedDate]);

  // Formatear duración
  function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  // Calcular total
  const totalSeconds =
    viewMode === "weekly"
      ? Object.values(weeklyData).reduce((sum, day) => {
          return (
            sum +
            Object.values(day).reduce((daySum, seconds) => daySum + seconds, 0)
          );
        }, 0)
      : Object.values(dailyData).reduce((sum, hour) => {
          return (
            sum +
            Object.values(hour).reduce(
              (hourSum, seconds) => hourSum + seconds,
              0,
            )
          );
        }, 0);

  // Calcular máximo para escalar las barras
  const maxValue =
    viewMode === "weekly"
      ? Math.max(
          ...Object.values(weeklyData).map((day) =>
            Object.values(day).reduce((sum, seconds) => sum + seconds, 0),
          ),
          1,
        )
      : Math.max(
          ...Object.values(dailyData).map((hour) =>
            Object.values(hour).reduce((sum, seconds) => sum + seconds, 0),
          ),
          1,
        );

  // Obtener días de la semana
  const weekStart = getWeekStart(selectedDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    return date.toISOString().split("T")[0];
  });

  // Renderizar barra apilada
  function renderStackedBar(data: Record<CategoryType, number>, label: string) {
    const total = Object.values(data).reduce((sum, val) => sum + val, 0);
    const heightPercent = (total / maxValue) * 100;

    return (
      <div className="flex flex-col items-center flex-1">
        <div className="relative w-full h-32 mb-1">
          <div
            className="absolute bottom-0 w-full flex flex-col rounded-t-md overflow-hidden transition-all duration-300"
            style={{ height: `${heightPercent}%` }}
          >
            {(Object.keys(CATEGORY_INFO) as CategoryType[]).map((category) => {
              const categorySeconds = data[category] || 0;
              if (categorySeconds === 0) return null;

              const categoryPercent = (categorySeconds / total) * 100;

              return (
                <div
                  key={category}
                  className="hover:opacity-80 transition-opacity"
                  style={{
                    height: `${categoryPercent}%`,
                    backgroundColor: CATEGORY_INFO[category].color,
                  }}
                  title={`${CATEGORY_INFO[category].name}: ${formatDuration(categorySeconds)}`}
                />
              );
            })}
          </div>
        </div>
        <p className="text-[10px] text-white/60 font-medium h-3">
          {label || "\u00A0"}
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-3xl p-4 w-full h-full text-white shadow-xl border border-white/10 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-white/80" />
          <h3 className="text-sm font-semibold text-white/80">Screen Time</h3>
        </div>
        <div className="text-right">
          <p className="text-xs text-white/60">
            {viewMode === "weekly" ? "Esta semana" : "Hoy"}
          </p>
          <p className="text-sm font-bold">{formatDuration(totalSeconds)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-3 bg-white/10 rounded-lg p-1">
        <button
          onClick={() => setViewMode("daily")}
          className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${
            viewMode === "daily"
              ? "bg-white/20 text-white"
              : "text-white/60 hover:text-white/80"
          }`}
        >
          Diario
        </button>
        <button
          onClick={() => setViewMode("weekly")}
          className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${
            viewMode === "weekly"
              ? "bg-white/20 text-white"
              : "text-white/60 hover:text-white/80"
          }`}
        >
          Semanal
        </button>
      </div>

      {/* Gráfico */}
      <div className="flex-1 flex items-end justify-between gap-1 mb-3">
        {viewMode === "weekly"
          ? weekDays.map((date) => {
              const dayName = new Date(date)
                .toLocaleDateString("es-ES", { weekday: "short" })
                .charAt(0)
                .toUpperCase();
              const dayData = weeklyData[date] || {
                Entertainment: 0,
                Productivity: 0,
                Browsing: 0,
                Social: 0,
                Creativity: 0,
                Reading: 0,
                Other: 0,
              };

              return (
                <div key={date} className="flex-1">
                  {renderStackedBar(dayData, dayName)}
                </div>
              );
            })
          : Array.from({ length: 24 }, (_, hour) => {
              const hourData = dailyData[hour] || {
                Entertainment: 0,
                Productivity: 0,
                Browsing: 0,
                Social: 0,
                Creativity: 0,
                Reading: 0,
                Other: 0,
              };

              // Solo mostrar cada 4 horas para no saturar
              const label = hour % 4 === 0 ? `${hour}` : "";

              return (
                <div key={hour} className="flex-1">
                  {renderStackedBar(hourData, label)}
                </div>
              );
            })}
      </div>

      {/* Leyenda de categorías */}
      <div className="grid grid-cols-4 gap-1 text-[9px]">
        {(Object.keys(CATEGORY_INFO) as CategoryType[])
          .filter((cat) => {
            // Solo mostrar categorías con datos
            const hasData =
              viewMode === "weekly"
                ? Object.values(weeklyData).some((day) => day[cat] > 0)
                : Object.values(dailyData).some((hour) => hour[cat] > 0);
            return hasData;
          })
          .slice(0, 4)
          .map((category) => (
            <div key={category} className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-sm"
                style={{ backgroundColor: CATEGORY_INFO[category].color }}
              />
              <span className="text-white/70 truncate">
                {CATEGORY_INFO[category].icon}{" "}
                {CATEGORY_INFO[category].name.slice(0, 6)}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
