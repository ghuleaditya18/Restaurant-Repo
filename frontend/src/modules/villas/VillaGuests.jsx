import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  CalendarPlus,
  Edit3,
  Eye,
  Mail,
  MapPin,
  Phone,
  Power,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
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
import { validateEmailAddress, validateMobileNumber } from "../../utils/validation";
import VillaDataTable from "./VillaDataTable";
import { villaDate, villaDateWithTime, villaError, villaMoney, villasApi } from "./villasApi";

const INITIAL_FORM = {
  full_name: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  country: "India",
  preferences: "",
  notes: "",
  is_active: true,
};

function validateGuestForm(form) {
  if (!form.full_name.trim() || form.full_name.trim().length < 2) {
    return "Guest full name must contain at least 2 characters.";
  }
  const phoneCheck = validateMobileNumber(form.phone, { required: true });
  if (!phoneCheck.valid) {
    return phoneCheck.error;
  }
  const emailCheck = validateEmailAddress(form.email, { required: false });
  if (!emailCheck.valid) {
    return emailCheck.error;
  }
  return "";
}

export default function VillaGuests() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();

  const [guests, setGuests] = useState([]);
  const [summary, setSummary] = useState({
    total_guests: 0,
    active_guests: 0,
    repeat_guests: 0,
    outstanding_balance_total: "0.00",
  });
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileData, setProfileData] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [selectedGuestIds, setSelectedGuestIds] = useState(new Set());
  const [bulkGuestConfirmOpen, setBulkGuestConfirmOpen] = useState(false);
  const [bulkGuestLoading, setBulkGuestLoading] = useState(false);
  const [bulkGuestFailures, setBulkGuestFailures] = useState([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadGuests = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const { data } = await villasApi.guests({
        search: searchQuery || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        page,
        page_size: pageSize,
      });
      setGuests(data?.items || []);
      setTotalRecords(data?.total || 0);
      setTotalPages(data?.total_pages || 1);
      if (data?.summary) {
        setSummary(data.summary);
      }
    } catch (err) {
      setPageError(villaError(err));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchQuery, statusFilter]);

  useEffect(() => {
    loadGuests();
  }, [loadGuests]);

  useEffect(() => {
    setSelectedGuestIds(new Set());
    setBulkGuestFailures([]);
  }, [searchQuery, statusFilter, page]);

  const openCreateModal = () => {
    setEditingGuest(null);
    setForm(INITIAL_FORM);
    setFormError("");
    setFormOpen(true);
  };

  const openEditModal = (guest) => {
    setEditingGuest(guest);
    setForm({
      full_name: guest.full_name || "",
      phone: guest.phone || "",
      email: guest.email || "",
      address: guest.address || "",
      city: guest.city || "",
      state: guest.state || "",
      country: guest.country || "India",
      preferences: guest.preferences || "",
      notes: guest.notes || "",
      is_active: guest.is_active ?? true,
    });
    setFormError("");
    setFormOpen(true);
  };

  const handleSaveGuest = async (e) => {
    e.preventDefault();
    const validationErr = validateGuestForm(form);
    if (validationErr) {
      setFormError(validationErr);
      return;
    }

    const phoneCheck = validateMobileNumber(form.phone, { required: true });
    const emailCheck = validateEmailAddress(form.email, { required: false });

    setSaving(true);
    setFormError("");
    const payload = {
      full_name: form.full_name.trim(),
      phone: phoneCheck.normalized,
      email: emailCheck.normalized || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      country: form.country.trim() || "India",
      preferences: form.preferences.trim() || null,
      notes: form.notes.trim() || null,
      is_active: Boolean(form.is_active),
    };

    try {
      if (editingGuest) {
        await villasApi.updateGuest(editingGuest.id, payload);
        showSuccess(`Guest profile updated for ${payload.full_name}.`);
      } else {
        await villasApi.createGuest(payload);
        showSuccess(`Guest ${payload.full_name} added to Villas directory.`);
      }
      setFormOpen(false);
      await loadGuests();
      if (profileOpen && editingGuest && profileData?.id === editingGuest.id) {
        openProfile(editingGuest.id);
      }
    } catch (err) {
      setFormError(villaError(err));
    } finally {
      setSaving(false);
    }
  };

  const openProfile = async (guestId) => {
    setProfileOpen(true);
    setProfileLoading(true);
    try {
      const { data } = await villasApi.guestDetail(guestId);
      setProfileData(data);
    } catch (err) {
      showError(villaError(err));
      setProfileOpen(false);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleToggleActive = async (guest) => {
    try {
      await villasApi.updateGuest(guest.id, { is_active: !guest.is_active });
      showSuccess(
        `${guest.full_name} marked as ${!guest.is_active ? "Active" : "Inactive"}.`
      );
      await loadGuests();
      if (profileOpen && profileData?.id === guest.id) {
        openProfile(guest.id);
      }
    } catch (err) {
      showError(villaError(err));
    }
  };

  const handleDeleteGuest = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      await villasApi.deleteGuest(deleteTarget.id);
      showSuccess(`Removed guest ${deleteTarget.full_name}.`);
      setDeleteTarget(null);
      await loadGuests();
    } catch (err) {
      setDeleteError(villaError(err));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleBulkDeleteGuests = async () => {
    setBulkGuestLoading(true);
    const failures = [];
    let deleted = 0;
    for (const id of selectedGuestIds) {
      const guest = guests.find((item) => item.id === id);
      try {
        await villasApi.deleteGuest(id);
        deleted += 1;
      } catch (err) {
        failures.push({ id, name: guest?.full_name || `#${id}`, reason: villaError(err) });
      }
    }
    setSelectedGuestIds(new Set(failures.map((item) => item.id)));
    setBulkGuestFailures(failures);
    setBulkGuestConfirmOpen(false);
    await loadGuests();
    if (deleted) showSuccess(`Deleted ${deleted} guest profile${deleted !== 1 ? "s" : ""}.`);
    if (failures.length) showError(`${failures.length} profile${failures.length !== 1 ? "s were" : " was"} protected; see details below.`);
    setBulkGuestLoading(false);
  };

  const handleSelectGuest = (id) => {
    setBulkGuestFailures([]);
    setSelectedGuestIds((previous) => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSelectAllGuests = (ids) => {
    setBulkGuestFailures([]);
    setSelectedGuestIds((previous) => {
      const next = new Set(previous);
      const allSelected = ids.length > 0 && ids.every((id) => previous.has(id));
      ids.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const guestColumns = [
    {
      key: "guest",
      label: "Guest & Reference",
      headerClassName: "!px-3",
      cellClassName: "!px-3",
      render: (guest) => (
        <button
          type="button"
          onClick={() => openProfile(guest.id)}
          className="text-left group cursor-pointer"
        >
          <div className="font-semibold text-[#172033] dark:text-[#F8FAFC] group-hover:text-amber-600 dark:group-hover:text-amber-400 transition whitespace-nowrap">
            {guest.full_name}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#64748B] dark:text-[#8A9AB2]">
            <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 whitespace-nowrap">
              {guest.guest_reference}
            </span>
            {(guest.city || guest.country) && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <MapPin size={11} />
                {[guest.city, guest.country].filter(Boolean).join(", ")}
              </span>
            )}
          </div>
        </button>
      ),
    },
    {
      key: "contact",
      label: "Contact",
      headerClassName: "!px-3",
      cellClassName: "!px-3",
      render: (guest) => (
        <div className="space-y-0.5 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-[#172033] dark:text-[#F8FAFC] whitespace-nowrap">
            <Phone size={12} className="text-stone-400 shrink-0" />
            <span>{guest.phone}</span>
          </div>
          {guest.email ? (
            <div className="flex items-center gap-1.5 text-[#64748B] dark:text-[#8A9AB2]">
              <Mail size={12} className="text-stone-400 shrink-0" />
              <span className="truncate max-w-[160px]" title={guest.email}>
                {guest.email}
              </span>
            </div>
          ) : (
            <span className="text-stone-400 italic">No email</span>
          )}
        </div>
      ),
    },
    {
      key: "total_stays",
      label: "Total Stays",
      align: "right",
      headerClassName: "!px-3",
      cellClassName: "!px-3 whitespace-nowrap tabular-nums",
      render: (guest) => (
        <div>
          <div className="font-semibold">{guest.total_stays ?? 0}</div>
          <div className="text-[11px] text-[#64748B] dark:text-[#8A9AB2]">
            {guest.active_stays > 0
              ? `${guest.active_stays} active`
              : `${guest.completed_stays || 0} completed`}
          </div>
        </div>
      ),
    },
    {
      key: "last_stay",
      label: "Last Stay",
      headerClassName: "!px-3",
      cellClassName: "!px-3 whitespace-nowrap",
      render: (guest) =>
        guest.last_stay_date ? (
          <div>
            <div className="font-medium tabular-nums">
              {villaDate(guest.last_stay_date)}
            </div>
            <div
              className="text-[11px] text-[#64748B] dark:text-[#8A9AB2] truncate max-w-[140px]"
              title={guest.last_stay_unit || guest.last_stay_number}
            >
              {guest.last_stay_unit || guest.last_stay_number}
            </div>
          </div>
        ) : (
          <span className="text-xs text-stone-400 italic">No stays yet</span>
        ),
    },
    {
      key: "total_spending",
      label: "Total Spending",
      align: "right",
      headerClassName: "!px-3",
      cellClassName: "!px-3 whitespace-nowrap font-semibold tabular-nums",
      render: (guest) => villaMoney(guest.total_spending),
    },
    {
      key: "outstanding_balance",
      label: "Balance",
      align: "right",
      headerClassName: "!px-3",
      cellClassName: "!px-3 whitespace-nowrap font-semibold tabular-nums",
      render: (guest) => {
        const balance = Number(guest.outstanding_balance || 0);
        return (
          <span
            className={
              balance > 0
                ? "text-rose-600 dark:text-rose-400"
                : "text-emerald-600 dark:text-emerald-400"
            }
          >
            {villaMoney(balance)}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      align: "center",
      headerClassName: "!px-2.5",
      cellClassName: "!px-2.5",
      render: (guest) => (
        <StatusBadge
          status={guest.is_active ? "ACTIVE" : "INACTIVE"}
          label={guest.is_active ? "Active" : "Inactive"}
          size="sm"
        />
      ),
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      headerClassName: "!px-3",
      cellClassName: "!px-3 whitespace-nowrap",
      render: (guest) => {
        return (
          <div className="inline-flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => openProfile(guest.id)}
              title="View Guest Profile"
              className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
            >
              <Eye size={15} />
            </button>
            <button
              type="button"
              onClick={() => openEditModal(guest)}
              title="Edit Guest"
              className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
            >
              <Edit3 size={15} />
            </button>
            <button
              type="button"
              onClick={() => handleToggleActive(guest)}
              title={guest.is_active ? "Archive / Deactivate Guest" : "Activate Guest"}
              className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
            >
              {guest.is_active ? <Archive size={15} /> : <Power size={15} />}
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteError("");
                setDeleteTarget(guest);
              }}
              title="Delete Guest"
              className="rounded-lg p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
            >
              <Trash2 size={15} />
            </button>
          </div>
        );
      },
    },
  ];

  const hasDeleteHistory =
    deleteTarget && (deleteTarget.total_bookings ?? deleteTarget.total_stays ?? 0) > 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Guest"
        description="Manage resort guest profiles, stay history, billing balances, and preferences for Villas & Units."
        actions={
          <button
            type="button"
            onClick={openCreateModal}
            className={BUTTON_VARIANTS.primary}
          >
            <UserPlus size={16} />
            <span>Add Guest</span>
          </button>
        }
      />

      {pageError && (
        <AlertBanner
          variant="error"
          title="Unable to load guests"
          message={pageError}
          onDismiss={() => setPageError("")}
        />
      )}

      {/* KPI SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-fit max-w-full">
        <StatCard
          compact
          title="Total Guests"
          value={summary.total_guests ?? 0}
          description="Registered Villas guest profiles"
          icon={Users}
          color="amber"
          active={statusFilter === "all"}
          onClick={() => {
            setStatusFilter("all");
            setPage(1);
          }}
        />
        <StatCard
          compact
          title="Active Profiles"
          value={summary.active_guests ?? 0}
          description="Eligible for new bookings"
          icon={UserCheck}
          color="emerald"
          active={statusFilter === "active"}
          onClick={() => {
            setStatusFilter("active");
            setPage(1);
          }}
        />
        <StatCard
          compact
          title="Repeat Guests"
          value={summary.repeat_guests ?? 0}
          description="Guests with 2+ resort stays"
          icon={Sparkles}
          color="sky"
        />
        <StatCard
          compact
          title="Outstanding Balances"
          value={villaMoney(summary.outstanding_balance_total)}
          description="Pending settlement across stays"
          icon={Wallet}
          color={Number(summary.outstanding_balance_total || 0) > 0 ? "rose" : "emerald"}
        />
      </div>

      {/* SEARCH & FILTER BAR */}
      <div className={`${CARD_STYLES.base} !p-3 w-fit max-w-full flex flex-wrap items-center gap-2.5`}>
        <div className="relative w-full sm:w-80 min-w-0">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by guest name, phone, email, reference, or city..."
            className={`${INPUT_STYLES.base} pl-9`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className={`${INPUT_STYLES.select} !w-auto min-w-[140px]`}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Archived / Inactive</option>
          </select>

          {(searchInput || statusFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setSearchQuery("");
                setStatusFilter("all");
                setPage(1);
              }}
              className={BUTTON_VARIANTS.secondary}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* GUEST DIRECTORY TABLE */}
      {selectedGuestIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20 px-4 py-2.5">
          <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">{selectedGuestIds.size} guest{selectedGuestIds.size !== 1 ? "s" : ""} selected</span>
          <div className="flex items-center gap-2">
            <button type="button" className={BUTTON_VARIANTS.secondary} onClick={() => setSelectedGuestIds(new Set())}>Clear Selection</button>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer" onClick={() => setBulkGuestConfirmOpen(true)}><Trash2 size={13} />Delete Selected</button>
          </div>
        </div>
      )}
      {bulkGuestFailures.length > 0 && (
        <div role="status" className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/20 px-4 py-3 text-xs text-rose-800 dark:text-rose-200">
          <p className="font-semibold">Some guest profiles could not be deleted:</p>
          <ul className="mt-1 space-y-1">{bulkGuestFailures.map((item) => <li key={item.id}><span className="font-medium">{item.name}:</span> {item.reason}</li>)}</ul>
        </div>
      )}
      <VillaDataTable
        columns={guestColumns}
        rows={guests}
        loading={loading}
        loadingMessage="Loading Villas guest directory..."
        emptyIcon={Users}
        emptyTitle="No guests match your filters"
        emptyDescription="Add a new guest profile or clear active search filters."
        tableMinWidth="min-w-full"
        pagination={{
          currentPage: page,
          totalPages,
          totalRecords,
          pageSize,
          onPageChange: setPage,
        }}
        selectedIds={selectedGuestIds}
        onSelectRow={handleSelectGuest}
        onSelectAll={handleSelectAllGuests}
      />

      {/* ADD / EDIT GUEST MODAL */}
      <Modal
        isOpen={formOpen}
        onClose={() => !saving && setFormOpen(false)}
        title={editingGuest ? `Edit Guest: ${editingGuest.full_name}` : "Add New Villa Guest"}
        subtitle={
          editingGuest
            ? `Reference: ${editingGuest.guest_reference}`
            : "Create an isolated Villas & Units guest profile for reservations and billing."
        }
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              disabled={saving}
              className={BUTTON_VARIANTS.secondary}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="villa-guest-form"
              disabled={saving}
              className={BUTTON_VARIANTS.primary}
            >
              {saving ? "Saving..." : editingGuest ? "Update Guest" : "Save Guest"}
            </button>
          </div>
        }
      >
        <form id="villa-guest-form" onSubmit={handleSaveGuest} className="space-y-5">
          {formError && (
            <AlertBanner
              variant="error"
              message={formError}
              onDismiss={() => setFormError("")}
            />
          )}

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">
              Basic Information
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  placeholder="e.g. Rohan Deshmukh"
                  className={INPUT_STYLES.base}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  maxLength={15}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="e.g. 9820123456"
                  className={INPUT_STYLES.base}
                />
                <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                  10-digit mobile starting with 6, 7, 8, or 9.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="guest@example.com"
                  className={INPUT_STYLES.base}
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="inline-flex items-center gap-2.5 text-sm font-medium text-stone-700 dark:text-stone-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(form.is_active)}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="h-4 w-4 rounded border-stone-300 text-amber-500 focus:ring-amber-500"
                  />
                  <span>Active guest profile (allow bookings)</span>
                </label>
              </div>
            </div>
          </div>

          <div className="border-t border-stone-200 dark:border-stone-800 pt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">
              Address &amp; Origin
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Street Address
                </label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Street, apartment, or landmark"
                  className={INPUT_STYLES.base}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  City
                </label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="e.g. Pune"
                  className={INPUT_STYLES.base}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  State
                </label>
                <input
                  type="text"
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  placeholder="e.g. Maharashtra"
                  className={INPUT_STYLES.base}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Country
                </label>
                <input
                  type="text"
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  placeholder="India"
                  className={INPUT_STYLES.base}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-stone-200 dark:border-stone-800 pt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">
              Hospitality Notes &amp; Preferences
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Guest Preferences
                </label>
                <textarea
                  rows={2}
                  value={form.preferences}
                  onChange={(e) => setForm({ ...form, preferences: e.target.value })}
                  placeholder="Room location, dietary notes, airport pickup..."
                  className={INPUT_STYLES.base}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Internal Staff Notes
                </label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="VIP handling, billing notes, anniversary details..."
                  className={INPUT_STYLES.base}
                />
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* GUEST PROFILE MODAL */}
      <Modal
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        title={profileData ? profileData.full_name : "Guest Profile"}
        subtitle={
          profileData
            ? `${profileData.guest_reference} · ${profileData.phone}`
            : "Loading guest profile..."
        }
        size="lg"
        footer={
          profileData && (
            <div className="flex flex-wrap items-center justify-between gap-2 w-full">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditModal(profileData)}
                  className={BUTTON_VARIANTS.secondary}
                >
                  <Edit3 size={15} />
                  <span>Edit Profile</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/villas/bookings?guestId=${profileData.id}`)}
                  className={BUTTON_VARIANTS.primary}
                >
                  <CalendarPlus size={15} />
                  <span>Book New Stay</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                className={BUTTON_VARIANTS.ghost}
              >
                Close
              </button>
            </div>
          )
        }
      >
        {profileLoading || !profileData ? (
          <div className="py-10 text-center text-sm text-stone-500 dark:text-stone-400">
            Loading guest profile and stay history...
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/40 p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-semibold">
                    {profileData.guest_reference}
                  </span>
                  <StatusBadge
                    status={profileData.is_active ? "ACTIVE" : "INACTIVE"}
                    label={profileData.is_active ? "Active" : "Inactive"}
                    size="sm"
                  />
                </div>
                <div className="text-xs text-stone-600 dark:text-stone-300 flex flex-wrap gap-x-4 gap-y-1 pt-1">
                  <span>Phone: {profileData.phone}</span>
                  <span>Email: {profileData.email || "—"}</span>
                  <span>
                    Location:{" "}
                    {[profileData.city, profileData.state, profileData.country]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </span>
                </div>
                {profileData.address && (
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Address: {profileData.address}
                  </p>
                )}
              </div>
            </div>

            {(profileData.preferences || profileData.notes) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    Guest Preferences
                  </p>
                  <p className="mt-1 text-xs text-stone-700 dark:text-stone-300">
                    {profileData.preferences || "None recorded"}
                  </p>
                </div>
                <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    Internal Notes
                  </p>
                  <p className="mt-1 text-xs text-stone-700 dark:text-stone-300">
                    {profileData.notes || "None recorded"}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-3">
                <p className="text-[11px] uppercase tracking-wider text-stone-500">Total Stays</p>
                <p className="mt-1 text-lg font-bold text-stone-900 dark:text-stone-100 tabular-nums">
                  {profileData.total_stays ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-3">
                <p className="text-[11px] uppercase tracking-wider text-stone-500">Total Billed</p>
                <p className="mt-1 text-lg font-bold text-stone-900 dark:text-stone-100 tabular-nums">
                  {villaMoney(profileData.total_billed)}
                </p>
              </div>
              <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-3">
                <p className="text-[11px] uppercase tracking-wider text-stone-500">Net Paid</p>
                <p className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {villaMoney(profileData.total_spending)}
                </p>
              </div>
              <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-3">
                <p className="text-[11px] uppercase tracking-wider text-stone-500">Outstanding</p>
                <p
                  className={`mt-1 text-lg font-bold tabular-nums ${
                    Number(profileData.outstanding_balance || 0) > 0
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-stone-900 dark:text-stone-100"
                  }`}
                >
                  {villaMoney(profileData.outstanding_balance)}
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
                Stay History ({profileData.stays?.length || 0})
              </h4>
              <VillaDataTable
                tableMinWidth="min-w-[600px]"
                rows={profileData.stays || []}
                emptyTitle="No stays recorded yet"
                columns={[
                  {
                    key: "booking_number",
                    label: "Stay #",
                    cellClassName: "font-mono font-semibold whitespace-nowrap",
                  },
                  {
                    key: "unit",
                    label: "Villa & Unit",
                    render: (stay) => (
                      <div>
                        <div className="font-medium">{stay.unit_name}</div>
                        <div className="text-[11px] text-stone-500">{stay.villa_name}</div>
                      </div>
                    ),
                  },
                  {
                    key: "dates",
                    label: "Dates & Timings",
                    cellClassName: "whitespace-nowrap tabular-nums text-xs",
                    render: (stay) => (
                      <div className="space-y-0.5">
                        <div>Check-in: {villaDateWithTime(stay.check_in, stay.check_in_time)}</div>
                        <div className="text-stone-500">
                          Check-out: {villaDateWithTime(stay.check_out, stay.check_out_time)}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "status",
                    label: "Status",
                    align: "center",
                    render: (stay) => <StatusBadge status={stay.status} label={stay.status} size="sm" />,
                  },
                  {
                    key: "invoice",
                    label: "Invoice",
                    align: "right",
                    cellClassName: "whitespace-nowrap font-semibold tabular-nums",
                    render: (stay) => villaMoney(stay.invoice_total),
                  },
                  {
                    key: "balance",
                    label: "Balance",
                    align: "right",
                    cellClassName: "whitespace-nowrap font-semibold tabular-nums text-rose-600 dark:text-rose-400",
                    render: (stay) => villaMoney(stay.invoice_balance_due),
                  },
                ]}
              />
            </div>

            {profileData.services?.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
                  Guest Services History ({profileData.services.length})
                </h4>
                <VillaDataTable
                  tableMinWidth="min-w-[540px]"
                  rows={profileData.services}
                  columns={[
                    { key: "service_name", label: "Service", cellClassName: "font-medium" },
                    { key: "booking_number", label: "Stay #", cellClassName: "font-mono text-stone-500 whitespace-nowrap" },
                    { key: "quantity", label: "Qty", align: "right", cellClassName: "tabular-nums" },
                    {
                      key: "status",
                      label: "Status",
                      align: "center",
                      render: (svc) => <StatusBadge status={svc.status} label={svc.status} size="sm" />,
                    },
                    {
                      key: "amount",
                      label: "Amount",
                      align: "right",
                      cellClassName: "font-semibold tabular-nums whitespace-nowrap",
                      render: (svc) => villaMoney(svc.line_total),
                    },
                  ]}
                />
              </div>
            )}
          </div>
        )}
      </Modal>

      <DeleteConfirm
        isOpen={Boolean(deleteTarget)}
        onClose={() => !deleteLoading && setDeleteTarget(null)}
        onConfirm={handleDeleteGuest}
        title="Delete Guest Profile"
        recordName={deleteTarget ? `${deleteTarget.full_name} (${deleteTarget.guest_reference})` : ""}
        message={
          hasDeleteHistory
            ? "This will permanently delete this guest along with all linked stays, invoices, payments, service requests, and status history. This action cannot be undone."
            : "Are you sure you want to permanently remove this guest profile? This action cannot be undone."
        }
        impactSummary={
          hasDeleteHistory
            ? `${deleteTarget.total_bookings ?? deleteTarget.total_stays} linked stay record(s) and their billing data will also be deleted`
            : "0 linked stays or invoices"
        }
        confirmButtonText="Delete Guest"
        loading={deleteLoading}
        error={deleteError}
      />
      <Modal
        isOpen={bulkGuestConfirmOpen}
        onClose={() => !bulkGuestLoading && setBulkGuestConfirmOpen(false)}
        title={`Delete ${selectedGuestIds.size} Selected Guest${selectedGuestIds.size !== 1 ? "s" : ""}`}
        size="sm"
        footer={<div className="flex justify-end gap-2"><button type="button" className={BUTTON_VARIANTS.secondary} disabled={bulkGuestLoading} onClick={() => setBulkGuestConfirmOpen(false)}>Cancel</button><button type="button" className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 cursor-pointer" disabled={bulkGuestLoading} onClick={handleBulkDeleteGuests}>{bulkGuestLoading ? "Deleting..." : "Confirm Delete"}</button></div>}
      >
        <p className="mb-3 text-sm text-[#64748B] dark:text-[#8A9AB2]">Selected guest profiles and all their linked stay, invoice, and payment records will be permanently removed.</p>
        <ul className="max-h-48 overflow-y-auto divide-y divide-[#E5E9F0] rounded-xl border border-[#E5E9F0]">{Array.from(selectedGuestIds).map((id) => <li key={id} className="px-3 py-2 text-sm">{guests.find((guest) => guest.id === id)?.full_name || `#${id}`}</li>)}</ul>
      </Modal>
    </div>
  );
}
