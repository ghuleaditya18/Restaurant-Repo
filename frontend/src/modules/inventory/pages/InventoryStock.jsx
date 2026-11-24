import { useCallback, useEffect, useRef, useState } from "react";
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
  Trash2,
  Archive,
  RotateCcw,
  CheckSquare,
  ShieldAlert,
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
  checkItemEligibility,
  deleteInventoryItem,
  archiveInventoryItem,
  unarchiveInventoryItem,
  bulkCheckItems,
  bulkActionItems,
} from "../../../services/inventoryService";
import { useNotification } from "../../../context/NotificationContext";
import { BUTTON_VARIANTS, INPUT_STYLES, TABLE_STYLES } from "../../../utils/themeTokens";
import Pagination from "../../../components/Pagination";

const UNITS = ["g", "kg", "ml", "L", "pcs", "pack"];

export default function InventoryStock() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'active' | 'archived'
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const headerCheckboxRef = useRef(null);

  // Modals
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [movementsModalOpen, setMovementsModalOpen] = useState(false);
  const [activeItemMovements, setActiveItemMovements] = useState(null);
  const [movementsList, setMovementsList] = useState([]);

  // Eligibility & Delete/Archive Modal
  const [eligibilityModal, setEligibilityModal] = useState({
    open: false,
    loading: false,
    item: null,
    eligibility: null,
    archiveReason: "",
  });

  // Bulk Confirmation Modal
  const [bulkModal, setBulkModal] = useState({
    open: false,
    loading: false,
    checkResult: null,
    archiveReason: "",
  });

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

  const { showSuccess, showUpdate, showError, confirm } = useNotification();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const isArchivedParam =
        statusFilter === "archived" ? true : statusFilter === "active" ? false : undefined;
      const [itemsData, catsData] = await Promise.all([
        getInventoryItems({
          category_id: selectedCategory || undefined,
          low_stock: lowStockOnly || undefined,
          search: search || undefined,
          is_archived: isArchivedParam,
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
  }, [selectedCategory, lowStockOnly, search, statusFilter, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Pagination & selection calculations
  const totalPages = Math.ceil(items.length / pageSize) || 1;
  const pageItems = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pageItemIds = pageItems.map((it) => it.id);
  const allPageSelected =
    pageItemIds.length > 0 && pageItemIds.every((id) => selectedIds.has(id));
  const somePageSelected =
    pageItemIds.some((id) => selectedIds.has(id)) && !allPageSelected;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = somePageSelected;
    }
  }, [somePageSelected]);

  const handleToggleSelectAllPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageItemIds.forEach((id) => next.delete(id));
      } else {
        pageItemIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleToggleSelectItem = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

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
        showUpdate("Item updated successfully");
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

  // Item Delete / Archive Handler
  const handleOpenDeleteOrArchive = async (item) => {
    setEligibilityModal({
      open: true,
      loading: true,
      item,
      eligibility: null,
      archiveReason: "",
    });
    try {
      const data = await checkItemEligibility(item.id);
      setEligibilityModal((prev) => ({
        ...prev,
        loading: false,
        eligibility: data,
      }));
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to inspect item dependencies");
      setEligibilityModal({
        open: false,
        loading: false,
        item: null,
        eligibility: null,
        archiveReason: "",
      });
    }
  };

  const handleConfirmPermanentDelete = async () => {
    if (!eligibilityModal.item) return;
    try {
      await deleteInventoryItem(eligibilityModal.item.id);
      showSuccess(`Item '${eligibilityModal.item.name}' permanently deleted`);
      setEligibilityModal({
        open: false,
        loading: false,
        item: null,
        eligibility: null,
        archiveReason: "",
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(eligibilityModal.item.id);
        return next;
      });
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to delete item");
    }
  };

  const handleConfirmArchive = async () => {
    if (!eligibilityModal.item) return;
    try {
      await archiveInventoryItem(eligibilityModal.item.id, {
        reason: eligibilityModal.archiveReason || "Archived by manager",
      });
      showSuccess(`Item '${eligibilityModal.item.name}' archived successfully`);
      setEligibilityModal({
        open: false,
        loading: false,
        item: null,
        eligibility: null,
        archiveReason: "",
      });
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to archive item");
    }
  };

  const handleConfirmUnarchive = async (item) => {
    try {
      await unarchiveInventoryItem(item.id);
      showSuccess(`Item '${item.name}' unarchived successfully`);
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to unarchive item");
    }
  };

  // Bulk Actions
  const handleBulkArchive = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const ok = await confirm({
      title: "Archive Selected Items",
      message: `Are you sure you want to archive ${ids.length} selected item(s)? Archived items are hidden from daily operations while preserving all historical stock and financial transactions.`,
      confirmText: "Archive All",
      variant: "warning",
    });
    if (!ok) return;

    try {
      const res = await bulkActionItems({
        item_ids: ids,
        action: "archive",
        reason: "Bulk archived by manager",
      });
      showSuccess(`Successfully archived ${res.archived_count} item(s)`);
      setSelectedIds(new Set());
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Bulk archive failed");
    }
  };

  const handleOpenBulkDeleteCheck = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const checkResult = await bulkCheckItems(ids);
      setBulkModal({
        open: true,
        loading: false,
        checkResult,
        archiveReason: "Bulk archived due to existing ledger dependencies",
      });
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to inspect selected items");
    }
  };

  const handleExecuteBulkDeleteAndArchive = async () => {
    if (!bulkModal.checkResult) return;
    const { eligible_for_delete, require_archive } = bulkModal.checkResult;
    try {
      let deletedCount = 0;
      let archivedCount = 0;

      if (eligible_for_delete.length > 0) {
        const delRes = await bulkActionItems({
          item_ids: eligible_for_delete.map((it) => it.id),
          action: "delete",
        });
        deletedCount = delRes.deleted_count || 0;
      }

      if (require_archive.length > 0) {
        const archRes = await bulkActionItems({
          item_ids: require_archive.map((it) => it.id),
          action: "archive",
          reason: bulkModal.archiveReason || "Bulk archived (dependencies preserved)",
        });
        archivedCount = archRes.archived_count || 0;
      }

      showSuccess(`Processed: ${deletedCount} item(s) permanently deleted, ${archivedCount} item(s) safely archived`);
      setBulkModal({ open: false, loading: false, checkResult: null, archiveReason: "" });
      setSelectedIds(new Set());
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Bulk action failed");
    }
  };

  const handleExecuteBulkArchiveAll = async () => {
    if (!bulkModal.checkResult) return;
    const ids = Array.from(selectedIds);
    try {
      const res = await bulkActionItems({
        item_ids: ids,
        action: "archive",
        reason: bulkModal.archiveReason || "Bulk archived",
      });
      showSuccess(`Safely archived ${res.archived_count} item(s)`);
      setBulkModal({ open: false, loading: false, checkResult: null, archiveReason: "" });
      setSelectedIds(new Set());
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Bulk archive failed");
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
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
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
            className={`${INPUT_STYLES.select} w-40`}
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

          {/* Status Filter Tabs */}
          <div className="inline-flex items-center p-1 bg-stone-100 dark:bg-stone-800/80 rounded-lg text-xs font-medium border border-stone-200 dark:border-stone-700">
            <button
              type="button"
              onClick={() => { setStatusFilter("all"); setCurrentPage(1); }}
              className={`px-2.5 py-1 rounded-md transition ${
                statusFilter === "all"
                  ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 font-bold shadow-xs"
                  : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
              }`}
            >
              All ({items.length})
            </button>
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
          </div>
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
                <th className="w-12 px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    ref={headerCheckboxRef}
                    checked={allPageSelected}
                    onChange={handleToggleSelectAllPage}
                    aria-label="Select all on this page"
                    className="w-4.5 h-4.5 text-amber-600 rounded border-stone-300 dark:border-stone-600 focus:ring-amber-500 cursor-pointer accent-amber-600"
                  />
                </th>
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
                  <td colSpan={9} className="p-8 text-center text-sm text-stone-500">
                    {loading ? "Loading inventory items..." : "No inventory items found."}
                  </td>
                </tr>
              ) : (
                items.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((item) => (
                  <tr key={item.id} className={`${TABLE_STYLES.tr} ${selectedIds.has(item.id) ? "bg-amber-50/40 dark:bg-amber-950/20" : ""}`}>
                    <td className="w-12 px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => handleToggleSelectItem(item.id)}
                        aria-label={`Select ${item.name}`}
                        className="w-4.5 h-4.5 text-amber-600 rounded border-stone-300 dark:border-stone-600 focus:ring-amber-500 cursor-pointer accent-amber-600"
                      />
                    </td>
                    <td className={TABLE_STYLES.td}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-stone-900 dark:text-stone-100">{item.name}</span>
                        {item.is_archived && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300">
                            ARCHIVED
                          </span>
                        )}
                      </div>
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
                      {item.is_archived ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-stone-700">
                          <Archive size={11} /> Archived
                        </span>
                      ) : (
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
                          {!item.is_active && " (Inactive)"}
                        </span>
                      )}
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
                        {item.is_archived ? (
                          <button
                            type="button"
                            onClick={() => handleConfirmUnarchive(item)}
                            className="p-1.5 text-amber-600 hover:text-amber-800 dark:hover:text-amber-400 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/40 transition"
                            title="Unarchive Item"
                          >
                            <RotateCcw size={15} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenDeleteOrArchive(item)}
                            className="p-1.5 text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                            title="Delete or Archive Item"
                          >
                            <Trash2 size={15} />
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
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalRecords={items.length}
          limit={pageSize}
        />
      </div>

      {/* CREATE / EDIT ITEM MODAL */}
      {itemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
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
          <div className="w-full max-w-lg bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
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
          <div className="w-full max-w-2xl bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
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
            onClick={handleBulkArchive}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-stone-700 hover:bg-stone-600 text-stone-100 transition shadow-xs cursor-pointer"
          >
            <Archive size={14} className="text-amber-400" />
            Archive Selected
          </button>
          <button
            type="button"
            onClick={handleOpenBulkDeleteCheck}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition shadow-xs cursor-pointer"
          >
            <Trash2 size={14} />
            Delete Selected
          </button>
        </div>
      )}

      {/* SINGLE ITEM ELIGIBILITY / DELETE / ARCHIVE MODAL */}
      {eligibilityModal.open && eligibilityModal.item && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-xl ${eligibilityModal.eligibility?.can_delete ? "bg-rose-100 dark:bg-rose-950/50 text-rose-600" : "bg-amber-100 dark:bg-amber-950/50 text-amber-600"}`}>
                  {eligibilityModal.eligibility?.can_delete ? <Trash2 size={18} /> : <Archive size={18} />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                    {eligibilityModal.eligibility?.can_delete ? "Delete Inventory Item" : "Archive Item (Protected Data)"}
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400 font-mono">
                    {eligibilityModal.item.name} {eligibilityModal.item.sku && `(${eligibilityModal.item.sku})`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEligibilityModal({ open: false, loading: false, item: null, eligibility: null, archiveReason: "" })}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              >
                <X size={18} />
              </button>
            </div>

            {eligibilityModal.loading ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-stone-500 text-sm">
                <RefreshCw size={24} className="animate-spin text-amber-600" />
                <span>Checking item dependencies...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {eligibilityModal.eligibility?.can_delete ? (
                  <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold text-xs">
                      <CheckCircle2 size={16} />
                      <span>Zero Dependency Constraints</span>
                    </div>
                    <p className="text-xs text-emerald-700 dark:text-emerald-400">
                      This item has no recorded movements, purchase orders, receipts, or recipe associations. It can be safely and permanently deleted from the database.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl space-y-2">
                      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-xs">
                        <AlertTriangle size={16} />
                        <span>Permanent Deletion Blocked</span>
                      </div>
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        This item is referenced by active historical records. Permanent deletion is blocked to prevent data corruption and preserve financial integrity.
                      </p>
                      <ul className="text-xs text-stone-700 dark:text-stone-300 list-disc list-inside space-y-1 pt-1">
                        {eligibilityModal.eligibility?.reasons?.map((r, idx) => (
                          <li key={idx}>{r}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3 bg-stone-50 dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-xl space-y-2">
                      <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300">
                        Archive Reason (Recommended)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Discontinued supplier, replaced with new SKU"
                        value={eligibilityModal.archiveReason}
                        onChange={(e) => setEligibilityModal({ ...eligibilityModal, archiveReason: e.target.value })}
                        className={INPUT_STYLES.base}
                      />
                      <p className="text-[11px] text-stone-500">
                        Archiving safely deactivates the item from inventory pickers while maintaining all historical ledger audit trails.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
                  <button
                    type="button"
                    onClick={() => setEligibilityModal({ open: false, loading: false, item: null, eligibility: null, archiveReason: "" })}
                    className={BUTTON_VARIANTS.secondary}
                  >
                    Cancel
                  </button>

                  {eligibilityModal.eligibility?.can_delete ? (
                    <button
                      type="button"
                      onClick={handleConfirmPermanentDelete}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition shadow-sm cursor-pointer"
                    >
                      <Trash2 size={14} />
                      Permanently Delete
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleConfirmArchive}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition shadow-sm cursor-pointer"
                    >
                      <Archive size={14} />
                      Archive Item Instead
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BULK ACTION CONFIRMATION MODAL */}
      {bulkModal.open && bulkModal.checkResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-600">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                    Bulk Inventory Action Plan
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Inspected {bulkModal.checkResult.total_checked} selected item(s) for data dependencies
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBulkModal({ open: false, loading: false, checkResult: null, archiveReason: "" })}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl">
                <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wide block">
                  Eligible for Deletion
                </span>
                <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {bulkModal.checkResult.eligible_count}
                </span>
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
                  Zero ledger or order references.
                </p>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl">
                <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wide block">
                  Require Archiving
                </span>
                <span className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                  {bulkModal.checkResult.require_archive_count}
                </span>
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                  Contains active or historical ledger data.
                </p>
              </div>
            </div>

            {bulkModal.checkResult.require_archive_count > 0 && (
              <div className="max-h-48 overflow-y-auto p-3 bg-stone-50 dark:bg-stone-900/60 rounded-xl border border-stone-200 dark:border-stone-800 space-y-2">
                <span className="text-xs font-semibold text-stone-700 dark:text-stone-300 block">
                  Items Requiring Safe Archive:
                </span>
                <div className="space-y-1.5 divide-y divide-stone-200 dark:divide-stone-800 text-xs">
                  {bulkModal.checkResult.require_archive.map((it) => (
                    <div key={it.id} className="pt-1.5 flex items-center justify-between text-stone-600 dark:text-stone-400">
                      <span className="font-medium text-stone-800 dark:text-stone-200">{it.name}</span>
                      <span className="text-[11px] text-amber-700 dark:text-amber-400">
                        {it.reasons?.[0] || "Active historical records"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300">
                Reason for Action
              </label>
              <input
                type="text"
                placeholder="e.g. Bulk cleanup of seasonal inventory"
                value={bulkModal.archiveReason}
                onChange={(e) => setBulkModal({ ...bulkModal, archiveReason: e.target.value })}
                className={INPUT_STYLES.base}
              />
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setBulkModal({ open: false, loading: false, checkResult: null, archiveReason: "" })}
                className={BUTTON_VARIANTS.secondary}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleExecuteBulkArchiveAll}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-stone-800 hover:bg-stone-700 dark:bg-stone-700 dark:hover:bg-stone-600 text-white transition cursor-pointer"
              >
                <Archive size={14} className="text-amber-400" />
                Archive All ({bulkModal.checkResult.total_checked})
              </button>

              {bulkModal.checkResult.eligible_count > 0 && bulkModal.checkResult.require_archive_count > 0 && (
                <button
                  type="button"
                  onClick={handleExecuteBulkDeleteAndArchive}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition shadow-sm cursor-pointer"
                >
                  <ShieldAlert size={14} />
                  Delete Clean ({bulkModal.checkResult.eligible_count}) & Archive Others ({bulkModal.checkResult.require_archive_count})
                </button>
              )}

              {bulkModal.checkResult.eligible_count > 0 && bulkModal.checkResult.require_archive_count === 0 && (
                <button
                  type="button"
                  onClick={handleExecuteBulkDeleteAndArchive}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition shadow-sm cursor-pointer"
                >
                  <Trash2 size={14} />
                  Permanently Delete All ({bulkModal.checkResult.eligible_count})
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
