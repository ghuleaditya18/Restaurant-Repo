import { isValidElement } from "react";

const COLOR_PRESETS = {
  amber:
    "bg-[#FFF7E8] dark:bg-[#30251C] text-[#9A3412] dark:text-[#FFB02E] border-[#FFEDD5] dark:border-[#9A3412]/40",
  orange:
    "bg-[#FFF7E8] dark:bg-[#30251C] text-[#9A3412] dark:text-[#FFB02E] border-[#FFEDD5] dark:border-[#9A3412]/40",
  emerald:
    "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  sky:
    "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800",
  rose:
    "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
  stone:
    "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700",
  slate:
    "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  indigo:
    "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
  violet:
    "bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800",
};

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
  compact = false,
  className = "",
}) {
  const Component = onClick ? "button" : "div";

  const renderIcon = () => {
    if (!Icon) return null;
    if (isValidElement(Icon)) return Icon;
    const IconComponent = Icon;
    return <IconComponent className="w-4 h-4 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5 shrink-0" />;
  };

  const rawColor = color || badgeColor;
  const tileColor =
    (rawColor && COLOR_PRESETS[String(rawColor).trim().toLowerCase()]) ||
    rawColor ||
    COLOR_PRESETS.amber;

  if (layout === "horizontal") {
    return (
      <Component
        type={onClick ? "button" : undefined}
        onClick={onClick}
        aria-pressed={onClick ? active : undefined}
        className={`text-left w-full rounded-xl border bg-white dark:bg-[#101722] shadow-xs transition-all duration-200 flex items-center gap-3 ${
          compact ? "min-h-0 px-3 py-2.5" : "p-3 sm:p-3.5 min-h-[72px]"
        } ${
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
            <h3
              className={`font-semibold tabular-nums text-stone-900 dark:text-white truncate ${
                compact ? "text-base sm:text-lg leading-6" : "text-lg sm:text-xl md:text-2xl"
              }`}
            >
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
      className={`text-left w-full rounded-xl border bg-white dark:bg-[#101722] shadow-xs transition-all duration-200 flex flex-col justify-between ${
        compact ? "min-h-0 px-3 py-2.5" : "p-3 sm:p-3.5 min-h-[72px]"
      } ${
        active
          ? "border-[#F59E0B] ring-2 ring-[#F59E0B]/30 bg-[#FFF7E8]/40 dark:bg-[#30251C]/40"
          : "border-[#E5E9F0] dark:border-[#1E293B] hover:border-stone-300 dark:hover:border-stone-700"
      } ${onClick ? "cursor-pointer hover:shadow-xs" : ""} ${className}`}
    >
      <div className={`flex items-start justify-between ${compact ? "gap-2" : "gap-2.5"} w-full`}>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-stone-500 dark:text-[#8A9AB2] truncate">
            {title}
          </p>

          <div className="mt-0.5 flex items-baseline gap-1.5 sm:gap-2">
            <h3
              className={`font-semibold tracking-tight tabular-nums text-stone-900 dark:text-white truncate ${
                compact ? "text-base sm:text-lg leading-6" : "text-lg sm:text-xl leading-7"
              }`}
            >
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
          className={`hidden sm:block truncate border-t border-[#E5E9F0] dark:border-[#1E293B] pt-1 text-[11px] text-stone-500 dark:text-[#8A9AB2] font-medium ${
            compact ? "mt-1" : "mt-1.5"
          }`}
          title={description}
        >
          {description}
        </p>
      )}
    </Component>
  );
}
