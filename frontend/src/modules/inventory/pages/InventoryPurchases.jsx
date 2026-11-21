import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  Plus,
  RefreshCw,
  Truck,
  X,
  Upload,
  Trash2,
} from "lucide-react";
import {
  getPurchaseOrders,
  createPurchaseOrder,
  updatePOStatus,
  receiveGoods,
  getGoodsReceipts,
  uploadGrnBill,
  getSuppliers,
  getInventoryItems,
} from "../../../services/inventoryService";
import { useNotification } from "../../../context/NotificationContext";
import { BUTTON_VARIANTS, INPUT_STYLES, TABLE_STYLES } from "../../../utils/themeTokens";

export default function InventoryPurchases() {
  const [activeTab, setActiveTab] = useState("pos"); // 'pos' | 'grns'
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [createPoOpen, setCreatePoOpen] = useState(false);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [selectedPoForReceive, setSelectedPoForReceive] = useState(null);
  const [uploadBillModalOpen, setUploadBillModalOpen] = useState(false);
  const [selectedGrnForUpload, setSelectedGrnForUpload] = useState(null);

  // Form states
  const [poForm, setPoForm] = useState({
    supplier_id: "",
    order_date: new Date().toISOString().split("T")[0],
    expected_delivery_date: "",
    tax_amount: "0",
    notes: "",
    items: [{ inventory_item_id: "", ordered_quantity: "1", unit_price: "0" }],
  });

  const [receiveForm, setReceiveForm] = useState({
    received_date: new Date().toISOString().split("T")[0],
    supplier_bill_number: "",
    bill_date: new Date().toISOString().split("T")[0],
    notes: "",
    items: [],
  });

  const [billFile, setBillFile] = useState(null);

  const { showSuccess, showError, confirm } = useNotification();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pos, grns, sups, items] = await Promise.all([
        getPurchaseOrders(),
        getGoodsReceipts(),
        getSuppliers({ is_active: true }),
        getInventoryItems({ is_active: true }),
      ]);
      setPurchaseOrders(pos);
      setGoodsReceipts(grns);
      setSuppliers(sups);
      setInventoryItems(items);
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to load procurement data");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // PO Line Items management
  const addPoItem = () => {
    setPoForm((prev) => ({
      ...prev,
      items: [...prev.items, { inventory_item_id: "", ordered_quantity: "1", unit_price: "0" }],
    }));
  };

  const removePoItem = (idx) => {
    setPoForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx),
    }));
  };

  const updatePoItem = (idx, field, value) => {
    setPoForm((prev) => {
      const updated = [...prev.items];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, items: updated };
    });
  };

  const handleCreatePo = async (e) => {
    e.preventDefault();
    if (!poForm.supplier_id) {
      showError("Please select a supplier");
      return;
    }
    try {
      await createPurchaseOrder({
        supplier_id: Number(poForm.supplier_id),
        order_date: poForm.order_date,
        expected_delivery_date: poForm.expected_delivery_date || null,
        tax_amount: Number(poForm.tax_amount) || 0,
        notes: poForm.notes,
        items: poForm.items.map((it) => ({
          inventory_item_id: Number(it.inventory_item_id),
          ordered_quantity: Number(it.ordered_quantity),
          unit_price: Number(it.unit_price),
        })),
      });
      showSuccess("Purchase order created as Draft");
      setCreatePoOpen(false);
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to create purchase order");
    }
  };

  const handleTransitionStatus = async (po, newStatus) => {
    const ok = await confirm({
      title: `Update Purchase Order #${po.po_number}`,
      message: `Change status to '${newStatus}'?`,
      confirmText: `Confirm ${newStatus}`,
      variant: newStatus === "Cancelled" ? "danger" : "primary",
    });
    if (!ok) return;

    try {
      await updatePOStatus(po.id, newStatus);
      showSuccess(`PO status updated to ${newStatus}`);
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to update PO status");
    }
  };

  const openReceiveModal = (po) => {
    setSelectedPoForReceive(po);
    setReceiveForm({
      received_date: new Date().toISOString().split("T")[0],
      supplier_bill_number: "",
      bill_date: new Date().toISOString().split("T")[0],
      notes: "",
      items: po.items.map((item) => ({
        po_item_id: item.id,
        name: item.inventory_item_name,
        unit: item.inventory_item_unit,
        remaining_quantity: item.remaining_quantity,
        received_quantity: item.remaining_quantity, // default to remaining
        unit_cost: item.unit_price,
      })),
    });
    setReceiveModalOpen(true);
  };

  const handleReceiveGoods = async (e) => {
    e.preventDefault();
    try {
      await receiveGoods(selectedPoForReceive.id, {
        received_date: receiveForm.received_date,
        supplier_bill_number: receiveForm.supplier_bill_number || null,
        bill_date: receiveForm.bill_date || null,
        notes: receiveForm.notes,
        items: receiveForm.items
          .filter((it) => Number(it.received_quantity) > 0)
          .map((it) => ({
            po_item_id: it.po_item_id,
            received_quantity: Number(it.received_quantity),
            unit_cost: Number(it.unit_cost),
          })),
      });
      showSuccess("Goods receipt recorded and inventory stock updated");
      setReceiveModalOpen(false);
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to process goods receipt");
    }
  };

  const handleUploadBill = async (e) => {
    e.preventDefault();
    if (!billFile) {
      showError("Please select a file to upload");
      return;
    }
    try {
      await uploadGrnBill(selectedGrnForUpload.id, billFile);
      showSuccess("Supplier bill file uploaded successfully");
      setUploadBillModalOpen(false);
      setBillFile(null);
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to upload bill file");
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Switcher & Action Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 dark:bg-stone-900 rounded-xl max-w-sm">
          <button
            type="button"
            onClick={() => setActiveTab("pos")}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition ${
              activeTab === "pos"
                ? "bg-white dark:bg-[#1C1917] text-stone-900 dark:text-stone-100 shadow-xs"
                : "text-stone-500 hover:text-stone-900 dark:hover:text-stone-200"
            }`}
          >
            Purchase Orders ({purchaseOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("grns")}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition ${
              activeTab === "grns"
                ? "bg-white dark:bg-[#1C1917] text-stone-900 dark:text-stone-100 shadow-xs"
                : "text-stone-500 hover:text-stone-900 dark:hover:text-stone-200"
            }`}
          >
            Goods Receipts ({goodsReceipts.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "pos" && (
            <button
              type="button"
              onClick={() => {
                setPoForm({
                  supplier_id: suppliers[0]?.id ? String(suppliers[0].id) : "",
                  order_date: new Date().toISOString().split("T")[0],
                  expected_delivery_date: "",
                  tax_amount: "0",
                  notes: "",
                  items: [{ inventory_item_id: inventoryItems[0]?.id ? String(inventoryItems[0].id) : "", ordered_quantity: "1", unit_price: "0" }],
                });
                setCreatePoOpen(true);
              }}
              className={BUTTON_VARIANTS.primary}
            >
              <Plus size={16} />
              <span>Create Purchase Order</span>
            </button>
          )}
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

      {/* PURCHASE ORDERS TAB */}
      {activeTab === "pos" && (
        <div className={TABLE_STYLES.container}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
                  <th className={TABLE_STYLES.th}>PO Number</th>
                  <th className={TABLE_STYLES.th}>Supplier</th>
                  <th className={TABLE_STYLES.th}>Order Date</th>
                  <th className={TABLE_STYLES.th}>Items Count</th>
                  <th className={TABLE_STYLES.th}>Total Value</th>
                  <th className={TABLE_STYLES.th}>Status</th>
                  <th className={`${TABLE_STYLES.th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-sm text-stone-500">
                      {loading ? "Loading purchase orders..." : "No purchase orders found."}
                    </td>
                  </tr>
                ) : (
                  purchaseOrders.map((po) => (
                    <tr key={po.id} className={TABLE_STYLES.tr}>
                      <td className={TABLE_STYLES.td}>
                        <div className="font-bold text-stone-900 dark:text-stone-100 font-mono">
                          {po.po_number}
                        </div>
                      </td>
                      <td className={TABLE_STYLES.td}>{po.supplier_name}</td>
                      <td className={TABLE_STYLES.td}>{po.order_date}</td>
                      <td className={TABLE_STYLES.td}>{po.items.length} items</td>
                      <td className={TABLE_STYLES.td}>
                        ₹{Number(po.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className={TABLE_STYLES.td}>
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            po.status === "Received"
                              ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200"
                              : po.status === "Partially Received"
                              ? "bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-200"
                              : po.status === "Ordered"
                              ? "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200"
                              : po.status === "Cancelled"
                              ? "bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200"
                              : "bg-stone-200 dark:bg-stone-800 text-stone-800 dark:text-stone-200"
                          }`}
                        >
                          {po.status}
                        </span>
                      </td>
                      <td className={`${TABLE_STYLES.td} text-right`}>
                        <div className="inline-flex items-center gap-1.5">
                          {po.status === "Draft" && (
                            <button
                              type="button"
                              onClick={() => handleTransitionStatus(po, "Ordered")}
                              className="px-2 py-1 rounded text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition"
                            >
                              Send to Vendor
                            </button>
                          )}
                          {(po.status === "Ordered" || po.status === "Partially Received") && (
                            <button
                              type="button"
                              onClick={() => openReceiveModal(po)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition"
                            >
                              <Truck size={13} />
                              <span>Receive</span>
                            </button>
                          )}
                          {po.status === "Draft" && (
                            <button
                              type="button"
                              onClick={() => handleTransitionStatus(po, "Cancelled")}
                              className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition"
                              title="Cancel PO"
                            >
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* GOODS RECEIPTS TAB */}
      {activeTab === "grns" && (
        <div className={TABLE_STYLES.container}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
                  <th className={TABLE_STYLES.th}>GRN Number</th>
                  <th className={TABLE_STYLES.th}>PO Reference</th>
                  <th className={TABLE_STYLES.th}>Supplier</th>
                  <th className={TABLE_STYLES.th}>Bill Number</th>
                  <th className={TABLE_STYLES.th}>Received Date</th>
                  <th className={TABLE_STYLES.th}>Received Amount</th>
                  <th className={TABLE_STYLES.th}>Bill Image</th>
                </tr>
              </thead>
              <tbody>
                {goodsReceipts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-sm text-stone-500">
                      No goods receipt notes recorded yet.
                    </td>
                  </tr>
                ) : (
                  goodsReceipts.map((grn) => (
                    <tr key={grn.id} className={TABLE_STYLES.tr}>
                      <td className={TABLE_STYLES.td}>
                        <div className="font-bold font-mono text-stone-900 dark:text-stone-100">
                          {grn.grn_number}
                        </div>
                      </td>
                      <td className={TABLE_STYLES.td}>{grn.po_number}</td>
                      <td className={TABLE_STYLES.td}>{grn.supplier_name}</td>
                      <td className={TABLE_STYLES.td}>{grn.supplier_bill_number || "—"}</td>
                      <td className={TABLE_STYLES.td}>{grn.received_date}</td>
                      <td className={TABLE_STYLES.td}>
                        ₹{Number(grn.total_received_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className={TABLE_STYLES.td}>
                        {grn.bill_image_url ? (
                          <a
                            href={grn.bill_image_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-semibold hover:underline"
                          >
                            <FileText size={14} />
                            <span>View Bill</span>
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedGrnForUpload(grn);
                              setUploadBillModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                          >
                            <Upload size={14} />
                            <span>Upload Bill</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE PURCHASE ORDER MODAL */}
      {createPoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-[#1C1917] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                New Purchase Order
              </h3>
              <button
                type="button"
                onClick={() => setCreatePoOpen(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreatePo} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                    Supplier *
                  </label>
                  <select
                    required
                    value={poForm.supplier_id}
                    onChange={(e) => setPoForm({ ...poForm, supplier_id: e.target.value })}
                    className={INPUT_STYLES.select}
                  >
                    <option value="">Select Supplier</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                    Order Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={poForm.order_date}
                    onChange={(e) => setPoForm({ ...poForm, order_date: e.target.value })}
                    className={INPUT_STYLES.base}
                  />
                </div>
              </div>

              {/* Items Section */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-stone-600 dark:text-stone-400">
                    Order Items
                  </h4>
                  <button
                    type="button"
                    onClick={addPoItem}
                    className="text-xs text-amber-600 dark:text-amber-400 font-bold hover:underline"
                  >
                    + Add Line Item
                  </button>
                </div>

                {poForm.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      required
                      value={item.inventory_item_id}
                      onChange={(e) => updatePoItem(idx, "inventory_item_id", e.target.value)}
                      className={`${INPUT_STYLES.select} flex-2`}
                    >
                      <option value="">Select Ingredient</option>
                      {inventoryItems.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.name} ({inv.base_unit})
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      placeholder="Qty"
                      value={item.ordered_quantity}
                      onChange={(e) => updatePoItem(idx, "ordered_quantity", e.target.value)}
                      className={`${INPUT_STYLES.base} w-24`}
                    />

                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      placeholder="₹ Unit Price"
                      value={item.unit_price}
                      onChange={(e) => updatePoItem(idx, "unit_price", e.target.value)}
                      className={`${INPUT_STYLES.base} w-28`}
                    />

                    {poForm.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePoItem(idx)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setCreatePoOpen(false)}
                  className={BUTTON_VARIANTS.secondary}
                >
                  Cancel
                </button>
                <button type="submit" className={BUTTON_VARIANTS.primary}>
                  Create Draft PO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECEIVE GOODS MODAL */}
      {receiveModalOpen && selectedPoForReceive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-[#1C1917] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                  Goods Receipt (GRN): PO #{selectedPoForReceive.po_number}
                </h3>
                <p className="text-xs text-stone-400">Supplier: {selectedPoForReceive.supplier_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setReceiveModalOpen(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleReceiveGoods} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                    Receipt Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={receiveForm.received_date}
                    onChange={(e) => setReceiveForm({ ...receiveForm, received_date: e.target.value })}
                    className={INPUT_STYLES.base}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                    Supplier Bill Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. INV-10029"
                    value={receiveForm.supplier_bill_number}
                    onChange={(e) => setReceiveForm({ ...receiveForm, supplier_bill_number: e.target.value })}
                    className={INPUT_STYLES.base}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold uppercase text-stone-600 dark:text-stone-400">
                  Received Quantities & Unit Costs
                </p>
                {receiveForm.items.map((it, idx) => (
                  <div key={it.po_item_id} className="p-3 bg-stone-50 dark:bg-stone-900/50 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-stone-900 dark:text-stone-100">
                      <span>{it.name}</span>
                      <span className="text-stone-400">Remaining to receive: {it.remaining_quantity} {it.unit}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-stone-500">Received Quantity ({it.unit})</label>
                        <input
                          type="number"
                          step="0.01"
                          max={it.remaining_quantity}
                          value={it.received_quantity}
                          onChange={(e) => {
                            const updated = [...receiveForm.items];
                            updated[idx].received_quantity = e.target.value;
                            setReceiveForm({ ...receiveForm, items: updated });
                          }}
                          className={INPUT_STYLES.base}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-stone-500">Actual Unit Cost (₹)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={it.unit_cost}
                          onChange={(e) => {
                            const updated = [...receiveForm.items];
                            updated[idx].unit_cost = e.target.value;
                            setReceiveForm({ ...receiveForm, items: updated });
                          }}
                          className={INPUT_STYLES.base}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setReceiveModalOpen(false)}
                  className={BUTTON_VARIANTS.secondary}
                >
                  Cancel
                </button>
                <button type="submit" className={BUTTON_VARIANTS.primary}>
                  Post Goods Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UPLOAD BILL MODAL */}
      {uploadBillModalOpen && selectedGrnForUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#1C1917] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                Upload Bill for #{selectedGrnForUpload.grn_number}
              </h3>
              <button
                type="button"
                onClick={() => setUploadBillModalOpen(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUploadBill} className="space-y-4">
              <input
                type="file"
                accept="image/*,application/pdf"
                required
                onChange={(e) => setBillFile(e.target.files[0])}
                className={INPUT_STYLES.base}
              />
              <p className="text-xs text-stone-400">Accepted formats: JPG, PNG, WebP or PDF (Max 5MB)</p>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUploadBillModalOpen(false)}
                  className={BUTTON_VARIANTS.secondary}
                >
                  Cancel
                </button>
                <button type="submit" className={BUTTON_VARIANTS.primary}>
                  Upload File
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
