import { isValidElement } from "react";

/**
 * Standardized KPI / StatCard Component (A5 Standard)
 * - Uniform height across grids (84px - 90px)
 * - 36-40px tinted rounded icon tile
 * - Large semibold numerical value with tabular-nums
 * - Optional active state (amber border/ring)
 * - Optional click interaction (button semantics)
 * - Optional trend indicator or subtext
 * - Supports both component icons and JSX element icons
 * - Supports layout="vertical" (default) or layout="horizontal"
 */
export default function StatCard({
  title,
  value,
  description,
  icon: Icon,
  color,
  badgeColor,
  active = false,
  onClick = null,
  trend = null, // { value: '+12%', isPositive: true }
  subtext = null,
  layout = "vertical",
  className = "",
}) {
  const Component = onClick ? "button" : "div";

  const renderIcon = () => {
    if (!Icon) return null;
    if (isValidElement(Icon)) return Icon;
    const IconComponent = Icon;
    return <IconComponent className="w-4 h-4 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5 shrink-0" />;
  };

  const tileColor =
    color ||
    badgeColor ||
    "bg-[#FFF7E8] dark:bg-[#30251C] text-[#9A3412] dark:text-[#FFB02E] border-[#FFEDD5] dark:border-[#9A3412]/40";

  if (layout === "horizontal") {
    return (
      <Component
        type={onClick ? "button" : undefined}
        onClick={onClick}
        aria-pressed={onClick ? active : undefined}
        className={`text-left w-full rounded-xl border bg-white dark:bg-[#101722] p-3 sm:p-3.5 shadow-xs transition-all duration-200 min-h-[72px] flex items-center gap-3 ${
          active
            ? "border-[#F59E0B] ring-2 ring-[#F59E0B]/30 bg-[#FFF7E8]/40 dark:bg-[#30251C]/40"
            : "border-[#E5E9F0] dark:border-[#1E293B] hover:border-stone-300 dark:hover:border-stone-700"
        } ${onClick ? "cursor-pointer hover:shadow-xs" : ""} ${className}`}
      >
        {Icon && (
          <div
            className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl border ${tileColor}`}
          >
            {renderIcon()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-[11px] sm:text-xs text-stone-500 dark:text-[#8A9AB2] font-medium truncate">
            {title}
          </p>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <h3 className="text-lg sm:text-xl md:text-2xl font-semibold tabular-nums text-stone-900 dark:text-white truncate">
              {value}
            </h3>
            {subtext && (
              <span className="text-[10px] sm:text-[11px] font-medium text-stone-500 dark:text-[#8A9AB2] truncate">
                {subtext}
              </span>
            )}
          </div>
        </div>
      </Component>
    );
  }

  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      className={`text-left w-full rounded-xl border bg-white dark:bg-[#101722] p-3 sm:p-3.5 shadow-xs transition-all duration-200 min-h-[72px] flex flex-col justify-between ${
        active
          ? "border-[#F59E0B] ring-2 ring-[#F59E0B]/30 bg-[#FFF7E8]/40 dark:bg-[#30251C]/40"
          : "border-[#E5E9F0] dark:border-[#1E293B] hover:border-stone-300 dark:hover:border-stone-700"
      } ${onClick ? "cursor-pointer hover:shadow-xs" : ""} ${className}`}
    >
      <div className="flex items-start justify-between gap-2.5 w-full">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-stone-500 dark:text-[#8A9AB2] truncate">
            {title}
          </p>

          <div className="mt-0.5 flex items-baseline gap-1.5 sm:gap-2">
            <h3 className="text-lg sm:text-xl font-semibold leading-7 tracking-tight tabular-nums text-stone-900 dark:text-white truncate">
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

            {subtext && (
              <span className="text-[10px] sm:text-[11px] font-semibold text-stone-500 dark:text-[#8A9AB2] truncate">
                {subtext}
              </span>
            )}
          </div>
        </div>

        {Icon && (
          <div
            className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl border ${tileColor}`}
          >
            {renderIcon()}
          </div>
        )}
      </div>

      {description && (
        <p
          className="hidden sm:block mt-1.5 truncate border-t border-[#E5E9F0] dark:border-[#1E293B] pt-1 text-[11px] text-stone-500 dark:text-[#8A9AB2] font-medium"
          title={description}
        >
          {description}
        </p>
      )}
    </Component>
  );
}
