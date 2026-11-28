import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Car,
  Edit3,
  Eye,
  Layers,
  LayoutGrid,
  List,
  Plus,
  Power,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import BulkSelectionBar from "../../components/BulkSelectionBar";
import DeleteConfirm from "../../components/DeleteConfirm";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import Pagination from "../../components/Pagination";
import StatusBadge from "../../components/StatusBadge";
import { useNotification } from "../../context/NotificationContext";
import useBulkSelection from "../../hooks/useBulkSelection";
import { BUTTON_VARIANTS, CARD_STYLES, INPUT_STYLES } from "../../utils/themeTokens";
import VillaDataTable from "../villas/VillaDataTable";
import VehicleCoverImage from "./VehicleCoverImage";
import { transportApi, trnError } from "./transportApi";

const VEHICLE_STATUSES = ["Available", "Assigned", "On Trip", "Maintenance", "Inactive"];

const INITIAL_VEHICLE_FORM = {
  vehicle_name: "",
  registration_number: "",
  category_id: "",
  seating_capacity: 4,
  status: "Available",
  notes: "",
};

const INITIAL_CAT_FORM = { name: "", description: "", default_capacity: 4, is_active: true };

export default function TransportVehicles() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showSuccess, showError } = useNotification();
  const { selectedIds, toggle, toggleMany, clear } = useBulkSelection();

  const [tab, setTab] = useState("vehicles"); // vehicles | categories
  const [viewMode, setViewMode] = useState("table");
  const [vehicles, setVehicles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 12;

  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkFailures, setBulkFailures] = useState([]);

  // Vehicle modal
  const [formOpen, setFormOpen] = useState(Boolean(searchParams.get("new")));
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [form, setForm] = useState(INITIAL_VEHICLE_FORM);
  const [pendingFile, setPendingFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Detail modal
  const [detailVehicle, setDetailVehicle] = useState(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Category modal
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [catForm, setCatForm] = useState(INITIAL_CAT_FORM);
  const [catError, setCatError] = useState("");
  const [catFieldError, setCatFieldError] = useState("");
  const [savingCat, setSavingCat] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const [vehRes, catRes] = await Promise.all([
        transportApi.vehicles({
          search: searchQuery.trim() || undefined,
          category_id: categoryFilter || undefined,
          status: statusFilter || undefined,
          page,
          page_size: pageSize,
        }),
        transportApi.categories(),
      ]);
      setVehicles(vehRes.data?.items || []);
      setTotalRecords(vehRes.data?.total ?? 0);
      setTotalPages(vehRes.data?.total_pages ?? 1);
      setCategories(catRes.data || []);
    } catch (err) {
      setPageError(trnError(err));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, categoryFilter, statusFilter, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, categoryFilter, statusFilter]);

  useEffect(() => {
    clear();
    setBulkFailures([]);
  }, [searchQuery, categoryFilter, statusFilter, page, tab, clear]);

  useEffect(() => {
    if (searchParams.get("new")) {
      setFormOpen(true);
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const openCreateVehicle = () => {
    const firstCat = categories[0];
    setEditingVehicle(null);
    setForm({
      ...INITIAL_VEHICLE_FORM,
      category_id: firstCat ? String(firstCat.id) : "",
      seating_capacity: firstCat?.default_capacity || 4,
    });
    setPendingFile(null);
    setPreviewUrl("");
    setFormError("");
    setFieldErrors({});
    setFormOpen(true);
  };

  const openEditVehicle = (v) => {
    setEditingVehicle(v);
    setForm({
      vehicle_name: v.vehicle_name || "",
      registration_number: v.registration_number || "",
      category_id: String(v.category_id || ""),
      seating_capacity: v.seating_capacity ?? 4,
      status: v.status || "Available",
      notes: v.notes || "",
    });
    setPendingFile(null);
    setPreviewUrl(v.image_url || "");
    setFormError("");
    setFieldErrors({});
    setFormOpen(true);
  };

  const handleSaveVehicle = async (e) => {
    e.preventDefault();
    setFormError("");
    const nextFieldErrors = {};
    if (!form.vehicle_name.trim()) nextFieldErrors.vehicle_name = "Vehicle name is required.";
    if (!form.registration_number.trim()) nextFieldErrors.registration_number = "Registration number is required.";
    if (!form.category_id) nextFieldErrors.category_id = "Select a vehicle category.";
    if (!Number(form.seating_capacity) || Number(form.seating_capacity) < 1) nextFieldErrors.seating_capacity = "Seating capacity must be at least 1.";
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }
    setSaving(true);
    try {
      const cat = categories.find((c) => String(c.id) === String(form.category_id));
      const payload = {
        vehicle_name: form.vehicle_name.trim(),
        registration_number: form.registration_number.trim(),
        category_id: Number(form.category_id),
        vehicle_type: cat?.name || undefined,
        seating_capacity: Number(form.seating_capacity),
        status: form.status,
        is_active: form.status !== "Inactive",
        notes: form.notes.trim() || null,
      };

      const res = editingVehicle
        ? await transportApi.updateVehicle(editingVehicle.id, payload)
        : await transportApi.createVehicle(payload);

      const savedId = res.data?.id || editingVehicle?.id;
      if (pendingFile && savedId) {
        await transportApi.uploadVehicleImage(savedId, pendingFile);
      }

      showSuccess(editingVehicle ? "Vehicle updated successfully." : "Vehicle added to fleet.");
      setFormOpen(false);
      await loadData();
    } catch (err) {
      setFormError(trnError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (v) => {
    try {
      await transportApi.toggleVehicleStatus(v.id, { is_active: !v.is_active });
      showSuccess(`${v.vehicle_name} ${!v.is_active ? "activated" : "deactivated"}.`);
      await loadData();
    } catch (err) {
      showError(trnError(err));
    }
  };

  const handleDeleteVehicle = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      if (deleteTarget.type === "category") {
        await transportApi.deleteCategory(deleteTarget.item.id);
        showSuccess(`Category '${deleteTarget.item.name}' deleted.`);
      } else {
        await transportApi.deleteVehicle(deleteTarget.item.id);
        showSuccess(`Vehicle '${deleteTarget.item.vehicle_name}' deleted.`);
      }
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setDeleteError(trnError(err));
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDeleteVehicles = async () => {
    setBulkDeleting(true);
    setBulkFailures([]);
    const deleted = [];
    const failed = [];
    for (const id of selectedIds) {
      const target = vehicles.find((v) => v.id === id);
      try {
        await transportApi.deleteVehicle(id);
        deleted.push(id);
      } catch (err) {
        failed.push({ id, name: target ? `${target.vehicle_name} (${target.registration_number})` : `#${id}`, reason: trnError(err) });
      }
    }
    await loadData();
    clear();
    failed.forEach((f) => toggle(f.id));
    setBulkFailures(failed);
    setBulkDeleting(false);
    setBulkConfirmOpen(false);
    if (deleted.length > 0 && failed.length === 0) {
      showSuccess(`Deleted ${deleted.length} vehicle${deleted.length === 1 ? "" : "s"}.`);
    } else if (deleted.length > 0 && failed.length > 0) {
      showSuccess(`Deleted ${deleted.length} vehicle(s). ${failed.length} could not be deleted.`);
    } else if (failed.length > 0) {
      showError("Selected vehicles with assignments or maintenance history cannot be deleted.");
    }
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    setCatError("");
    if (!catForm.name.trim()) {
      setCatFieldError("Category name is required.");
      return;
    }
    setCatFieldError("");
    setSavingCat(true);
    try {
      const payload = {
        name: catForm.name.trim(),
        description: catForm.description.trim() || null,
        default_capacity: Number(catForm.default_capacity || 4),
        is_active: Boolean(catForm.is_active),
      };
      if (editingCat) {
        await transportApi.updateCategory(editingCat.id, payload);
        showSuccess("Category updated.");
      } else {
        await transportApi.createCategory(payload);
        showSuccess("Category created.");
      }
      setCatModalOpen(false);
      await loadData();
    } catch (err) {
      setCatError(trnError(err));
    } finally {
      setSavingCat(false);
    }
  };

  const vehicleColumns = [
    {
      key: "vehicle",
      label: "Vehicle",
      render: (v) => (
        <div className="flex items-center gap-3 min-w-[200px]">
          <div className="h-11 w-16 rounded-lg overflow-hidden border border-[#E5E9F0] dark:border-[#1E293B] shrink-0">
            <VehicleCoverImage
              src={v.image_url}
              categoryName={v.category_name}
              vehicleType={v.vehicle_type}
              fuelType={v.fuel_type}
              alt={v.vehicle_name}
            />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-[#172033] dark:text-[#F8FAFC] truncate">{v.vehicle_name}</div>
            <div className="text-xs font-mono text-[#64748B] dark:text-[#8A9AB2]">{v.registration_number}</div>
          </div>
        </div>
      ),
    },
    { key: "category_name", label: "Category", render: (v) => v.category_name || v.vehicle_type },
    { key: "seating_capacity", label: "Seating Capacity", align: "right", cellClassName: "tabular-nums font-semibold", render: (v) => `${v.seating_capacity} Seats` },
    { key: "status", label: "Operational Status", align: "center", render: (v) => <StatusBadge status={v.status} size="sm" /> },
    {
      key: "notes",
      label: "Notes",
      render: (v) => (
        <span className="text-xs text-[#64748B] dark:text-[#8A9AB2] line-clamp-1 max-w-[220px]">
          {v.notes || "—"}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (v) => (
        <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => setDetailVehicle(v)} title="View details" className="p-1.5 rounded-lg text-stone-500 hover:text-amber-600 hover:bg-stone-100 dark:hover:bg-[#151D29] cursor-pointer">
            <Eye size={15} />
          </button>
          <button type="button" onClick={() => openEditVehicle(v)} title="Edit" className="p-1.5 rounded-lg text-stone-500 hover:text-amber-600 hover:bg-stone-100 dark:hover:bg-[#151D29] cursor-pointer">
            <Edit3 size={15} />
          </button>
          <button type="button" onClick={() => handleToggleActive(v)} title={v.is_active ? "Deactivate" : "Activate"} className="p-1.5 rounded-lg text-stone-500 hover:text-emerald-600 hover:bg-stone-100 dark:hover:bg-[#151D29] cursor-pointer">
            <Power size={15} />
          </button>
          <button type="button" onClick={() => { setDeleteError(""); setDeleteTarget({ type: "vehicle", item: v }); }} title="Delete" className="p-1.5 rounded-lg text-stone-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer">
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  const categoryColumns = [
    { key: "name", label: "Category Name", cellClassName: "font-semibold" },
    { key: "default_capacity", label: "Default Seats", align: "right", cellClassName: "tabular-nums" },
    { key: "vehicle_count", label: "Fleet Count", align: "right", cellClassName: "tabular-nums font-semibold" },
    { key: "description", label: "Description", render: (c) => c.description || "—" },
    { key: "is_active", label: "Status", align: "center", render: (c) => <StatusBadge status={c.is_active ? "Active" : "Inactive"} size="sm" /> },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (c) => (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setEditingCat(c);
              setCatForm({ name: c.name, description: c.description || "", default_capacity: c.default_capacity, is_active: c.is_active });
              setCatError("");
              setCatModalOpen(true);
            }}
            className="p-1.5 rounded-lg text-stone-500 hover:text-amber-600 hover:bg-stone-100 dark:hover:bg-[#151D29] cursor-pointer"
          >
            <Edit3 size={15} />
          </button>
          <button
            type="button"
            onClick={() => { setDeleteError(""); setDeleteTarget({ type: "category", item: c }); }}
            className="p-1.5 rounded-lg text-stone-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Vehicles"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-1">
              <button
                type="button"
                onClick={() => setTab("vehicles")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                  tab === "vehicles" ? "bg-[#30251C] text-[#FFB02E]" : "text-stone-600 dark:text-[#8A9AB2]"
                }`}
              >
                <Car size={14} /> Fleet Vehicles
              </button>
              <button
                type="button"
                onClick={() => setTab("categories")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                  tab === "categories" ? "bg-[#30251C] text-[#FFB02E]" : "text-stone-600 dark:text-[#8A9AB2]"
                }`}
              >
                <Layers size={14} /> Categories
              </button>
            </div>
            {tab === "vehicles" ? (
              <button type="button" onClick={openCreateVehicle} className={BUTTON_VARIANTS.primary}>
                <Plus size={15} /> Add Vehicle
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingCat(null);
                  setCatForm(INITIAL_CAT_FORM);
                  setCatError("");
                  setCatModalOpen(true);
                }}
                className={BUTTON_VARIANTS.primary}
              >
                <Plus size={15} /> Add Category
              </button>
            )}
          </div>
        }
      />

      {pageError && <AlertBanner variant="error" title="Error" message={pageError} onDismiss={() => setPageError("")} />}

      {tab === "vehicles" ? (
        <>
          {/* FILTER TOOLBAR */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className={`${CARD_STYLES.base} w-fit max-w-full !p-2`}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-48">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search"
                    className={`${INPUT_STYLES.base} pl-9 !py-1.5 text-xs`}
                  />
                </div>
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={`${INPUT_STYLES.select} !w-auto min-w-[130px] !py-1.5 text-xs`}>
                  <option value="">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${INPUT_STYLES.select} !w-auto min-w-[125px] !py-1.5 text-xs`}>
                  <option value="">All Statuses</option>
                  {VEHICLE_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
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

            <div className="inline-flex rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-1 gap-1 shrink-0 shadow-xs">
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
              title="Some vehicles could not be deleted"
              message={bulkFailures.map((f) => `${f.name}: ${f.reason}`).join(" · ")}
              onDismiss={() => setBulkFailures([])}
            />
          )}

          {viewMode === "table" ? (
            <VillaDataTable
              columns={vehicleColumns}
              rows={vehicles}
              loading={loading}
              loadingMessage="Loading fleet vehicles..."
              emptyIcon={Car}
              emptyTitle="No vehicles found"
              emptyDescription="Add a vehicle or adjust your search filters."
              tableMinWidth="min-w-[820px]"
              pagination={{ currentPage: page, totalPages, totalRecords, pageSize, onPageChange: setPage }}
              onRowClick={(v) => setDetailVehicle(v)}
              selectedIds={selectedIds}
              onSelectRow={(id) => {
                setBulkFailures([]);
                toggle(id);
              }}
              onSelectAll={(ids) => {
                setBulkFailures([]);
                toggleMany(ids);
              }}
            />
          ) : loading ? (
            <div className={`${CARD_STYLES.base} py-12 text-center text-sm text-[#8A9AB2]`}>Loading fleet vehicles...</div>
          ) : vehicles.length === 0 ? (
            <div className={`${CARD_STYLES.base} py-12 text-center`}>
              <Car size={28} className="mx-auto text-stone-400 mb-2" />
              <p className="text-sm font-semibold">No vehicles found</p>
              <p className="text-xs text-[#8A9AB2] mt-0.5">Add a vehicle to start managing fleet operations.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {vehicles.map((v) => (
                  <div key={v.id} className="rounded-2xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] overflow-hidden shadow-xs flex flex-col">
                    <div className="relative h-36 bg-stone-900 overflow-hidden cursor-pointer" onClick={() => setDetailVehicle(v)}>
                      <VehicleCoverImage
                        src={v.image_url}
                        categoryName={v.category_name}
                        vehicleType={v.vehicle_type}
                        fuelType={v.fuel_type}
                        alt={v.vehicle_name}
                      />
                      <div className="absolute top-2.5 left-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(v.id)}
                          onChange={() => {
                            setBulkFailures([]);
                            toggle(v.id);
                          }}
                          aria-label={`Select ${v.vehicle_name}`}
                          className="h-4 w-4 rounded accent-amber-500 cursor-pointer"
                        />
                      </div>
                      <div className="absolute top-2.5 right-2.5">
                        <StatusBadge status={v.status} size="sm" />
                      </div>
                    </div>

                    <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-bold text-[#172033] dark:text-[#F8FAFC] truncate">{v.vehicle_name}</h3>
                          <span className="text-[11px] font-mono font-semibold text-amber-700 dark:text-amber-300 shrink-0">
                            {v.registration_number}
                          </span>
                        </div>
                        <p className="text-xs text-[#64748B] dark:text-[#8A9AB2] mt-0.5 truncate">
                          {v.category_name || v.vehicle_type}
                        </p>

                        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-stone-600 dark:text-stone-300">
                          <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-[#151D29] px-2 py-0.5 font-medium">
                            <Users size={11} className="text-amber-500" /> {v.seating_capacity} Seats
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2.5 border-t border-[#E5E9F0] dark:border-[#1E293B]">
                        <button
                          type="button"
                          onClick={() => setDetailVehicle(v)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                        >
                          <Eye size={13} /> Details
                        </button>
                        <div className="inline-flex items-center gap-1">
                          <button type="button" onClick={() => openEditVehicle(v)} title="Edit" className="p-1.5 rounded-lg text-stone-500 hover:text-amber-600 hover:bg-stone-100 dark:hover:bg-[#151D29] cursor-pointer">
                            <Edit3 size={14} />
                          </button>
                          <button type="button" onClick={() => handleToggleActive(v)} title={v.is_active ? "Deactivate" : "Activate"} className="p-1.5 rounded-lg text-stone-500 hover:text-emerald-600 hover:bg-stone-100 dark:hover:bg-[#151D29] cursor-pointer">
                            <Power size={14} />
                          </button>
                          <button type="button" onClick={() => { setDeleteError(""); setDeleteTarget({ type: "vehicle", item: v }); }} title="Delete" className="p-1.5 rounded-lg text-stone-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Pagination currentPage={page} totalPages={totalPages} totalRecords={totalRecords} pageSize={pageSize} onPageChange={setPage} />
            </div>
          )}
        </>
      ) : (
        <VillaDataTable
          title="Configurable Vehicle Categories"
          subtitle="Categories used for vehicle classification and service pricing eligibility"
          columns={categoryColumns}
          rows={categories}
          loading={loading}
          emptyTitle="No vehicle categories"
          tableMinWidth="min-w-[700px]"
        />
      )}

      {/* ADD / EDIT VEHICLE MODAL */}
      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingVehicle ? `Edit ${editingVehicle.vehicle_name}` : "Add Fleet Vehicle"}
        size="lg"
      >
        <form onSubmit={handleSaveVehicle} className="space-y-4">
          {formError && <AlertBanner variant="error" title="Validation Error" message={formError} />}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Vehicle Name *</label>
              <input type="text" required value={form.vehicle_name} onChange={(e) => { setForm({ ...form, vehicle_name: e.target.value }); setFieldErrors((p) => ({ ...p, vehicle_name: "" })); }} className={INPUT_STYLES.base} placeholder="e.g. Toyota Fortuner" />
              {fieldErrors.vehicle_name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.vehicle_name}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Registration Number *</label>
              <input type="text" required value={form.registration_number} onChange={(e) => { setForm({ ...form, registration_number: e.target.value }); setFieldErrors((p) => ({ ...p, registration_number: "" })); }} className={INPUT_STYLES.base} placeholder="e.g. MH 12 AB 4589" />
              {fieldErrors.registration_number && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.registration_number}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Vehicle Category *</label>
              <select
                required
                value={form.category_id}
                onChange={(e) => {
                  const cat = categories.find((c) => String(c.id) === e.target.value);
                  setForm({
                    ...form,
                    category_id: e.target.value,
                    seating_capacity: editingVehicle ? form.seating_capacity : (cat?.default_capacity || form.seating_capacity),
                  });
                  setFieldErrors((p) => ({ ...p, category_id: "" }));
                }}
                className={INPUT_STYLES.select}
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {fieldErrors.category_id && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.category_id}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Seating Capacity *</label>
              <input type="number" min={1} max={100} required value={form.seating_capacity} onChange={(e) => { setForm({ ...form, seating_capacity: e.target.value }); setFieldErrors((p) => ({ ...p, seating_capacity: "" })); }} className={INPUT_STYLES.base} />
              {fieldErrors.seating_capacity && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.seating_capacity}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Operational Status *</label>
              <select required value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={INPUT_STYLES.select}>
                {VEHICLE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Vehicle Photo</label>
              <label className="inline-flex items-center gap-2 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 px-3 py-2 text-xs font-semibold cursor-pointer hover:border-amber-500 w-full">
                <Upload size={14} className="text-amber-500 shrink-0" />
                <span className="truncate">{pendingFile ? pendingFile.name : "Upload JPG/PNG/WebP"}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setPendingFile(file);
                      setPreviewUrl(URL.createObjectURL(file));
                    }
                  }}
                />
              </label>
              {previewUrl && <p className="text-[11px] text-emerald-600 mt-1">Photo ready</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Notes</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={INPUT_STYLES.base} />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E9F0] dark:border-[#1E293B]">
            <button type="button" onClick={() => setFormOpen(false)} className={BUTTON_VARIANTS.secondary}>Cancel</button>
            <button type="submit" disabled={saving} className={BUTTON_VARIANTS.primary}>
              {saving ? "Saving..." : editingVehicle ? "Save Changes" : "Add Vehicle"}
            </button>
          </div>
        </form>
      </Modal>

      {/* VEHICLE DETAIL MODAL */}
      <Modal
        isOpen={Boolean(detailVehicle)}
        onClose={() => setDetailVehicle(null)}
        title={detailVehicle ? `${detailVehicle.vehicle_name} (${detailVehicle.registration_number})` : ""}
        size="md"
      >
        {detailVehicle && (
          <div className="space-y-4">
            <div className="h-48 rounded-xl overflow-hidden border border-[#E5E9F0] dark:border-[#1E293B]">
              <VehicleCoverImage
                src={detailVehicle.image_url}
                categoryName={detailVehicle.category_name}
                vehicleType={detailVehicle.vehicle_type}
                fuelType={detailVehicle.fuel_type}
                alt={detailVehicle.vehicle_name}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              {[
                ["Vehicle Name", detailVehicle.vehicle_name],
                ["Registration Number", detailVehicle.registration_number],
                ["Vehicle Category", detailVehicle.category_name || detailVehicle.vehicle_type],
                ["Seating Capacity", `${detailVehicle.seating_capacity} Passengers`],
                ["Operational Status", detailVehicle.status],
              ].map(([k, val]) => (
                <div key={k} className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] border border-[#E5E9F0] dark:border-[#1E293B] p-2.5">
                  <p className="text-[10px] font-bold uppercase text-[#8A9AB2]">{k}</p>
                  <p className="mt-0.5 font-semibold text-[#172033] dark:text-[#F8FAFC]">{val}</p>
                </div>
              ))}
            </div>
            {detailVehicle.notes && (
              <p className="text-xs text-stone-600 dark:text-stone-300 bg-stone-50 dark:bg-[#151D29] p-3 rounded-xl">
                {detailVehicle.notes}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* CATEGORY MODAL */}
      <Modal
        isOpen={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        title={editingCat ? `Edit Category: ${editingCat.name}` : "Add Vehicle Category"}
        size="sm"
      >
        <form onSubmit={handleSaveCategory} className="space-y-3">
          {catError && <AlertBanner variant="error" title="Error" message={catError} />}
          <div>
            <label className="block text-xs font-semibold mb-1">Category Name *</label>
            <input type="text" required value={catForm.name} onChange={(e) => { setCatForm({ ...catForm, name: e.target.value }); setCatFieldError(""); }} aria-invalid={Boolean(catFieldError)} className={`${INPUT_STYLES.base} ${catFieldError ? "border-red-500 focus:border-red-500" : ""}`} />
            {catFieldError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{catFieldError}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Default Seating Capacity</label>
            <input type="number" min={1} max={100} value={catForm.default_capacity} onChange={(e) => setCatForm({ ...catForm, default_capacity: e.target.value })} className={INPUT_STYLES.base} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Description</label>
            <textarea rows={2} value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} className={INPUT_STYLES.base} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCatModalOpen(false)} className={BUTTON_VARIANTS.secondary}>Cancel</button>
            <button type="submit" disabled={savingCat} className={BUTTON_VARIANTS.primary}>
              {savingCat ? "Saving..." : "Save Category"}
            </button>
          </div>
        </form>
      </Modal>

      <DeleteConfirm
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteVehicle}
        recordName={deleteTarget?.type === "category" ? deleteTarget.item?.name : deleteTarget?.item?.vehicle_name}
        message="Records with historical assignments, trips, or maintenance cannot be deleted."
        loading={deleting}
        error={deleteError}
      />

      <DeleteConfirm
        isOpen={bulkConfirmOpen}
        onClose={() => setBulkConfirmOpen(false)}
        onConfirm={handleBulkDeleteVehicles}
        title={`Delete ${selectedIds.size} Selected Vehicle${selectedIds.size === 1 ? "" : "s"}`}
        recordName={`${selectedIds.size} selected vehicle(s)`}
        message="Vehicles with historical assignments, trips, or maintenance cannot be deleted."
        loading={bulkDeleting}
      />
    </div>
  );
}
