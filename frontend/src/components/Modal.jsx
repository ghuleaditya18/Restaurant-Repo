import { useEffect, useRef, useCallback } from "react";
import { X } from "lucide-react";
import { MODAL_SIZES } from "../utils/themeTokens";

/**
 * Standard Accessible Modal Component (A4 Standard)
 * - Backdrop dimmed and blurred
 * - Closes on Escape, X, and a click directly on the backdrop
 * - Never closes on inside clicks
 * - Focus trapped inside dialog
 * - Returns focus to previous element on close
 * - Confirms close if hasUnsavedChanges is true
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle = null,
  size = "md", // 'sm' (420px) | 'md' (700px) | 'lg' (960px)
  children,
  footer = null,
  confirmOnUnsaved = false,
  hasUnsavedChanges = false,
  unsavedMessage = "You have unsaved changes. Are you sure you want to close?",
  closeOnEscape = true,
  closeOnBackdrop = true,
  ariaLabelledBy = "modal-dialog-title",
}) {
  const dialogRef = useRef(null);
  const previousActiveElementRef = useRef(null);

  // Store trigger element on open
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement;
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === "function") {
        previousActiveElementRef.current.focus();
      }
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleRequestClose = useCallback(() => {
    if (confirmOnUnsaved && hasUnsavedChanges) {
      const ok = window.confirm(unsavedMessage);
      if (!ok) return;
    }
    onClose?.();
  }, [confirmOnUnsaved, hasUnsavedChanges, unsavedMessage, onClose]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleRequestClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeOnEscape, handleRequestClose]);

  // Trap Focus inside dialog
  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;

    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const focusableElements = dialogRef.current.querySelectorAll(focusableSelectors);
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    const handleTabKey = (e) => {
      if (e.key !== 'Tab') return;
      const elements = dialogRef.current?.querySelectorAll(focusableSelectors);
      if (!elements || elements.length === 0) return;

      const first = elements[0];
      const last = elements[elements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleTabKey);
    return () => window.removeEventListener("keydown", handleTabKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const widthClass = MODAL_SIZES[size] || MODAL_SIZES.md;

  const handleBackdropClick = (e) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      handleRequestClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full ${widthClass} my-8 rounded-2xl bg-white dark:bg-[#101722] shadow-2xl border border-[#E5E9F0] dark:border-[#1E293B] transition-all text-stone-900 dark:text-stone-100 flex flex-col max-h-[90vh]`}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-[#E5E9F0] dark:border-[#1E293B] px-6 py-4.5 shrink-0">
          <div>
            <h3 id={ariaLabelledBy} className="text-lg font-semibold leading-6 text-stone-900 dark:text-stone-100">
              {title}
            </h3>
            {subtitle && (
              <p className="mt-1 text-xs font-normal leading-4 text-stone-500 dark:text-[#8A9AB2]">
                {subtitle}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleRequestClose}
            className="rounded-lg p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#151D29] transition cursor-pointer"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {children}
        </div>

        {/* Modal Footer (Optional) */}
        {footer && (
          <div className="border-t border-[#E5E9F0] dark:border-[#1E293B] px-6 py-4 bg-stone-50/70 dark:bg-[#151D29]/50 rounded-b-2xl flex items-center justify-end gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
