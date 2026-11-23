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
                ? "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold shadow-xs"
                : "border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] text-stone-600 dark:text-[#8A9AB2] hover:border-stone-300 dark:hover:border-stone-600 hover:text-stone-900 dark:hover:text-white"
            }`}
          >
            <span>{opt.label}</span>
            {opt.count != null && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold tabular-nums ${
                  isSelected
                    ? "bg-[#0D1420]/15 text-[#0D1420]"
                    : "bg-stone-100 dark:bg-[#151D29] text-stone-600 dark:text-[#8A9AB2]"
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
