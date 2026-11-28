import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  BedDouble,
  Building2,
  CalendarOff,
  CheckCircle2,
  Edit3,
  Eye,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  List,
  MapPin,
  Plus,
  Power,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Users,
  Wrench,
} from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import DeleteConfirm from "../../components/DeleteConfirm";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import StatCard from "../../components/StatCard";
import StatusBadge from "../../components/StatusBadge";
import { useNotification } from "../../context/NotificationContext";
import {
  BUTTON_VARIANTS,
  CARD_STYLES,
  INPUT_STYLES,
} from "../../utils/themeTokens";
import VillaCardCarousel from "./VillaCardCarousel";
import VillaCoverImage from "./VillaCoverImage";
import VillaDataTable from "./VillaDataTable";
import {
  formatTime12h,
  getDefaultVillaCover,
  villaDateRange,
  villaError,
  villaMoney,
  villasApi,
} from "./villasApi";

const TABS = [
  { key: "villas", label: "Villas", icon: Building2 },
  { key: "units", label: "Units", icon: BedDouble },
  { key: "categories", label: "Unit Categories", icon: Layers },
  { key: "rates", label: "Seasonal Rates", icon: Tag },
  { key: "blocks", label: "Availability Blocks", icon: CalendarOff },
  { key: "housekeeping", label: "Housekeeping", icon: Wrench },
];

const HOUSEKEEPING_STATUSES = [
  "Ready",
  "Inspected",
  "Needs Cleaning",
  "Cleaning",
  "Out of Order",
];

const BLOCK_TYPES = ["Maintenance", "Owner", "Renovation", "Other"];

const PAGE_SIZE = 10;

function paginateList(list, page) {
  const totalRecords = list.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  return {
    items: list.slice(start, start + PAGE_SIZE),
    totalRecords,
    totalPages,
    currentPage: safePage,
  };
}

const isUnitAvailable = (unit) =>
  Boolean(unit?.is_active) &&
  Boolean(unit?.availability) &&
  ["Ready", "Inspected"].includes(unit?.housekeeping_status);

export default function VillasInventory() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showSuccess, showError, confirm } = useNotification();

  const rawTab = searchParams.get("tab");
  const activeTab = TABS.some((t) => t.key === rawTab) ? rawTab : "villas";

  const [villas, setVillas] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [rates, setRates] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [villaFilter, setVillaFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [hkFilter, setHkFilter] = useState("");
  const [blockTypeFilter, setBlockTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState("table");

  const [modalState, setModalState] = useState(null);
  const [form, setForm] = useState({});
  const [formError, setFormError] = useState("");
  const [validationErrors, setValidationErrors] = useState({});
  const [imageError, setImageError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [detailModal, setDetailModal] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // ── Bulk delete state ──
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkFailures, setBulkFailures] = useState([]);

  const clearImageDraft = useCallback(() => {
    setImagePreviewUrl((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return "";
    });
    setPendingImageFile(null);
    setRemoveExistingImage(false);
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl && imagePreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  const handleImageFileSelect = (file) => {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setImageError("Select a valid JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Image must be 5 MB or smaller.");
      return;
    }
    setImageError("");
    setFormError("");
    if (imagePreviewUrl && imagePreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setPendingImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setRemoveExistingImage(false);
  };

  const setTab = (tabKey) => {
    setPage(1);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tabKey);
      return next;
    });
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const [vRes, cRes, uRes, rRes, bRes] = await Promise.all([
        villasApi.villas(),
        villasApi.categories(),
        villasApi.units(),
        villasApi.rates(),
        villasApi.blocks(),
      ]);
      setVillas(vRes.data || []);
      setCategories(cRes.data || []);
      setUnits(uRes.data || []);
      setRates(rRes.data || []);
      setBlocks(bRes.data || []);
    } catch (err) {
      setPageError(villaError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, villaFilter, categoryFilter, hkFilter, blockTypeFilter]);

  // Clear selection whenever the tab or any filter changes
  useEffect(() => {
    setSelectedIds(new Set());
    setBulkFailures([]);
  }, [activeTab, searchQuery, villaFilter, categoryFilter, hkFilter, blockTypeFilter]);

  const openModal = (type, item = null) => {
    setFormError("");
    clearImageDraft();
    const mode = item ? "edit" : "create";
    if (type === "villa") {
      setForm({
        name: item?.name || "",
        address: item?.address || "",
        description: item?.description || "",
        check_in_time: item?.check_in_time || "",
        check_out_time: item?.check_out_time || "",
        late_checkout_fee:
          item?.late_checkout_fee !== null && item?.late_checkout_fee !== undefined
            ? String(item.late_checkout_fee)
            : "",
        is_active: item ? Boolean(item.is_active) : true,
        image_url: item?.image_url || null,
      });
    } else if (type === "category") {
      setForm({
        name: item?.name || "",
        description: item?.description || "",
        is_active: item ? Boolean(item.is_active) : true,
      });
    } else if (type === "unit") {
      setForm({
        villa_id: item?.villa_id ? String(item.villa_id) : String(villas[0]?.id || ""),
        category_id: item?.category_id ? String(item.category_id) : String(categories[0]?.id || ""),
        name: item?.name || "",
        capacity: item?.capacity ?? 2,
        bedrooms: item?.bedrooms ?? 1,
        base_rate: item?.base_rate ?? "",
        description: item?.description || "",
        check_in_time: item?.check_in_time || "",
        check_out_time: item?.check_out_time || "",
        late_checkout_fee:
          item?.late_checkout_fee !== null && item?.late_checkout_fee !== undefined
            ? String(item.late_checkout_fee)
            : "",
        is_active: item ? Boolean(item.is_active) : true,
        image_url: item?.image_url || null,
      });
    } else if (type === "rate") {
      setForm({
        unit_id: item?.unit_id ? String(item.unit_id) : String(units[0]?.id || ""),
        name: item?.name || "",
        start_date: item?.start_date || "",
        end_date: item?.end_date || "",
        nightly_rate: item?.nightly_rate ?? "",
      });
    } else if (type === "block") {
      setForm({
        unit_id: item?.unit_id ? String(item.unit_id) : String(units[0]?.id || ""),
        block_type: item?.block_type || "Maintenance",
        start_date: item?.start_date || "",
        end_date: item?.end_date || "",
        reason: item?.reason || "",
        description: item?.description || "",
      });
    }
    setValidationErrors({});
    setImageError("");
    setModalState({ type, mode, item });
  };

  const handleSaveModal = async (e) => {
    e.preventDefault();
    if (!modalState) return;
    const { type, mode, item } = modalState;
    setFormError("");
    setValidationErrors({});

    try {
      if (type === "villa") {
        if (!form.name?.trim() || form.name.trim().length < 2) {
          setValidationErrors({ name: "Villa name must contain at least 2 characters." });
          return;
        }
        const feeRaw = String(form.late_checkout_fee ?? "").trim();
        if (feeRaw !== "" && (Number.isNaN(Number(feeRaw)) || Number(feeRaw) < 0)) {
          setValidationErrors({ late_checkout_fee: "Enter a valid non-negative amount." });
          return;
        }
        setSaving(true);
        const payload = {
          name: form.name.trim(),
          address: form.address?.trim() || null,
          description: form.description?.trim() || null,
          check_in_time: form.check_in_time?.trim() || null,
          check_out_time: form.check_out_time?.trim() || null,
          late_checkout_fee: feeRaw === "" ? null : Number(feeRaw),
          is_active: Boolean(form.is_active),
        };
        let savedVilla = item;
        if (mode === "edit") {
          const res = await villasApi.updateVilla(item.id, payload);
          savedVilla = res.data || item;
        } else {
          const res = await villasApi.createVilla(payload);
          savedVilla = res.data;
          setModalState({ type: "villa", mode: "edit", item: savedVilla });
        }
        if (pendingImageFile && savedVilla?.id) {
          await villasApi.uploadVillaImage(savedVilla.id, pendingImageFile);
        } else if (mode === "edit" && removeExistingImage && savedVilla?.id && item?.image_url) {
          await villasApi.deleteVillaImage(savedVilla.id);
        }
        showSuccess(
          mode === "edit" ? `Updated villa "${payload.name}".` : `Created villa "${payload.name}".`
        );
      } else if (type === "category") {
        if (!form.name?.trim() || form.name.trim().length < 2) {
          setValidationErrors({ name: "Category name must contain at least 2 characters." });
          return;
        }
        setSaving(true);
        const payload = {
          name: form.name.trim(),
          description: form.description?.trim() || null,
          is_active: Boolean(form.is_active),
        };
        if (mode === "edit") {
          await villasApi.updateCategory(item.id, payload);
          showSuccess(`Updated category "${payload.name}".`);
        } else {
          await villasApi.createCategory(payload);
          showSuccess(`Created category "${payload.name}".`);
        }
      } else if (type === "unit") {
        if (!form.villa_id || !form.category_id) {
          setValidationErrors({
            ...(!form.villa_id ? { villa_id: "Select a villa." } : {}),
            ...(!form.category_id ? { category_id: "Select a unit category." } : {}),
          });
          return;
        }
        if (!form.name?.trim()) {
          setValidationErrors({ name: "Unit name is required." });
          return;
        }
        if (Number(form.base_rate) <= 0) {
          setValidationErrors({ base_rate: "Base nightly rate must be greater than zero." });
          return;
        }
        const unitFeeRaw = String(form.late_checkout_fee ?? "").trim();
        if (unitFeeRaw !== "" && (Number.isNaN(Number(unitFeeRaw)) || Number(unitFeeRaw) < 0)) {
          setValidationErrors({ late_checkout_fee: "Enter a valid non-negative amount." });
          return;
        }
        setSaving(true);
        const payload = {
          villa_id: Number(form.villa_id),
          category_id: Number(form.category_id),
          name: form.name.trim(),
          capacity: Number(form.capacity),
          bedrooms: Number(form.bedrooms),
          base_rate: Number(form.base_rate),
          description: form.description?.trim() || null,
          check_in_time: form.check_in_time?.trim() || null,
          check_out_time: form.check_out_time?.trim() || null,
          late_checkout_fee: unitFeeRaw === "" ? null : Number(unitFeeRaw),
          is_active: Boolean(form.is_active),
        };
        let savedUnit = item;
        if (mode === "edit") {
          const res = await villasApi.updateUnit(item.id, payload);
          savedUnit = res.data || item;
        } else {
          const res = await villasApi.createUnit(payload);
          savedUnit = res.data;
          setModalState({ type: "unit", mode: "edit", item: savedUnit });
        }
        if (pendingImageFile && savedUnit?.id) {
          await villasApi.uploadUnitImage(savedUnit.id, pendingImageFile);
        } else if (mode === "edit" && removeExistingImage && savedUnit?.id && item?.image_url) {
          await villasApi.deleteUnitImage(savedUnit.id);
        }
        showSuccess(
          mode === "edit" ? `Updated unit "${payload.name}".` : `Created unit "${payload.name}".`
        );
      } else if (type === "rate") {
        if (!form.unit_id || !form.name?.trim() || !form.start_date || !form.end_date) {
          setValidationErrors({
            ...(!form.unit_id ? { unit_id: "Select a unit." } : {}),
            ...(!form.name?.trim() ? { name: "Rate name is required." } : {}),
            ...(!form.start_date ? { start_date: "Start date is required." } : {}),
            ...(!form.end_date ? { end_date: "End date is required." } : {}),
          });
          return;
        }
        if (form.end_date <= form.start_date) {
          setValidationErrors({ end_date: "End date must be after start date." });
          return;
        }
        if (Number(form.nightly_rate) <= 0) {
          setValidationErrors({ nightly_rate: "Nightly rate must be greater than zero." });
          return;
        }
        setSaving(true);
        const payload = {
          unit_id: Number(form.unit_id),
          name: form.name.trim(),
          start_date: form.start_date,
          end_date: form.end_date,
          nightly_rate: Number(form.nightly_rate),
        };
        if (mode === "edit") {
          await villasApi.updateRate(item.id, payload);
          showSuccess(`Updated seasonal rate "${payload.name}".`);
        } else {
          await villasApi.createRate(payload);
          showSuccess(`Added seasonal rate "${payload.name}".`);
        }
      } else if (type === "block") {
        if (!form.unit_id || !form.start_date || !form.end_date || !form.reason?.trim()) {
          setValidationErrors({
            ...(!form.unit_id ? { unit_id: "Select a unit." } : {}),
            ...(!form.start_date ? { start_date: "Start date is required." } : {}),
            ...(!form.end_date ? { end_date: "End date is required." } : {}),
            ...(!form.reason?.trim() ? { reason: "Reason is required." } : {}),
          });
          return;
        }
        if (form.end_date <= form.start_date) {
          setValidationErrors({ end_date: "End date must be after start date." });
          return;
        }
        setSaving(true);
        const payload = {
          unit_id: Number(form.unit_id),
          block_type: form.block_type || "Maintenance",
          start_date: form.start_date,
          end_date: form.end_date,
          reason: form.reason.trim(),
          description: form.description?.trim() || null,
        };
        if (mode === "edit") {
          await villasApi.updateBlock(item.id, payload);
          showSuccess("Updated availability block.");
        } else {
          await villasApi.createBlock(payload);
          showSuccess("Created availability block.");
        }
      }

      clearImageDraft();
      setModalState(null);
      await loadAll();
    } catch (err) {
      setFormError(villaError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleVilla = async (villa) => {
    try {
      await villasApi.updateVilla(villa.id, {
        name: villa.name,
        description: villa.description,
        address: villa.address,
        check_in_time: villa.check_in_time || null,
        check_out_time: villa.check_out_time || null,
        late_checkout_fee:
          villa.late_checkout_fee !== null && villa.late_checkout_fee !== undefined
            ? Number(villa.late_checkout_fee)
            : null,
        is_active: !villa.is_active,
      });
      showSuccess(`${villa.name} is now ${!villa.is_active ? "Active" : "Inactive"}.`);
      await loadAll();
    } catch (err) {
      showError(villaError(err));
    }
  };

  const handleToggleCategory = async (category) => {
    try {
      await villasApi.updateCategory(category.id, {
        name: category.name,
        description: category.description,
        is_active: !category.is_active,
      });
      showSuccess(`${category.name} is now ${!category.is_active ? "Active" : "Inactive"}.`);
      await loadAll();
    } catch (err) {
      showError(villaError(err));
    }
  };

  const handleToggleUnit = async (unit) => {
    try {
      await villasApi.updateUnit(unit.id, {
        villa_id: unit.villa_id,
        category_id: unit.category_id,
        name: unit.name,
        capacity: unit.capacity,
        bedrooms: unit.bedrooms,
        base_rate: Number(unit.base_rate),
        description: unit.description,
        check_in_time: unit.check_in_time || null,
        check_out_time: unit.check_out_time || null,
        late_checkout_fee:
          unit.late_checkout_fee !== null && unit.late_checkout_fee !== undefined
            ? Number(unit.late_checkout_fee)
            : null,
        is_active: !unit.is_active,
      });
      showSuccess(`${unit.name} is now ${!unit.is_active ? "Available" : "Unavailable"}.`);
      await loadAll();
    } catch (err) {
      showError(villaError(err));
    }
  };

  const handleHousekeepingChange = async (unit, nextStatus) => {
    if (nextStatus === "Out of Order" && unit.housekeeping_status !== "Out of Order") {
      const ok = await confirm({
        title: "Mark Unit Out of Order?",
        message: `Marking "${unit.name}" as Out of Order prevents check-ins and same-day reservations until it is cleared.`,
        confirmText: "Mark Out of Order",
        variant: "danger",
      });
      if (!ok) return;
    }
    try {
      await villasApi.housekeeping(unit.id, nextStatus);
      showSuccess(`${unit.name} housekeeping updated to "${nextStatus}".`);
      await loadAll();
    } catch (err) {
      showError(villaError(err));
    }
  };

  const openDeleteDialog = (kind, item) => {
    setDeleteError("");
    if (kind === "villa") {
      const hasUnits = (item.unit_count ?? 0) > 0;
      setDeleteTarget({
        kind,
        item,
        title: "Delete Villa",
        recordName: item.name,
        message: hasUnits
          ? "This villa still has linked units. Remove its units first or deactivate the villa instead."
          : `Are you sure you want to delete villa "${item.name}"? This action cannot be undone.`,
        impactSummary: hasUnits
          ? `${item.unit_count} unit(s) currently linked`
          : "0 linked units",
      });
    } else if (kind === "unit") {
      setDeleteTarget({
        kind,
        item,
        title: "Delete Unit",
        recordName: item.name,
        message: `Are you sure you want to delete ${item.name}? This action is allowed only when no protected booking or financial records depend on this unit.`,
        impactSummary: `${item.villa_name} · ${item.category_name}`,
      });
    } else if (kind === "category") {
      const inUse = (item.unit_count ?? 0) > 0;
      setDeleteTarget({
        kind,
        item,
        title: "Delete Unit Category",
        recordName: item.name,
        message: inUse
          ? "This category is assigned to existing units. Reassign those units or deactivate the category instead."
          : `Are you sure you want to delete category "${item.name}"?`,
        impactSummary: inUse
          ? `${item.unit_count} assigned unit(s)`
          : "0 assigned units",
      });
    } else if (kind === "rate") {
      setDeleteTarget({
        kind,
        item,
        title: "Delete Seasonal Rate",
        recordName: `${item.name} (${item.unit_name})`,
        message:
          "Are you sure you want to delete this seasonal rate? Existing bookings and finalized invoices keep their saved price snapshots.",
        impactSummary: villaDateRange(item.start_date, item.end_date),
      });
    } else if (kind === "block") {
      setDeleteTarget({
        kind,
        item,
        title: "Delete Availability Block",
        recordName: `${item.unit_name} (${item.block_type || "Maintenance"})`,
        message:
          "Are you sure you want to remove this availability block? Existing confirmed booking conflicts remain protected.",
        impactSummary: `${villaDateRange(item.start_date, item.end_date)} · ${item.reason}`,
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      const { kind, item } = deleteTarget;
      if (kind === "villa") await villasApi.deleteVilla(item.id);
      else if (kind === "category") await villasApi.deleteCategory(item.id);
      else if (kind === "unit") await villasApi.deleteUnit(item.id);
      else if (kind === "rate") await villasApi.deleteRate(item.id);
      else if (kind === "block") await villasApi.deleteBlock(item.id);
      showSuccess(`Removed ${deleteTarget.recordName}.`);
      setDeleteTarget(null);
      await loadAll();
    } catch (err) {
      setDeleteError(villaError(err));
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Bulk delete handler ──
  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    const deleted = [];
    const failed = [];
    for (const id of selectedIds) {
      try {
        if (activeTab === "villas") await villasApi.deleteVilla(id);
        else if (activeTab === "units") await villasApi.deleteUnit(id);
        else if (activeTab === "rates") await villasApi.deleteRate(id);
        else if (activeTab === "blocks") await villasApi.deleteBlock(id);
        deleted.push(id);
      } catch (err) {
        failed.push({ id, name: getSelectedRecordName(id), reason: villaError(err) });
      }
    }
    await loadAll();
    // Keep only the failed IDs selected so the user can see what didn't delete
    setSelectedIds(new Set(failed.map((f) => f.id)));
    setBulkFailures(failed);
    setBulkDeleting(false);
    setBulkConfirmOpen(false);
    if (deleted.length > 0 && failed.length === 0) {
      showSuccess(`Deleted ${deleted.length} record${deleted.length !== 1 ? "s" : ""} successfully.`);
    } else if (deleted.length > 0 && failed.length > 0) {
      showSuccess(
        `Deleted ${deleted.length} record${deleted.length !== 1 ? "s" : ""}. ${failed.length} could not be deleted; see the details below.`
      );
    } else {
      showError("No records could be deleted. The backend rejected all selected items.");
    }
  };

  // Helper: resolve display name for a selected ID in the current tab
  const getSelectedRecordName = (id) => {
    if (activeTab === "villas") return villas.find((v) => v.id === id)?.name ?? `#${id}`;
    if (activeTab === "units") return units.find((u) => u.id === id)?.name ?? `#${id}`;
    if (activeTab === "rates") return rates.find((r) => r.id === id)?.name ?? `#${id}`;
    if (activeTab === "blocks") {
      const b = blocks.find((b) => b.id === id);
      return b ? `${b.unit_name} (${b.block_type})` : `#${id}`;
    }
    return `#${id}`;
  };

  // Helper: is a row eligible for selection based on current tab
  const isRowSelectable = (row) => {
    if (activeTab === "villas") return (row.unit_count ?? 0) === 0;
    // units, rates, blocks – let the backend decide; always allow selection
    return true;
  };

  // Handler to toggle/select a single row
  const handleSelectRow = (id) => {
    setBulkFailures([]);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Handler for select-all (toggling)
  const handleSelectAll = (allIds) => {
    setBulkFailures([]);
    setSelectedIds((prev) => {
      const allSelected = allIds.every((id) => prev.has(id));
      if (allSelected) {
        // deselect all
        const next = new Set(prev);
        allIds.forEach((id) => next.delete(id));
        return next;
      } else {
        // select all
        const next = new Set(prev);
        allIds.forEach((id) => next.add(id));
        return next;
      }
    });
  };

  const needle = searchQuery.trim().toLowerCase();

  const filteredVillas = useMemo(() => {
    return villas.filter(
      (v) =>
        !needle ||
        v.name.toLowerCase().includes(needle) ||
        (v.address || "").toLowerCase().includes(needle) ||
        (v.description || "").toLowerCase().includes(needle)
    );
  }, [villas, needle]);

  const filteredUnits = useMemo(() => {
    return units.filter((u) => {
      if (villaFilter && String(u.villa_id) !== villaFilter) return false;
      if (categoryFilter && String(u.category_id) !== categoryFilter) return false;
      if (hkFilter && u.housekeeping_status !== hkFilter) return false;
      if (!needle) return true;
      return (
        u.name.toLowerCase().includes(needle) ||
        u.villa_name.toLowerCase().includes(needle) ||
        u.category_name.toLowerCase().includes(needle) ||
        (u.housekeeping_status || "").toLowerCase().includes(needle)
      );
    });
  }, [units, villaFilter, categoryFilter, hkFilter, needle]);

  const filteredCategories = useMemo(() => {
    return categories.filter(
      (c) =>
        !needle ||
        c.name.toLowerCase().includes(needle) ||
        (c.description || "").toLowerCase().includes(needle)
    );
  }, [categories, needle]);

  const filteredRates = useMemo(() => {
    return rates.filter((r) => {
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        (r.unit_name || "").toLowerCase().includes(needle)
      );
    });
  }, [rates, needle]);

  const filteredBlocks = useMemo(() => {
    return blocks.filter((b) => {
      if (blockTypeFilter && (b.block_type || "Maintenance") !== blockTypeFilter) return false;
      if (!needle) return true;
      return (
        (b.unit_name || "").toLowerCase().includes(needle) ||
        (b.villa_name || "").toLowerCase().includes(needle) ||
        (b.reason || "").toLowerCase().includes(needle) ||
        (b.block_type || "").toLowerCase().includes(needle)
      );
    });
  }, [blocks, blockTypeFilter, needle]);

  const hkStats = useMemo(() => {
    const ready = units.filter((u) =>
      ["Ready", "Inspected"].includes(u.housekeeping_status)
    ).length;
    const needsCleaning = units.filter((u) => u.housekeeping_status === "Needs Cleaning").length;
    const cleaning = units.filter((u) => u.housekeeping_status === "Cleaning").length;
    const outOfOrder = units.filter((u) => u.housekeeping_status === "Out of Order").length;
    return { ready, needsCleaning, cleaning, outOfOrder };
  }, [units]);

  const activeList = useMemo(() => {
    if (activeTab === "villas") return filteredVillas;
    if (activeTab === "categories") return filteredCategories;
    if (activeTab === "rates") return filteredRates;
    if (activeTab === "blocks") return filteredBlocks;
    return filteredUnits;
  }, [activeTab, filteredVillas, filteredCategories, filteredRates, filteredBlocks, filteredUnits]);

  const paged = useMemo(() => paginateList(activeList, page), [activeList, page]);

  const primaryActionLabel = {
    villas: "Add Villa",
    units: "Add Unit",
    categories: "Add Category",
    rates: "Add Seasonal Rate",
    blocks: "Add Availability Block",
    housekeeping: null,
  }[activeTab];

  // Column specs per Section 4
  const villaColumns = [
    {
      key: "image",
      label: "",
      width: "w-16",
      headerClassName: "px-2",
      cellClassName: "px-2",
      render: (v) => (
        <div className="h-[52px] w-[52px] rounded-lg overflow-hidden border border-stone-200 dark:border-stone-800 shrink-0">
          <VillaCoverImage
            src={v.image_url}
            fallbackSrc={getDefaultVillaCover({ name: v.name })}
            alt={v.name}
            className="h-full w-full object-cover"
          />
        </div>
      ),
    },
    {
      key: "name",
      label: "Villa Property",
      width: "min-w-[240px]",
      render: (v) => (
        <div className="min-w-0">
          <div className="font-semibold text-[#172033] dark:text-[#F8FAFC]">{v.name}</div>
          {v.description && (
            <div
              className="text-xs text-[#64748B] dark:text-[#8A9AB2] truncate max-w-[320px]"
              title={v.description}
            >
              {v.description}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "address",
      label: "Address / Location",
      width: "min-w-[180px]",
      render: (v) => (
        <span className="text-sm text-[#172033] dark:text-[#CBD5E1]">{v.address || "—"}</span>
      ),
    },
    {
      key: "units",
      label: "Units",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (v) => (
        <span>
          <strong className="font-semibold">{v.active_unit_count ?? v.unit_count ?? 0}</strong>
          <span className="text-xs text-[#64748B] dark:text-[#8A9AB2]">
            {" "}
            / {v.unit_count ?? 0} total
          </span>
        </span>
      ),
    },
    {
      key: "occupied",
      label: "Occupied Today",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums font-semibold",
      render: (v) => v.occupied_units_today ?? 0,
    },
    {
      key: "status",
      label: "Status",
      align: "center",
      render: (v) => (
        <StatusBadge
          status={v.is_active ? "ACTIVE" : "INACTIVE"}
          label={v.is_active ? "Active" : "Inactive"}
          size="sm"
        />
      ),
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      cellClassName: "whitespace-nowrap",
      render: (v) => (
        <div className="inline-flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => setDetailModal({ kind: "villa", item: v })}
            title="View Villa Details"
            className="rounded-lg p-1.5 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30 cursor-pointer"
          >
            <Eye size={15} />
          </button>
          <button
            type="button"
            onClick={() => openModal("villa", v)}
            title="Edit Villa"
            className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <Edit3 size={15} />
          </button>
          <button
            type="button"
            onClick={() => handleToggleVilla(v)}
            title={v.is_active ? "Deactivate Villa" : "Activate Villa"}
            className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <Power size={15} />
          </button>
          <button
            type="button"
            onClick={() => openDeleteDialog("villa", v)}
            title="Delete Villa"
            className="rounded-lg p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  const unitColumns = [
    {
      key: "image",
      label: "",
      width: "w-14",
      headerClassName: "px-2",
      cellClassName: "px-2",
      render: (u) => (
        <div className="h-[48px] w-[48px] rounded-lg overflow-hidden border border-stone-200 dark:border-stone-800 shrink-0">
          <VillaCoverImage
            src={u.image_url}
            fallbackSrc={getDefaultVillaCover({ name: u.villa_name || u.name })}
            alt={u.name}
            className="h-full w-full object-cover"
          />
        </div>
      ),
    },
    {
      key: "name",
      label: "Unit & Villa",
      render: (u) => (
        <div>
          <div className="font-semibold text-[#172033] dark:text-[#F8FAFC] whitespace-nowrap">
            {u.name}
          </div>
          <div className="text-xs text-[#64748B] dark:text-[#8A9AB2]">{u.villa_name}</div>
        </div>
      ),
    },
    {
      key: "category_name",
      label: "Category",
      cellClassName: "whitespace-nowrap",
    },
    {
      key: "capacity",
      label: "Capacity / Beds",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (u) => `${u.capacity} guests · ${u.bedrooms} BR`,
    },
    {
      key: "base_rate",
      label: "Nightly Rate",
      align: "right",
      cellClassName: "whitespace-nowrap font-semibold tabular-nums",
      render: (u) => villaMoney(u.base_rate),
    },
    {
      key: "housekeeping",
      label: "Housekeeping",
      render: (u) => (
        <select
          aria-label={`Quick housekeeping for ${u.name}`}
          value={u.housekeeping_status}
          onChange={(e) => handleHousekeepingChange(u, e.target.value)}
          className={`${INPUT_STYLES.select} w-[150px] py-1.5 text-xs`}
        >
          {HOUSEKEEPING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "status",
      label: "Status",
      align: "center",
      cellClassName: "whitespace-nowrap",
      render: (u) => {
        const available = isUnitAvailable(u);
        return (
          <StatusBadge
            status={available ? "ACTIVE" : "INACTIVE"}
            label={available ? "Available" : "Unavailable"}
            size="sm"
          />
        );
      },
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      cellClassName: "whitespace-nowrap",
      render: (u) => (
        <div className="inline-flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => setDetailModal({ kind: "unit", item: u })}
            title="View Unit Details"
            className="rounded-lg p-1.5 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30 cursor-pointer"
          >
            <Eye size={15} />
          </button>
          <button
            type="button"
            disabled={!u.is_active || u.housekeeping_status === "Out of Order"}
            onClick={() => navigate(`/villas/bookings?unitId=${u.id}`)}
            title={
              !u.is_active || u.housekeeping_status === "Out of Order"
                ? "Unit is unavailable for booking (Inactive or Out of Order)"
                : "Create Stay for Unit"
            }
            className="rounded-lg px-2 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
          >
            Book
          </button>
          <button
            type="button"
            onClick={() => openModal("unit", u)}
            title="Edit Unit"
            className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <Edit3 size={15} />
          </button>
          <button
            type="button"
            onClick={() => handleToggleUnit(u)}
            title={u.is_active ? "Mark Unavailable" : "Mark Available"}
            className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <Power size={15} />
          </button>
          <button
            type="button"
            onClick={() => openDeleteDialog("unit", u)}
            title="Delete Unit"
            className="rounded-lg p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  const categoryColumns = [
    {
      key: "name",
      label: "Category Name",
      cellClassName: "font-semibold whitespace-nowrap",
    },
    {
      key: "description",
      label: "Description",
      width: "min-w-[220px]",
      render: (c) => (
        <span
          className="block max-w-md truncate text-sm text-[#64748B] dark:text-[#CBD5E1]"
          title={c.description || ""}
        >
          {c.description || "—"}
        </span>
      ),
    },
    {
      key: "unit_count",
      label: "Assigned Units",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums font-semibold",
      render: (c) => c.unit_count ?? 0,
    },
    {
      key: "status",
      label: "Status",
      align: "center",
      render: (c) => (
        <StatusBadge
          status={c.is_active ? "ACTIVE" : "INACTIVE"}
          label={c.is_active ? "Active" : "Inactive"}
          size="sm"
        />
      ),
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      cellClassName: "whitespace-nowrap",
      render: (c) => (
        <div className="inline-flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => openModal("category", c)}
            title="Edit Category"
            className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <Edit3 size={15} />
          </button>
          <button
            type="button"
            onClick={() => handleToggleCategory(c)}
            title={c.is_active ? "Deactivate" : "Activate"}
            className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <Power size={15} />
          </button>
          <button
            type="button"
            onClick={() => openDeleteDialog("category", c)}
            title="Delete Category"
            className="rounded-lg p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  const rateColumns = [
    {
      key: "name",
      label: "Season / Rate Name",
      cellClassName: "font-semibold whitespace-nowrap",
    },
    {
      key: "unit_name",
      label: "Accommodation Unit",
      cellClassName: "whitespace-nowrap",
    },
    {
      key: "period",
      label: "Effective Period",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (r) => villaDateRange(r.start_date, r.end_date),
    },
    {
      key: "nightly_rate",
      label: "Nightly Rate",
      align: "right",
      cellClassName: "whitespace-nowrap font-semibold tabular-nums text-amber-700 dark:text-amber-300",
      render: (r) => villaMoney(r.nightly_rate),
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      cellClassName: "whitespace-nowrap",
      render: (r) => (
        <div className="inline-flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => openModal("rate", r)}
            title="Edit Seasonal Rate"
            className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <Edit3 size={15} />
          </button>
          <button
            type="button"
            onClick={() => openDeleteDialog("rate", r)}
            title="Delete Seasonal Rate"
            className="rounded-lg p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  const blockColumns = [
    {
      key: "unit",
      label: "Unit & Villa",
      render: (b) => (
        <div>
          <div className="font-semibold whitespace-nowrap">{b.unit_name}</div>
          <div className="text-xs text-[#64748B] dark:text-[#8A9AB2]">{b.villa_name}</div>
        </div>
      ),
    },
    {
      key: "block_type",
      label: "Block Type",
      cellClassName: "whitespace-nowrap",
      render: (b) => (
        <span className="inline-flex items-center rounded-full border border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 px-2.5 py-0.5 text-xs font-semibold text-stone-700 dark:text-stone-300">
          {b.block_type || "Maintenance"}
        </span>
      ),
    },
    {
      key: "period",
      label: "Blocked Period",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (b) => villaDateRange(b.start_date, b.end_date),
    },
    {
      key: "reason",
      label: "Reason & Notes",
      width: "min-w-[220px]",
      render: (b) => (
        <div className="min-w-0 max-w-xs">
          <div className="font-medium truncate" title={b.reason}>
            {b.reason}
          </div>
          {b.description && (
            <div
              className="text-xs text-[#64748B] dark:text-[#8A9AB2] truncate"
              title={b.description}
            >
              {b.description}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      cellClassName: "whitespace-nowrap",
      render: (b) => (
        <div className="inline-flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => openModal("block", b)}
            title="Edit Block"
            className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <Edit3 size={15} />
          </button>
          <button
            type="button"
            onClick={() => openDeleteDialog("block", b)}
            title="Remove Block"
            className="rounded-lg p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  const housekeepingColumns = [
    {
      key: "unit",
      label: "Unit & Villa",
      render: (u) => (
        <div>
          <div className="font-semibold whitespace-nowrap">{u.name}</div>
          <div className="text-xs text-[#64748B] dark:text-[#8A9AB2]">{u.villa_name}</div>
        </div>
      ),
    },
    {
      key: "category_name",
      label: "Category",
      cellClassName: "whitespace-nowrap",
    },
    {
      key: "current_status",
      label: "Current Status",
      cellClassName: "whitespace-nowrap",
      render: (u) => (
        <StatusBadge status={u.housekeeping_status} label={u.housekeeping_status} size="sm" />
      ),
    },
    {
      key: "same_day",
      label: "Same-Day Check-in",
      cellClassName: "whitespace-nowrap",
      render: (u) => {
        const readyForCheckin =
          ["Ready", "Inspected"].includes(u.housekeeping_status) && u.is_active;
        return (
          <span
            className={`text-xs font-semibold ${
              readyForCheckin
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {readyForCheckin ? "Cleared for Arrival" : "Hold Until Ready"}
          </span>
        );
      },
    },
    {
      key: "update_status",
      label: "Update Status",
      render: (u) => (
        <select
          aria-label={`Housekeeping status for ${u.name}`}
          value={u.housekeeping_status}
          onChange={(e) => handleHousekeepingChange(u, e.target.value)}
          className={`${INPUT_STYLES.select} w-[160px] py-1.5 text-xs`}
        >
          {HOUSEKEEPING_STATUSES.map((statusOption) => (
            <option key={statusOption} value={statusOption}>
              {statusOption}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      cellClassName: "whitespace-nowrap",
      render: (u) => (
        <div className="inline-flex items-center justify-end gap-1.5">
          {!["Ready", "Inspected"].includes(u.housekeeping_status) && (
            <button
              type="button"
              onClick={() => handleHousekeepingChange(u, "Ready")}
              className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 cursor-pointer"
            >
              Mark Ready
            </button>
          )}
          <button
            type="button"
            onClick={() => openModal("unit", u)}
            title="Edit Unit Details"
            className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <Edit3 size={15} />
          </button>
        </div>
      ),
    },
  ];

  const activeTableConfig = {
    villas: {
      columns: villaColumns,
      minWidth: "min-w-[920px]",
      emptyTitle: "No villas found",
      emptyDescription: "Add a villa property or adjust your search query.",
    },
    units: {
      columns: unitColumns,
      minWidth: "min-w-full",
      emptyTitle: "No accommodation units found",
      emptyDescription: "Add a unit or clear active filters.",
    },
    categories: {
      columns: categoryColumns,
      minWidth: "min-w-[740px]",
      emptyTitle: "No unit categories found",
      emptyDescription: "Create a unit category to group suites and villas.",
    },
    rates: {
      columns: rateColumns,
      minWidth: "min-w-[760px]",
      emptyTitle: "No seasonal rates configured",
      emptyDescription: "Add peak or holiday rate windows for your units.",
    },
    blocks: {
      columns: blockColumns,
      minWidth: "min-w-[860px]",
      emptyTitle: "No availability blocks scheduled",
      emptyDescription: "Block unit dates for maintenance, renovations, or owner stays.",
    },
    housekeeping: {
      columns: housekeepingColumns,
      minWidth: "min-w-[900px]",
      emptyTitle: "No units match housekeeping filters",
      emptyDescription: "Adjust your housekeeping or villa filters.",
    },
  }[activeTab];

  const closeEditModal = () => {
    if (saving) return;
    clearImageDraft();
    setModalState(null);
  };

  const renderImageUploader = (fallbackSrc, altText) => {
    const activePreview = imagePreviewUrl || (!removeExistingImage ? form.image_url : "");
    return (
      <div className="rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-stone-50/60 dark:bg-[#0D1420]/60 p-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="h-24 w-full sm:w-36 shrink-0 overflow-hidden rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-900">
            <VillaCoverImage
              src={activePreview}
              fallbackSrc={removeExistingImage ? "" : fallbackSrc}
              alt={altText}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <p className="text-xs font-semibold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                <ImageIcon size={13} className="text-[#F59E0B]" />
                <span>Cover Photography</span>
              </p>
              <p className="text-[11px] text-stone-500 dark:text-[#8A9AB2]">
                Upload JPG, PNG, or WebP (max 5 MB). Stored securely for card &amp; portfolio views.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className={`${BUTTON_VARIANTS.secondary} !py-1.5 !px-2.5 text-xs cursor-pointer`}>
                <Upload size={13} />
                <span>{activePreview ? "Replace Image" : "Upload Image"}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    handleImageFileSelect(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
              </label>
              {(pendingImageFile || (form.image_url && !removeExistingImage)) && (
                <button
                  type="button"
                  onClick={() => {
                    if (pendingImageFile) {
                      clearImageDraft();
                    } else {
                      setRemoveExistingImage(true);
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-2.5 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 cursor-pointer"
                >
                  <Trash2 size={12} />
                  <span>Remove</span>
                </button>
              )}
              {pendingImageFile && (
                <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 truncate max-w-[180px]">
                  Ready: {pendingImageFile.name}
                </span>
              )}
              {removeExistingImage && !pendingImageFile && (
                <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                  Image will be cleared on save
                </span>
              )}
            </div>
            {imageError && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{imageError}</p>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Villas & Units"
        actions={
          primaryActionLabel && (
            <button
              type="button"
              onClick={() =>
                openModal(
                  activeTab === "categories"
                    ? "category"
                    : activeTab === "rates"
                    ? "rate"
                    : activeTab === "blocks"
                    ? "block"
                    : activeTab === "villas"
                    ? "villa"
                    : "unit"
                )
              }
              className={BUTTON_VARIANTS.primary}
            >
              <Plus size={16} />
              <span>{primaryActionLabel}</span>
            </button>
          )
        }
      />

      {pageError && (
        <AlertBanner
          variant="error"
          title="Unable to load inventory"
          message={pageError}
          onDismiss={() => setPageError("")}
        />
      )}

      {/* SUB-NAVIGATION TABS */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-1.5 shadow-2xs">
        {TABS.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          const countMap = {
            villas: villas.length,
            units: units.length,
            categories: categories.length,
            rates: rates.length,
            blocks: blocks.length,
            housekeeping: hkStats.needsCleaning + hkStats.outOfOrder,
          };
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition cursor-pointer ${
                isActive
                  ? "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold shadow-xs"
                  : "text-stone-600 dark:text-[#8A9AB2] hover:bg-stone-100 dark:hover:bg-[#161F30] hover:text-stone-900 dark:hover:text-stone-100"
              }`}
            >
              <Icon size={14} />
              <span>{label}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  isActive
                    ? "bg-[#0D1420]/15 text-[#0D1420]"
                    : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300"
                }`}
              >
                {countMap[key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* HOUSEKEEPING KPI SUMMARY ON HOUSEKEEPING TAB */}
      {activeTab === "housekeeping" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-fit max-w-full">
          <StatCard
            compact
            title="Ready / Inspected"
            value={hkStats.ready}
            description="Cleared for guest check-in"
            icon={CheckCircle2}
            color="emerald"
            active={hkFilter === "Ready"}
            onClick={() => setHkFilter((prev) => (prev === "Ready" ? "" : "Ready"))}
          />
          <StatCard
            compact
            title="Needs Cleaning"
            value={hkStats.needsCleaning}
            description="Awaiting housekeeping turnover"
            icon={Sparkles}
            color="amber"
            active={hkFilter === "Needs Cleaning"}
            onClick={() => setHkFilter((prev) => (prev === "Needs Cleaning" ? "" : "Needs Cleaning"))}
          />
          <StatCard
            compact
            title="Cleaning In Progress"
            value={hkStats.cleaning}
            description="Currently being serviced"
            icon={Wrench}
            color="sky"
            active={hkFilter === "Cleaning"}
            onClick={() => setHkFilter((prev) => (prev === "Cleaning" ? "" : "Cleaning"))}
          />
          <StatCard
            compact
            title="Out of Order"
            value={hkStats.outOfOrder}
            description="Blocked from reservations"
            icon={AlertTriangle}
            color="rose"
            active={hkFilter === "Out of Order"}
            onClick={() => setHkFilter((prev) => (prev === "Out of Order" ? "" : "Out of Order"))}
          />
        </div>
      )}

      {/* RESPONSIVE SEARCH, FILTER BAR & SEPARATE TABLE/CARDS TOGGLE */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className={`${CARD_STYLES.base} !p-2 w-fit max-w-full`}>
          <div
            className={
              activeTab === "units"
                ? "grid grid-cols-1 items-center gap-2 sm:grid-cols-2 xl:grid-cols-[220px_140px_155px_170px]"
                : "flex flex-wrap items-center gap-2"
            }
          >
            {/* Search field */}
            <div className={`flex min-w-0 items-center gap-2 ${activeTab === "units" ? "w-full" : ""}`}>
              <div className={`relative min-w-0 ${activeTab === "units" ? "w-full" : activeTab === "villas" ? "w-60 max-w-full" : "w-56 max-w-full"}`}>
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${activeTab}...`}
                  className={`${INPUT_STYLES.base} w-full pl-9`}
                />
              </div>
              {(searchQuery || villaFilter || categoryFilter || hkFilter || blockTypeFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setVillaFilter("");
                    setCategoryFilter("");
                    setHkFilter("");
                    setBlockTypeFilter("");
                  }}
                  className={`${BUTTON_VARIANTS.secondary} shrink-0`}
                >
                  Reset
                </button>
              )}
            </div>

            {/* Units / Housekeeping filters */}
            {(activeTab === "units" || activeTab === "housekeeping") && (
              <>
                <select
                  value={villaFilter}
                  onChange={(e) => setVillaFilter(e.target.value)}
                  className={`${INPUT_STYLES.select} ${activeTab === "units" ? "min-w-0 w-full" : "!w-auto min-w-[130px]"}`}
                >
                  <option value="">All Villas</option>
                  {villas.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>

                {activeTab === "units" && (
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className={`${INPUT_STYLES.select} min-w-0 w-full`}
                  >
                    <option value="">All Categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}

                <select
                  value={hkFilter}
                  onChange={(e) => setHkFilter(e.target.value)}
                  className={`${INPUT_STYLES.select} ${activeTab === "units" ? "min-w-0 w-full" : "!w-auto min-w-[150px]"}`}
                >
                  <option value="">All Housekeeping</option>
                  {HOUSEKEEPING_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </>
            )}

            {/* Block type filter */}
            {activeTab === "blocks" && (
              <select
                value={blockTypeFilter}
                onChange={(e) => setBlockTypeFilter(e.target.value)}
                className={`${INPUT_STYLES.select} !w-auto min-w-[140px]`}
              >
                <option value="">All Block Types</option>
                {BLOCK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {(activeTab === "villas" || activeTab === "units") && (
          <div className="inline-flex rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-1 gap-1 shrink-0 shadow-2xs">
            <button
              type="button"
              onClick={() => {
                setSelectedIds(new Set());
                setBulkFailures([]);
                setViewMode("table");
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                viewMode === "table"
                  ? "bg-[#F59E0B] text-[#0D1420] shadow-2xs"
                  : "text-stone-600 dark:text-[#8A9AB2] hover:text-stone-900 dark:hover:text-white"
              }`}
            >
              <List size={13} />
              <span>Table</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedIds(new Set());
                setBulkFailures([]);
                setViewMode("cards");
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                viewMode === "cards"
                  ? "bg-[#F59E0B] text-[#0D1420] shadow-2xs"
                  : "text-stone-600 dark:text-[#8A9AB2] hover:text-stone-900 dark:hover:text-white"
              }`}
            >
              <LayoutGrid size={13} />
              <span>Cards</span>
            </button>
          </div>
        )}
      </div>

      {/* SLIDING CARDS VIEW OR DATA TABLE */}
      {activeTab === "villas" && viewMode === "cards" ? (
        loading ? (
          <div className={`${CARD_STYLES.base} text-center py-10 text-sm text-stone-500 dark:text-[#8A9AB2]`}>
            Loading villa properties...
          </div>
        ) : filteredVillas.length === 0 ? (
          <div className={`${CARD_STYLES.base} text-center py-10 space-y-2`}>
            <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">
              {activeTableConfig.emptyTitle}
            </p>
            <p className="text-xs text-stone-500 dark:text-[#8A9AB2]">
              {activeTableConfig.emptyDescription}
            </p>
          </div>
        ) : (
          <VillaCardCarousel
            itemCount={filteredVillas.length}
            title={`Villa Properties (${filteredVillas.length})`}
            subtitle="Slide horizontally or use arrows to browse properties and manage inventory."
          >
            {filteredVillas.map((v) => {
              const fallbackCover = getDefaultVillaCover({ name: v.name });
              return (
                <div
                  key={v.id}
                  className="w-[290px] sm:w-[325px] xl:w-[340px] shrink-0 snap-start rounded-2xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] overflow-hidden shadow-xs hover:shadow-md transition flex flex-col"
                >
                  <div className="relative h-40 w-full bg-stone-100 dark:bg-[#0D1420] overflow-hidden">
                    <VillaCoverImage
                      src={v.image_url}
                      fallbackSrc={fallbackCover}
                      alt={v.name}
                      className="h-full w-full object-cover"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
                    <div className="absolute top-2.5 left-2.5">
                      <StatusBadge
                        status={v.is_active ? "ACTIVE" : "INACTIVE"}
                        label={v.is_active ? "Active" : "Inactive"}
                        size="sm"
                      />
                    </div>
                    <div className="absolute top-2.5 right-2.5">
                      <span className="rounded-full bg-black/65 backdrop-blur-xs px-2.5 py-0.5 text-[11px] font-semibold text-white">
                        {v.occupied_units_today ?? 0} occupied
                      </span>
                    </div>
                    <div className="absolute bottom-2.5 left-3 right-3 text-white">
                      <h4 className="text-sm font-bold leading-snug truncate">{v.name}</h4>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-white/85 truncate">
                        <MapPin size={11} className="shrink-0" />
                        <span className="truncate">{v.address || "Location not specified"}</span>
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
                    <p className="text-xs text-[#64748B] dark:text-[#8A9AB2] line-clamp-2 min-h-[32px]">
                      {v.description || "No property summary added yet."}
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl bg-stone-50 dark:bg-[#0D1420] border border-[#E5E9F0] dark:border-[#1E293B] px-2.5 py-1.5">
                        <p className="text-[10px] font-semibold uppercase text-stone-500">Units</p>
                        <p className="font-bold text-stone-900 dark:text-[#EDF2F7] tabular-nums">
                          {v.active_unit_count ?? v.unit_count ?? 0}{" "}
                          <span className="font-normal text-stone-500">/ {v.unit_count ?? 0}</span>
                        </p>
                      </div>
                      <div className="rounded-xl bg-stone-50 dark:bg-[#0D1420] border border-[#E5E9F0] dark:border-[#1E293B] px-2.5 py-1.5">
                        <p className="text-[10px] font-semibold uppercase text-stone-500">Occupied Today</p>
                        <p className="font-bold text-stone-900 dark:text-[#EDF2F7] tabular-nums">
                          {v.occupied_units_today ?? 0}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-stone-100 dark:border-[#1E293B] flex items-center justify-between gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDetailModal({ kind: "villa", item: v })}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-stone-700 dark:text-[#B9C5D6] hover:bg-stone-100 dark:hover:bg-[#172130] cursor-pointer"
                      >
                        <Eye size={13} />
                        <span>View</span>
                      </button>
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openModal("villa", v)}
                          title="Edit Villa"
                          className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleVilla(v)}
                          title={v.is_active ? "Deactivate Villa" : "Activate Villa"}
                          className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                        >
                          <Power size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteDialog("villa", v)}
                          title="Delete Villa"
                          className="rounded-lg p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </VillaCardCarousel>
        )
      ) : activeTab === "units" && viewMode === "cards" ? (
        loading ? (
          <div className={`${CARD_STYLES.base} text-center py-10 text-sm text-stone-500 dark:text-[#8A9AB2]`}>
            Loading accommodation units...
          </div>
        ) : filteredUnits.length === 0 ? (
          <div className={`${CARD_STYLES.base} text-center py-10 space-y-2`}>
            <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">
              {activeTableConfig.emptyTitle}
            </p>
            <p className="text-xs text-stone-500 dark:text-[#8A9AB2]">
              {activeTableConfig.emptyDescription}
            </p>
          </div>
        ) : (
          <VillaCardCarousel
            itemCount={filteredUnits.length}
            title={`Accommodation Units (${filteredUnits.length})`}
            subtitle="Slide to inspect capacity, nightly tariff, housekeeping status, or book a stay."
          >
            {filteredUnits.map((u) => {
              const fallbackCover = getDefaultVillaCover({
                name: u.name,
                categoryName: u.category_name,
                villaName: u.villa_name,
              });
              const bookDisabled = !u.is_active || u.housekeeping_status === "Out of Order";
              return (
                <div
                  key={u.id}
                  className="w-[290px] sm:w-[320px] xl:w-[335px] shrink-0 snap-start rounded-2xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] overflow-hidden shadow-xs hover:shadow-md transition flex flex-col"
                >
                  <div className="relative h-40 w-full bg-stone-100 dark:bg-[#0D1420] overflow-hidden">
                    <VillaCoverImage
                      src={u.image_url}
                      fallbackSrc={fallbackCover}
                      alt={u.name}
                      className="h-full w-full object-cover"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                      <StatusBadge
                        status={isUnitAvailable(u) ? "ACTIVE" : "INACTIVE"}
                        label={isUnitAvailable(u) ? "Available" : "Unavailable"}
                        size="sm"
                      />
                    </div>
                    <div className="absolute top-2.5 right-2.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur-xs ${
                          u.housekeeping_status === "Out of Order"
                            ? "bg-rose-600/90 text-white"
                            : u.availability
                              ? "bg-emerald-600/90 text-white"
                              : "bg-amber-600/90 text-white"
                        }`}
                      >
                        {u.housekeeping_status === "Out of Order"
                          ? "Out of Order"
                          : u.availability
                            ? "Available Today"
                            : "Occupied / Held"}
                      </span>
                    </div>
                    <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between gap-2 text-white">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300 truncate">
                          {u.category_name}
                        </p>
                        <h4 className="text-sm font-bold leading-snug truncate">{u.name}</h4>
                      </div>
                      <span className="shrink-0 rounded-lg bg-black/70 px-2 py-0.5 text-xs font-bold tabular-nums text-[#FFB02E]">
                        {villaMoney(u.base_rate)}
                        <span className="text-[10px] font-normal text-white/80">/nt</span>
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 flex-1 flex flex-col justify-between gap-2.5">
                    <div>
                      <p className="text-xs font-medium text-stone-700 dark:text-stone-300 truncate">
                        {u.villa_name}
                      </p>
                      <div className="mt-1.5 flex items-center gap-3 text-xs text-[#64748B] dark:text-[#8A9AB2]">
                        <span className="inline-flex items-center gap-1">
                          <Users size={12} />
                          {u.capacity} guests
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <BedDouble size={12} />
                          {u.bedrooms} BR
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-stone-500 dark:text-[#8A9AB2]">
                        Housekeeping
                      </span>
                      <select
                        aria-label={`Card housekeeping for ${u.name}`}
                        value={u.housekeeping_status}
                        onChange={(e) => handleHousekeepingChange(u, e.target.value)}
                        className={`${INPUT_STYLES.select} !w-[140px] !py-1 text-xs`}
                      >
                        {HOUSEKEEPING_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="pt-2 border-t border-stone-100 dark:border-[#1E293B] flex items-center justify-between gap-1.5">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setDetailModal({ kind: "unit", item: u })}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-stone-700 dark:text-[#B9C5D6] hover:bg-stone-100 dark:hover:bg-[#172130] cursor-pointer"
                        >
                          <Eye size={13} />
                          <span>View</span>
                        </button>
                        <button
                          type="button"
                          disabled={bookDisabled}
                          onClick={() => navigate(`/villas/bookings?unitId=${u.id}`)}
                          title={
                            bookDisabled
                              ? "Unit unavailable for booking (Inactive or Out of Order)"
                              : "Create Stay for Unit"
                          }
                          className="rounded-lg bg-amber-50 dark:bg-[#30251C] px-2.5 py-1 text-xs font-semibold text-amber-800 dark:text-[#FFB02E] hover:bg-amber-100 dark:hover:bg-[#3D2E22] disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                        >
                          Book
                        </button>
                      </div>
                      <div className="inline-flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => openModal("unit", u)}
                          title="Edit Unit"
                          className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleUnit(u)}
                          title={u.is_active ? "Mark Unavailable" : "Mark Available"}
                          className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                        >
                          <Power size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteDialog("unit", u)}
                          title="Delete Unit"
                          className="rounded-lg p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </VillaCardCarousel>
        )
      ) : (
        /* ALIGNED DATA TABLE */
        <>
          {/* Bulk delete selection toolbar (never shown on categories or housekeeping) */}
          {selectedIds.size > 0 && ["villas", "units", "rates", "blocks"].includes(activeTab) && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20 px-4 py-2.5">
              <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {selectedIds.size} record{selectedIds.size !== 1 ? "s" : ""} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIds(new Set());
                    setBulkFailures([]);
                  }}
                  className={BUTTON_VARIANTS.secondary}
                >
                  Clear Selection
                </button>
                <button
                  type="button"
                  onClick={() => setBulkConfirmOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/20 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/40 transition cursor-pointer"
                >
                  <Trash2 size={13} />
                  Delete Selected
                </button>
              </div>
            </div>
          )}

          {bulkFailures.length > 0 && (
            <div
              role="status"
              className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/20 px-4 py-3 text-xs text-rose-800 dark:text-rose-200"
            >
              <p className="font-semibold">{bulkFailures.length} record{bulkFailures.length !== 1 ? "s" : ""} could not be deleted:</p>
              <ul className="mt-1 space-y-1">
                {bulkFailures.map(({ id, name, reason }) => (
                  <li key={id}><span className="font-medium">{name}:</span> {reason}</li>
                ))}
              </ul>
            </div>
          )}

          <VillaDataTable
            columns={activeTableConfig.columns}
            rows={paged.items}
            loading={loading}
            loadingMessage="Loading Villas & Units data..."
            emptyTitle={activeTableConfig.emptyTitle}
            emptyDescription={activeTableConfig.emptyDescription}
            tableMinWidth={activeTableConfig.minWidth}
            pagination={{
              currentPage: paged.currentPage,
              totalPages: paged.totalPages,
              totalRecords: paged.totalRecords,
              pageSize: PAGE_SIZE,
              onPageChange: setPage,
            }}
            {...(["villas", "units", "rates", "blocks"].includes(activeTab)
              ? {
                  selectedIds,
                  onSelectRow: handleSelectRow,
                  onSelectAll: handleSelectAll,
                  isRowSelectable,
                }
              : {})}
          />
        </>
      )}

      {/* CREATE / EDIT MODAL */}
      <Modal
        isOpen={Boolean(modalState)}
        onClose={closeEditModal}
        title={
          modalState
            ? `${modalState.mode === "edit" ? "Edit" : "Create"} ${
                {
                  villa: "Villa Property",
                  category: "Unit Category",
                  unit: "Accommodation Unit",
                  rate: "Seasonal Rate",
                  block: "Availability Block",
                }[modalState.type]
              }`
            : ""
        }
        size={modalState?.type === "unit" || modalState?.type === "villa" ? "lg" : "md"}
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <button
              type="button"
              onClick={closeEditModal}
              disabled={saving}
              className={BUTTON_VARIANTS.secondary}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="villas-inventory-modal-form"
              disabled={saving}
              className={BUTTON_VARIANTS.primary}
            >
              {saving ? "Saving..." : modalState?.mode === "edit" ? "Save Changes" : "Create"}
            </button>
          </div>
        }
      >
        <form id="villas-inventory-modal-form" onSubmit={handleSaveModal} onChange={() => setValidationErrors({})} className="space-y-4">
          {formError && (
            <AlertBanner variant="error" message={formError} onDismiss={() => setFormError("")} />
          )}

          {modalState?.type === "villa" && (
            <div className="grid grid-cols-1 gap-4">
              {renderImageUploader(
                getDefaultVillaCover({ name: form.name }),
                form.name || "Villa cover"
              )}
              <div>
                <label className="block text-xs font-semibold mb-1">Villa Name *</label>
                <input
                  type="text"
                  required
                  value={form.name || ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Sahyadri Ridge Villa"
                  className={INPUT_STYLES.base}
                />
                {validationErrors.name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{validationErrors.name}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Address / Wing</label>
                <input
                  type="text"
                  value={form.address || ""}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="e.g. North Ridge Estate"
                  className={INPUT_STYLES.base}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Description</label>
                <textarea
                  rows={2}
                  value={form.description || ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Property highlights and overview..."
                  className={INPUT_STYLES.base}
                />
              </div>
              <div className="border-t border-stone-200 dark:border-stone-800 pt-3">
                <p className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2.5">
                  Check-in / Check-out Policy Overrides (Optional)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Check-in Time</label>
                    <input
                      type="time"
                      value={form.check_in_time || ""}
                      onChange={(e) => setForm({ ...form, check_in_time: e.target.value })}
                      className={INPUT_STYLES.base}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Check-out Time</label>
                    <input
                      type="time"
                      value={form.check_out_time || ""}
                      onChange={(e) => setForm({ ...form, check_out_time: e.target.value })}
                      className={INPUT_STYLES.base}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Late Checkout Fee (₹)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.late_checkout_fee ?? ""}
                      onChange={(e) => setForm({ ...form, late_checkout_fee: e.target.value })}
                      placeholder="Inherit property default"
                      className={INPUT_STYLES.base}
                    />
                    {validationErrors.late_checkout_fee && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{validationErrors.late_checkout_fee}</p>}
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] text-stone-500">
                  Leave blank to inherit property-level defaults from Settings.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.is_active)}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                <span>Villa property is active</span>
              </label>
            </div>
          )}

          {modalState?.type === "category" && (
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  value={form.name || ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Poolside Suite"
                  className={INPUT_STYLES.base}
                />
                {validationErrors.name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{validationErrors.name}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Description</label>
                <textarea
                  rows={2}
                  value={form.description || ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Amenities & room tier summary..."
                  className={INPUT_STYLES.base}
                />
              </div>
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.is_active)}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                <span>Category is active</span>
              </label>
            </div>
          )}

          {modalState?.type === "unit" && (
            <div className="space-y-5">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">
                  Unit Information
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Unit Name *</label>
                    <input
                      type="text"
                      required
                      value={form.name || ""}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Horizon Plunge Suite"
                      className={INPUT_STYLES.base}
                    />
                    {validationErrors.name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{validationErrors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Parent Villa *</label>
                    <select
                      required
                      value={form.villa_id || ""}
                      onChange={(e) => setForm({ ...form, villa_id: e.target.value })}
                      className={INPUT_STYLES.select}
                    >
                      <option value="">Select Villa</option>
                      {villas.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                    {validationErrors.villa_id && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{validationErrors.villa_id}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Unit Category *</label>
                    <select
                      required
                      value={form.category_id || ""}
                      onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                      className={INPUT_STYLES.select}
                    >
                      <option value="">Select Category</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {validationErrors.category_id && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{validationErrors.category_id}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Description</label>
                    <input
                      type="text"
                      value={form.description || ""}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="View, terrace, plunge pool..."
                      className={INPUT_STYLES.base}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-stone-200 dark:border-stone-800 pt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">
                  Capacity &amp; Pricing
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Max Guests *</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      required
                      value={form.capacity ?? 2}
                      onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                      className={INPUT_STYLES.base}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Bedrooms *</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      required
                      value={form.bedrooms ?? 1}
                      onChange={(e) => setForm({ ...form, bedrooms: e.target.value })}
                      className={INPUT_STYLES.base}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Base Rate / Night (₹) *</label>
                    <input
                      type="number"
                      min={1}
                      step="0.01"
                      required
                      value={form.base_rate ?? ""}
                      onChange={(e) => setForm({ ...form, base_rate: e.target.value })}
                      className={INPUT_STYLES.base}
                    />
                    {validationErrors.base_rate && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{validationErrors.base_rate}</p>}
                  </div>
                </div>
              </div>

              <div className="border-t border-stone-200 dark:border-stone-800 pt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
                  Operational Information &amp; Cover Image
                </h4>
                <div className="space-y-3">
                  {renderImageUploader(
                    getDefaultVillaCover({
                      name: form.name,
                      categoryName:
                        categories.find((c) => String(c.id) === String(form.category_id))?.name || "",
                      villaName:
                        villas.find((v) => String(v.id) === String(form.villa_id))?.name || "",
                    }),
                    form.name || "Unit cover"
                  )}
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(form.is_active)}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    />
                    <span>Unit is active and open for bookings</span>
                  </label>
                </div>
              </div>

              <div className="border-t border-stone-200 dark:border-stone-800 pt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
                  Check-in / Check-out Policy Overrides (Optional)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Check-in Time</label>
                    <input
                      type="time"
                      value={form.check_in_time || ""}
                      onChange={(e) => setForm({ ...form, check_in_time: e.target.value })}
                      className={INPUT_STYLES.base}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Check-out Time</label>
                    <input
                      type="time"
                      value={form.check_out_time || ""}
                      onChange={(e) => setForm({ ...form, check_out_time: e.target.value })}
                      className={INPUT_STYLES.base}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Late Checkout Fee (₹)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.late_checkout_fee ?? ""}
                      onChange={(e) => setForm({ ...form, late_checkout_fee: e.target.value })}
                      placeholder="Inherit villa / default"
                      className={INPUT_STYLES.base}
                    />
                    {validationErrors.late_checkout_fee && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{validationErrors.late_checkout_fee}</p>}
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] text-stone-500">
                  Overrides parent Villa and property-level defaults when configured.
                </p>
              </div>
            </div>
          )}

          {modalState?.type === "rate" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1">Accommodation Unit *</label>
                <select
                  required
                  value={form.unit_id || ""}
                  onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
                  className={INPUT_STYLES.select}
                >
                  <option value="">Select Unit</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.villa_name})
                    </option>
                  ))}
                </select>
                {validationErrors.unit_id && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{validationErrors.unit_id}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1">Season Name *</label>
                <input
                  type="text"
                  required
                  value={form.name || ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Festive Winter Peak"
                  className={INPUT_STYLES.base}
                />
                {validationErrors.name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{validationErrors.name}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Start Date *</label>
                <input
                  type="date"
                  required
                  value={form.start_date || ""}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  className={INPUT_STYLES.base}
                />
                {validationErrors.start_date && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{validationErrors.start_date}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">End Date *</label>
                <input
                  type="date"
                  required
                  value={form.end_date || ""}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  className={INPUT_STYLES.base}
                />
                {validationErrors.end_date && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{validationErrors.end_date}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1">Seasonal Nightly Rate (₹) *</label>
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  required
                  value={form.nightly_rate ?? ""}
                  onChange={(e) => setForm({ ...form, nightly_rate: e.target.value })}
                  className={INPUT_STYLES.base}
                />
                {validationErrors.nightly_rate && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{validationErrors.nightly_rate}</p>}
              </div>
            </div>
          )}

          {modalState?.type === "block" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Accommodation Unit *</label>
                <select
                  required
                  value={form.unit_id || ""}
                  onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
                  className={INPUT_STYLES.select}
                >
                  <option value="">Select Unit</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.villa_name})
                    </option>
                  ))}
                </select>
                {validationErrors.unit_id && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{validationErrors.unit_id}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Block Type *</label>
                <select
                  value={form.block_type || "Maintenance"}
                  onChange={(e) => setForm({ ...form, block_type: e.target.value })}
                  className={INPUT_STYLES.select}
                >
                  {BLOCK_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Start Date *</label>
                <input
                  type="date"
                  required
                  value={form.start_date || ""}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  className={INPUT_STYLES.base}
                />
                {validationErrors.start_date && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{validationErrors.start_date}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">End Date *</label>
                <input
                  type="date"
                  required
                  value={form.end_date || ""}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  className={INPUT_STYLES.base}
                />
                {validationErrors.end_date && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{validationErrors.end_date}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1">Reason *</label>
                <input
                  type="text"
                  required
                  value={form.reason || ""}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="e.g. Annual AC & plunge pool maintenance"
                  className={INPUT_STYLES.base}
                />
                {validationErrors.reason && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{validationErrors.reason}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1">Detailed Notes</label>
                <textarea
                  rows={2}
                  value={form.description || ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Optional instructions for front desk and engineering..."
                  className={INPUT_STYLES.base}
                />
              </div>
            </div>
          )}
        </form>
      </Modal>

      {/* VILLA / UNIT DETAIL VIEW MODAL */}
      <Modal
        isOpen={Boolean(detailModal)}
        onClose={() => setDetailModal(null)}
        title={detailModal?.item?.name || "Property Details"}
        size="lg"
        footer={
          detailModal && (
            <div className="flex items-center justify-between gap-2.5 w-full">
              <button
                type="button"
                onClick={() => setDetailModal(null)}
                className={BUTTON_VARIANTS.secondary}
              >
                Close
              </button>
              <div className="flex items-center gap-2">
                {detailModal.kind === "unit" && (
                  <button
                    type="button"
                    disabled={
                      !detailModal.item?.is_active ||
                      detailModal.item?.housekeeping_status === "Out of Order"
                    }
                    onClick={() => {
                      const unitId = detailModal.item.id;
                      setDetailModal(null);
                      navigate(`/villas/bookings?unitId=${unitId}`);
                    }}
                    className={`${BUTTON_VARIANTS.secondary} disabled:opacity-40 disabled:pointer-events-none`}
                  >
                    Create Stay
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const { kind, item } = detailModal;
                    setDetailModal(null);
                    openModal(kind, item);
                  }}
                  className={BUTTON_VARIANTS.primary}
                >
                  <Edit3 size={14} />
                  <span>Edit {detailModal.kind === "villa" ? "Villa" : "Unit"}</span>
                </button>
              </div>
            </div>
          )
        }
      >
        {detailModal?.kind === "villa" && (
          <div className="space-y-4">
            <div className="relative h-52 w-full overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800">
              <VillaCoverImage
                src={detailModal.item.image_url}
                fallbackSrc={getDefaultVillaCover({ name: detailModal.item.name })}
                alt={detailModal.item.name}
                className="h-full w-full object-cover"
              />
              <div className="absolute top-3 left-3">
                <StatusBadge
                  status={detailModal.item.is_active ? "ACTIVE" : "INACTIVE"}
                  label={detailModal.item.is_active ? "Active" : "Inactive"}
                  size="sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl bg-stone-50 dark:bg-[#0D1420] border border-[#E5E9F0] dark:border-[#1E293B] p-3">
                <p className="text-[10px] font-bold uppercase text-stone-500">Location</p>
                <p className="mt-1 font-semibold text-stone-900 dark:text-[#EDF2F7]">
                  {detailModal.item.address || "Not specified"}
                </p>
              </div>
              <div className="rounded-xl bg-stone-50 dark:bg-[#0D1420] border border-[#E5E9F0] dark:border-[#1E293B] p-3">
                <p className="text-[10px] font-bold uppercase text-stone-500">Units</p>
                <p className="mt-1 font-semibold text-stone-900 dark:text-[#EDF2F7]">
                  {detailModal.item.active_unit_count ?? detailModal.item.unit_count ?? 0} active /{" "}
                  {detailModal.item.unit_count ?? 0} total
                </p>
              </div>
              <div className="rounded-xl bg-stone-50 dark:bg-[#0D1420] border border-[#E5E9F0] dark:border-[#1E293B] p-3">
                <p className="text-[10px] font-bold uppercase text-stone-500">Occupied Today</p>
                <p className="mt-1 font-semibold text-stone-900 dark:text-[#EDF2F7]">
                  {detailModal.item.occupied_units_today ?? 0}
                </p>
              </div>
              <div className="rounded-xl bg-stone-50 dark:bg-[#0D1420] border border-[#E5E9F0] dark:border-[#1E293B] p-3 sm:col-span-3">
                <p className="text-[10px] font-bold uppercase text-stone-500">Check-in / Check-out Policy</p>
                <p className="mt-1 font-semibold text-stone-900 dark:text-[#EDF2F7]">
                  Check-in: {detailModal.item.effective_check_in_time_display || formatTime12h(detailModal.item.check_in_time || "14:00")}
                  {" · "}
                  Check-out: {detailModal.item.effective_check_out_time_display || formatTime12h(detailModal.item.check_out_time || "11:00")}
                  {" · "}
                  Late Fee:{" "}
                  {detailModal.item.effective_late_checkout_fee !== null &&
                  detailModal.item.effective_late_checkout_fee !== undefined
                    ? villaMoney(detailModal.item.effective_late_checkout_fee)
                    : "Not configured"}
                </p>
              </div>
            </div>

            {detailModal.item.description && (
              <p className="text-xs leading-relaxed text-stone-600 dark:text-[#B9C5D6]">
                {detailModal.item.description}
              </p>
            )}

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
                Units in {detailModal.item.name}
              </h4>
              <div className="divide-y divide-stone-100 dark:divide-stone-800 rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] overflow-hidden">
                {units.filter((u) => u.villa_id === detailModal.item.id).length === 0 ? (
                  <p className="p-3 text-xs text-stone-500">No accommodation units linked yet.</p>
                ) : (
                  units
                    .filter((u) => u.villa_id === detailModal.item.id)
                    .map((u) => (
                      <div
                        key={u.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs bg-white dark:bg-[#101722]"
                      >
                        <div>
                          <span className="font-semibold text-stone-900 dark:text-[#EDF2F7]">
                            {u.name}
                          </span>
                          <span className="ml-2 text-stone-500 dark:text-[#8A9AB2]">
                            {u.category_name} · {u.capacity} guests
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums">{villaMoney(u.base_rate)}</span>
                          <StatusBadge status={u.housekeeping_status} size="sm" />
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        {detailModal?.kind === "unit" && (
          <div className="space-y-4">
            <div className="relative h-52 w-full overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800">
              <VillaCoverImage
                src={detailModal.item.image_url}
                fallbackSrc={getDefaultVillaCover({
                  name: detailModal.item.name,
                  categoryName: detailModal.item.category_name,
                  villaName: detailModal.item.villa_name,
                })}
                alt={detailModal.item.name}
                className="h-full w-full object-cover"
              />
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <StatusBadge
                  status={detailModal.item.is_active ? "ACTIVE" : "INACTIVE"}
                  label={detailModal.item.is_active ? "Active" : "Inactive"}
                  size="sm"
                />
                <StatusBadge status={detailModal.item.housekeeping_status} size="sm" />
              </div>
              <div className="absolute bottom-3 right-3 rounded-lg bg-black/75 px-2.5 py-1 text-xs font-bold text-[#FFB02E]">
                {villaMoney(detailModal.item.base_rate)} / night
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-xl bg-stone-50 dark:bg-[#0D1420] border border-[#E5E9F0] dark:border-[#1E293B] p-3">
                <p className="text-[10px] font-bold uppercase text-stone-500">Property</p>
                <p className="mt-1 font-semibold text-stone-900 dark:text-[#EDF2F7] truncate">
                  {detailModal.item.villa_name}
                </p>
              </div>
              <div className="rounded-xl bg-stone-50 dark:bg-[#0D1420] border border-[#E5E9F0] dark:border-[#1E293B] p-3">
                <p className="text-[10px] font-bold uppercase text-stone-500">Category</p>
                <p className="mt-1 font-semibold text-stone-900 dark:text-[#EDF2F7] truncate">
                  {detailModal.item.category_name}
                </p>
              </div>
              <div className="rounded-xl bg-stone-50 dark:bg-[#0D1420] border border-[#E5E9F0] dark:border-[#1E293B] p-3">
                <p className="text-[10px] font-bold uppercase text-stone-500">Capacity</p>
                <p className="mt-1 font-semibold text-stone-900 dark:text-[#EDF2F7]">
                  {detailModal.item.capacity} guests · {detailModal.item.bedrooms} BR
                </p>
              </div>
              <div className="rounded-xl bg-stone-50 dark:bg-[#0D1420] border border-[#E5E9F0] dark:border-[#1E293B] p-3">
                <p className="text-[10px] font-bold uppercase text-stone-500">Today</p>
                <p className="mt-1 font-semibold text-stone-900 dark:text-[#EDF2F7]">
                  {detailModal.item.availability ? "Available" : "Unavailable"}
                </p>
              </div>
              <div className="rounded-xl bg-stone-50 dark:bg-[#0D1420] border border-[#E5E9F0] dark:border-[#1E293B] p-3 col-span-2 sm:col-span-4">
                <p className="text-[10px] font-bold uppercase text-stone-500">Check-in / Check-out Policy</p>
                <p className="mt-1 font-semibold text-stone-900 dark:text-[#EDF2F7]">
                  Check-in: {detailModal.item.effective_check_in_time_display || formatTime12h(detailModal.item.check_in_time || "14:00")}
                  {" · "}
                  Check-out: {detailModal.item.effective_check_out_time_display || formatTime12h(detailModal.item.check_out_time || "11:00")}
                  {" · "}
                  Late Fee:{" "}
                  {detailModal.item.effective_late_checkout_fee !== null &&
                  detailModal.item.effective_late_checkout_fee !== undefined
                    ? villaMoney(detailModal.item.effective_late_checkout_fee)
                    : "Not configured"}
                </p>
              </div>
            </div>

            {detailModal.item.description && (
              <p className="text-xs leading-relaxed text-stone-600 dark:text-[#B9C5D6]">
                {detailModal.item.description}
              </p>
            )}
          </div>
        )}
      </Modal>

      <DeleteConfirm
        isOpen={Boolean(deleteTarget)}
        onClose={() => !deleteLoading && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title={deleteTarget?.title || "Confirm Deletion"}
        recordName={deleteTarget?.recordName || ""}
        message={
          deleteTarget?.message ||
          "Records linked to active units or historical stays are protected from deletion."
        }
        impactSummary={deleteTarget?.impactSummary || null}
        confirmButtonText="Delete"
        loading={deleteLoading}
        error={deleteError}
      />

      {/* BULK DELETE CONFIRMATION MODAL */}
      <Modal
        isOpen={bulkConfirmOpen}
        onClose={() => !bulkDeleting && setBulkConfirmOpen(false)}
        title={`Delete ${selectedIds.size} Selected Record${selectedIds.size !== 1 ? "s" : ""}`}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <button
              type="button"
              onClick={() => setBulkConfirmOpen(false)}
              disabled={bulkDeleting}
              className={BUTTON_VARIANTS.secondary}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60 disabled:pointer-events-none cursor-pointer transition"
            >
              <Trash2 size={14} />
              {bulkDeleting ? "Deleting..." : `Delete ${selectedIds.size} Record${selectedIds.size !== 1 ? "s" : ""}`}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[#64748B] dark:text-[#8A9AB2]">
            The following records will be permanently deleted. Records that do not meet deletion
            requirements (e.g. villas with units, categories with assigned units) will be skipped.
          </p>
          <ul className="max-h-48 overflow-y-auto divide-y divide-[#E5E9F0] dark:divide-[#1E293B] rounded-xl border border-[#E5E9F0] dark:border-[#1E293B]">
            {Array.from(selectedIds).map((id) => (
              <li key={id} className="px-3 py-2 text-sm font-medium text-[#172033] dark:text-[#F8FAFC]">
                {getSelectedRecordName(id)}
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
            This action cannot be undone.
          </p>
        </div>
      </Modal>
    </div>
  );
}
