import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Edit3,
  Eye,
  FileText,
  History,
  LogIn,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Wrench,
  XCircle,
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
import {
  addDaysIso,
  kolkataTodayIso,
  villaDateRange,
  villaDateTime,
  villaDateWithTime,
  villaError,
  villaMoney,
  villasApi,
} from "./villasApi";

function toIsoDate(offsetDays = 0) {
  return kolkataTodayIso(offsetDays);
}

function diffNights(start, end) {
  if (!start || !end) return 0;
  const ms = new Date(end) - new Date(start);
  return Math.max(0, Math.round(ms / 86400000));
}

const BOOKING_STATUSES = [
  "Reserved",
  "Confirmed",
  "Checked In",
  "Checked Out",
  "Cancelled",
  "No Show",
];

const PAGE_SIZE = 10;

const INITIAL_GUEST_FORM = {
  full_name: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  country: "India",
  preferences: "",
  notes: "",
};

export default function VillaBookings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showSuccess, showError } = useNotification();

  const preselectedUnitId = searchParams.get("unitId") || "";
  const preselectedGuestId = searchParams.get("guestId") || "";
  const initialSearch = searchParams.get("search") || "";

  const [bookings, setBookings] = useState([]);
  const [villas, setVillas] = useState([]);
  const [units, setUnits] = useState([]);
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  // Filters & Pagination for All Stays
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState("");
  const [villaFilter, setVillaFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  // Multi-step Reservation Wizard State
  const [wizardOpen, setWizardOpen] = useState(
    Boolean(preselectedUnitId || preselectedGuestId || searchParams.get("new"))
  );
  const [step, setStep] = useState(1);
  const [stayForm, setStayForm] = useState({
    check_in: toIsoDate(1),
    check_out: toIsoDate(3),
    guests: 2,
    notes: "",
  });
  const [availabilityList, setAvailabilityList] = useState([]);
  const [checkingAvail, setCheckingAvail] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [guestSearch, setGuestSearch] = useState("");
  const [selectedGuestId, setSelectedGuestId] = useState(preselectedGuestId);
  const [wizardError, setWizardError] = useState("");
  const [wizardFieldErrors, setWizardFieldErrors] = useState({});
  const [submittingBooking, setSubmittingBooking] = useState(false);

  // Inline Add Guest Modal (preserves wizard state)
  const [inlineGuestOpen, setInlineGuestOpen] = useState(false);
  const [inlineGuestForm, setInlineGuestForm] = useState(INITIAL_GUEST_FORM);
  const [inlineGuestError, setInlineGuestError] = useState("");
  const [inlineGuestFieldErrors, setInlineGuestFieldErrors] = useState({});
  const [savingGuest, setSavingGuest] = useState(false);

  // Edit Stay Modal (for Reserved / Confirmed bookings)
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editError, setEditError] = useState("");
  const [editFieldErrors, setEditFieldErrors] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  // Lifecycle Action Modal (Check-In / Check-Out / Cancel / No Show)
  const [actionModal, setActionModal] = useState(null);
  const [actionReason, setActionReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [checkoutSummary, setCheckoutSummary] = useState(null);
  const [checkoutSummaryLoading, setCheckoutSummaryLoading] = useState(false);

  // Stay Details Modal
  const [detailBooking, setDetailBooking] = useState(null);

  // Status History Modal
  const [historyTarget, setHistoryTarget] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Delete / Clear Stay State
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [selectedBookingIds, setSelectedBookingIds] = useState(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkFailures, setBulkFailures] = useState([]);

  const todayKolkata = kolkataTodayIso(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const [bRes, vRes, uRes, gRes] = await Promise.all([
        villasApi.bookings(),
        villasApi.villas(),
        villasApi.units(),
        villasApi.guests({ status: "active", page: 1, page_size: 100 }),
      ]);
      setBookings(bRes.data || []);
      setVillas(vRes.data || []);
      setUnits(uRes.data || []);
      setGuests(gRes.data?.items || []);
    } catch (err) {
      setPageError(villaError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, villaFilter, unitFilter, dateFrom, dateTo]);

  const checkAvailability = async (advanceToStep2 = true) => {
    setWizardError("");
    const errors = {};
    const today = toIsoDate(0);
    if (!stayForm.check_in) errors.check_in = "Select a check-in date.";
    else if (stayForm.check_in < today) errors.check_in = "Check-in date cannot be in the past.";
    if (!stayForm.check_out) errors.check_out = "Select a check-out date.";
    else if (stayForm.check_out <= stayForm.check_in) errors.check_out = "Check-out must be after check-in.";
    if (Number(stayForm.guests) < 1) errors.guests = "At least one guest is required.";
    setWizardFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setCheckingAvail(true);
    try {
      const { data } = await villasApi.availability({
        start_date: stayForm.check_in,
        end_date: stayForm.check_out,
        guests: Number(stayForm.guests),
      });
      const list = data || [];
      setAvailabilityList(list);
      if (selectedUnit) {
        const refreshed = list.find((u) => u.id === selectedUnit.id && u.available);
        setSelectedUnit(refreshed || null);
      } else if (preselectedUnitId) {
        const pre = list.find((u) => String(u.id) === preselectedUnitId && u.available);
        if (pre) setSelectedUnit(pre);
      }
      if (advanceToStep2) {
        setStep(2);
      }
    } catch (err) {
      setWizardError(villaError(err));
    } finally {
      setCheckingAvail(false);
    }
  };

  const handleSaveInlineGuest = async (e) => {
    e.preventDefault();
    setInlineGuestError("");
    const errors = {};
    if (!inlineGuestForm.full_name.trim() || inlineGuestForm.full_name.trim().length < 2) {
      errors.full_name = "Guest name must contain at least 2 characters.";
    }
    const phoneCheck = validateMobileNumber(inlineGuestForm.phone, { required: true });
    if (!phoneCheck.valid) {
      errors.phone = phoneCheck.error;
    }
    const emailCheck = validateEmailAddress(inlineGuestForm.email, { required: false });
    if (!emailCheck.valid) {
      errors.email = emailCheck.error;
    }
    setInlineGuestFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSavingGuest(true);
    try {
      const { data } = await villasApi.createGuest({
        full_name: inlineGuestForm.full_name.trim(),
        phone: phoneCheck.normalized,
        email: emailCheck.normalized || null,
        address: inlineGuestForm.address.trim() || null,
        city: inlineGuestForm.city.trim() || null,
        state: inlineGuestForm.state.trim() || null,
        country: inlineGuestForm.country.trim() || "India",
        preferences: inlineGuestForm.preferences.trim() || null,
        notes: inlineGuestForm.notes.trim() || null,
        is_active: true,
      });
      setGuests((prev) => [data, ...prev]);
      setSelectedGuestId(String(data.id));
      setInlineGuestOpen(false);
      setInlineGuestForm(INITIAL_GUEST_FORM);
      showSuccess(`Guest "${data.full_name}" registered and selected.`);
    } catch (err) {
      setInlineGuestError(villaError(err));
    } finally {
      setSavingGuest(false);
    }
  };

  const handleCreateBooking = async () => {
    setWizardError("");
    if (!selectedUnit) {
      setWizardFieldErrors((previous) => ({ ...previous, unit: "Select an available accommodation unit." }));
      setStep(2);
      return;
    }
    if (!selectedGuestId) {
      setWizardFieldErrors((previous) => ({ ...previous, guest: "Select or register a guest." }));
      setStep(3);
      return;
    }

    setSubmittingBooking(true);
    try {
      const { data } = await villasApi.createBooking({
        unit_id: selectedUnit.id,
        guest_id: Number(selectedGuestId),
        check_in: stayForm.check_in,
        check_out: stayForm.check_out,
        guests: Number(stayForm.guests),
        notes: stayForm.notes.trim() || null,
      });
      showSuccess(`Reservation ${data.booking_number} created for ${data.guest_name}.`);
      setStep(1);
      setSelectedUnit(null);
      setSelectedGuestId("");
      setStayForm({
        check_in: toIsoDate(1),
        check_out: toIsoDate(3),
        guests: 2,
        notes: "",
      });
      setAvailabilityList([]);
      setWizardOpen(false);
      await loadData();
    } catch (err) {
      setWizardError(villaError(err));
    } finally {
      setSubmittingBooking(false);
    }
  };

  const openEditBooking = (booking) => {
    setEditTarget(booking);
    setEditError("");
    setEditForm({
      unit_id: String(booking.unit_id),
      guest_id: String(booking.guest_id || booking.customer_id || ""),
      check_in: booking.check_in,
      check_out: booking.check_out,
      guests: booking.guests,
      notes: booking.notes || "",
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditError("");
    const errors = {};
    if (editForm.check_in < todayKolkata) {
      errors.check_in = "Check-in date cannot be in the past.";
    }
    if (editForm.check_out <= editForm.check_in) {
      errors.check_out = "Check-out must be after check-in.";
    }
    setEditFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setSavingEdit(true);
    try {
      await villasApi.updateBooking(editTarget.id, {
        unit_id: Number(editForm.unit_id),
        guest_id: Number(editForm.guest_id),
        check_in: editForm.check_in,
        check_out: editForm.check_out,
        guests: Number(editForm.guests),
        notes: editForm.notes?.trim() || null,
      });
      showSuccess(`Updated stay ${editTarget.booking_number}.`);
      setEditTarget(null);
      await loadData();
    } catch (err) {
      setEditError(villaError(err));
    } finally {
      setSavingEdit(false);
    }
  };

  const openActionModal = async (booking, targetStatus) => {
    setActionError("");
    setActionReason("");
    setCheckoutSummary(null);
    setActionModal({ booking, targetStatus });
    if (targetStatus === "Checked Out") {
      setCheckoutSummaryLoading(true);
      try {
        const { data } = await villasApi.checkoutSummary(booking.id);
        setCheckoutSummary(data);
      } catch (err) {
        setActionError(villaError(err));
      } finally {
        setCheckoutSummaryLoading(false);
      }
    }
  };

  const handleConfirmStatusChange = async (booking, targetStatus, reason = null) => {
    setActionError("");
    setActionSubmitting(true);
    try {
      await villasApi.bookingStatus(booking.id, targetStatus, reason);
      showSuccess(`Stay ${booking.booking_number} updated to "${targetStatus}".`);
      setActionModal(null);
      setCheckoutSummary(null);
      setActionReason("");
      await loadData();
    } catch (err) {
      const msg = villaError(err);
      if (actionModal) {
        setActionError(msg);
      } else {
        showError(msg);
      }
    } finally {
      setActionSubmitting(false);
    }
  };

  const openHistoryModal = async (booking) => {
    setHistoryTarget(booking);
    setHistoryLoading(true);
    setHistoryRows([]);
    try {
      const { data } = await villasApi.bookingHistory(booking.id);
      setHistoryRows(data || []);
    } catch (err) {
      showError(villaError(err));
      setHistoryTarget(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  const filteredGuests = useMemo(() => {
    const q = guestSearch.trim().toLowerCase();
    if (!q) return guests;
    return guests.filter(
      (g) =>
        g.full_name.toLowerCase().includes(q) ||
        g.phone.toLowerCase().includes(q) ||
        (g.guest_reference || "").toLowerCase().includes(q) ||
        (g.email || "").toLowerCase().includes(q)
    );
  }, [guests, guestSearch]);

  const selectedGuest = useMemo(
    () => guests.find((g) => String(g.id) === String(selectedGuestId)) || null,
    [guests, selectedGuestId]
  );

  const filteredBookings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return bookings.filter((b) => {
      if (statusFilter && b.status !== statusFilter) return false;
      if (villaFilter && String(b.villa_id) !== villaFilter) return false;
      if (unitFilter && String(b.unit_id) !== unitFilter) return false;
      if (dateFrom && b.check_out < dateFrom) return false;
      if (dateTo && b.check_in > dateTo) return false;
      if (!q) return true;
      return (
        b.booking_number.toLowerCase().includes(q) ||
        (b.guest_name || "").toLowerCase().includes(q) ||
        (b.guest_phone || "").toLowerCase().includes(q) ||
        (b.guest_reference || "").toLowerCase().includes(q) ||
        (b.unit_name || "").toLowerCase().includes(q) ||
        (b.villa_name || "").toLowerCase().includes(q)
      );
    });
  }, [bookings, searchQuery, statusFilter, villaFilter, unitFilter, dateFrom, dateTo]);

  const totalRecords = filteredBookings.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pagedBookings = filteredBookings.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const stats = useMemo(() => {
    return {
      reserved: bookings.filter((b) => b.status === "Reserved").length,
      confirmed: bookings.filter((b) => b.status === "Confirmed").length,
      checkedIn: bookings.filter((b) => b.status === "Checked In").length,
      checkedOut: bookings.filter((b) => b.status === "Checked Out").length,
    };
  }, [bookings]);

  useEffect(() => {
    setSelectedBookingIds(new Set());
    setBulkFailures([]);
  }, [searchQuery, statusFilter, villaFilter, unitFilter, dateFrom, dateTo, safePage]);

  const handleDeleteBooking = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      await villasApi.deleteBooking(deleteTarget.id);
      showSuccess(`Deleted stay ${deleteTarget.booking_number}.`);
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setDeleteError(villaError(err));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleBulkDeleteBookings = async () => {
    setBulkDeleting(true);
    const failures = [];
    let deleted = 0;
    for (const id of selectedBookingIds) {
      const booking = bookings.find((b) => b.id === id);
      try {
        await villasApi.deleteBooking(id);
        deleted += 1;
      } catch (err) {
        failures.push({
          id,
          name: booking?.booking_number || `#${id}`,
          reason: villaError(err),
        });
      }
    }
    setSelectedBookingIds(new Set(failures.map((f) => f.id)));
    setBulkFailures(failures);
    setBulkDeleteOpen(false);
    await loadData();
    if (deleted) {
      showSuccess(`Deleted ${deleted} stay${deleted !== 1 ? "s" : ""}.`);
    }
    if (failures.length) {
      showError(`${failures.length} stay${failures.length !== 1 ? "s" : ""} could not be deleted.`);
    }
    setBulkDeleting(false);
  };

  const handleSelectBooking = (id) => {
    setBulkFailures([]);
    setSelectedBookingIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSelectAllBookings = (ids) => {
    setBulkFailures([]);
    setSelectedBookingIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const nights = diffNights(stayForm.check_in, stayForm.check_out);
  const estimatedSubtotal = Number(selectedUnit?.total || 0);
  const estimatedTax = estimatedSubtotal * 0.18;
  const estimatedGrandTotal = estimatedSubtotal + estimatedTax;

  // Exact 8 columns from Section 4G
  const bookingColumns = [
    {
      key: "booking_number",
      label: "Booking Reference",
      headerClassName: "!px-2.5",
      cellClassName: "!px-2.5 whitespace-nowrap font-mono font-bold",
      render: (b) => b.booking_number,
    },
    {
      key: "guest",
      label: "Guest",
      headerClassName: "!px-2.5",
      cellClassName: "!px-2.5",
      render: (b) => (
        <div>
          <div className="font-semibold text-[#172033] dark:text-[#F8FAFC] whitespace-nowrap">
            {b.guest_name || b.customer_name}
          </div>
          <div className="mt-0.5 text-xs text-[#64748B] dark:text-[#8A9AB2] whitespace-nowrap">
            {b.guest_phone || b.customer_phone}
          </div>
        </div>
      ),
    },
    {
      key: "unit",
      label: "Unit & Villa",
      headerClassName: "!px-2.5",
      cellClassName: "!px-2.5",
      render: (b) => (
        <div>
          <div className="font-medium text-[#172033] dark:text-[#F8FAFC] whitespace-nowrap">
            {b.unit_name}
          </div>
          <div className="text-xs text-[#64748B] dark:text-[#8A9AB2]">{b.villa_name}</div>
        </div>
      ),
    },
    {
      key: "dates",
      label: "Stay Dates & Timings",
      headerClassName: "!px-2.5",
      cellClassName: "!px-2.5 whitespace-nowrap tabular-nums",
      render: (b) => (
        <div className="space-y-0.5 text-xs">
          <div className="font-medium text-[#172033] dark:text-[#F8FAFC]">
            Check-in: {villaDateWithTime(b.check_in, b.check_in_time)}
          </div>
          <div className="text-[#64748B] dark:text-[#8A9AB2]">
            Check-out: {villaDateWithTime(b.check_out, b.check_out_time)} ·{" "}
            {diffNights(b.check_in, b.check_out)} night{diffNights(b.check_in, b.check_out) === 1 ? "" : "s"}
          </div>
        </div>
      ),
    },
    {
      key: "guests",
      label: "Guest Count",
      align: "right",
      headerClassName: "!px-2.5",
      cellClassName: "!px-2.5 whitespace-nowrap tabular-nums",
      render: (b) => `${b.guests} guest${b.guests === 1 ? "" : "s"}`,
    },
    {
      key: "status",
      label: "Status",
      align: "center",
      headerClassName: "!px-2.5",
      cellClassName: "!px-2.5",
      render: (b) => <StatusBadge status={b.status} label={b.status} size="sm" />,
    },
    {
      key: "billing",
      label: "Billing",
      align: "right",
      headerClassName: "!px-2.5",
      cellClassName: "!px-2.5 whitespace-nowrap tabular-nums",
      render: (b) => {
        const balance = Number(b.invoice_balance_due || 0);
        return (
          <div>
            <div className="font-semibold text-[#172033] dark:text-[#F8FAFC]">
              {villaMoney(b.invoice_total ?? b.total_amount)}
            </div>
            <div
              className={`text-[11px] font-semibold ${
                balance > 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {b.invoice_payment_status || "Pending"} · Bal {villaMoney(balance)}
            </div>
          </div>
        );
      },
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      headerClassName: "!px-2.5",
      cellClassName: "!px-2.5 whitespace-nowrap",
      render: (b) => {
        const canEdit = ["Reserved", "Confirmed"].includes(b.status);
        const hasPrimaryCta =
          b.status === "Reserved" ||
          (b.status === "Confirmed" && Boolean(b.can_check_in)) ||
          (b.status === "Checked In" && Boolean(b.can_check_out));
        return (
          <div className="inline-flex items-center justify-end gap-1">
            {b.status === "Reserved" && (
              <button
                type="button"
                onClick={() => handleConfirmStatusChange(b, "Confirmed")}
                className="rounded-lg bg-sky-50 dark:bg-sky-950/40 px-2 py-1 text-[11px] font-semibold text-sky-700 dark:text-sky-300 hover:bg-sky-100 cursor-pointer"
              >
                Confirm
              </button>
            )}

            {b.status === "Confirmed" && Boolean(b.can_check_in) && (
              <button
                type="button"
                onClick={() => openActionModal(b, "Checked In")}
                className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 cursor-pointer"
              >
                Check In
              </button>
            )}

            {b.status === "Checked In" && Boolean(b.can_check_out) && (
              <button
                type="button"
                onClick={() => openActionModal(b, "Checked Out")}
                className="rounded-lg bg-amber-50 dark:bg-amber-950/40 px-2 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100 cursor-pointer"
              >
                Check Out
              </button>
            )}

            {!hasPrimaryCta && b.invoice_number && (
              <button
                type="button"
                onClick={() => navigate(`/villas/invoices?search=${b.invoice_number}`)}
                title="Open Invoice"
                className="rounded-lg p-1 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
              >
                <FileText size={14} />
              </button>
            )}

            <button
              type="button"
              onClick={() => setDetailBooking(b)}
              title="View Stay Details"
              className="rounded-lg p-1 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30 cursor-pointer"
            >
              <Eye size={14} />
            </button>

            {canEdit ? (
              <button
                type="button"
                onClick={() => openEditBooking(b)}
                title="Edit Stay"
                className="rounded-lg p-1 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
              >
                <Edit3 size={14} />
              </button>
            ) : b.status === "Checked In" ? (
              <button
                type="button"
                onClick={() => navigate(`/villas/services?bookingId=${b.id}`)}
                title="Manage Guest Services"
                className="rounded-lg p-1 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
              >
                <Wrench size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openHistoryModal(b)}
                title="Status History"
                className="rounded-lg p-1 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
              >
                <History size={14} />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setDeleteError("");
                setDeleteTarget(b);
              }}
              title="Delete Stay"
              className="rounded-lg p-1 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stays & Bookings"
        actions={
          <button
            type="button"
            onClick={() => setWizardOpen((prev) => !prev)}
            className={wizardOpen ? BUTTON_VARIANTS.secondary : BUTTON_VARIANTS.primary}
          >
            <Plus size={16} />
            <span>{wizardOpen ? "Hide Reservation Builder" : "New Stay Reservation"}</span>
          </button>
        }
      />

      {pageError && (
        <AlertBanner
          variant="error"
          title="Unable to load bookings"
          message={pageError}
          onDismiss={() => setPageError("")}
        />
      )}

      {/* KPI SUMMARY */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-fit max-w-full">
        <StatCard
          compact
          title="Reserved"
          value={stats.reserved}
          description="Awaiting confirmation"
          icon={Clock}
          color="amber"
          active={statusFilter === "Reserved"}
          onClick={() => setStatusFilter((s) => (s === "Reserved" ? "" : "Reserved"))}
        />
        <StatCard
          compact
          title="Confirmed"
          value={stats.confirmed}
          description="Ready for arrival"
          icon={ClipboardCheck}
          color="sky"
          active={statusFilter === "Confirmed"}
          onClick={() => setStatusFilter((s) => (s === "Confirmed" ? "" : "Confirmed"))}
        />
        <StatCard
          compact
          title="In-House"
          value={stats.checkedIn}
          description="Currently checked in"
          icon={LogIn}
          color="emerald"
          active={statusFilter === "Checked In"}
          onClick={() => setStatusFilter((s) => (s === "Checked In" ? "" : "Checked In"))}
        />
        <StatCard
          compact
          title="Checked Out"
          value={stats.checkedOut}
          description="Completed stays"
          icon={CheckCircle2}
          color="stone"
          active={statusFilter === "Checked Out"}
          onClick={() => setStatusFilter((s) => (s === "Checked Out" ? "" : "Checked Out"))}
        />
      </div>

      {/* MULTI-STEP NEW RESERVATION WIZARD */}
      {wizardOpen && (
        <div className={`${CARD_STYLES.base} space-y-5 border-amber-200/80 dark:border-amber-900/50`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 dark:border-stone-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                Create Stay Reservation
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Complete stay dates, unit selection, and guest assignment cleanly step by step.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { num: 1, label: "Stay Details" },
                { num: 2, label: "Available Unit" },
                { num: 3, label: "Guest Profile" },
                { num: 4, label: "Summary" },
              ].map((s) => (
                <button
                  key={s.num}
                  type="button"
                  onClick={() => {
                    if (s.num === 1) setStep(1);
                    else if (s.num === 2 && availabilityList.length > 0) setStep(2);
                    else if (s.num === 3 && selectedUnit) setStep(3);
                    else if (s.num === 4 && selectedUnit && selectedGuestId) setStep(4);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                    step === s.num
                      ? "bg-amber-500 text-[#0D1420] font-bold"
                      : step > s.num
                      ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                      : "bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400"
                  }`}
                >
                  <span>{s.num}.</span>
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          {wizardError && (
            <AlertBanner
              variant="error"
              message={wizardError}
              onDismiss={() => setWizardError("")}
            />
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Check-in Date *</label>
                  <input
                    type="date"
                    min={todayKolkata}
                    value={stayForm.check_in}
                    onChange={(e) => {
                      const nextIn = e.target.value;
                      const nextOut =
                        nextIn && (!stayForm.check_out || stayForm.check_out <= nextIn)
                          ? addDaysIso(nextIn, 1)
                          : stayForm.check_out;
                      setStayForm({ ...stayForm, check_in: nextIn, check_out: nextOut });
                      setWizardFieldErrors((previous) => ({ ...previous, check_in: "", check_out: "" }));
                    }}
                    aria-invalid={Boolean(wizardFieldErrors.check_in)}
                    className={`${INPUT_STYLES.base} ${wizardFieldErrors.check_in ? "border-red-500" : ""}`}
                  />
                  {wizardFieldErrors.check_in && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{wizardFieldErrors.check_in}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Check-out Date *</label>
                  <input
                    type="date"
                    min={addDaysIso(stayForm.check_in || todayKolkata, 1)}
                    value={stayForm.check_out}
                    onChange={(e) => { setStayForm({ ...stayForm, check_out: e.target.value }); setWizardFieldErrors((previous) => ({ ...previous, check_out: "" })); }}
                    aria-invalid={Boolean(wizardFieldErrors.check_out)}
                    className={`${INPUT_STYLES.base} ${wizardFieldErrors.check_out ? "border-red-500" : ""}`}
                  />
                  {wizardFieldErrors.check_out && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{wizardFieldErrors.check_out}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Number of Guests *</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={stayForm.guests}
                    onChange={(e) => { setStayForm({ ...stayForm, guests: e.target.value }); setWizardFieldErrors((previous) => ({ ...previous, guests: "" })); }}
                    aria-invalid={Boolean(wizardFieldErrors.guests)}
                    className={`${INPUT_STYLES.base} ${wizardFieldErrors.guests ? "border-red-500" : ""}`}
                  />
                  {wizardFieldErrors.guests && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{wizardFieldErrors.guests}</p>}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Reservation Notes (Optional)</label>
                <input
                  type="text"
                  value={stayForm.notes}
                  onChange={(e) => setStayForm({ ...stayForm, notes: e.target.value })}
                  placeholder="Special requests, early arrival note, transfer requirements..."
                  className={INPUT_STYLES.base}
                />
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-stone-500 dark:text-stone-400">
                  {nights > 0 ? `${nights} night(s) selected` : "Select valid stay dates"}
                </span>
                <button
                  type="button"
                  onClick={() => checkAvailability(true)}
                  disabled={checkingAvail}
                  className={BUTTON_VARIANTS.primary}
                >
                  <span>{checkingAvail ? "Checking Availability..." : "Check Availability"}</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600 dark:text-stone-300">
                <span>
                  Showing capacity {stayForm.guests}+ units for{" "}
                  <strong>{villaDateRange(stayForm.check_in, stayForm.check_out)}</strong> ({nights} nights)
                </span>
                <button
                  type="button"
                  onClick={() => checkAvailability(false)}
                  className={BUTTON_VARIANTS.secondary}
                >
                  Refresh Availability
                </button>
              </div>

              {availabilityList.length === 0 ? (
                <AlertBanner
                  variant="warning"
                  message="No active units meet the guest capacity requirement."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {availabilityList.map((u) => {
                    const isSelected = selectedUnit?.id === u.id;
                    return (
                      <div
                        key={u.id}
                        className={`rounded-xl border p-4 transition flex flex-col justify-between gap-3 ${
                          !u.available
                            ? "border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-[#0B111C]"
                            : isSelected
                            ? "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 ring-1 ring-amber-500"
                            : "border-stone-200 dark:border-stone-800 bg-white dark:bg-[#0D1420] hover:border-amber-400"
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="font-bold text-sm text-stone-900 dark:text-stone-100">
                                {u.name}
                              </h4>
                              <p className="text-xs text-stone-500 dark:text-stone-400">
                                {u.villa_name} · {u.category_name}
                              </p>
                            </div>
                            <StatusBadge
                              status={u.available ? "AVAILABLE" : "OUT_OF_ORDER"}
                              label={u.available ? "Available" : "Unavailable"}
                              size="sm"
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600 dark:text-stone-300 pt-1">
                            <span>Up to {u.capacity} guests · {u.bedrooms} BR</span>
                            <span>HK: {u.housekeeping_status}</span>
                          </div>
                          <div className="text-[11px] text-stone-500 dark:text-stone-400">
                            Check-in {u.effective_check_in_time_display || "2:00 PM"} · Check-out {u.effective_check_out_time_display || "11:00 AM"}
                          </div>
                          {!u.available && (u.unavailable_reason || u.next_available_display) && (
                            <div className="mt-1.5 rounded-lg border border-rose-200/80 dark:border-rose-500/20 bg-rose-50/80 dark:bg-rose-950/25 px-2.5 py-2 text-[11px] leading-snug space-y-0.5">
                              {u.unavailable_reason && (
                                <div className="text-rose-700 dark:text-rose-300 font-medium">
                                  {u.unavailable_reason}
                                </div>
                              )}
                              {u.next_available_display && (
                                <div className="text-amber-700 dark:text-amber-300 font-semibold">
                                  Available: {u.next_available_display}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between border-t border-stone-100 dark:border-stone-800 pt-3">
                          <div>
                            <div className="text-sm font-bold text-stone-900 dark:text-stone-100 tabular-nums">
                              {villaMoney(u.total)}
                            </div>
                            <div className="text-[11px] text-stone-500 tabular-nums">
                              Avg {villaMoney(u.nightly_rate)} / night
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={!u.available}
                            onClick={() => {
                              setSelectedUnit(u);
                              setWizardFieldErrors((previous) => ({ ...previous, unit: "" }));
                              setStep(3);
                            }}
                            className={
                              isSelected ? BUTTON_VARIANTS.primary : BUTTON_VARIANTS.secondary
                            }
                          >
                            {isSelected ? "Selected" : "Select Unit"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                {wizardFieldErrors.unit && <p className="text-xs text-red-600 dark:text-red-400">{wizardFieldErrors.unit}</p>}
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className={BUTTON_VARIANTS.secondary}
                >
                  <ArrowLeft size={15} />
                  <span>Back to Dates</span>
                </button>
                <button
                  type="button"
                  disabled={!selectedUnit}
                  onClick={() => setStep(3)}
                  className={BUTTON_VARIANTS.primary}
                >
                  <span>Continue to Guest</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                  />
                  <input
                    type="text"
                    value={guestSearch}
                    onChange={(e) => setGuestSearch(e.target.value)}
                    placeholder="Search active villa guests by name, phone, or reference..."
                    className={`${INPUT_STYLES.base} pl-9`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setInlineGuestError("");
                    setInlineGuestForm(INITIAL_GUEST_FORM);
                    setInlineGuestOpen(true);
                  }}
                  className={BUTTON_VARIANTS.outline}
                >
                  <UserPlus size={15} />
                  <span>Add New Guest</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-64 overflow-y-auto pr-1">
                {filteredGuests.length === 0 ? (
                  <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-6 text-center text-xs text-stone-500">
                    No matching active guests found. Use &quot;Add New Guest&quot; to register one inline.
                  </div>
                ) : (
                  filteredGuests.map((g) => {
                    const isPicked = String(g.id) === String(selectedGuestId);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => { setSelectedGuestId(String(g.id)); setWizardFieldErrors((previous) => ({ ...previous, guest: "" })); }}
                        className={`text-left rounded-xl border p-3 transition cursor-pointer ${
                          isPicked
                            ? "border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 ring-1 ring-amber-500"
                            : "border-stone-200 dark:border-stone-800 hover:border-amber-400"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm text-stone-900 dark:text-stone-100 truncate">
                            {g.full_name}
                          </span>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                            {g.guest_reference}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-stone-600 dark:text-stone-300">{g.phone}</div>
                        {g.email && (
                          <div className="text-[11px] text-stone-500 truncate">{g.email}</div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                {wizardFieldErrors.guest && <p className="text-xs text-red-600 dark:text-red-400">{wizardFieldErrors.guest}</p>}
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className={BUTTON_VARIANTS.secondary}
                >
                  <ArrowLeft size={15} />
                  <span>Back to Units</span>
                </button>
                <button
                  type="button"
                  disabled={!selectedGuestId}
                  onClick={() => setStep(4)}
                  className={BUTTON_VARIANTS.primary}
                >
                  <span>Review Summary</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}

          {step === 4 && selectedUnit && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-4 space-y-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                    Accommodation
                  </p>
                  <p className="font-bold text-stone-900 dark:text-stone-100">{selectedUnit.name}</p>
                  <p className="text-xs text-stone-500">
                    {selectedUnit.villa_name} · {selectedUnit.category_name}
                  </p>
                  <div className="text-xs text-stone-600 dark:text-stone-300 pt-1 space-y-0.5">
                    <div>Check-in: {villaDateWithTime(stayForm.check_in, selectedUnit.effective_check_in_time || "14:00")}</div>
                    <div>Check-out: {villaDateWithTime(stayForm.check_out, selectedUnit.effective_check_out_time || "11:00")}</div>
                    <div className="text-[11px] text-stone-500">{nights} nights · {stayForm.guests} guests</div>
                  </div>
                </div>

                <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-4 space-y-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                    Primary Guest
                  </p>
                  <p className="font-bold text-stone-900 dark:text-stone-100">
                    {selectedGuest?.full_name || "Selected Guest"}
                  </p>
                  <p className="text-xs font-mono text-amber-700 dark:text-amber-300">
                    {selectedGuest?.guest_reference}
                  </p>
                  <p className="text-xs text-stone-600 dark:text-stone-300">
                    {selectedGuest?.phone} {selectedGuest?.email ? `· ${selectedGuest.email}` : ""}
                  </p>
                </div>

                <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 p-4 space-y-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                    Estimated Billing Summary
                  </p>
                  <div className="flex justify-between text-xs">
                    <span>Accommodation Subtotal:</span>
                    <span className="font-semibold tabular-nums">{villaMoney(estimatedSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>GST (18%):</span>
                    <span className="font-semibold tabular-nums">{villaMoney(estimatedTax)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold border-t border-amber-200 dark:border-amber-900/40 pt-1.5">
                    <span>Estimated Total:</span>
                    <span className="tabular-nums">{villaMoney(estimatedGrandTotal)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className={BUTTON_VARIANTS.secondary}
                >
                  <ArrowLeft size={15} />
                  <span>Back to Guest</span>
                </button>
                <button
                  type="button"
                  onClick={handleCreateBooking}
                  disabled={submittingBooking}
                  className={BUTTON_VARIANTS.primary}
                >
                  <CheckCircle2 size={16} />
                  <span>{submittingBooking ? "Creating Reservation..." : "Reserve Stay"}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* COMPACT FILTER TOOLBAR */}
      <div className={`${CARD_STYLES.base} !p-2.5 w-fit max-w-full space-y-2`}>
        <div className="flex flex-wrap lg:flex-nowrap items-end gap-2">
          <div className="w-full sm:w-52 shrink-0 min-w-0">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#8A9AB2] mb-1">
              Search
            </label>
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Stay #, guest, phone..."
                className={`${INPUT_STYLES.base} pl-9`}
              />
            </div>
          </div>

          <div className="w-[125px] shrink-0">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#8A9AB2] mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={INPUT_STYLES.select}
            >
              <option value="">All Statuses</option>
              {BOOKING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="w-[135px] shrink-0">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#8A9AB2] mb-1">
              Villa
            </label>
            <select
              value={villaFilter}
              onChange={(e) => setVillaFilter(e.target.value)}
              className={INPUT_STYLES.select}
            >
              <option value="">All Villas</option>
              {villas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div className="w-[140px] shrink-0">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#8A9AB2] mb-1">
              Unit
            </label>
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className={INPUT_STYLES.select}
            >
              <option value="">All Units</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className="w-[122px] shrink-0">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#8A9AB2] mb-1">
              From
            </label>
            <input
              type="date"
              aria-label="Filter from date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={`${INPUT_STYLES.base} !px-2 text-xs`}
            />
          </div>

          <div className="w-[122px] shrink-0">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#8A9AB2] mb-1">
              To
            </label>
            <input
              type="date"
              aria-label="Filter to date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={`${INPUT_STYLES.base} !px-2 text-xs`}
            />
          </div>

          {(searchQuery || statusFilter || villaFilter || unitFilter || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("");
                setVillaFilter("");
                setUnitFilter("");
                setDateFrom("");
                setDateTo("");
              }}
              className={`${BUTTON_VARIANTS.secondary} shrink-0 py-2 text-xs`}
            >
              Clear
            </button>
          )}
        </div>

        {(searchQuery || statusFilter || villaFilter || unitFilter || dateFrom || dateTo) && (
          <div className="flex items-center justify-between gap-4 text-xs text-stone-500 pt-0.5">
            <span>Showing {totalRecords} filtered stays</span>
          </div>
        )}
      </div>

      {selectedBookingIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20 px-4 py-2.5">
          <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {selectedBookingIds.size} stay{selectedBookingIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={BUTTON_VARIANTS.secondary}
              onClick={() => setSelectedBookingIds(new Set())}
            >
              Clear Selection
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
              onClick={() => setBulkDeleteOpen(true)}
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
          <p className="font-semibold">Some stays could not be deleted:</p>
          <ul className="mt-1 space-y-1">
            {bulkFailures.map((item) => (
              <li key={item.id}>
                <span className="font-medium">{item.name}:</span> {item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ALL STAYS ALIGNED TABLE */}
      <VillaDataTable
        columns={bookingColumns}
        rows={pagedBookings}
        loading={loading}
        loadingMessage="Loading resort stays..."
        emptyIcon={CalendarDays}
        emptyTitle="No stays match your filters"
        emptyDescription="Create a new reservation or adjust active search criteria."
        tableMinWidth="min-w-full"
        selectedIds={selectedBookingIds}
        onSelectRow={handleSelectBooking}
        onSelectAll={handleSelectAllBookings}
        pagination={{
          currentPage: safePage,
          totalPages,
          totalRecords,
          pageSize: PAGE_SIZE,
          onPageChange: setPage,
        }}
      />

      {/* INLINE ADD NEW GUEST MODAL */}
      <Modal
        isOpen={inlineGuestOpen}
        onClose={() => !savingGuest && setInlineGuestOpen(false)}
        title="Register New Villa Guest"
        subtitle="Your selected dates and accommodation unit stay preserved."
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <button
              type="button"
              onClick={() => setInlineGuestOpen(false)}
              disabled={savingGuest}
              className={BUTTON_VARIANTS.secondary}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="inline-villa-guest-form"
              disabled={savingGuest}
              className={BUTTON_VARIANTS.primary}
            >
              {savingGuest ? "Registering..." : "Save & Select Guest"}
            </button>
          </div>
        }
      >
        <form id="inline-villa-guest-form" onSubmit={handleSaveInlineGuest} className="space-y-4">
          {inlineGuestError && (
            <AlertBanner
              variant="error"
              message={inlineGuestError}
              onDismiss={() => setInlineGuestError("")}
            />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={inlineGuestForm.full_name}
                onChange={(e) => { setInlineGuestForm({ ...inlineGuestForm, full_name: e.target.value }); setInlineGuestFieldErrors((p) => ({ ...p, full_name: "" })); }}
                placeholder="e.g. Kavya Kulkarni"
                aria-invalid={Boolean(inlineGuestFieldErrors.full_name)}
                className={`${INPUT_STYLES.base} ${inlineGuestFieldErrors.full_name ? "border-red-500" : ""}`}
              />
              {inlineGuestFieldErrors.full_name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{inlineGuestFieldErrors.full_name}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Phone Number *</label>
              <input
                type="tel"
                required
                maxLength={15}
                value={inlineGuestForm.phone}
                onChange={(e) => { setInlineGuestForm({ ...inlineGuestForm, phone: e.target.value }); setInlineGuestFieldErrors((p) => ({ ...p, phone: "" })); }}
                placeholder="e.g. 9820198201"
                aria-invalid={Boolean(inlineGuestFieldErrors.phone)}
                className={`${INPUT_STYLES.base} ${inlineGuestFieldErrors.phone ? "border-red-500" : ""}`}
              />
              {inlineGuestFieldErrors.phone && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{inlineGuestFieldErrors.phone}</p>}
              <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                10-digit mobile starting with 6, 7, 8, or 9.
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Email</label>
              <input
                type="email"
                value={inlineGuestForm.email}
                onChange={(e) => { setInlineGuestForm({ ...inlineGuestForm, email: e.target.value }); setInlineGuestFieldErrors((p) => ({ ...p, email: "" })); }}
                placeholder="guest@example.com"
                aria-invalid={Boolean(inlineGuestFieldErrors.email)}
                className={`${INPUT_STYLES.base} ${inlineGuestFieldErrors.email ? "border-red-500" : ""}`}
              />
              {inlineGuestFieldErrors.email && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{inlineGuestFieldErrors.email}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">City</label>
              <input
                type="text"
                value={inlineGuestForm.city}
                onChange={(e) => setInlineGuestForm({ ...inlineGuestForm, city: e.target.value })}
                placeholder="e.g. Bengaluru"
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">State</label>
              <input
                type="text"
                value={inlineGuestForm.state}
                onChange={(e) => setInlineGuestForm({ ...inlineGuestForm, state: e.target.value })}
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Country</label>
              <input
                type="text"
                value={inlineGuestForm.country}
                onChange={(e) => setInlineGuestForm({ ...inlineGuestForm, country: e.target.value })}
                className={INPUT_STYLES.base}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1">Preferences / Special Notes</label>
              <input
                type="text"
                value={inlineGuestForm.preferences}
                onChange={(e) => setInlineGuestForm({ ...inlineGuestForm, preferences: e.target.value })}
                placeholder="Dietary preferences, pillow request, VIP notes..."
                className={INPUT_STYLES.base}
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* EDIT STAY MODAL */}
      <Modal
        isOpen={Boolean(editTarget)}
        onClose={() => !savingEdit && setEditTarget(null)}
        title={editTarget ? `Edit Stay ${editTarget.booking_number}` : ""}
        subtitle="Modify unit assignment, guest, dates, or occupancy before check-in."
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <button
              type="button"
              onClick={() => setEditTarget(null)}
              disabled={savingEdit}
              className={BUTTON_VARIANTS.secondary}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-stay-form"
              disabled={savingEdit}
              className={BUTTON_VARIANTS.primary}
            >
              {savingEdit ? "Updating..." : "Save Stay Changes"}
            </button>
          </div>
        }
      >
        <form id="edit-stay-form" onSubmit={handleSaveEdit} className="space-y-4">
          {editError && (
            <AlertBanner variant="error" message={editError} onDismiss={() => setEditError("")} />
          )}
          <div>
            <label className="block text-xs font-semibold mb-1">Accommodation Unit *</label>
            <select
              required
              value={editForm.unit_id || ""}
              onChange={(e) => setEditForm({ ...editForm, unit_id: e.target.value })}
              className={INPUT_STYLES.select}
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.villa_name}) · max {u.capacity}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Guest *</label>
            <select
              required
              value={editForm.guest_id || ""}
              onChange={(e) => setEditForm({ ...editForm, guest_id: e.target.value })}
              className={INPUT_STYLES.select}
            >
              {guests.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.full_name} ({g.phone})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Check-in *</label>
              <input
                type="date"
                required
                min={todayKolkata}
                value={editForm.check_in || ""}
                onChange={(e) => {
                  const nextIn = e.target.value;
                  const nextOut =
                    nextIn && (!editForm.check_out || editForm.check_out <= nextIn)
                      ? addDaysIso(nextIn, 1)
                      : editForm.check_out;
                  setEditForm({ ...editForm, check_in: nextIn, check_out: nextOut });
                  setEditFieldErrors((previous) => ({ ...previous, check_in: "", check_out: "" }));
                }}
                aria-invalid={Boolean(editFieldErrors.check_in)}
                className={`${INPUT_STYLES.base} ${editFieldErrors.check_in ? "border-red-500" : ""}`}
              />
              {editFieldErrors.check_in && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{editFieldErrors.check_in}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Check-out *</label>
              <input
                type="date"
                required
                min={addDaysIso(editForm.check_in || todayKolkata, 1)}
                value={editForm.check_out || ""}
                onChange={(e) => { setEditForm({ ...editForm, check_out: e.target.value }); setEditFieldErrors((previous) => ({ ...previous, check_out: "" })); }}
                aria-invalid={Boolean(editFieldErrors.check_out)}
                className={`${INPUT_STYLES.base} ${editFieldErrors.check_out ? "border-red-500" : ""}`}
              />
              {editFieldErrors.check_out && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{editFieldErrors.check_out}</p>}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Guests *</label>
            <input
              type="number"
              min={1}
              max={50}
              required
              value={editForm.guests ?? 1}
              onChange={(e) => setEditForm({ ...editForm, guests: e.target.value })}
              className={INPUT_STYLES.base}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Notes</label>
            <textarea
              rows={2}
              value={editForm.notes || ""}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              className={INPUT_STYLES.base}
            />
          </div>
        </form>
      </Modal>

      {/* LIFECYCLE TRANSITION MODAL */}
      <Modal
        isOpen={Boolean(actionModal)}
        onClose={() => !actionSubmitting && setActionModal(null)}
        title={
          actionModal
            ? `${actionModal.targetStatus}: ${actionModal.booking.booking_number}`
            : ""
        }
        subtitle={
          actionModal
            ? `${actionModal.booking.guest_name} · ${actionModal.booking.unit_name}`
            : ""
        }
        size="md"
        footer={
          actionModal && (
            <div className="flex items-center justify-end gap-2.5 w-full">
              <button
                type="button"
                onClick={() => setActionModal(null)}
                disabled={actionSubmitting}
                className={BUTTON_VARIANTS.secondary}
              >
                Back
              </button>
              <button
                type="button"
                disabled={
                  actionSubmitting ||
                  (["Cancelled", "No Show"].includes(actionModal.targetStatus) &&
                    !actionReason.trim()) ||
                  (actionModal.targetStatus === "Checked In" &&
                    Number(actionModal.booking.invoice_paid ?? 0) + 0.01 <
                      Number(((Number(actionModal.booking.invoice_total ?? actionModal.booking.total_amount ?? 0)) / 2).toFixed(2)))
                }
                onClick={() =>
                  handleConfirmStatusChange(
                    actionModal.booking,
                    actionModal.targetStatus,
                    actionReason.trim() || null
                  )
                }
                className={
                  ["Cancelled", "No Show"].includes(actionModal.targetStatus)
                    ? BUTTON_VARIANTS.danger
                    : BUTTON_VARIANTS.primary
                }
              >
                {actionSubmitting ? "Processing..." : `Confirm ${actionModal.targetStatus}`}
              </button>
            </div>
          )
        }
      >
        {actionModal && (
          <div className="space-y-4">
            {actionError && (
              <AlertBanner
                variant="error"
                message={actionError}
                onDismiss={() => setActionError("")}
              />
            )}

            {actionModal.targetStatus === "Checked In" && (() => {
              const totalStay = Number(actionModal.booking.invoice_total ?? actionModal.booking.total_amount ?? 0);
              const halfRequired = Number((totalStay / 2).toFixed(2));
              const paidSoFar = Number(actionModal.booking.invoice_paid ?? 0);
              const missingAdvance = paidSoFar + 0.01 < halfRequired;
              return (
                <div className="space-y-3">
                  <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-3.5 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-stone-500">Check-in:</span>
                      <span className="font-semibold text-stone-900 dark:text-stone-100">
                        {villaDateWithTime(actionModal.booking.check_in, actionModal.booking.check_in_time)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Check-out:</span>
                      <span className="font-semibold text-stone-900 dark:text-stone-100">
                        {villaDateWithTime(actionModal.booking.check_out, actionModal.booking.check_out_time)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-stone-100 dark:border-stone-800">
                      <span className="text-stone-500">Pre-Stay Advance Paid (min 50%):</span>
                      <span
                        className={`font-semibold tabular-nums ${
                          missingAdvance ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {villaMoney(paidSoFar)} / {villaMoney(halfRequired)} required
                      </span>
                    </div>
                  </div>
                  {missingAdvance ? (
                    <AlertBanner
                      variant="error"
                      title="50% Pre-Stay Payment Required"
                      message={`At least half (${villaMoney(halfRequired)}) must be paid in Invoices before the guest checks in to stay at the unit.`}
                    />
                  ) : (
                    <AlertBanner
                      variant="info"
                      title="Check-In Readiness"
                      message="Confirm guest arrival. Backend validates scheduled arrival timing and Ready/Inspected housekeeping status."
                    />
                  )}
                </div>
              );
            })()}

            {actionModal.targetStatus === "Checked Out" && (
              <div className="space-y-3">
                {checkoutSummaryLoading ? (
                  <p className="py-4 text-center text-xs text-stone-500">Calculating checkout summary...</p>
                ) : (
                  (() => {
                    const summary = checkoutSummary;
                    const accommodationTotal = Number(summary?.accommodation_total ?? actionModal.booking.total_amount ?? 0);
                    const serviceTotal = Number(summary?.service_total ?? 0);
                    const lateFee = Number(summary?.late_checkout_fee ?? 0);
                    const taxAmount = Number(summary?.tax_amount ?? 0);
                    const advancePayments = Number(summary?.advance_payments ?? actionModal.booking.invoice_paid ?? 0);
                    const netPaid = Number(summary?.net_paid ?? actionModal.booking.invoice_paid ?? 0);
                    const remainingBalance = Number(summary?.remaining_balance ?? actionModal.booking.invoice_balance_due ?? 0);
                    const isLate = Boolean(summary?.is_late_checkout);
                    const feeConfigured = Boolean(summary?.late_fee_configured);
                    return (
                      <>
                        <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-4 text-xs space-y-1.5">
                          <div className="flex justify-between text-[11px] text-stone-500 pb-1.5 border-b border-stone-100 dark:border-stone-800">
                            <span>Check-in: {villaDateWithTime(actionModal.booking.check_in, actionModal.booking.check_in_time)}</span>
                            <span>Check-out: {villaDateWithTime(actionModal.booking.check_out, actionModal.booking.check_out_time)}</span>
                          </div>
                          <div className="flex justify-between pt-0.5">
                            <span>Accommodation Total:</span>
                            <span className="font-semibold tabular-nums">{villaMoney(accommodationTotal)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Guest-Service Charges:</span>
                            <span className="font-semibold tabular-nums">{villaMoney(serviceTotal)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>
                              Late Checkout Fee
                              {isLate
                                ? feeConfigured
                                  ? " (Past grace period)"
                                  : " (Not configured)"
                                : " (Within grace / On time)"}
                              :
                            </span>
                            <span
                              className={`font-semibold tabular-nums ${
                                lateFee > 0 ? "text-amber-700 dark:text-amber-300" : ""
                              }`}
                            >
                              {villaMoney(lateFee)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Applicable Tax (GST {summary?.tax_rate ?? "18.00"}%):</span>
                            <span className="font-semibold tabular-nums">{villaMoney(taxAmount)}</span>
                          </div>
                          <div className="flex justify-between border-t border-stone-100 dark:border-stone-800 pt-1.5">
                            <span>Advance Payments:</span>
                            <span className="font-semibold tabular-nums">{villaMoney(advancePayments)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Net Paid Amount:</span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                              {villaMoney(netPaid)}
                            </span>
                          </div>
                          <div className="flex justify-between border-t border-stone-100 dark:border-stone-800 pt-1.5">
                            <span className="font-semibold">Remaining Balance:</span>
                            <span
                              className={`font-bold tabular-nums ${
                                remainingBalance > 0
                                  ? "text-rose-600 dark:text-rose-400"
                                  : "text-emerald-600 dark:text-emerald-400"
                              }`}
                            >
                              {villaMoney(remainingBalance)}
                            </span>
                          </div>
                        </div>
                        {remainingBalance > 0 && (
                          <AlertBanner
                            variant="warning"
                            title="Unsettled Balance"
                            message="This stay still has an open invoice balance. Ensure settlement is handled on the Invoices tab if required."
                          />
                        )}
                      </>
                    );
                  })()
                )}
              </div>
            )}

            {["Cancelled", "No Show"].includes(actionModal.targetStatus) && (
              <>
                <AlertBanner
                  variant="warning"
                  title={
                    Number(actionModal.booking.invoice_paid || 0) > 0
                      ? "Advance Payment Refund Reversal"
                      : "Confirm Outcome"
                  }
                  message={
                    Number(actionModal.booking.invoice_paid || 0) > 0
                      ? `Net advance of ${villaMoney(
                          actionModal.booking.invoice_paid
                        )} will be automatically reversed/refunded and the invoice voided.`
                      : `The stay will be marked as "${actionModal.targetStatus}" and the unit inventory released.`
                  }
                />
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Reason for {actionModal.targetStatus} *
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="Enter operational reason recorded in stay history..."
                    className={INPUT_STYLES.base}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* STATUS HISTORY MODAL */}
      <Modal
        isOpen={Boolean(historyTarget)}
        onClose={() => setHistoryTarget(null)}
        title={historyTarget ? `Status History · ${historyTarget.booking_number}` : ""}
        subtitle={
          historyTarget
            ? `${historyTarget.guest_name} · ${historyTarget.unit_name}`
            : ""
        }
        size="md"
        footer={
          <div className="flex justify-end w-full">
            <button
              type="button"
              onClick={() => setHistoryTarget(null)}
              className={BUTTON_VARIANTS.secondary}
            >
              Close
            </button>
          </div>
        }
      >
        {historyLoading ? (
          <div className="py-8 text-center text-xs text-stone-500">
            Loading stay status history...
          </div>
        ) : historyRows.length === 0 ? (
          <p className="py-6 text-center text-xs text-stone-500">
            No status history recorded for this booking.
          </p>
        ) : (
          <div className="space-y-3">
            {historyRows.map((h) => (
              <div
                key={h.id}
                className="rounded-xl border border-stone-200 dark:border-stone-800 p-3 text-xs space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold text-stone-900 dark:text-stone-100">
                    {h.previous_status ? (
                      <>
                        <span>{h.previous_status}</span>
                        <span>→</span>
                      </>
                    ) : null}
                    <StatusBadge status={h.new_status} label={h.new_status} size="sm" />
                  </div>
                  <span className="text-[11px] text-stone-500 tabular-nums">
                    {new Date(h.changed_at).toLocaleString("en-IN")}
                  </span>
                </div>
                {h.reason && (
                  <p className="text-stone-600 dark:text-stone-300">{h.reason}</p>
                )}
                <p className="text-[11px] text-stone-500">
                  By: {h.changed_by_name || "System"}
                </p>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* STAY DETAILS MODAL */}
      <Modal
        isOpen={Boolean(detailBooking)}
        onClose={() => setDetailBooking(null)}
        title={detailBooking ? `Stay Details · ${detailBooking.booking_number}` : ""}
        subtitle={
          detailBooking
            ? `${detailBooking.guest_name || detailBooking.customer_name} · ${detailBooking.unit_name}`
            : ""
        }
        size="md"
        footer={
          detailBooking && (
            <div className="flex flex-wrap items-center justify-between gap-2 w-full">
              <div className="flex flex-wrap items-center gap-1.5">
                {detailBooking.invoice_number && (
                  <button
                    type="button"
                    onClick={() => {
                      const inv = detailBooking.invoice_number;
                      setDetailBooking(null);
                      navigate(`/villas/invoices?search=${inv}`);
                    }}
                    className={`${BUTTON_VARIANTS.secondary} !px-2.5 !py-1.5 text-xs`}
                  >
                    <FileText size={13} />
                    <span>Invoice</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const target = detailBooking;
                    setDetailBooking(null);
                    openHistoryModal(target);
                  }}
                  className={`${BUTTON_VARIANTS.secondary} !px-2.5 !py-1.5 text-xs`}
                >
                  <History size={13} />
                  <span>History</span>
                </button>
                {detailBooking.status === "Checked In" && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = detailBooking.id;
                      setDetailBooking(null);
                      navigate(`/villas/services?bookingId=${id}`);
                    }}
                    className={`${BUTTON_VARIANTS.secondary} !px-2.5 !py-1.5 text-xs`}
                  >
                    <Wrench size={13} />
                    <span>Services</span>
                  </button>
                )}
                {["Reserved", "Confirmed"].includes(detailBooking.status) &&
                  Boolean(detailBooking.can_mark_no_show) && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = detailBooking;
                        setDetailBooking(null);
                        openActionModal(target, "No Show");
                      }}
                      className={`${BUTTON_VARIANTS.secondary} !px-2.5 !py-1.5 text-xs`}
                    >
                      <span>No Show</span>
                    </button>
                  )}
                {["Reserved", "Confirmed"].includes(detailBooking.status) && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = detailBooking;
                      setDetailBooking(null);
                      openActionModal(target, "Cancelled");
                    }}
                    className="inline-flex items-center gap-1 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-2.5 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 cursor-pointer"
                  >
                    <XCircle size={13} />
                    <span>Cancel Stay</span>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetailBooking(null)}
                className={BUTTON_VARIANTS.secondary}
              >
                Close
              </button>
            </div>
          )
        }
      >
        {detailBooking && (
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between rounded-xl border border-stone-200 dark:border-stone-800 p-3">
              <div>
                <p className="text-[10px] font-bold uppercase text-stone-500">Property &amp; Unit</p>
                <p className="mt-0.5 font-semibold text-stone-900 dark:text-stone-100">
                  {detailBooking.unit_name} · {detailBooking.villa_name}
                </p>
              </div>
              <StatusBadge status={detailBooking.status} label={detailBooking.status} size="sm" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-3">
                <p className="text-[10px] font-bold uppercase text-stone-500">Check-in</p>
                <p className="mt-0.5 font-semibold text-stone-900 dark:text-stone-100">
                  {villaDateWithTime(detailBooking.check_in, detailBooking.check_in_time)}
                </p>
                {detailBooking.actual_check_in_at && (
                  <p className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                    Actual: {villaDateTime(detailBooking.actual_check_in_at)}
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-3">
                <p className="text-[10px] font-bold uppercase text-stone-500">Check-out</p>
                <p className="mt-0.5 font-semibold text-stone-900 dark:text-stone-100">
                  {villaDateWithTime(detailBooking.check_out, detailBooking.check_out_time)}
                </p>
                {detailBooking.actual_check_out_at && (
                  <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                    Actual: {villaDateTime(detailBooking.actual_check_out_at)}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-stone-500">Guests:</span>
                <span className="font-semibold">
                  {detailBooking.guests} ({diffNights(detailBooking.check_in, detailBooking.check_out)} nights)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Late Checkout Grace / Fee:</span>
                <span className="font-semibold">
                  {detailBooking.late_checkout_grace_minutes ?? 30} min ·{" "}
                  {detailBooking.late_checkout_fee !== null && detailBooking.late_checkout_fee !== undefined
                    ? villaMoney(detailBooking.late_checkout_fee)
                    : "Not configured"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Invoice Total / Balance:</span>
                <span className="font-semibold tabular-nums">
                  {villaMoney(detailBooking.invoice_total ?? detailBooking.total_amount)} · Bal{" "}
                  {villaMoney(detailBooking.invoice_balance_due)}
                </span>
              </div>
            </div>

            {detailBooking.notes && (
              <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-3">
                <p className="text-[10px] font-bold uppercase text-stone-500">Notes</p>
                <p className="mt-0.5 text-stone-700 dark:text-stone-300">{detailBooking.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <DeleteConfirm
        isOpen={Boolean(deleteTarget)}
        onClose={() => !deleteLoading && setDeleteTarget(null)}
        onConfirm={handleDeleteBooking}
        title="Delete Stay Booking"
        recordName={deleteTarget ? `${deleteTarget.booking_number} (${deleteTarget.guest_name || deleteTarget.customer_name})` : ""}
        message="This will permanently delete this stay booking along with its linked invoice, payments, service requests, and status history. This action cannot be undone."
        confirmButtonText="Delete Stay"
        loading={deleteLoading}
        error={deleteError}
      />

      <Modal
        isOpen={bulkDeleteOpen}
        onClose={() => !bulkDeleting && setBulkDeleteOpen(false)}
        title={`Delete ${selectedBookingIds.size} Selected Stay${selectedBookingIds.size !== 1 ? "s" : ""}`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={BUTTON_VARIANTS.secondary}
              disabled={bulkDeleting}
              onClick={() => setBulkDeleteOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 cursor-pointer"
              disabled={bulkDeleting}
              onClick={handleBulkDeleteBookings}
            >
              {bulkDeleting ? "Deleting..." : "Confirm Delete"}
            </button>
          </div>
        }
      >
        <p className="mb-3 text-sm text-[#64748B] dark:text-[#8A9AB2]">
          All selected stays and their linked invoices, payments, service requests, and status history will be permanently removed.
        </p>
        <ul className="max-h-48 overflow-y-auto divide-y divide-[#E5E9F0] dark:divide-[#1E293B] rounded-xl border border-[#E5E9F0] dark:border-[#1E293B]">
          {Array.from(selectedBookingIds).map((id) => {
            const bk = bookings.find((b) => b.id === id);
            return (
              <li key={id} className="px-3 py-2 text-sm">
                {bk ? `${bk.booking_number} · ${bk.guest_name || bk.customer_name}` : `#${id}`}
              </li>
            );
          })}
        </ul>
      </Modal>
    </div>
  );
}
