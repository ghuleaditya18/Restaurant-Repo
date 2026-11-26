import { useCallback, useEffect, useState } from "react";
import { Edit3, Eye, Mail, Phone, Search, UserPlus, Users } from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import StatCard from "../../components/StatCard";
import StatusBadge from "../../components/StatusBadge";
import { useNotification } from "../../context/NotificationContext";
import { BUTTON_VARIANTS, CARD_STYLES, INPUT_STYLES } from "../../utils/themeTokens";
import { validateEmailAddress, validateMobileNumber } from "../../utils/validation";
import VillaDataTable from "../villas/VillaDataTable";
import {
  actDate,
  actError,
  activitiesApi,
  actMoney,
  bookingTypeLabel,
} from "./activitiesApi";

const INITIAL_FORM = {
  full_name: "",
  phone: "",
  email: "",
  address: "",
};

export default function ActivityCustomers() {
  const { showSuccess, showError } = useNotification();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 15;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState(null);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const res = await activitiesApi.customers({
        search: searchQuery.trim() || undefined,
        page,
        page_size: pageSize,
      });
      setCustomers(res.data?.items || []);
      setTotalRecords(res.data?.total ?? 0);
      setTotalPages(res.data?.total_pages ?? 1);
    } catch (err) {
      setPageError(actError(err));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, page]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const openCreate = () => {
    setEditing(null);
    setForm(INITIAL_FORM);
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({
      full_name: c.full_name || "",
      phone: c.phone || "",
      email: c.email || "",
      address: c.address || "",
    });
    setFormError("");
    setFormOpen(true);
  };

  const openDetail = async (id) => {
    try {
      const res = await activitiesApi.customerDetail(id);
      setDetail(res.data);
    } catch (err) {
      showError(actError(err));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError("");
    if (form.full_name.trim().length < 2) {
      setFormError("Customer name must contain at least 2 characters.");
      return;
    }
    const phoneCheck = validateMobileNumber(form.phone, { required: true });
    if (!phoneCheck.valid) {
      setFormError(phoneCheck.error);
      return;
    }
    if (form.email.trim()) {
      const emailCheck = validateEmailAddress(form.email, { required: false });
      if (!emailCheck.valid) {
        setFormError(emailCheck.error);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        phone: phoneCheck.normalized,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
      };
      if (editing) {
        await activitiesApi.updateCustomer(editing.id, payload);
        showSuccess(`Customer "${payload.full_name}" updated.`);
      } else {
        await activitiesApi.createCustomer(payload);
        showSuccess(`Customer "${payload.full_name}" registered.`);
      }
      setFormOpen(false);
      await loadCustomers();
    } catch (err) {
      setFormError(actError(err));
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: "full_name",
      label: "Customer",
      render: (c) => (
        <div>
          <div className="font-semibold text-[#172033] dark:text-[#F8FAFC]">{c.full_name}</div>
          {c.address && (
            <div className="text-xs text-[#64748B] dark:text-[#8A9AB2] truncate max-w-[220px]">
              {c.address}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "contact",
      label: "Contact",
      render: (c) => (
        <div className="text-xs space-y-0.5">
          <div className="flex items-center gap-1.5 font-medium">
            <Phone size={12} className="text-stone-400" />
            <span>{c.phone}</span>
          </div>
          {c.email && (
            <div className="flex items-center gap-1.5 text-stone-500">
              <Mail size={12} className="text-stone-400" />
              <span>{c.email}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: "bookings",
      label: "Activity Bookings",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums font-semibold",
      render: (c) => c.activity_bookings_count ?? 0,
    },
    {
      key: "spend",
      label: "Activity Spend",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums font-semibold",
      render: (c) => actMoney(c.activity_total_spend),
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      cellClassName: "whitespace-nowrap",
      render: (c) => (
        <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => openDetail(c.id)}
            title="View Activity History"
            className="rounded-lg p-1.5 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/30 cursor-pointer"
          >
            <Eye size={15} />
          </button>
          <button
            type="button"
            onClick={() => openEdit(c)}
            title="Edit Customer"
            className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <Edit3 size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customers"
        description="Shared NewaraAI guest & customer directory with activity participation history and spend tracking."
        actions={
          <button type="button" onClick={openCreate} className={BUTTON_VARIANTS.primary}>
            <UserPlus size={16} />
            <span>Register Customer</span>
          </button>
        }
      />

      {pageError && <AlertBanner variant="error" message={pageError} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl">
        <StatCard compact title="Total Customers" value={loading ? "—" : totalRecords} icon={Users} color="amber" />
        <StatCard
          compact
          title="Repeat Activity Guests"
          value={loading ? "—" : customers.filter((c) => (c.activity_bookings_count || 0) >= 2).length}
          icon={Users}
          color="emerald"
        />
        <StatCard
          compact
          title="With Activity Bookings"
          value={loading ? "—" : customers.filter((c) => (c.activity_bookings_count || 0) > 0).length}
          icon={Users}
          color="sky"
        />
      </div>

      <div className={`${CARD_STYLES.base} !p-2.5`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, phone, or email..."
              className={`${INPUT_STYLES.base} w-full pl-9 !py-1.5 text-xs`}
            />
          </div>
        </div>
      </div>

      <VillaDataTable
        title="Customer Directory"
        columns={columns}
        rows={customers}
        loading={loading}
        emptyTitle="No customers found"
        tableMinWidth="min-w-[740px]"
        onRowClick={(c) => openDetail(c.id)}
        pagination={{
          currentPage: page,
          totalPages,
          totalRecords,
          pageSize,
          onPageChange: setPage,
        }}
      />

      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit Customer — ${editing.full_name}` : "Register Customer"}
        size="sm"
      >
        <form onSubmit={handleSave} className="space-y-3">
          {formError && <AlertBanner variant="error" message={formError} />}
          <div>
            <label className="mb-1 block text-xs font-bold">Full Name *</label>
            <input
              type="text"
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className={INPUT_STYLES.base}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold">Phone *</label>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={INPUT_STYLES.base}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={INPUT_STYLES.base}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold">Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className={INPUT_STYLES.base}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setFormOpen(false)} className={BUTTON_VARIANTS.secondary}>Cancel</button>
            <button type="submit" disabled={saving} className={BUTTON_VARIANTS.primary}>
              {saving ? "Saving..." : editing ? "Update" : "Register"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.full_name} — Activity History` : "Customer Details"}
        size="md"
      >
        {detail && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl bg-stone-50 dark:bg-[#151D29] p-2.5">
                <span className="text-[10px] uppercase text-stone-500 font-bold">Phone</span>
                <p className="mt-0.5 font-semibold">{detail.phone}</p>
              </div>
              <div className="rounded-xl bg-stone-50 dark:bg-[#151D29] p-2.5">
                <span className="text-[10px] uppercase text-stone-500 font-bold">Email</span>
                <p className="mt-0.5 font-semibold">{detail.email || "—"}</p>
              </div>
            </div>

            <div className="divide-y divide-[#E5E9F0] dark:divide-[#1E293B] rounded-xl border border-[#E5E9F0] dark:border-[#1E293B]">
              {(detail.bookings || []).length === 0 ? (
                <p className="p-4 text-center text-stone-500">No activity bookings for this customer yet.</p>
              ) : (
                detail.bookings.map((b) => (
                  <div key={b.id} className="flex items-center justify-between p-3">
                    <div>
                      <p className="font-mono font-bold">{b.booking_number}</p>
                      <p className="text-stone-500">
                        {b.activity_name} · {bookingTypeLabel(b.booking_type)} · {actDate(b.booking_date)}
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="font-bold">{actMoney(b.total_amount)}</p>
                      <StatusBadge status={b.status} size="sm" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
