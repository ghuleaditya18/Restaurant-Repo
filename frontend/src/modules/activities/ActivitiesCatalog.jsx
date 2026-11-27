import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarPlus,
  CheckCircle2,
  Clock,
  Compass,
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
  ShieldAlert,
  Trash2,
  Upload,
  Users,
} from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import BulkSelectionBar from "../../components/BulkSelectionBar";
import DeleteConfirm from "../../components/DeleteConfirm";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import StatCard from "../../components/StatCard";
import StatusBadge from "../../components/StatusBadge";
import { useNotification } from "../../context/NotificationContext";
import { BUTTON_VARIANTS, CARD_STYLES, INPUT_STYLES } from "../../utils/themeTokens";
import VillaCardCarousel from "../villas/VillaCardCarousel";
import VillaDataTable from "../villas/VillaDataTable";
import ActivityCoverImage from "./ActivityCoverImage";
import {
  actError,
  activitiesApi,
  actMoney,
  bookingTypeLabel,
} from "./activitiesApi";

const CATEGORIES = ["Water", "Adventure", "Indoor", "Outdoor", "Tour", "Nature", "Kids", "Special"];
const BOOKING_TYPES = [
  { value: "session", label: "Session (Scheduled Group)" },
  { value: "time_slot", label: "Time Slot (Resource Reservation)" },
  { value: "walk_in", label: "Walk-In (Drop-In Usage)" },
];
const STATUSES = ["Active", "Inactive", "Archived"];

const INITIAL_FORM = {
  name: "",
  activity_code: "",
  category: "Outdoor",
  location_name: "",
  description: "",
  booking_type: "session",
  duration_minutes: 60,
  safety_notes: "",
  required_equipment: "",
  min_participants: 1,
  max_participants: 10,
  min_age: "",
  max_age: "",
  requires_waiver: false,
  default_staff_id: "",
  assigned_instructor_ids: [],
  is_complimentary: false,
  price_per_person: "",
  price_per_group: "",
  status: "Active",
};

const INITIAL_RESOURCE_FORM = {
  name: "",
  description: "",
  capacity: 1,
  is_active: true,
};

export default function ActivitiesCatalog() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showSuccess, showError } = useNotification();

  const [activities, setActivities] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get("category") || "");
  const [bookingTypeFilter, setBookingTypeFilter] = useState(searchParams.get("booking_type") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [viewMode, setViewMode] = useState("table");
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 12;

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkFailures, setBulkFailures] = useState([]);

  // Create / Edit Modal
  const [formOpen, setFormOpen] = useState(Boolean(searchParams.get("new")));
  const [editingAct, setEditingAct] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Detail Modal (Overview | Resources | Media)
  const [detailAct, setDetailAct] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState("overview");

  // Resource Management inside Detail Modal
  const [resourceForm, setResourceForm] = useState(INITIAL_RESOURCE_FORM);
  const [editingResourceId, setEditingResourceId] = useState(null);
  const [savingResource, setSavingResource] = useState(false);
  const [resourceError, setResourceError] = useState("");

  // Media Uploader inside Detail Modal
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState("");
  const [mediaType, setMediaType] = useState("cover");
  const [mediaCaption, setMediaCaption] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState("");

  // Archive Confirmation
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiving, setArchiving] = useState(false);

  const loadActivities = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const [actRes, staffRes] = await Promise.all([
        activitiesApi.list({
          search: searchQuery.trim() || undefined,
          category: categoryFilter || undefined,
          booking_type: bookingTypeFilter || undefined,
          status: statusFilter || undefined,
          include_archived: statusFilter === "Archived",
          page,
          page_size: pageSize,
        }),
        activitiesApi.staff().catch(() => ({ data: [] })),
      ]);
      setActivities(actRes.data?.items || []);
      setTotalRecords(actRes.data?.total ?? 0);
      setTotalPages(actRes.data?.total_pages ?? 1);
      setStaffList(staffRes.data || []);
    } catch (err) {
      setPageError(actError(err));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, categoryFilter, bookingTypeFilter, statusFilter, page]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, categoryFilter, bookingTypeFilter, statusFilter]);

  useEffect(() => {
    if (searchParams.get("new")) {
      setFormOpen(true);
      setEditingAct(null);
      setForm(INITIAL_FORM);
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const openCreate = () => {
    setEditingAct(null);
    setForm(INITIAL_FORM);
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (act) => {
    setEditingAct(act);
    setForm({
      name: act.name || "",
      activity_code: act.activity_code || "",
      category: act.category || "Outdoor",
      location_name: act.location_name || "",
      description: act.description || "",
      booking_type: act.booking_type || "session",
      duration_minutes: act.duration_minutes ?? 60,
      safety_notes: act.safety_notes || "",
      required_equipment: act.required_equipment || "",
      min_participants: act.min_participants ?? 1,
      max_participants: act.max_participants ?? 10,
      min_age: act.min_age ?? "",
      max_age: act.max_age ?? "",
      requires_waiver: Boolean(act.requires_waiver),
      default_staff_id: act.default_staff_id ? String(act.default_staff_id) : "",
      assigned_instructor_ids: Array.isArray(act.assigned_instructor_ids) ? act.assigned_instructor_ids : [],
      is_complimentary: Boolean(act.is_complimentary),
      price_per_person: act.price_per_person ?? "",
      price_per_group: act.price_per_group ?? "",
      status: act.status || "Active",
    });
    setFormError("");
    setFormOpen(true);
  };

  const openDetail = async (id, initialTab = "overview") => {
    setDetailTab(initialTab);
    setDetailLoading(true);
    setResourceForm(INITIAL_RESOURCE_FORM);
    setEditingResourceId(null);
    setResourceError("");
    setMediaError("");
    try {
      const res = await activitiesApi.detail(id);
      setDetailAct(res.data);
    } catch (err) {
      showError(actError(err));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError("");
    const minP = Number(form.min_participants);
    const maxP = Number(form.max_participants);
    const dur = Number(form.duration_minutes);
    if (!form.name.trim() || !form.activity_code.trim()) {
      setFormError("Activity name and code are required.");
      return;
    }
    if (!Number.isFinite(dur) || dur < 1) {
      setFormError("Duration must be greater than 0 minutes.");
      return;
    }
    if (minP < 1 || maxP < minP) {
      setFormError("Max participants must be greater than or equal to Min participants (>= 1).");
      return;
    }
    if (
      !form.is_complimentary &&
      String(form.price_per_person).trim() === "" &&
      String(form.price_per_group).trim() === ""
    ) {
      setFormError("Configure Price Per Person, Price Per Group, or mark as Complimentary.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      activity_code: form.activity_code.trim().toUpperCase(),
      category: form.category,
      location_name: form.location_name.trim() || null,
      description: form.description.trim() || null,
      booking_type: form.booking_type,
      duration_minutes: dur,
      safety_notes: form.safety_notes.trim() || null,
      required_equipment: form.required_equipment.trim() || null,
      min_participants: minP,
      max_participants: maxP,
      min_age: form.min_age !== "" ? Number(form.min_age) : null,
      max_age: form.max_age !== "" ? Number(form.max_age) : null,
      requires_waiver: Boolean(form.requires_waiver),
      default_staff_id: form.default_staff_id ? Number(form.default_staff_id) : null,
      assigned_instructor_ids: (form.assigned_instructor_ids || []).map(Number),
      is_complimentary: Boolean(form.is_complimentary),
      price_per_person:
        !form.is_complimentary && String(form.price_per_person).trim() !== ""
          ? Number(form.price_per_person)
          : null,
      price_per_group:
        !form.is_complimentary && String(form.price_per_group).trim() !== ""
          ? Number(form.price_per_group)
          : null,
      status: form.status,
    };

    setSaving(true);
    try {
      if (editingAct) {
        await activitiesApi.update(editingAct.id, payload);
        showSuccess(`Activity "${payload.name}" updated.`);
      } else {
        await activitiesApi.create(payload);
        showSuccess(`Activity "${payload.name}" created.`);
      }
      setFormOpen(false);
      await loadActivities();
    } catch (err) {
      setFormError(actError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (act) => {
    const nextStatus = act.status === "Active" ? "Inactive" : "Active";
    try {
      await activitiesApi.updateStatus(act.id, nextStatus);
      showSuccess(`"${act.name}" marked ${nextStatus}.`);
      await loadActivities();
      if (detailAct?.id === act.id) openDetail(act.id, detailTab);
    } catch (err) {
      showError(actError(err));
    }
  };

  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      const res = await activitiesApi.remove(archiveTarget.id);
      showSuccess(res.data?.message || `"${archiveTarget.name}" archived.`);
      setArchiveTarget(null);
      if (detailAct?.id === archiveTarget.id) setDetailAct(null);
      await loadActivities();
    } catch (err) {
      showError(actError(err));
    } finally {
      setArchiving(false);
    }
  };

  const handleSelectRow = (id) => {
    setBulkFailures([]);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSelectAll = (ids) => {
    setBulkFailures([]);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setBulkDeleting(true);
    setBulkFailures([]);
    try {
      const res = await activitiesApi.bulkRemove(ids);
      const { cleared = 0, failed = [], message } = res.data || {};
      setBulkFailures(failed);
      setSelectedIds(new Set(failed.map((f) => f.id)));
      setBulkDeleteOpen(false);
      await loadActivities();
      if (cleared > 0) showSuccess(message || `Cleared ${cleared} activity record(s).`);
      if (failed.length > 0) showError(`${failed.length} activity record(s) could not be cleared.`);
    } catch (err) {
      showError(actError(err));
    } finally {
      setBulkDeleting(false);
    }
  };

  // Resources CRUD
  const handleSaveResource = async (e) => {
    e.preventDefault();
    if (!detailAct) return;
    setResourceError("");
    if (!resourceForm.name.trim()) {
      setResourceError("Resource name is required.");
      return;
    }
    setSavingResource(true);
    try {
      const payload = {
        name: resourceForm.name.trim(),
        description: resourceForm.description.trim() || null,
        capacity: Number(resourceForm.capacity || 1),
        is_active: Boolean(resourceForm.is_active),
      };
      if (editingResourceId) {
        await activitiesApi.updateResource(editingResourceId, payload);
        showSuccess("Resource updated.");
      } else {
        await activitiesApi.createResource(detailAct.id, payload);
        showSuccess("Resource added.");
      }
      setResourceForm(INITIAL_RESOURCE_FORM);
      setEditingResourceId(null);
      await openDetail(detailAct.id, "resources");
      await loadActivities();
    } catch (err) {
      setResourceError(actError(err));
    } finally {
      setSavingResource(false);
    }
  };

  const handleDeleteResource = async (resourceId) => {
    if (!detailAct) return;
    try {
      await activitiesApi.deleteResource(resourceId);
      showSuccess("Resource removed.");
      await openDetail(detailAct.id, "resources");
      await loadActivities();
    } catch (err) {
      showError(actError(err));
    }
  };

  // Media Upload / Delete
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaError("");
    if (file.size > 5 * 1024 * 1024) {
      setMediaError("Image must be 5 MB or smaller.");
      return;
    }
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const handleUploadMedia = async (e) => {
    e.preventDefault();
    if (!detailAct || !mediaFile) {
      setMediaError("Select an image file first.");
      return;
    }
    setUploadingMedia(true);
    setMediaError("");
    try {
      await activitiesApi.uploadMedia(detailAct.id, mediaFile, mediaType, mediaCaption.trim());
      showSuccess("Activity image uploaded.");
      setMediaFile(null);
      setMediaPreview("");
      setMediaCaption("");
      await openDetail(detailAct.id, "media");
      await loadActivities();
    } catch (err) {
      setMediaError(actError(err));
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleDeleteMedia = async (mediaId) => {
    if (!detailAct) return;
    try {
      await activitiesApi.deleteMedia(mediaId);
      showSuccess("Image removed.");
      await openDetail(detailAct.id, "media");
      await loadActivities();
    } catch (err) {
      showError(actError(err));
    }
  };

  const priceDisplay = (a) => {
    if (a.is_complimentary) return "Complimentary";
    const parts = [];
    if (a.price_per_person !== null && a.price_per_person !== undefined) {
      parts.push(`${actMoney(a.price_per_person)} / person`);
    }
    if (a.price_per_group !== null && a.price_per_group !== undefined) {
      parts.push(`${actMoney(a.price_per_group)} / group`);
    }
    return parts.join(" · ") || "—";
  };

  const tableColumns = [
    {
      key: "name",
      label: "Activity",
      render: (a) => (
        <div className="flex items-center gap-3 min-w-[210px]">
          <div className="h-12 w-16 shrink-0 overflow-hidden rounded-xl border border-[#E5E9F0] dark:border-[#1E293B]">
            <ActivityCoverImage src={a.cover_image_url} alt={a.name} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-[#172033] dark:text-[#F8FAFC] truncate max-w-[200px]">
              {a.name}
            </div>
            <div className="text-xs text-[#64748B] dark:text-[#8A9AB2] font-mono">
              {a.activity_code} {a.location_name ? `· ${a.location_name}` : ""}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "category",
      label: "Category",
      cellClassName: "whitespace-nowrap font-medium",
    },
    {
      key: "booking_type",
      label: "Booking Type",
      render: (a) => (
        <StatusBadge status={a.booking_type} label={bookingTypeLabel(a.booking_type)} size="sm" />
      ),
    },
    {
      key: "duration_minutes",
      label: "Duration",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (a) => `${a.duration_minutes} min`,
    },
    {
      key: "participants",
      label: "Participants",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (a) => `${a.min_participants}–${a.max_participants}`,
    },
    {
      key: "pricing",
      label: "Pricing",
      cellClassName: "whitespace-nowrap font-semibold",
      render: (a) => priceDisplay(a),
    },
    {
      key: "status",
      label: "Status",
      align: "center",
      render: (a) => <StatusBadge status={a.status} label={a.status} size="sm" />,
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      cellClassName: "whitespace-nowrap",
      render: (a) => (
        <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => openDetail(a.id, "overview")}
            title="View Details"
            className="rounded-lg p-1.5 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/30 cursor-pointer"
          >
            <Eye size={15} />
          </button>
          <button
            type="button"
            onClick={() => openEdit(a)}
            title="Edit Activity"
            className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <Edit3 size={15} />
          </button>
          {a.status !== "Archived" && (
            <>
              <button
                type="button"
                onClick={() => handleToggleStatus(a)}
                title={a.status === "Active" ? "Deactivate" : "Activate"}
                className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer"
              >
                <Power size={15} />
              </button>
              <button
                type="button"
                onClick={() => setArchiveTarget(a)}
                title="Delete / Archive Activity"
                className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  const activeCount = activities.filter((a) => a.status === "Active").length;
  const sessionCount = activities.filter((a) => a.booking_type === "session").length;
  const timeSlotCount = activities.filter((a) => a.booking_type === "time_slot").length;
  const walkInCount = activities.filter((a) => a.booking_type === "walk_in").length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Catalogue"
        description="Manage resort activities, resources for Time Slot reservations, waiver & age rules, and activity photos."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/activities/schedule?tab=instructors")}
              className={BUTTON_VARIANTS.secondary}
            >
              <Users size={15} />
              <span>Manage Instructors</span>
            </button>
            <button type="button" onClick={openCreate} className={BUTTON_VARIANTS.primary}>
              <Plus size={15} />
              <span>Create Activity</span>
            </button>
          </div>
        }
      />

      {pageError && (
        <AlertBanner variant="error" message={pageError} onDismiss={() => setPageError("")} />
      )}

      {/* KPI SUMMARY */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-fit max-w-full">
        <StatCard compact className="!p-2.5" title="Matching Activities" value={loading ? "—" : totalRecords} icon={Compass} color="amber" />
        <StatCard compact className="!p-2.5" title="Active (This Page)" value={loading ? "—" : activeCount} icon={CheckCircle2} color="emerald" />
        <StatCard compact className="!p-2.5" title="Session / Time Slot" value={loading ? "—" : `${sessionCount} / ${timeSlotCount}`} icon={Layers} color="indigo" />
        <StatCard compact className="!p-2.5" title="Walk-In Activities" value={loading ? "—" : walkInCount} icon={Users} color="sky" />
      </div>

      {/* BALANCED TOOLBAR */}
      <div className={`${CARD_STYLES.base} !p-2.5`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="relative w-full sm:w-56">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, code, location..."
                className={`${INPUT_STYLES.base} w-full pl-9 !py-1.5 text-xs`}
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className={`${INPUT_STYLES.select} w-full sm:!w-auto min-w-[130px] !py-1.5 text-xs`}
            >
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={bookingTypeFilter}
              onChange={(e) => setBookingTypeFilter(e.target.value)}
              className={`${INPUT_STYLES.select} w-full sm:!w-auto min-w-[140px] !py-1.5 text-xs`}
            >
              <option value="">All Booking Types</option>
              <option value="time_slot">Time Slot</option>
              <option value="session">Session</option>
              <option value="walk_in">Walk-In</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`${INPUT_STYLES.select} w-full sm:!w-auto min-w-[120px] !py-1.5 text-xs`}
            >
              <option value="">Active & Inactive</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="inline-flex items-center rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#151D29] p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                viewMode === "table"
                  ? "bg-white dark:bg-[#101722] text-[#172033] dark:text-white shadow-2xs"
                  : "text-stone-500"
              }`}
            >
              <List size={13} />
              <span>Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                viewMode === "cards"
                  ? "bg-white dark:bg-[#101722] text-[#172033] dark:text-white shadow-2xs"
                  : "text-stone-500"
              }`}
            >
              <LayoutGrid size={13} />
              <span>Cards</span>
            </button>
          </div>
        </div>
      </div>

      <BulkSelectionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onDelete={() => setBulkDeleteOpen(true)}
        deleting={bulkDeleting}
      />

      {bulkFailures.length > 0 && (
        <AlertBanner
          variant="warning"
          title="Some activities could not be cleared"
          message={bulkFailures.map((f) => `${f.name}: ${f.reason}`).join(" | ")}
          onDismiss={() => setBulkFailures([])}
        />
      )}

      {/* TABLE OR CARDS VIEW */}
      {viewMode === "cards" ? (
        loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`${CARD_STYLES.base} h-56 animate-pulse bg-stone-100 dark:bg-[#151D29]`} />
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className={`${CARD_STYLES.base} py-10 text-center`}>
            <Compass size={30} className="mx-auto text-stone-400 mb-2" />
            <p className="text-sm font-semibold">No activities found</p>
            <p className="text-xs text-stone-500 mt-1">Adjust filters or create your first activity.</p>
          </div>
        ) : (
          <VillaCardCarousel
            title="Activities"
            subtitle="Compact activity cards — switch to Table view for full directory management"
            itemCount={activities.length}
          >
            {activities.map((a) => (
              <div
                key={a.id}
                className="w-[260px] sm:w-[272px] shrink-0 snap-start rounded-2xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] shadow-xs overflow-hidden flex flex-col justify-between transition hover:border-amber-400/70"
              >
                <div>
                  <div
                    onClick={() => openDetail(a.id, "overview")}
                    className="relative h-32 w-full overflow-hidden bg-stone-100 dark:bg-[#151D29] cursor-pointer"
                  >
                    <ActivityCoverImage src={a.cover_image_url} alt={a.name} />
                    <div className="absolute top-2 left-2 flex flex-wrap items-center gap-1">
                      {a.status !== "Archived" && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(a.id)}
                          onChange={() => handleSelectRow(a.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select ${a.name}`}
                          className="h-4 w-4 rounded border-white/80 accent-amber-500 cursor-pointer"
                        />
                      )}
                      <span className="rounded-full bg-black/65 backdrop-blur-xs px-2 py-0.5 text-[10px] font-bold text-white">
                        {a.category}
                      </span>
                      <StatusBadge
                        status={a.booking_type}
                        label={bookingTypeLabel(a.booking_type)}
                        size="sm"
                      />
                    </div>
                    <div className="absolute top-2 right-2">
                      <StatusBadge status={a.status} label={a.status} size="sm" />
                    </div>
                  </div>

                  <div className="p-3 space-y-1.5">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-bold text-[#172033] dark:text-[#F8FAFC] line-clamp-1">
                          {a.name}
                        </h3>
                        <span className="text-[11px] font-mono text-stone-500 shrink-0">
                          {a.activity_code}
                        </span>
                      </div>
                      {a.location_name && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-500 dark:text-[#8A9AB2]">
                          <MapPin size={12} className="shrink-0" />
                          <span className="truncate">{a.location_name}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs text-stone-600 dark:text-stone-300 pt-0.5">
                      <div className="flex items-center gap-1">
                        <Clock size={12} className="text-amber-500 shrink-0" />
                        <span>{a.duration_minutes} mins</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Users size={12} className="text-amber-500 shrink-0" />
                        <span>{a.min_participants}–{a.max_participants} guests</span>
                      </div>
                    </div>

                    {(a.requires_waiver || a.booking_type === "time_slot") && (
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        {a.requires_waiver && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                            <ShieldAlert size={10} />
                            Waiver
                          </span>
                        )}
                        {a.booking_type === "time_slot" && (
                          <span className="rounded-md bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900/50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800 dark:text-sky-300">
                            {(a.resources || []).length} resource(s)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-[#E5E9F0] dark:border-[#1E293B] bg-[#F8FAFC]/70 dark:bg-[#151D29]/60 px-3 py-2 flex items-center justify-between gap-1.5">
                  <span className="text-xs font-bold text-[#172033] dark:text-white truncate">
                    {priceDisplay(a)}
                  </span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openDetail(a.id, "overview")}
                      title="Details, Resources & Media"
                      className="rounded-lg p-1 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/30 cursor-pointer"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(a)}
                      title="Edit Activity"
                      className="rounded-lg p-1 text-stone-600 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800 cursor-pointer"
                    >
                      <Edit3 size={14} />
                    </button>
                    {a.status === "Active" && (
                      <button
                        type="button"
                        onClick={() => navigate(`/activities/bookings?new=1&activityId=${a.id}`)}
                        title="Book / Log Usage"
                        className="rounded-lg p-1 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer"
                      >
                        <CalendarPlus size={14} />
                      </button>
                    )}
                    {a.status !== "Archived" && (
                      <button
                        type="button"
                        onClick={() => setArchiveTarget(a)}
                        title="Delete / Archive Activity"
                        className="rounded-lg p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </VillaCardCarousel>
        )
      ) : (
        <VillaDataTable
          title="Activities Directory"
          columns={tableColumns}
          rows={activities}
          loading={loading}
          emptyTitle="No activities match filters"
          tableMinWidth="min-w-[920px]"
          onRowClick={(a) => openDetail(a.id, "overview")}
          selectedIds={selectedIds}
          onSelectRow={handleSelectRow}
          onSelectAll={handleSelectAll}
          isRowSelectable={(a) => a.status !== "Archived"}
          pagination={{
            currentPage: page,
            totalPages,
            totalRecords,
            pageSize,
            onPageChange: setPage,
          }}
        />
      )}

      {/* CREATE / EDIT ACTIVITY MODAL */}
      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingAct ? `Edit Activity — ${editingAct.name}` : "Create New Activity"}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && <AlertBanner variant="error" message={formError} />}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Activity Name *
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Morning Yoga, Tennis Court"
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Activity Code *
              </label>
              <input
                type="text"
                required
                value={form.activity_code}
                onChange={(e) => setForm({ ...form, activity_code: e.target.value })}
                placeholder="e.g. ACT-YOGA"
                className={`${INPUT_STYLES.base} font-mono uppercase`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Category *
              </label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={INPUT_STYLES.select}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Booking Type *
              </label>
              <select
                value={form.booking_type}
                onChange={(e) => setForm({ ...form, booking_type: e.target.value })}
                disabled={Boolean(editingAct && editingAct.booking_count > 0)}
                className={INPUT_STYLES.select}
              >
                {BOOKING_TYPES.map((bt) => (
                  <option key={bt.value} value={bt.value}>{bt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Location Name
              </label>
              <input
                type="text"
                value={form.location_name}
                onChange={(e) => setForm({ ...form, location_name: e.target.value })}
                placeholder="e.g. Wellness Pavilion"
                className={INPUT_STYLES.base}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
              Description
            </label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Guest-facing summary of the experience..."
              className={INPUT_STYLES.base}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Duration (min) *
              </label>
              <input
                type="number"
                min={1}
                required
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Min Participants *
              </label>
              <input
                type="number"
                min={1}
                required
                value={form.min_participants}
                onChange={(e) => setForm({ ...form, min_participants: e.target.value })}
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Max Participants *
              </label>
              <input
                type="number"
                min={1}
                required
                value={form.max_participants}
                onChange={(e) => setForm({ ...form, max_participants: e.target.value })}
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Min Age
              </label>
              <input
                type="number"
                min={0}
                value={form.min_age}
                onChange={(e) => setForm({ ...form, min_age: e.target.value })}
                placeholder="Any"
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Max Age
              </label>
              <input
                type="number"
                min={0}
                value={form.max_age}
                onChange={(e) => setForm({ ...form, max_age: e.target.value })}
                placeholder="Any"
                className={INPUT_STYLES.base}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Default Staff / Instructor
              </label>
              <select
                value={form.default_staff_id}
                onChange={(e) => setForm({ ...form, default_staff_id: e.target.value })}
                className={INPUT_STYLES.select}
              >
                <option value="">None</option>
                {staffList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} {u.designation ? `(${u.designation})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] px-3 py-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={form.requires_waiver}
                onChange={(e) => setForm({ ...form, requires_waiver: e.target.checked })}
                className="h-4 w-4 accent-amber-500"
              />
              <span>Requires Waiver Signature</span>
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] px-3 py-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_complimentary}
                onChange={(e) => setForm({ ...form, is_complimentary: e.target.checked })}
                className="h-4 w-4 accent-amber-500"
              />
              <span>Complimentary Activity</span>
            </label>
          </div>

          <div className="rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-stone-700 dark:text-stone-300">
                Assigned Instructors (Qualified for this Activity)
              </label>
              <button
                type="button"
                onClick={() => {
                  setFormOpen(false);
                  navigate("/activities/schedule?tab=instructors");
                }}
                className="text-xs font-semibold text-amber-600 hover:underline cursor-pointer"
              >
                + Add / Manage Instructors
              </button>
            </div>
            {staffList.length === 0 ? (
              <p className="text-xs text-stone-500">
                No instructors configured yet. Click &quot;+ Add / Manage Instructors&quot; to create staff.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {staffList.map((u) => {
                  const checked = (form.assigned_instructor_ids || []).includes(u.id);
                  return (
                    <label
                      key={u.id}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                        checked
                          ? "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                          : "border-[#E5E9F0] dark:border-[#1E293B] text-stone-600 dark:text-stone-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setForm((prev) => {
                            const cur = prev.assigned_instructor_ids || [];
                            return {
                              ...prev,
                              assigned_instructor_ids: cur.includes(u.id)
                                ? cur.filter((id) => id !== u.id)
                                : [...cur, u.id],
                            };
                          })
                        }
                        className="h-3.5 w-3.5 accent-amber-500"
                      />
                      <span>{u.full_name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {!form.is_complimentary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                  Price Per Person (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price_per_person}
                  onChange={(e) => setForm({ ...form, price_per_person: e.target.value })}
                  placeholder="Optional if per-group is set"
                  className={INPUT_STYLES.base}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                  Price Per Group (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price_per_group}
                  onChange={(e) => setForm({ ...form, price_per_group: e.target.value })}
                  placeholder="Optional if per-person is set"
                  className={INPUT_STYLES.base}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Required Equipment
              </label>
              <input
                type="text"
                value={form.required_equipment}
                onChange={(e) => setForm({ ...form, required_equipment: e.target.value })}
                placeholder="e.g. Life jacket, yoga mat"
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Safety Notes
              </label>
              <input
                type="text"
                value={form.safety_notes}
                onChange={(e) => setForm({ ...form, safety_notes: e.target.value })}
                placeholder="Important participant safety instructions..."
                className={INPUT_STYLES.base}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E9F0] dark:border-[#1E293B]">
            <button type="button" onClick={() => setFormOpen(false)} className={BUTTON_VARIANTS.secondary}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={BUTTON_VARIANTS.primary}>
              {saving ? "Saving..." : editingAct ? "Update Activity" : "Create Activity"}
            </button>
          </div>
        </form>
      </Modal>

      {/* DETAIL MODAL: OVERVIEW | RESOURCES | MEDIA */}
      <Modal
        isOpen={Boolean(detailAct)}
        onClose={() => setDetailAct(null)}
        title={detailAct ? `${detailAct.name} (${detailAct.activity_code})` : "Activity Details"}
        size="lg"
      >
        {detailLoading || !detailAct ? (
          <p className="py-8 text-center text-sm text-stone-500">Loading activity details...</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E9F0] dark:border-[#1E293B] pb-3">
              <div className="flex gap-1.5">
                {[
                  { key: "overview", label: "Overview" },
                  ...(detailAct.booking_type === "time_slot"
                    ? [{ key: "resources", label: `Resources (${(detailAct.resources || []).length})` }]
                    : []),
                  { key: "media", label: `Photos (${(detailAct.media || []).length})` },
                ].map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setDetailTab(t.key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                      detailTab === t.key
                        ? "bg-amber-500 text-[#0D1420] font-bold"
                        : "bg-stone-100 dark:bg-[#151D29] text-stone-600 dark:text-stone-300"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={detailAct.booking_type} label={bookingTypeLabel(detailAct.booking_type)} size="sm" />
                <StatusBadge status={detailAct.status} label={detailAct.status} size="sm" />
              </div>
            </div>

            {detailTab === "overview" && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="h-40 rounded-xl overflow-hidden border border-[#E5E9F0] dark:border-[#1E293B]">
                    <ActivityCoverImage src={detailAct.cover_image_url} alt={detailAct.name} />
                  </div>
                  <div className="sm:col-span-2 grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl bg-stone-50 dark:bg-[#151D29] p-2.5">
                      <span className="text-[10px] uppercase text-stone-500 font-bold">Category</span>
                      <p className="mt-0.5 font-semibold text-sm">{detailAct.category}</p>
                    </div>
                    <div className="rounded-xl bg-stone-50 dark:bg-[#151D29] p-2.5">
                      <span className="text-[10px] uppercase text-stone-500 font-bold">Duration</span>
                      <p className="mt-0.5 font-semibold text-sm">{detailAct.duration_minutes} mins</p>
                    </div>
                    <div className="rounded-xl bg-stone-50 dark:bg-[#151D29] p-2.5">
                      <span className="text-[10px] uppercase text-stone-500 font-bold">Participants</span>
                      <p className="mt-0.5 font-semibold text-sm">{detailAct.min_participants} – {detailAct.max_participants}</p>
                    </div>
                    <div className="rounded-xl bg-stone-50 dark:bg-[#151D29] p-2.5">
                      <span className="text-[10px] uppercase text-stone-500 font-bold">Pricing</span>
                      <p className="mt-0.5 font-semibold text-sm">{priceDisplay(detailAct)}</p>
                    </div>
                    <div className="rounded-xl bg-stone-50 dark:bg-[#151D29] p-2.5">
                      <span className="text-[10px] uppercase text-stone-500 font-bold">Age Limits</span>
                      <p className="mt-0.5 font-semibold text-sm">
                        {detailAct.min_age != null || detailAct.max_age != null
                          ? `${detailAct.min_age ?? 0} – ${detailAct.max_age ?? "∞"} yrs`
                          : "All ages"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-stone-50 dark:bg-[#151D29] p-2.5">
                      <span className="text-[10px] uppercase text-stone-500 font-bold">Waiver</span>
                      <p className="mt-0.5 font-semibold text-sm">
                        {detailAct.requires_waiver ? "Mandatory" : "Optional"}
                      </p>
                    </div>
                  </div>
                </div>

                {detailAct.description && (
                  <p className="text-sm text-stone-600 dark:text-stone-300">{detailAct.description}</p>
                )}
                {(detailAct.required_equipment || detailAct.safety_notes) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {detailAct.required_equipment && (
                      <div className="rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] p-3">
                        <p className="font-bold text-stone-700 dark:text-stone-200 mb-1">Required Equipment</p>
                        <p className="text-stone-600 dark:text-stone-300">{detailAct.required_equipment}</p>
                      </div>
                    )}
                    {detailAct.safety_notes && (
                      <div className="rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] p-3">
                        <p className="font-bold text-stone-700 dark:text-stone-200 mb-1">Safety Notes</p>
                        <p className="text-stone-600 dark:text-stone-300">{detailAct.safety_notes}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-[#E5E9F0] dark:border-[#1E293B]">
                  <button
                    type="button"
                    onClick={() => openEdit(detailAct)}
                    className={BUTTON_VARIANTS.secondary}
                  >
                    <Edit3 size={14} />
                    <span>Edit Activity</span>
                  </button>
                  {detailAct.status !== "Archived" && (
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(detailAct)}
                      className={BUTTON_VARIANTS.secondary}
                    >
                      <Power size={14} />
                      <span>{detailAct.status === "Active" ? "Deactivate" : "Activate"}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const actId = detailAct.id;
                      setDetailAct(null);
                      navigate(`/activities/bookings?new=1&activityId=${actId}`);
                    }}
                    className={BUTTON_VARIANTS.primary}
                  >
                    <CalendarPlus size={14} />
                    <span>New Booking / Log</span>
                  </button>
                </div>
              </div>
            )}

            {detailTab === "resources" && detailAct.booking_type === "time_slot" && (
              <div className="space-y-4">
                <form onSubmit={handleSaveResource} className="rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] p-3 space-y-3">
                  <p className="text-xs font-bold">
                    {editingResourceId ? "Edit Resource" : "Add Bookable Resource"}
                  </p>
                  {resourceError && <AlertBanner variant="error" message={resourceError} />}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      required
                      value={resourceForm.name}
                      onChange={(e) => setResourceForm({ ...resourceForm, name: e.target.value })}
                      placeholder="Resource name (e.g. Tennis Court 1)"
                      className={INPUT_STYLES.base}
                    />
                    <input
                      type="text"
                      value={resourceForm.description}
                      onChange={(e) => setResourceForm({ ...resourceForm, description: e.target.value })}
                      placeholder="Notes / location"
                      className={INPUT_STYLES.base}
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={1}
                        value={resourceForm.capacity}
                        onChange={(e) => setResourceForm({ ...resourceForm, capacity: e.target.value })}
                        className={`${INPUT_STYLES.base} w-20`}
                        title="Resource capacity"
                      />
                      <button type="submit" disabled={savingResource} className={BUTTON_VARIANTS.primary}>
                        {savingResource ? "..." : editingResourceId ? "Update" : "Add"}
                      </button>
                    </div>
                  </div>
                </form>

                <div className="divide-y divide-[#E5E9F0] dark:divide-[#1E293B] rounded-xl border border-[#E5E9F0] dark:border-[#1E293B]">
                  {(detailAct.resources || []).length === 0 ? (
                    <p className="p-6 text-center text-xs text-stone-500">
                      No resources added yet. Add at least one resource so Time Slot bookings can reserve it.
                    </p>
                  ) : (
                    detailAct.resources.map((r) => (
                      <div key={r.id} className="flex items-center justify-between p-3 text-xs">
                        <div>
                          <p className="font-bold text-[#172033] dark:text-white">{r.name}</p>
                          <p className="text-stone-500">
                            Capacity: {r.capacity} {r.description ? `· ${r.description}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={r.is_active ? "Active" : "Inactive"} size="sm" />
                          <button
                            type="button"
                            onClick={() => {
                              setEditingResourceId(r.id);
                              setResourceForm({
                                name: r.name,
                                description: r.description || "",
                                capacity: r.capacity || 1,
                                is_active: r.is_active,
                              });
                            }}
                            className="rounded-lg p-1.5 text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteResource(r.id)}
                            className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {detailTab === "media" && (
              <div className="space-y-4">
                <form onSubmit={handleUploadMedia} className="rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] p-3 space-y-3">
                  <p className="text-xs font-bold flex items-center gap-1.5">
                    <ImageIcon size={14} className="text-amber-500" />
                    <span>Upload Activity Image</span>
                  </p>
                  {mediaError && <AlertBanner variant="error" message={mediaError} />}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileChange}
                      className="text-xs"
                    />
                    <select
                      value={mediaType}
                      onChange={(e) => setMediaType(e.target.value)}
                      className={`${INPUT_STYLES.select} !w-auto text-xs`}
                    >
                      <option value="cover">Cover Image</option>
                      <option value="gallery">Gallery Image</option>
                    </select>
                    <input
                      type="text"
                      value={mediaCaption}
                      onChange={(e) => setMediaCaption(e.target.value)}
                      placeholder="Caption (optional)"
                      className={`${INPUT_STYLES.base} !w-48 text-xs`}
                    />
                    <button type="submit" disabled={uploadingMedia} className={BUTTON_VARIANTS.primary}>
                      <Upload size={14} />
                      <span>{uploadingMedia ? "Uploading..." : "Upload"}</span>
                    </button>
                  </div>
                  {mediaPreview && (
                    <img src={mediaPreview} alt="Preview" className="h-24 w-36 rounded-lg object-cover border" />
                  )}
                </form>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {(detailAct.media || []).length === 0 ? (
                    <p className="col-span-full py-6 text-center text-xs text-stone-500">
                      No photos uploaded yet.
                    </p>
                  ) : (
                    detailAct.media.map((m) => (
                      <div
                        key={m.id}
                        className="group relative rounded-xl overflow-hidden border border-[#E5E9F0] dark:border-[#1E293B]"
                      >
                        <div className="h-28 w-full">
                          <ActivityCoverImage src={m.url} alt={m.caption || detailAct.name} />
                        </div>
                        <div className="p-2 flex items-center justify-between text-[11px] bg-white dark:bg-[#101722]">
                          <span className="truncate font-medium">
                            {m.media_type === "cover" ? "Cover" : "Gallery"}{m.caption ? ` · ${m.caption}` : ""}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteMedia(m.id)}
                            className="rounded p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                            title="Delete Image"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <DeleteConfirm
        isOpen={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleConfirmArchive}
        title="Delete / Archive Activity?"
        message={`Clear "${archiveTarget?.name}"? Unused activities are deleted permanently; activities with booking/session history are archived safely.`}
        confirmText="Clear Activity"
        loading={archiving}
      />

      <DeleteConfirm
        isOpen={bulkDeleteOpen}
        onClose={() => !bulkDeleting && setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title={`Clear ${selectedIds.size} Selected Activity Record(s)?`}
        message="Unused activities will be deleted permanently and activities with history will be archived (unless active Pending/Confirmed bookings remain)."
        confirmText="Clear Selected"
        loading={bulkDeleting}
      />
    </div>
  );
}
