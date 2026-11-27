import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarCheck2,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Footprints,
  History,
  Search,
  ShieldAlert,
  Trash2,
  UserPlus,
  Users,
  XCircle,
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
import { validateEmailAddress, validateMobileNumber } from "../../utils/validation";
import VillaDataTable from "../villas/VillaDataTable";
import {
  actDate,
  actDateTime,
  actError,
  activitiesApi,
  actMoney,
  actTime,
  bookingTypeLabel,
  kolkataTodayIso,
} from "./activitiesApi";

const BOOKING_STATUSES = ["Pending", "Confirmed", "Completed", "Cancelled", "No Show"];

const INITIAL_CUSTOMER_FORM = {
  full_name: "",
  phone: "",
  email: "",
  address: "",
};

export default function ActivityBookings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showSuccess, showError } = useNotification();

  const preActivityId = searchParams.get("activityId") || "";
  const preSessionId = searchParams.get("sessionId") || "";

  const [tab, setTab] = useState("bookings"); // bookings | walkin
  const [bookings, setBookings] = useState([]);
  const [usageLogs, setUsageLogs] = useState([]);
  const [activitiesList, setActivitiesList] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  // Filters
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [typeFilter, setTypeFilter] = useState("");
  const [activityFilter, setActivityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 15;

  // Create Booking / Walk-in Modal
  const [createOpen, setCreateOpen] = useState(
    Boolean(searchParams.get("new") || preActivityId || preSessionId)
  );
  const [selectedActivityId, setSelectedActivityId] = useState(preActivityId);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [availableSessions, setAvailableSessions] = useState([]);

  // Session & Time-Slot booking state
  const [bookingForm, setBookingForm] = useState({
    customer_id: "",
    session_id: preSessionId,
    resource_id: "",
    booking_date: kolkataTodayIso(0),
    slot_date: kolkataTodayIso(0),
    slot_start_time: "10:00",
    slot_end_time: "11:00",
    participant_count: 1,
    pricing_method: "per_person",
    notes: "",
  });
  const [participants, setParticipants] = useState([]);
  const [availabilityResult, setAvailabilityResult] = useState(null);
  const [checkingAvail, setCheckingAvail] = useState(false);

  // Walk-in log state
  const [walkInForm, setWalkInForm] = useState({
    customer_id: "",
    usage_date: kolkataTodayIso(0),
    usage_time: "10:00",
    participant_count: 1,
    amount_charged: "",
    notes: "",
  });

  const [createError, setCreateError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Quick Inline Customer Creation Modal
  const [custOpen, setCustOpen] = useState(false);
  const [custForm, setCustForm] = useState(INITIAL_CUSTOMER_FORM);
  const [custError, setCustError] = useState("");
  const [savingCust, setSavingCust] = useState(false);

  // Booking Detail Modal
  const [detailBooking, setDetailBooking] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Cancel Reason Modal
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Selection & Clear/Delete Modals
  const [selectedBookingIds, setSelectedBookingIds] = useState(() => new Set());
  const [selectedLogIds, setSelectedLogIds] = useState(() => new Set());
  const [deleteBookingTarget, setDeleteBookingTarget] = useState(null);
  const [deletingBooking, setDeletingBooking] = useState(false);
  const [deleteLogTarget, setDeleteLogTarget] = useState(null);
  const [deletingLog, setDeletingLog] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkFailures, setBulkFailures] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const [bkRes, logRes, actRes, custRes] = await Promise.all([
        activitiesApi.bookings({
          search: searchQuery.trim() || undefined,
          status: statusFilter || undefined,
          booking_type: typeFilter || undefined,
          activity_id: activityFilter || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          page,
          page_size: pageSize,
        }),
        activitiesApi.usageLogs({
          activity_id: activityFilter || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          page: tab === "walkin" ? page : 1,
          page_size: pageSize,
        }),
        activitiesApi.list({ status: "Active", page: 1, page_size: 100 }),
        activitiesApi.customers({ page: 1, page_size: 100 }),
      ]);

      setBookings(bkRes.data?.items || []);
      setUsageLogs(logRes.data?.items || []);
      if (tab === "walkin") {
        setTotalRecords(logRes.data?.total ?? 0);
        setTotalPages(logRes.data?.total_pages ?? 1);
      } else {
        setTotalRecords(bkRes.data?.total ?? 0);
        setTotalPages(bkRes.data?.total_pages ?? 1);
      }
      setActivitiesList(actRes.data?.items || []);
      setCustomers(custRes.data?.items || []);
    } catch (err) {
      setPageError(actError(err));
    } finally {
      setLoading(false);
    }
  }, [tab, searchQuery, statusFilter, typeFilter, activityFilter, dateFrom, dateTo, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [tab, searchQuery, statusFilter, typeFilter, activityFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (searchParams.get("new")) {
      setCreateOpen(true);
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Load selected activity detail + sessions/resources whenever activity changes in Create Modal
  useEffect(() => {
    if (!createOpen || !selectedActivityId) {
      setSelectedActivity(null);
      setAvailableSessions([]);
      setAvailabilityResult(null);
      return;
    }
    let active = true;
    (async () => {
      try {
        const res = await activitiesApi.detail(selectedActivityId);
        if (!active) return;
        const act = res.data;
        setSelectedActivity(act);

        const defaultPm = act.is_complimentary
          ? "complimentary"
          : act.price_per_person != null
            ? "per_person"
            : "per_group";

        setBookingForm((prev) => ({
          ...prev,
          pricing_method: defaultPm,
          participant_count: Math.max(1, act.min_participants || 1),
          resource_id:
            act.booking_type === "time_slot" && act.resources?.length
              ? String(act.resources.find((r) => r.is_active)?.id || act.resources[0].id)
              : "",
          session_id: preSessionId || "",
        }));

        if (act.booking_type === "walk_in") {
          const defaultAmt = act.is_complimentary
            ? "0.00"
            : act.price_per_person != null
              ? String(Number(act.price_per_person) * Math.max(1, act.min_participants || 1))
              : String(act.price_per_group || 0);
          setWalkInForm((prev) => ({
            ...prev,
            participant_count: Math.max(1, act.min_participants || 1),
            amount_charged: defaultAmt,
          }));
        }

        if (act.booking_type === "session") {
          const sessRes = await activitiesApi.sessions({
            activity_id: act.id,
            date_from: kolkataTodayIso(0),
            page: 1,
            page_size: 50,
          });
          if (!active) return;
          const valid = (sessRes.data?.items || []).filter((s) =>
            ["Scheduled", "In Progress"].includes(s.status)
          );
          setAvailableSessions(valid);
        }
      } catch (err) {
        if (active) setCreateError(actError(err));
      }
    })();
    return () => {
      active = false;
    };
  }, [createOpen, selectedActivityId, preSessionId]);

  // Sync participant detail rows when participant_count changes
  useEffect(() => {
    const count = Math.max(1, Number(bookingForm.participant_count || 1));
    setParticipants((prev) => {
      const next = [];
      for (let i = 0; i < count; i += 1) {
        next.push(
          prev[i] || {
            participant_name: "",
            age: "",
            waiver_signed: selectedActivity ? !selectedActivity.requires_waiver : false,
          }
        );
      }
      return next;
    });
  }, [bookingForm.participant_count, selectedActivity]);

  const handleCheckAvailability = async () => {
    if (!bookingForm.resource_id || !bookingForm.slot_date || !bookingForm.slot_start_time || !bookingForm.slot_end_time) {
      setCreateError("Select resource, date, start time, and end time first.");
      return;
    }
    setCheckingAvail(true);
    setCreateError("");
    try {
      const res = await activitiesApi.resourceAvailability(bookingForm.resource_id, {
        slot_date: bookingForm.slot_date,
        start_time: bookingForm.slot_start_time,
        end_time: bookingForm.slot_end_time,
      });
      setAvailabilityResult(res.data);
    } catch (err) {
      setCreateError(actError(err));
    } finally {
      setCheckingAvail(false);
    }
  };

  const estimatedTotal = () => {
    if (!selectedActivity) return 0;
    if (selectedActivity.is_complimentary || bookingForm.pricing_method === "complimentary") return 0;
    if (bookingForm.pricing_method === "per_group" && selectedActivity.price_per_group != null) {
      return Number(selectedActivity.price_per_group);
    }
    return Number(selectedActivity.price_per_person || 0) * Number(bookingForm.participant_count || 1);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!selectedActivity) {
      setCreateError("Select an activity first.");
      return;
    }
    setCreateError("");
    setSubmitting(true);
    try {
      if (selectedActivity.booking_type === "walk_in") {
        await activitiesApi.createUsageLog({
          activity_id: selectedActivity.id,
          customer_id: walkInForm.customer_id ? Number(walkInForm.customer_id) : null,
          usage_date: walkInForm.usage_date,
          usage_time: walkInForm.usage_time || null,
          participant_count: Number(walkInForm.participant_count || 1),
          amount_charged: Number(walkInForm.amount_charged || 0),
          notes: walkInForm.notes.trim() || null,
        });
        showSuccess(`Walk-in usage logged for "${selectedActivity.name}".`);
        setCreateOpen(false);
        setTab("walkin");
        await loadData();
        return;
      }

      if (!bookingForm.customer_id) {
        setCreateError("Please select a customer.");
        setSubmitting(false);
        return;
      }

      const cleanParticipants = participants
        .filter((p) => p.participant_name.trim())
        .map((p) => ({
          participant_name: p.participant_name.trim(),
          age: p.age !== "" ? Number(p.age) : null,
          waiver_signed: Boolean(p.waiver_signed),
        }));

      const payload = {
        activity_id: selectedActivity.id,
        customer_id: Number(bookingForm.customer_id),
        booking_date:
          selectedActivity.booking_type === "time_slot"
            ? bookingForm.slot_date
            : bookingForm.booking_date,
        participant_count: Number(bookingForm.participant_count || 1),
        pricing_method: bookingForm.pricing_method,
        notes: bookingForm.notes.trim() || null,
        participants: cleanParticipants,
      };

      if (selectedActivity.booking_type === "session") {
        if (!bookingForm.session_id) {
          setCreateError("Select a scheduled session.");
          setSubmitting(false);
          return;
        }
        payload.session_id = Number(bookingForm.session_id);
      } else if (selectedActivity.booking_type === "time_slot") {
        if (!bookingForm.resource_id) {
          setCreateError("Select a bookable resource.");
          setSubmitting(false);
          return;
        }
        payload.resource_id = Number(bookingForm.resource_id);
        payload.slot_date = bookingForm.slot_date;
        payload.slot_start_time = bookingForm.slot_start_time;
        payload.slot_end_time = bookingForm.slot_end_time;
      }

      const res = await activitiesApi.createBooking(payload);
      showSuccess(`Booking ${res.data.booking_number} created.`);
      setCreateOpen(false);
      setTab("bookings");
      await loadData();
    } catch (err) {
      setCreateError(actError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickCustomerSave = async (e) => {
    e.preventDefault();
    setCustError("");
    if (custForm.full_name.trim().length < 2) {
      setCustError("Full name must be at least 2 characters.");
      return;
    }
    const phoneCheck = validateMobileNumber(custForm.phone, { required: true });
    if (!phoneCheck.valid) {
      setCustError(phoneCheck.error);
      return;
    }
    const emailCheck = validateEmailAddress(custForm.email, { required: true });
    if (!emailCheck.valid) {
      setCustError(emailCheck.error);
      return;
    }
    setSavingCust(true);
    try {
      const res = await activitiesApi.createCustomer({
        full_name: custForm.full_name.trim(),
        phone: phoneCheck.normalized,
        email: emailCheck.normalized,
        address: custForm.address.trim() || null,
      });
      const listRes = await activitiesApi.customers({ page: 1, page_size: 100 });
      setCustomers(listRes.data?.items || []);
      setBookingForm((prev) => ({ ...prev, customer_id: String(res.data.id) }));
      setWalkInForm((prev) => ({ ...prev, customer_id: String(res.data.id) }));
      setCustOpen(false);
      setCustForm(INITIAL_CUSTOMER_FORM);
      showSuccess("Customer registered and selected.");
    } catch (err) {
      setCustError(actError(err));
    } finally {
      setSavingCust(false);
    }
  };

  const openDetail = async (id) => {
    setDetailLoading(true);
    try {
      const res = await activitiesApi.bookingDetail(id);
      setDetailBooking(res.data);
    } catch (err) {
      showError(actError(err));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleStatusTransition = async (bookingId, nextStatus, reason = null) => {
    try {
      await activitiesApi.bookingStatus(bookingId, nextStatus, reason);
      showSuccess(`Booking updated to ${nextStatus}.`);
      await loadData();
      if (detailBooking?.id === bookingId) {
        await openDetail(bookingId);
      }
    } catch (err) {
      showError(actError(err));
    }
  };

  const handleConfirmCancel = async (e) => {
    e.preventDefault();
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await handleStatusTransition(
        cancelTarget.id,
        "Cancelled",
        cancelReason.trim() || "Cancelled by operator"
      );
      setCancelTarget(null);
      setCancelReason("");
    } finally {
      setCancelling(false);
    }
  };

  const handleToggleParticipantWaiver = async (p) => {
    try {
      await activitiesApi.updateParticipant(p.id, { waiver_signed: !p.waiver_signed });
      showSuccess("Waiver status updated.");
      if (detailBooking) await openDetail(detailBooking.id);
    } catch (err) {
      showError(actError(err));
    }
  };

  const toggleIdInSet = (setter, id) => {
    setBulkFailures([]);
    setter((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllIdsInSet = (setter, ids) => {
    setBulkFailures([]);
    setter((prev) => {
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

  const handleConfirmDeleteBooking = async () => {
    if (!deleteBookingTarget) return;
    setDeletingBooking(true);
    try {
      const res = await activitiesApi.deleteBooking(deleteBookingTarget.id);
      showSuccess(res.data?.message || `Booking ${deleteBookingTarget.booking_number} cleared.`);
      if (detailBooking?.id === deleteBookingTarget.id) setDetailBooking(null);
      setDeleteBookingTarget(null);
      setSelectedBookingIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteBookingTarget.id);
        return next;
      });
      await loadData();
    } catch (err) {
      showError(actError(err));
    } finally {
      setDeletingBooking(false);
    }
  };

  const handleConfirmDeleteLog = async () => {
    if (!deleteLogTarget) return;
    setDeletingLog(true);
    try {
      const res = await activitiesApi.deleteUsageLog(deleteLogTarget.id);
      showSuccess(res.data?.message || "Walk-in usage log cleared.");
      setDeleteLogTarget(null);
      setSelectedLogIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteLogTarget.id);
        return next;
      });
      await loadData();
    } catch (err) {
      showError(actError(err));
    } finally {
      setDeletingLog(false);
    }
  };

  const handleConfirmBulkDelete = async () => {
    const isWalkIn = tab === "walkin";
    const ids = Array.from(isWalkIn ? selectedLogIds : selectedBookingIds);
    if (!ids.length) return;
    setBulkDeleting(true);
    setBulkFailures([]);
    try {
      const res = isWalkIn
        ? await activitiesApi.bulkDeleteUsageLogs(ids)
        : await activitiesApi.bulkDeleteBookings(ids);
      const { deleted = 0, failed = [], message } = res.data || {};
      setBulkFailures(failed);
      if (isWalkIn) {
        setSelectedLogIds(new Set(failed.map((f) => f.id)));
      } else {
        setSelectedBookingIds(new Set(failed.map((f) => f.id)));
      }
      setBulkDeleteOpen(false);
      await loadData();
      if (deleted > 0) showSuccess(message || `Cleared ${deleted} record(s).`);
      if (failed.length > 0) showError(`${failed.length} record(s) could not be cleared.`);
    } catch (err) {
      showError(actError(err));
    } finally {
      setBulkDeleting(false);
    }
  };

  const bookingColumns = [
    {
      key: "booking_number",
      label: "Booking #",
      cellClassName: "whitespace-nowrap font-mono font-bold",
    },
    {
      key: "customer",
      label: "Customer",
      render: (b) => (
        <div>
          <div className="font-semibold">{b.customer_name}</div>
          <div className="text-xs text-stone-500">{b.customer_phone || "—"}</div>
          {b.customer_email && (
            <div className="text-[11px] text-stone-400 truncate max-w-[180px]">{b.customer_email}</div>
          )}
        </div>
      ),
    },
    {
      key: "activity",
      label: "Activity & Type",
      render: (b) => (
        <div className="space-y-0.5">
          <div className="font-semibold">{b.activity_name}</div>
          <div className="flex items-center gap-1.5 text-xs text-stone-500">
            <StatusBadge status={b.booking_type} label={bookingTypeLabel(b.booking_type)} size="sm" />
            {b.resource_name && <span>· {b.resource_name}</span>}
          </div>
        </div>
      ),
    },
    {
      key: "schedule",
      label: "Schedule / Slot",
      cellClassName: "whitespace-nowrap",
      render: (b) => {
        if (b.booking_type === "time_slot") {
          return (
            <div>
              <div className="font-medium">{actDate(b.slot_date)}</div>
              <div className="text-xs text-stone-500 tabular-nums">
                {actTime(b.slot_start_time)} – {actTime(b.slot_end_time)}
              </div>
            </div>
          );
        }
        return (
          <div>
            <div className="font-medium">{actDate(b.session_date || b.booking_date)}</div>
            {b.session_start_time && (
              <div className="text-xs text-stone-500 tabular-nums">
                {actTime(b.session_start_time)} {b.session_end_time ? `– ${actTime(b.session_end_time)}` : ""}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "participant_count",
      label: "Party",
      align: "right",
      cellClassName: "tabular-nums font-semibold",
    },
    {
      key: "total_amount",
      label: "Amount",
      align: "right",
      cellClassName: "whitespace-nowrap font-semibold tabular-nums",
      render: (b) => (
        <div>
          <div>{actMoney(b.total_amount)}</div>
          <div className="text-[11px] text-stone-500">{b.payment_status || "Unbilled"}</div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      align: "center",
      render: (b) => <StatusBadge status={b.status} size="sm" />,
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      cellClassName: "whitespace-nowrap",
      render: (b) => (
        <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => openDetail(b.id)}
            title="View Booking Details"
            className="rounded-lg p-1.5 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/30 cursor-pointer"
          >
            <Eye size={15} />
          </button>
          {b.status === "Pending" && (
            <button
              type="button"
              onClick={() => handleStatusTransition(b.id, "Confirmed")}
              title="Confirm Booking"
              className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer"
            >
              <CheckCircle2 size={15} />
            </button>
          )}
          {["Pending", "Confirmed"].includes(b.status) && (
            <button
              type="button"
              onClick={() => {
                setCancelTarget(b);
                setCancelReason("");
              }}
              title="Cancel Booking"
              className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer"
            >
              <XCircle size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setDeleteBookingTarget(b)}
            title="Delete / Clear Booking"
            className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  const walkInColumns = [
    {
      key: "usage_date",
      label: "Date & Time",
      cellClassName: "whitespace-nowrap",
      render: (l) => (
        <div>
          <div className="font-semibold">{actDate(l.usage_date)}</div>
          {l.usage_time && <div className="text-xs text-stone-500">{actTime(l.usage_time)}</div>}
        </div>
      ),
    },
    { key: "activity_name", label: "Walk-In Activity", cellClassName: "font-semibold" },
    {
      key: "customer_name",
      label: "Guest",
      render: (l) => l.customer_name || <span className="text-stone-400">Anonymous Walk-In</span>,
    },
    { key: "participant_count", label: "Participants", align: "right", cellClassName: "tabular-nums font-semibold" },
    {
      key: "amount_charged",
      label: "Charge",
      align: "right",
      cellClassName: "tabular-nums font-semibold",
      render: (l) => (Number(l.amount_charged || 0) === 0 ? "Complimentary" : actMoney(l.amount_charged)),
    },
    { key: "notes", label: "Notes", render: (l) => l.notes || "—" },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      cellClassName: "whitespace-nowrap",
      render: (l) => (
        <button
          type="button"
          onClick={() => setDeleteLogTarget(l)}
          title="Delete / Clear Walk-In Log"
          className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
        >
          <Trash2 size={15} />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bookings & Walk-In Operations"
        description="Dedicated workflows for Time Slot resource reservations, Scheduled Session bookings, and Walk-In usage logs."
        actions={
          <button
            type="button"
            onClick={() => {
              setCreateError("");
              setCreateOpen(true);
            }}
            className={BUTTON_VARIANTS.primary}
          >
            <CalendarPlus size={15} />
            <span>New Booking / Walk-In Log</span>
          </button>
        }
      />

      {pageError && (
        <AlertBanner variant="error" message={pageError} onDismiss={() => setPageError("")} />
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-fit max-w-full">
        <StatCard compact className="!p-2.5" title="Bookings Loaded" value={loading ? "—" : bookings.length} icon={CalendarCheck2} color="amber" />
        <StatCard
          compact
          className="!p-2.5"
          title="Confirmed / Pending"
          value={loading ? "—" : bookings.filter((b) => ["Pending", "Confirmed"].includes(b.status)).length}
          icon={Clock}
          color="sky"
        />
        <StatCard compact className="!p-2.5" title="Walk-In Entries" value={loading ? "—" : usageLogs.length} icon={Footprints} color="emerald" />
        <StatCard
          compact
          className="!p-2.5"
          title="Booking Value (Page)"
          value={loading ? "—" : actMoney(bookings.reduce((s, b) => s + Number(b.total_amount || 0), 0))}
          icon={Users}
          color="indigo"
        />
      </div>

      {/* MODE TABS + FILTERS */}
      <div className={`${CARD_STYLES.base} !p-2.5 space-y-2.5`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#151D29] p-0.5">
            <button
              type="button"
              onClick={() => setTab("bookings")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                tab === "bookings" ? "bg-amber-500 text-[#0D1420] font-bold" : "text-stone-600 dark:text-[#8A9AB2]"
              }`}
            >
              Time Slot &amp; Session Bookings
            </button>
            <button
              type="button"
              onClick={() => setTab("walkin")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                tab === "walkin" ? "bg-amber-500 text-[#0D1420] font-bold" : "text-stone-600 dark:text-[#8A9AB2]"
              }`}
            >
              Walk-In Usage Logs
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tab === "bookings" && (
            <div className="relative w-full sm:w-52">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Booking #, customer, phone..."
                className={`${INPUT_STYLES.base} w-full pl-9 !py-1.5 text-xs`}
              />
            </div>
          )}
          <select
            value={activityFilter}
            onChange={(e) => setActivityFilter(e.target.value)}
            className={`${INPUT_STYLES.select} w-full sm:!w-auto min-w-[150px] !py-1.5 text-xs`}
          >
            <option value="">All Activities</option>
            {activitiesList.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          {tab === "bookings" && (
            <>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className={`${INPUT_STYLES.select} w-full sm:!w-auto min-w-[130px] !py-1.5 text-xs`}
              >
                <option value="">All Booking Types</option>
                <option value="time_slot">Time Slot</option>
                <option value="session">Session</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`${INPUT_STYLES.select} w-full sm:!w-auto min-w-[125px] !py-1.5 text-xs`}
              >
                <option value="">All Statuses</option>
                {BOOKING_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </>
          )}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={`${INPUT_STYLES.base} w-full sm:!w-auto !py-1.5 text-xs`}
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={`${INPUT_STYLES.base} w-full sm:!w-auto !py-1.5 text-xs`}
          />
        </div>
      </div>

      <BulkSelectionBar
        count={tab === "walkin" ? selectedLogIds.size : selectedBookingIds.size}
        onClear={() => (tab === "walkin" ? setSelectedLogIds(new Set()) : setSelectedBookingIds(new Set()))}
        onDelete={() => setBulkDeleteOpen(true)}
        deleting={bulkDeleting}
      />

      {bulkFailures.length > 0 && (
        <AlertBanner
          variant="warning"
          title="Some records could not be cleared"
          message={bulkFailures.map((f) => `${f.name}: ${f.reason}`).join(" | ")}
          onDismiss={() => setBulkFailures([])}
        />
      )}

      {tab === "bookings" ? (
        <VillaDataTable
          title="Activity Bookings"
          columns={bookingColumns}
          rows={bookings}
          loading={loading}
          emptyTitle="No activity bookings found"
          tableMinWidth="min-w-[960px]"
          onRowClick={(b) => openDetail(b.id)}
          selectedIds={selectedBookingIds}
          onSelectRow={(id) => toggleIdInSet(setSelectedBookingIds, id)}
          onSelectAll={(ids) => toggleAllIdsInSet(setSelectedBookingIds, ids)}
          pagination={{
            currentPage: page,
            totalPages,
            totalRecords,
            pageSize,
            onPageChange: setPage,
          }}
        />
      ) : (
        <VillaDataTable
          title="Walk-In Usage Logs"
          subtitle="Drop-in activity entries without advance session reservation"
          columns={walkInColumns}
          rows={usageLogs}
          loading={loading}
          emptyTitle="No walk-in usage entries recorded"
          tableMinWidth="min-w-[780px]"
          selectedIds={selectedLogIds}
          onSelectRow={(id) => toggleIdInSet(setSelectedLogIds, id)}
          onSelectAll={(ids) => toggleAllIdsInSet(setSelectedLogIds, ids)}
          pagination={{
            currentPage: page,
            totalPages,
            totalRecords,
            pageSize,
            onPageChange: setPage,
          }}
        />
      )}

      {/* CREATE BOOKING / WALK-IN USAGE MODAL */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title={
          selectedActivity?.booking_type === "walk_in"
            ? `Record Walk-In Usage — ${selectedActivity.name}`
            : "New Activity Booking"
        }
        size="lg"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {createError && <AlertBanner variant="error" message={createError} />}

          {/* STEP 1: SELECT ACTIVITY */}
          <div className="rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#151D29] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label className="text-xs font-bold text-stone-700 dark:text-stone-300">
                1. Select Activity *
              </label>
              {selectedActivity && (
                <StatusBadge
                  status={selectedActivity.booking_type}
                  label={bookingTypeLabel(selectedActivity.booking_type)}
                  size="sm"
                />
              )}
            </div>
            <select
              required
              value={selectedActivityId}
              onChange={(e) => setSelectedActivityId(e.target.value)}
              className={INPUT_STYLES.select}
            >
              <option value="">Choose an active activity...</option>
              {activitiesList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} [{bookingTypeLabel(a.booking_type)}] · {a.category}
                </option>
              ))}
            </select>
            {selectedActivity && (
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-stone-500">
                <span>Duration: {selectedActivity.duration_minutes} mins</span>
                <span>Party: {selectedActivity.min_participants}–{selectedActivity.max_participants}</span>
                {selectedActivity.min_age != null && <span>Min Age: {selectedActivity.min_age}</span>}
                {selectedActivity.max_age != null && <span>Max Age: {selectedActivity.max_age}</span>}
                {selectedActivity.requires_waiver && (
                  <span className="font-semibold text-amber-600 flex items-center gap-1">
                    <ShieldAlert size={12} /> Waiver Required
                  </span>
                )}
              </div>
            )}
          </div>

          {/* WORKFLOW C: WALK-IN */}
          {selectedActivity?.booking_type === "walk_in" && (
            <div className="space-y-3 rounded-xl border border-emerald-200 dark:border-emerald-900/50 p-3">
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                <Footprints size={14} />
                Walk-In Quick Usage Entry (No Advance Booking Required)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold">Customer (Optional)</label>
                  <div className="flex gap-1.5">
                    <select
                      value={walkInForm.customer_id}
                      onChange={(e) => setWalkInForm({ ...walkInForm, customer_id: e.target.value })}
                      className={INPUT_STYLES.select}
                    >
                      <option value="">Anonymous Walk-In Guest</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.full_name} ({c.phone})</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setCustOpen(true)}
                      className={BUTTON_VARIANTS.secondary}
                      title="Register New Customer"
                    >
                      <UserPlus size={14} />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold">Usage Date *</label>
                  <input
                    type="date"
                    required
                    value={walkInForm.usage_date}
                    onChange={(e) => setWalkInForm({ ...walkInForm, usage_date: e.target.value })}
                    className={INPUT_STYLES.base}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold">Start Time</label>
                  <input
                    type="time"
                    value={walkInForm.usage_time}
                    onChange={(e) => setWalkInForm({ ...walkInForm, usage_time: e.target.value })}
                    className={INPUT_STYLES.base}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold">Participants *</label>
                  <input
                    type="number"
                    min={1}
                    max={selectedActivity.max_participants}
                    required
                    value={walkInForm.participant_count}
                    onChange={(e) => {
                      const cnt = Number(e.target.value || 1);
                      const autoAmt = selectedActivity.is_complimentary
                        ? "0.00"
                        : selectedActivity.price_per_person != null
                          ? String(Number(selectedActivity.price_per_person) * cnt)
                          : String(selectedActivity.price_per_group || 0);
                      setWalkInForm({ ...walkInForm, participant_count: e.target.value, amount_charged: autoAmt });
                    }}
                    className={INPUT_STYLES.base}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold">Fee Charged (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={selectedActivity.is_complimentary}
                    value={walkInForm.amount_charged}
                    onChange={(e) => setWalkInForm({ ...walkInForm, amount_charged: e.target.value })}
                    className={INPUT_STYLES.base}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold">Notes</label>
                  <input
                    type="text"
                    value={walkInForm.notes}
                    onChange={(e) => setWalkInForm({ ...walkInForm, notes: e.target.value })}
                    placeholder="Equipment issued / notes"
                    className={INPUT_STYLES.base}
                  />
                </div>
              </div>
            </div>
          )}

          {/* WORKFLOWS A & B: TIME_SLOT & SESSION */}
          {selectedActivity && selectedActivity.booking_type !== "walk_in" && (
            <>
              {/* TIME SLOT SPECIFIC */}
              {selectedActivity.booking_type === "time_slot" && (
                <div className="space-y-3 rounded-xl border border-sky-200 dark:border-sky-900/50 p-3">
                  <p className="text-xs font-bold text-sky-700 dark:text-sky-300">
                    2. Resource &amp; Time Slot Reservation (Overlap-Protected)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-bold">Resource *</label>
                      <select
                        required
                        value={bookingForm.resource_id}
                        onChange={(e) => {
                          setBookingForm({ ...bookingForm, resource_id: e.target.value });
                          setAvailabilityResult(null);
                        }}
                        className={INPUT_STYLES.select}
                      >
                        <option value="">Select resource...</option>
                        {(selectedActivity.resources || [])
                          .filter((r) => r.is_active)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name} (max {r.capacity})
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold">Date *</label>
                      <input
                        type="date"
                        required
                        value={bookingForm.slot_date}
                        onChange={(e) => {
                          setBookingForm({ ...bookingForm, slot_date: e.target.value });
                          setAvailabilityResult(null);
                        }}
                        className={INPUT_STYLES.base}
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={handleCheckAvailability}
                        disabled={checkingAvail}
                        className={`${BUTTON_VARIANTS.secondary} w-full`}
                      >
                        {checkingAvail ? "Checking..." : "Check Availability"}
                      </button>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold">Start Time *</label>
                      <input
                        type="time"
                        required
                        value={bookingForm.slot_start_time}
                        onChange={(e) => {
                          setBookingForm({ ...bookingForm, slot_start_time: e.target.value });
                          setAvailabilityResult(null);
                        }}
                        className={INPUT_STYLES.base}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold">End Time *</label>
                      <input
                        type="time"
                        required
                        value={bookingForm.slot_end_time}
                        onChange={(e) => {
                          setBookingForm({ ...bookingForm, slot_end_time: e.target.value });
                          setAvailabilityResult(null);
                        }}
                        className={INPUT_STYLES.base}
                      />
                    </div>
                  </div>
                  {availabilityResult && (
                    <AlertBanner
                      variant={availabilityResult.available ? "success" : "error"}
                      title={
                        availabilityResult.available
                          ? "Resource is available for this time window"
                          : `Resource conflict with ${availabilityResult.conflict_booking_number}`
                      }
                      message={
                        availabilityResult.occupied_slots?.length
                          ? `Booked slots today: ${availabilityResult.occupied_slots
                              .map((s) => `${actTime(s.start_time)}–${actTime(s.end_time)}`)
                              .join(", ")}`
                          : "No conflicting bookings on this date."
                      }
                    />
                  )}
                </div>
              )}

              {/* SESSION SPECIFIC */}
              {selectedActivity.booking_type === "session" && (
                <div className="space-y-3 rounded-xl border border-indigo-200 dark:border-indigo-900/50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                      2. Select Scheduled Session (Live Seat Capacity)
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateOpen(false);
                        navigate("/activities/schedule?new=1");
                      }}
                      className="text-xs font-semibold text-amber-600 hover:underline cursor-pointer"
                    >
                      + Add Session
                    </button>
                  </div>
                  {availableSessions.length === 0 ? (
                    <AlertBanner
                      variant="warning"
                      title="No upcoming sessions available"
                      message="Create or generate sessions for this activity under Schedule first."
                    />
                  ) : (
                    <select
                      required
                      value={bookingForm.session_id}
                      onChange={(e) => setBookingForm({ ...bookingForm, session_id: e.target.value })}
                      className={INPUT_STYLES.select}
                    >
                      <option value="">Choose a scheduled session...</option>
                      {availableSessions.map((s) => (
                        <option key={s.id} value={s.id} disabled={s.is_full}>
                          {actDate(s.session_date)} · {actTime(s.start_time)}–{actTime(s.end_time)} ·{" "}
                          {s.is_full ? "FULL" : `${s.seats_remaining}/${s.capacity} seats left`}{" "}
                          {s.assigned_staff_name ? `· ${s.assigned_staff_name}` : "· Unassigned"}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* CUSTOMER, PRICING & PARTY */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-bold">Customer *</label>
                  <div className="flex gap-1.5">
                    <select
                      required
                      value={bookingForm.customer_id}
                      onChange={(e) => setBookingForm({ ...bookingForm, customer_id: e.target.value })}
                      className={INPUT_STYLES.select}
                    >
                      <option value="">Select customer...</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.full_name} ({c.phone})</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setCustOpen(true)}
                      className={BUTTON_VARIANTS.secondary}
                      title="Quick Register Customer"
                    >
                      <UserPlus size={15} />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold">Participants *</label>
                  <input
                    type="number"
                    min={selectedActivity.min_participants}
                    max={selectedActivity.max_participants}
                    required
                    value={bookingForm.participant_count}
                    onChange={(e) => setBookingForm({ ...bookingForm, participant_count: e.target.value })}
                    className={INPUT_STYLES.base}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold">Pricing Method *</label>
                  <select
                    value={bookingForm.pricing_method}
                    onChange={(e) => setBookingForm({ ...bookingForm, pricing_method: e.target.value })}
                    className={INPUT_STYLES.select}
                  >
                    {selectedActivity.is_complimentary && (
                      <option value="complimentary">Complimentary (₹0)</option>
                    )}
                    {selectedActivity.price_per_person != null && (
                      <option value="per_person">Per Person ({actMoney(selectedActivity.price_per_person)})</option>
                    )}
                    {selectedActivity.price_per_group != null && (
                      <option value="per_group">Per Group ({actMoney(selectedActivity.price_per_group)})</option>
                    )}
                  </select>
                </div>
              </div>

              {/* PARTICIPANTS DETAILS */}
              <div className="space-y-2 rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] p-3">
                <p className="text-xs font-bold">
                  Participant Names, Ages &amp; Waivers (Optional — defaults to primary guest)
                </p>
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {participants.map((p, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        value={p.participant_name}
                        onChange={(e) =>
                          setParticipants((prev) =>
                            prev.map((row, rIdx) =>
                              rIdx === idx ? { ...row, participant_name: e.target.value } : row
                            )
                          )
                        }
                        placeholder={`Participant ${idx + 1} full name`}
                        className={`${INPUT_STYLES.base} col-span-6 !py-1.5 text-xs`}
                      />
                      <input
                        type="number"
                        min={0}
                        max={120}
                        value={p.age}
                        onChange={(e) =>
                          setParticipants((prev) =>
                            prev.map((row, rIdx) =>
                              rIdx === idx ? { ...row, age: e.target.value } : row
                            )
                          )
                        }
                        placeholder="Age"
                        className={`${INPUT_STYLES.base} col-span-2 !py-1.5 text-xs`}
                      />
                      <label className="col-span-4 flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={p.waiver_signed}
                          onChange={(e) =>
                            setParticipants((prev) =>
                              prev.map((row, rIdx) =>
                                rIdx === idx ? { ...row, waiver_signed: e.target.checked } : row
                              )
                            )
                          }
                          className="h-4 w-4 accent-amber-500"
                        />
                        <span>Waiver Signed</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50/70 dark:bg-[#30251C] border border-amber-200 dark:border-amber-900/50 px-4 py-2.5">
                <span className="text-xs font-semibold">Calculated Total (Price Snapshot)</span>
                <span className="text-lg font-extrabold tabular-nums">
                  {actMoney(estimatedTotal())}
                </span>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E9F0] dark:border-[#1E293B]">
            <button type="button" onClick={() => setCreateOpen(false)} className={BUTTON_VARIANTS.secondary}>
              Cancel
            </button>
            <button type="submit" disabled={submitting || !selectedActivity} className={BUTTON_VARIANTS.primary}>
              {submitting
                ? "Submitting..."
                : selectedActivity?.booking_type === "walk_in"
                  ? "Record Walk-In Entry"
                  : "Confirm Booking"}
            </button>
          </div>
        </form>
      </Modal>

      {/* INLINE REGISTER CUSTOMER MODAL */}
      <Modal
        isOpen={custOpen}
        onClose={() => setCustOpen(false)}
        title="Quick Register Customer"
        size="sm"
      >
        <form onSubmit={handleQuickCustomerSave} className="space-y-3">
          {custError && <AlertBanner variant="error" message={custError} />}
          <input
            type="text"
            required
            placeholder="Full Name *"
            value={custForm.full_name}
            onChange={(e) => setCustForm({ ...custForm, full_name: e.target.value })}
            className={INPUT_STYLES.base}
          />
          <input
            type="tel"
            required
            placeholder="10-digit Mobile Number *"
            value={custForm.phone}
            onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })}
            className={INPUT_STYLES.base}
          />
          <input
            type="email"
            required
            placeholder="Email *"
            value={custForm.email}
            onChange={(e) => setCustForm({ ...custForm, email: e.target.value })}
            className={INPUT_STYLES.base}
          />
          <input
            type="text"
            placeholder="Address (optional)"
            value={custForm.address}
            onChange={(e) => setCustForm({ ...custForm, address: e.target.value })}
            className={INPUT_STYLES.base}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCustOpen(false)} className={BUTTON_VARIANTS.secondary}>Cancel</button>
            <button type="submit" disabled={savingCust} className={BUTTON_VARIANTS.primary}>
              {savingCust ? "Saving..." : "Save & Select"}
            </button>
          </div>
        </form>
      </Modal>

      {/* BOOKING DETAIL & HISTORY MODAL */}
      <Modal
        isOpen={Boolean(detailBooking)}
        onClose={() => setDetailBooking(null)}
        title={detailBooking ? `Booking ${detailBooking.booking_number}` : "Booking Details"}
        size="lg"
      >
        {detailLoading || !detailBooking ? (
          <p className="py-8 text-center text-sm text-stone-500">Loading booking details...</p>
        ) : (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E9F0] dark:border-[#1E293B] pb-3">
              <div>
                <h3 className="text-base font-bold">{detailBooking.activity_name}</h3>
                <p className="text-stone-500">
                  {detailBooking.customer_name} · {detailBooking.customer_phone}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={detailBooking.booking_type} label={bookingTypeLabel(detailBooking.booking_type)} size="sm" />
                <StatusBadge status={detailBooking.status} size="sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-xl bg-stone-50 dark:bg-[#151D29] p-2.5">
                <span className="text-[10px] uppercase text-stone-500 font-bold">Date</span>
                <p className="mt-0.5 font-semibold">
                  {actDate(detailBooking.slot_date || detailBooking.session_date || detailBooking.booking_date)}
                </p>
              </div>
              <div className="rounded-xl bg-stone-50 dark:bg-[#151D29] p-2.5">
                <span className="text-[10px] uppercase text-stone-500 font-bold">
                  {detailBooking.booking_type === "time_slot" ? "Resource / Slot" : "Session Time"}
                </span>
                <p className="mt-0.5 font-semibold">
                  {detailBooking.resource_name || actTime(detailBooking.session_start_time) || "—"}
                </p>
              </div>
              <div className="rounded-xl bg-stone-50 dark:bg-[#151D29] p-2.5">
                <span className="text-[10px] uppercase text-stone-500 font-bold">Participants</span>
                <p className="mt-0.5 font-semibold">{detailBooking.participant_count}</p>
              </div>
              <div className="rounded-xl bg-stone-50 dark:bg-[#151D29] p-2.5">
                <span className="text-[10px] uppercase text-stone-500 font-bold">Total Snapshot</span>
                <p className="mt-0.5 font-bold text-sm">{actMoney(detailBooking.total_amount)}</p>
              </div>
            </div>

            {/* PARTICIPANTS & WAIVER */}
            <div>
              <h4 className="font-bold mb-2">Participants &amp; Waivers</h4>
              <div className="divide-y divide-[#E5E9F0] dark:divide-[#1E293B] rounded-xl border border-[#E5E9F0] dark:border-[#1E293B]">
                {(detailBooking.participants || []).length === 0 ? (
                  <p className="p-3 text-stone-500">No individual participant rows recorded.</p>
                ) : (
                  detailBooking.participants.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-2.5">
                      <div>
                        <span className="font-semibold">{p.participant_name}</span>
                        {p.age != null && <span className="ml-2 text-stone-500">({p.age} yrs)</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={p.attendance_status} size="sm" />
                        <button
                          type="button"
                          onClick={() => handleToggleParticipantWaiver(p)}
                          className={`rounded-lg px-2 py-1 text-[11px] font-semibold cursor-pointer ${
                            p.waiver_signed
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-800 border border-amber-200"
                          }`}
                        >
                          {p.waiver_signed ? "Waiver Signed" : "Sign Waiver"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* LIFECYCLE ACTIONS */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E5E9F0] dark:border-[#1E293B]">
              <div className="flex flex-wrap gap-2">
                {detailBooking.invoice_id ? (
                  <button
                    type="button"
                    onClick={() => {
                      const invNum = detailBooking.invoice_number;
                      setDetailBooking(null);
                      navigate(`/activities/invoices?search=${invNum}`);
                    }}
                    className={BUTTON_VARIANTS.secondary}
                  >
                    <FileText size={14} />
                    <span>Invoice {detailBooking.invoice_number} ({detailBooking.payment_status})</span>
                  </button>
                ) : (
                  detailBooking.status !== "Cancelled" && (
                    <button
                      type="button"
                      onClick={() => {
                        const id = detailBooking.id;
                        setDetailBooking(null);
                        navigate(`/activities/invoices?bookingId=${id}`);
                      }}
                      className={BUTTON_VARIANTS.secondary}
                    >
                      <FileText size={14} />
                      <span>Generate Invoice</span>
                    </button>
                  )
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {detailBooking.status === "Pending" && (
                  <button
                    type="button"
                    onClick={() => handleStatusTransition(detailBooking.id, "Confirmed")}
                    className={BUTTON_VARIANTS.primary}
                  >
                    Confirm Booking
                  </button>
                )}
                {detailBooking.status === "Confirmed" && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleStatusTransition(detailBooking.id, "No Show")}
                      className={BUTTON_VARIANTS.secondary}
                    >
                      Mark No Show
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusTransition(detailBooking.id, "Completed")}
                      className={BUTTON_VARIANTS.success}
                    >
                      Complete Booking
                    </button>
                  </>
                )}
                {["Pending", "Confirmed"].includes(detailBooking.status) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCancelTarget(detailBooking);
                      setCancelReason("");
                    }}
                    className={BUTTON_VARIANTS.secondary}
                  >
                    Cancel Booking
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDeleteBookingTarget(detailBooking)}
                  className={BUTTON_VARIANTS.danger}
                >
                  <Trash2 size={14} />
                  <span>Clear Booking</span>
                </button>
              </div>
            </div>

            {(detailBooking.history || []).length > 0 && (
              <div className="pt-2 border-t border-[#E5E9F0] dark:border-[#1E293B]">
                <h4 className="font-bold flex items-center gap-1.5 mb-2">
                  <History size={13} />
                  <span>Status Audit Trail</span>
                </h4>
                <div className="space-y-1">
                  {detailBooking.history.map((h) => (
                    <div key={h.id} className="flex justify-between text-[11px] text-stone-500">
                      <span>
                        {h.previous_status ? `${h.previous_status} → ` : ""}
                        <strong>{h.new_status}</strong>
                        {h.reason ? ` (${h.reason})` : ""}
                      </span>
                      <span>{actDateTime(h.changed_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* CANCEL BOOKING MODAL */}
      <Modal
        isOpen={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title={`Cancel Booking ${cancelTarget?.booking_number || ""}`}
        size="sm"
      >
        <form onSubmit={handleConfirmCancel} className="space-y-4">
          <p className="text-xs text-stone-600 dark:text-stone-300">
            Cancelling frees up session seats or the reserved time-slot resource immediately.
          </p>
          <textarea
            rows={2}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason for cancellation..."
            className={INPUT_STYLES.base}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCancelTarget(null)} className={BUTTON_VARIANTS.secondary}>Keep Booking</button>
            <button type="submit" disabled={cancelling} className={BUTTON_VARIANTS.danger}>
              {cancelling ? "Cancelling..." : "Confirm Cancellation"}
            </button>
          </div>
        </form>
      </Modal>

      <DeleteConfirm
        isOpen={Boolean(deleteBookingTarget)}
        onClose={() => setDeleteBookingTarget(null)}
        onConfirm={handleConfirmDeleteBooking}
        title={`Clear Booking ${deleteBookingTarget?.booking_number || ""}?`}
        message="This permanently removes the selected booking along with its participant records, history, and any linked invoice/payment records."
        confirmText="Clear Booking"
        loading={deletingBooking}
      />

      <DeleteConfirm
        isOpen={Boolean(deleteLogTarget)}
        onClose={() => setDeleteLogTarget(null)}
        onConfirm={handleConfirmDeleteLog}
        title="Clear Walk-In Usage Log?"
        message={`Remove the walk-in usage entry for "${deleteLogTarget?.activity_name || "Activity"}"?`}
        confirmText="Clear Entry"
        loading={deletingLog}
      />

      <DeleteConfirm
        isOpen={bulkDeleteOpen}
        onClose={() => !bulkDeleting && setBulkDeleteOpen(false)}
        onConfirm={handleConfirmBulkDelete}
        title={
          tab === "walkin"
            ? `Clear ${selectedLogIds.size} Walk-In Usage Log(s)?`
            : `Clear ${selectedBookingIds.size} Selected Booking(s)?`
        }
        message={
          tab === "walkin"
            ? "Selected walk-in usage logs will be permanently deleted."
            : "Selected bookings and their linked participants, history, and invoices will be permanently deleted."
        }
        confirmText="Clear Selected"
        loading={bulkDeleting}
      />
    </div>
  );
}
