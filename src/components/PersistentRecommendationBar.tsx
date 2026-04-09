import type { WidgetNoticeSeverity } from "./WidgetNoticeCenter";

interface PersistentRecommendationBarProps {
  activeAlarmSummary: string;
  activeAlarmCount: number;
  recommendation: {
    alarmId: string;
    alarmType: string;
    normalizedType: string;
    title: string;
    message: string;
    severity: WidgetNoticeSeverity;
    startedAt: number | null;
  } | null;
  extraRecommendationCount: number;
}

const formatAlarmLabel = (type: string) => type.replaceAll("_", " ");

const formatStartedAt = (timestamp: number | null) => {
  if (!timestamp) {
    return "--";
  }

  return new Date(timestamp).toLocaleTimeString();
};

const getBarClasses = (severity: WidgetNoticeSeverity) => {
  if (severity === "critical") {
    return "border-red-400/45 bg-red-950/55 text-red-50";
  }

  if (severity === "warning") {
    return "border-yellow-300/35 bg-[#473922]/70 text-yellow-50";
  }

  if (severity === "success") {
    return "border-brand-green-300/35 bg-[#103a31]/70 text-brand-green-50";
  }

  return "border-blue-200/20 bg-slate-900/60 text-slate-50";
};

export default function PersistentRecommendationBar({
  activeAlarmSummary,
  activeAlarmCount,
  recommendation,
  extraRecommendationCount,
}: PersistentRecommendationBarProps) {
  return (
    <div className="glass-card flex h-full min-h-0 w-full items-stretch overflow-hidden rounded-3xl border border-white/10 p-3 text-white shadow-xl">
      {recommendation ? (
        <div
          className={`flex h-full w-full items-center gap-3 rounded-2xl border px-3 py-2.5 ${getBarClasses(
            recommendation.severity,
          )}`}
        >
          <div className="shrink-0 rounded-full border border-white/15 bg-white/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/90">
            {formatAlarmLabel(recommendation.alarmType)}
          </div>

          <div className="min-w-0 flex-1">
            <div
              className="text-[13px] leading-5 text-white/92"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              <span className="font-semibold">{recommendation.title}: </span>
              <span>{recommendation.message}</span>
            </div>
          </div>

          {(extraRecommendationCount > 0 || activeAlarmCount > 1) && (
            <div className="shrink-0 rounded-full border border-white/15 bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-white/90">
              {extraRecommendationCount > 0
                ? `+${extraRecommendationCount} mas`
                : `${activeAlarmCount} activa${activeAlarmCount === 1 ? "" : "s"}`}
            </div>
          )}

          <div className="hidden shrink-0 text-right text-[11px] leading-4 text-white/55 lg:block">
            {formatStartedAt(recommendation.startedAt)}
          </div>
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-between rounded-2xl border border-white/10 bg-black/15 px-3 py-2.5 text-sm text-white/70">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-white/55">
              Recomendaciones
            </div>
            <div className="font-medium">Sin recomendaciones activas</div>
            <div className="mt-1 text-[11px] leading-4 text-white/50">
              {activeAlarmSummary}
            </div>
          </div>
          <div className="text-right text-[11px] text-white/45">
            El widget te avisara cuando aparezca una alerta relevante.
          </div>
        </div>
      )}
    </div>
  );
}
