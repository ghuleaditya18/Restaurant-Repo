import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Standard DineFlow Pagination Component
 *
 * @param {number} currentPage - Active page (1-indexed)
 * @param {number} totalPages - Total available pages
 * @param {number} totalRecords - Total count of records
 * @param {number} pageSize - Number of records per page (default: 10)
 * @param {function} onPageChange - Callback when a page is selected
 * @param {string} className - Optional container styling
 */
export default function Pagination({
  currentPage = 1,
  totalPages = 1,
  totalRecords = 0,
  pageSize = 10,
  onPageChange,
  className = "",
}) {
  if (totalRecords === 0 && totalPages <= 1) {
    return null;
  }

  const startRecord = Math.min((currentPage - 1) * pageSize + 1, totalRecords);
  const endRecord = Math.min(currentPage * pageSize, totalRecords);

  // Generate pagination items with ellipses
  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages = [];
    pages.push(1);

    if (currentPage > 3) {
      pages.push("...");
    }

    const startMiddle = Math.max(2, currentPage - 1);
    const endMiddle = Math.min(totalPages - 1, currentPage + 1);

    for (let p = startMiddle; p <= endMiddle; p++) {
      if (!pages.includes(p)) {
        pages.push(p);
      }
    }

    if (currentPage < totalPages - 2) {
      pages.push("...");
    }

    if (!pages.includes(totalPages)) {
      pages.push(totalPages);
    }

    return pages;
  };

  const pages = getPageNumbers();

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-stone-200/80 dark:border-stone-800 text-xs ${className}`}
      aria-label="Pagination"
    >
      {/* Records Info */}
      <div className="text-stone-500 dark:text-stone-400 font-medium">
        {totalRecords > 0 ? (
          <span>
            Showing <strong className="text-stone-900 dark:text-stone-100">{startRecord}</strong>–
            <strong className="text-stone-900 dark:text-stone-100">{endRecord}</strong> of{" "}
            <strong className="text-stone-900 dark:text-stone-100">{totalRecords}</strong> records
          </span>
        ) : (
          <span>Showing 0 records</span>
        )}
      </div>

      {/* Page Navigation Controls */}
      <div className="flex items-center gap-1">
        {/* Previous Button */}
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#101722] px-2.5 py-1.5 font-semibold text-stone-700 dark:text-stone-300 transition hover:bg-stone-50 dark:hover:bg-[#151D29] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer min-h-[36px]"
          aria-label="Previous Page"
        >
          <ChevronLeft size={14} />
          <span className="hidden xs:inline">Previous</span>
        </button>

        {/* Page Numbers */}
        <div className="flex items-center gap-1">
          {pages.map((p, idx) => {
            if (p === "...") {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="px-2 py-1 text-stone-400 dark:text-stone-500 select-none"
                >
                  ...
                </span>
              );
            }

            const isCurrent = p === currentPage;
            return (
              <button
                key={`page-${p}`}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={isCurrent ? "page" : undefined}
                className={`min-w-[34px] min-h-[34px] rounded-lg text-xs font-semibold transition cursor-pointer flex items-center justify-center ${
                  isCurrent
                    ? "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold shadow-xs"
                    : "text-stone-700 dark:text-[#8A9AB2] hover:bg-stone-100 dark:hover:bg-[#151D29] hover:text-stone-900 dark:hover:text-white border border-transparent hover:border-stone-200 dark:hover:border-stone-800"
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        {/* Next Button */}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#101722] px-2.5 py-1.5 font-semibold text-stone-700 dark:text-stone-300 transition hover:bg-stone-50 dark:hover:bg-[#151D29] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer min-h-[36px]"
          aria-label="Next Page"
        >
          <span className="hidden xs:inline">Next</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
