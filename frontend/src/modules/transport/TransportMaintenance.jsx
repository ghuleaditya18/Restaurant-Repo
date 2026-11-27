import { useCallback, useEffect, useState } from "react";
import { Edit3, Plus, Trash2, Wrench } from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import DeleteConfirm from "../../components/DeleteConfirm";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import StatusBadge from "../../components/StatusBadge";
import { useNotification } from "../../context/NotificationContext";
import { BUTTON_VARIANTS, CARD_STYLES, INPUT_STYLES } from "../../utils/themeTokens";
import VillaDataTable from "../villas/VillaDataTable";
import { kolkataTodayIso, transportApi, trnDate, trnError, trnMoney } from "./transportApi";

const MAINTENANCE_TYPES = ["Routine Service", "Repair", "Inspection", "Tyre Replacement", "Insurance/Permit", "Breakdown", "Other"];
const MAINTENANCE_STATUSES = ["Scheduled", "In Progress", "Completed", "Cancelled"];

const INITIAL_FORM = {
  vehicle_id: "",
  maintenance_type: "Routine Service",
  service_date: kolkataTodayIso(0),
  service_description: "",
  service_provider: "",
  cost: "0.00",
  odometer_km: "",
  next_service_date: "",
  status: "In Progress",
  notes: "",
};

export default function TransportMaintenance() {
  const { showSuccess } = useNotification();
  const [records, setRecords] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [mRes, vRes] = await Promise.all([
        transportApi.maintenance({ vehicle_id: vehicleFilter || undefined, status: statusFilter || undefined }),
        transportApi.vehicles({ page: 1, page_size: 100 }),
      ]);
      setRecords(mRes.data || []);
      setVehicles(vRes.data?.items || []);
    } catch (err) {
      setError(trnError(err));
    } finally {
      setLoading(false);
    }
  }, [vehicleFilter, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.vehicle_id || !form.service_description.trim()) {
      return setFormError("Vehicle and service description are required.");
    }
    setSaving(true);
    try {
      const payload = {
        vehicle_id: Number(form.vehicle_id),
        maintenance_type: form.maintenance_type,
        service_date: form.service_date,
        service_description: form.service_description.trim(),
        service_provider: form.service_provider.trim() || null,
        cost: Number(form.cost || 0),
        odometer_km: form.odometer_km !== "" ? Number(form.odometer_km) : null,
        next_service_date: form.next_service_date || null,
        status: form.status,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await transportApi.updateMaintenance(editing.id, payload);
        showSuccess("Maintenance record updated.");
      } else {
        await transportApi.createMaintenance(payload);
        showSuccess("Maintenance record logged.");
      }
      setModalOpen(false);
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
      await transportApi.deleteMaintenance(deleteTarget.id);
      showSuccess("Maintenance record deleted.");
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setDeleteError(trnError(err));
    } finally {
      setDeleting(false);
    }
  };

  const alerts = vehicles.filter((v) => v.alerts?.length > 0);

  const columns = [
    {
      key: "vehicle_name",
      label: "Vehicle",
      render: (m) => (
        <div>
          <div className="font-semibold">{m.vehicle_name}</div>
          <div className="text-xs font-mono text-[#8A9AB2]">{m.vehicle_reg}</div>
        </div>
      ),
    },
    { key: "maintenance_type", label: "Type" },
    { key: "service_date", label: "Service Date", render: (m) => trnDate(m.service_date), cellClassName: "whitespace-nowrap" },
    { key: "service_description", label: "Description", render: (m) => <span className="line-clamp-2 max-w-[260px] text-xs">{m.service_description}</span> },
    { key: "service_provider", label: "Provider", render: (m) => m.service_provider || "—" },
    { key: "cost", label: "Cost", align: "right", cellClassName: "font-semibold tabular-nums", render: (m) => trnMoney(m.cost) },
    { key: "next_service_date", label: "Next Service", render: (m) => trnDate(m.next_service_date), cellClassName: "whitespace-nowrap" },
    { key: "status", label: "Status", align: "center", render: (m) => <StatusBadge status={m.status} size="sm" /> },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (m) => (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setEditing(m);
              setForm({
                vehicle_id: String(m.vehicle_id),
                maintenance_type: m.maintenance_type,
                service_date: m.service_date,
                service_description: m.service_description,
                service_provider: m.service_provider || "",
                cost: m.cost,
                odometer_km: m.odometer_km ?? "",
                next_service_date: m.next_service_date || "",
                status: m.status,
                notes: m.notes || "",
              });
              setFormError("");
              setModalOpen(true);
            }}
            className="p-1.5 rounded-lg text-stone-500 hover:text-amber-600 cursor-pointer"
          >
            <Edit3 size={15} />
          </button>
          <button type="button" onClick={() => { setDeleteError(""); setDeleteTarget(m); }} className="p-1.5 rounded-lg text-stone-500 hover:text-rose-600 cursor-pointer"><Trash2 size={15} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Maintenance"
        actions={
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setForm({ ...INITIAL_FORM, vehicle_id: vehicles[0] ? String(vehicles[0].id) : "" });
              setFormError("");
              setModalOpen(true);
            }}
            className={BUTTON_VARIANTS.primary}
          >
            <Plus size={15} /> Log Maintenance
          </button>
        }
      />

      {error && <AlertBanner variant="error" title="Error" message={error} onDismiss={() => setError("")} />}

      {alerts.length > 0 && (
        <AlertBanner
          variant="warning"
          title="Upcoming Service & Document Expiry Alerts"
          message={alerts.map((v) => `${v.vehicle_name} (${v.registration_number}): ${v.alerts.join(", ")}`).join(" · ")}
        />
      )}

      <div className={`${CARD_STYLES.base} w-fit max-w-full !p-2`}>
        <div className="flex flex-wrap items-center gap-2">
          <select value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)} className={`${INPUT_STYLES.select} !w-auto min-w-[140px] !py-1.5 text-xs`}>
            <option value="">All Vehicles</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.vehicle_name} ({v.registration_number})</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${INPUT_STYLES.select} !w-auto min-w-[165px] !py-1.5 text-xs`}>
            <option value="">All Maintenance Statuses</option>
            {MAINTENANCE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {(vehicleFilter || statusFilter) && (
            <button
              type="button"
              onClick={() => {
                setVehicleFilter("");
                setStatusFilter("");
              }}
              className={`${BUTTON_VARIANTS.secondary} !py-1.5 !px-3 text-xs`}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <VillaDataTable
        columns={columns}
        rows={records}
        loading={loading}
        emptyIcon={Wrench}
        emptyTitle="No maintenance records logged"
        tableMinWidth="min-w-[880px]"
      />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Update Maintenance Record" : "Log Vehicle Maintenance"} size="md">
        <form onSubmit={handleSave} className="space-y-3">
          {formError && <AlertBanner variant="error" title="Error" message={formError} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Vehicle *</label>
              <select required disabled={Boolean(editing)} value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })} className={INPUT_STYLES.select}>
                <option value="">Select vehicle...</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.vehicle_name} ({v.registration_number})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Maintenance Type *</label>
              <select value={form.maintenance_type} onChange={(e) => setForm({ ...form, maintenance_type: e.target.value })} className={INPUT_STYLES.select}>
                {MAINTENANCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Service Date *</label>
              <input type="date" required value={form.service_date} onChange={(e) => setForm({ ...form, service_date: e.target.value })} className={INPUT_STYLES.base} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Status *</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={INPUT_STYLES.select}>
                {MAINTENANCE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Service Provider</label>
              <input type="text" value={form.service_provider} onChange={(e) => setForm({ ...form, service_provider: e.target.value })} className={INPUT_STYLES.base} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Cost (INR)</label>
              <input type="number" step="0.01" min={0} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className={INPUT_STYLES.base} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Odometer (km)</label>
              <input type="number" min={0} value={form.odometer_km} onChange={(e) => setForm({ ...form, odometer_km: e.target.value })} className={INPUT_STYLES.base} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Next Service Date</label>
              <input type="date" value={form.next_service_date} onChange={(e) => setForm({ ...form, next_service_date: e.target.value })} className={INPUT_STYLES.base} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Service Description *</label>
            <textarea required rows={2} value={form.service_description} onChange={(e) => setForm({ ...form, service_description: e.target.value })} className={INPUT_STYLES.base} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Notes</label>
            <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={INPUT_STYLES.base} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className={BUTTON_VARIANTS.secondary}>Cancel</button>
            <button type="submit" disabled={saving} className={BUTTON_VARIANTS.primary}>{saving ? "Saving..." : "Save Record"}</button>
          </div>
        </form>
      </Modal>

      <DeleteConfirm
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        recordName={deleteTarget?.maintenance_type}
        loading={deleting}
        error={deleteError}
      />
    </div>
  );
}
