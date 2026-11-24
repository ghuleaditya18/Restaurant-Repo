import { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus,
  Search,
  RefreshCw,
  Pencil,
  Power,
  Package,
  X,
  Trash2,
  Eye,
  AlertCircle,
  Archive,
} from "lucide-react";
import {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  archiveSupplier,
  checkSupplierEligibility,
  bulkActionSuppliers,
  getSupplierItems,
  addSupplierItem,
  removeSupplierItem,
  getInventoryItems,
} from "../../../services/inventoryService";
import { useNotification } from "../../../context/NotificationContext";
import { BUTTON_VARIANTS, INPUT_STYLES, TABLE_STYLES } from "../../../utils/themeTokens";
import Pagination from "../../../components/Pagination";

export default function InventorySuppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [catalogPage, setCatalogPage] = useState(1);
  const catalogPageSize = 10;

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const headerCheckboxRef = useRef(null);

  // Modals
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [viewingSupplier, setViewingSupplier] = useState(null);
  const [itemsModalOpen, setItemsModalOpen] = useState(false);
  const [activeSupplier, setActiveSupplier] = useState(null);
  const [supplierItemsList, setSupplierItemsList] = useState([]);

  // Forms
  const [formData, setFormData] = useState({
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    gstin: "",
    address: "",
  });

  const [linkItemForm, setLinkItemForm] = useState({
    inventory_item_id: "",
    supplier_sku: "",
    last_purchase_price: "",
    lead_time_days: "1",
    is_preferred: false,
  });

  const { showSuccess, showUpdate, showDelete, showArchive, showError, confirm } = useNotification();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sups, items] = await Promise.all([
        getSuppliers({ search: search || undefined }),
        getInventoryItems({ is_active: true }),
      ]);
      setSuppliers(sups);
      setInventoryItems(items);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to load suppliers";
      setError(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  }, [search, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const pagedSuppliers = suppliers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Update header checkbox indeterminate state
  useEffect(() => {
    if (!headerCheckboxRef.current) return;
    if (pagedSuppliers.length === 0) {
      headerCheckboxRef.current.checked = false;
      headerCheckboxRef.current.indeterminate = false;
      return;
    }
    const visibleSelectedCount = pagedSuppliers.filter((s) => selectedIds.has(s.id)).length;
    if (visibleSelectedCount === 0) {
      headerCheckboxRef.current.checked = false;
      headerCheckboxRef.current.indeterminate = false;
    } else if (visibleSelectedCount === pagedSuppliers.length) {
      headerCheckboxRef.current.checked = true;
      headerCheckboxRef.current.indeterminate = false;
    } else {
      headerCheckboxRef.current.checked = false;
      headerCheckboxRef.current.indeterminate = true;
    }
  }, [pagedSuppliers, selectedIds]);

  const handleSelectAll = () => {
    const visibleSelectedCount = pagedSuppliers.filter((s) => selectedIds.has(s.id)).length;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (visibleSelectedCount === pagedSuppliers.length) {
        pagedSuppliers.forEach((s) => next.delete(s.id));
      } else {
        pagedSuppliers.forEach((s) => next.add(s.id));
      }
      return next;
    });
  };

  const toggleSelectRow = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleOpenSupplierModal = (sup = null) => {
    if (sup) {
      setEditingSupplier(sup);
      setFormData({
        name: sup.name,
        contact_person: sup.contact_person || "",
        phone: sup.phone,
        email: sup.email || "",
        gstin: sup.gstin || "",
        address: sup.address || "",
      });
    } else {
      setEditingSupplier(null);
      setFormData({
        name: "",
        contact_person: "",
        phone: "",
        email: "",
        gstin: "",
        address: "",
      });
    }
    setSupplierModalOpen(true);
  };

  const handleSaveSupplier = async (e) => {
    e.preventDefault();
    try {
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, formData);
        showUpdate("Supplier updated successfully");
      } else {
        await createSupplier(formData);
        showSuccess("Supplier created successfully");
      }
      setSupplierModalOpen(false);
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to save supplier");
    }
  };

  const handleToggleStatus = async (sup) => {
    const action = sup.is_active ? "deactivate" : "activate";
    const ok = await confirm({
      title: `${action.toUpperCase()} Supplier`,
      message: `Are you sure you want to ${action} '${sup.name}'?`,
      confirmText: action === "deactivate" ? "Deactivate" : "Activate",
      variant: action === "deactivate" ? "warning" : "primary",
    });
    if (!ok) return;

    try {
      await updateSupplier(sup.id, { is_active: !sup.is_active });
      showUpdate(`Supplier ${action}d successfully`);
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to update supplier status");
    }
  };

  const handleDeleteOrArchive = async (sup) => {
    try {
      const elig = await checkSupplierEligibility(sup.id);
      if (elig.can_delete) {
        const ok = await confirm({
          title: "Delete Supplier Permanently",
          message: `Are you sure you want to permanently delete supplier '${sup.name}'? This supplier has no linked purchase orders or receipts.`,
          confirmText: "Delete Permanently",
          variant: "danger",
        });
        if (!ok) return;
        await deleteSupplier(sup.id);
        showDelete(`Supplier '${sup.name}' deleted permanently`);
        loadData();
      } else {
        const reasons = elig.reasons.join(". ");
        const ok = await confirm({
          title: "Archive Supplier",
          message: `Supplier '${sup.name}' cannot be permanently deleted because it is ${reasons}.\n\nWould you like to archive and deactivate this supplier instead? All financial and order records will be safely preserved.`,
          confirmText: "Archive Supplier",
          variant: "warning",
        });
        if (!ok) return;
        await archiveSupplier(sup.id, { reason: "Archived due to historical purchase references" });
        showArchive(`Supplier '${sup.name}' archived successfully`);
        loadData();
      }
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to process supplier deletion");
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({
      title: "Archive Selected Suppliers",
      message: `Are you sure you want to archive ${selectedIds.size} selected supplier(s)? Historical records will remain intact.`,
      confirmText: "Archive Selected",
      variant: "warning",
    });
    if (!ok) return;

    try {
      const res = await bulkActionSuppliers({
        supplier_ids: Array.from(selectedIds),
        action: "archive",
        reason: "Archived via bulk manager action",
      });
      showArchive(`Archived ${res.archived_count} supplier(s) successfully`);
      setSelectedIds(new Set());
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to archive suppliers");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({
      title: "Process Selected Suppliers",
      message: `Delete or archive ${selectedIds.size} selected supplier(s)? Suppliers with purchase history will be safely archived; suppliers with no history will be deleted.`,
      confirmText: "Proceed",
      variant: "danger",
    });
    if (!ok) return;

    try {
      const res = await bulkActionSuppliers({
        supplier_ids: Array.from(selectedIds),
        action: "delete",
      });
      showDelete(`Processed: ${res.deleted_count} deleted, ${res.archived_count} archived safely.`);
      setSelectedIds(new Set());
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to process bulk deletion");
    }
  };

  const handleOpenItemsModal = async (sup) => {
    setActiveSupplier(sup);
    setCatalogPage(1);
    setItemsModalOpen(true);
    try {
      const items = await getSupplierItems(sup.id);
      setSupplierItemsList(items);
    } catch {
      showError("Failed to fetch supplied items");
    }
  };

  const handleAddSupplierItem = async (e) => {
    e.preventDefault();
    if (!linkItemForm.inventory_item_id) return;
    try {
      await addSupplierItem(activeSupplier.id, {
        inventory_item_id: Number(linkItemForm.inventory_item_id),
        supplier_sku: linkItemForm.supplier_sku || undefined,
        last_purchase_price: linkItemForm.last_purchase_price ? Number(linkItemForm.last_purchase_price) : undefined,
        lead_time_days: Number(linkItemForm.lead_time_days || 1),
        is_preferred: Boolean(linkItemForm.is_preferred),
      });
      showSuccess("Item linked to supplier");
      setLinkItemForm({
        inventory_item_id: "",
        supplier_sku: "",
        last_purchase_price: "",
        lead_time_days: "1",
        is_preferred: false,
      });
      const updated = await getSupplierItems(activeSupplier.id);
      setSupplierItemsList(updated);
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to link item");
    }
  };

  const handleRemoveSupplierItem = async (linkId) => {
    try {
      await removeSupplierItem(activeSupplier.id, linkId);
      showSuccess("Item link removed");
      const updated = await getSupplierItems(activeSupplier.id);
      setSupplierItemsList(updated);
      loadData();
    } catch {
      showError("Failed to remove item link");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder="Search supplier name, contact or phone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className={`${INPUT_STYLES.base} pl-9`}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleOpenSupplierModal()}
            className={BUTTON_VARIANTS.primary}
          >
            <Plus size={16} />
            <span>Add Supplier</span>
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

      {/* Suppliers Table */}
      <div className={TABLE_STYLES.container}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
                <th className="w-12 px-4 py-3 text-center">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    aria-label="Select all suppliers on page"
                    onChange={handleSelectAll}
                    className="w-4.5 h-4.5 rounded border-stone-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                  />
                </th>
                <th className={`${TABLE_STYLES.th} min-w-[220px]`}>Supplier Name</th>
                <th className={`${TABLE_STYLES.th} min-w-[140px]`}>Contact Person</th>
                <th className={`${TABLE_STYLES.th} min-w-[160px]`}>Phone & Email</th>
                <th className={`${TABLE_STYLES.th} min-w-[140px]`}>GSTIN</th>
                <th className={`${TABLE_STYLES.th} min-w-[120px]`}>Items Supplied</th>
                <th className={`${TABLE_STYLES.th} min-w-[100px]`}>Status</th>
                <th className={`${TABLE_STYLES.th} text-right pr-6`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <AlertCircle size={36} className="text-red-500" />
                      <p className="text-sm font-bold text-stone-900 dark:text-stone-100">Unable to load suppliers.</p>
                      <p className="text-xs text-stone-500">Please check the connection or try again.</p>
                      <button
                        type="button"
                        onClick={loadData}
                        className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold shadow-sm transition"
                      >
                        <RefreshCw size={14} />
                        <span>Retry</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <Package size={36} className="text-stone-400" />
                      <p className="text-sm font-bold text-stone-900 dark:text-stone-100">No suppliers have been added yet.</p>
                      <button
                        type="button"
                        onClick={() => handleOpenSupplierModal()}
                        className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold shadow-sm transition"
                      >
                        <Plus size={14} />
                        <span>Add Supplier</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                pagedSuppliers.map((sup) => (
                  <tr key={sup.id} className={TABLE_STYLES.tr}>
                    <td className="w-12 px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(sup.id)}
                        onChange={() => toggleSelectRow(sup.id)}
                        aria-label={`Select ${sup.name}`}
                        className="w-4.5 h-4.5 rounded border-stone-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                      />
                    </td>
                    <td className={`${TABLE_STYLES.td} min-w-[220px]`}>
                      <div className="font-bold text-stone-900 dark:text-stone-100">{sup.name}</div>
                      {sup.address && <div className="text-xs text-stone-400 truncate max-w-xs">{sup.address}</div>}
                    </td>
                    <td className={TABLE_STYLES.td}>{sup.contact_person || "—"}</td>
                    <td className={TABLE_STYLES.td}>
                      <div className="text-stone-900 dark:text-stone-100 font-medium">{sup.phone}</div>
                      {sup.email && <div className="text-xs text-stone-400">{sup.email}</div>}
                    </td>
                    <td className={TABLE_STYLES.td}>{sup.gstin || "—"}</td>
                    <td className={TABLE_STYLES.td}>
                      <button
                        type="button"
                        onClick={() => handleOpenItemsModal(sup)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                        title="Manage supplied items"
                      >
                        <Package size={14} />
                        <span>{sup.supplied_items_count} items</span>
                      </button>
                    </td>
                    <td className={TABLE_STYLES.td}>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          sup.is_archived
                            ? "bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300"
                            : sup.is_active
                            ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200"
                            : "bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200"
                        }`}
                      >
                        {sup.is_archived ? "Archived" : sup.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className={`${TABLE_STYLES.td} text-right pr-6`}>
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewingSupplier(sup)}
                          className="p-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition"
                          title="View Supplier Details"
                          aria-label={`View details of ${sup.name}`}
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenItemsModal(sup)}
                          className="p-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition"
                          title="Manage Catalog Items"
                          aria-label={`Manage catalog of ${sup.name}`}
                        >
                          <Package size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenSupplierModal(sup)}
                          className="p-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition"
                          title="Edit Supplier"
                          aria-label={`Edit ${sup.name}`}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(sup)}
                          className={`p-1.5 rounded-lg transition ${
                            sup.is_active
                              ? "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                              : "text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
                          }`}
                          title={sup.is_active ? "Deactivate" : "Activate"}
                          aria-label={`${sup.is_active ? "Deactivate" : "Activate"} ${sup.name}`}
                        >
                          <Power size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteOrArchive(sup)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                          title="Delete / Archive Supplier"
                          aria-label={`Delete or archive ${sup.name}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={Math.ceil(suppliers.length / pageSize) || 1}
          onPageChange={setCurrentPage}
          totalRecords={suppliers.length}
          limit={pageSize}
        />
      </div>

      {/* FLOATING BULK ACTIONS BAR */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-stone-900 dark:bg-stone-800 text-white px-5 py-3 rounded-2xl shadow-2xl border border-stone-700 animate-in fade-in slide-in-from-bottom-2">
          <span className="text-sm font-semibold whitespace-nowrap">
            {selectedIds.size} supplier{selectedIds.size === 1 ? "" : "s"} selected
          </span>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-stone-400 hover:text-white px-2 py-1 rounded transition"
          >
            Clear Selection
          </button>
          <div className="h-4 w-px bg-stone-700" />
          <button
            type="button"
            onClick={handleBulkArchive}
            className="inline-flex items-center gap-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-lg transition shadow-xs"
          >
            <Archive size={14} />
            <span>Archive Selected</span>
          </button>
          <button
            type="button"
            onClick={handleBulkDelete}
            className="inline-flex items-center gap-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded-lg transition shadow-xs"
          >
            <Trash2 size={14} />
            <span>Delete Selected</span>
          </button>
        </div>
      )}

      {/* VIEW SUPPLIER MODAL */}
      {viewingSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">{viewingSupplier.name}</h3>
                <span className="text-xs text-stone-500">Supplier Profile & Records</span>
              </div>
              <button
                type="button"
                onClick={() => setViewingSupplier(null)}
                className="text-stone-400 hover:text-stone-600 rounded-lg p-1"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-stone-50 dark:bg-stone-900/50 rounded-xl border border-stone-100 dark:border-stone-800">
                <span className="text-xs text-stone-400 block font-medium">Contact Person</span>
                <span className="font-semibold text-stone-900 dark:text-stone-100">{viewingSupplier.contact_person || "—"}</span>
              </div>
              <div className="p-3 bg-stone-50 dark:bg-stone-900/50 rounded-xl border border-stone-100 dark:border-stone-800">
                <span className="text-xs text-stone-400 block font-medium">Phone Number</span>
                <span className="font-semibold text-stone-900 dark:text-stone-100">{viewingSupplier.phone}</span>
              </div>
              <div className="p-3 bg-stone-50 dark:bg-stone-900/50 rounded-xl border border-stone-100 dark:border-stone-800">
                <span className="text-xs text-stone-400 block font-medium">Email Address</span>
                <span className="font-semibold text-stone-900 dark:text-stone-100">{viewingSupplier.email || "—"}</span>
              </div>
              <div className="p-3 bg-stone-50 dark:bg-stone-900/50 rounded-xl border border-stone-100 dark:border-stone-800">
                <span className="text-xs text-stone-400 block font-medium">GSTIN</span>
                <span className="font-semibold font-mono text-stone-900 dark:text-stone-100">{viewingSupplier.gstin || "—"}</span>
              </div>
              <div className="col-span-2 p-3 bg-stone-50 dark:bg-stone-900/50 rounded-xl border border-stone-100 dark:border-stone-800">
                <span className="text-xs text-stone-400 block font-medium">Full Address</span>
                <span className="font-medium text-stone-800 dark:text-stone-200">{viewingSupplier.address || "—"}</span>
              </div>
              <div className="p-3 bg-stone-50 dark:bg-stone-900/50 rounded-xl border border-stone-100 dark:border-stone-800">
                <span className="text-xs text-stone-400 block font-medium">Catalog Items</span>
                <span className="font-bold text-amber-600">{viewingSupplier.supplied_items_count} items</span>
              </div>
              <div className="p-3 bg-stone-50 dark:bg-stone-900/50 rounded-xl border border-stone-100 dark:border-stone-800">
                <span className="text-xs text-stone-400 block font-medium">Purchase Orders</span>
                <span className="font-bold text-stone-900 dark:text-stone-100">{viewingSupplier.total_orders_count} orders</span>
              </div>
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingSupplier(null)}
                className={BUTTON_VARIANTS.secondary}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT SUPPLIER MODAL */}
      {supplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                {editingSupplier ? "Edit Supplier" : "Add New Supplier"}
              </h3>
              <button
                type="button"
                onClick={() => setSupplierModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 rounded-lg p-1"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 block mb-1">
                  Supplier / Company Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Green Valley Farm Supplies"
                  className={INPUT_STYLES.base}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 block mb-1">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                    placeholder="e.g. Rajesh Patil"
                    className={INPUT_STYLES.base}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 block mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+91 98230 11223"
                    className={INPUT_STYLES.base}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 block mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="orders@supplier.in"
                    className={INPUT_STYLES.base}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 block mb-1">
                    GSTIN
                  </label>
                  <input
                    type="text"
                    value={formData.gstin}
                    onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                    placeholder="27AABCG1234F1Z8"
                    className={INPUT_STYLES.base}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 block mb-1">
                  Address
                </label>
                <textarea
                  rows={2}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Market yard, shop number, city, pin code..."
                  className={INPUT_STYLES.base}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setSupplierModalOpen(false)}
                  className={BUTTON_VARIANTS.secondary}
                >
                  Cancel
                </button>
                <button type="submit" className={BUTTON_VARIANTS.primary}>
                  {editingSupplier ? "Save Changes" : "Create Supplier"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUPPLIER ITEMS CATALOG MODAL */}
      {itemsModalOpen && activeSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                  {activeSupplier.name} — Catalog Items
                </h3>
                <span className="text-xs text-stone-500">
                  Manage inventory raw materials supplied by this vendor
                </span>
              </div>
              <button
                type="button"
                onClick={() => setItemsModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 rounded-lg p-1"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Link New Item Form */}
            <form onSubmit={handleAddSupplierItem} className="p-4 bg-stone-50 dark:bg-stone-900/50 rounded-xl border border-stone-200 dark:border-stone-800 space-y-3">
              <span className="text-xs font-bold text-stone-900 dark:text-stone-100 block">
                Link Item to this Supplier
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-stone-600 dark:text-stone-400 block mb-1">
                    Select Inventory Item *
                  </label>
                  <select
                    required
                    value={linkItemForm.inventory_item_id}
                    onChange={(e) => setLinkItemForm({ ...linkItemForm, inventory_item_id: e.target.value })}
                    className={INPUT_STYLES.base}
                  >
                    <option value="">-- Choose Raw Material Item --</option>
                    {inventoryItems.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name} ({it.base_unit}) — {it.sku || "No SKU"}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-stone-600 dark:text-stone-400 block mb-1">
                    Supplier SKU / Code
                  </label>
                  <input
                    type="text"
                    value={linkItemForm.supplier_sku}
                    onChange={(e) => setLinkItemForm({ ...linkItemForm, supplier_sku: e.target.value })}
                    placeholder="e.g. GV-TOM-01"
                    className={INPUT_STYLES.base}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-stone-600 dark:text-stone-400 block mb-1">
                    Contracted / Last Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={linkItemForm.last_purchase_price}
                    onChange={(e) => setLinkItemForm({ ...linkItemForm, last_purchase_price: e.target.value })}
                    placeholder="0.00"
                    className={INPUT_STYLES.base}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button type="submit" className={BUTTON_VARIANTS.primary}>
                  <Plus size={14} />
                  <span>Link to Catalog</span>
                </button>
              </div>
            </form>

            {/* Linked Items Table */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-stone-900 dark:text-stone-100 block">
                Currently Supplied Items ({supplierItemsList.length})
              </span>
              <div className={TABLE_STYLES.container}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
                        <th className={TABLE_STYLES.th}>Raw Material</th>
                        <th className={TABLE_STYLES.th}>Supplier SKU</th>
                        <th className={TABLE_STYLES.th}>Last Price</th>
                        <th className={`${TABLE_STYLES.th} text-right`}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplierItemsList.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-stone-500">
                            No items linked yet. Add an item above to create catalog.
                          </td>
                        </tr>
                      ) : (
                        supplierItemsList
                          .slice((catalogPage - 1) * catalogPageSize, catalogPage * catalogPageSize)
                          .map((item) => (
                            <tr key={item.id} className={TABLE_STYLES.tr}>
                              <td className={TABLE_STYLES.td}>
                                <span className="font-bold text-stone-900 dark:text-stone-100">
                                  {item.inventory_item_name}
                                </span>{" "}
                                <span className="text-stone-400">({item.inventory_item_unit})</span>
                              </td>
                              <td className={TABLE_STYLES.td}>{item.supplier_sku || "—"}</td>
                              <td className={TABLE_STYLES.td}>
                                {item.last_purchase_price != null ? `₹${Number(item.last_purchase_price).toFixed(2)}` : "—"}
                              </td>
                              <td className={`${TABLE_STYLES.td} text-right`}>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSupplierItem(item.id)}
                                  className="p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition"
                                  title="Unlink Item"
                                  aria-label={`Unlink ${item.inventory_item_name}`}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
                {supplierItemsList.length > catalogPageSize && (
                  <Pagination
                    currentPage={catalogPage}
                    totalPages={Math.ceil(supplierItemsList.length / catalogPageSize) || 1}
                    onPageChange={setCatalogPage}
                    totalRecords={supplierItemsList.length}
                    limit={catalogPageSize}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
