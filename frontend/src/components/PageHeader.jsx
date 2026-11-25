import { useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { APP_NAME } from "../config/branding";

/**
 * Standardized PageHeader Component (A1 Standard)
 * - Renders exactly one H1 page title (24px / 32px / 600)
 * - Optional subtitle / description (14px / 20px / 400)
 * - Aligned responsive actions container
 * - Sets the browser tab title using the shared product brand.
 */
export default function PageHeader({
  title,
  description,
  actions,
  breadcrumbs = null,
  className = "",
}) {
  useEffect(() => {
    if (title) {
      document.title = `${APP_NAME} | ${title}`;
    } else {
      document.title = `${APP_NAME} | Unified Resort Management`;
    }
  }, [title]);

  return (
    <div className={`mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center ${className}`}>
      <div className="min-w-0 flex-1">
        {/* Optional Breadcrumbs */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
            {breadcrumbs.map((crumb, idx) => (
              <span key={idx} className="flex items-center gap-1.5">
                {idx > 0 && <ChevronRight size={12} className="text-stone-400" />}
                {crumb.path ? (
                  <Link to={crumb.path} className="hover:text-stone-900 dark:hover:text-stone-100 transition">
                    {crumb.name}
                  </Link>
                ) : (
                  <span className="font-semibold text-stone-800 dark:text-stone-200">{crumb.name}</span>
                )}
              </span>
            ))}
          </nav>
        )}

        <h1 className="text-2xl font-semibold leading-8 tracking-tight text-stone-900 dark:text-stone-100 truncate">
          {title}
        </h1>

        {description && (
          <p className="mt-1 text-sm font-normal leading-5 text-stone-500 dark:text-stone-400">
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
