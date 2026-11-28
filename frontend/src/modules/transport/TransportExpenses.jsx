import { useCallback, useEffect, useState } from "react";
import { Fuel, Plus, Trash2 } from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import DeleteConfirm from "../../components/DeleteConfirm";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import { useNotification } from "../../context/NotificationContext";
import { BUTTON_VARIANTS, CARD_STYLES, INPUT_STYLES } from "../../utils/themeTokens";
import VillaDataTable from "../villas/VillaDataTable";
import { kolkataTodayIso, transportApi, trnDate, trnError, trnMoney } from "./transportApi";

const EXPENSE_CATEGORIES = ["Fuel", "Toll", "Parking", "Washing", "Permit Fee", "Repair", "Other"];
const FUEL_TYPES = ["Petrol", "Diesel", "EV Charging", "CNG"];

const INITIAL_FORM = {
  vehicle_id: "",
  record_date: kolkataTodayIso(0),
  expense_category: "Fuel",
  fuel_type: "Diesel",
  quantity: "",
  cost_per_unit: "",
  total_amount: "",
  odometer_km: "",
  vendor_name: "",
  notes: "",
};

export default function TransportExpenses() {
  const { showSuccess } = useNotification();
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [vehicleFilter, setVehicleFilter] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [expRes, vehRes] = await Promise.all([
        transportApi.expenses({
          vehicle_id: vehicleFilter || undefined,
          expense_category: catFilter || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        }),
        transportApi.vehicles({ page: 1, page_size: 100 }),
      ]);
      setItems(expRes.data?.items || []);
      setSummary(expRes.data?.vehicle_summary || []);
      setVehicles(vehRes.data?.items || []);
    } catch (err) {
      setError(trnError(err));
    } finally {
      setLoading(false);
    }
  }, [vehicleFilter, catFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError("");
    const nextFieldErrors = {};
    if (!form.vehicle_id) nextFieldErrors.vehicle_id = "Select a vehicle.";

    const computedTotal =
      form.total_amount !== ""
        ? Number(form.total_amount)
        : form.quantity !== "" && form.cost_per_unit !== ""
          ? Number(form.quantity) * Number(form.cost_per_unit)
          : NaN;

    if (!Number.isFinite(computedTotal) || computedTotal < 0) {
      nextFieldErrors.total_amount = "Enter a total amount or both quantity and cost per unit.";
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }

    setSaving(true);
    try {
      await transportApi.createExpense({
        vehicle_id: Number(form.vehicle_id),
        record_date: form.record_date,
        expense_category: form.expense_category,
        fuel_type: form.expense_category === "Fuel" ? form.fuel_type : null,
        quantity: form.quantity !== "" ? Number(form.quantity) : null,
        cost_per_unit: form.cost_per_unit !== "" ? Number(form.cost_per_unit) : null,
        total_amount: Number(computedTotal.toFixed(2)),
        odometer_km: form.odometer_km !== "" ? Number(form.odometer_km) : null,
        vendor_name: form.vendor_name.trim() || null,
        notes: form.notes.trim() || null,
      });
      showSuccess("Expense record saved.");
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
      await transportApi.deleteExpense(deleteTarget.id);
      showSuccess("Expense deleted.");
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setDeleteError(trnError(err));
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: "record_date", label: "Date", render: (r) => trnDate(r.record_date), cellClassName: "whitespace-nowrap" },
    {
      key: "vehicle_name",
      label: "Vehicle",
      render: (r) => (
        <div>
          <div className="font-semibold">{r.vehicle_name}</div>
          <div className="text-xs font-mono text-[#8A9AB2]">{r.vehicle_reg}</div>
        </div>
      ),
    },
    { key: "expense_category", label: "Category" },
    { key: "fuel_type", label: "Fuel / Qty", render: (r) => (r.fuel_type ? `${r.fuel_type}${r.quantity ? ` · ${r.quantity} L/kWh` : ""}` : "—") },
    { key: "odometer_km", label: "Odometer", align: "right", render: (r) => (r.odometer_km != null ? `${r.odometer_km} km` : "—") },
    { key: "vendor_name", label: "Vendor", render: (r) => r.vendor_name || "—" },
    { key: "total_amount", label: "Amount", align: "right", cellClassName: "font-semibold tabular-nums", render: (r) => trnMoney(r.total_amount) },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (r) => (
        <button type="button" onClick={() => { setDeleteError(""); setDeleteTarget(r); }} className="p-1.5 rounded-lg text-stone-500 hover:text-rose-600 cursor-pointer">
          <Trash2 size={15} />
        </button>
      ),
    },
  ];

  const summaryCols = [
    { key: "vehicle_name", label: "Vehicle", render: (s) => `${s.vehicle_name} (${s.vehicle_reg})`, cellClassName: "font-semibold" },
    { key: "records_count", label: "Entries", align: "right" },
    { key: "fuel_total", label: "Fuel Total", align: "right", render: (s) => trnMoney(s.fuel_total) },
    { key: "other_total", label: "Other Expenses", align: "right", render: (s) => trnMoney(s.other_total) },
    { key: "combined_total", label: "Combined Total", align: "right", cellClassName: "font-bold", render: (s) => trnMoney(s.combined_total) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expenses"
        actions={
          <button
            type="button"
            onClick={() => {
              setForm({ ...INITIAL_FORM, vehicle_id: vehicles[0] ? String(vehicles[0].id) : "" });
              setFormError("");
              setModalOpen(true);
            }}
            className={BUTTON_VARIANTS.primary}
          >
            <Plus size={15} /> Add Expense
          </button>
        }
      />

      {error && <AlertBanner variant="error" title="Error" message={error} onDismiss={() => setError("")} />}

      <div className={`${CARD_STYLES.base} w-fit max-w-full !p-2`}>
        <div className="flex flex-wrap items-center gap-2">
          <select value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)} className={`${INPUT_STYLES.select} !w-auto min-w-[140px] !py-1.5 text-xs`}>
            <option value="">All Vehicles</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.vehicle_name} ({v.registration_number})</option>)}
          </select>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className={`${INPUT_STYLES.select} !w-auto min-w-[135px] !py-1.5 text-xs`}>
            <option value="">All Categories</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={`${INPUT_STYLES.base} !w-auto !py-1.5 text-xs`} title="From date" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={`${INPUT_STYLES.base} !w-auto !py-1.5 text-xs`} title="To date" />
          {(vehicleFilter || catFilter || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setVehicleFilter("");
                setCatFilter("");
                setDateFrom("");
                setDateTo("");
              }}
              className={`${BUTTON_VARIANTS.secondary} !py-1.5 !px-3 text-xs`}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <VillaDataTable
        title="Vehicle-Wise Expense Summary"
        columns={summaryCols}
        rows={summary}
        loading={loading}
        emptyTitle="No vehicle expense summary yet"
        tableMinWidth="min-w-[650px]"
      />

      <VillaDataTable
        title="Fuel & Expense Ledger"
        columns={columns}
        rows={items}
        loading={loading}
        emptyIcon={Fuel}
        emptyTitle="No fuel or expense records logged"
        tableMinWidth="min-w-[820px]"
      />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Record Fuel / Operating Expense" size="md">
        <form onSubmit={handleSave} className="space-y-3">
          {formError && <AlertBanner variant="error" title="Error" message={formError} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Vehicle *</label>
              <select required value={form.vehicle_id} onChange={(e) => { setForm({ ...form, vehicle_id: e.target.value }); setFieldErrors((p) => ({ ...p, vehicle_id: "" })); }} aria-invalid={Boolean(fieldErrors.vehicle_id)} className={`${INPUT_STYLES.select} ${fieldErrors.vehicle_id ? "border-red-500 focus:border-red-500" : ""}`}>
                <option value="">Select vehicle...</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.vehicle_name} ({v.registration_number})</option>)}
              </select>
              {fieldErrors.vehicle_id && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.vehicle_id}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Date *</label>
              <input type="date" required value={form.record_date} onChange={(e) => setForm({ ...form, record_date: e.target.value })} className={INPUT_STYLES.base} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Category *</label>
              <select value={form.expense_category} onChange={(e) => setForm({ ...form, expense_category: e.target.value })} className={INPUT_STYLES.select}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {form.expense_category === "Fuel" && (
              <div>
                <label className="block text-xs font-semibold mb-1">Fuel Type</label>
                <select value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value })} className={INPUT_STYLES.select}>
                  {FUEL_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold mb-1">Quantity (L / kWh)</label>
              <input type="number" step="0.01" min={0} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className={INPUT_STYLES.base} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Cost per Unit (INR)</label>
              <input type="number" step="0.01" min={0} value={form.cost_per_unit} onChange={(e) => setForm({ ...form, cost_per_unit: e.target.value })} className={INPUT_STYLES.base} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Total Amount (INR)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.total_amount}
                placeholder={form.quantity && form.cost_per_unit ? (Number(form.quantity) * Number(form.cost_per_unit)).toFixed(2) : "Auto or enter"}
                onChange={(e) => { setForm({ ...form, total_amount: e.target.value }); setFieldErrors((p) => ({ ...p, total_amount: "" })); }}
                aria-invalid={Boolean(fieldErrors.total_amount)}
                className={`${INPUT_STYLES.base} ${fieldErrors.total_amount ? "border-red-500 focus:border-red-500" : ""}`}
              />
              {fieldErrors.total_amount && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.total_amount}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Odometer Reading (km)</label>
              <input type="number" min={0} value={form.odometer_km} onChange={(e) => setForm({ ...form, odometer_km: e.target.value })} className={INPUT_STYLES.base} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Vendor / Station Name</label>
            <input type="text" value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} className={INPUT_STYLES.base} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Notes</label>
            <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={INPUT_STYLES.base} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className={BUTTON_VARIANTS.secondary}>Cancel</button>
            <button type="submit" disabled={saving} className={BUTTON_VARIANTS.primary}>{saving ? "Saving..." : "Save Expense"}</button>
          </div>
        </form>
      </Modal>

      <DeleteConfirm
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        recordName={deleteTarget ? `${deleteTarget.expense_category} (${trnMoney(deleteTarget.total_amount)})` : ""}
        loading={deleting}
        error={deleteError}
      />
    </div>
  );
}
