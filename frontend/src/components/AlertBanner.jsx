import { AlertTriangle, AlertCircle, CheckCircle2, Info, X } from "lucide-react";

/**
 * Standardized AlertBanner Component (A5 Standard)
 * Supports semantic variants: warning (amber), info (blue), error (rose), success (emerald)
 */
export default function AlertBanner({
  variant = "warning", // 'warning' | 'info' | 'error' | 'success'
  title = null,
  message,
  onDismiss = null,
  action = null,
  className = "",
}) {
  const configs = {
    warning: {
      card: "border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200",
      icon: <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />,
      closeBtn: "text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60",
    },
    info: {
      card: "border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200",
      icon: <Info size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />,
      closeBtn: "text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60",
    },
    error: {
      card: "border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200",
      icon: <AlertCircle size={18} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />,
      closeBtn: "text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60",
    },
    success: {
      card: "border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200",
      icon: <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />,
      closeBtn: "text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60",
    },
  };

  const current = configs[variant] || configs.warning;

  return (
    <div
      role="alert"
      className={`flex items-start justify-between gap-3 rounded-xl border p-4 text-xs font-medium ${current.card} ${className}`}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {current.icon}
        <div className="min-w-0 flex-1">
          {title && <p className="font-bold text-sm mb-0.5">{title}</p>}
          <p className="leading-relaxed whitespace-pre-line">{message}</p>
          {action && <div className="mt-2.5">{action}</div>}
        </div>
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className={`rounded-lg p-1 transition cursor-pointer shrink-0 ${current.closeBtn}`}
          aria-label="Dismiss alert"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
