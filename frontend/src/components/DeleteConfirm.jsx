import { useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, Loader2, X } from "lucide-react";

/**
 * Standard Locked Delete Confirmation Modal (A4 Standard)
 * - Backdrop clicks are LOCKED (do nothing, cannot close by clicking outside)
 * - Cancel button receives initial focus
 * - Red destructive action button
 * - Loading spinner during async request
 * - In-dialog API error banner
 * - Optional impact summary (e.g., number of dependent records)
 * - Optional typed confirmation (e.g., require user to type "DELETE")
 */
export default function DeleteConfirm({
  isOpen,
  onClose,
  onConfirm,
  title = "Delete Record?",
  recordName = null,
  message = "This action is permanent and cannot be undone.",
  impactSummary = null,
  requiredConfirmText = null, // e.g. 'DELETE' for high-impact deletions
  confirmButtonText = "Delete Permanently",
  loading = false,
  error = null,
}) {
  const [typedInput, setTypedInput] = useState("");
  const cancelButtonRef = useRef(null);
  const dialogRef = useRef(null);

  // Focus Cancel button on open
  useEffect(() => {
    if (isOpen) {
      setTypedInput("");
      const timer = setTimeout(() => {
        cancelButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen || loading) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const isConfirmDisabled =
    loading ||
    (requiredConfirmText && typedInput.trim() !== requiredConfirmText);

  const displayTitle = recordName
    ? `Delete ${recordName}?`
    : title;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 overflow-y-auto"
      // Explicitly lock backdrop: clicks outside do nothing!
      onClick={(e) => e.stopPropagation()}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[480px] my-8 rounded-2xl bg-white dark:bg-[#1C1917] p-6 shadow-2xl border border-rose-200 dark:border-rose-900/60 text-stone-900 dark:text-stone-100 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header Icon + Title */}
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
            <AlertCircle size={22} />
          </div>

          <div className="flex-1 min-w-0 pr-6">
            <h3
              id="delete-confirm-title"
              className="text-lg font-bold leading-tight text-stone-900 dark:text-stone-100 break-words"
            >
              {displayTitle}
            </h3>
            <p className="mt-1.5 text-sm font-normal text-stone-600 dark:text-stone-300 leading-relaxed">
              {message}
            </p>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="rounded-lg p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer disabled:opacity-50"
            aria-label="Dismiss dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Impact Summary Banner (Optional) */}
        {impactSummary && (
          <div className="mt-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-3.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-semibold">Impact Warning: </span>
              {impactSummary}
            </div>
          </div>
        )}

        {/* Typed Confirmation Requirement (Optional for high-impact) */}
        {requiredConfirmText && (
          <div className="mt-4">
            <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1.5">
              Type <span className="font-mono font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 px-1 py-0.5 rounded border border-rose-200 dark:border-rose-900">{requiredConfirmText}</span> to confirm:
            </label>
            <input
              type="text"
              value={typedInput}
              disabled={loading}
              onChange={(e) => setTypedInput(e.target.value)}
              placeholder={`Type "${requiredConfirmText}"`}
              className="w-full rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#292524] px-3 py-2 text-sm text-stone-900 dark:text-stone-100 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/30"
            />
          </div>
        )}

        {/* In-Dialog Error Banner */}
        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 p-3 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-stone-100 dark:border-stone-800">
          <button
            ref={cancelButtonRef}
            type="button"
            disabled={loading}
            onClick={onClose}
            className="rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-4 py-2 text-sm font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 transition cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={isConfirmDisabled}
            onClick={onConfirm}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4.5 py-2 text-sm font-bold text-white shadow-xs hover:bg-rose-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 size={15} className="animate-spin shrink-0" />}
            <span>{loading ? "Deleting..." : confirmButtonText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
