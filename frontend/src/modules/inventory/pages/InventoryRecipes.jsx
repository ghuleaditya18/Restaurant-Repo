import { useCallback, useEffect, useState } from "react";
import {
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  CheckCircle2,
  Eye,
} from "lucide-react";
import {
  getRecipes,
  createOrUpdateRecipe,
  deleteRecipe,
  getInventoryItems,
} from "../../../services/inventoryService";
import { getMenuItems } from "../../../services/menuService";
import { useNotification } from "../../../context/NotificationContext";
import { BUTTON_VARIANTS, INPUT_STYLES, TABLE_STYLES } from "../../../utils/themeTokens";
import Pagination from "../../../components/Pagination";
import BulkSelectionBar from "../../../components/BulkSelectionBar";
import useBulkSelection from "../../../hooks/useBulkSelection";

export default function InventoryRecipes() {
  const [menuItems, setMenuItems] = useState([]);
  const { selectedIds, toggle, toggleMany, clear } = useBulkSelection();
  const [recipes, setRecipes] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Modals
  const [editorOpen, setEditorOpen] = useState(false);
  const [viewingRecipe, setViewingRecipe] = useState(null);
  const [selectedMenuItem, setSelectedMenuItem] = useState(null);
  const [recipeForm, setRecipeForm] = useState({
    yield_servings: 1,
    preparation_notes: "",
    items: [],
  });

  const { showSuccess, showUpdate, showDelete, showError, confirm } = useNotification();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [mItems, recs, invItems] = await Promise.all([
        getMenuItems(),
        getRecipes(),
        getInventoryItems({ is_active: true }),
      ]);
      setMenuItems(mItems);
      setRecipes(recs);
      setInventoryItems(invItems);
    } catch {
      showError("Failed to load recipes data");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Map recipes by menu_item_id
  const recipeMap = recipes.reduce((acc, r) => {
    acc[r.menu_item_id] = r;
    return acc;
  }, {});

  const handleOpenEditor = (menuItem) => {
    setSelectedMenuItem(menuItem);
    const existingRecipe = recipeMap[menuItem.id];

    if (existingRecipe) {
      setRecipeForm({
        yield_servings: existingRecipe.yield_servings || 1,
        preparation_notes: existingRecipe.preparation_notes || "",
        items: existingRecipe.items.map((it) => ({
          inventory_item_id: String(it.inventory_item_id),
          quantity: String(it.quantity),
        })),
      });
    } else {
      setRecipeForm({
        yield_servings: 1,
        preparation_notes: "",
        items: [{ inventory_item_id: inventoryItems[0]?.id ? String(inventoryItems[0].id) : "", quantity: "100" }],
      });
    }
    setEditorOpen(true);
  };

  const handleOpenView = (menuItem) => {
    setSelectedMenuItem(menuItem);
    setViewingRecipe(recipeMap[menuItem.id] || null);
  };

  const handleDeleteRecipe = async (menuItem) => {
    const existingRecipe = recipeMap[menuItem.id];
    if (!existingRecipe) return;

    const ok = await confirm({
      title: `Delete Recipe BOM: ${menuItem.name}`,
      message: `Delete the Bill of Materials for '${menuItem.name}' (${existingRecipe.items.length} ingredients)? The menu item itself will remain intact and historical inventory movements will not be altered.`,
      confirmText: "Delete Recipe BOM",
      variant: "danger",
    });
    if (!ok) return;

    try {
      await deleteRecipe(menuItem.id);
      showDelete(`Recipe BOM for '${menuItem.name}' deleted successfully`);
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to delete recipe BOM");
    }
  };

  const handleDeleteSelectedRecipes = async () => {
    const allTargets = menuItems.filter((item) => selectedIds.has(item.id) && recipeMap[item.id]?.items?.length);
    if (!allTargets.length) return;
    const ok = await confirm({
      title: "Delete Selected Recipe BOMs",
      message: `Delete the recipe BOM for ${allTargets.length} selected menu item(s)? Menu items and historical inventory movements will remain intact.`,
      confirmText: "Delete Selected BOMs",
      variant: "danger",
    });
    if (!ok) return;
    const results = await Promise.allSettled(allTargets.map((item) => deleteRecipe(item.id)));
    clear();
    if (results.some((result) => result.status === "fulfilled")) showDelete(`${results.filter((result) => result.status === "fulfilled").length} recipe BOM(s) deleted.`);
    if (results.some((result) => result.status === "rejected")) showError(`${results.filter((result) => result.status === "rejected").length} recipe BOM(s) could not be deleted.`);
    await loadData();
  };

  const addIngredientRow = () => {
    setRecipeForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { inventory_item_id: inventoryItems[0]?.id ? String(inventoryItems[0].id) : "", quantity: "50" },
      ],
    }));
  };

  const removeIngredientRow = (idx) => {
    setRecipeForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx),
    }));
  };

  const updateIngredientRow = (idx, field, value) => {
    setRecipeForm((prev) => {
      const updated = [...prev.items];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, items: updated };
    });
  };

  // Live Cost Preview Calculation
  const invMap = inventoryItems.reduce((acc, it) => {
    acc[it.id] = it;
    return acc;
  }, {});

  const computeLiveCost = () => {
    let totalCost = 0;
    recipeForm.items.forEach((it) => {
      const inv = invMap[it.inventory_item_id];
      if (inv) {
        totalCost += Number(it.quantity || 0) * Number(inv.average_cost || 0);
      }
    });

    const servings = Number(recipeForm.yield_servings) || 1;
    const costPerServing = totalCost / servings;
    const price = Number(selectedMenuItem?.price || 0);
    const foodCostPct = price > 0 ? (costPerServing / price) * 100 : 0;
    const grossMarginPct = price > 0 ? ((price - costPerServing) / price) * 100 : 0;

    return {
      costPerServing,
      foodCostPct,
      grossMarginPct,
    };
  };

  const handleSaveRecipe = async (e) => {
    e.preventDefault();
    if (recipeForm.items.length === 0) {
      showError("Recipe must contain at least one ingredient");
      return;
    }
    const isUpdate = !!recipeMap[selectedMenuItem.id];
    try {
      await createOrUpdateRecipe(selectedMenuItem.id, {
        yield_servings: Number(recipeForm.yield_servings),
        preparation_notes: recipeForm.preparation_notes || null,
        items: recipeForm.items.map((it) => ({
          inventory_item_id: Number(it.inventory_item_id),
          quantity: Number(it.quantity),
        })),
      });
      if (isUpdate) {
        showUpdate(`Recipe updated for '${selectedMenuItem.name}'`);
      } else {
        showSuccess(`Recipe BOM created for '${selectedMenuItem.name}'`);
      }
      setEditorOpen(false);
      loadData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to save recipe");
    }
  };

  const filteredMenuItems = menuItems.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.category_name?.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filteredMenuItems.length / pageSize) || 1;
  const paginatedItems = filteredMenuItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const live = selectedMenuItem ? computeLiveCost() : null;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative w-full sm:w-56">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder="Search dish or category..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className={`${INPUT_STYLES.base} pl-8 !py-1.5 text-xs`}
          />
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="p-2 border border-stone-300 dark:border-stone-700 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition text-stone-600 dark:text-stone-300 self-end"
          title="Refresh"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Recipes Table */}
      <BulkSelectionBar count={selectedIds.size} onDelete={handleDeleteSelectedRecipes} onClear={clear} />
      <div className={TABLE_STYLES.container}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
                <th className={`${TABLE_STYLES.th} w-10 text-center`}><input type="checkbox" aria-label="Select recipe BOMs on this page" checked={paginatedItems.filter((item) => recipeMap[item.id]?.items?.length).length > 0 && paginatedItems.filter((item) => recipeMap[item.id]?.items?.length).every((item) => selectedIds.has(item.id))} onChange={() => toggleMany(paginatedItems.filter((item) => recipeMap[item.id]?.items?.length).map((item) => item.id))} className="h-4 w-4 accent-amber-500" /></th>
                <th className={TABLE_STYLES.th}>Menu Item</th>
                <th className={TABLE_STYLES.th}>Category</th>
                <th className={TABLE_STYLES.th}>Selling Price</th>
                <th className={TABLE_STYLES.th}>BOM Cost</th>
                <th className={TABLE_STYLES.th}>Food Cost %</th>
                <th className={TABLE_STYLES.th}>Gross Margin %</th>
                <th className={TABLE_STYLES.th}>BOM Status</th>
                <th className={`${TABLE_STYLES.th} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-sm text-stone-500">
                    {loading ? "Loading menu items..." : "No menu items found."}
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => {
                  const recipe = recipeMap[item.id];
                  const hasRecipe = !!recipe && recipe.items.length > 0;

                  return (
                    <tr key={item.id} className={TABLE_STYLES.tr}>
                      <td className={`${TABLE_STYLES.td} w-10 text-center`}><input type="checkbox" aria-label={`Select recipe BOM for ${item.name}`} checked={selectedIds.has(item.id)} disabled={!hasRecipe} onChange={() => toggle(item.id)} className="h-4 w-4 accent-amber-500 disabled:opacity-30" /></td>
                      <td className={TABLE_STYLES.td}>
                        <div className="font-bold text-stone-900 dark:text-stone-100">{item.name}</div>
                      </td>
                      <td className={TABLE_STYLES.td}>{item.category_name}</td>
                      <td className={TABLE_STYLES.td}>
                        ₹{Number(item.price).toFixed(2)}
                      </td>
                      <td className={TABLE_STYLES.td}>
                        {hasRecipe ? `₹${Number(recipe.total_estimated_cost).toFixed(2)}` : "—"}
                      </td>
                      <td className={TABLE_STYLES.td}>
                        {hasRecipe ? (
                          <span className={`font-semibold ${
                            Number(recipe.food_cost_percentage) > 35 ? "text-rose-600" : "text-emerald-600"
                          }`}>
                            {Number(recipe.food_cost_percentage).toFixed(1)}%
                          </span>
                        ) : "—"}
                      </td>
                      <td className={TABLE_STYLES.td}>
                        {hasRecipe ? (
                          <span className="font-semibold text-stone-800 dark:text-stone-200">
                            {Number(recipe.gross_margin_percentage).toFixed(1)}%
                          </span>
                        ) : "—"}
                      </td>
                      <td className={TABLE_STYLES.td}>
                        {hasRecipe ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200">
                            <CheckCircle2 size={12} />
                            <span>Configured ({recipe.items.length} ing.)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200">
                            <AlertCircle size={12} />
                            <span>No Recipe</span>
                          </span>
                        )}
                      </td>
                      <td className={`${TABLE_STYLES.td} text-right`}>
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {hasRecipe && (
                            <button
                              type="button"
                              onClick={() => handleOpenView(item)}
                              className="p-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded transition"
                              title="View Recipe Details"
                            >
                              <Eye size={15} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenEditor(item)}
                            className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded transition"
                            title={hasRecipe ? "Edit Recipe (BOM)" : "Configure Recipe (BOM)"}
                            aria-label={hasRecipe ? "Edit Recipe" : "Configure Recipe"}
                          >
                            <Pencil size={15} />
                          </button>
                          {hasRecipe && (
                            <button
                              type="button"
                              onClick={() => handleDeleteRecipe(item)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition"
                              title="Delete Recipe BOM"
                            >
                              <Trash2 size={15} />
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
          totalRecords={filteredMenuItems.length}
          limit={pageSize}
        />
      </div>

      {/* VIEW RECIPE MODAL */}
      {viewingRecipe && selectedMenuItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={(e) => e.target === e.currentTarget && setViewingRecipe(null)}>
          <div className="w-full max-w-2xl bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                  Recipe BOM: {selectedMenuItem.name}
                </h3>
                <p className="text-xs text-stone-400">
                  Category: {selectedMenuItem.category_name} | Selling Price: ₹{Number(selectedMenuItem.price).toFixed(2)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingRecipe(null)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-stone-50 dark:bg-stone-900/50 rounded-xl text-xs">
              <div>
                <span className="text-stone-500 block">Yield:</span>
                <span className="font-semibold">{viewingRecipe.yield_servings} serving(s)</span>
              </div>
              <div>
                <span className="text-stone-500 block">Total BOM Cost:</span>
                <span className="font-bold text-stone-900 dark:text-stone-100">
                  ₹{Number(viewingRecipe.total_estimated_cost).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-stone-500 block">Food Cost:</span>
                <span className={`font-semibold ${Number(viewingRecipe.food_cost_percentage) > 35 ? "text-rose-600" : "text-emerald-600"}`}>
                  {Number(viewingRecipe.food_cost_percentage).toFixed(1)}%
                </span>
              </div>
              <div>
                <span className="text-stone-500 block">Gross Margin:</span>
                <span className="font-semibold text-stone-900 dark:text-stone-100">
                  {Number(viewingRecipe.gross_margin_percentage).toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wide text-stone-600 dark:text-stone-400">
                Ingredients & Portions
              </h4>
              <div className="overflow-x-auto border border-stone-200 dark:border-stone-800 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 dark:bg-stone-900/60 border-b border-stone-200 dark:border-stone-800">
                    <tr>
                      <th className="p-2.5 font-semibold text-stone-600 dark:text-stone-400">Ingredient</th>
                      <th className="p-2.5 font-semibold text-stone-600 dark:text-stone-400">Portion Quantity</th>
                      <th className="p-2.5 font-semibold text-stone-600 dark:text-stone-400">Average Unit Cost</th>
                      <th className="p-2.5 font-semibold text-stone-600 dark:text-stone-400 text-right">Line Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingRecipe.items.map((it) => (
                      <tr key={it.id} className="border-b border-stone-100 dark:border-stone-800/60">
                        <td className="p-2.5 font-medium">{it.inventory_item_name}</td>
                        <td className="p-2.5">{it.quantity} {it.inventory_item_unit}</td>
                        <td className="p-2.5">₹{Number(it.average_cost).toFixed(2)} / {it.inventory_item_unit}</td>
                        <td className="p-2.5 text-right font-medium">₹{Number(it.line_cost).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {viewingRecipe.preparation_notes && (
              <div className="text-xs p-3 bg-stone-50 dark:bg-stone-900/40 rounded-xl">
                <span className="font-semibold block text-stone-600 dark:text-stone-400 mb-1">Preparation Notes:</span>
                <p className="text-stone-700 dark:text-stone-300">{viewingRecipe.preparation_notes}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                onClick={() => {
                  setViewingRecipe(null);
                  handleOpenEditor(selectedMenuItem);
                }}
                className={BUTTON_VARIANTS.secondary}
              >
                <Pencil size={13} className="mr-1" />
                Edit Recipe
              </button>
              <button
                type="button"
                onClick={() => setViewingRecipe(null)}
                className={BUTTON_VARIANTS.primary}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECIPE BOM EDITOR MODAL */}
      {editorOpen && selectedMenuItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={(e) => e.target === e.currentTarget && setEditorOpen(false)}>
          <div className="w-full max-w-2xl bg-white dark:bg-[#101722] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                  Recipe BOM: {selectedMenuItem.name}
                </h3>
                <p className="text-xs text-stone-400">
                  Selling Price: ₹{Number(selectedMenuItem.price).toFixed(2)} | Category: {selectedMenuItem.category_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* LIVE COST & MARGIN PREVIEW CARDS */}
            {live && (
              <div className="grid grid-cols-1 min-[380px]:grid-cols-3 gap-2.5 sm:gap-3 p-3 bg-stone-50 dark:bg-stone-900/50 rounded-xl border border-stone-200 dark:border-stone-800">
                <div>
                  <div className="text-[11px] text-stone-500 uppercase font-bold">Estimated Cost</div>
                  <div className="text-base font-extrabold text-stone-900 dark:text-stone-100">
                    ₹{live.costPerServing.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-stone-500 uppercase font-bold">Food Cost %</div>
                  <div className={`text-base font-extrabold ${live.foodCostPct > 35 ? "text-rose-600" : "text-emerald-600"}`}>
                    {live.foodCostPct.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-stone-500 uppercase font-bold">Gross Margin %</div>
                  <div className="text-base font-extrabold text-stone-900 dark:text-stone-100">
                    {live.grossMarginPct.toFixed(1)}%
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSaveRecipe} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                    Yield Servings
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={recipeForm.yield_servings}
                    onChange={(e) => setRecipeForm({ ...recipeForm, yield_servings: e.target.value })}
                    className={INPUT_STYLES.base}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                    Preparation Notes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Medium spice, 15 min cook time"
                    value={recipeForm.preparation_notes}
                    onChange={(e) => setRecipeForm({ ...recipeForm, preparation_notes: e.target.value })}
                    className={INPUT_STYLES.base}
                  />
                </div>
              </div>

              {/* Ingredients List */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-stone-600 dark:text-stone-400">
                    Recipe Ingredients (BOM)
                  </h4>
                  <button
                    type="button"
                    onClick={addIngredientRow}
                    className="text-xs text-amber-600 dark:text-amber-400 font-bold hover:underline"
                  >
                    + Add Ingredient
                  </button>
                </div>

                {recipeForm.items.map((row, idx) => {
                  const inv = invMap[row.inventory_item_id];
                  const lineCost = inv ? (Number(row.quantity || 0) * Number(inv.average_cost || 0)).toFixed(2) : "0.00";

                  return (
                    <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 sm:p-0 bg-stone-50 sm:bg-transparent rounded-lg">
                      <select
                        required
                        value={row.inventory_item_id}
                        onChange={(e) => updateIngredientRow(idx, "inventory_item_id", e.target.value)}
                        className={`${INPUT_STYLES.select} flex-1`}
                      >
                        {inventoryItems.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.name} ({inv.base_unit}) — ₹{Number(inv.average_cost).toFixed(2)}/{inv.base_unit}
                          </option>
                        ))}
                      </select>

                      <div className="relative w-full sm:w-32">
                        <input
                          type="number"
                          required
                          min="0.0001"
                          step="0.0001"
                          placeholder="Quantity"
                          value={row.quantity}
                          onChange={(e) => updateIngredientRow(idx, "quantity", e.target.value)}
                          className={INPUT_STYLES.base}
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-stone-400">
                          {inv?.base_unit || ""}
                        </span>
                      </div>

                      <div className="w-20 text-xs font-bold text-stone-500 text-right self-end sm:self-center">
                        ₹{lineCost}
                      </div>

                      {recipeForm.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeIngredientRow(idx)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded self-end sm:self-center"
                          title="Remove ingredient"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  className={BUTTON_VARIANTS.secondary}
                >
                  Cancel
                </button>
                <button type="submit" className={BUTTON_VARIANTS.primary}>
                  Save Recipe BOM
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
