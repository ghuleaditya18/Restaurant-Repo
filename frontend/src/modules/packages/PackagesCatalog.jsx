import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarOff,
  CalendarPlus,
  CheckCircle2,
  Edit3,
  Eye,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  List,
  Package,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Upload,
} from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import BulkSelectionBar from "../../components/BulkSelectionBar";
import DeleteConfirm from "../../components/DeleteConfirm";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import Pagination from "../../components/Pagination";
import StatCard from "../../components/StatCard";
import StatusBadge from "../../components/StatusBadge";
import { useNotification } from "../../context/NotificationContext";
import useBulkSelection from "../../hooks/useBulkSelection";
import { BUTTON_VARIANTS, CARD_STYLES, INPUT_STYLES } from "../../utils/themeTokens";
import VillaCardCarousel from "../villas/VillaCardCarousel";
import VillaDataTable from "../villas/VillaDataTable";
import PackageCoverImage from "./PackageCoverImage";
import {
  getDefaultPackageCover,
  kolkataTodayIso,
  notifyPackagesRefresh,
  packagesApi,
  pkgDate,
  pkgDateRange,
  pkgError,
  pkgMoney,
} from "./packagesApi";

const CATEGORIES = ["Couple", "Family", "Weekend", "Wellness", "Adventure", "Event", "Seasonal"];
const STATUSES = ["Draft", "Published", "Upcoming", "Available", "Paused", "Expired", "Archived"];
const PRICING_TYPES = ["Per Package", "Per Person", "Per Night"];
const INCLUSION_TYPES = [
  "Unit Stay",
  "Meal Plan",
  "Spa Service",
  "Activity",
  "Transport Service",
  "Amenity",
  "Other",
];

const INITIAL_FORM = {
  name: "",
  package_code: "",
  category: "Couple",
  description: "",
  duration_nights: 2,
  min_guests: 1,
  max_guests: 2,
  pricing_type: "Per Package",
  price: "",
  valid_from: kolkataTodayIso(0),
  valid_to: kolkataTodayIso(90),
  applicable_accommodation_types: "",
  is_customizable: false,
  is_seasonal_offer: false,
  offer_badge: "",
  terms_and_conditions: "",
  exclusions: "",
};

const INITIAL_ITEM_FORM = {
  inclusion_type: "Unit Stay",
  description: "",
  quantity: 1,
  is_optional: false,
  reference_module: "",
  reference_id: "",
  reference_label: "",
  notes: "",
};

const INITIAL_BLACKOUT_FORM = {
  start_date: kolkataTodayIso(7),
  end_date: kolkataTodayIso(9),
  reason: "",
  notes: "",
  is_active: true,
};

export default function PackagesCatalog({ seasonalOnly = false }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showSuccess, showError } = useNotification();
  const { selectedIds, toggle, toggleMany, clear } = useBulkSelection();

  const [packages, setPackages] = useState([]);
  const [categories, setCategories] = useState([]);
  const [references, setReferences] = useState({});
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get("category") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [viewMode, setViewMode] = useState("table");
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 10;

  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkFailures, setBulkFailures] = useState([]);

  // Create / Edit Package Modal
  const [formOpen, setFormOpen] = useState(Boolean(searchParams.get("new")));
  const [editingPkg, setEditingPkg] = useState(null);
  const [form, setForm] = useState(() => ({
    ...INITIAL_FORM,
    category: seasonalOnly ? "Seasonal" : "Couple",
    is_seasonal_offer: seasonalOnly,
  }));
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Detail & Management Modal (Inclusions, Media, Blackouts, History)
  const [detailPkg, setDetailPkg] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState("overview");

  // Inclusion editor inside Detail Modal
  const [itemForm, setItemForm] = useState(INITIAL_ITEM_FORM);
  const [editingItemId, setEditingItemId] = useState(null);
  const [savingItem, setSavingItem] = useState(false);
  const [itemError, setItemError] = useState("");

  // Media uploader inside Detail Modal
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState("");
  const [mediaType, setMediaType] = useState("cover");
  const [mediaCaption, setMediaCaption] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState("");

  // Blackout editor inside Detail Modal
  const [blackoutForm, setBlackoutForm] = useState(INITIAL_BLACKOUT_FORM);
  const [editingBlackoutId, setEditingBlackoutId] = useState(null);
  const [savingBlackout, setSavingBlackout] = useState(false);
  const [blackoutError, setBlackoutError] = useState("");

  // Confirmations
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const loadPackages = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const [pkgRes, catRes] = await Promise.all([
        packagesApi.list({
          search: searchQuery.trim() || undefined,
          category: categoryFilter || undefined,
          status: statusFilter || undefined,
          seasonal_only: seasonalOnly || undefined,
          page,
          page_size: pageSize,
        }),
        packagesApi.categories(),
      ]);
      setPackages(pkgRes.data?.items || []);
      setTotalRecords(pkgRes.data?.total ?? 0);
      setTotalPages(pkgRes.data?.total_pages ?? 1);
      setCategories(catRes.data || []);
    } catch (err) {
      setPageError(pkgError(err));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, categoryFilter, statusFilter, seasonalOnly, page]);

  const loadReferences = useCallback(async () => {
    try {
      const res = await packagesApi.inclusionReferences();
      setReferences(res.data || {});
    } catch {
      setReferences({});
    }
  }, []);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  useEffect(() => {
    loadReferences();
  }, [loadReferences]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, categoryFilter, statusFilter, seasonalOnly]);

  useEffect(() => {
    clear();
    setBulkFailures([]);
  }, [searchQuery, categoryFilter, statusFilter, seasonalOnly, page, clear]);

  const handleBulkDeletePackages = async () => {
    setBulkDeleting(true);
    setBulkFailures([]);
    const deleted = [];
    const failed = [];
    for (const id of selectedIds) {
      const target = packages.find((p) => p.id === id);
      try {
        await packagesApi.remove(id);
        deleted.push(id);
      } catch (err) {
        failed.push({ id, name: target ? `${target.name} (${target.package_code})` : `#${id}`, reason: pkgError(err) });
      }
    }
    await loadPackages();
    notifyPackagesRefresh();
    clear();
    failed.forEach((f) => toggle(f.id));
    setBulkFailures(failed);
    setBulkDeleting(false);
    setBulkConfirmOpen(false);
    if (deleted.length > 0 && failed.length === 0) {
      showSuccess(`Deleted ${deleted.length} package${deleted.length === 1 ? "" : "s"}.`);
    } else if (deleted.length > 0 && failed.length > 0) {
      showSuccess(`Deleted ${deleted.length} package(s). ${failed.length} could not be deleted.`);
    } else if (failed.length > 0) {
      showError("Selected packages with active bookings cannot be deleted.");
    }
  };

  useEffect(() => {
    if (searchParams.get("new")) {
      setEditingPkg(null);
      setForm({
        ...INITIAL_FORM,
        category: seasonalOnly ? "Seasonal" : "Couple",
        is_seasonal_offer: seasonalOnly,
      });
      setFormOpen(true);
    }
  }, [searchParams, seasonalOnly]);

  const openDetail = async (pkgId, initialTab = "overview") => {
    setDetailTab(initialTab);
    setDetailLoading(true);
    setItemError("");
    setMediaError("");
    setBlackoutError("");
    try {
      const res = await packagesApi.detail(pkgId);
      setDetailPkg(res.data);
    } catch (err) {
      showError(pkgError(err));
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async () => {
    if (!detailPkg) return;
    await Promise.all([openDetail(detailPkg.id, detailTab), loadPackages()]);
  };

  const closeFormModal = () => {
    setFormOpen(false);
    if (searchParams.get("new")) {
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
  };

  const openCreateModal = () => {
    setEditingPkg(null);
    setFormError("");
    setFieldErrors({});
    setForm({
      ...INITIAL_FORM,
      category: seasonalOnly ? "Seasonal" : "Couple",
      is_seasonal_offer: seasonalOnly,
    });
    setFormOpen(true);
  };

  const openEditModal = (pkg) => {
    setEditingPkg(pkg);
    setFormError("");
    setFieldErrors({});
    setForm({
      name: pkg.name || "",
      package_code: pkg.package_code || "",
      category: pkg.category || "Couple",
      description: pkg.description || "",
      duration_nights: pkg.duration_nights ?? 2,
      min_guests: pkg.min_guests ?? 1,
      max_guests: pkg.max_guests ?? 2,
      pricing_type: pkg.pricing_type || "Per Package",
      price: pkg.price ?? "",
      valid_from: pkg.valid_from || kolkataTodayIso(0),
      valid_to: pkg.valid_to || kolkataTodayIso(90),
      applicable_accommodation_types: pkg.applicable_accommodation_types || "",
      is_customizable: Boolean(pkg.is_customizable),
      is_seasonal_offer: Boolean(pkg.is_seasonal_offer),
      offer_badge: pkg.offer_badge || "",
      terms_and_conditions: pkg.terms_and_conditions || "",
      exclusions: pkg.exclusions || "",
    });
    setFormOpen(true);
  };

  const handleSavePackage = async (e) => {
    e.preventDefault();
    setFormError("");
    const nextFieldErrors = {};

    const trimmedName = form.name.trim();
    if (trimmedName.length < 2) {
      nextFieldErrors.name = "Package name must contain at least 2 characters.";
    }
    const priceNum = Number(form.price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) nextFieldErrors.price = "Package price must be greater than zero.";
    if (Number(form.duration_nights) < 1) nextFieldErrors.duration_nights = "Duration in nights must be at least 1.";
    if (Number(form.min_guests) < 1) {
      nextFieldErrors.min_guests = "Minimum guests must be at least 1.";
    } else if (Number(form.max_guests) < Number(form.min_guests)) {
      nextFieldErrors.max_guests = "Max guests must be at least the minimum guests.";
    }
    if (!form.valid_from || !form.valid_to || form.valid_to < form.valid_from) {
      nextFieldErrors.valid_to = "Valid-to date cannot precede valid-from date.";
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: trimmedName,
        category: form.category,
        description: form.description,
        duration_nights: Number(form.duration_nights),
        min_guests: Number(form.min_guests),
        max_guests: Number(form.max_guests),
        pricing_type: form.pricing_type,
        price: Number(priceNum.toFixed(2)),
        valid_from: form.valid_from,
        valid_to: form.valid_to,
        applicable_accommodation_types: form.applicable_accommodation_types,
        is_customizable: Boolean(form.is_customizable),
        is_seasonal_offer: Boolean(form.is_seasonal_offer || form.category === "Seasonal"),
        offer_badge: form.offer_badge,
        terms_and_conditions: form.terms_and_conditions,
        exclusions: form.exclusions,
      };
      if (editingPkg) {
        await packagesApi.update(editingPkg.id, payload);
        showSuccess(`Package "${trimmedName}" updated.`);
        notifyPackagesRefresh();
        setFormOpen(false);
        await loadPackages();
        if (detailPkg?.id === editingPkg.id) {
          await openDetail(editingPkg.id, detailTab);
        }
      } else {
        const res = await packagesApi.create(payload);
        showSuccess(`Package "${trimmedName}" (${res.data?.package_code || ""}) created as Draft. Add inclusions & media to publish.`);
        notifyPackagesRefresh();
        setFormOpen(false);
        if (searchParams.get("new")) {
          const next = new URLSearchParams(searchParams);
          next.delete("new");
          setSearchParams(next, { replace: true });
        }
        await loadPackages();
        if (res.data?.id) {
          await openDetail(res.data.id, "inclusions");
        }
      }
    } catch (err) {
      setFormError(pkgError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (pkg, targetStatus) => {
    if (!targetStatus || targetStatus === pkg.status) return;
    try {
      await packagesApi.updateStatus(pkg.id, targetStatus);
      showSuccess(`"${pkg.name}" status changed to ${targetStatus}.`);
      notifyPackagesRefresh();
      await loadPackages();
      if (detailPkg?.id === pkg.id) {
        await openDetail(pkg.id, detailTab);
      }
    } catch (err) {
      showError(pkgError(err), "Status Change Blocked");
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    setActionBusy(true);
    setActionError("");
    try {
      const { kind, target } = confirmAction;
      if (kind === "archive") {
        await packagesApi.updateStatus(target.id, "Archived");
        showSuccess(`Package "${target.name}" archived.`);
      } else if (kind === "delete-pkg") {
        await packagesApi.remove(target.id);
        showSuccess(`Package "${target.name}" deleted.`);
        if (detailPkg?.id === target.id) setDetailPkg(null);
      } else if (kind === "delete-item") {
        await packagesApi.deleteItem(target.id);
        showSuccess("Inclusion removed.");
        await refreshDetail();
      } else if (kind === "delete-media") {
        await packagesApi.deleteMedia(target.id);
        showSuccess("Media removed.");
        await refreshDetail();
      } else if (kind === "delete-blackout") {
        await packagesApi.deleteBlackout(target.id);
        showSuccess("Blackout date removed.");
        await refreshDetail();
      }
      setConfirmAction(null);
      await loadPackages();
    } catch (err) {
      setActionError(pkgError(err));
    } finally {
      setActionBusy(false);
    }
  };

  // Inclusion handlers
  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!detailPkg) return;
    setItemError("");
    if (!itemForm.description.trim() || itemForm.description.trim().length < 2) {
      setItemError("Inclusion description is required (minimum 2 characters).");
      return;
    }
    if (Number(itemForm.quantity) < 1) {
      setItemError("Quantity must be at least 1.");
      return;
    }
    setSavingItem(true);
    try {
      const payload = {
        inclusion_type: itemForm.inclusion_type,
        description: itemForm.description.trim(),
        quantity: Number(itemForm.quantity),
        is_optional: Boolean(itemForm.is_optional),
        reference_module: itemForm.reference_module || null,
        reference_id: itemForm.reference_id ? Number(itemForm.reference_id) : null,
        reference_label: itemForm.reference_label || null,
        notes: itemForm.notes?.trim() || null,
      };
      if (editingItemId) {
        await packagesApi.updateItem(editingItemId, payload);
        showSuccess("Inclusion updated.");
      } else {
        await packagesApi.addItem(detailPkg.id, payload);
        showSuccess("Inclusion added.");
      }
      setItemForm(INITIAL_ITEM_FORM);
      setEditingItemId(null);
      await refreshDetail();
    } catch (err) {
      setItemError(pkgError(err));
    } finally {
      setSavingItem(false);
    }
  };

  // Media handlers
  const handleMediaFileChange = (file) => {
    if (!file) return;
    setMediaError("");
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setMediaError("Only JPG, PNG, or WebP images are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMediaError("Image file must be 5 MB or smaller.");
      return;
    }
    if (mediaPreview && mediaPreview.startsWith("blob:")) {
      URL.revokeObjectURL(mediaPreview);
    }
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const handleUploadMedia = async (e) => {
    e.preventDefault();
    if (!detailPkg || !mediaFile) {
      setMediaError("Select an image file first.");
      return;
    }
    setUploadingMedia(true);
    setMediaError("");
    try {
      await packagesApi.uploadMedia(detailPkg.id, mediaFile, mediaType, mediaCaption.trim());
      showSuccess(`${mediaType === "cover" ? "Cover" : "Gallery"} image uploaded.`);
      if (mediaPreview && mediaPreview.startsWith("blob:")) {
        URL.revokeObjectURL(mediaPreview);
      }
      setMediaFile(null);
      setMediaPreview("");
      setMediaCaption("");
      await refreshDetail();
    } catch (err) {
      setMediaError(pkgError(err));
    } finally {
      setUploadingMedia(false);
    }
  };

  // Blackout handlers
  const handleSaveBlackout = async (e) => {
    e.preventDefault();
    if (!detailPkg) return;
    setBlackoutError("");
    if (!blackoutForm.start_date || !blackoutForm.end_date || blackoutForm.end_date < blackoutForm.start_date) {
      setBlackoutError("End date cannot precede start date.");
      return;
    }
    if (!blackoutForm.reason.trim() || blackoutForm.reason.trim().length < 2) {
      setBlackoutError("Blackout reason is required.");
      return;
    }
    setSavingBlackout(true);
    try {
      if (editingBlackoutId) {
        await packagesApi.updateBlackout(editingBlackoutId, {
          start_date: blackoutForm.start_date,
          end_date: blackoutForm.end_date,
          reason: blackoutForm.reason.trim(),
          notes: blackoutForm.notes?.trim() || null,
          is_active: Boolean(blackoutForm.is_active),
        });
        showSuccess("Blackout date updated.");
      } else {
        await packagesApi.createBlackout({
          package_id: detailPkg.id,
          start_date: blackoutForm.start_date,
          end_date: blackoutForm.end_date,
          reason: blackoutForm.reason.trim(),
          notes: blackoutForm.notes?.trim() || null,
          is_active: Boolean(blackoutForm.is_active),
        });
        showSuccess("Blackout date added.");
      }
      setBlackoutForm(INITIAL_BLACKOUT_FORM);
      setEditingBlackoutId(null);
      await refreshDetail();
    } catch (err) {
      setBlackoutError(pkgError(err));
    } finally {
      setSavingBlackout(false);
    }
  };

  const summaryCounts = useMemo(() => {
    return {
      total: totalRecords,
      available: packages.filter((p) => p.status === "Available").length,
      draft: packages.filter((p) => p.status === "Draft").length,
      seasonal: packages.filter((p) => p.is_seasonal_offer || p.category === "Seasonal").length,
    };
  }, [packages, totalRecords]);

  const columns = [
    {
      key: "image",
      label: "",
      width: "w-14",
      headerClassName: "px-2",
      cellClassName: "px-2",
      render: (p) => (
        <div className="h-[48px] w-[48px] rounded-lg overflow-hidden border border-stone-200 dark:border-stone-800 shrink-0">
          <PackageCoverImage
            src={p.cover_image_url}
            fallbackSrc={getDefaultPackageCover({ category: p.category, name: p.name })}
            alt={p.name}
          />
        </div>
      ),
    },
    {
      key: "name",
      label: "Package",
      render: (p) => (
        <div className="min-w-[180px]">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-[#172033] dark:text-[#F8FAFC] truncate max-w-[220px]">
              {p.name}
            </span>
            {p.offer_badge && (
              <span className="rounded-full bg-amber-100 dark:bg-[#30251C] px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-[#FFB02E]">
                {p.offer_badge}
              </span>
            )}
          </div>
          <div className="text-xs font-mono text-[#64748B] dark:text-[#8A9AB2]">
            {p.package_code}
          </div>
        </div>
      ),
    },
    {
      key: "category",
      label: "Category",
      cellClassName: "whitespace-nowrap",
    },
    {
      key: "pricing",
      label: "Price & Stay",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (p) => (
        <div>
          <div className="font-semibold text-amber-700 dark:text-amber-300">
            {pkgMoney(p.price)}
          </div>
          <div className="text-[11px] text-[#64748B] dark:text-[#8A9AB2]">
            {p.pricing_type} · {p.duration_nights}N · {p.min_guests}–{p.max_guests}G
          </div>
        </div>
      ),
    },
    {
      key: "validity",
      label: "Validity",
      cellClassName: "whitespace-nowrap tabular-nums text-xs",
      render: (p) => pkgDateRange(p.valid_from, p.valid_to),
    },
    {
      key: "inclusions",
      label: "Inclusions",
      align: "center",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (p) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openDetail(p.id, "inclusions");
          }}
          className="inline-flex items-center gap-1 rounded-lg bg-stone-100 dark:bg-stone-800 px-2 py-1 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-[#30251C] cursor-pointer"
        >
          <Layers size={12} />
          <span>{p.inclusions_count ?? 0}</span>
        </button>
      ),
    },
    {
      key: "status",
      label: "Status",
      align: "center",
      render: (p) => (
        <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <StatusBadge status={p.status} label={p.status} size="sm" />
        </div>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      cellClassName: "whitespace-nowrap",
      render: (p) => (
        <div className="inline-flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <select
            value={p.status}
            onChange={(e) => handleStatusChange(p, e.target.value)}
            aria-label={`Change status for ${p.name}`}
            className={`${INPUT_STYLES.select} !w-auto min-w-[116px] !py-1 text-xs`}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => openDetail(p.id, "overview")}
            title="View Package Details"
            className="rounded-lg p-1.5 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30 cursor-pointer"
          >
            <Eye size={15} />
          </button>
          <button
            type="button"
            onClick={() => openEditModal(p)}
            title="Edit Package"
            className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <Edit3 size={15} />
          </button>
          <button
            type="button"
            onClick={() =>
              setConfirmAction({
                kind: "delete-pkg",
                target: p,
                title: "Delete Package",
                recordName: `${p.name} (${p.package_code})`,
                message:
                  "Are you sure you want to delete this package? Packages with active bookings cannot be deleted.",
              })
            }
            title="Delete Package"
            className="rounded-lg p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  const availableRefOptions = detailPkg ? references[itemForm.inclusion_type] || [] : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title={seasonalOnly ? "Seasonal Offers" : "Packages"}
        actions={
          <button type="button" onClick={openCreateModal} className={BUTTON_VARIANTS.primary}>
            <Plus size={16} />
            <span>{seasonalOnly ? "Create Seasonal Offer" : "Create Package"}</span>
          </button>
        }
      />

      {pageError && (
        <AlertBanner
          variant="error"
          title="Unable to load packages"
          message={pageError}
          onDismiss={() => setPageError("")}
        />
      )}

      {/* COMPACT KPI SUMMARY */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 w-full">
        <StatCard
          compact
          title={seasonalOnly ? "Seasonal Offers" : "Matching Packages"}
          value={loading ? "—" : summaryCounts.total}
          icon={seasonalOnly ? Tag : Package}
          color="amber"
        />
        <StatCard
          compact
          title="Available"
          value={loading ? "—" : summaryCounts.available}
          icon={CheckCircle2}
          color="emerald"
        />
        <StatCard
          compact
          title="Drafts"
          value={loading ? "—" : summaryCounts.draft}
          icon={Layers}
          color="sky"
        />
        <StatCard
          compact
          title="Categories Configured"
          value={categories.length || CATEGORIES.length}
          icon={Sparkles}
          color="indigo"
        />
      </div>

      {/* SEPARATED TOOLBAR: SEARCH/FILTERS LEFT, TABLE/CARDS TOGGLE RIGHT */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className={`${CARD_STYLES.base} w-fit max-w-full !p-2`}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-56 max-w-full">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search package name or code..."
                className={`${INPUT_STYLES.base} w-full pl-9 !py-1.5 text-xs`}
              />
            </div>

            {!seasonalOnly && (
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter by category"
                className={`${INPUT_STYLES.select} !w-auto min-w-[140px] !py-1.5 text-xs`}
              >
                <option value="">All Categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              className={`${INPUT_STYLES.select} !w-auto min-w-[130px] !py-1.5 text-xs`}
            >
              <option value="">All Statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            {(searchQuery || categoryFilter || statusFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setCategoryFilter("");
                  setStatusFilter("");
                }}
                className={`${BUTTON_VARIANTS.secondary} !py-1.5 !px-3 text-xs`}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="inline-flex rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-1 gap-1 shrink-0 shadow-2xs">
          <button
            type="button"
            onClick={() => setViewMode("table")}
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
            onClick={() => setViewMode("cards")}
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
      </div>

      {/* BULK SELECTION TOOLBAR & PARTIAL FAILURES */}
      <BulkSelectionBar
        count={selectedIds.size}
        onDelete={() => setBulkConfirmOpen(true)}
        onClear={() => {
          clear();
          setBulkFailures([]);
        }}
        deleting={bulkDeleting}
      />

      {bulkFailures.length > 0 && (
        <AlertBanner
          variant="error"
          title="Some packages could not be deleted"
          message={bulkFailures.map((f) => `${f.name}: ${f.reason}`).join(" · ")}
          onDismiss={() => setBulkFailures([])}
        />
      )}

      {/* CARDS CAROUSEL OR DATA TABLE */}
      {viewMode === "cards" ? (
        loading ? (
          <div className={`${CARD_STYLES.base} text-center py-10 text-sm text-stone-500 dark:text-[#8A9AB2]`}>
            Loading packages...
          </div>
        ) : packages.length === 0 ? (
          <div className={`${CARD_STYLES.base} text-center py-10 space-y-2`}>
            <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">
              No packages found
            </p>
            <p className="text-xs text-stone-500 dark:text-[#8A9AB2]">
              Create a new package or clear active filters to view available packages.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <VillaCardCarousel
              itemCount={packages.length}
              title={`${seasonalOnly ? "Seasonal Offers" : "Packages"} (${totalRecords})`}
              subtitle="Slide horizontally or use Previous/Next controls to browse packages."
              rightSlot={
                <label className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] px-2.5 py-1.5 text-xs font-semibold text-stone-700 dark:text-stone-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={packages.length > 0 && packages.every((p) => selectedIds.has(p.id))}
                    onChange={() => {
                      setBulkFailures([]);
                      toggleMany(packages.map((p) => p.id));
                    }}
                    className="h-3.5 w-3.5 rounded border-stone-300 dark:border-stone-600 accent-amber-500 cursor-pointer"
                  />
                  <span>Select All</span>
                </label>
              }
            >
              {packages.map((p) => (
                <div
                  key={p.id}
                  className={`w-[290px] sm:w-[320px] xl:w-[335px] shrink-0 snap-start rounded-2xl border overflow-hidden shadow-xs hover:shadow-md transition flex flex-col justify-between ${
                    selectedIds.has(p.id)
                      ? "border-amber-400 bg-amber-50/30 dark:bg-[#171E2C]"
                      : "border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722]"
                  }`}
                >
                  <div>
                    <div className="relative h-40 w-full overflow-hidden bg-stone-100 dark:bg-[#151D29]">
                      <PackageCoverImage
                        src={p.cover_image_url}
                        fallbackSrc={getDefaultPackageCover({ category: p.category, name: p.name })}
                        alt={p.name}
                      />
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                        <span className="rounded-full bg-[#0D1420]/80 backdrop-blur-xs px-2.5 py-0.5 text-[10px] font-bold text-white">
                          {p.category}
                        </span>
                        {p.offer_badge && (
                          <span className="rounded-full bg-[#F59E0B] px-2 py-0.5 text-[10px] font-bold text-[#0D1420]">
                            {p.offer_badge}
                          </span>
                        )}
                      </div>
                      <div className="absolute top-2.5 right-2.5">
                        <StatusBadge status={p.status} label={p.status} size="sm" />
                      </div>
                    </div>

                    <div className="p-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] font-mono text-stone-500 dark:text-[#8A9AB2]">
                            {p.package_code}
                          </p>
                          <h3 className="text-sm font-bold text-[#172033] dark:text-[#F8FAFC] truncate">
                            {p.name}
                          </h3>
                        </div>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(p.id)}
                          onChange={() => {
                            setBulkFailures([]);
                            toggle(p.id);
                          }}
                          aria-label={`Select ${p.name}`}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-stone-300 dark:border-stone-600 accent-amber-500 cursor-pointer"
                        />
                      </div>

                    <div className="flex items-baseline justify-between gap-2">
                      <div>
                        <span className="text-base font-bold text-amber-700 dark:text-[#FFB02E] tabular-nums">
                          {pkgMoney(p.price)}
                        </span>
                        <span className="ml-1 text-[11px] text-stone-500 dark:text-[#8A9AB2]">
                          / {p.pricing_type}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-stone-600 dark:text-stone-300 tabular-nums">
                        {p.duration_nights}N · {p.min_guests}–{p.max_guests}G
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-[#8A9AB2] border-t border-[#E5E9F0] dark:border-[#1E293B] pt-2">
                      <span>Valid: {pkgDateRange(p.valid_from, p.valid_to)}</span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-stone-600 dark:text-stone-300">
                      <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-[#151D29] px-2 py-0.5 font-medium">
                        <Layers size={11} className="text-amber-600" />
                        {p.inclusions_count ?? 0} inclusions
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-[#151D29] px-2 py-0.5 font-medium">
                        <CalendarOff size={11} className="text-rose-500" />
                        {p.blackouts_count ?? 0} blackouts
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-[#E5E9F0] dark:border-[#1E293B] px-3.5 py-2.5 bg-[#F8FAFC] dark:bg-[#151D29]">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openDetail(p.id, "overview")}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40 cursor-pointer"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(p)}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-200/70 dark:hover:bg-stone-800 cursor-pointer"
                    >
                      Edit
                    </button>
                    <select
                      value={p.status}
                      onChange={(e) => handleStatusChange(p, e.target.value)}
                      aria-label={`Status for ${p.name}`}
                      className={`${INPUT_STYLES.select} !w-auto min-w-[104px] !py-1 text-[11px] font-semibold`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={p.status !== "Available"}
                    onClick={() => navigate(`/packages/bookings?new=1&packageId=${p.id}`)}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#F59E0B] px-2.5 py-1 text-xs font-bold text-[#0D1420] hover:brightness-105 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                  >
                    <CalendarPlus size={12} />
                    <span>Book</span>
                  </button>
                </div>
              </div>
            ))}
          </VillaCardCarousel>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalRecords={totalRecords}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </div>
        )
      ) : (
        <VillaDataTable
          columns={columns}
          rows={packages}
          loading={loading}
          loadingMessage="Loading packages..."
          emptyTitle="No packages found"
          emptyDescription="Create a package to start managing inclusions, media, and bookings."
          tableMinWidth="min-w-[960px]"
          onRowClick={(p) => openDetail(p.id, "overview")}
          selectedIds={selectedIds}
          onSelectRow={(id) => {
            setBulkFailures([]);
            toggle(id);
          }}
          onSelectAll={(ids) => {
            setBulkFailures([]);
            toggleMany(ids);
          }}
          pagination={{
            currentPage: page,
            totalPages,
            totalRecords,
            pageSize,
            onPageChange: setPage,
          }}
        />
      )}

      {/* CREATE / EDIT PACKAGE MODAL (BALANCED 2-COLUMN FORM) */}
      <Modal
        isOpen={formOpen}
        onClose={closeFormModal}
        title={editingPkg ? `Edit Package: ${editingPkg.name}` : "Create New Package"}
        size="lg"
      >
        <form onSubmit={handleSavePackage} className="space-y-4">
          {!editingPkg && (
            <AlertBanner
              variant="info"
              title="Draft Workflow"
              message="New packages are saved as Draft first. Add at least one inclusion before activating."
            />
          )}

          {formError && (
            <AlertBanner variant="error" title="Validation Error" message={formError} />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1">
                Package Name *
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => {
                  setForm((f) => ({ ...f, name: e.target.value }));
                  setFieldErrors((p) => ({ ...p, name: "" }));
                }}
                placeholder="e.g. Honeymoon Sunset Retreat"
                aria-invalid={Boolean(fieldErrors.name)}
                className={`${INPUT_STYLES.base} ${fieldErrors.name ? "border-red-500 focus:border-red-500" : ""}`}
              />
              {fieldErrors.name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.name}</p>}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1">
                Unique Package Code (Auto-Generated)
              </label>
              <input
                type="text"
                readOnly
                disabled
                value={editingPkg ? form.package_code : "Auto-generated unique code on save"}
                className={`${INPUT_STYLES.base} font-mono bg-stone-100 dark:bg-stone-800/80 text-stone-500 dark:text-stone-400 cursor-not-allowed`}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1">
                Category *
              </label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className={INPUT_STYLES.select}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1">
                Pricing Type *
              </label>
              <select
                value={form.pricing_type}
                onChange={(e) => setForm((f) => ({ ...f, pricing_type: e.target.value }))}
                className={INPUT_STYLES.select}
              >
                {PRICING_TYPES.map((pt) => (
                  <option key={pt} value={pt}>
                    {pt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1">
                Package Price (INR) *
              </label>
              <input
                type="number"
                step="0.01"
                min="1"
                required
                value={form.price}
                onChange={(e) => {
                  setForm((f) => ({ ...f, price: e.target.value }));
                  setFieldErrors((p) => ({ ...p, price: "" }));
                }}
                placeholder="e.g. 24999.00"
                aria-invalid={Boolean(fieldErrors.price)}
                className={`${INPUT_STYLES.base} ${fieldErrors.price ? "border-red-500 focus:border-red-500" : ""}`}
              />
              {fieldErrors.price && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.price}</p>}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1">
                  Nights *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={form.duration_nights}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, duration_nights: e.target.value }));
                    setFieldErrors((p) => ({ ...p, duration_nights: "" }));
                  }}
                  aria-invalid={Boolean(fieldErrors.duration_nights)}
                  className={`${INPUT_STYLES.base} ${fieldErrors.duration_nights ? "border-red-500 focus:border-red-500" : ""}`}
                />
                {fieldErrors.duration_nights && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.duration_nights}</p>}
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1">
                  Min Guests *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={form.min_guests}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, min_guests: e.target.value }));
                    setFieldErrors((p) => ({ ...p, min_guests: "", max_guests: "" }));
                  }}
                  aria-invalid={Boolean(fieldErrors.min_guests)}
                  className={`${INPUT_STYLES.base} ${fieldErrors.min_guests ? "border-red-500 focus:border-red-500" : ""}`}
                />
                {fieldErrors.min_guests && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.min_guests}</p>}
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1">
                  Max Guests *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={form.max_guests}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, max_guests: e.target.value }));
                    setFieldErrors((p) => ({ ...p, max_guests: "" }));
                  }}
                  aria-invalid={Boolean(fieldErrors.max_guests)}
                  className={`${INPUT_STYLES.base} ${fieldErrors.max_guests ? "border-red-500 focus:border-red-500" : ""}`}
                />
                {fieldErrors.max_guests && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.max_guests}</p>}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1">
                Valid From *
              </label>
              <input
                type="date"
                required
                value={form.valid_from}
                onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))}
                className={INPUT_STYLES.base}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1">
                Valid To *
              </label>
              <input
                type="date"
                required
                value={form.valid_to}
                onChange={(e) => {
                  setForm((f) => ({ ...f, valid_to: e.target.value }));
                  setFieldErrors((p) => ({ ...p, valid_to: "" }));
                }}
                aria-invalid={Boolean(fieldErrors.valid_to)}
                className={`${INPUT_STYLES.base} ${fieldErrors.valid_to ? "border-red-500 focus:border-red-500" : ""}`}
              />
              {fieldErrors.valid_to && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.valid_to}</p>}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1">
                Applicable Accommodation Types
              </label>
              <input
                type="text"
                value={form.applicable_accommodation_types}
                onChange={(e) =>
                  setForm((f) => ({ ...f, applicable_accommodation_types: e.target.value }))
                }
                placeholder="e.g. Pool Villa, Garden Suite"
                className={INPUT_STYLES.base}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1">
                Offer Badge (Optional)
              </label>
              <input
                type="text"
                value={form.offer_badge}
                onChange={(e) => setForm((f) => ({ ...f, offer_badge: e.target.value }))}
                placeholder="e.g. Monsoon Special, Early Bird"
                className={INPUT_STYLES.base}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-1">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-stone-700 dark:text-stone-200 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_customizable}
                onChange={(e) => setForm((f) => ({ ...f, is_customizable: e.target.checked }))}
                className="h-4 w-4 accent-amber-500 rounded"
              />
              <span>Customization Available</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-stone-700 dark:text-stone-200 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_seasonal_offer}
                onChange={(e) => setForm((f) => ({ ...f, is_seasonal_offer: e.target.checked }))}
                className="h-4 w-4 accent-amber-500 rounded"
              />
              <span>Feature in Seasonal Offers</span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Describe the guest experience and highlights..."
              className={INPUT_STYLES.base}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1">
                Terms &amp; Conditions
              </label>
              <textarea
                rows={2}
                value={form.terms_and_conditions}
                onChange={(e) => setForm((f) => ({ ...f, terms_and_conditions: e.target.value }))}
                placeholder="Check-in policy, advance notice, reschedule terms..."
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1">
                Exclusions
              </label>
              <textarea
                rows={2}
                value={form.exclusions}
                onChange={(e) => setForm((f) => ({ ...f, exclusions: e.target.value }))}
                placeholder="Items not covered in package price..."
                className={INPUT_STYLES.base}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E9F0] dark:border-[#1E293B]">
            <button type="button" onClick={closeFormModal} className={BUTTON_VARIANTS.secondary}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={BUTTON_VARIANTS.primary}>
              {saving ? "Saving..." : editingPkg ? "Save Changes" : "Create Draft Package"}
            </button>
          </div>
        </form>
      </Modal>

      {/* PACKAGE DETAILS & MANAGEMENT MODAL (OVERVIEW / INCLUSIONS / MEDIA / BLACKOUTS / HISTORY) */}
      <Modal
        isOpen={Boolean(detailPkg)}
        onClose={() => setDetailPkg(null)}
        title={detailPkg ? `${detailPkg.name} (${detailPkg.package_code})` : "Package Details"}
        size="lg"
      >
        {detailLoading || !detailPkg ? (
          <div className="py-10 text-center text-sm text-stone-500">Loading package details...</div>
        ) : (
          <div className="space-y-4">
            {/* SUB-TABS INSIDE PACKAGE DETAILS */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E9F0] dark:border-[#1E293B] pb-3">
              <div className="flex flex-wrap gap-1">
                {[
                  { key: "overview", label: "Overview" },
                  { key: "inclusions", label: `Inclusions (${detailPkg.items?.length || 0})` },
                  { key: "media", label: `Media (${detailPkg.media?.length || 0})` },
                  { key: "blackouts", label: `Blackouts (${detailPkg.blackouts?.length || 0})` },
                  { key: "history", label: `Bookings (${detailPkg.bookings?.length || 0})` },
                ].map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setDetailTab(t.key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                      detailTab === t.key
                        ? "bg-[#F59E0B] text-[#0D1420] font-bold"
                        : "bg-stone-100 dark:bg-[#151D29] text-stone-600 dark:text-[#8A9AB2] hover:text-stone-900 dark:hover:text-white"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <StatusBadge status={detailPkg.status} label={detailPkg.status} size="sm" />
                <select
                  value={detailPkg.status}
                  onChange={(e) => handleStatusChange(detailPkg, e.target.value)}
                  aria-label="Update package status"
                  className={`${INPUT_STYLES.select} !w-auto min-w-[130px] !py-1 text-xs`}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* TAB 1: OVERVIEW */}
            {detailTab === "overview" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="h-40 rounded-xl overflow-hidden border border-[#E5E9F0] dark:border-[#1E293B]">
                    <PackageCoverImage
                      src={detailPkg.cover_image_url}
                      fallbackSrc={getDefaultPackageCover({
                        category: detailPkg.category,
                        name: detailPkg.name,
                      })}
                      alt={detailPkg.name}
                    />
                  </div>
                  <div className="sm:col-span-2 grid grid-cols-2 gap-2.5 text-xs">
                    <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] p-3 border border-[#E5E9F0] dark:border-[#1E293B]">
                      <p className="text-[10px] uppercase font-bold text-stone-500">Pricing</p>
                      <p className="text-sm font-bold text-amber-700 dark:text-[#FFB02E] mt-0.5">
                        {pkgMoney(detailPkg.price)} ({detailPkg.pricing_type})
                      </p>
                    </div>
                    <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] p-3 border border-[#E5E9F0] dark:border-[#1E293B]">
                      <p className="text-[10px] uppercase font-bold text-stone-500">Duration &amp; Guests</p>
                      <p className="text-sm font-semibold mt-0.5">
                        {detailPkg.duration_nights} {detailPkg.duration_nights === 1 ? "Night" : "Nights"} · {detailPkg.min_guests}–{detailPkg.max_guests} {detailPkg.max_guests === 1 ? "Guest" : "Guests"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] p-3 border border-[#E5E9F0] dark:border-[#1E293B]">
                      <p className="text-[10px] uppercase font-bold text-stone-500">Validity Window</p>
                      <p className="text-xs font-semibold mt-0.5">
                        {pkgDateRange(detailPkg.valid_from, detailPkg.valid_to)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] p-3 border border-[#E5E9F0] dark:border-[#1E293B]">
                      <p className="text-[10px] uppercase font-bold text-stone-500">Category &amp; Options</p>
                      <p className="text-xs font-semibold mt-0.5">
                        {detailPkg.category} · {detailPkg.is_customizable ? "Customizable" : "Fixed Bundle"}
                      </p>
                    </div>
                  </div>
                </div>

                {detailPkg.description && (
                  <div className="text-xs text-stone-700 dark:text-stone-300 bg-[#F8FAFC] dark:bg-[#151D29] p-3 rounded-xl border border-[#E5E9F0] dark:border-[#1E293B]">
                    <p className="font-bold uppercase text-[10px] text-stone-500 mb-1">Description</p>
                    {detailPkg.description}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] p-3 border border-[#E5E9F0] dark:border-[#1E293B]">
                    <p className="font-bold uppercase text-[10px] text-stone-500 mb-1">Terms &amp; Conditions</p>
                    <p className="text-stone-700 dark:text-stone-300">
                      {detailPkg.terms_and_conditions || "Standard resort package terms apply."}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] p-3 border border-[#E5E9F0] dark:border-[#1E293B]">
                    <p className="font-bold uppercase text-[10px] text-stone-500 mb-1">Exclusions</p>
                    <p className="text-stone-700 dark:text-stone-300">
                      {detailPkg.exclusions || "No specific exclusions listed."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: INCLUSIONS */}
            {detailTab === "inclusions" && (
              <div className="space-y-4">
                <form
                  onSubmit={handleSaveItem}
                  className="rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#151D29] p-3.5 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-200">
                      {editingItemId ? "Edit Inclusion" : "Add Package Inclusion"}
                    </h4>
                    {editingItemId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingItemId(null);
                          setItemForm(INITIAL_ITEM_FORM);
                        }}
                        className="text-xs text-amber-600 hover:underline cursor-pointer"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>

                  {itemError && <AlertBanner variant="error" message={itemError} />}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold mb-1">Inclusion Type *</label>
                      <select
                        value={itemForm.inclusion_type}
                        onChange={(e) =>
                          setItemForm((f) => ({
                            ...f,
                            inclusion_type: e.target.value,
                            reference_id: "",
                            reference_module: "",
                            reference_label: "",
                          }))
                        }
                        className={INPUT_STYLES.select}
                      >
                        {INCLUSION_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold mb-1">Quantity *</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={itemForm.quantity}
                        onChange={(e) => setItemForm((f) => ({ ...f, quantity: e.target.value }))}
                        className={INPUT_STYLES.base}
                      />
                    </div>

                    <div className="flex items-end pb-2">
                      <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={itemForm.is_optional}
                          onChange={(e) =>
                            setItemForm((f) => ({ ...f, is_optional: e.target.checked }))
                          }
                          className="h-4 w-4 accent-amber-500 rounded"
                        />
                        <span>Optional Inclusion</span>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold mb-1">Description *</label>
                      <input
                        type="text"
                        required
                        value={itemForm.description}
                        onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
                        placeholder="e.g. 2 Nights Luxury Pool Villa Stay + Breakfast"
                        className={INPUT_STYLES.base}
                      />
                    </div>

                    {availableRefOptions.length > 0 ? (
                      <div>
                        <label className="block text-[11px] font-semibold mb-1">
                          Supported Catalog Reference (Optional)
                        </label>
                        <select
                          value={itemForm.reference_id}
                          onChange={(e) => {
                            const selected = availableRefOptions.find(
                              (r) => String(r.reference_id) === e.target.value
                            );
                            setItemForm((f) => ({
                              ...f,
                              reference_id: e.target.value,
                              reference_module: selected?.reference_module || "",
                              reference_label: selected?.label || "",
                              description: f.description || selected?.label || "",
                            }));
                          }}
                          className={INPUT_STYLES.select}
                        >
                          <option value="">— No linked catalog item —</option>
                          {availableRefOptions.map((ref) => (
                            <option key={ref.reference_id} value={ref.reference_id}>
                              {ref.label} ({ref.meta})
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] font-semibold mb-1">Notes (Optional)</label>
                        <input
                          type="text"
                          value={itemForm.notes}
                          onChange={(e) => setItemForm((f) => ({ ...f, notes: e.target.value }))}
                          placeholder="Operational note or schedule preference"
                          className={INPUT_STYLES.base}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <button type="submit" disabled={savingItem} className={`${BUTTON_VARIANTS.primary} !py-1.5 text-xs`}>
                      <Plus size={14} />
                      <span>{savingItem ? "Saving..." : editingItemId ? "Update Inclusion" : "Add Inclusion"}</span>
                    </button>
                  </div>
                </form>

                {detailPkg.items?.length === 0 ? (
                  <p className="text-center py-6 text-xs text-stone-500">
                    No inclusions added yet. Add at least one inclusion to activate this package.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {detailPkg.items.map((it) => (
                      <div
                        key={it.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-3 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-md bg-amber-50 dark:bg-[#30251C] px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-[#FFB02E]">
                              {it.inclusion_type}
                            </span>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                                it.is_optional
                                  ? "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300"
                                  : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                              }`}
                            >
                              {it.is_optional ? "Optional" : "Mandatory"}
                            </span>
                            <span className="font-semibold text-stone-500">Qty: {it.quantity}</span>
                            {it.reference_label && (
                              <span className="text-[11px] text-stone-500 truncate">
                                Ref: {it.reference_label}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 font-medium text-[#172033] dark:text-[#F8FAFC]">
                            {it.description}
                          </p>
                          {it.notes && <p className="text-[11px] text-stone-500 mt-0.5">{it.notes}</p>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingItemId(it.id);
                              setItemForm({
                                inclusion_type: it.inclusion_type,
                                description: it.description,
                                quantity: it.quantity,
                                is_optional: it.is_optional,
                                reference_module: it.reference_module || "",
                                reference_id: it.reference_id ? String(it.reference_id) : "",
                                reference_label: it.reference_label || "",
                                notes: it.notes || "",
                              });
                            }}
                            className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmAction({
                                kind: "delete-item",
                                target: it,
                                title: "Remove Inclusion",
                                recordName: it.description,
                                message: "Remove this inclusion from the package?",
                              })
                            }
                            className="rounded-lg p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: MEDIA GALLERY */}
            {detailTab === "media" && (
              <div className="space-y-4">
                <form
                  onSubmit={handleUploadMedia}
                  className="rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#151D29] p-3.5 space-y-3"
                >
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                    <ImageIcon size={14} className="text-[#F59E0B]" />
                    <span>Upload Cover or Gallery Image (JPG/PNG/WebP, max 5 MB)</span>
                  </div>
                  {mediaError && <AlertBanner variant="error" message={mediaError} />}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                    <div>
                      <label className="block text-[11px] font-semibold mb-1">Image Role</label>
                      <select
                        value={mediaType}
                        onChange={(e) => setMediaType(e.target.value)}
                        className={INPUT_STYLES.select}
                      >
                        <option value="cover">Cover Image</option>
                        <option value="gallery">Gallery Image</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold mb-1">Caption (Optional)</label>
                      <input
                        type="text"
                        value={mediaCaption}
                        onChange={(e) => setMediaCaption(e.target.value)}
                        placeholder="e.g. Sunset Villa Terrace"
                        className={INPUT_STYLES.base}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className={`${BUTTON_VARIANTS.secondary} !py-2 text-xs cursor-pointer flex-1 justify-center`}>
                        <Upload size={13} />
                        <span>{mediaFile ? "Change File" : "Choose Image"}</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => {
                            handleMediaFileChange(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={uploadingMedia || !mediaFile}
                        className={`${BUTTON_VARIANTS.primary} !py-2 text-xs`}
                      >
                        {uploadingMedia ? "Uploading..." : "Upload"}
                      </button>
                    </div>
                  </div>
                  {mediaPreview && (
                    <div className="flex items-center gap-3 pt-1">
                      <img
                        src={mediaPreview}
                        alt="Preview"
                        className="h-16 w-24 rounded-lg object-cover border border-stone-200 dark:border-stone-700"
                      />
                      <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                        Ready to upload: {mediaFile?.name}
                      </span>
                    </div>
                  )}
                </form>

                {detailPkg.media?.length === 0 ? (
                  <p className="text-center py-6 text-xs text-stone-500">
                    No custom images uploaded yet. A curated hospitality fallback image is displayed until you upload photography.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {detailPkg.media.map((m) => (
                      <div
                        key={m.id}
                        className="rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] overflow-hidden bg-white dark:bg-[#101722]"
                      >
                        <div className="relative h-28 w-full">
                          <PackageCoverImage src={m.url} alt={m.caption || detailPkg.name} />
                          <span className="absolute top-2 left-2 rounded-md bg-[#0D1420]/80 px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                            {m.media_type}
                          </span>
                        </div>
                        <div className="p-2 flex items-center justify-between gap-1 text-xs">
                          <span className="truncate text-[11px] text-stone-600 dark:text-stone-300">
                            {m.caption || m.file_name || "Package photo"}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {m.media_type !== "cover" && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await packagesApi.updateMedia(m.id, { media_type: "cover" });
                                  showSuccess("Set as cover image.");
                                  await refreshDetail();
                                }}
                                className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-900 hover:bg-amber-200 cursor-pointer"
                              >
                                Set Cover
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmAction({
                                  kind: "delete-media",
                                  target: m,
                                  title: "Remove Image",
                                  recordName: m.caption || m.file_name || "Package Image",
                                  message: "Delete this image from the package gallery?",
                                })
                              }
                              className="rounded p-1 text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: BLACKOUT DATES */}
            {detailTab === "blackouts" && (
              <div className="space-y-4">
                <form
                  onSubmit={handleSaveBlackout}
                  className="rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#151D29] p-3.5 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider">
                      {editingBlackoutId ? "Edit Blackout Date Range" : "Add Blackout Date Range"}
                    </h4>
                    {editingBlackoutId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingBlackoutId(null);
                          setBlackoutForm(INITIAL_BLACKOUT_FORM);
                        }}
                        className="text-xs text-amber-600 hover:underline cursor-pointer"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>
                  {blackoutError && <AlertBanner variant="error" message={blackoutError} />}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold mb-1">Start Date *</label>
                      <input
                        type="date"
                        required
                        value={blackoutForm.start_date}
                        onChange={(e) => setBlackoutForm((f) => ({ ...f, start_date: e.target.value }))}
                        className={INPUT_STYLES.base}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold mb-1">End Date *</label>
                      <input
                        type="date"
                        required
                        value={blackoutForm.end_date}
                        onChange={(e) => setBlackoutForm((f) => ({ ...f, end_date: e.target.value }))}
                        className={INPUT_STYLES.base}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold mb-1">Reason *</label>
                      <input
                        type="text"
                        required
                        value={blackoutForm.reason}
                        onChange={(e) => setBlackoutForm((f) => ({ ...f, reason: e.target.value }))}
                        placeholder="e.g. Peak Holiday Sold Out"
                        className={INPUT_STYLES.base}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button type="submit" disabled={savingBlackout} className={`${BUTTON_VARIANTS.primary} !py-1.5 text-xs`}>
                      <Plus size={14} />
                      <span>{savingBlackout ? "Saving..." : editingBlackoutId ? "Update Blackout" : "Add Blackout"}</span>
                    </button>
                  </div>
                </form>

                {detailPkg.blackouts?.length === 0 ? (
                  <p className="text-center py-6 text-xs text-stone-500">
                    No blackout dates configured for this package.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {detailPkg.blackouts.map((blk) => (
                      <div
                        key={blk.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-3 text-xs"
                      >
                        <div>
                          <div className="font-semibold text-[#172033] dark:text-[#F8FAFC]">
                            {pkgDateRange(blk.start_date, blk.end_date)}
                          </div>
                          <div className="text-stone-500 dark:text-[#8A9AB2] mt-0.5">
                            {blk.reason} {blk.is_active ? "" : "(Inactive)"}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBlackoutId(blk.id);
                              setBlackoutForm({
                                start_date: blk.start_date,
                                end_date: blk.end_date,
                                reason: blk.reason,
                                notes: blk.notes || "",
                                is_active: blk.is_active,
                              });
                            }}
                            className="rounded-lg p-1.5 text-stone-600 hover:bg-stone-100 cursor-pointer"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmAction({
                                kind: "delete-blackout",
                                target: blk,
                                title: "Remove Blackout Date",
                                recordName: `${pkgDateRange(blk.start_date, blk.end_date)} · ${blk.reason}`,
                                message: "Remove this blackout restriction?",
                              })
                            }
                            className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: BOOKING HISTORY */}
            {detailTab === "history" && (
              <div>
                {detailPkg.bookings?.length === 0 ? (
                  <p className="text-center py-6 text-xs text-stone-500">
                    No bookings have been created for this package yet.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {detailPkg.bookings.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#151D29] p-3 text-xs"
                      >
                        <div>
                          <div className="font-mono font-bold">
                            {b.booking_number} · <span className="font-sans">{b.customer_name}</span>
                          </div>
                          <div className="text-stone-500 mt-0.5">
                            Start: {pkgDate(b.start_date)} · {b.guest_count} guests · {pkgMoney(b.total_amount)}
                          </div>
                        </div>
                        <StatusBadge status={b.status} label={b.status} size="sm" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <DeleteConfirm
        isOpen={Boolean(confirmAction)}
        onClose={() => {
          setConfirmAction(null);
          setActionError("");
        }}
        onConfirm={handleConfirmAction}
        title={confirmAction?.title}
        recordName={confirmAction?.recordName}
        message={confirmAction?.message}
        loading={actionBusy}
        errorMessage={actionError}
      />

      <DeleteConfirm
        isOpen={bulkConfirmOpen}
        onClose={() => setBulkConfirmOpen(false)}
        onConfirm={handleBulkDeletePackages}
        title={`Delete ${selectedIds.size} Selected Package${selectedIds.size === 1 ? "" : "s"}`}
        recordName={`${selectedIds.size} selected package(s)`}
        message="Packages without active bookings will be deleted. Packages with active bookings remain protected."
        loading={bulkDeleting}
      />
    </div>
  );
}
