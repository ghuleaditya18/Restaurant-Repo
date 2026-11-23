import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  SlidersHorizontal,
  Flame,
  X,
  Search,
  Eye,
  RotateCcw,
  Archive,
} from "lucide-react";
import {
  getAllMovements,
  recordWastage,
  recordAdjustment,
  reverseStockMovement,
  getInventoryItems,
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
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Selected for Bulk Archive
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [archivedIds, setArchivedIds] = useState(() => {
    try {
      const saved = localStorage.getItem("dineflow_archived_movements");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

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
      const [movs, items] = await Promise.all([
        getAllMovements({
          preset,
          movement_type: typeFilter || undefined,
          limit: 200,
        }),
        getInventoryItems({ is_active: true }),
      ]);
      setMovements(movs);
      setInventoryItems(items);
    } catch {
      showError("Failed to load stock movements");
    } finally {
      setLoading(false);
    }
  }, [preset, typeFilter, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
  const handleArchiveSelected = async () => {
    if (selectedIds.size === 0) return;

    const ok = await confirm({
      title: "Archive Selected Records",
      message: `Archive ${selectedIds.size} non-order ledger entries from the active view? This safely archives records for display without deleting historical stock movements.`,
      confirmText: "Archive Selected",
      variant: "danger",
    });
    if (!ok) return;

    const nextArchived = new Set([...archivedIds, ...selectedIds]);
    setArchivedIds(nextArchived);
    try {
      localStorage.setItem("dineflow_archived_movements", JSON.stringify([...nextArchived]));
    } catch {
      // Local storage fallback
    }
    setSelectedIds(new Set());
    showDelete(`${selectedIds.size} records archived from view`);
  };

  // Toggle row select (only eligible: wastage and adjustment, not immutable order movements)
  const toggleSelectRow = (id, movementType) => {
    if (movementType === "SALE_CONSUMPTION") return; // Immutable
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filter out archived rows and apply search
  const visibleMovements = movements
    .filter((m) => !archivedIds.has(m.id))
    .filter((m) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        m.inventory_item_name?.toLowerCase().includes(q) ||
        m.notes?.toLowerCase().includes(q) ||
        m.reference_type?.toLowerCase().includes(q) ||
        String(m.id).includes(q)
      );
    });

  const totalPages = Math.ceil(visibleMovements.length / pageSize) || 1;
  const paginatedMovements = visibleMovements.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
                <th className="p-3 w-8">
                  <span className="sr-only">Select</span>
                </th>
                <th className={TABLE_STYLES.th}>Timestamp</th>
                <th className={TABLE_STYLES.th}>Item</th>
                <th className={TABLE_STYLES.th}>Movement Type</th>
                <th className={TABLE_STYLES.th}>Quantity</th>
                <th className={TABLE_STYLES.th}>Unit Cost</th>
                <th className={TABLE_STYLES.th}>Balance After</th>
                <th className={TABLE_STYLES.th}>Reference</th>
                <th className={TABLE_STYLES.th}>Notes</th>
                <th className={`${TABLE_STYLES.th} text-right`}>Actions</th>
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
                  const isEligibleForReversal =
                    (m.movement_type === "WASTAGE" || m.movement_type === "ADJUSTMENT") &&
                    m.reference_type !== "REVERSAL";

                  return (
                    <tr key={m.id} className={TABLE_STYLES.tr}>
                      <td className="p-3">
                        <input
                          type="checkbox"
                          disabled={m.movement_type === "SALE_CONSUMPTION"}
                          checked={selectedIds.has(m.id)}
                          onChange={() => toggleSelectRow(m.id, m.movement_type)}
                          className="rounded border-stone-300 text-amber-600 focus:ring-amber-500 disabled:opacity-30 cursor-pointer"
                          title={m.movement_type === "SALE_CONSUMPTION" ? "Immutable order deduction" : "Select row"}
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
                      <td className={`${TABLE_STYLES.td} text-right`}>
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
          onPageChange={setCurrentPage}
          totalRecords={visibleMovements.length}
          limit={pageSize}
        />
      </div>

      {/* VIEW MOVEMENT DETAILS MODAL */}
      {viewingMovement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
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
    </div>
  );
}
