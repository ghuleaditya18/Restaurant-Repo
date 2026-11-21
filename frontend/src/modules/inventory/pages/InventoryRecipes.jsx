import { useCallback, useEffect, useState } from "react";
import {
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import {
  getRecipes,
  createOrUpdateRecipe,
  getInventoryItems,
} from "../../../services/inventoryService";
import { getMenuItems } from "../../../services/menuService";
import { useNotification } from "../../../context/NotificationContext";
import { BUTTON_VARIANTS, INPUT_STYLES, TABLE_STYLES } from "../../../utils/themeTokens";

export default function InventoryRecipes() {
  const [menuItems, setMenuItems] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Editor Modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedMenuItem, setSelectedMenuItem] = useState(null);
  const [recipeForm, setRecipeForm] = useState({
    yield_servings: 1,
    preparation_notes: "",
    items: [],
  });

  const { showSuccess, showError } = useNotification();

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
    try {
      await createOrUpdateRecipe(selectedMenuItem.id, {
        yield_servings: Number(recipeForm.yield_servings),
        preparation_notes: recipeForm.preparation_notes || null,
        items: recipeForm.items.map((it) => ({
          inventory_item_id: Number(it.inventory_item_id),
          quantity: Number(it.quantity),
        })),
      });
      showSuccess(`Recipe saved for '${selectedMenuItem.name}'`);
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

  const live = selectedMenuItem ? computeLiveCost() : null;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder="Search dish or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${INPUT_STYLES.base} pl-9`}
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
      <div className={TABLE_STYLES.container}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
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
              {filteredMenuItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-sm text-stone-500">
                    {loading ? "Loading menu items..." : "No menu items found."}
                  </td>
                </tr>
              ) : (
                filteredMenuItems.map((item) => {
                  const recipe = recipeMap[item.id];
                  const hasRecipe = !!recipe && recipe.items.length > 0;

                  return (
                    <tr key={item.id} className={TABLE_STYLES.tr}>
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
                        <button
                          type="button"
                          onClick={() => handleOpenEditor(item)}
                          className={BUTTON_VARIANTS.secondary}
                        >
                          <Pencil size={13} />
                          <span>{hasRecipe ? "Edit Recipe" : "Build Recipe"}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RECIPE BOM EDITOR MODAL */}
      {editorOpen && selectedMenuItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-[#1C1917] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
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
              <div className="grid grid-cols-3 gap-3 p-3 bg-stone-50 dark:bg-stone-900/50 rounded-xl border border-stone-200 dark:border-stone-800">
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
              <div className="grid grid-cols-2 gap-3">
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
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        required
                        value={row.inventory_item_id}
                        onChange={(e) => updateIngredientRow(idx, "inventory_item_id", e.target.value)}
                        className={`${INPUT_STYLES.select} flex-2`}
                      >
                        {inventoryItems.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.name} ({inv.base_unit}) — ₹{Number(inv.average_cost).toFixed(2)}/{inv.base_unit}
                          </option>
                        ))}
                      </select>

                      <div className="relative w-32">
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

                      <div className="w-20 text-xs font-bold text-stone-500 text-right">
                        ₹{lineCost}
                      </div>

                      {recipeForm.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeIngredientRow(idx)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"
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
