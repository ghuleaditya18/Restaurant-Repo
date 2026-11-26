import { STATUS_MAP } from "../utils/themeTokens";

/**
 * Standardized StatusBadge Component (A5 Standard)
 * - Centralized fixed color map from themeTokens
 * - Pill shape with subtle border, tinted background, and status dot
 * - Never shows raw database enums
 */
export default function StatusBadge({
  status,
  label = null,
  count = null,
  className = "",
  size = "md", // 'sm' | 'md'
}) {
  if (!status) return null;

  const normalizedKey = String(status).trim().toUpperCase().replace(/\s+/g, "_");
  const config = STATUS_MAP[normalizedKey] || {
    bg: "bg-stone-100 dark:bg-stone-800",
    text: "text-stone-700 dark:text-stone-200",
    border: "border-stone-200 dark:border-stone-700",
    dot: "bg-stone-400",
    label: String(status).replace(/_/g, " "),
  };

  const displayText = label || config.label;

  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-[11px] gap-1.5"
      : "px-2.5 py-1 text-xs gap-1.5";

  return (
    <span
      className={`inline-flex items-center shrink-0 whitespace-nowrap rounded-full font-medium border ${config.bg} ${config.text} ${config.border} ${sizeClasses} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot} shrink-0`} />
      <span>{displayText}</span>
      {count != null && (
        <span className="font-bold tabular-nums opacity-85">({count})</span>
      )}
    </span>
  );
}
