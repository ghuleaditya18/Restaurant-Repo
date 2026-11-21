import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Search,
  RefreshCw,
  FolderPlus,
  Pencil,
  Power,
  History,
  AlertTriangle,
  CheckCircle2,
  X,
} from "lucide-react";
import {
  getInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  updateItemStatus,
  getItemMovements,
  getCategories,
  createCategory,
  updateCategory,
} from "../../../services/inventoryService";
import { useNotification } from "../../../context/NotificationContext";
import { BUTTON_VARIANTS, INPUT_STYLES, TABLE_STYLES } from "../../../utils/themeTokens";

const UNITS = ["g", "kg", "ml", "L", "pcs", "pack"];

export default function InventoryStock() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // Modals
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [movementsModalOpen, setMovementsModalOpen] = useState(false);
  const [activeItemMovements, setActiveItemMovements] = useState(null);
  const [movementsList, setMovementsList] = useState([]);

  // Item Form
  const [formData, setFormData] = useState({
    category_id: "",
    name: "",
    sku: "",
    base_unit: "g",
    reorder_level: "0",
    opening_stock: "0",
    opening_unit_cost: "0",
  });

  // Category Form
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [editingCategory, setEditingCategory] = useState(null);

  const { showSuccess, showError, confirm } = useNotification();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsData, catsData] = await Promise.all([
        getInventoryItems({
          category_id: selectedCategory || undefined,
          low_stock: lowStockOnly || undefined,
          search: search || undefined,
        }),
        getCategories(),
      ]);
      setItems(itemsData);
      setCategories(catsData);
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to load inventory data");
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, lowStockOnly, search, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenItemModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        category_id: String(item.category_id),
        name: item.name,
        sku: item.sku || "",
        base_unit: item.base_unit,
        reorder_level: String(item.reorder_level),
        opening_stock: "0",
        opening_unit_cost: "0",
      });
    } else {
      setEditingItem(null);
      setFormData({
        category_id: categories[0]?.id ? String(categories[0].id) : "",
        name: "",
        sku: "",
        base_unit: "g",
        reorder_level: "0",
        opening_stock: "0",
        opening_unit_cost: "0",
      });
    }
    setItemModalOpen(true);
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await updateInventoryItem(editingItem.id, {
          category_id: Number(formData.category_id),
          name: formData.name,
          sku: formData.sku || null,
          base_unit: formData.base_unit,
          reorder_level: Number(formData.reorder_level),
        });
        showSuccess("Item updated successfully");
      } else {
        await createInventoryItem({
          category_id: Number(formData.category_id),
          name: formData.name,
          sku: formData.sku || null,
          base_unit: formData.base_unit,
          reorder_level: Number(formData.reorder_level),
          opening_stock: Number(formData.opening_stock) || 0,
          opening_unit_cost: Number(formData.opening_unit_cost) || 0,
        });
        showSuccess("Inventory item created successfully");
      }
      setItemModalOpen(false);
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to save inventory item");
    }
  };

  const handleToggleStatus = async (item) => {
    const action = item.is_active ? "deactivate" : "activate";
    const ok = await confirm({
      title: `${action.toUpperCase()} Item`,
      message: `Are you sure you want to ${action} '${item.name}'?`,
      confirmText: action === "deactivate" ? "Deactivate" : "Activate",
      variant: action === "deactivate" ? "warning" : "primary",
    });
    if (!ok) return;

    try {
      await updateItemStatus(item.id, !item.is_active);
      showSuccess(`Item ${action}d successfully`);
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to update item status");
    }
  };

  const handleOpenMovements = async (item) => {
    setActiveItemMovements(item);
    setMovementsModalOpen(true);
    try {
      const data = await getItemMovements(item.id);
      setMovementsList(data);
    } catch {
      showError("Failed to fetch item movements");
    }
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, {
          name: newCatName,
          description: newCatDesc,
        });
        showSuccess("Category updated successfully");
      } else {
        await createCategory({
          name: newCatName,
          description: newCatDesc,
        });
        showSuccess("Category created successfully");
      }
      setNewCatName("");
      setNewCatDesc("");
      setEditingCategory(null);
      const updatedCats = await getCategories();
      setCategories(updatedCats);
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to save category");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-lg">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder="Search ingredient or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${INPUT_STYLES.base} pl-9`}
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className={`${INPUT_STYLES.select} w-44`}
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setLowStockOnly(!lowStockOnly)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition ${
              lowStockOnly
                ? "bg-amber-500 text-white border-amber-600"
                : "border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300"
            }`}
          >
            <AlertTriangle size={14} />
            <span className="hidden sm:inline">Low Stock</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCategoryModalOpen(true)}
            className={BUTTON_VARIANTS.secondary}
          >
            <FolderPlus size={16} />
            <span>Categories ({categories.length})</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenItemModal()}
            className={BUTTON_VARIANTS.primary}
          >
            <Plus size={16} />
            <span>Add Item</span>
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

      {/* Items Table */}
      <div className={TABLE_STYLES.container}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
                <th className={TABLE_STYLES.th}>Item & SKU</th>
                <th className={TABLE_STYLES.th}>Category</th>
                <th className={TABLE_STYLES.th}>Current Stock</th>
                <th className={TABLE_STYLES.th}>Reorder Level</th>
                <th className={TABLE_STYLES.th}>Avg Unit Cost</th>
                <th className={TABLE_STYLES.th}>Valuation</th>
                <th className={TABLE_STYLES.th}>Status</th>
                <th className={`${TABLE_STYLES.th} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-sm text-stone-500">
                    {loading ? "Loading inventory items..." : "No inventory items found."}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className={TABLE_STYLES.tr}>
                    <td className={TABLE_STYLES.td}>
                      <div className="font-semibold text-stone-900 dark:text-stone-100">{item.name}</div>
                      {item.sku && <div className="text-xs text-stone-400 font-mono">{item.sku}</div>}
                    </td>
                    <td className={TABLE_STYLES.td}>{item.category_name}</td>
                    <td className={TABLE_STYLES.td}>
                      <span className="font-bold text-stone-900 dark:text-stone-100">
                        {Number(item.current_stock).toLocaleString()}
                      </span>{" "}
                      <span className="text-xs text-stone-500">{item.base_unit}</span>
                    </td>
                    <td className={TABLE_STYLES.td}>
                      {Number(item.reorder_level).toLocaleString()} {item.base_unit}
                    </td>
                    <td className={TABLE_STYLES.td}>₹{Number(item.average_cost).toFixed(2)}</td>
                    <td className={TABLE_STYLES.td}>₹{Number(item.total_valuation).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className={TABLE_STYLES.td}>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          item.stock_status === "OUT_OF_STOCK"
                            ? "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300"
                            : item.stock_status === "LOW_STOCK"
                            ? "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200"
                            : "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200"
                        }`}
                      >
                        {item.stock_status === "OUT_OF_STOCK" && <AlertTriangle size={12} />}
                        {item.stock_status === "LOW_STOCK" && <AlertTriangle size={12} />}
                        {item.stock_status === "IN_STOCK" && <CheckCircle2 size={12} />}
                        {item.stock_status.replace("_", " ")}
                      </span>
                    </td>
                    <td className={`${TABLE_STYLES.td} text-right`}>
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenMovements(item)}
                          className="p-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition"
                          title="View Ledger Movements"
                        >
                          <History size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenItemModal(item)}
                          className="p-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition"
                          title="Edit Item"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(item)}
                          className={`p-1.5 rounded-lg transition ${
                            item.is_active
                              ? "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                              : "text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
                          }`}
                          title={item.is_active ? "Deactivate" : "Activate"}
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

      {/* CREATE / EDIT ITEM MODAL */}
      {itemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white dark:bg-[#1C1917] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                {editingItem ? "Edit Inventory Item" : "New Inventory Item"}
              </h3>
              <button
                type="button"
                onClick={() => setItemModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                  Item Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Fresh Paneer, Basmati Rice"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={INPUT_STYLES.base}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                    Category *
                  </label>
                  <select
                    required
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    className={INPUT_STYLES.select}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                    Base Unit *
                  </label>
                  <select
                    value={formData.base_unit}
                    onChange={(e) => setFormData({ ...formData, base_unit: e.target.value })}
                    className={INPUT_STYLES.select}
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                    SKU (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. SKU-PAN-01"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className={INPUT_STYLES.base}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                    Reorder Alert Level
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.reorder_level}
                    onChange={(e) => setFormData({ ...formData, reorder_level: e.target.value })}
                    className={INPUT_STYLES.base}
                  />
                </div>
              </div>

              {!editingItem && (
                <div className="p-3.5 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl space-y-3">
                  <p className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wide">
                    Initial Opening Stock (Optional)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-stone-600 dark:text-stone-400 mb-1">
                        Quantity ({formData.base_unit})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.opening_stock}
                        onChange={(e) => setFormData({ ...formData, opening_stock: e.target.value })}
                        className={INPUT_STYLES.base}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-stone-600 dark:text-stone-400 mb-1">
                        Unit Cost (₹ / {formData.base_unit})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.opening_unit_cost}
                        onChange={(e) => setFormData({ ...formData, opening_unit_cost: e.target.value })}
                        className={INPUT_STYLES.base}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setItemModalOpen(false)}
                  className={BUTTON_VARIANTS.secondary}
                >
                  Cancel
                </button>
                <button type="submit" className={BUTTON_VARIANTS.primary}>
                  {editingItem ? "Save Changes" : "Create Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CATEGORIES MANAGEMENT MODAL */}
      {categoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white dark:bg-[#1C1917] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                Manage Inventory Categories
              </h3>
              <button
                type="button"
                onClick={() => setCategoryModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="flex gap-2">
              <input
                type="text"
                required
                placeholder="New category name..."
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className={INPUT_STYLES.base}
              />
              <button type="submit" className={BUTTON_VARIANTS.primary}>
                {editingCategory ? "Update" : "Add"}
              </button>
            </form>

            <div className="max-h-60 overflow-y-auto space-y-2 divide-y divide-stone-100 dark:divide-stone-800">
              {categories.map((c) => (
                <div key={c.id} className="pt-2 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-sm text-stone-800 dark:text-stone-200">
                      {c.name}
                    </span>
                    <span className="ml-2 text-xs text-stone-400">({c.items_count} items)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCategory(c);
                      setNewCatName(c.name);
                      setNewCatDesc(c.description || "");
                    }}
                    className="text-xs text-amber-600 hover:underline"
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MOVEMENTS AUDIT MODAL */}
      {movementsModalOpen && activeItemMovements && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-[#1C1917] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                  Stock Ledger: {activeItemMovements.name}
                </h3>
                <p className="text-xs text-stone-400">
                  Current Stock: {activeItemMovements.current_stock} {activeItemMovements.base_unit}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMovementsModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
                    <th className="p-2">Date</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Quantity</th>
                    <th className="p-2">Unit Cost</th>
                    <th className="p-2">Balance After</th>
                    <th className="p-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {movementsList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-stone-500">
                        No movement history recorded.
                      </td>
                    </tr>
                  ) : (
                    movementsList.map((m) => (
                      <tr key={m.id} className="border-b border-stone-100 dark:border-stone-800">
                        <td className="p-2 text-stone-500">{new Date(m.created_at).toLocaleString()}</td>
                        <td className="p-2 font-semibold">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] ${
                              m.quantity > 0
                                ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200"
                                : "bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200"
                            }`}
                          >
                            {m.movement_type}
                          </span>
                        </td>
                        <td className="p-2 font-bold">
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity} {activeItemMovements.base_unit}
                        </td>
                        <td className="p-2">₹{Number(m.unit_cost).toFixed(2)}</td>
                        <td className="p-2">{m.balance_after}</td>
                        <td className="p-2 text-stone-400">{m.notes || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
