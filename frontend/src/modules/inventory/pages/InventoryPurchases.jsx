import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  Plus,
  RefreshCw,
  Truck,
  X,
  Upload,
  Trash2,
  Eye,
  Pencil,
  RotateCcw,
  Ban,
  AlertTriangle,
} from "lucide-react";
import {
  getPurchaseOrders,
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  updatePOStatus,
  receiveGoods,
  getGoodsReceipts,
  uploadGrnBill,
  updateGoodsReceipt,
  reverseGoodsReceipt,
  getSuppliers,
  getInventoryItems,
} from "../../../services/inventoryService";
import { useNotification } from "../../../context/NotificationContext";
import { BUTTON_VARIANTS, INPUT_STYLES, TABLE_STYLES } from "../../../utils/themeTokens";
import Pagination from "../../../components/Pagination";
import BulkSelectionBar from "../../../components/BulkSelectionBar";
import useBulkSelection from "../../../hooks/useBulkSelection";

export default function InventoryPurchases() {
  const [activeTab, setActiveTab] = useState("pos"); // 'pos' | 'grns'
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const { selectedIds, toggle, toggleMany, clear } = useBulkSelection();
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pagination states
  const [poPage, setPoPage] = useState(1);
  const [grnPage, setGrnPage] = useState(1);
  const pageSize = 10;

  // Modals
  const [createPoOpen, setCreatePoOpen] = useState(false);
  const [editingPo, setEditingPo] = useState(null);
  const [viewingPo, setViewingPo] = useState(null);
  const [viewingGrn, setViewingGrn] = useState(null);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [selectedPoForReceive, setSelectedPoForReceive] = useState(null);
  const [uploadBillModalOpen, setUploadBillModalOpen] = useState(false);
  const [selectedGrnForUpload, setSelectedGrnForUpload] = useState(null);

  // GRN Edit & Reversal states
  const [editingGrn, setEditingGrn] = useState(null);
  const [editGrnForm, setEditGrnForm] = useState({
    supplier_bill_number: "",
    bill_date: "",
    notes: "",
  });
  const [reversingGrn, setReversingGrn] = useState(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reversingLoading, setReversingLoading] = useState(false);

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

  const { showSuccess, showUpdate, showDelete, showError, confirm } = useNotification();

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

  // Tab switch handler resets page
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === "pos") setPoPage(1);
    else setGrnPage(1);
  };

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

  const openCreatePo = () => {
    setEditingPo(null);
    setPoForm({
      supplier_id: suppliers[0]?.id ? String(suppliers[0].id) : "",
      order_date: new Date().toISOString().split("T")[0],
      expected_delivery_date: "",
      tax_amount: "0",
      notes: "",
      items: [
        {
          inventory_item_id: inventoryItems[0]?.id ? String(inventoryItems[0].id) : "",
          ordered_quantity: "1",
          unit_price: "0",
        },
      ],
    });
    setCreatePoOpen(true);
  };

  const openEditPo = (po) => {
    setEditingPo(po);
    setPoForm({
      supplier_id: String(po.supplier_id),
      order_date: po.order_date || new Date().toISOString().split("T")[0],
      expected_delivery_date: po.expected_delivery_date || "",
      tax_amount: String(po.tax_amount || 0),
      notes: po.notes || "",
      items: po.items.map((it) => ({
        inventory_item_id: String(it.inventory_item_id),
        ordered_quantity: String(it.ordered_quantity),
        unit_price: String(it.unit_price),
      })),
    });
    setCreatePoOpen(true);
  };

  const handleSavePo = async (e) => {
    e.preventDefault();
    if (!poForm.supplier_id) {
      showError("Please select a supplier");
      return;
    }
    if (poForm.items.length === 0) {
      showError("Purchase order must have at least one line item");
      return;
    }

    const payload = {
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
    };

    try {
      if (editingPo) {
        await updatePurchaseOrder(editingPo.id, payload);
        showUpdate(`Purchase Order #${editingPo.po_number} updated successfully`);
      } else {
        await createPurchaseOrder(payload);
        showSuccess("Purchase order created as Draft");
      }
      setCreatePoOpen(false);
      setEditingPo(null);
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to save purchase order");
    }
  };

  const handleDeletePo = async (po) => {
    const ok = await confirm({
      title: `Delete Purchase Order #${po.po_number}`,
      message: `Are you sure you want to delete Draft Purchase Order #${po.po_number}? This cannot be undone.`,
      confirmText: "Delete PO",
      variant: "danger",
    });
    if (!ok) return;

    try {
      await deletePurchaseOrder(po.id);
      showDelete(`Purchase Order #${po.po_number} deleted successfully`);
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to delete purchase order");
    }
  };

  const handleDeleteSelectedPos = async () => {
    const targets = purchaseOrders.filter((po) => selectedIds.has(po.id) && po.status === "Draft");
    if (!targets.length) return;
    const ok = await confirm({
      title: "Delete Selected Draft Purchase Orders",
      message: `Permanently delete ${targets.length} selected Draft purchase order(s)? Only Draft orders without goods receipts can be deleted.`,
      confirmText: "Delete Selected",
      variant: "danger",
    });
    if (!ok) return;
    const results = await Promise.allSettled(targets.map((po) => deletePurchaseOrder(po.id)));
    clear();
    if (results.some((result) => result.status === "fulfilled")) showDelete(`${results.filter((result) => result.status === "fulfilled").length} purchase order(s) deleted.`, "Purchase Orders Deleted");
    if (results.some((result) => result.status === "rejected")) showError(`${results.filter((result) => result.status === "rejected").length} purchase order(s) could not be deleted.`, "Some Deletions Failed");
    await loadData();
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
    if (!receiveForm.supplier_bill_number || !receiveForm.supplier_bill_number.trim()) {
      showError("Supplier Bill Number / Invoice Number is mandatory.");
      return;
    }

    try {
      await receiveGoods(selectedPoForReceive.id, {
        received_date: receiveForm.received_date,
        supplier_bill_number: receiveForm.supplier_bill_number.trim(),
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

  const openEditGrn = (grn) => {
    setEditingGrn(grn);
    setEditGrnForm({
      supplier_bill_number: grn.supplier_bill_number || "",
      bill_date: grn.bill_date || "",
      notes: grn.notes || "",
    });
  };

  const handleSaveGrnEdit = async (e) => {
    e.preventDefault();
    if (!editingGrn) return;
    try {
      await updateGoodsReceipt(editingGrn.id, editGrnForm);
      showUpdate(`Updated GRN #${editingGrn.grn_number} metadata.`);
      setEditingGrn(null);
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to update Goods Receipt");
    }
  };

  const openReverseGrn = (grn) => {
    setReversingGrn(grn);
    setReverseReason("");
  };

  const handleConfirmReverseGrn = async (e) => {
    e.preventDefault();
    if (!reversingGrn) return;
    if (!reverseReason.trim()) {
      showError("A mandatory reversal reason must be provided.");
      return;
    }
    setReversingLoading(true);
    try {
      await reverseGoodsReceipt(reversingGrn.id, reverseReason.trim());
      showSuccess(`GRN #${reversingGrn.grn_number} has been reversed and stock adjusted.`);
      setReversingGrn(null);
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to reverse Goods Receipt");
    } finally {
      setReversingLoading(false);
    }
  };

  // Pagination slicing
  const poTotalPages = Math.ceil(purchaseOrders.length / pageSize) || 1;
  const paginatedPos = purchaseOrders.slice((poPage - 1) * pageSize, poPage * pageSize);

  const grnTotalPages = Math.ceil(goodsReceipts.length / pageSize) || 1;
  const paginatedGrns = goodsReceipts.slice((grnPage - 1) * pageSize, grnPage * pageSize);

  return (
    <div className="space-y-4">
      {/* Tab Switcher & Action Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 dark:bg-stone-900 rounded-xl max-w-sm">
          <button
            type="button"
            onClick={() => handleTabChange("pos")}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition ${
              activeTab === "pos"
                ? "bg-white dark:bg-[#101722] text-stone-900 dark:text-stone-100 shadow-xs"
                : "text-stone-500 hover:text-stone-900 dark:hover:text-stone-200"
            }`}
          >
            Purchase Orders ({purchaseOrders.length})
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("grns")}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition ${
              activeTab === "grns"
                ? "bg-white dark:bg-[#101722] text-stone-900 dark:text-stone-100 shadow-xs"
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
              onClick={openCreatePo}
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
        <>
        <BulkSelectionBar count={selectedIds.size} onDelete={handleDeleteSelectedPos} onClear={clear} />
        <div className={TABLE_STYLES.container}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
                  <th className={`${TABLE_STYLES.th} w-10 text-center`}><input type="checkbox" aria-label="Select deletable draft purchase orders on this page" checked={paginatedPos.filter((po) => po.status === "Draft").length > 0 && paginatedPos.filter((po) => po.status === "Draft").every((po) => selectedIds.has(po.id))} onChange={() => toggleMany(paginatedPos.filter((po) => po.status === "Draft").map((po) => po.id))} className="h-4 w-4 accent-amber-500" /></th>
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
                {paginatedPos.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-sm text-stone-500">
                      {loading ? "Loading purchase orders..." : "No purchase orders found."}
                    </td>
                  </tr>
                ) : (
                  paginatedPos.map((po) => (
                    <tr key={po.id} className={TABLE_STYLES.tr}>
                      <td className={`${TABLE_STYLES.td} w-10 text-center`}><input type="checkbox" aria-label={`Select draft purchase order ${po.po_number}`} checked={selectedIds.has(po.id)} disabled={po.status !== "Draft"} onChange={() => toggle(po.id)} className="h-4 w-4 accent-amber-500 disabled:opacity-30" /></td>
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
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => setViewingPo(po)}
                            className="p-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded transition"
                            title="View PO Details"
                          >
                            <Eye size={15} />
                          </button>

                          {po.status === "Draft" && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditPo(po)}
                                className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded transition"
                                title="Edit Draft PO"
                                aria-label="Edit Draft PO"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleTransitionStatus(po, "Ordered")}
                                className="px-2 py-1 rounded text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition"
                              >
                                Send to Vendor
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePo(po)}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition"
                                title="Delete Draft PO"
                                aria-label="Delete Draft PO"
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
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

                          {po.status === "Ordered" && (
                            <button
                              type="button"
                              onClick={() => handleTransitionStatus(po, "Cancelled")}
                              className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition"
                              title="Cancel PO"
                              aria-label="Cancel PO"
                            >
                              <Ban size={15} />
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
          <Pagination
            currentPage={poPage}
            totalPages={poTotalPages}
            onPageChange={setPoPage}
            totalRecords={purchaseOrders.length}
            limit={pageSize}
          />
        </div>
        </>
      )}

      {/* GOODS RECEIPTS TAB */}
      {activeTab === "grns" && (
        <div className={TABLE_STYLES.container}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
                  <th className={TABLE_STYLES.th}>GRN Number</th>
                  <th className={TABLE_STYLES.th}>PO Reference</th>
                  <th className={TABLE_STYLES.th}>Supplier</th>
                  <th className={TABLE_STYLES.th}>Bill Number</th>
                  <th className={TABLE_STYLES.th}>Received Date</th>
                  <th className={TABLE_STYLES.th}>Received Amount</th>
                  <th className={TABLE_STYLES.th}>Bill Attachment</th>
                  <th className={TABLE_STYLES.th}>Status</th>
                  <th className={`${TABLE_STYLES.th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedGrns.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-sm text-stone-500">
                      No goods receipt notes recorded yet.
                    </td>
                  </tr>
                ) : (
                  paginatedGrns.map((grn) => (
                    <tr key={grn.id} className={TABLE_STYLES.tr}>
                      <td className={TABLE_STYLES.td}>
                        <div className="font-bold font-mono text-stone-900 dark:text-stone-100">
                          {grn.grn_number}
                        </div>
                      </td>
                      <td className={TABLE_STYLES.td}>{grn.po_number}</td>
                      <td className={TABLE_STYLES.td}>{grn.supplier_name}</td>
                      <td className={TABLE_STYLES.td}>
                        <span className="font-mono font-medium text-stone-800 dark:text-stone-200">
                          {grn.supplier_bill_number || "—"}
                        </span>
                      </td>
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
                      <td className={TABLE_STYLES.td}>
                        {grn.is_reversed ? (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200"
                            title={`Reversed: ${grn.reversal_reason || "Reversed"}`}
                          >
                            Reversed
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200">
                            Received
                          </span>
                        )}
                      </td>
                      <td className={`${TABLE_STYLES.td} text-right`}>
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => setViewingGrn(grn)}
                            className="p-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded transition"
                            title="View GRN Details"
                            aria-label="View GRN Details"
                          >
                            <Eye size={15} />
                          </button>
                          {!grn.is_reversed && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditGrn(grn)}
                                className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded transition"
                                title="Edit Bill / Notes"
                                aria-label="Edit Bill or Notes"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => openReverseGrn(grn)}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition"
                                title="Reverse Goods Receipt"
                                aria-label="Reverse Goods Receipt"
                              >
                                <RotateCcw size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={grnPage}
            totalPages={grnTotalPages}
            onPageChange={setGrnPage}
            totalRecords={goodsReceipts.length}
            limit={pageSize}
          />
        </div>
      )}

      {/* CREATE / EDIT PURCHASE ORDER MODAL */}
      {createPoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setCreatePoOpen(false);
            setEditingPo(null);
          }
        }}>
          <div className="w-full max-w-2xl bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                {editingPo ? `Edit Purchase Order #${editingPo.po_number}` : "New Purchase Order"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setCreatePoOpen(false);
                  setEditingPo(null);
                }}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePo} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                    Expected Delivery Date
                  </label>
                  <input
                    type="date"
                    value={poForm.expected_delivery_date}
                    onChange={(e) => setPoForm({ ...poForm, expected_delivery_date: e.target.value })}
                    className={INPUT_STYLES.base}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                    Tax Amount (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={poForm.tax_amount}
                    onChange={(e) => setPoForm({ ...poForm, tax_amount: e.target.value })}
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
                  <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 sm:p-0 bg-stone-50 sm:bg-transparent rounded-lg">
                    <select
                      required
                      value={item.inventory_item_id}
                      onChange={(e) => updatePoItem(idx, "inventory_item_id", e.target.value)}
                      className={`${INPUT_STYLES.select} flex-1`}
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
                      className={`${INPUT_STYLES.base} w-full sm:w-24`}
                    />

                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      placeholder="₹ Unit Price"
                      value={item.unit_price}
                      onChange={(e) => updatePoItem(idx, "unit_price", e.target.value)}
                      className={`${INPUT_STYLES.base} w-full sm:w-28`}
                    />

                    {poForm.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePoItem(idx)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded self-end sm:self-center"
                        title="Remove item"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={poForm.notes}
                  onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })}
                  placeholder="Special instructions or vendor terms..."
                  className={INPUT_STYLES.base}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => {
                    setCreatePoOpen(false);
                    setEditingPo(null);
                  }}
                  className={BUTTON_VARIANTS.secondary}
                >
                  Cancel
                </button>
                <button type="submit" className={BUTTON_VARIANTS.primary}>
                  {editingPo ? "Save Changes" : "Create Draft PO"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW PURCHASE ORDER MODAL */}
      {viewingPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={(e) => e.target === e.currentTarget && setViewingPo(null)}>
          <div className="w-full max-w-2xl bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                  Purchase Order #{viewingPo.po_number}
                </h3>
                <p className="text-xs text-stone-500">Supplier: {viewingPo.supplier_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewingPo(null)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-stone-50 dark:bg-stone-900/50 rounded-xl text-xs">
              <div>
                <span className="text-stone-500 block">Status:</span>
                <span className="font-semibold">{viewingPo.status}</span>
              </div>
              <div>
                <span className="text-stone-500 block">Order Date:</span>
                <span className="font-semibold">{viewingPo.order_date}</span>
              </div>
              <div>
                <span className="text-stone-500 block">Expected:</span>
                <span className="font-semibold">{viewingPo.expected_delivery_date || "—"}</span>
              </div>
              <div>
                <span className="text-stone-500 block">Total Amount:</span>
                <span className="font-bold text-stone-900 dark:text-stone-100">
                  ₹{Number(viewingPo.total_amount).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wide text-stone-600 dark:text-stone-400">
                Order Line Items
              </h4>
              <div className="overflow-x-auto border border-stone-200 dark:border-stone-800 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 dark:bg-stone-900/60 border-b border-stone-200 dark:border-stone-800">
                    <tr>
                      <th className="p-2.5 font-semibold text-stone-600 dark:text-stone-400">Ingredient</th>
                      <th className="p-2.5 font-semibold text-stone-600 dark:text-stone-400">Ordered</th>
                      <th className="p-2.5 font-semibold text-stone-600 dark:text-stone-400">Received</th>
                      <th className="p-2.5 font-semibold text-stone-600 dark:text-stone-400">Unit Cost</th>
                      <th className="p-2.5 font-semibold text-stone-600 dark:text-stone-400 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingPo.items.map((item) => (
                      <tr key={item.id} className="border-b border-stone-100 dark:border-stone-800/60">
                        <td className="p-2.5 font-medium">{item.inventory_item_name}</td>
                        <td className="p-2.5">{item.ordered_quantity} {item.inventory_item_unit}</td>
                        <td className="p-2.5">{item.received_quantity} {item.inventory_item_unit}</td>
                        <td className="p-2.5">₹{Number(item.unit_price).toFixed(2)}</td>
                        <td className="p-2.5 text-right font-medium">₹{Number(item.line_total).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {viewingPo.notes && (
              <div className="text-xs p-3 bg-stone-50 dark:bg-stone-900/40 rounded-xl">
                <span className="font-semibold block text-stone-600 dark:text-stone-400 mb-1">Notes:</span>
                <p className="text-stone-700 dark:text-stone-300">{viewingPo.notes}</p>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setViewingPo(null)}
                className={BUTTON_VARIANTS.secondary}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW GOODS RECEIPT MODAL */}
      {viewingGrn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={(e) => e.target === e.currentTarget && setViewingGrn(null)}>
          <div className="w-full max-w-2xl bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                  Goods Receipt #{viewingGrn.grn_number}
                </h3>
                <p className="text-xs text-stone-500">
                  PO: {viewingGrn.po_number} | Supplier: {viewingGrn.supplier_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingGrn(null)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-stone-50 dark:bg-stone-900/50 rounded-xl text-xs">
              <div>
                <span className="text-stone-500 block">Supplier Bill #:</span>
                <span className="font-mono font-bold text-stone-900 dark:text-stone-100">
                  {viewingGrn.supplier_bill_number || "—"}
                </span>
              </div>
              <div>
                <span className="text-stone-500 block">Received Date:</span>
                <span className="font-semibold">{viewingGrn.received_date}</span>
              </div>
              <div>
                <span className="text-stone-500 block">Bill Date:</span>
                <span className="font-semibold">{viewingGrn.bill_date || "—"}</span>
              </div>
              <div>
                <span className="text-stone-500 block">Total Received:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  ₹{Number(viewingGrn.total_received_amount).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wide text-stone-600 dark:text-stone-400">
                Received Line Items
              </h4>
              <div className="overflow-x-auto border border-stone-200 dark:border-stone-800 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 dark:bg-stone-900/60 border-b border-stone-200 dark:border-stone-800">
                    <tr>
                      <th className="p-2.5 font-semibold text-stone-600 dark:text-stone-400">Ingredient</th>
                      <th className="p-2.5 font-semibold text-stone-600 dark:text-stone-400">Received Qty</th>
                      <th className="p-2.5 font-semibold text-stone-600 dark:text-stone-400">Actual Unit Cost</th>
                      <th className="p-2.5 font-semibold text-stone-600 dark:text-stone-400 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingGrn.items?.map((item) => (
                      <tr key={item.id} className="border-b border-stone-100 dark:border-stone-800/60">
                        <td className="p-2.5 font-medium">{item.inventory_item_name}</td>
                        <td className="p-2.5">{item.received_quantity} {item.inventory_item_unit}</td>
                        <td className="p-2.5">₹{Number(item.unit_cost).toFixed(2)}</td>
                        <td className="p-2.5 text-right font-medium">₹{Number(item.line_total).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {viewingGrn.notes && (
              <div className="text-xs p-3 bg-stone-50 dark:bg-stone-900/40 rounded-xl">
                <span className="font-semibold block text-stone-600 dark:text-stone-400 mb-1">Notes:</span>
                <p className="text-stone-700 dark:text-stone-300">{viewingGrn.notes}</p>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setViewingGrn(null)}
                className={BUTTON_VARIANTS.secondary}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECEIVE GOODS MODAL */}
      {receiveModalOpen && selectedPoForReceive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={(e) => e.target === e.currentTarget && setReceiveModalOpen(false)}>
          <div className="w-full max-w-2xl bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    Supplier Bill Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. INV-10029"
                    value={receiveForm.supplier_bill_number}
                    onChange={(e) => setReceiveForm({ ...receiveForm, supplier_bill_number: e.target.value })}
                    className={INPUT_STYLES.base}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                    Bill Date
                  </label>
                  <input
                    type="date"
                    value={receiveForm.bill_date}
                    onChange={(e) => setReceiveForm({ ...receiveForm, bill_date: e.target.value })}
                    className={INPUT_STYLES.base}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                    Receiving Notes
                  </label>
                  <input
                    type="text"
                    placeholder="Batch numbers, condition, etc."
                    value={receiveForm.notes}
                    onChange={(e) => setReceiveForm({ ...receiveForm, notes: e.target.value })}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={(e) => e.target === e.currentTarget && setUploadBillModalOpen(false)}>
          <div className="w-full max-w-md bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
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

      {/* EDIT GOODS RECEIPT MODAL */}
      {editingGrn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={(e) => e.target === e.currentTarget && setEditingGrn(null)}>
          <div className="w-full max-w-md bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                Edit GRN #{editingGrn.grn_number}
              </h3>
              <button
                type="button"
                onClick={() => setEditingGrn(null)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveGrnEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                  Supplier Bill Number *
                </label>
                <input
                  type="text"
                  required
                  value={editGrnForm.supplier_bill_number}
                  onChange={(e) =>
                    setEditGrnForm({ ...editGrnForm, supplier_bill_number: e.target.value })
                  }
                  className={INPUT_STYLES.base}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                  Bill Date
                </label>
                <input
                  type="date"
                  value={editGrnForm.bill_date}
                  onChange={(e) => setEditGrnForm({ ...editGrnForm, bill_date: e.target.value })}
                  className={INPUT_STYLES.base}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                  Notes
                </label>
                <textarea
                  rows={3}
                  value={editGrnForm.notes}
                  onChange={(e) => setEditGrnForm({ ...editGrnForm, notes: e.target.value })}
                  placeholder="Additional notes about this goods receipt"
                  className={INPUT_STYLES.base}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setEditingGrn(null)}
                  className={BUTTON_VARIANTS.secondary}
                >
                  Cancel
                </button>
                <button type="submit" className={BUTTON_VARIANTS.primary}>
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REVERSE GOODS RECEIPT MODAL */}
      {reversingGrn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={(e) => e.target === e.currentTarget && !reversingLoading && setReversingGrn(null)}>
          <div className="w-full max-w-md bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <h3 className="text-lg font-bold text-red-600 dark:text-red-400">
                Reverse GRN #{reversingGrn.grn_number}
              </h3>
              <button
                type="button"
                onClick={() => setReversingGrn(null)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmReverseGrn} className="space-y-4">
              <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/30 p-3 text-xs text-red-800 dark:text-red-200 space-y-1">
                <div className="flex items-center gap-2 font-bold">
                  <AlertTriangle size={16} className="text-red-600" />
                  <span>Controlled GRN Reversal</span>
                </div>
                <p>
                  Reversing this goods receipt will deduct the received quantities from current stock and record compensating ledger movements.
                </p>
                <p className="font-semibold">
                  Total Amount: ₹{Number(reversingGrn.total_received_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                  Mandatory Reversal Reason *
                </label>
                <textarea
                  required
                  rows={3}
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  placeholder="Explain why this GRN is being reversed (e.g. wrong batch, damaged goods returned to vendor, entry error)..."
                  className={INPUT_STYLES.base}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setReversingGrn(null)}
                  disabled={reversingLoading}
                  className={BUTTON_VARIANTS.secondary}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reversingLoading || !reverseReason.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition disabled:opacity-50"
                >
                  {reversingLoading ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <RotateCcw size={14} />
                  )}
                  <span>{reversingLoading ? "Reversing..." : "Confirm Reversal"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
