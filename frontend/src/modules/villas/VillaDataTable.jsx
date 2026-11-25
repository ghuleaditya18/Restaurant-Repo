import { Fragment, useEffect, useRef } from "react";
import Pagination from "../../components/Pagination";
import { TABLE_STYLES } from "../../utils/themeTokens";

const ALIGN_MAP = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

/**
 * Shared semantic HTML table for all Villas & Units screens.
 * Guarantees synchronized column widths between <thead> and <tbody>,
 * clean horizontal scrolling on narrow viewports, consistent row height,
 * empty/loading states, optional integrated pagination, and optional
 * checkbox-based row selection for bulk operations.
 *
 * Checkbox props (all optional – omit to disable selection entirely):
 *  - selectedIds        : Set<number|string>  – controlled set of selected row IDs
 *  - onSelectRow        : (id) => void         – toggle a single row
 *  - onSelectAll        : (allIds) => void     – called with IDs of all selectable page rows
 *  - isRowSelectable    : (row) => boolean     – defaults to () => true
 */
export default function VillaDataTable({
  columns,
  rows,
  rowKey,
  loading = false,
  loadingMessage = "Loading records...",
  emptyIcon: EmptyIcon = null,
  emptyTitle = "No records found",
  emptyDescription = "",
  title = null,
  subtitle = null,
  headerActions = null,
  pagination = null,
  tableMinWidth = "min-w-full",
  onRowClick = null,
  renderExpandedRow = null,
  // ── checkbox / bulk-select props ──
  selectedIds = null,
  onSelectRow = null,
  onSelectAll = null,
  isRowSelectable = null,
}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const selectable = selectedIds !== null && onSelectRow !== null;
  const checkable = isRowSelectable ?? (() => true);

  // IDs of rows on this page that are eligible for selection
  const selectableIds = selectable
    ? safeRows.filter(checkable).map((r, i) => (rowKey ? rowKey(r, i) : (r.id ?? i)))
    : [];

  const selectedCount = selectable
    ? selectableIds.filter((id) => selectedIds.has(id)).length
    : 0;
  const allSelected = selectable && selectableIds.length > 0 && selectedCount === selectableIds.length;
  const someSelected = selectable && selectedCount > 0 && !allSelected;

  // Indeterminate checkbox state
  const checkAllRef = useRef(null);
  useEffect(() => {
    if (checkAllRef.current) {
      checkAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const handleSelectAll = () => {
    if (onSelectAll) onSelectAll(selectableIds);
  };

  const totalCols = columns.length + (selectable ? 1 : 0);

  return (
    <div className={TABLE_STYLES.container}>
      {(title || headerActions) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E9F0] dark:border-[#1E293B] px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h2 className="text-base font-bold text-[#172033] dark:text-[#F8FAFC] truncate">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-[#64748B] dark:text-[#8A9AB2]">
                {subtitle}
              </p>
            )}
          </div>
          {headerActions && <div className="flex flex-wrap items-center gap-2 shrink-0">{headerActions}</div>}
        </div>
      )}

      <div className="w-full overflow-x-auto">
        <table className={`w-full ${tableMinWidth} border-collapse text-left`}>
          <colgroup>
            {selectable && <col className="w-10" />}
            {columns.map((col) => (
              <col key={col.key} className={col.width || ""} />
            ))}
          </colgroup>
          <thead className="border-b border-[#E5E9F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#151D29]">
            <tr>
              {selectable && (
                <th scope="col" className="px-3 py-3 text-left w-10">
                  <input
                    ref={checkAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={handleSelectAll}
                    disabled={selectableIds.length === 0}
                    aria-label="Select all rows on this page"
                    className="h-4 w-4 rounded border-stone-300 dark:border-stone-600 text-amber-500 accent-amber-500 cursor-pointer disabled:cursor-not-allowed"
                  />
                </th>
              )}
              {columns.map((col) => {
                const alignClass = ALIGN_MAP[col.align || "left"] || "text-left";
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#8A9AB2] ${alignClass} ${col.headerClassName || ""}`}
                  >
                    {col.label}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-[#E5E9F0] dark:divide-[#1E293B] text-sm">
            {loading ? (
              <tr>
                <td
                  colSpan={totalCols}
                  className="px-4 py-12 text-center text-sm text-[#64748B] dark:text-[#8A9AB2]"
                >
                  {loadingMessage}
                </td>
              </tr>
            ) : safeRows.length === 0 ? (
              <tr>
                <td colSpan={totalCols} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-1.5 text-[#64748B] dark:text-[#8A9AB2]">
                    {EmptyIcon && <EmptyIcon size={28} className="opacity-40 mb-1" />}
                    <p className="text-sm font-semibold text-[#172033] dark:text-[#F8FAFC]">
                      {emptyTitle}
                    </p>
                    {emptyDescription && (
                      <p className="text-xs text-[#64748B] dark:text-[#8A9AB2]">
                        {emptyDescription}
                      </p>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              safeRows.map((row, index) => {
                const key = rowKey ? rowKey(row, index) : (row.id ?? index);
                const expanded = renderExpandedRow ? renderExpandedRow(row) : null;
                const isSelected = selectable && selectedIds.has(key);
                const isEligible = selectable && checkable(row);
                return (
                  <Fragment key={key}>
                    <tr
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={`${TABLE_STYLES.tr} ${onRowClick ? "cursor-pointer" : ""} ${
                        isSelected
                          ? "bg-amber-50/60 dark:bg-amber-950/20"
                          : ""
                      }`}
                    >
                      {selectable && (
                        <td className="px-3 py-3.5 align-middle w-10">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!isEligible}
                            onChange={() => onSelectRow(key)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select row ${key}`}
                            className="h-4 w-4 rounded border-stone-300 dark:border-stone-600 text-amber-500 accent-amber-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                          />
                        </td>
                      )}
                      {columns.map((col) => {
                        const alignClass = ALIGN_MAP[col.align || "left"] || "text-left";
                        return (
                          <td
                            key={col.key}
                            className={`px-4 py-3.5 align-middle text-sm text-[#172033] dark:text-[#F8FAFC] ${alignClass} ${col.cellClassName || ""}`}
                          >
                            {col.render ? col.render(row) : row[col.key]}
                          </td>
                        );
                      })}
                    </tr>
                    {expanded && (
                      <tr className="bg-[#F8FAFC]/80 dark:bg-[#151D29]/80 border-b border-[#E5E9F0] dark:border-[#1E293B]">
                        <td colSpan={totalCols} className="px-4 py-3">
                          {expanded}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pagination && (
        <Pagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalRecords={pagination.totalRecords}
          pageSize={pagination.pageSize}
          onPageChange={pagination.onPageChange}
        />
      )}
    </div>
  );
}
