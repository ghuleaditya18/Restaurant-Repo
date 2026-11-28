import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Edit3,
  Eye,
  Plus,
  Search,
  Trash2,
  Upload,
  UserCheck,
} from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import AuthenticatedImage from "../../components/AuthenticatedImage";
import BulkSelectionBar from "../../components/BulkSelectionBar";
import DeleteConfirm from "../../components/DeleteConfirm";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import StatusBadge from "../../components/StatusBadge";
import { useNotification } from "../../context/NotificationContext";
import useBulkSelection from "../../hooks/useBulkSelection";
import { resolveImageUrl } from "../../utils/mediaUtils";
import { BUTTON_VARIANTS, CARD_STYLES, INPUT_STYLES } from "../../utils/themeTokens";
import { validateEmailAddress, validateMobileNumber } from "../../utils/validation";
import VillaDataTable from "../villas/VillaDataTable";
import { transportApi, trnDate, trnError } from "./transportApi";

const AVAILABILITY_STATUSES = ["Available", "On Trip", "Off Duty", "On Leave", "Unavailable"];
const EMPLOYMENT_STATUSES = ["Active", "On Leave", "Inactive"];

const INITIAL_DRIVER_FORM = {
  staff_id: "",
  driver_name: "",
  phone: "",
  email: "",
  licence_number: "",
  licence_validity: "",
  experience_years: 2,
  address: "",
  assigned_vehicle_id: "",
  availability_status: "Available",
  employment_status: "Active",
  notes: "",
};

function DriverAvatar({ driver, sizeClass = "h-12 w-12" }) {
  const initial = (driver?.driver_name || "D").trim().charAt(0).toUpperCase();
  const fallback = (
    <div className={`${sizeClass} rounded-xl bg-gradient-to-br from-[#FFB02E] to-[#D97706] text-[#0D1420] font-bold flex items-center justify-center shrink-0`}>
      {initial}
    </div>
  );
  if (!driver?.profile_image_url) return fallback;
  return (
    <div className={`${sizeClass} rounded-xl overflow-hidden border border-[#E5E9F0] dark:border-[#1E293B] shrink-0`}>
      <AuthenticatedImage src={resolveImageUrl(driver.profile_image_url)} alt={driver.driver_name} fallback={fallback} />
    </div>
  );
}

export default function TransportDrivers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showSuccess, showError } = useNotification();
  const { selectedIds, toggle, toggleMany, clear } = useBulkSelection();

  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [staffLookup, setStaffLookup] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [availFilter, setAvailFilter] = useState("");
  const [empFilter, setEmpFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 12;

  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkFailures, setBulkFailures] = useState([]);

  const [formOpen, setFormOpen] = useState(Boolean(searchParams.get("new")));
  const [editingDriver, setEditingDriver] = useState(null);
  const [form, setForm] = useState(INITIAL_DRIVER_FORM);
  const [pendingFile, setPendingFile] = useState(null);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [detailDriver, setDetailDriver] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const [drvRes, vehRes, stfRes] = await Promise.all([
        transportApi.drivers({
          search: searchQuery.trim() || undefined,
          availability_status: availFilter || undefined,
          employment_status: empFilter || undefined,
          page,
          page_size: pageSize,
        }),
        transportApi.vehicles({ page: 1, page_size: 100 }),
        transportApi.staffLookup().catch(() => ({ data: [] })),
      ]);
      setDrivers(drvRes.data?.items || []);
      setTotalRecords(drvRes.data?.total ?? 0);
      setTotalPages(drvRes.data?.total_pages ?? 1);
      setVehicles(vehRes.data?.items || []);
      setStaffLookup(stfRes.data || []);
    } catch (err) {
      setPageError(trnError(err));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, availFilter, empFilter, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, availFilter, empFilter]);

  useEffect(() => {
    clear();
    setBulkFailures([]);
  }, [searchQuery, availFilter, empFilter, page, clear]);

  useEffect(() => {
    if (searchParams.get("new")) {
      setFormOpen(true);
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const openCreate = () => {
    setEditingDriver(null);
    setForm(INITIAL_DRIVER_FORM);
    setPendingFile(null);
    setFormError("");
    setFieldErrors({});
    setFormOpen(true);
  };

  const openEdit = (d) => {
    setEditingDriver(d);
    setForm({
      staff_id: d.staff_id ? String(d.staff_id) : "",
      driver_name: d.driver_name || "",
      phone: d.phone || "",
      email: d.email || "",
      licence_number: d.licence_number || "",
      licence_validity: d.licence_validity || "",
      experience_years: d.experience_years ?? 0,
      address: d.address || "",
      assigned_vehicle_id: d.assigned_vehicle_id ? String(d.assigned_vehicle_id) : "",
      availability_status: d.availability_status || "Available",
      employment_status: d.employment_status || "Active",
      notes: d.notes || "",
    });
    setPendingFile(null);
    setFormError("");
    setFieldErrors({});
    setFormOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError("");
    const nextFieldErrors = {};
    const phoneRes = validateMobileNumber(form.phone, { required: true, label: "Driver phone" });
    if (!phoneRes.valid) {
      nextFieldErrors.phone = phoneRes.error;
    }
    const emailRes = validateEmailAddress(form.email, { required: false });
    if (!emailRes.valid) {
      nextFieldErrors.email = emailRes.error;
    }
    if (!form.driver_name.trim()) nextFieldErrors.driver_name = "Driver name is required.";
    if (!form.licence_number.trim()) nextFieldErrors.licence_number = "Driving licence number is required.";
    if (!form.licence_validity) nextFieldErrors.licence_validity = "Licence validity date is required.";
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }

    setSaving(true);
    try {
      const payload = {
        driver_name: form.driver_name.trim(),
        phone: phoneRes.normalized,
        email: emailRes.normalized || null,
        licence_number: form.licence_number.trim(),
        licence_validity: form.licence_validity,
        experience_years: Number(form.experience_years || 0),
        address: form.address.trim() || null,
        assigned_vehicle_id: form.assigned_vehicle_id ? Number(form.assigned_vehicle_id) : null,
        staff_id: form.staff_id ? Number(form.staff_id) : null,
        availability_status: form.availability_status,
        employment_status: form.employment_status,
        is_active: form.employment_status === "Active",
        notes: form.notes.trim() || null,
      };
      const res = editingDriver
        ? await transportApi.updateDriver(editingDriver.id, payload)
        : await transportApi.createDriver(payload);

      const savedId = res.data?.id || editingDriver?.id;
      if (pendingFile && savedId) {
        await transportApi.uploadDriverImage(savedId, pendingFile);
      }

      showSuccess(editingDriver ? "Driver updated." : "Driver added.");
      setFormOpen(false);
      await loadData();
    } catch (err) {
      setFormError(trnError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await transportApi.deleteDriver(deleteTarget.id);
      showSuccess(`Driver '${deleteTarget.driver_name}' deleted.`);
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setDeleteError(trnError(err));
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    setBulkFailures([]);
    const deleted = [];
    const failed = [];
    for (const id of selectedIds) {
      const target = drivers.find((d) => d.id === id);
      try {
        await transportApi.deleteDriver(id);
        deleted.push(id);
      } catch (err) {
        failed.push({ id, name: target?.driver_name || `#${id}`, reason: trnError(err) });
      }
    }
    await loadData();
    clear();
    failed.forEach((f) => toggle(f.id));
    setBulkFailures(failed);
    setBulkDeleting(false);
    setBulkConfirmOpen(false);
    if (deleted.length > 0 && failed.length === 0) {
      showSuccess(`Deleted ${deleted.length} driver${deleted.length === 1 ? "" : "s"}.`);
    } else if (deleted.length > 0 && failed.length > 0) {
      showSuccess(`Deleted ${deleted.length} driver(s). ${failed.length} could not be deleted.`);
    } else if (failed.length > 0) {
      showError("Selected drivers with active trips or bookings cannot be deleted.");
    }
  };

  const expiringAlerts = drivers.filter((d) => Boolean(d.licence_alert));

  const driverColumns = [
    {
      key: "driver_name",
      label: "Driver",
      render: (d) => (
        <div className="flex items-center gap-2.5 min-w-[180px]">
          <DriverAvatar driver={d} sizeClass="h-9 w-9" />
          <div className="min-w-0">
            <div className="font-semibold text-[#172033] dark:text-[#F8FAFC] truncate">{d.driver_name}</div>
            <div className="text-xs text-[#64748B] dark:text-[#8A9AB2]">{d.phone}</div>
          </div>
        </div>
      ),
    },
    {
      key: "licence_number",
      label: "Licence",
      render: (d) => (
        <div>
          <div className="font-mono text-xs font-semibold">{d.licence_number}</div>
          <div className={`text-[11px] ${d.licence_alert ? "text-rose-600 font-semibold" : "text-[#8A9AB2]"}`}>
            Valid till {trnDate(d.licence_validity)}
          </div>
        </div>
      ),
    },
    { key: "experience_years", label: "Exp.", align: "right", render: (d) => `${d.experience_years} yrs` },
    {
      key: "assigned_vehicle_name",
      label: "Primary Vehicle",
      render: (d) => (d.assigned_vehicle_name ? `${d.assigned_vehicle_name} (${d.assigned_vehicle_reg})` : "Unassigned"),
    },
    { key: "availability_status", label: "Availability", align: "center", render: (d) => <StatusBadge status={d.availability_status} size="sm" /> },
    { key: "employment_status", label: "Employment", align: "center", render: (d) => <StatusBadge status={d.employment_status} size="sm" /> },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (d) => (
        <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => setDetailDriver(d)} className="p-1.5 rounded-lg text-stone-500 hover:text-amber-600 cursor-pointer"><Eye size={15} /></button>
          <button type="button" onClick={() => openEdit(d)} className="p-1.5 rounded-lg text-stone-500 hover:text-amber-600 cursor-pointer"><Edit3 size={15} /></button>
          <button type="button" onClick={() => { setDeleteError(""); setDeleteTarget(d); }} className="p-1.5 rounded-lg text-stone-500 hover:text-rose-600 cursor-pointer"><Trash2 size={15} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Drivers"
        actions={
          <button type="button" onClick={openCreate} className={BUTTON_VARIANTS.primary}>
            <Plus size={15} /> Add Driver
          </button>
        }
      />

      {pageError && <AlertBanner variant="error" title="Error" message={pageError} onDismiss={() => setPageError("")} />}

      {expiringAlerts.length > 0 && (
        <AlertBanner
          variant="warning"
          title={`${expiringAlerts.length} Driver Licence Alert${expiringAlerts.length > 1 ? "s" : ""}`}
          message={expiringAlerts.map((d) => `${d.driver_name} (${d.licence_alert}: ${trnDate(d.licence_validity)})`).join(" · ")}
        />
      )}

      <div className={`${CARD_STYLES.base} w-fit max-w-full !p-2`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-52">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              className={`${INPUT_STYLES.base} pl-9 !py-1.5 text-xs`}
            />
          </div>
          <select value={availFilter} onChange={(e) => setAvailFilter(e.target.value)} className={`${INPUT_STYLES.select} !w-auto min-w-[130px] !py-1.5 text-xs`}>
            <option value="">All Availability</option>
            {AVAILABILITY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={empFilter} onChange={(e) => setEmpFilter(e.target.value)} className={`${INPUT_STYLES.select} !w-auto min-w-[135px] !py-1.5 text-xs`}>
            <option value="">All Employment</option>
            {EMPLOYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {(searchQuery || availFilter || empFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setAvailFilter("");
                setEmpFilter("");
              }}
              className={`${BUTTON_VARIANTS.secondary} !py-1.5 !px-3 text-xs`}
            >
              Reset
            </button>
          )}
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
          title="Some drivers could not be deleted"
          message={bulkFailures.map((f) => `${f.name}: ${f.reason}`).join(" · ")}
          onDismiss={() => setBulkFailures([])}
        />
      )}

      <VillaDataTable
        columns={driverColumns}
        rows={drivers}
        loading={loading}
        emptyIcon={UserCheck}
        emptyTitle="No drivers found"
        tableMinWidth="min-w-[820px]"
        pagination={{ currentPage: page, totalPages, totalRecords, pageSize, onPageChange: setPage }}
        onRowClick={(d) => setDetailDriver(d)}
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

      {/* ADD / EDIT DRIVER MODAL */}
      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingDriver ? `Edit Driver: ${editingDriver.driver_name}` : "Add Driver"}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && <AlertBanner variant="error" title="Validation Error" message={formError} />}

          {!editingDriver && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-[#30251C]/40 p-3">
              <label className="block text-xs font-semibold mb-1">Link Existing Driver Staff Record (Optional)</label>
              <select
                value={form.staff_id}
                onChange={(e) => {
                  const st = staffLookup.find((s) => String(s.staff_id) === e.target.value);
                  setForm({
                    ...form,
                    staff_id: e.target.value,
                    driver_name: st ? st.full_name : form.driver_name,
                    phone: st ? st.phone : form.phone,
                    email: st ? st.email : form.email,
                  });
                }}
                className={INPUT_STYLES.select}
              >
                <option value="">
                  {staffLookup.length > 0
                    ? "Create standalone driver profile"
                    : "No unlinked Driver staff found — create standalone driver"}
                </option>
                {staffLookup.map((s) => (
                  <option key={s.staff_id} value={s.staff_id}>
                    {s.full_name} ({s.employee_code} · {s.designation})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Driver Name *</label>
              <input type="text" required value={form.driver_name} onChange={(e) => { setForm({ ...form, driver_name: e.target.value }); setFieldErrors((p) => ({ ...p, driver_name: "" })); }} aria-invalid={Boolean(fieldErrors.driver_name)} className={`${INPUT_STYLES.base} ${fieldErrors.driver_name ? "border-red-500 focus:border-red-500" : ""}`} />
              {fieldErrors.driver_name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.driver_name}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Mobile Number *</label>
              <input type="text" required value={form.phone} onChange={(e) => { setForm({ ...form, phone: e.target.value }); setFieldErrors((p) => ({ ...p, phone: "" })); }} aria-invalid={Boolean(fieldErrors.phone)} className={`${INPUT_STYLES.base} ${fieldErrors.phone ? "border-red-500 focus:border-red-500" : ""}`} placeholder="10-digit mobile" />
              {fieldErrors.phone && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.phone}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => { setForm({ ...form, email: e.target.value }); setFieldErrors((p) => ({ ...p, email: "" })); }} aria-invalid={Boolean(fieldErrors.email)} className={`${INPUT_STYLES.base} ${fieldErrors.email ? "border-red-500 focus:border-red-500" : ""}`} />
              {fieldErrors.email && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.email}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Driving Licence Number *</label>
              <input type="text" required value={form.licence_number} onChange={(e) => { setForm({ ...form, licence_number: e.target.value }); setFieldErrors((p) => ({ ...p, licence_number: "" })); }} aria-invalid={Boolean(fieldErrors.licence_number)} className={`${INPUT_STYLES.base} ${fieldErrors.licence_number ? "border-red-500 focus:border-red-500" : ""}`} />
              {fieldErrors.licence_number && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.licence_number}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Licence Validity *</label>
              <input type="date" required value={form.licence_validity} onChange={(e) => { setForm({ ...form, licence_validity: e.target.value }); setFieldErrors((p) => ({ ...p, licence_validity: "" })); }} aria-invalid={Boolean(fieldErrors.licence_validity)} className={`${INPUT_STYLES.base} ${fieldErrors.licence_validity ? "border-red-500 focus:border-red-500" : ""}`} />
              {fieldErrors.licence_validity && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.licence_validity}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Experience (Years)</label>
              <input type="number" min={0} max={70} value={form.experience_years} onChange={(e) => setForm({ ...form, experience_years: e.target.value })} className={INPUT_STYLES.base} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Assigned Vehicle</label>
              <select value={form.assigned_vehicle_id} onChange={(e) => setForm({ ...form, assigned_vehicle_id: e.target.value })} className={INPUT_STYLES.select}>
                <option value="">None</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.vehicle_name} ({v.registration_number})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Availability</label>
              <select value={form.availability_status} onChange={(e) => setForm({ ...form, availability_status: e.target.value })} className={INPUT_STYLES.select}>
                {AVAILABILITY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Employment Status</label>
              <select value={form.employment_status} onChange={(e) => setForm({ ...form, employment_status: e.target.value })} className={INPUT_STYLES.select}>
                {EMPLOYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Address</label>
              <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={INPUT_STYLES.base} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Profile Photo (optional)</label>
              <label className="inline-flex items-center gap-2 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 px-3 py-2 text-xs font-semibold cursor-pointer hover:border-amber-500">
                <Upload size={14} className="text-amber-500" />
                <span>{pendingFile ? pendingFile.name : "Upload JPG/PNG/WebP"}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setPendingFile(e.target.files?.[0] || null)} />
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Notes</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={INPUT_STYLES.base} />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E9F0] dark:border-[#1E293B]">
            <button type="button" onClick={() => setFormOpen(false)} className={BUTTON_VARIANTS.secondary}>Cancel</button>
            <button type="submit" disabled={saving} className={BUTTON_VARIANTS.primary}>
              {saving ? "Saving..." : editingDriver ? "Save Changes" : "Create Driver"}
            </button>
          </div>
        </form>
      </Modal>

      {/* DETAIL MODAL */}
      <Modal isOpen={Boolean(detailDriver)} onClose={() => setDetailDriver(null)} title={detailDriver?.driver_name || "Driver Profile"} size="md">
        {detailDriver && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <DriverAvatar driver={detailDriver} sizeClass="h-16 w-16" />
              <div>
                <h3 className="text-base font-bold">{detailDriver.driver_name}</h3>
                <p className="text-xs text-[#8A9AB2]">{detailDriver.phone} {detailDriver.email ? `· ${detailDriver.email}` : ""}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <StatusBadge status={detailDriver.availability_status} size="sm" />
                  <StatusBadge status={detailDriver.employment_status} size="sm" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {[
                ["Licence Number", detailDriver.licence_number],
                ["Licence Validity", trnDate(detailDriver.licence_validity)],
                ["Experience", `${detailDriver.experience_years} years`],
                ["Assigned Vehicle", detailDriver.assigned_vehicle_name ? `${detailDriver.assigned_vehicle_name} (${detailDriver.assigned_vehicle_reg})` : "Unassigned"],
                ["Address", detailDriver.address || "—"],
                ["Staff Link", detailDriver.staff_id ? `Staff #${detailDriver.staff_id}` : "Standalone"],
              ].map(([k, val]) => (
                <div key={k} className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] border border-[#E5E9F0] dark:border-[#1E293B] p-2.5">
                  <p className="text-[10px] font-bold uppercase text-[#8A9AB2]">{k}</p>
                  <p className="mt-0.5 font-semibold">{val}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <DeleteConfirm
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        recordName={deleteTarget?.driver_name}
        message="Drivers with existing trip assignments or bookings cannot be deleted."
        loading={deleting}
        error={deleteError}
      />

      <DeleteConfirm
        isOpen={bulkConfirmOpen}
        onClose={() => setBulkConfirmOpen(false)}
        onConfirm={handleBulkDelete}
        title={`Delete ${selectedIds.size} Selected Driver${selectedIds.size === 1 ? "" : "s"}`}
        recordName={`${selectedIds.size} selected driver(s)`}
        message="Drivers with existing trip assignments or bookings cannot be deleted."
        loading={bulkDeleting}
      />
    </div>
  );
}
