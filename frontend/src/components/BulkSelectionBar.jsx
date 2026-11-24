import { Trash2, X } from "lucide-react";

export default function BulkSelectionBar({ count, onDelete, onClear, deleting = false }) {
  if (!count) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm dark:border-rose-900/60 dark:bg-rose-950/30">
      <span className="font-semibold text-stone-700 dark:text-stone-200">{count} selected</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          disabled={deleting}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-stone-600 hover:bg-white disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          <X size={15} /> Clear
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          <Trash2 size={15} /> {deleting ? "Deleting..." : "Delete Selected"}
        </button>
      </div>
    </div>
  );
}
