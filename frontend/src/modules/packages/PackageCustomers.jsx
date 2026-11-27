import { useCallback, useEffect, useState } from "react";
import { Edit3, Eye, Mail, Phone, Search, Trash2, UserPlus, Users } from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import BulkSelectionBar from "../../components/BulkSelectionBar";
import DeleteConfirm from "../../components/DeleteConfirm";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import StatCard from "../../components/StatCard";
import StatusBadge from "../../components/StatusBadge";
import { useNotification } from "../../context/NotificationContext";
import useBulkSelection from "../../hooks/useBulkSelection";
import { BUTTON_VARIANTS, CARD_STYLES, INPUT_STYLES } from "../../utils/themeTokens";
import {
  sanitizeMobileInput,
  validateEmailAddress,
  validateMobileNumber,
} from "../../utils/validation";
import VillaDataTable from "../villas/VillaDataTable";
import { packagesApi, pkgDate, pkgError, pkgMoney } from "./packagesApi";

const INITIAL_FORM = {
  full_name: "",
  phone: "",
  email: "",
  address: "",
};

export default function PackageCustomers() {
  const { showSuccess, showError } = useNotification();
  const { selectedIds, toggle, toggleMany, clear } = useBulkSelection();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 10;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingOne, setDeletingOne] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkFailures, setBulkFailures] = useState([]);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const res = await packagesApi.customers({
        search: searchQuery.trim() || undefined,
        page,
        page_size: pageSize,
      });
      setCustomers(res.data?.items || []);
      setTotalRecords(res.data?.total ?? 0);
      setTotalPages(res.data?.total_pages ?? 1);
    } catch (err) {
      setPageError(pkgError(err));
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

  useEffect(() => {
    clear();
    setBulkFailures([]);
  }, [searchQuery, page, clear]);

  const handleDeleteCustomer = async () => {
    if (!deleteTarget) return;
    setDeletingOne(true);
    setDeleteError("");
    try {
      await packagesApi.deleteCustomer(deleteTarget.id);
      showSuccess(`Customer "${deleteTarget.full_name}" deleted.`);
      setDeleteTarget(null);
      await loadCustomers();
    } catch (err) {
      setDeleteError(pkgError(err));
    } finally {
      setDeletingOne(false);
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    setBulkFailures([]);
    const deleted = [];
    const failed = [];
    for (const id of selectedIds) {
      const target = customers.find((c) => c.id === id);
      try {
        await packagesApi.deleteCustomer(id);
        deleted.push(id);
      } catch (err) {
        failed.push({ id, name: target?.full_name || `#${id}`, reason: pkgError(err) });
      }
    }
    await loadCustomers();
    clear();
    failed.forEach((f) => toggle(f.id));
    setBulkFailures(failed);
    setBulkDeleting(false);
    setBulkConfirmOpen(false);
    if (deleted.length > 0 && failed.length === 0) {
      showSuccess(`Deleted ${deleted.length} customer${deleted.length === 1 ? "" : "s"}.`);
    } else if (deleted.length > 0 && failed.length > 0) {
      showSuccess(`Deleted ${deleted.length} customer(s). ${failed.length} could not be deleted.`);
    } else if (failed.length > 0) {
      showError("Selected customers could not be deleted because bookings or invoices exist.");
    }
  };

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
      const res = await packagesApi.customerDetail(id);
      setDetail(res.data);
    } catch (err) {
      showError(pkgError(err));
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
    const emailCheck = validateEmailAddress(form.email, { required: true });
    if (!emailCheck.valid) {
      setFormError(emailCheck.error);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        phone: phoneCheck.normalized,
        email: emailCheck.normalized,
        address: form.address.trim() || null,
      };
      if (editing) {
        await packagesApi.updateCustomer(editing.id, payload);
        showSuccess(`Customer "${payload.full_name}" updated.`);
      } else {
        await packagesApi.createCustomer(payload);
        showSuccess(`Customer "${payload.full_name}" registered.`);
      }
      setFormOpen(false);
      await loadCustomers();
    } catch (err) {
      setFormError(pkgError(err));
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
      label: "Package Bookings",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums font-semibold",
      render: (c) => c.package_bookings_count ?? 0,
    },
    {
      key: "spend",
      label: "Package Spend",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums font-semibold",
      render: (c) => pkgMoney(c.package_total_spend),
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
            title="View Booking History"
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
          <button
            type="button"
            disabled={(c.package_bookings_count ?? 0) > 0}
            onClick={() => {
              if ((c.package_bookings_count ?? 0) > 0) return;
              setDeleteError("");
              setDeleteTarget(c);
            }}
            title={
              (c.package_bookings_count ?? 0) > 0
                ? "Customers with package bookings cannot be deleted"
                : "Delete Customer"
            }
            className="rounded-lg p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer transition"
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
        title="Customers"
        actions={
          <button type="button" onClick={openCreate} className={BUTTON_VARIANTS.primary}>
            <UserPlus size={16} />
            <span>Register Customer</span>
          </button>
        }
      />

      {pageError && <AlertBanner variant="error" message={pageError} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3 w-full">
        <StatCard compact title="Total Customers" value={loading ? "—" : totalRecords} icon={Users} color="amber" />
        <StatCard
          compact
          title="Repeat Package Guests"
          value={loading ? "—" : customers.filter((c) => (c.package_bookings_count || 0) >= 2).length}
          icon={Users}
          color="emerald"
        />
        <StatCard
          compact
          title="With Package Bookings"
          value={loading ? "—" : customers.filter((c) => (c.package_bookings_count || 0) > 0).length}
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
              placeholder="Search customers by name, phone, email..."
              className={`${INPUT_STYLES.base} w-full pl-9 !py-1.5 text-xs`}
            />
          </div>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
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
          title="Some customers could not be deleted"
          message={bulkFailures.map((f) => `${f.name}: ${f.reason}`).join(" · ")}
          onDismiss={() => setBulkFailures([])}
        />
      )}

      <VillaDataTable
        columns={columns}
        rows={customers}
        loading={loading}
        loadingMessage="Loading customers..."
        emptyTitle="No customers found"
        emptyDescription="Register a customer to link them to package bookings."
        tableMinWidth="min-w-[780px]"
        onRowClick={(c) => openDetail(c.id)}
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

      {/* CREATE / EDIT CUSTOMER MODAL */}
      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit Customer: ${editing.full_name}` : "Register Customer"}
        size="sm"
      >
        <form onSubmit={handleSave} className="space-y-3">
          {formError && <AlertBanner variant="error" message={formError} />}
          <div>
            <label className="block text-xs font-bold uppercase mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              className={INPUT_STYLES.base}
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase mb-1">Mobile Number *</label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              required
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: sanitizeMobileInput(e.target.value) }))}
              placeholder="10-digit mobile (6-9...)"
              className={INPUT_STYLES.base}
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase mb-1">Email Address *</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className={INPUT_STYLES.base}
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase mb-1">Address</label>
            <textarea
              rows={2}
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className={INPUT_STYLES.base}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setFormOpen(false)} className={BUTTON_VARIANTS.secondary}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={BUTTON_VARIANTS.primary}>
              {saving ? "Saving..." : editing ? "Save Changes" : "Register Customer"}
            </button>
          </div>
        </form>
      </Modal>

      {/* CUSTOMER HISTORY MODAL */}
      <Modal
        isOpen={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.full_name} · Package History` : "Customer Details"}
        size="md"
      >
        {detail && (
          <div className="space-y-3 text-xs">
            <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] p-3 border border-[#E5E9F0] dark:border-[#1E293B]">
              <p className="font-bold text-sm">{detail.full_name}</p>
              <p className="text-stone-500 mt-0.5">
                {detail.phone} {detail.email ? `· ${detail.email}` : ""}
              </p>
              {detail.address && <p className="text-stone-500 mt-0.5">{detail.address}</p>}
            </div>

            {detail.bookings?.length === 0 ? (
              <p className="text-center py-6 text-stone-500">No package bookings for this customer yet.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {detail.bookings.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between rounded-xl bg-white dark:bg-[#101722] p-3 border border-[#E5E9F0] dark:border-[#1E293B]"
                  >
                    <div>
                      <p className="font-mono font-bold">
                        {b.booking_number} · <span className="font-sans">{b.package_name}</span>
                      </p>
                      <p className="text-stone-500 mt-0.5">
                        Start {pkgDate(b.start_date)} · {b.guest_count} guests · {pkgMoney(b.total_amount)}
                      </p>
                    </div>
                    <StatusBadge status={b.status} label={b.status} size="sm" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <DeleteConfirm
        isOpen={Boolean(deleteTarget)}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteError("");
        }}
        onConfirm={handleDeleteCustomer}
        title="Delete Customer"
        recordName={deleteTarget ? `${deleteTarget.full_name} (${deleteTarget.phone})` : ""}
        message="Only customers with zero bookings, orders, or invoices can be deleted."
        loading={deletingOne}
        errorMessage={deleteError}
      />

      <DeleteConfirm
        isOpen={bulkConfirmOpen}
        onClose={() => setBulkConfirmOpen(false)}
        onConfirm={handleBulkDelete}
        title={`Delete ${selectedIds.size} Selected Customer${selectedIds.size === 1 ? "" : "s"}`}
        recordName={`${selectedIds.size} selected customer(s)`}
        message="Customers without bookings or billing records will be removed. Customers with linked records will remain untouched."
        loading={bulkDeleting}
      />
    </div>
  );
}
