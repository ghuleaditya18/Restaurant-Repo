import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X, Trash2, RefreshCw } from "lucide-react";

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const toastIdRef = useRef(0);
  const timersRef = useRef(new Map());

  // Remove toast and cancel any active timeout
  const removeToast = useCallback((id) => {
    if (timersRef.current.has(id)) {
      clearTimeout(timersRef.current.get(id));
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Add toast with exactly 3000ms default auto-dismiss
  const addToast = useCallback((type, message, title = null, duration = 3000) => {
    const id = ++toastIdRef.current;
    const newToast = { id, type, message, title };

    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      const timer = setTimeout(() => {
        removeToast(id);
      }, duration);
      timersRef.current.set(id, timer);
    }
    return id;
  }, [removeToast]);

  // Clean up all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  // CRUD Specific Notification Helpers
  // A. Create - Green (#ECFDF5, text #065F46, border #A7F3D0, icon #10B981)
  const showSuccess = useCallback((message, title = "Success") => {
    return addToast("success", message, title, 3000);
  }, [addToast]);

  const showCreate = useCallback((message, title = "Created") => {
    return addToast("success", message, title, 3000);
  }, [addToast]);

  // B. Update - Amber/Orange (#FFF7E8, text #9A3412, border #FCD34D, icon #F59E0B)
  const showUpdate = useCallback((message, title = "Updated") => {
    return addToast("update", message, title, 3000);
  }, [addToast]);

  // C. Delete / Archive / Reversal - Red (#FEF2F2, text #991B1B, border #FECACA, icon #DC2626)
  const showDelete = useCallback((message, title = "Deleted") => {
    return addToast("delete", message, title, 3000);
  }, [addToast]);

  const showArchive = useCallback((message, title = "Archived") => {
    return addToast("delete", message, title, 3000);
  }, [addToast]);

  // D. Error - Red
  const showError = useCallback((message, title = "Error") => {
    return addToast("error", message, title, 3000);
  }, [addToast]);

  // E. Warning & Info
  const showWarning = useCallback((message, title = "Warning") => {
    return addToast("warning", message, title, 3000);
  }, [addToast]);

  const showInfo = useCallback((message, title = "Notice") => {
    return addToast("info", message, title, 3000);
  }, [addToast]);

  // Confirmation modal returning a promise resolving to boolean
  const confirm = useCallback(({
    title = "Confirm Action",
    message = "Are you sure you want to proceed?",
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "danger", // 'danger' | 'warning' | 'primary'
  }) => {
    return new Promise((resolve) => {
      setConfirmDialog({
        title,
        message,
        confirmText,
        cancelText,
        variant,
        onConfirm: () => {
          setConfirmDialog(null);
          resolve(true);
        },
        onCancel: () => {
          setConfirmDialog(null);
          resolve(false);
        },
      });
    });
  }, []);

  // Escape key handler for confirmation dialog
  useEffect(() => {
    if (!confirmDialog) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        confirmDialog.onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmDialog]);

  return (
    <NotificationContext.Provider
      value={{
        showSuccess,
        showCreate,
        showUpdate,
        showDelete,
        showArchive,
        showError,
        showWarning,
        showInfo,
        confirm,
      }}
    >
      {children}

      {/* FLOATING TOAST STACK (Bottom Right, 3000ms Auto-Dismiss) */}
      <div
        className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
        role="region"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((toast) => {
          const styles = {
            // A. Create - Green (#ECFDF5, text #065F46, border #A7F3D0, icon #10B981)
            success: {
              card: "border-[#A7F3D0] dark:border-emerald-800 bg-[#ECFDF5] dark:bg-emerald-950/90 text-[#065F46] dark:text-emerald-100 shadow-md",
              icon: <CheckCircle2 className="h-5 w-5 text-[#10B981] dark:text-emerald-400 shrink-0 mt-0.5" />,
              closeBtn: "text-[#065F46] dark:text-emerald-300 hover:bg-[#D1FAE5] dark:hover:bg-emerald-900/50",
            },
            // B. Update - Amber/Orange (#FFF7E8, text #9A3412, border #FCD34D, icon #F59E0B)
            update: {
              card: "border-[#FCD34D] dark:border-amber-800 bg-[#FFF7E8] dark:bg-amber-950/90 text-[#9A3412] dark:text-amber-100 shadow-md",
              icon: <RefreshCw className="h-5 w-5 text-[#F59E0B] dark:text-amber-400 shrink-0 mt-0.5" />,
              closeBtn: "text-[#9A3412] dark:text-amber-300 hover:bg-[#FEF3C7] dark:hover:bg-amber-900/50",
            },
            // C. Delete - Red (#FEF2F2, text #991B1B, border #FECACA, icon #DC2626)
            delete: {
              card: "border-[#FECACA] dark:border-rose-800 bg-[#FEF2F2] dark:bg-rose-950/90 text-[#991B1B] dark:text-rose-100 shadow-md",
              icon: <Trash2 className="h-5 w-5 text-[#DC2626] dark:text-rose-400 shrink-0 mt-0.5" />,
              closeBtn: "text-[#991B1B] dark:text-rose-300 hover:bg-[#FEE2E2] dark:hover:bg-rose-900/50",
            },
            // D. Error - Red (#FEF2F2, text #991B1B, border #FECACA, icon #DC2626)
            error: {
              card: "border-[#FECACA] dark:border-rose-800 bg-[#FEF2F2] dark:bg-rose-950/90 text-[#991B1B] dark:text-rose-100 shadow-md",
              icon: <AlertCircle className="h-5 w-5 text-[#DC2626] dark:text-rose-400 shrink-0 mt-0.5" />,
              closeBtn: "text-[#991B1B] dark:text-rose-300 hover:bg-[#FEE2E2] dark:hover:bg-rose-900/50",
            },
            warning: {
              card: "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/90 text-amber-900 dark:text-amber-100 shadow-md",
              icon: <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />,
              closeBtn: "text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50",
            },
            info: {
              card: "border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/90 text-sky-900 dark:text-sky-100 shadow-md",
              icon: <Info className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />,
              closeBtn: "text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50",
            },
          }[toast.type] || {
            card: "border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-md",
            icon: <Info className="h-5 w-5 text-stone-600 dark:text-stone-400 shrink-0 mt-0.5" />,
            closeBtn: "text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800",
          };

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-lg transition-all duration-200 ease-in-out animate-in fade-in slide-in-from-bottom-2 ${styles.card}`}
            >
              {styles.icon}
              <div className="flex-1 text-sm">
                {toast.title && <p className="font-semibold">{toast.title}</p>}
                <p className={toast.title ? "text-xs opacity-90 mt-0.5 leading-relaxed" : "leading-relaxed"}>
                  {toast.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className={`p-1 rounded-lg transition-colors ${styles.closeBtn} cursor-pointer`}
                aria-label="Dismiss notification"
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>

      {/* CONFIRMATION MODAL (A4 Standard Locked Dialog) */}
      {confirmDialog && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#101722] p-6 shadow-2xl border border-[#E5E9F0] dark:border-[#1E293B] animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start gap-4">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                  confirmDialog.variant === "danger"
                    ? "bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40"
                    : confirmDialog.variant === "warning"
                    ? "bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40"
                    : "bg-[#FFF7E8] dark:bg-[#30251C] text-[#9A3412] dark:text-[#FFB02E] border border-[#FFEDD5] dark:border-[#9A3412]/40"
                }`}
              >
                {confirmDialog.variant === "danger" ? (
                  <AlertCircle size={22} />
                ) : confirmDialog.variant === "warning" ? (
                  <AlertTriangle size={22} />
                ) : (
                  <Info size={22} />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">{confirmDialog.title}</h3>
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-300 leading-relaxed whitespace-pre-line">
                  {confirmDialog.message}
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                autoFocus
                onClick={confirmDialog.onCancel}
                className="rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-4 py-2 text-sm font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 transition cursor-pointer"
              >
                {confirmDialog.cancelText}
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className={`rounded-lg px-4 py-2 text-sm font-bold transition cursor-pointer shadow-xs ${
                  confirmDialog.variant === "danger"
                    ? "bg-rose-600 hover:bg-rose-700 text-white"
                    : confirmDialog.variant === "warning"
                    ? "bg-amber-600 hover:bg-amber-700 text-white"
                    : "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold hover:brightness-105"
                }`}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within a NotificationProvider");
  }
  return context;
};
