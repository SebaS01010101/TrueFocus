import { useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  BarChart3,
  Clock,
} from "lucide-react";
import type { AppUsageByDate, WeeklySummary } from "../renderer";
import {
  addDaysToDateKey,
  getDateKey,
  getWeekStartDateKey,
  parseDateKey,
} from "../utils/localDate";

type ViewMode = "daily" | "weekly";

interface ScreenTimeProps {
  onClose: () => void;
}

function ScreenTime({ onClose }: ScreenTimeProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [selectedDate, setSelectedDate] = useState<string>(() => getDateKey());
  const [dailyStats, setDailyStats] = useState<AppUsageByDate>({});
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(
    null,
  );

  // Cargar estadísticas diarias
  useEffect(() => {
    if (viewMode !== "daily" || !window.api?.getStatsByDate) {
      return;
    }

    let isCancelled = false;

    const loadDailyStats = async () => {
      try {
        const stats = await window.api.getStatsByDate(selectedDate);

        if (!isCancelled) {
          setDailyStats(stats);
        }
      } catch {
        if (!isCancelled) {
          setDailyStats({});
        }
      }
    };

    void loadDailyStats();

    return () => {
      isCancelled = true;
    };
  }, [viewMode, selectedDate]);

  // Cargar resumen semanal
  useEffect(() => {
    if (viewMode !== "weekly" || !window.api?.getWeeklySummary) {
      return;
    }

    let isCancelled = false;

    const loadWeeklySummary = async () => {
      try {
        const summary = await window.api.getWeeklySummary(
          getWeekStartDateKey(selectedDate),
        );

        if (!isCancelled) {
          setWeeklySummary(summary);
        }
      } catch {
        if (!isCancelled) {
          setWeeklySummary(null);
        }
      }
    };

    void loadWeeklySummary();

    return () => {
      isCancelled = true;
    };
  }, [viewMode, selectedDate]);

  // Navegar a día anterior
  function goToPreviousDay() {
    setSelectedDate(addDaysToDateKey(selectedDate, -1));
  }

  // Navegar a día siguiente
  function goToNextDay() {
    const nextDate = addDaysToDateKey(selectedDate, 1);
    if (nextDate <= getDateKey()) {
      setSelectedDate(nextDate);
    }
  }

  // Navegar a semana anterior
  function goToPreviousWeek() {
    setSelectedDate(addDaysToDateKey(selectedDate, -7));
  }

  // Navegar a semana siguiente
  function goToNextWeek() {
    const nextDate = addDaysToDateKey(selectedDate, 7);
    if (nextDate <= getDateKey()) {
      setSelectedDate(nextDate);
    }
  }

  // Formatear duración
  function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  // Formatear fecha
  function formatDate(dateStr: string): string {
    const date = parseDateKey(dateStr);
    const todayKey = getDateKey();
    const yesterdayKey = addDaysToDateKey(todayKey, -1);

    if (dateStr === todayKey) return "Hoy";
    if (dateStr === yesterdayKey) return "Ayer";

    return date.toLocaleDateString("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }

  // Formatear rango de semana
  function formatWeekRange(weekStart: string): string {
    const start = parseDateKey(weekStart);
    const end = parseDateKey(addDaysToDateKey(weekStart, 6));

    return `${start.getDate()} ${start.toLocaleDateString("es-ES", { month: "short" })} - ${end.getDate()} ${end.toLocaleDateString("es-ES", { month: "short" })}`;
  }

  // Calcular total de tiempo diario
  const dailyTotal = Object.values(dailyStats).reduce(
    (sum, app) => sum + app.seconds,
    0,
  );

  // Ordenar aplicaciones por tiempo
  const sortedDailyApps = Object.values(dailyStats).sort(
    (a, b) => b.seconds - a.seconds,
  );

  // Ordenar aplicaciones semanales
  const sortedWeeklyApps = weeklySummary
    ? Object.values(weeklySummary.topApps).sort((a, b) => b.seconds - a.seconds)
    : [];

  // Calcular promedio diario de la semana
  const weeklyAverage = weeklySummary
    ? Math.floor(weeklySummary.totalSeconds / 7)
    : 0;

  // Verificar si puede ir al siguiente
  const canGoNext =
    (viewMode === "daily"
      ? addDaysToDateKey(selectedDate, 1)
      : addDaysToDateKey(selectedDate, 7)) <= getDateKey();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-linear-to-r from-primary-500 to-primary-600 text-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Clock size={28} />
              <h2 className="text-2xl font-bold">Tiempo en Pantalla</h2>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition"
            >
              <span className="text-2xl">×</span>
            </button>
          </div>

          {/* Selector de vista */}
          <div className="flex gap-2 bg-white/20 rounded-full p-1">
            <button
              onClick={() => setViewMode("daily")}
              className={`flex-1 py-2 px-4 rounded-full font-medium transition ${
                viewMode === "daily"
                  ? "bg-white text-primary-600"
                  : "text-white/80 hover:text-white"
              }`}
            >
              <Calendar className="inline mr-2" size={16} />
              Diario
            </button>
            <button
              onClick={() => setViewMode("weekly")}
              className={`flex-1 py-2 px-4 rounded-full font-medium transition ${
                viewMode === "weekly"
                  ? "bg-white text-primary-600"
                  : "text-white/80 hover:text-white"
              }`}
            >
              <BarChart3 className="inline mr-2" size={16} />
              Semanal
            </button>
          </div>
        </div>

        {/* Navegación de fecha */}
        <div className="flex items-center justify-between p-4 border-b">
          <button
            onClick={viewMode === "daily" ? goToPreviousDay : goToPreviousWeek}
            className="p-2 hover:bg-gray-100 rounded-full transition"
          >
            <ChevronLeft size={24} />
          </button>

          <div className="text-center">
              <h3 className="text-lg font-semibold">
                {viewMode === "daily"
                  ? formatDate(selectedDate)
                  : formatWeekRange(getWeekStartDateKey(selectedDate))}
              </h3>
            {viewMode === "daily" && (
              <p className="text-sm text-gray-500">{selectedDate}</p>
            )}
          </div>

          <button
            onClick={viewMode === "daily" ? goToNextDay : goToNextWeek}
            disabled={!canGoNext}
            className={`p-2 rounded-full transition ${
              canGoNext ? "hover:bg-gray-100" : "opacity-30 cursor-not-allowed"
            }`}
          >
            <ChevronRight size={24} />
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-6">
          {viewMode === "daily" ? (
            <>
              {/* Resumen diario */}
              <div className="bg-linear-to-br from-primary-50 to-primary-100 rounded-2xl p-6 mb-6">
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-1">Tiempo total</p>
                  <p className="text-4xl font-bold text-primary-600">
                    {formatDuration(dailyTotal)}
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    {sortedDailyApps.length} aplicaciones
                  </p>
                </div>
              </div>

              {/* Lista de aplicaciones */}
              {sortedDailyApps.length > 0 ? (
                <div className="space-y-3">
                  {sortedDailyApps.map((app, index) => (
                    <div
                      key={app.name}
                      className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition"
                    >
                      {/* Icono */}
                      {app.icon ? (
                        <img
                          src={app.icon}
                          alt={app.name}
                          className="w-12 h-12 rounded-xl"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-300 rounded-xl flex items-center justify-center text-gray-600 font-bold">
                          {app.name.charAt(0)}
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 truncate">
                          {app.name}
                        </h4>
                        <p className="text-sm text-gray-500 truncate">
                          {app.title}
                        </p>
                      </div>

                      {/* Tiempo */}
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">
                          {formatDuration(app.seconds)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {dailyTotal > 0
                            ? `${Math.round((app.seconds / dailyTotal) * 100)}%`
                            : "0%"}
                        </p>
                      </div>

                      {/* Badge de posición */}
                      {index < 3 && (
                        <div className="shrink-0">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                              index === 0
                                ? "bg-yellow-100 text-yellow-700"
                                : index === 1
                                  ? "bg-gray-200 text-gray-700"
                                  : "bg-orange-100 text-orange-700"
                            }`}
                          >
                            {index + 1}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">No hay datos para este día</p>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Resumen semanal */}
              {weeklySummary && (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-linear-to-br from-primary-50 to-primary-100 rounded-2xl p-6">
                      <p className="text-sm text-gray-600 mb-1">Total</p>
                      <p className="text-3xl font-bold text-primary-600">
                        {formatDuration(weeklySummary.totalSeconds)}
                      </p>
                    </div>
                    <div className="bg-linear-to-br from-brand-green-50 to-brand-green-100 rounded-2xl p-6">
                      <p className="text-sm text-gray-600 mb-1">
                        Promedio diario
                      </p>
                      <p className="text-3xl font-bold text-brand-green-600">
                        {formatDuration(weeklyAverage)}
                      </p>
                    </div>
                  </div>

                  {/* Gráfico de barras por día */}
                  <div className="bg-gray-50 rounded-2xl p-6 mb-6">
                    <h4 className="font-semibold text-gray-900 mb-4">
                      Tiempo por día
                    </h4>
                    <div className="flex items-end justify-between gap-2 h-40">
                      {weeklySummary.dates.map((date) => {
                        const dayTotal = weeklySummary.dailyTotals[date] || 0;
                        const maxTotal = Math.max(
                          ...Object.values(weeklySummary.dailyTotals),
                        );
                        const heightPercent =
                          maxTotal > 0 ? (dayTotal / maxTotal) * 100 : 0;
                        const dayName = parseDateKey(date).toLocaleDateString(
                          "es-ES",
                          { weekday: "short" },
                        );

                        return (
                          <div
                            key={date}
                            className="flex-1 flex flex-col items-center"
                          >
                            <div className="relative w-full mb-2">
                              <div
                                className="bg-linear-to-t from-primary-500 to-primary-400 rounded-t-lg transition-all duration-300 hover:from-primary-600 hover:to-primary-500"
                                style={{ height: `${heightPercent}%` }}
                              >
                                {dayTotal > 0 && (
                                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-semibold text-gray-600 whitespace-nowrap">
                                    {formatDuration(dayTotal)}
                                  </div>
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-gray-600 font-medium capitalize">
                              {dayName}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Top aplicaciones de la semana */}
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-4">
                      Top aplicaciones
                    </h4>
                    {sortedWeeklyApps.length > 0 ? (
                      <div className="space-y-3">
                        {sortedWeeklyApps.slice(0, 10).map((app, index) => (
                          <div
                            key={app.name}
                            className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition"
                          >
                            {/* Icono */}
                            {app.icon ? (
                              <img
                                src={app.icon}
                                alt={app.name}
                                className="w-12 h-12 rounded-xl"
                              />
                            ) : (
                              <div className="w-12 h-12 bg-gray-300 rounded-xl flex items-center justify-center text-gray-600 font-bold">
                                {app.name.charAt(0)}
                              </div>
                            )}

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-gray-900 truncate">
                                {app.name}
                              </h4>
                              <p className="text-sm text-gray-500">
                                {formatDuration(app.seconds)} esta semana
                              </p>
                            </div>

                            {/* Porcentaje */}
                            <div className="text-right">
                              <p className="font-semibold text-gray-900">
                                {weeklySummary.totalSeconds > 0
                                  ? `${Math.round((app.seconds / weeklySummary.totalSeconds) * 100)}%`
                                  : "0%"}
                              </p>
                            </div>

                            {/* Badge de posición */}
                            {index < 3 && (
                              <div className="shrink-0">
                                <div
                                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                                    index === 0
                                      ? "bg-yellow-100 text-yellow-700"
                                      : index === 1
                                        ? "bg-gray-200 text-gray-700"
                                        : "bg-orange-100 text-orange-700"
                                  }`}
                                >
                                  {index + 1}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <BarChart3
                          size={48}
                          className="mx-auto text-gray-300 mb-4"
                        />
                        <p className="text-gray-500">
                          No hay datos para esta semana
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ScreenTime;
