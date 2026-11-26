import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  History,
  PlayCircle,
  Search,
  UserPlus,
  XCircle,
} from "lucide-react";

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
  kolkataTodayIso,
  packagesApi,
  pkgDate,
  pkgDateRange,
  pkgDateTime,
  pkgError,
  pkgMoney,
} from "./packagesApi";

const BOOKING_STATUSES = ["Pending", "Confirmed", "In Progress", "Completed", "Cancelled"];

const INITIAL_CUSTOMER_FORM = {
  full_name: "",
  phone: "",
  email: "",
  address: "",
};

export default function PackageBookings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showSuccess, showError } = useNotification();

  const preselectedPackageId = searchParams.get("packageId") || "";

  const [bookings, setBookings] = useState([]);
  const [packagesList, setPackagesList] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [packageFilter, setPackageFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 15;

  // New Booking Modal State
  const [createOpen, setCreateOpen] = useState(
    Boolean(searchParams.get("new") || preselectedPackageId)
  );
  const [bookingForm, setBookingForm] = useState({
    package_id: preselectedPackageId,
    customer_id: "",
    start_date: kolkataTodayIso(1),
    guest_count: 2,
    notes: "",
    generate_invoice: true,
    gst_rate: "18.00",
  });
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedPkgDetail, setSelectedPkgDetail] = useState(null);
  const [selectedOptionalIds, setSelectedOptionalIds] = useState([]);
  const [availability, setAvailability] = useState(null);
  const [checkingAvail, setCheckingAvail] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Inline Customer Creation Modal
  const [inlineCustOpen, setInlineCustOpen] = useState(false);
  const [inlineCustForm, setInlineCustForm] = useState(INITIAL_CUSTOMER_FORM);
  const [inlineCustError, setInlineCustError] = useState("");
  const [savingCust, setSavingCust] = useState(false);

  // Details & History Modal
  const [detailBooking, setDetailBooking] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Cancel Reason Modal
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const [bRes, pRes, cRes] = await Promise.all([
        packagesApi.bookings({
          search: searchQuery.trim() || undefined,
          status: statusFilter || undefined,
          package_id: packageFilter || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          page,
          page_size: pageSize,
        }),
        packagesApi.list({ status: "Active", page: 1, page_size: 100 }),
        packagesApi.customers({ page: 1, page_size: 100 }),
      ]);
      setBookings(bRes.data?.items || []);
      setTotalRecords(bRes.data?.total ?? 0);
      setTotalPages(bRes.data?.total_pages ?? 1);
      setPackagesList(pRes.data?.items || []);
      setCustomers(cRes.data?.items || []);
    } catch (err) {
      setPageError(pkgError(err));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, packageFilter, dateFrom, dateTo, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, packageFilter, dateFrom, dateTo]);

  // Load selected package details and live availability when package/date/guests change
  useEffect(() => {
    const pkgId = bookingForm.package_id;
    if (!createOpen || !pkgId) {
      setSelectedPkgDetail(null);
      setAvailability(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const pkgRes = await packagesApi.detail(pkgId);
        if (cancelled) return;
        const pkgData = pkgRes.data;
        setSelectedPkgDetail(pkgData);
        setSelectedOptionalIds(
          (pkgData.items || []).filter((it) => it.is_optional).map((it) => it.id)
        );
      } catch {
        if (!cancelled) setSelectedPkgDetail(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [createOpen, bookingForm.package_id]);

  useEffect(() => {
    const pkgId = bookingForm.package_id;
    if (!createOpen || !pkgId || !bookingForm.start_date || !bookingForm.guest_count) {
      setAvailability(null);
      return;
    }

    let cancelled = false;
    setCheckingAvail(true);
    const timer = setTimeout(async () => {
      try {
        const res = await packagesApi.availability(pkgId, {
          start_date: bookingForm.start_date,
          guest_count: Number(bookingForm.guest_count) || 1,
        });
        if (!cancelled) setAvailability(res.data);
      } catch (err) {
        if (!cancelled) {
          setAvailability({ available: false, reasons: [pkgError(err)] });
        }
      } finally {
        if (!cancelled) setCheckingAvail(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [createOpen, bookingForm.package_id, bookingForm.start_date, bookingForm.guest_count]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.email || "").toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  const handleSaveInlineCustomer = async (e) => {
    e.preventDefault();
    setInlineCustError("");
    if (inlineCustForm.full_name.trim().length < 2) {
      setInlineCustError("Customer full name must contain at least 2 characters.");
      return;
    }
    const phoneCheck = validateMobileNumber(inlineCustForm.phone, { required: true });
    if (!phoneCheck.valid) {
      setInlineCustError(phoneCheck.error);
      return;
    }
    const emailCheck = validateEmailAddress(inlineCustForm.email, { required: true });
    if (!emailCheck.valid) {
      setInlineCustError(emailCheck.error);
      return;
    }
    setSavingCust(true);
    try {
      const res = await packagesApi.createCustomer({
        full_name: inlineCustForm.full_name.trim(),
        phone: phoneCheck.normalized,
        email: emailCheck.normalized,
        address: inlineCustForm.address.trim() || null,
      });
      const newCust = res.data;
      setCustomers((prev) => [newCust, ...prev]);
      setBookingForm((f) => ({ ...f, customer_id: String(newCust.id) }));
      setInlineCustForm(INITIAL_CUSTOMER_FORM);
      setInlineCustOpen(false);
      showSuccess(`Customer "${newCust.full_name}" registered.`);
    } catch (err) {
      setInlineCustError(pkgError(err));
    } finally {
      setSavingCust(false);
    }
  };

  const handleCreateBooking = async (e) => {
    e.preventDefault();
    setBookingError("");
    if (!bookingForm.customer_id) {
      setBookingError("Please select or register a customer.");
      return;
    }
    if (!bookingForm.package_id) {
      setBookingError("Please select an active package.");
      return;
    }
    if (availability && !availability.available) {
      setBookingError(availability.reasons?.join(" ") || "Package is unavailable for these details.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await packagesApi.createBooking({
        package_id: Number(bookingForm.package_id),
        customer_id: Number(bookingForm.customer_id),
        start_date: bookingForm.start_date,
        guest_count: Number(bookingForm.guest_count),
        selected_optional_item_ids: selectedOptionalIds,
        notes: bookingForm.notes.trim() || null,
        generate_invoice: Boolean(bookingForm.generate_invoice),
        gst_rate: Number(bookingForm.gst_rate || 18),
      });
      showSuccess(`Booking ${res.data.booking_number} created successfully.`);
      setCreateOpen(false);
      if (searchParams.get("new") || searchParams.get("packageId")) {
        const next = new URLSearchParams(searchParams);
        next.delete("new");
        next.delete("packageId");
        setSearchParams(next, { replace: true });
      }
      await loadData();
    } catch (err) {
      setBookingError(pkgError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransitionStatus = async (booking, nextStatus) => {
    if (nextStatus === "Cancelled") {
      setCancelTarget(booking);
      setCancelReason("");
      setCancelError("");
      return;
    }
    try {
      await packagesApi.bookingStatus(booking.id, nextStatus);
      showSuccess(`Booking ${booking.booking_number} updated to ${nextStatus}.`);
      await loadData();
      if (detailBooking?.id === booking.id) {
        const res = await packagesApi.bookingDetail(booking.id);
        setDetailBooking(res.data);
      }
    } catch (err) {
      showError(pkgError(err), "Status Update Failed");
    }
  };

  const handleConfirmCancel = async (e) => {
    e.preventDefault();
    setCancelError("");
    if (!cancelReason.trim() || cancelReason.trim().length < 3) {
      setCancelError("Cancellation reason is required (minimum 3 characters).");
      return;
    }
    setCancelling(true);
    try {
      await packagesApi.bookingStatus(cancelTarget.id, "Cancelled", cancelReason.trim());
      showSuccess(`Booking ${cancelTarget.booking_number} cancelled.`);
      setCancelTarget(null);
      await loadData();
      if (detailBooking?.id === cancelTarget.id) {
        const res = await packagesApi.bookingDetail(cancelTarget.id);
        setDetailBooking(res.data);
      }
    } catch (err) {
      setCancelError(pkgError(err));
    } finally {
      setCancelling(false);
    }
  };

  const openDetailModal = async (bookingId) => {
    setDetailLoading(true);
    try {
      const res = await packagesApi.bookingDetail(bookingId);
      setDetailBooking(res.data);
    } catch (err) {
      showError(pkgError(err));
    } finally {
      setDetailLoading(false);
    }
  };

  const kpis = useMemo(() => {
    return {
      total: totalRecords,
      pending: bookings.filter((b) => b.status === "Pending").length,
      confirmed: bookings.filter((b) => b.status === "Confirmed").length,
      inProgress: bookings.filter((b) => b.status === "In Progress").length,
      completed: bookings.filter((b) => b.status === "Completed").length,
    };
  }, [bookings, totalRecords]);

  const columns = [
    {
      key: "booking_number",
      label: "Booking #",
      cellClassName: "whitespace-nowrap font-mono font-bold",
      render: (b) => b.booking_number,
    },
    {
      key: "customer",
      label: "Customer",
      render: (b) => (
        <div className="min-w-[140px]">
          <div className="font-semibold text-[#172033] dark:text-[#F8FAFC] whitespace-nowrap">
            {b.customer_name}
          </div>
          <div className="text-xs text-[#64748B] dark:text-[#8A9AB2]">
            {b.customer_phone || "—"}
          </div>
        </div>
      ),
    },
    {
      key: "package",
      label: "Package (Snapshot)",
      render: (b) => (
        <div className="min-w-[170px]">
          <div className="font-medium truncate max-w-[220px]">{b.package_name}</div>
          <div className="text-xs text-[#64748B] dark:text-[#8A9AB2]">
            {b.package_code} · {b.pricing_type}
          </div>
        </div>
      ),
    },
    {
      key: "dates",
      label: "Stay Dates",
      cellClassName: "whitespace-nowrap tabular-nums text-xs",
      render: (b) => (
        <div>
          <div>{pkgDateRange(b.start_date, b.end_date)}</div>
          <div className="text-[11px] text-[#64748B] dark:text-[#8A9AB2]">
            Booked {pkgDate(b.booking_date)} · {b.guest_count} guests
          </div>
        </div>
      ),
    },
    {
      key: "amount",
      label: "Total / Balance",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (b) => (
        <div>
          <div className="font-semibold">{pkgMoney(b.invoice_total ?? b.total_amount)}</div>
          <div className="text-[11px] text-[#64748B] dark:text-[#8A9AB2]">
            {b.invoice_number ? `Bal ${pkgMoney(b.invoice_balance_due)}` : "Invoice pending"}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      align: "center",
      render: (b) => <StatusBadge status={b.status} label={b.status} size="sm" />,
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      cellClassName: "whitespace-nowrap",
      render: (b) => (
        <div className="inline-flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => openDetailModal(b.id)}
            title="View Booking Details & History"
            className="rounded-lg p-1.5 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30 cursor-pointer"
          >
            <Eye size={15} />
          </button>
          {b.status === "Pending" && (
            <button
              type="button"
              onClick={() => handleTransitionStatus(b, "Confirmed")}
              title="Confirm Booking"
              className="rounded-lg p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer"
            >
              <CheckCircle2 size={15} />
            </button>
          )}
          {b.status === "Confirmed" && (
            <button
              type="button"
              onClick={() => handleTransitionStatus(b, "In Progress")}
              title="Start / Mark In Progress"
              className="rounded-lg p-1.5 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30 cursor-pointer"
            >
              <PlayCircle size={15} />
            </button>
          )}
          {b.status === "In Progress" && (
            <button
              type="button"
              onClick={() => handleTransitionStatus(b, "Completed")}
              title="Mark Completed"
              className="rounded-lg p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer"
            >
              <CheckCircle2 size={15} />
            </button>
          )}
          {["Pending", "Confirmed", "In Progress"].includes(b.status) && (
            <button
              type="button"
              onClick={() => handleTransitionStatus(b, "Cancelled")}
              title="Cancel Booking"
              className="rounded-lg p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
            >
              <XCircle size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              navigate(
                b.invoice_number
                  ? `/packages/invoices?search=${b.invoice_number}`
                  : `/packages/invoices?bookingId=${b.id}`
              )
            }
            title="View / Generate Invoice"
            className="rounded-lg p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer"
          >
            <FileText size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Package Bookings"
        description="Book active packages with validity & blackout checks, immutable price snapshots, and lifecycle history."
        actions={
          <button
            type="button"
            onClick={() => {
              setBookingError("");
              setCreateOpen(true);
            }}
            className={BUTTON_VARIANTS.primary}
          >
            <CalendarPlus size={16} />
            <span>New Package Booking</span>
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

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard compact title="Total Bookings" value={loading ? "—" : kpis.total} icon={CalendarDays} color="amber" />
        <StatCard compact title="Pending" value={loading ? "—" : kpis.pending} icon={Clock} color="orange" />
        <StatCard compact title="Confirmed" value={loading ? "—" : kpis.confirmed} icon={CheckCircle2} color="sky" />
        <StatCard compact title="In Progress" value={loading ? "—" : kpis.inProgress} icon={PlayCircle} color="indigo" />
        <StatCard compact title="Completed" value={loading ? "—" : kpis.completed} icon={CheckCircle2} color="emerald" />
      </div>

      {/* FILTER BAR */}
      <div className={`${CARD_STYLES.base} !p-2.5`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-60">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search booking #, customer, package..."
              className={`${INPUT_STYLES.base} w-full pl-9 !py-1.5 text-xs`}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`${INPUT_STYLES.select} !w-auto min-w-[130px] !py-1.5 text-xs`}
          >
            <option value="">All Statuses</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={packageFilter}
            onChange={(e) => setPackageFilter(e.target.value)}
            className={`${INPUT_STYLES.select} !w-auto min-w-[160px] !py-1.5 text-xs`}
          >
            <option value="">All Packages</option>
            {packagesList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.package_code})
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="Start date from"
            className={`${INPUT_STYLES.base} !w-auto !py-1.5 text-xs`}
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="Start date to"
            className={`${INPUT_STYLES.base} !w-auto !py-1.5 text-xs`}
          />

          {(searchQuery || statusFilter || packageFilter || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("");
                setPackageFilter("");
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
        columns={columns}
        rows={bookings}
        loading={loading}
        loadingMessage="Loading package bookings..."
        emptyTitle="No package bookings found"
        emptyDescription="Create a new package booking to see reservations here."
        tableMinWidth="min-w-[960px]"
        onRowClick={(b) => openDetailModal(b.id)}
        pagination={{
          currentPage: page,
          totalPages,
          totalRecords,
          pageSize,
          onPageChange: setPage,
        }}
      />

      {/* CREATE PACKAGE BOOKING MODAL */}
      <Modal
        isOpen={createOpen}
        onClose={() => {
          setCreateOpen(false);
          if (searchParams.get("new") || searchParams.get("packageId")) {
            const next = new URLSearchParams(searchParams);
            next.delete("new");
            next.delete("packageId");
            setSearchParams(next, { replace: true });
          }
        }}
        title="New Package Booking"
        size="lg"
      >
        <form onSubmit={handleCreateBooking} className="space-y-4">
          {bookingError && (
            <AlertBanner variant="error" title="Booking Validation" message={bookingError} />
          )}

          {/* CUSTOMER SELECTION */}
          <div className="rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#151D29] p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-200">
                1. Select or Register Customer *
              </label>
              <button
                type="button"
                onClick={() => {
                  setInlineCustError("");
                  setInlineCustOpen(true);
                }}
                className={`${BUTTON_VARIANTS.secondary} !py-1 !px-2.5 text-xs`}
              >
                <UserPlus size={13} />
                <span>Quick Register Customer</span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Filter customer by name, phone, email..."
                className={INPUT_STYLES.base}
              />
              <select
                required
                value={bookingForm.customer_id}
                onChange={(e) => setBookingForm((f) => ({ ...f, customer_id: e.target.value }))}
                className={INPUT_STYLES.select}
              >
                <option value="">— Select Customer —</option>
                {filteredCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} ({c.phone})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* PACKAGE, START DATE & GUESTS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1">
                2. Active Package *
              </label>
              <select
                required
                value={bookingForm.package_id}
                onChange={(e) => setBookingForm((f) => ({ ...f, package_id: e.target.value }))}
                className={INPUT_STYLES.select}
              >
                <option value="">— Choose Active Package —</option>
                {packagesList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.package_code}) · {pkgMoney(p.price)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1">
                3. Start Date *
              </label>
              <input
                type="date"
                required
                value={bookingForm.start_date}
                onChange={(e) => setBookingForm((f) => ({ ...f, start_date: e.target.value }))}
                className={INPUT_STYLES.base}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1">
                4. Guest Count *
              </label>
              <input
                type="number"
                min="1"
                required
                value={bookingForm.guest_count}
                onChange={(e) => setBookingForm((f) => ({ ...f, guest_count: e.target.value }))}
                className={INPUT_STYLES.base}
              />
            </div>
          </div>

          {/* LIVE AVAILABILITY & PRICE QUOTE */}
          {bookingForm.package_id && (
            <div className="rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-3.5 space-y-2.5 text-xs">
              {checkingAvail ? (
                <p className="text-stone-500">Checking validity, blackout dates, and pricing...</p>
              ) : availability ? (
                <>
                  {!availability.available ? (
                    <AlertBanner
                      variant="error"
                      title="Unavailable for Booking"
                      message={availability.reasons?.join(" ")}
                    />
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-emerald-700 dark:text-emerald-300">
                          Available · {pkgDateRange(availability.start_date, availability.end_date)} ({availability.duration_nights} {availability.duration_nights === 1 ? "Night" : "Nights"})
                        </p>
                        <p className="text-stone-500 mt-0.5">
                          Pricing: {pkgMoney(availability.unit_price)} ({availability.pricing_type}) for {availability.guest_count} guest(s)
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase font-bold text-stone-500">Package Total (Snapshot)</p>
                        <p className="text-lg font-bold text-amber-700 dark:text-[#FFB02E] tabular-nums">
                          {pkgMoney(availability.calculated_total)}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              ) : null}

              {/* PACKAGE INCLUSIONS PREVIEW */}
              {selectedPkgDetail?.items?.length > 0 && (
                <div className="border-t border-[#E5E9F0] dark:border-[#1E293B] pt-2.5">
                  <p className="font-bold uppercase text-[10px] text-stone-500 mb-1.5">
                    Package Inclusions ({selectedPkgDetail.items.length})
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {selectedPkgDetail.items.map((it) => (
                      <label
                        key={it.id}
                        className="flex items-start gap-2 rounded-lg bg-[#F8FAFC] dark:bg-[#151D29] p-2 border border-[#E5E9F0] dark:border-[#1E293B]"
                      >
                        {it.is_optional && selectedPkgDetail.is_customizable ? (
                          <input
                            type="checkbox"
                            checked={selectedOptionalIds.includes(it.id)}
                            onChange={(e) =>
                              setSelectedOptionalIds((prev) =>
                                e.target.checked
                                  ? [...prev, it.id]
                                  : prev.filter((id) => id !== it.id)
                              )
                            }
                            className="mt-0.5 h-3.5 w-3.5 accent-amber-500"
                          />
                        ) : (
                          <CheckCircle2 size={13} className="mt-0.5 text-emerald-500 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <span className="font-semibold">
                            [{it.inclusion_type}] {it.description}
                          </span>
                          <span className="ml-1 text-[11px] text-stone-500">
                            ×{it.quantity} {it.is_optional ? "(Optional)" : "(Mandatory)"}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* NOTES & INVOICE OPTION */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1">
                Booking Notes (Optional)
              </label>
              <input
                type="text"
                value={bookingForm.notes}
                onChange={(e) => setBookingForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Special requests or arrival notes..."
                className={INPUT_STYLES.base}
              />
            </div>

            <div className="rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#151D29] p-3 space-y-2 text-xs">
              <label className="inline-flex items-center gap-2 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={bookingForm.generate_invoice}
                  onChange={(e) =>
                    setBookingForm((f) => ({ ...f, generate_invoice: e.target.checked }))
                  }
                  className="h-4 w-4 accent-amber-500 rounded"
                />
                <span>Generate Invoice Immediately (for Advance / Payment)</span>
              </label>
              {bookingForm.generate_invoice && (
                <div className="flex items-center gap-2">
                  <span className="text-stone-500">GST Rate (%):</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={bookingForm.gst_rate}
                    onChange={(e) => setBookingForm((f) => ({ ...f, gst_rate: e.target.value }))}
                    className={`${INPUT_STYLES.base} !w-24 !py-1 text-xs`}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E9F0] dark:border-[#1E293B]">
            <button type="button" onClick={() => setCreateOpen(false)} className={BUTTON_VARIANTS.secondary}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || checkingAvail || (availability && !availability.available)}
              className={BUTTON_VARIANTS.primary}
            >
              {submitting ? "Creating Booking..." : "Confirm & Save Booking"}
            </button>
          </div>
        </form>
      </Modal>

      {/* INLINE REGISTER CUSTOMER MODAL */}
      <Modal
        isOpen={inlineCustOpen}
        onClose={() => setInlineCustOpen(false)}
        title="Register New Customer"
        size="sm"
      >
        <form onSubmit={handleSaveInlineCustomer} className="space-y-3">
          {inlineCustError && <AlertBanner variant="error" message={inlineCustError} />}
          <div>
            <label className="block text-xs font-bold uppercase mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={inlineCustForm.full_name}
              onChange={(e) => setInlineCustForm((f) => ({ ...f, full_name: e.target.value }))}
              placeholder="e.g. Aarav Sharma"
              className={INPUT_STYLES.base}
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase mb-1">Mobile Number *</label>
            <input
              type="tel"
              required
              value={inlineCustForm.phone}
              onChange={(e) => setInlineCustForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="10-digit mobile (6-9...)"
              className={INPUT_STYLES.base}
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase mb-1">Email Address *</label>
            <input
              type="email"
              required
              value={inlineCustForm.email}
              onChange={(e) => setInlineCustForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="customer@example.com"
              className={INPUT_STYLES.base}
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase mb-1">Address (Optional)</label>
            <input
              type="text"
              value={inlineCustForm.address}
              onChange={(e) => setInlineCustForm((f) => ({ ...f, address: e.target.value }))}
              className={INPUT_STYLES.base}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setInlineCustOpen(false)} className={BUTTON_VARIANTS.secondary}>
              Cancel
            </button>
            <button type="submit" disabled={savingCust} className={BUTTON_VARIANTS.primary}>
              {savingCust ? "Saving..." : "Register Customer"}
            </button>
          </div>
        </form>
      </Modal>

      {/* CANCEL BOOKING WITH REASON MODAL */}
      <Modal
        isOpen={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title={`Cancel Booking ${cancelTarget?.booking_number || ""}`}
        size="sm"
      >
        <form onSubmit={handleConfirmCancel} className="space-y-3">
          {cancelError && <AlertBanner variant="error" message={cancelError} />}
          <p className="text-xs text-stone-600 dark:text-stone-300">
            Cancelling a package booking requires a documented reason for the audit history.
          </p>
          <div>
            <label className="block text-xs font-bold uppercase mb-1">Cancellation Reason *</label>
            <textarea
              rows={3}
              required
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Guest rescheduled travel dates..."
              className={INPUT_STYLES.base}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCancelTarget(null)} className={BUTTON_VARIANTS.secondary}>
              Keep Booking
            </button>
            <button type="submit" disabled={cancelling} className={BUTTON_VARIANTS.danger}>
              {cancelling ? "Cancelling..." : "Confirm Cancellation"}
            </button>
          </div>
        </form>
      </Modal>

      {/* BOOKING DETAILS & HISTORY MODAL */}
      <Modal
        isOpen={Boolean(detailBooking)}
        onClose={() => setDetailBooking(null)}
        title={detailBooking ? `Booking ${detailBooking.booking_number}` : "Booking Details"}
        size="lg"
      >
        {detailLoading || !detailBooking ? (
          <div className="py-8 text-center text-sm text-stone-500">Loading booking details...</div>
        ) : (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E5E9F0] dark:border-[#1E293B]">
              <div>
                <p className="text-base font-bold text-[#172033] dark:text-[#F8FAFC]">
                  {detailBooking.package_name} ({detailBooking.package_code})
                </p>
                <p className="text-stone-500">
                  Customer: <strong>{detailBooking.customer_name}</strong> · {detailBooking.customer_phone}
                </p>
              </div>
              <StatusBadge status={detailBooking.status} label={detailBooking.status} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] p-2.5 border border-[#E5E9F0] dark:border-[#1E293B]">
                <p className="text-[10px] uppercase font-bold text-stone-500">Stay Window</p>
                <p className="font-semibold mt-0.5">{pkgDateRange(detailBooking.start_date, detailBooking.end_date)}</p>
              </div>
              <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] p-2.5 border border-[#E5E9F0] dark:border-[#1E293B]">
                <p className="text-[10px] uppercase font-bold text-stone-500">Snapshot Price</p>
                <p className="font-bold text-amber-700 dark:text-[#FFB02E] mt-0.5">
                  {pkgMoney(detailBooking.total_amount)}
                </p>
              </div>
              <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] p-2.5 border border-[#E5E9F0] dark:border-[#1E293B]">
                <p className="text-[10px] uppercase font-bold text-stone-500">Guests / Nights</p>
                <p className="font-semibold mt-0.5">
                  {detailBooking.guest_count} {detailBooking.guest_count === 1 ? "guest" : "guests"} · {detailBooking.duration_nights} {detailBooking.duration_nights === 1 ? "night" : "nights"}
                </p>
              </div>
              <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] p-2.5 border border-[#E5E9F0] dark:border-[#1E293B]">
                <p className="text-[10px] uppercase font-bold text-stone-500">Source ID</p>
                <p className="font-mono font-semibold mt-0.5">{detailBooking.source_identifier}</p>
              </div>
            </div>

            {detailBooking.cancellation_reason && (
              <AlertBanner
                variant="error"
                title="Cancellation Reason"
                message={detailBooking.cancellation_reason}
              />
            )}

            <div>
              <p className="font-bold uppercase text-[10px] text-stone-500 mb-1.5">
                Snapshotted Package Inclusions (Included in Package)
              </p>
              <div className="space-y-1.5">
                {(detailBooking.items || []).map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center justify-between rounded-lg bg-[#F8FAFC] dark:bg-[#151D29] px-3 py-2 border border-[#E5E9F0] dark:border-[#1E293B]"
                  >
                    <div>
                      <span className="font-semibold">[{it.inclusion_type}]</span> {it.description} ×{it.quantity}
                    </div>
                    <span className="rounded bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                      {it.billing_source}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="font-bold uppercase text-[10px] text-stone-500 mb-1.5 flex items-center gap-1">
                <History size={12} />
                <span>Booking History Timeline</span>
              </p>
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {(detailBooking.history || []).map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between rounded-lg bg-white dark:bg-[#101722] px-3 py-2 border border-[#E5E9F0] dark:border-[#1E293B]"
                  >
                    <div>
                      <span className="font-semibold">{h.action}</span>:{" "}
                      {h.previous_status ? `${h.previous_status} → ` : ""}
                      <span className="font-bold">{h.new_status}</span>
                      {h.reason && <span className="text-stone-500"> · {h.reason}</span>}
                    </div>
                    <span className="text-[11px] text-stone-500 shrink-0">{pkgDateTime(h.changed_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
