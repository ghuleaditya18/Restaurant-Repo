import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Utensils,
  Tags,
  Plus,
  Search,
  Pencil,
  Trash2,
  Power,
  X,
  RefreshCw,
  IndianRupee,
  FolderPlus,
  ChefHat,
  Eye,
  ImagePlus,
  ImageOff,
} from "lucide-react";

import {
  getMenuCategories,
  createMenuCategory,
  updateMenuCategory,
  deleteMenuCategory,
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  updateMenuItemAvailability,
  deleteMenuItem,
} from "../services/menuService";

// Namespace import: the optional image functions below may not exist in
// menuService.js yet. Missing members here do not break the page (a named
// import of a missing export would).
import * as menuService from "../services/menuService";

// ==========================================
// CONSTANTS
// ==========================================

const EMPTY_ITEM_FORM = {
  category_id: "",
  name: "",
  description: "",
  price: "",
};

const EMPTY_CATEGORY_FORM = {
  name: "",
  description: "",
};

// Image rules (keep in sync with the backend limits)
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE_MB = 5;

// Server origin used to build image URLs from stored relative paths
// such as "/uploads/menu/abc.jpg". Set VITE_API_ORIGIN in frontend/.env.
const API_ORIGIN = (
  import.meta.env.VITE_API_ORIGIN || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

// Field names the menu item API may use for the stored image path.
// If your backend uses a different name, change it here (one place only).
const IMAGE_FIELDS = ["image_url", "image_path", "image"];

// ==========================================
// HELPERS
// ==========================================

const getErrorMessage = (error) => {
  // Request never reached the server
  if (error && !error.response) {
    return "Unable to connect to the server. Please try again.";
  }

  const detail = error?.response?.data?.detail;

  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).join(", ");
  }

  if (typeof detail === "string") {
    return detail;
  }

  if (error?.response?.status === 413) {
    return `Image is too large. Maximum size is ${MAX_IMAGE_SIZE_MB} MB.`;
  }

  return "Something went wrong. Please try again.";
};

// Returns a browser-loadable URL for the item's image, or null.
const getItemImage = (item) => {
  const raw = IMAGE_FIELDS.map((field) => item?.[field]).find(Boolean);

  if (!raw || typeof raw !== "string") return null;

  // Already absolute (or a local preview)
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;

  return `${API_ORIGIN}${raw.startsWith("/") ? "" : "/"}${raw}`;
};

const formatPrice = (price) => {
  const value = Number(price);
  return Number.isFinite(value) ? value.toFixed(2) : "—";
};

const formatDateTime = (value) => {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const validateItemForm = (form) => {
  const errors = {};

  const name = form.name.trim();
  if (!name) errors.name = "Item name is required.";
  else if (name.length < 2)
    errors.name = "Item name must be at least 2 characters.";
  else if (name.length > 150)
    errors.name = "Item name must be 150 characters or less.";

  if (!form.category_id) errors.category_id = "Please select a category.";

  const price = String(form.price).trim();
  if (!price) errors.price = "Price is required.";
  else if (!/^\d{1,8}(\.\d{1,2})?$/.test(price))
    errors.price = "Enter a valid price (up to 2 decimal places).";
  else if (Number(price) <= 0) errors.price = "Price must be greater than 0.";

  return errors;
};

const validateCategoryForm = (form) => {
  const errors = {};

  const name = form.name.trim();
  if (!name) errors.name = "Category name is required.";
  else if (name.length < 2)
    errors.name = "Category name must be at least 2 characters.";
  else if (name.length > 100)
    errors.name = "Category name must be 100 characters or less.";

  return errors;
};

// ==========================================
// MAIN MENU COMPONENT
// ==========================================

export default function Menu() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availabilityUpdatingId, setAvailabilityUpdatingId] = useState(null);

  // Item add / edit modal
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM_FORM);
  const [itemErrors, setItemErrors] = useState({});
  const [itemError, setItemError] = useState("");

  // Item image state (kept separate from the text form)
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const fileInputRef = useRef(null);

  // Item view modal
  const [viewingItemId, setViewingItemId] = useState(null);

  // Category manager
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState(EMPTY_CATEGORY_FORM);
  const [categoryErrors, setCategoryErrors] = useState({});
  const [categoryError, setCategoryError] = useState("");
  const [categoryListError, setCategoryListError] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryUpdatingId, setCategoryUpdatingId] = useState(null);

  // Confirmation dialog
  const [confirmState, setConfirmState] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Search and filters
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [availabilityFilter, setAvailabilityFilter] = useState("ALL");

  // Notifications
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // ==========================================
  // LOAD MENU DATA
  // ==========================================

  // "silent" refreshes data without showing the table loading state
  const loadMenu = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setPageError("");

    try {
      const [categoryData, itemData] = await Promise.all([
        getMenuCategories(),
        getMenuItems(),
      ]);

      setCategories(Array.isArray(categoryData) ? categoryData : []);
      setItems(Array.isArray(itemData) ? itemData : []);
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  // Auto-dismiss the success message
  useEffect(() => {
    if (!successMessage) return undefined;

    const timer = setTimeout(() => setSuccessMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  // Release the temporary preview URL when it changes or on unmount
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  // ==========================================
  // STATISTICS
  // ==========================================

  const availableCount = items.filter((item) => item.is_available).length;
  const unavailableCount = items.length - availableCount;

  const viewingItem = useMemo(
    () => items.find((item) => item.id === viewingItemId) || null,
    [items, viewingItemId],
  );

  // ==========================================
  // SEARCH AND FILTER
  // ==========================================

  const filteredItems = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesSearch =
        !searchValue ||
        (item.name || "").toLowerCase().includes(searchValue) ||
        (item.description || "").toLowerCase().includes(searchValue) ||
        (item.category_name || "").toLowerCase().includes(searchValue);

      const matchesCategory =
        selectedCategory === "ALL" ||
        item.category_id === Number(selectedCategory);

      const matchesAvailability =
        availabilityFilter === "ALL" ||
        (availabilityFilter === "AVAILABLE" && item.is_available) ||
        (availabilityFilter === "UNAVAILABLE" && !item.is_available);

      return matchesSearch && matchesCategory && matchesAvailability;
    });
  }, [items, search, selectedCategory, availabilityFilter]);

  const hasActiveFilters =
    Boolean(search.trim()) ||
    selectedCategory !== "ALL" ||
    availabilityFilter !== "ALL";

  const clearFilters = () => {
    setSearch("");
    setSelectedCategory("ALL");
    setAvailabilityFilter("ALL");
  };

  // ==========================================
  // IMAGE HANDLERS
  // ==========================================

  const resetImageState = () => {
    setImageFile(null);
    setImagePreview(null);
    setRemoveImage(false);
    setImageError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImageSelect = (event) => {
    const file = event.target.files?.[0];

    // Allow selecting the same file again later
    event.target.value = "";

    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setImageError("Only JPG, PNG or WebP images are allowed.");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      setImageError(`Image must be ${MAX_IMAGE_SIZE_MB} MB or smaller.`);
      return;
    }

    setImageError("");
    setRemoveImage(false);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleImageRemove = () => {
    setImageFile(null);
    setImagePreview(null);
    setImageError("");

    // Only schedule a server-side removal if the item already has an image
    if (editingItem && getItemImage(editingItem)) setRemoveImage(true);
  };

  const existingImage = editingItem ? getItemImage(editingItem) : null;
  const formImagePreview =
    imagePreview || (!removeImage ? existingImage : null);

  // ==========================================
  // ITEM FORM HANDLERS
  // ==========================================

  const openAddItemModal = () => {
    const firstActiveCategory = categories.find(
      (category) => category.is_active,
    );

    setEditingItem(null);

    setItemForm({
      ...EMPTY_ITEM_FORM,
      category_id: firstActiveCategory ? String(firstActiveCategory.id) : "",
    });

    setItemErrors({});
    setItemError("");
    resetImageState();
    setSuccessMessage("");
    setShowItemModal(true);
  };

  const openEditItemModal = (item) => {
    setEditingItem(item);

    setItemForm({
      category_id: String(item.category_id),
      name: item.name || "",
      description: item.description || "",
      price: String(item.price ?? ""),
    });

    setItemErrors({});
    setItemError("");
    resetImageState();
    setSuccessMessage("");
    setShowItemModal(true);
  };

  const closeItemModal = () => {
    if (saving) return;

    setShowItemModal(false);
    setEditingItem(null);
    setItemForm(EMPTY_ITEM_FORM);
    setItemErrors({});
    setItemError("");
    resetImageState();
  };

  const handleItemChange = (event) => {
    const { name, value } = event.target;

    setItemForm((previous) => ({ ...previous, [name]: value }));

    // Clear only the error of the field being edited
    setItemErrors((previous) =>
      previous[name] ? { ...previous, [name]: "" } : previous,
    );
    setItemError("");
  };

  // ==========================================
  // CREATE / UPDATE MENU ITEM
  // ==========================================

  const handleItemSubmit = async (event) => {
    event.preventDefault();

    if (saving) return;

    setItemError("");

    const errors = validateItemForm(itemForm);
    setItemErrors(errors);

    if (Object.values(errors).some(Boolean)) {
      const firstInvalid = Object.keys(errors).find((key) => errors[key]);
      document.getElementById(`item-${firstInvalid}`)?.focus();
      return;
    }

    setSaving(true);

    const itemData = {
      name: itemForm.name.trim(),

      description: itemForm.description.trim() || null,

      price: Number(itemForm.price).toFixed(2),
    };

    let savedItem;

    // STEP 1: save the item details
    try {
      if (editingItem) {
        // Send category_id only when it has changed.
        // This avoids unnecessary category reassignment.
        if (Number(itemForm.category_id) !== editingItem.category_id) {
          itemData.category_id = Number(itemForm.category_id);
        }

        savedItem = await updateMenuItem(editingItem.id, itemData);
      } else {
        savedItem = await createMenuItem({
          ...itemData,
          category_id: Number(itemForm.category_id),
          is_available: true,
        });
      }
    } catch (error) {
      setItemError(getErrorMessage(error));
      setSaving(false);
      return;
    }

    // STEP 2: upload or remove the image (item is already saved at this point)
    let imageWarning = "";
    const itemId = editingItem?.id ?? savedItem?.id;

    try {
      if (imageFile) {
        if (!itemId) {
          throw new Error("The new item ID was not returned by the server.");
        }

        if (typeof menuService.uploadMenuItemImage !== "function") {
          throw new Error(
            "Image upload is not set up yet. Add uploadMenuItemImage to menuService.js.",
          );
        }

        await menuService.uploadMenuItemImage(itemId, imageFile);
      } else if (removeImage && editingItem) {
        if (typeof menuService.deleteMenuItemImage !== "function") {
          throw new Error(
            "Image removal is not set up yet. Add deleteMenuItemImage to menuService.js.",
          );
        }

        await menuService.deleteMenuItemImage(editingItem.id);
      }
    } catch (error) {
      imageWarning = error?.response
        ? getErrorMessage(error)
        : error?.message || "Image could not be saved.";
    }

    // STEP 3: close the form and refresh
    const wasEditing = Boolean(editingItem);

    setSaving(false);
    setShowItemModal(false);
    setEditingItem(null);
    setItemForm(EMPTY_ITEM_FORM);
    setItemErrors({});
    resetImageState();

    if (imageWarning) {
      setPageError(
        `Menu item saved, but the image was not saved: ${imageWarning} Edit the item to try again.`,
      );
    } else {
      setSuccessMessage(
        wasEditing
          ? "Menu item updated successfully."
          : "Menu item created successfully.",
      );
    }

    await loadMenu({ silent: true });
  };

  // ==========================================
  // TOGGLE ITEM AVAILABILITY
  // ==========================================

  const handleAvailabilityChange = async (item) => {
    if (availabilityUpdatingId) return;

    const newStatus = !item.is_available;

    setPageError("");
    setSuccessMessage("");
    setAvailabilityUpdatingId(item.id);

    try {
      const result = await updateMenuItemAvailability(item.id, newStatus);

      // Merge so fields missing from the response are not lost
      const updatedItem =
        result && typeof result === "object" && result.id
          ? { ...item, ...result }
          : { ...item, is_available: newStatus };

      setItems((previous) =>
        previous.map((record) =>
          record.id === item.id ? updatedItem : record,
        ),
      );

      setSuccessMessage(
        `${item.name} is now ${newStatus ? "available" : "unavailable"}.`,
      );
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setAvailabilityUpdatingId(null);
    }
  };

  // ==========================================
  // DELETE MENU ITEM
  // ==========================================

  const requestDeleteItem = (item) => {
    setConfirmState({
      title: "Delete menu item",
      message: `Are you sure you want to delete "${item.name}"? This action cannot be undone.`,
      confirmLabel: "Delete Item",
      onConfirm: async () => {
        try {
          await deleteMenuItem(item.id);

          setItems((previous) =>
            previous.filter((record) => record.id !== item.id),
          );

          if (viewingItemId === item.id) setViewingItemId(null);

          setSuccessMessage("Menu item deleted successfully.");
        } catch (error) {
          setPageError(getErrorMessage(error));
        }
      },
    });
  };

  // ==========================================
  // CATEGORY FORM HANDLERS
  // ==========================================

  const openCategoryManager = () => {
    setCategoryListError("");
    setShowCategoryForm(false);
    setEditingCategory(null);
    setShowCategoryManager(true);
  };

  const closeCategoryManager = () => {
    setShowCategoryManager(false);
    setShowCategoryForm(false);
    setEditingCategory(null);
    setCategoryErrors({});
    setCategoryError("");
    setCategoryListError("");
  };

  const openAddCategoryForm = () => {
    setEditingCategory(null);
    setCategoryForm(EMPTY_CATEGORY_FORM);
    setCategoryErrors({});
    setCategoryError("");
    setShowCategoryForm(true);
  };

  const openEditCategoryForm = (category) => {
    setEditingCategory(category);

    setCategoryForm({
      name: category.name || "",
      description: category.description || "",
    });

    setCategoryErrors({});
    setCategoryError("");
    setShowCategoryForm(true);
  };

  const handleCategoryChange = (event) => {
    const { name, value } = event.target;

    setCategoryForm((previous) => ({ ...previous, [name]: value }));

    setCategoryErrors((previous) =>
      previous[name] ? { ...previous, [name]: "" } : previous,
    );
    setCategoryError("");
  };

  // ==========================================
  // CREATE / UPDATE CATEGORY
  // ==========================================

  const handleCategorySubmit = async (event) => {
    event.preventDefault();

    if (categorySaving) return;

    setCategoryError("");

    const errors = validateCategoryForm(categoryForm);
    setCategoryErrors(errors);

    if (Object.values(errors).some(Boolean)) {
      document.getElementById("category-name")?.focus();
      return;
    }

    setCategorySaving(true);

    const categoryData = {
      name: categoryForm.name.trim(),
      description: categoryForm.description.trim() || null,
    };

    try {
      if (editingCategory) {
        await updateMenuCategory(editingCategory.id, categoryData);
        setSuccessMessage("Category updated successfully.");
      } else {
        await createMenuCategory(categoryData);
        setSuccessMessage("Category created successfully.");
      }

      setShowCategoryForm(false);
      setEditingCategory(null);
      setCategoryForm(EMPTY_CATEGORY_FORM);

      await loadMenu({ silent: true });
    } catch (error) {
      setCategoryError(getErrorMessage(error));
    } finally {
      setCategorySaving(false);
    }
  };

  // ==========================================
  // CATEGORY ACTIVATE / DEACTIVATE
  // ==========================================

  const handleCategoryStatus = async (category) => {
    if (categoryUpdatingId) return;

    const newStatus = !category.is_active;

    setCategoryListError("");
    setCategoryUpdatingId(category.id);

    try {
      await updateMenuCategory(category.id, { is_active: newStatus });

      setSuccessMessage(
        `Category ${newStatus ? "activated" : "deactivated"} successfully.`,
      );

      await loadMenu({ silent: true });
    } catch (error) {
      setCategoryListError(getErrorMessage(error));
    } finally {
      setCategoryUpdatingId(null);
    }
  };

  // ==========================================
  // DELETE CATEGORY
  // ==========================================

  const requestDeleteCategory = (category) => {
    setConfirmState({
      title: "Delete category",
      message: `Are you sure you want to delete "${category.name}"? This action cannot be undone.`,
      confirmLabel: "Delete Category",
      onConfirm: async () => {
        setCategoryListError("");

        try {
          await deleteMenuCategory(category.id);

          setSuccessMessage("Category deleted successfully.");

          // Reset the category filter if it pointed at the deleted category
          if (selectedCategory === String(category.id)) {
            setSelectedCategory("ALL");
          }

          await loadMenu({ silent: true });
        } catch (error) {
          setCategoryListError(getErrorMessage(error));
        }
      },
    });
  };

  // ==========================================
  // CONFIRM DIALOG
  // ==========================================

  const runConfirmedAction = async () => {
    if (!confirmState || confirmBusy) return;

    setConfirmBusy(true);

    try {
      await confirmState.onConfirm();
    } finally {
      setConfirmBusy(false);
      setConfirmState(null);
    }
  };

  // ==========================================
  // PAGE UI
  // ==========================================

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}

      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold text-[#1C1917] md:text-2xl">
            Menu Management
          </h1>

          <p className="mt-1 text-sm text-[#78716C]">
            Manage menu items, categories and availability.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openCategoryManager}
            className="flex items-center gap-2 rounded-lg border border-[#E7E5E4] bg-white px-4 py-2.5 text-sm font-medium text-[#1C1917] hover:bg-[#FAF9F6]"
          >
            <Tags size={17} />
            Manage Categories
          </button>

          <button
            type="button"
            onClick={openAddItemModal}
            className="flex items-center gap-2 rounded-lg bg-[#F5B716] px-4 py-2.5 text-sm font-bold text-[#1C1917] shadow-xs hover:bg-[#E5A910] cursor-pointer"
          >
            <Plus size={17} />
            Add Menu Item
          </button>
        </div>
      </div>

      {/* SUCCESS MESSAGE */}

      {successMessage && (
        <div
          role="status"
          className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
        >
          <span>{successMessage}</span>

          <button
            type="button"
            onClick={() => setSuccessMessage("")}
            aria-label="Dismiss message"
            className="text-[#78716C] hover:text-[#1C1917]"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ERROR MESSAGE */}

      {pageError && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700"
        >
          <span>{pageError}</span>

          <button
            type="button"
            onClick={() => setPageError("")}
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* SUMMARY CARDS */}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard
          title="Total Menu Items"
          value={items.length}
          icon={<Utensils size={16} />}
          active={availabilityFilter === "ALL"}
          onClick={() => setAvailabilityFilter("ALL")}
        />

        <SummaryCard
          title="Available Items"
          value={availableCount}
          icon={<ChefHat size={16} />}
          active={availabilityFilter === "AVAILABLE"}
          onClick={() => setAvailabilityFilter("AVAILABLE")}
        />

        <SummaryCard
          title="Unavailable Items"
          value={unavailableCount}
          icon={<Power size={16} />}
          active={availabilityFilter === "UNAVAILABLE"}
          onClick={() => setAvailabilityFilter("UNAVAILABLE")}
        />
      </div>

      {/* MENU TABLE CONTAINER */}

      <div className="overflow-hidden rounded-xl border border-[#E7E5E4] bg-white">
        {/* SEARCH AND FILTER */}

        <div className="flex flex-col gap-3 border-b border-[#E7E5E4] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#1C1917]">
              Restaurant Menu
            </h2>

            <p className="mt-0.5 text-xs text-[#78716C]">
              {filteredItems.length} menu{" "}
              {filteredItems.length === 1 ? "item" : "items"} found
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#78716C]"
              />

              <input
                type="text"
                placeholder="Search menu items..."
                aria-label="Search menu items"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-lg border border-[#E7E5E4] bg-white py-2 pl-9 pr-8 text-sm text-[#1C1917] outline-none focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30 sm:w-60"
              />

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#1C1917]"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <select
              value={selectedCategory}
              aria-label="Filter by category"
              onChange={(event) => setSelectedCategory(event.target.value)}
              className="rounded-lg border border-[#E7E5E4] bg-white px-3 py-2 text-sm text-[#1C1917] outline-none focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30"
            >
              <option value="ALL">All Categories</option>

              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            <select
              value={availabilityFilter}
              aria-label="Filter by availability"
              onChange={(event) => setAvailabilityFilter(event.target.value)}
              className="rounded-lg border border-[#E7E5E4] bg-white px-3 py-2 text-sm text-[#1C1917] outline-none focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30"
            >
              <option value="ALL">All Items</option>
              <option value="AVAILABLE">Available</option>
              <option value="UNAVAILABLE">Unavailable</option>
            </select>

            <button
              type="button"
              onClick={() => loadMenu()}
              disabled={loading}
              title="Refresh menu"
              aria-label="Refresh menu"
              className="flex items-center justify-center rounded-lg border border-[#E7E5E4] px-3 py-2 text-[#1C1917] hover:bg-[#FAFAF9] disabled:opacity-60"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* MENU ITEM TABLE */}

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#FAF9F6] text-xs uppercase tracking-wide text-[#78716C]">
              <tr>
                <th className="px-4 py-3 font-medium">Menu Item</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">
                  Category
                </th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">
                  Availability
                </th>
                <th className="px-4 py-3 text-center font-medium">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F0ECE6]">
              {loading ? (
                <tr>
                  <td
                    colSpan="5"
                    className="px-4 py-10 text-center text-sm text-[#78716C]"
                  >
                    Loading menu items...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td
                    colSpan="5"
                    className="px-4 py-10 text-center text-sm text-[#78716C]"
                  >
                    <p>No menu items found.</p>

                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="mt-2 font-medium text-amber-800 hover:underline"
                      >
                        Clear search and filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="transition hover:bg-[#FAF9F6]">
                    {/* ITEM (image + name + description) */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <MenuImage
                          src={getItemImage(item)}
                          alt={item.name}
                          className="h-11 w-11 shrink-0 rounded-lg border border-[#E7E5E4]"
                          iconSize={16}
                        />

                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[#1C1917]">
                            {item.name}
                          </p>

                          <p className="max-w-[16rem] truncate text-xs text-[#78716C] lg:max-w-sm">
                            {item.description || "No description"}
                          </p>

                          {/* Shown only when the Category column is hidden */}
                          <p className="truncate text-xs text-[#78716C] md:hidden">
                            {item.category_name}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-[#1C1917] md:table-cell">
                      {item.category_name || "—"}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="inline-flex items-center text-sm font-semibold text-[#1C1917]">
                        <IndianRupee size={13} />
                        {formatPrice(item.price)}
                      </span>
                    </td>

                    <td className="hidden px-4 py-3 sm:table-cell">
                      <AvailabilityBadge available={item.is_available} />
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => setViewingItemId(item.id)}
                          title="View details"
                          aria-label={`View ${item.name}`}
                          className="rounded-lg p-2 text-[#1C1917] hover:bg-stone-100 hover:text-stone-900"
                        >
                          <Eye size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditItemModal(item)}
                          title="Edit menu item"
                          aria-label={`Edit ${item.name}`}
                          className="rounded-lg p-2 text-[#1C1917] hover:bg-stone-100 hover:text-stone-900"
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleAvailabilityChange(item)}
                          disabled={availabilityUpdatingId === item.id}
                          title={
                            item.is_available
                              ? "Mark unavailable"
                              : "Mark available"
                          }
                          aria-label={`${
                            item.is_available
                              ? "Mark unavailable"
                              : "Mark available"
                          }: ${item.name}`}
                          className={`rounded-lg p-2 hover:bg-stone-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-50 ${
                            item.is_available
                              ? "text-[#1C1917]"
                              : "text-[#78716C]"
                          }`}
                        >
                          <Power
                            size={16}
                            className={
                              availabilityUpdatingId === item.id
                                ? "animate-pulse"
                                : ""
                            }
                          />
                        </button>

                        <button
                          type="button"
                          onClick={() => requestDeleteItem(item)}
                          title="Delete menu item"
                          aria-label={`Delete ${item.name}`}
                          className="rounded-lg p-2 text-[#6B625B] hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 size={16} />
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

      {/* ==================================
          VIEW MENU ITEM MODAL
      ================================== */}

      {viewingItem && (
        <ModalShell
          title="Menu Item Details"
          subtitle="Complete food item information"
          onClose={() => setViewingItemId(null)}
          closeOnEscape={!confirmState}
        >
          <MenuImage
            src={getItemImage(viewingItem)}
            alt={viewingItem.name}
            className="mb-5 aspect-[16/9] w-full rounded-lg border border-[#E7E5E4]"
            iconSize={40}
            showLabel
          />

          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="break-words text-lg font-semibold text-[#1C1917]">
                {viewingItem.name}
              </h3>

              <p className="mt-0.5 text-sm text-[#78716C]">
                {viewingItem.category_name || "—"}
              </p>
            </div>

            <AvailabilityBadge available={viewingItem.is_available} />
          </div>

          <div className="mb-5 rounded-lg bg-[#FAFAF9] p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[#78716C]">
              Description
            </p>

            <p className="whitespace-pre-line break-words text-sm text-[#1C1917]">
              {viewingItem.description || "No description provided."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <DetailItem
              label="Price"
              value={`₹${formatPrice(viewingItem.price)}`}
            />

            <DetailItem label="Item ID" value={viewingItem.id} />

            {formatDateTime(viewingItem.created_at) && (
              <DetailItem
                label="Created"
                value={formatDateTime(viewingItem.created_at)}
              />
            )}

            {formatDateTime(viewingItem.updated_at) && (
              <DetailItem
                label="Last Updated"
                value={formatDateTime(viewingItem.updated_at)}
              />
            )}
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-[#E7E5E4] pt-4">
            <button
              type="button"
              onClick={() => {
                const item = viewingItem;
                setViewingItemId(null);
                openEditItemModal(item);
              }}
              className="flex items-center gap-2 rounded-lg border border-[#E7E5E4] px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#FAFAF9]"
            >
              <Pencil size={15} />
              Edit
            </button>

            <button
              type="button"
              onClick={() => setViewingItemId(null)}
              className="rounded-lg bg-[#F5B716] px-5 py-2 text-sm font-bold text-[#1C1917] shadow-xs hover:bg-[#E5A910] cursor-pointer"
            >
              Close
            </button>
          </div>
        </ModalShell>
      )}

      {/* ==================================
          ADD / EDIT MENU ITEM MODAL
      ================================== */}

      {showItemModal && (
        <ModalShell
          title={editingItem ? "Edit Menu Item" : "Add Menu Item"}
          subtitle="Enter menu item information."
          onClose={closeItemModal}
          disableClose={saving}
        >
          <form onSubmit={handleItemSubmit} noValidate className="space-y-4">
            {itemError && <ErrorBox message={itemError} />}

            {/* FOOD IMAGE */}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#1C1917]">
                Food Image
                <span className="ml-1 text-xs font-normal text-[#78716C]">
                  (optional)
                </span>
              </label>

              <div className="flex items-center gap-4">
                <MenuImage
                  src={formImagePreview}
                  alt="Food image preview"
                  className="h-24 w-24 shrink-0 rounded-lg border border-[#E7E5E4]"
                  iconSize={26}
                />

                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#FAFAF9]"
                    >
                      <ImagePlus size={15} />
                      {formImagePreview ? "Change Image" : "Choose Image"}
                    </button>

                    {formImagePreview && (
                      <button
                        type="button"
                        onClick={handleImageRemove}
                        className="rounded-lg px-3 py-2 text-sm font-medium text-[#6B625B] hover:bg-red-50 hover:text-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-[#78716C]">
                    JPG, PNG or WebP, up to {MAX_IMAGE_SIZE_MB} MB.
                  </p>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_IMAGE_TYPES.join(",")}
                onChange={handleImageSelect}
                className="hidden"
              />

              {imageError && (
                <p role="alert" className="mt-1.5 text-xs text-red-600">
                  {imageError}
                </p>
              )}
            </div>

            <FormField
              id="item-name"
              label="Item Name"
              name="name"
              value={itemForm.name}
              onChange={handleItemChange}
              placeholder="Enter menu item name"
              error={itemErrors.name}
              maxLength={150}
            />

            <div>
              <label
                htmlFor="item-category_id"
                className="mb-1.5 block text-sm font-medium text-[#1C1917]"
              >
                Category
              </label>

              <select
                id="item-category_id"
                name="category_id"
                value={itemForm.category_id}
                onChange={handleItemChange}
                aria-invalid={Boolean(itemErrors.category_id)}
                className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-[#1C1917] outline-none ${
                  itemErrors.category_id
                    ? "border-red-400"
                    : "border-[#E7E5E4] focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30"
                }`}
              >
                <option value="">Select category</option>

                {categories
                  .filter((category) =>
                    editingItem
                      ? category.is_active ||
                        category.id === editingItem.category_id
                      : category.is_active,
                  )
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                      {!category.is_active ? " (Inactive)" : ""}
                    </option>
                  ))}
              </select>

              {itemErrors.category_id && (
                <p role="alert" className="mt-1.5 text-xs text-red-600">
                  {itemErrors.category_id}
                </p>
              )}

              {!categories.some((category) => category.is_active) && (
                <p className="mt-1.5 text-xs text-[#78716C]">
                  No active categories. Create or activate one in Manage
                  Categories first.
                </p>
              )}
            </div>

            <FormField
              id="item-price"
              label="Price (₹)"
              name="price"
              type="number"
              value={itemForm.price}
              onChange={handleItemChange}
              placeholder="Enter price"
              error={itemErrors.price}
              min="0.01"
              step="0.01"
            />

            <div>
              <label
                htmlFor="item-description"
                className="mb-1.5 block text-sm font-medium text-[#1C1917]"
              >
                Description
                <span className="ml-1 text-xs font-normal text-[#78716C]">
                  (optional)
                </span>
              </label>

              <textarea
                id="item-description"
                name="description"
                value={itemForm.description}
                onChange={handleItemChange}
                rows={3}
                placeholder="Enter item description"
                className="w-full resize-none rounded-lg border border-[#E7E5E4] px-3 py-2.5 text-sm text-[#1C1917] outline-none focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30"
              />
            </div>

            <div className="flex justify-end gap-3 border-t border-[#E7E5E4] pt-4">
              <button
                type="button"
                onClick={closeItemModal}
                disabled={saving}
                className="rounded-lg border border-[#E7E5E4] px-4 py-2.5 text-sm font-medium text-[#1C1917] hover:bg-[#FAFAF9] disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={
                  saving || !categories.some((category) => category.is_active)
                }
                className="rounded-lg bg-[#F5B716] px-5 py-2.5 text-sm font-bold text-[#1C1917] shadow-xs hover:bg-[#E5A910] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving
                  ? "Saving..."
                  : editingItem
                    ? "Save Changes"
                    : "Create Item"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* ==================================
          CATEGORY MANAGEMENT MODAL
      ================================== */}

      {showCategoryManager && (
        <ModalShell
          title="Manage Categories"
          subtitle="Create and manage restaurant menu categories."
          onClose={closeCategoryManager}
          closeOnEscape={!confirmState}
        >
          {categoryListError && (
            <div className="mb-4">
              <ErrorBox message={categoryListError} />
            </div>
          )}

          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={openAddCategoryForm}
              className="flex items-center gap-2 rounded-lg bg-[#F5B716] px-4 py-2.5 text-sm font-bold text-[#1C1917] shadow-xs hover:bg-[#E5A910] cursor-pointer"
            >
              <FolderPlus size={16} />
              Add Category
            </button>
          </div>

          <div className="max-h-[45vh] space-y-3 overflow-y-auto">
            {categories.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#78716C]">
                No categories available. Create your first category.
              </p>
            ) : (
              categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[#E7E5E4] p-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[#1C1917]">
                      {category.name}
                    </p>

                    <p className="mt-1 truncate text-xs text-[#78716C]">
                      {category.description || "No description"}
                    </p>

                    <span
                      className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
                        category.is_active
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-stone-100 text-stone-500 border border-stone-200"
                      }`}
                    >
                      {category.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditCategoryForm(category)}
                      title="Edit category"
                      aria-label={`Edit ${category.name}`}
                      className="rounded-lg p-2 text-[#1C1917] hover:bg-stone-100 hover:text-stone-900"
                    >
                      <Pencil size={16} />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCategoryStatus(category)}
                      disabled={categoryUpdatingId === category.id}
                      title={
                        category.is_active
                          ? "Deactivate category"
                          : "Activate category"
                      }
                      aria-label={`${
                        category.is_active ? "Deactivate" : "Activate"
                      } ${category.name}`}
                      className={`rounded-lg p-2 hover:bg-stone-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-50 ${
                        category.is_active ? "text-[#1C1917]" : "text-[#78716C]"
                      }`}
                    >
                      <Power size={16} />
                    </button>

                    <button
                      type="button"
                      onClick={() => requestDeleteCategory(category)}
                      title="Delete category"
                      aria-label={`Delete ${category.name}`}
                      className="rounded-lg p-2 text-[#6B625B] hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* CATEGORY FORM */}

          {showCategoryForm && (
            <div className="mt-5 rounded-lg border border-[#E7E5E4] bg-[#FAF9F6] p-4">
              <h3 className="mb-4 font-semibold text-[#1C1917]">
                {editingCategory ? "Edit Category" : "Create Category"}
              </h3>

              <form
                onSubmit={handleCategorySubmit}
                noValidate
                className="space-y-3"
              >
                {categoryError && <ErrorBox message={categoryError} />}

                <FormField
                  id="category-name"
                  label="Category Name"
                  name="name"
                  value={categoryForm.name}
                  onChange={handleCategoryChange}
                  placeholder="Category name"
                  error={categoryErrors.name}
                  maxLength={100}
                />

                <div>
                  <label
                    htmlFor="category-description"
                    className="mb-1.5 block text-sm font-medium text-[#1C1917]"
                  >
                    Description
                    <span className="ml-1 text-xs font-normal text-[#78716C]">
                      (optional)
                    </span>
                  </label>

                  <textarea
                    id="category-description"
                    name="description"
                    value={categoryForm.description}
                    onChange={handleCategoryChange}
                    placeholder="Category description"
                    rows={2}
                    className="w-full resize-none rounded-lg border border-[#E7E5E4] bg-white px-3 py-2.5 text-sm text-[#1C1917] outline-none focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCategoryForm(false);
                      setEditingCategory(null);
                    }}
                    disabled={categorySaving}
                    className="rounded-lg border border-[#E7E5E4] bg-white px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#FAFAF9] disabled:opacity-60"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={categorySaving}
                    className="rounded-lg bg-[#F5B716] px-4 py-2 text-sm font-bold text-[#1C1917] shadow-xs hover:bg-[#E5A910] cursor-pointer disabled:opacity-60"
                  >
                    {categorySaving
                      ? "Saving..."
                      : editingCategory
                        ? "Update Category"
                        : "Create Category"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </ModalShell>
      )}

      {/* ==================================
          CONFIRMATION DIALOG
      ================================== */}

      {confirmState && (
        <ModalShell
          title={confirmState.title}
          subtitle="Please confirm this action."
          onClose={() => setConfirmState(null)}
          disableClose={confirmBusy}
          maxWidth="max-w-md"
          layer="z-[60]"
        >
          <p className="text-sm text-[#1C1917]">{confirmState.message}</p>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setConfirmState(null)}
              disabled={confirmBusy}
              className="rounded-lg border border-[#E7E5E4] px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#FAFAF9] disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={runConfirmedAction}
              disabled={confirmBusy}
              className="rounded-lg bg-[#F5B716] px-4 py-2 text-sm font-bold text-[#1C1917] shadow-xs hover:bg-[#E5A910] cursor-pointer disabled:opacity-60"
            >
              {confirmBusy ? "Please wait..." : confirmState.confirmLabel}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

// ==========================================
// REUSABLE COMPONENTS
// ==========================================

// Shows the image, or a neutral placeholder when it is missing or fails to load
function MenuImage({
  src,
  alt,
  className = "",
  iconSize = 18,
  showLabel = false,
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1.5 bg-stone-100 text-stone-400 border border-stone-200 ${className}`}
        role="img"
        aria-label="No image available"
      >
        <ImageOff size={iconSize} />

        {showLabel && (
          <span className="text-xs font-medium text-stone-500">
            {src ? "Image could not be loaded" : "No image uploaded"}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`bg-[#FAFAF9] object-cover ${className}`}
    />
  );
}

function AvailabilityBadge({ available }) {
  return (
    <span
      className={`inline-block shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
        available
          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
          : "bg-stone-100 text-stone-500 border border-stone-200"
      }`}
    >
      {available ? "Available" : "Unavailable"}
    </span>
  );
}

function DetailItem({ label, value }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[#78716C]">
        {label}
      </p>

      <p className="break-words text-sm font-medium text-[#1C1917]">
        {value ?? "—"}
      </p>
    </div>
  );
}

function SummaryCard({ title, value, icon, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`Show ${title.toLowerCase()}`}
      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
        active
          ? "border-[#F5B716] bg-[#FEF9C3]/40 ring-1 ring-[#F5B716]"
          : "border-stone-200/90 bg-white hover:border-stone-300"
      }`}
    >
      <div>
        <p className="text-xs font-medium text-[#78716C]">{title}</p>

        <p className="mt-0.5 text-xl font-semibold leading-tight text-[#1C1917]">
          {value}
        </p>
      </div>

      <div className="rounded-xl bg-[#FEF9C3] p-2 text-amber-900 border border-yellow-200">{icon}</div>
    </button>
  );
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  maxWidth = "max-w-xl",
  layer = "z-50",
  disableClose = false,
  closeOnEscape = true,
}) {
  // Lock background scroll while the modal is open
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Escape closes the modal
  useEffect(() => {
    if (!closeOnEscape) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !disableClose) onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeOnEscape, disableClose, onClose]);

  return (
    <div
      className={`fixed inset-0 ${layer} flex items-center justify-center overflow-y-auto bg-[#1C1917]/50 p-4`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !disableClose) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`my-auto max-h-[90vh] w-full ${maxWidth} overflow-y-auto rounded-xl bg-white shadow-xl`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E7E5E4] bg-white px-5 py-4">
          <div>
            <h2 className="font-semibold text-[#1C1917]">{title}</h2>

            <p className="mt-0.5 text-xs text-[#78716C]">{subtitle}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={disableClose}
            className="rounded-lg p-2 text-[#78716C] hover:bg-[#FAFAF9] disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ErrorBox({ message }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {message}
    </div>
  );
}

function FormField({
  id,
  label,
  name,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  maxLength,
  min,
  step,
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-[#1C1917]"
      >
        {label}
      </label>

      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        min={min}
        step={step}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-[#1C1917] outline-none ${
          error ? "border-red-400" : "border-[#E7E5E4] focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30"
        }`}
      />

      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1.5 text-xs text-red-600"
        >
          {error}
        </p>
      )}
    </div>
  );
}
