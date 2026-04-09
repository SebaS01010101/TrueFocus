import { Bell, TriangleAlert, Info, CheckCircle2, X } from "lucide-react";

export type WidgetNoticeSeverity = "info" | "success" | "warning" | "critical";
export type WidgetNoticeSource = "Pomodoro" | "Alarma";

export interface WidgetNoticeDraft {
  title: string;
  message: string;
  severity: WidgetNoticeSeverity;
  source: WidgetNoticeSource;
  system?: boolean;
  ttlMs?: number;
  dedupeKey?: string;
}

export interface WidgetNotice extends WidgetNoticeDraft {
  id: string;
  createdAt: number;
}

interface WidgetNoticeCenterProps {
  notices: WidgetNotice[];
  onDismiss: (id: string) => void;
}

const getNoticeIcon = (severity: WidgetNoticeSeverity) => {
  if (severity === "critical") {
    return <TriangleAlert size={18} className="text-red-200" />;
  }

  if (severity === "warning") {
    return <Bell size={18} className="text-yellow-100" />;
  }

  if (severity === "success") {
    return <CheckCircle2 size={18} className="text-brand-green-100" />;
  }

  return <Info size={18} className="text-blue-100" />;
};

const getNoticeClasses = (severity: WidgetNoticeSeverity) => {
  if (severity === "critical") {
    return "border-red-400/50 bg-red-950/65 text-red-50 shadow-[0_18px_45px_rgba(127,29,29,0.35)]";
  }

  if (severity === "warning") {
    return "border-yellow-300/35 bg-[#473922]/80 text-yellow-50 shadow-[0_16px_38px_rgba(120,87,19,0.28)]";
  }

  if (severity === "success") {
    return "border-brand-green-300/35 bg-[#103a31]/80 text-brand-green-50 shadow-[0_16px_38px_rgba(0,84,63,0.28)]";
  }

  return "border-blue-200/20 bg-slate-900/65 text-slate-50 shadow-[0_16px_38px_rgba(15,23,42,0.28)]";
};

export default function WidgetNoticeCenter({
  notices,
  onDismiss,
}: WidgetNoticeCenterProps) {
  if (notices.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute left-4 right-24 top-4 z-40 flex justify-center sm:left-6 sm:right-32 sm:top-5">
      <div className="flex w-full max-w-lg flex-col gap-2.5">
        {notices.map((notice) => (
          <div
            key={notice.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 backdrop-blur-xl ${getNoticeClasses(notice.severity)}`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">{getNoticeIcon(notice.severity)}</div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-white/55">
                  <span>{notice.source}</span>
                  <span className="h-1 w-1 rounded-full bg-white/35" />
                  <span>{notice.title}</span>
                </div>
                <p className="text-sm font-medium leading-5 text-white/92">
                  {notice.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDismiss(notice.id)}
                className="rounded-full p-1 text-white/55 transition hover:bg-white/10 hover:text-white"
                aria-label="Cerrar aviso"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
