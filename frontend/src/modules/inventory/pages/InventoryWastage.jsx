import { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshCw,
  SlidersHorizontal,
  Flame,
  X,
  Search,
  Eye,
  RotateCcw,
  Archive,
  CheckSquare,
} from "lucide-react";
import {
  getAllMovements,
  recordWastage,
  recordAdjustment,
  reverseStockMovement,
  getInventoryItems,
  bulkArchiveMovements,
} from "../../../services/inventoryService";
import { useNotification } from "../../../context/NotificationContext";
import { BUTTON_VARIANTS, INPUT_STYLES, TABLE_STYLES } from "../../../utils/themeTokens";
import Pagination from "../../../components/Pagination";

const WASTAGE_REASONS = ["SPOILAGE", "EXPIRY", "SPILLAGE", "STAFF_MEAL", "DAMAGE", "OTHER"];

export default function InventoryWastage() {
  const [movements, setMovements] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [preset, setPreset] = useState("today");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active"); // 'active' | 'archived' | 'all'
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [totalMovements, setTotalMovements] = useState(0);

  // Selected for Bulk Archive
  const [selectedIds, setSelectedIds] = useState(new Set());
  const headerCheckboxRef = useRef(null);

  // Modals
  const [wastageModalOpen, setWastageModalOpen] = useState(false);
  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
  const [viewingMovement, setViewingMovement] = useState(null);
  const [reversingMovement, setReversingMovement] = useState(null);
  const [reversalReason, setReversalReason] = useState("");

  // Forms
  const [wasteForm, setWasteForm] = useState({
    inventory_item_id: "",
    quantity: "1",
    reason: "SPOILAGE",
    explanation: "",
  });

  const [adjForm, setAdjForm] = useState({
    inventory_item_id: "",
    quantity: "1",
    reason: "",
    notes: "",
  });

  const { showSuccess, showDelete, showError, confirm } = useNotification();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const isArchivedParam =
        statusFilter === "archived" ? true : statusFilter === "active" ? false : undefined;
      const [movs, items] = await Promise.all([
        getAllMovements({
          preset,
          movement_type: typeFilter || undefined,
          is_archived: isArchivedParam,
          search: search.trim() || undefined,
          page: currentPage,
          page_size: pageSize,
        }),
        getInventoryItems({ is_active: true }),
      ]);
      setMovements(movs.items || []);
      setTotalMovements(movs.total || 0);
      setInventoryItems(items);
    } catch {
      showError("Failed to load stock movements");
    } finally {
      setLoading(false);
    }
  }, [preset, typeFilter, statusFilter, search, currentPage, pageSize, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Selection applies only to the exact page and filter result the user selected.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [preset, typeFilter, statusFilter, search, currentPage]);

  const handleLogWastage = async (e) => {
    e.preventDefault();
    if (!wasteForm.inventory_item_id) {
      showError("Please select an item");
      return;
    }
    try {
      await recordWastage({
        inventory_item_id: Number(wasteForm.inventory_item_id),
        quantity: Number(wasteForm.quantity),
        reason: wasteForm.reason,
        explanation: wasteForm.explanation,
      });
      showSuccess("Wastage recorded and stock deducted");
      setWastageModalOpen(false);
      setWasteForm({
        inventory_item_id: "",
        quantity: "1",
        reason: "SPOILAGE",
        explanation: "",
      });
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to record wastage");
    }
  };

  const handleRecordAdjustment = async (e) => {
    e.preventDefault();
    if (!adjForm.inventory_item_id) {
      showError("Please select an item");
      return;
    }
    try {
      await recordAdjustment({
        inventory_item_id: Number(adjForm.inventory_item_id),
        quantity: Number(adjForm.quantity),
        reason: adjForm.reason,
        notes: adjForm.notes || null,
      });
      showSuccess("Stock adjustment recorded");
      setAdjustmentModalOpen(false);
      setAdjForm({
        inventory_item_id: "",
        quantity: "1",
        reason: "",
        notes: "",
      });
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to record adjustment");
    }
  };

  const handleConfirmReversal = async (e) => {
    e.preventDefault();
    if (!reversalReason.trim()) {
      showError("Reversal reason is mandatory");
      return;
    }

    try {
      await reverseStockMovement(reversingMovement.id, reversalReason.trim());
      showDelete(`Movement #${reversingMovement.id} successfully reversed`);
      setReversingMovement(null);
      setReversalReason("");
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to reverse movement");
    }
  };

  // Safe Archive Selected
  // Safe Archive Selected (persists to PostgreSQL)
  const handleArchiveSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const ok = await confirm({
      title: "Archive Selected Records",
      message: `Archive ${ids.length} selected ledger entries from active operational views? Historical stock ledger data and balance calculations will be strictly preserved in PostgreSQL.`,
      confirmText: "Archive Selected",
      variant: "danger",
    });
    if (!ok) return;

    try {
      const res = await bulkArchiveMovements(ids, "Archived by manager from operational view");
      showSuccess(`Successfully archived ${res.archived_count} ledger record(s)`);
      setSelectedIds(new Set());
      setCurrentPage(1);
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to archive movements");
    }
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // Toggle row select (only eligible: wastage and adjustment, not immutable order movements or already archived)
  const toggleSelectRow = (id, movementType, isArchived) => {
    if (movementType === "SALE_CONSUMPTION" || isArchived) return; // Immutable
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalPages = Math.ceil(totalMovements / pageSize) || 1;
  const paginatedMovements = movements;

  // Eligible for selection on the current visible page
  const pageEligibleMovements = paginatedMovements.filter(
    (m) => m.can_archive
  );
  const pageEligibleIds = pageEligibleMovements.map((m) => m.id);
  const allPageSelected =
    pageEligibleIds.length > 0 && pageEligibleIds.every((id) => selectedIds.has(id));
  const somePageSelected =
    pageEligibleIds.some((id) => selectedIds.has(id)) && !allPageSelected;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = somePageSelected;
    }
  }, [somePageSelected]);

  const handleToggleSelectAllPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageEligibleIds.forEach((id) => next.delete(id));
      } else {
        pageEligibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder="Search item, notes, ref..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className={`${INPUT_STYLES.base} pl-9`}
            />
          </div>

          <select
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value);
              setCurrentPage(1);
            }}
            className={`${INPUT_STYLES.select} w-36`}
          >
            <option value="today">Today</option>
            <option value="last_7_days">Last 7 Days</option>
            <option value="this_month">This Month</option>
            <option value="all">All Dates</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setCurrentPage(1);
            }}
            className={`${INPUT_STYLES.select} w-44`}
          >
            <option value="">All Movement Types</option>
            <option value="PURCHASE">Purchase (GRN)</option>
            <option value="SALE_CONSUMPTION">Sale Consumption</option>
            <option value="CONSUMPTION_REVERSAL">Consumption Reversal</option>
            <option value="WASTAGE">Wastage / Loss</option>
            <option value="ADJUSTMENT">Adjustment</option>
            <option value="OPENING_STOCK">Opening Stock</option>
          </select>

          {/* Status Filter Tabs */}
          <div className="inline-flex items-center p-1 bg-stone-100 dark:bg-stone-800/80 rounded-lg text-xs font-medium border border-stone-200 dark:border-stone-700">
            <button
              type="button"
              onClick={() => { setStatusFilter("active"); setCurrentPage(1); }}
              className={`px-2.5 py-1 rounded-md transition ${
                statusFilter === "active"
                  ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 font-bold shadow-xs"
                  : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => { setStatusFilter("archived"); setCurrentPage(1); }}
              className={`px-2.5 py-1 rounded-md transition ${
                statusFilter === "archived"
                  ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 font-bold shadow-xs"
                  : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
              }`}
            >
              Archived
            </button>
            <button
              type="button"
              onClick={() => { setStatusFilter("all"); setCurrentPage(1); }}
              className={`px-2.5 py-1 rounded-md transition ${
                statusFilter === "all"
                  ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 font-bold shadow-xs"
                  : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
              }`}
            >
              All
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={handleArchiveSelected}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 transition"
            >
              <Archive size={14} />
              <span>Archive Selected ({selectedIds.size})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setAdjustmentModalOpen(true)}
            className={BUTTON_VARIANTS.secondary}
          >
            <SlidersHorizontal size={15} />
            <span>Adjustment</span>
          </button>
          <button
            type="button"
            onClick={() => setWastageModalOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-rose-700 cursor-pointer"
          >
            <Flame size={15} />
            <span>Log Wastage</span>
          </button>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2 border border-stone-300 dark:border-stone-700 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition text-stone-600 dark:text-stone-300"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Stock Movements Ledger Table */}
      <div className={TABLE_STYLES.container}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
                <th className="w-12 px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    ref={headerCheckboxRef}
                    disabled={pageEligibleIds.length === 0}
                    checked={allPageSelected}
                    onChange={handleToggleSelectAllPage}
                    title={
                      pageEligibleIds.length === 0
                        ? "No eligible movements to select on this page (order deductions are protected)"
                        : "Select all eligible rows on this page"
                    }
                    aria-label="Select all eligible rows on this page"
                    className="w-4.5 h-4.5 text-amber-600 rounded border-stone-300 dark:border-stone-600 focus:ring-amber-500 cursor-pointer accent-amber-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </th>
                <th className={TABLE_STYLES.th}>Timestamp</th>
                <th className={TABLE_STYLES.th}>Item</th>
                <th className={TABLE_STYLES.th}>Movement Type</th>
                <th className={TABLE_STYLES.th}>Quantity</th>
                <th className={TABLE_STYLES.th}>Unit Cost</th>
                <th className={TABLE_STYLES.th}>Balance After</th>
                <th className={TABLE_STYLES.th}>Reference</th>
                <th className={TABLE_STYLES.th}>Notes</th>
                <th className={`${TABLE_STYLES.th} text-right pr-6 min-w-[90px]`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedMovements.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-sm text-stone-500">
                    {loading ? "Loading stock ledger movements..." : "No movements found for selected criteria."}
                  </td>
                </tr>
              ) : (
                paginatedMovements.map((m) => {
                  const isEligibleForReversal = m.can_archive;

                  return (
                    <tr key={m.id} className={`${TABLE_STYLES.tr} ${selectedIds.has(m.id) ? "bg-amber-50/40 dark:bg-amber-950/20" : ""}`}>
                      <td className="w-12 px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          disabled={!m.can_archive}
                          checked={selectedIds.has(m.id)}
                          onChange={() => toggleSelectRow(m.id, m.movement_type, m.is_archived)}
                          className="w-4.5 h-4.5 rounded border-stone-300 dark:border-stone-600 text-amber-600 focus:ring-amber-500 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer accent-amber-600"
                          title={
                            m.can_archive ? `Select movement #${m.id}` : "Protected system or reversed movement"
                          }
                        />
                      </td>
                      <td className={TABLE_STYLES.td}>
                        <span className="text-stone-500 text-xs">{new Date(m.created_at).toLocaleString()}</span>
                      </td>
                      <td className={TABLE_STYLES.td}>
                        <span className="font-bold text-stone-900 dark:text-stone-100">{m.inventory_item_name}</span>
                      </td>
                      <td className={TABLE_STYLES.td}>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                            m.movement_type === "PURCHASE" || m.movement_type === "CONSUMPTION_REVERSAL"
                              ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200"
                              : m.movement_type === "WASTAGE"
                              ? "bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200"
                              : m.movement_type === "SALE_CONSUMPTION"
                              ? "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200"
                              : "bg-stone-200 dark:bg-stone-800 text-stone-800 dark:text-stone-200"
                          }`}
                        >
                          {m.movement_type.replace("_", " ")}
                        </span>
                      </td>
                      <td className={TABLE_STYLES.td}>
                        <span
                          className={`font-bold ${
                            Number(m.quantity) > 0 ? "text-emerald-600" : "text-stone-900 dark:text-stone-100"
                          }`}
                        >
                          {Number(m.quantity) > 0 ? `+${m.quantity}` : m.quantity} {m.inventory_item_unit}
                        </span>
                      </td>
                      <td className={TABLE_STYLES.td}>₹{Number(m.unit_cost).toFixed(2)}</td>
                      <td className={TABLE_STYLES.td}>
                        <span className="font-semibold text-stone-900 dark:text-stone-100">{m.balance_after}</span>
                      </td>
                      <td className={TABLE_STYLES.td}>
                        <span className="text-xs font-mono text-stone-500">
                          {m.reference_type} #{m.reference_id}
                        </span>
                      </td>
                      <td className={TABLE_STYLES.td}>
                        <span className="text-xs text-stone-500 truncate max-w-xs block">{m.notes || "—"}</span>
                      </td>
                      <td className={`${TABLE_STYLES.td} text-right pr-6 min-w-[90px]`}>
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => setViewingMovement(m)}
                            className="p-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded transition"
                            title="View Details"
                          >
                            <Eye size={15} />
                          </button>
                          {isEligibleForReversal && (
                            <button
                              type="button"
                              onClick={() => {
                                setReversingMovement(m);
                                setReversalReason("");
                              }}
                              className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded transition"
                              title="Reverse Movement"
                            >
                              <RotateCcw size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
        totalRecords={totalMovements}
        pageSize={pageSize}
        onPageChange={(page) => setCurrentPage(page)}
        />
      </div>

      {/* VIEW MOVEMENT DETAILS MODAL */}
      {viewingMovement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={(e) => e.target === e.currentTarget && setViewingMovement(null)}>
          <div className="w-full max-w-md bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                Movement #{viewingMovement.id}
              </h3>
              <button
                type="button"
                onClick={() => setViewingMovement(null)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-stone-100 dark:border-stone-800">
                <span className="text-stone-500">Item:</span>
                <span className="font-bold text-stone-900 dark:text-stone-100">
                  {viewingMovement.inventory_item_name}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100 dark:border-stone-800">
                <span className="text-stone-500">Type:</span>
                <span className="font-semibold">{viewingMovement.movement_type}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100 dark:border-stone-800">
                <span className="text-stone-500">Quantity:</span>
                <span className="font-bold">{viewingMovement.quantity} {viewingMovement.inventory_item_unit}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100 dark:border-stone-800">
                <span className="text-stone-500">Unit Cost:</span>
                <span className="font-medium">₹{Number(viewingMovement.unit_cost).toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100 dark:border-stone-800">
                <span className="text-stone-500">Balance After:</span>
                <span className="font-bold">{viewingMovement.balance_after}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100 dark:border-stone-800">
                <span className="text-stone-500">Reference:</span>
                <span className="font-mono">{viewingMovement.reference_type} #{viewingMovement.reference_id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100 dark:border-stone-800">
                <span className="text-stone-500">Timestamp:</span>
                <span>{new Date(viewingMovement.created_at).toLocaleString()}</span>
              </div>
              <div className="pt-2">
                <span className="text-stone-500 block mb-1">Notes:</span>
                <p className="p-2.5 bg-stone-50 dark:bg-stone-900/50 rounded-lg text-stone-700 dark:text-stone-300">
                  {viewingMovement.notes || "No notes recorded"}
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setViewingMovement(null)}
                className={BUTTON_VARIANTS.primary}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REVERSAL MODAL */}
      {reversingMovement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={(e) => e.target === e.currentTarget && setReversingMovement(null)}>
          <div className="w-full max-w-md bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                Reverse Movement #{reversingMovement.id}
              </h3>
              <button
                type="button"
                onClick={() => setReversingMovement(null)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs space-y-1">
              <p className="font-semibold text-amber-800 dark:text-amber-300">
                Compensating Stock Reversal
              </p>
              <p className="text-amber-700 dark:text-amber-400">
                Reversing this {reversingMovement.movement_type} movement will post a compensating adjustment of{" "}
                <span className="font-bold">
                  {Number(reversingMovement.quantity) < 0 ? `+${Math.abs(reversingMovement.quantity)}` : `-${reversingMovement.quantity}`}{" "}
                  {reversingMovement.inventory_item_unit}
                </span>{" "}
                back into stock.
              </p>
            </div>

            <form onSubmit={handleConfirmReversal} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                  Reason for Reversal *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Explain why this entry is being reversed (e.g. entered in error)..."
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  className={INPUT_STYLES.base}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setReversingMovement(null)}
                  className={BUTTON_VARIANTS.secondary}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-sm transition"
                >
                  Confirm Reversal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LOG WASTAGE MODAL */}
      {wastageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={(e) => e.target === e.currentTarget && setWastageModalOpen(false)}>
          <div className="w-full max-w-md bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                Log Inventory Wastage
              </h3>
              <button
                type="button"
                onClick={() => setWastageModalOpen(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleLogWastage} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                  Item to Discard *
                </label>
                <select
                  required
                  value={wasteForm.inventory_item_id}
                  onChange={(e) => setWasteForm({ ...wasteForm, inventory_item_id: e.target.value })}
                  className={INPUT_STYLES.select}
                >
                  <option value="">Select Item</option>
                  {inventoryItems.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name} (Stock: {inv.current_stock} {inv.base_unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                    Wasted Quantity *
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={wasteForm.quantity}
                    onChange={(e) => setWasteForm({ ...wasteForm, quantity: e.target.value })}
                    className={INPUT_STYLES.base}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                    Reason *
                  </label>
                  <select
                    value={wasteForm.reason}
                    onChange={(e) => setWasteForm({ ...wasteForm, reason: e.target.value })}
                    className={INPUT_STYLES.select}
                  >
                    {WASTAGE_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                  Explanation *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Mandatory explanation of the loss..."
                  value={wasteForm.explanation}
                  onChange={(e) => setWasteForm({ ...wasteForm, explanation: e.target.value })}
                  className={INPUT_STYLES.base}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setWastageModalOpen(false)}
                  className={BUTTON_VARIANTS.secondary}
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-sm transition">
                  Confirm Loss
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD ADJUSTMENT MODAL */}
      {adjustmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={(e) => e.target === e.currentTarget && setAdjustmentModalOpen(false)}>
          <div className="w-full max-w-md bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                Record Stock Adjustment
              </h3>
              <button
                type="button"
                onClick={() => setAdjustmentModalOpen(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRecordAdjustment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                  Item to Adjust *
                </label>
                <select
                  required
                  value={adjForm.inventory_item_id}
                  onChange={(e) => setAdjForm({ ...adjForm, inventory_item_id: e.target.value })}
                  className={INPUT_STYLES.select}
                >
                  <option value="">Select Item</option>
                  {inventoryItems.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name} (Stock: {inv.current_stock} {inv.base_unit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                  Adjustment Quantity (+ to add, - to deduct) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="e.g. +50 or -20"
                  value={adjForm.quantity}
                  onChange={(e) => setAdjForm({ ...adjForm, quantity: e.target.value })}
                  className={INPUT_STYLES.base}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                  Reason *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Inventory count reconciliation"
                  value={adjForm.reason}
                  onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })}
                  className={INPUT_STYLES.base}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setAdjustmentModalOpen(false)}
                  className={BUTTON_VARIANTS.secondary}
                >
                  Cancel
                </button>
                <button type="submit" className={BUTTON_VARIANTS.primary}>
                  Post Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FLOATING BULK ACTIONS BAR */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 right-8 z-40 flex items-center gap-3 bg-stone-900/95 dark:bg-stone-800/95 text-white px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-md border border-stone-700/50">
          <div className="flex items-center gap-2 pr-3 border-r border-stone-700">
            <CheckSquare size={18} className="text-amber-400" />
            <span className="text-sm font-semibold">{selectedIds.size} selected</span>
          </div>
          <button
            type="button"
            onClick={handleClearSelection}
            className="text-xs text-stone-300 hover:text-white px-2 py-1 rounded-md hover:bg-stone-700/50 transition cursor-pointer"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handleArchiveSelected}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition shadow-xs cursor-pointer"
          >
            <Archive size={14} />
            Archive Selected ({selectedIds.size})
          </button>
        </div>
      )}
    </div>
  );
}
