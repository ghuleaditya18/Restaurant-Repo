/**
 * Standardized KPI / StatCard Component (A5 Standard)
 * - Uniform height (76-90px)
 * - 40px tinted rounded icon tile
 * - Large semibold numerical value with tabular-nums
 * - Optional active state (amber border/ring)
 * - Optional click interaction
 * - Optional trend indicator
 */
export default function StatCard({
  title,
  value,
  description,
  icon: Icon,
  color,
  active = false,
  onClick = null,
  trend = null, // { value: '+12%', isPositive: true }
  className = "",
}) {
  const Component = onClick ? "button" : "div";

  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`text-left w-full rounded-xl border bg-white dark:bg-[#1C1917] p-2.5 sm:p-3 md:p-4 shadow-xs transition-all duration-200 min-h-[84px] sm:min-h-[88px] md:min-h-[92px] flex flex-col justify-between ${
        active
          ? "border-[#F5B716] ring-2 ring-[#F5B716]/30 bg-amber-50/20 dark:bg-amber-950/20"
          : "border-stone-200/90 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700"
      } ${onClick ? "cursor-pointer hover:shadow-xs" : ""} ${className}`}
    >
      <div className="flex items-start justify-between gap-2 sm:gap-3 w-full">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] sm:text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400 truncate">
            {title}
          </p>

          <div className="mt-1 flex items-baseline gap-1.5 sm:gap-2">
            <h3 className="text-lg sm:text-xl md:text-2xl font-semibold leading-tight sm:leading-8 tracking-tight tabular-nums text-stone-900 dark:text-stone-100 truncate">
              {value}
            </h3>

            {trend && (
              <span
                className={`text-[11px] sm:text-xs font-semibold tabular-nums shrink-0 ${
                  trend.isPositive
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {trend.value}
              </span>
            )}
          </div>
        </div>

        {Icon && (
          <div
            className={`flex h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-xl border ${
              color ||
              "bg-[#FEF9C3] dark:bg-[#713F12]/40 text-amber-900 dark:text-amber-200 border-yellow-200 dark:border-amber-800"
            }`}
          >
            <Icon className="w-4 h-4 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5" />
          </div>
        )}
      </div>

      {description && (
        <p
          className="hidden sm:block mt-2 truncate border-t border-stone-100 dark:border-stone-800/80 pt-1.5 text-[11px] text-stone-500 dark:text-stone-400 font-medium"
          title={description}
        >
          {description}
        </p>
      )}
    </Component>
  );
}
