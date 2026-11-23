import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  RefreshCw,
  Eye,
  X,
  ShieldCheck,
} from "lucide-react";
import {
  getStockCounts,
  startStockCount,
  getStockCount,
  submitStockCount,
  approveStockCount,
  cancelStockCount,
} from "../../../services/inventoryService";
import { useNotification } from "../../../context/NotificationContext";
import { BUTTON_VARIANTS, INPUT_STYLES, TABLE_STYLES } from "../../../utils/themeTokens";
import Pagination from "../../../components/Pagination";

export default function InventoryStockCount() {
  const [counts, setCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Active Audit Sheet Modal
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [activeCount, setActiveCount] = useState(null);
  const [countedQuantities, setCountedQuantities] = useState({});

  // Start Count Form
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [countDate, setCountDate] = useState(new Date().toISOString().split("T")[0]);
  const [countNotes, setCountNotes] = useState("");

  const { showSuccess, showError, confirm } = useNotification();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStockCounts();
      setCounts(data);
    } catch {
      showError("Failed to load stock count sessions");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStartCount = async (e) => {
    e.preventDefault();
    try {
      const res = await startStockCount({
        count_date: countDate,
        notes: countNotes || null,
      });
      showSuccess(`Audit session #${res.count_number} initialized as Draft`);
      setStartModalOpen(false);
      setCountNotes("");
      loadData();
      handleOpenAudit(res.id);
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to start stock count");
    }
  };

  const handleOpenAudit = async (countId) => {
    try {
      const detail = await getStockCount(countId);
      setActiveCount(detail);
      const initialCounts = {};
      detail.items.forEach((it) => {
        initialCounts[it.inventory_item_id] = String(it.counted_quantity);
      });
      setCountedQuantities(initialCounts);
      setAuditModalOpen(true);
    } catch {
      showError("Failed to fetch count session details");
    }
  };

  const handleSubmitCounts = async () => {
    try {
      const payload = Object.entries(countedQuantities).map(([itemId, qty]) => ({
        inventory_item_id: Number(itemId),
        counted_quantity: Number(qty) || 0,
      }));

      await submitStockCount(activeCount.id, payload);
      showSuccess("Count quantities submitted for manager review");
      const updated = await getStockCount(activeCount.id);
      setActiveCount(updated);
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to submit count");
    }
  };

  const handleApproveCount = async () => {
    const ok = await confirm({
      title: "Approve Stock Count Audit",
      message: `Approve audit #${activeCount.count_number}? This will post reconciling stock adjustment movements and update current stock for all items with variances.`,
      confirmText: "Approve & Post Variances",
      variant: "primary",
    });
    if (!ok) return;

    try {
      await approveStockCount(activeCount.id);
      showSuccess("Audit approved! Reconciling stock adjustments posted.");
      setAuditModalOpen(false);
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to approve audit");
    }
  };

  const handleCancelCount = async () => {
    const ok = await confirm({
      title: "Cancel Stock Count",
      message: "Are you sure you want to cancel this stock count session?",
      confirmText: "Cancel Audit",
      variant: "danger",
    });
    if (!ok) return;

    try {
      await cancelStockCount(activeCount.id);
      showSuccess("Audit session cancelled");
      setAuditModalOpen(false);
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to cancel audit");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-stone-700 dark:text-stone-300">
          Physical Inventory Audit Cycles
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStartModalOpen(true)}
            className={BUTTON_VARIANTS.primary}
          >
            <Plus size={16} />
            <span>Start Stocktake Session</span>
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

      {/* Counts List Table */}
      <div className={TABLE_STYLES.container}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
                <th className={TABLE_STYLES.th}>Audit Number</th>
                <th className={TABLE_STYLES.th}>Count Date</th>
                <th className={TABLE_STYLES.th}>Items Counted</th>
                <th className={TABLE_STYLES.th}>Net Variance Value</th>
                <th className={TABLE_STYLES.th}>Status</th>
                <th className={TABLE_STYLES.th}>Notes</th>
                <th className={`${TABLE_STYLES.th} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {counts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-sm text-stone-500">
                    {loading ? "Loading stock counts..." : "No physical audit sessions found."}
                  </td>
                </tr>
              ) : (
                counts.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((c) => (
                  <tr key={c.id} className={TABLE_STYLES.tr}>
                    <td className={TABLE_STYLES.td}>
                      <span className="font-bold font-mono text-stone-900 dark:text-stone-100">{c.count_number}</span>
                    </td>
                    <td className={TABLE_STYLES.td}>{c.count_date}</td>
                    <td className={TABLE_STYLES.td}>{c.items_count} items</td>
                    <td className={TABLE_STYLES.td}>
                      <span
                        className={`font-semibold ${
                          Number(c.total_variance_value) < 0
                            ? "text-rose-600"
                            : Number(c.total_variance_value) > 0
                            ? "text-emerald-600"
                            : "text-stone-500"
                        }`}
                      >
                        {Number(c.total_variance_value) > 0 ? `+₹${c.total_variance_value}` : `₹${c.total_variance_value}`}
                      </span>
                    </td>
                    <td className={TABLE_STYLES.td}>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          c.status === "Approved"
                            ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200"
                            : c.status === "Submitted"
                            ? "bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-200"
                            : c.status === "Cancelled"
                            ? "bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200"
                            : "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className={TABLE_STYLES.td}>
                      <span className="text-xs text-stone-500 truncate max-w-xs block">{c.notes || "—"}</span>
                    </td>
                    <td className={`${TABLE_STYLES.td} text-right`}>
                      <button
                        type="button"
                        onClick={() => handleOpenAudit(c.id)}
                        className={BUTTON_VARIANTS.secondary}
                      >
                        <Eye size={14} />
                        <span>{c.status === "Draft" ? "Enter Counts" : "View Sheet"}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={Math.ceil(counts.length / pageSize) || 1}
          onPageChange={setCurrentPage}
          totalRecords={counts.length}
          limit={pageSize}
        />
      </div>

      {/* START COUNT MODAL */}
      {startModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                Start Stocktake Session
              </h3>
              <button
                type="button"
                onClick={() => setStartModalOpen(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleStartCount} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                  Audit Date *
                </label>
                <input
                  type="date"
                  required
                  value={countDate}
                  onChange={(e) => setCountDate(e.target.value)}
                  className={INPUT_STYLES.base}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                  Audit Notes / Cycle Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. End of Month Inventory Verification"
                  value={countNotes}
                  onChange={(e) => setCountNotes(e.target.value)}
                  className={INPUT_STYLES.base}
                />
              </div>

              <p className="text-xs text-stone-500 leading-relaxed bg-amber-50/60 dark:bg-amber-950/20 p-3 rounded-lg border border-amber-200 dark:border-amber-900/40">
                Notice: Starting this session will capture a live snapshot of current system quantities across all active inventory items as the baseline.
              </p>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setStartModalOpen(false)}
                  className={BUTTON_VARIANTS.secondary}
                >
                  Cancel
                </button>
                <button type="submit" className={BUTTON_VARIANTS.primary}>
                  Create Audit Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AUDIT SHEET MODAL */}
      {auditModalOpen && activeCount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-4xl bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                    Stock Audit #{activeCount.count_number}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold ${
                      activeCount.status === "Approved"
                        ? "bg-emerald-100 text-emerald-800"
                        : activeCount.status === "Submitted"
                        ? "bg-sky-100 text-sky-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {activeCount.status}
                  </span>
                </div>
                <p className="text-xs text-stone-400">
                  Audit Date: {activeCount.count_date} | Total Items: {activeCount.items.length}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAuditModalOpen(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* Audit Items Table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-stone-100 dark:bg-stone-900 z-10">
                  <tr className="border-b border-stone-200 dark:border-stone-800">
                    <th className="p-2.5">Item Name</th>
                    <th className="p-2.5">System Quantity</th>
                    <th className="p-2.5 w-36">Counted Quantity</th>
                    <th className="p-2.5">Variance Qty</th>
                    <th className="p-2.5">Unit Cost</th>
                    <th className="p-2.5">Variance Value</th>
                  </tr>
                </thead>
                <tbody>
                  {activeCount.items.map((it) => {
                    const countedVal = countedQuantities[it.inventory_item_id] ?? String(it.counted_quantity);
                    const varQty = Number(countedVal) - Number(it.system_quantity);
                    const varVal = varQty * Number(it.unit_cost);

                    return (
                      <tr key={it.id} className="border-b border-stone-100 dark:border-stone-800">
                        <td className="p-2.5 font-semibold text-stone-900 dark:text-stone-100">
                          {it.inventory_item_name}
                        </td>
                        <td className="p-2.5">
                          {it.system_quantity} {it.inventory_item_unit}
                        </td>
                        <td className="p-2.5">
                          {activeCount.status === "Draft" ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step="0.01"
                                value={countedVal}
                                onChange={(e) =>
                                  setCountedQuantities({
                                    ...countedQuantities,
                                    [it.inventory_item_id]: e.target.value,
                                  })
                                }
                                className={`${INPUT_STYLES.base} py-1 text-xs`}
                              />
                              <span className="text-stone-400 text-[11px]">{it.inventory_item_unit}</span>
                            </div>
                          ) : (
                            <span className="font-bold">
                              {it.counted_quantity} {it.inventory_item_unit}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`font-bold ${
                              varQty < 0 ? "text-rose-600" : varQty > 0 ? "text-emerald-600" : "text-stone-400"
                            }`}
                          >
                            {varQty > 0 ? `+${varQty.toFixed(2)}` : varQty.toFixed(2)}
                          </span>
                        </td>
                        <td className="p-2.5">₹{Number(it.unit_cost).toFixed(2)}</td>
                        <td className="p-2.5">
                          <span
                            className={`font-semibold ${
                              varVal < 0 ? "text-rose-600" : varVal > 0 ? "text-emerald-600" : "text-stone-400"
                            }`}
                          >
                            {varVal > 0 ? `+₹${varVal.toFixed(2)}` : `₹${varVal.toFixed(2)}`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-stone-100 dark:border-stone-800 shrink-0">
              <div className="text-xs text-stone-500">
                {activeCount.status === "Draft" && "Enter counted numbers, then click 'Submit Counts' to finalize for approval."}
                {activeCount.status === "Submitted" && "Review counted numbers and variances before granting manager approval."}
                {activeCount.status === "Approved" && `Approved on ${new Date(activeCount.approved_at).toLocaleString()}`}
              </div>

              <div className="flex items-center gap-2">
                {activeCount.status === "Draft" && (
                  <>
                    <button
                      type="button"
                      onClick={handleCancelCount}
                      className={BUTTON_VARIANTS.danger}
                    >
                      Cancel Audit
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitCounts}
                      className={BUTTON_VARIANTS.primary}
                    >
                      Submit Counts
                    </button>
                  </>
                )}

                {activeCount.status === "Submitted" && (
                  <button
                    type="button"
                    onClick={handleApproveCount}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-xs transition"
                  >
                    <ShieldCheck size={16} />
                    <span>Approve & Post Variances</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setAuditModalOpen(false)}
                  className={BUTTON_VARIANTS.secondary}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
