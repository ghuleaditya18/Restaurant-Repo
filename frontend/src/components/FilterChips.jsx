/**
 * Standard FilterChips Component (A5 Standard)
 * Pill-style status/category filters with active primary accent and optional counts.
 */
export default function FilterChips({
  options = [], // [{ value: '...', label: '...', count?: number }]
  selectedValue,
  onChange,
  className = "",
}) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} role="tablist">
      {options.map((opt) => {
        const isSelected = String(opt.value) === String(selectedValue);

        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onChange?.(opt.value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
              isSelected
                ? "bg-[#F5B716] text-[#1C1917] font-bold shadow-2xs"
                : "border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800/80 text-stone-600 dark:text-stone-300 hover:border-stone-300 dark:hover:border-stone-600 hover:text-stone-900 dark:hover:text-stone-100"
            }`}
          >
            <span>{opt.label}</span>
            {opt.count != null && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold tabular-nums ${
                  isSelected
                    ? "bg-[#1C1917] text-[#F5B716]"
                    : "bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300"
                }`}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
