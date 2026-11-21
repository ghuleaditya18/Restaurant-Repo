import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const toastIdRef = useRef(0);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((type, message, title = null, duration = 4000) => {
    const id = ++toastIdRef.current;
    const newToast = { id, type, message, title };

    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
    return id;
  }, [removeToast]);

  const showSuccess = useCallback((message, title = "Success") => {
    return addToast("success", message, title);
  }, [addToast]);

  const showError = useCallback((message, title = "Error") => {
    return addToast("error", message, title);
  }, [addToast]);

  const showWarning = useCallback((message, title = "Warning") => {
    return addToast("warning", message, title);
  }, [addToast]);

  const showInfo = useCallback((message, title = "Notice") => {
    return addToast("info", message, title);
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
        showError,
        showWarning,
        showInfo,
        confirm,
      }}
    >
      {children}

      {/* FLOATING TOAST STACK */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => {
          const styles = {
            success: {
              card: "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/90 text-emerald-900 dark:text-emerald-100 shadow-emerald-900/10",
              icon: <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />,
              closeBtn: "text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50",
            },
            error: {
              card: "border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/90 text-rose-900 dark:text-rose-100 shadow-rose-900/10",
              icon: <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />,
              closeBtn: "text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50",
            },
            warning: {
              card: "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/90 text-amber-900 dark:text-amber-100 shadow-amber-900/10",
              icon: <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />,
              closeBtn: "text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50",
            },
            info: {
              card: "border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/90 text-sky-900 dark:text-sky-100 shadow-sky-900/10",
              icon: <Info className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />,
              closeBtn: "text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50",
            },
          }[toast.type] || {
            card: "border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-stone-900/10",
            icon: <Info className="h-5 w-5 text-stone-600 dark:text-stone-400 shrink-0 mt-0.5" />,
            closeBtn: "text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800",
          };

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-lg transition-all duration-200 ease-in-out ${styles.card}`}
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
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1C1917] p-6 shadow-2xl border border-stone-100 dark:border-stone-800 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start gap-4">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                  confirmDialog.variant === "danger"
                    ? "bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40"
                    : confirmDialog.variant === "warning"
                    ? "bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40"
                    : "bg-[#FEF9C3] dark:bg-[#713F12]/40 text-amber-900 dark:text-amber-200 border border-yellow-200 dark:border-amber-800"
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
                    : "bg-[#F5B716] hover:bg-[#E5A910] text-[#1C1917]"
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
