import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Search,
  RefreshCw,
  Pencil,
  Power,
  Package,
  X,
  Trash2,
} from "lucide-react";
import {
  getSuppliers,
  createSupplier,
  updateSupplier,
  getSupplierItems,
  addSupplierItem,
  removeSupplierItem,
  getInventoryItems,
} from "../../../services/inventoryService";
import { useNotification } from "../../../context/NotificationContext";
import { BUTTON_VARIANTS, INPUT_STYLES, TABLE_STYLES } from "../../../utils/themeTokens";

export default function InventorySuppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Modals
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
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

  const { showSuccess, showError, confirm } = useNotification();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sups, items] = await Promise.all([
        getSuppliers({ search: search || undefined }),
        getInventoryItems({ is_active: true }),
      ]);
      setSuppliers(sups);
      setInventoryItems(items);
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  }, [search, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
        showSuccess("Supplier updated successfully");
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
      showSuccess(`Supplier ${action}d successfully`);
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to update supplier status");
    }
  };

  const handleOpenItemsModal = async (sup) => {
    setActiveSupplier(sup);
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
        supplier_sku: linkItemForm.supplier_sku || null,
        last_purchase_price: linkItemForm.last_purchase_price ? Number(linkItemForm.last_purchase_price) : null,
        lead_time_days: Number(linkItemForm.lead_time_days) || 1,
        is_preferred: linkItemForm.is_preferred,
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
            onChange={(e) => setSearch(e.target.value)}
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
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
                <th className={TABLE_STYLES.th}>Supplier Name</th>
                <th className={TABLE_STYLES.th}>Contact Person</th>
                <th className={TABLE_STYLES.th}>Phone & Email</th>
                <th className={TABLE_STYLES.th}>GSTIN</th>
                <th className={TABLE_STYLES.th}>Items Supplied</th>
                <th className={TABLE_STYLES.th}>Status</th>
                <th className={`${TABLE_STYLES.th} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-sm text-stone-500">
                    {loading ? "Loading suppliers..." : "No suppliers found."}
                  </td>
                </tr>
              ) : (
                suppliers.map((sup) => (
                  <tr key={sup.id} className={TABLE_STYLES.tr}>
                    <td className={TABLE_STYLES.td}>
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
                        className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                      >
                        <Package size={14} />
                        <span>{sup.supplied_items_count} items</span>
                      </button>
                    </td>
                    <td className={TABLE_STYLES.td}>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          sup.is_active
                            ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200"
                            : "bg-stone-200 dark:bg-stone-800 text-stone-800 dark:text-stone-200"
                        }`}
                      >
                        {sup.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className={`${TABLE_STYLES.td} text-right`}>
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenItemsModal(sup)}
                          className="p-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition"
                          title="Manage Supplied Items"
                        >
                          <Package size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenSupplierModal(sup)}
                          className="p-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition"
                          title="Edit Supplier"
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
                        >
                          <Power size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE / EDIT SUPPLIER MODAL */}
      {supplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white dark:bg-[#1C1917] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                {editingSupplier ? "Edit Supplier" : "Add New Supplier"}
              </h3>
              <button
                type="button"
                onClick={() => setSupplierModalOpen(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                  Supplier / Company Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={INPUT_STYLES.base}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                    className={INPUT_STYLES.base}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className={INPUT_STYLES.base}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={INPUT_STYLES.base}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                    GSTIN Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 27AAAAA0000A1Z5"
                    value={formData.gstin}
                    onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                    className={INPUT_STYLES.base}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                  Business Address
                </label>
                <textarea
                  rows={2}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
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

      {/* SUPPLIED ITEMS MODAL */}
      {itemsModalOpen && activeSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl bg-white dark:bg-[#1C1917] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                  Supplied Items: {activeSupplier.name}
                </h3>
                <p className="text-xs text-stone-400">Map inventory ingredients provided by this vendor</p>
              </div>
              <button
                type="button"
                onClick={() => setItemsModalOpen(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* Add Link Form */}
            <form onSubmit={handleAddSupplierItem} className="p-3 bg-stone-50 dark:bg-stone-900/50 rounded-xl space-y-2">
              <p className="text-xs font-bold uppercase text-stone-600 dark:text-stone-400">Link New Item</p>
              <div className="grid grid-cols-2 gap-2">
                <select
                  required
                  value={linkItemForm.inventory_item_id}
                  onChange={(e) => setLinkItemForm({ ...linkItemForm, inventory_item_id: e.target.value })}
                  className={INPUT_STYLES.select}
                >
                  <option value="">Select Inventory Item</option>
                  {inventoryItems.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name} ({inv.base_unit})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Last Price (₹)"
                  value={linkItemForm.last_purchase_price}
                  onChange={(e) => setLinkItemForm({ ...linkItemForm, last_purchase_price: e.target.value })}
                  className={INPUT_STYLES.base}
                />
              </div>
              <div className="flex items-center justify-between pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-stone-600 dark:text-stone-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={linkItemForm.is_preferred}
                    onChange={(e) => setLinkItemForm({ ...linkItemForm, is_preferred: e.target.checked })}
                    className="rounded text-amber-500"
                  />
                  <span>Mark as Preferred Supplier for this item</span>
                </label>
                <button type="submit" className={BUTTON_VARIANTS.primary}>
                  Link Item
                </button>
              </div>
            </form>

            {/* Existing Links List */}
            <div className="space-y-2 divide-y divide-stone-100 dark:divide-stone-800">
              {supplierItemsList.length === 0 ? (
                <p className="p-4 text-center text-xs text-stone-400">No items linked yet.</p>
              ) : (
                supplierItemsList.map((l) => (
                  <div key={l.id} className="pt-2 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-sm text-stone-900 dark:text-stone-100">
                        {l.inventory_item_name}
                      </span>
                      {l.is_preferred && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200">
                          Preferred
                        </span>
                      )}
                      <div className="text-xs text-stone-400">
                        {l.last_purchase_price ? `Last price: ₹${l.last_purchase_price} / ${l.inventory_item_unit}` : "No price recorded"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveSupplierItem(l.id)}
                      className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                      title="Unlink Item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
