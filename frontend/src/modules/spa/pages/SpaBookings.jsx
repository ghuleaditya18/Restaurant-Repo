import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Calendar,
  Clock,
  Plus,
  Search,
  XCircle,
  FileText,
  RotateCcw,
  Sparkles,
  Eye,
  X,
} from "lucide-react";
import spaApi from "../services/spaApi";
import { BookingStatusBadge } from "../components/StatusBadges";
import { useNotification } from "../../../context/NotificationContext";
import { formatTime12Hour, formatTimeRange12Hour } from "../utils/timeFormat";
import PageHeader from "../../../components/PageHeader";
import AlertBanner from "../../../components/AlertBanner";

function formatCurrency(val) {
  const num = Number(val || 0);
  return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SpaBookings() {
  const { showSuccess, showError, showWarning, confirm } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [bookings, setBookings] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [therapists, setTherapists] = useState([]);
  const [availableServices, setAvailableServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filter state
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  // Booking Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    customer_mode: "existing", // "existing" | "new"
    customer_id: "",
    new_customer: { full_name: "", phone: "", email: "", notes: "" },
    staff_id: "",
    booking_date: new Date().toISOString().split("T")[0],
    start_time: "",
    selected_services: [], // [{ service_id, quantity }]
    notes: "",
  });

  // Available Slots state for New Booking
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState("");

  // Reschedule Modal
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [selectedBookingForReschedule, setSelectedBookingForReschedule] = useState(null);
  const [rescheduleForm, setRescheduleForm] = useState({
    booking_date: "",
    start_time: "",
    staff_id: "",
  });
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [loadingRescheduleSlots, setLoadingRescheduleSlots] = useState(false);
  const [rescheduleSlotsError, setRescheduleSlotsError] = useState("");

  // Details Modal
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedBookingDetails, setSelectedBookingDetails] = useState(null);

  // Status Action Modal (e.g. Cancel)
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [bookingToCancel, setBookingToCancel] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [updatingStatusId, setUpdatingStatusId] = useState(null);

  const fetchAllData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [bRes, cRes, stRes, sRes] = await Promise.all([
        spaApi.getBookings(),
        spaApi.getCustomers({ active_only: true }),
        spaApi.getStaff({ therapists_only: true, active_only: true }),
        spaApi.getServices({ available_only: true }),
      ]);
      setBookings(bRes.data);
      setCustomers(cRes.data);
      setTherapists(stRes.data);
      setAvailableServices(sRes.data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to load bookings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Handle URL query params
  useEffect(() => {
    if (searchParams.get("action") === "new") {
      setCreateModalOpen(true);
    }
    const bId = searchParams.get("id");
    if (bId && bookings.length > 0) {
      const found = bookings.find((b) => String(b.id) === bId);
      if (found) {
        setSelectedBookingDetails(found);
        setDetailsModalOpen(true);
      }
    }
  }, [searchParams, bookings]);

  // Live calculation of booking duration & end time & price in creation form
  const computedBookingStats = useMemo(() => {
    let totalMinutes = 0;
    let estimatedPrice = 0;

    for (const item of bookingForm.selected_services) {
      const svc = availableServices.find((s) => s.id === Number(item.service_id));
      if (svc) {
        const qty = Number(item.quantity || 1);
        totalMinutes += svc.duration_minutes * qty;
        estimatedPrice += Number(svc.price) * qty;
      }
    }

    let endTimeStr = "--:--";
    if (bookingForm.start_time && totalMinutes > 0) {
      const [h, m] = bookingForm.start_time.split(":").map(Number);
      const startSec = (h || 0) * 3600 + (m || 0) * 60;
      const endSec = startSec + totalMinutes * 60;
      const endH = Math.floor(endSec / 3600) % 24;
      const endM = Math.floor((endSec % 3600) / 60);
      endTimeStr = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
    }

    return { totalMinutes, estimatedPrice, endTimeStr };
  }, [bookingForm.selected_services, bookingForm.start_time, availableServices]);

  // Fetch available slots for New Booking modal
  const fetchNewBookingSlots = useCallback(async () => {
    if (
      !bookingForm.staff_id ||
      !bookingForm.booking_date ||
      bookingForm.selected_services.length === 0
    ) {
      setAvailableSlots([]);
      setSlotsError("");
      return;
    }

    setLoadingSlots(true);
    setSlotsError("");
    try {
      const sIds = bookingForm.selected_services.map((s) => s.service_id).join(",");
      const res = await spaApi.getAvailableSlots({
        staff_id: bookingForm.staff_id,
        booking_date: bookingForm.booking_date,
        service_ids: sIds,
      });
      const slots = res.data.slots || [];
      setAvailableSlots(slots);
      if (bookingForm.start_time && !slots.some((s) => s.start_time === bookingForm.start_time)) {
        setBookingForm((prev) => ({ ...prev, start_time: "" }));
      }
    } catch (err) {
      setAvailableSlots([]);
      setSlotsError(err?.response?.data?.detail || "Failed to load available slots.");
    } finally {
      setLoadingSlots(false);
    }
  }, [bookingForm.staff_id, bookingForm.booking_date, bookingForm.selected_services, bookingForm.start_time]);

  useEffect(() => {
    if (createModalOpen) {
      fetchNewBookingSlots();
    }
  }, [createModalOpen, fetchNewBookingSlots]);

  // Fetch available slots for Reschedule modal
  const fetchRescheduleSlots = useCallback(async () => {
    if (
      !selectedBookingForReschedule ||
      !rescheduleForm.staff_id ||
      !rescheduleForm.booking_date
    ) {
      setRescheduleSlots([]);
      setRescheduleSlotsError("");
      return;
    }

    setLoadingRescheduleSlots(true);
    setRescheduleSlotsError("");
    try {
      const res = await spaApi.getAvailableSlots({
        staff_id: rescheduleForm.staff_id,
        booking_date: rescheduleForm.booking_date,
        booking_id: selectedBookingForReschedule.id,
      });
      const slots = res.data.slots || [];
      setRescheduleSlots(slots);
      if (rescheduleForm.start_time && !slots.some((s) => s.start_time === rescheduleForm.start_time)) {
        setRescheduleForm((prev) => ({ ...prev, start_time: "" }));
      }
    } catch (err) {
      setRescheduleSlots([]);
      setRescheduleSlotsError(err?.response?.data?.detail || "Failed to load available slots.");
    } finally {
      setLoadingRescheduleSlots(false);
    }
  }, [selectedBookingForReschedule, rescheduleForm.staff_id, rescheduleForm.booking_date, rescheduleForm.start_time]);

  useEffect(() => {
    if (rescheduleModalOpen) {
      fetchRescheduleSlots();
    }
  }, [rescheduleModalOpen, fetchRescheduleSlots]);

  // Create Booking Submit
  const handleCreateBooking = async (e) => {
    e.preventDefault();
    if (bookingForm.selected_services.length === 0) {
      showWarning("Please select at least one treatment service.", "Missing Treatment");
      return;
    }
    if (!bookingForm.start_time) {
      showWarning("Please select an available appointment time slot.", "Select Slot");
      return;
    }

    try {
      const payload = {
        staff_id: Number(bookingForm.staff_id),
        booking_date: bookingForm.booking_date,
        start_time: bookingForm.start_time,
        service_items: bookingForm.selected_services.map((s) => ({
          service_id: Number(s.service_id),
          quantity: Number(s.quantity || 1),
        })),
        notes: bookingForm.notes?.trim() || null,
      };

      if (bookingForm.customer_mode === "existing") {
        payload.customer_id = Number(bookingForm.customer_id);
      } else {
        payload.new_customer = {
          full_name: bookingForm.new_customer.full_name.trim(),
          phone: bookingForm.new_customer.phone.trim(),
          email: bookingForm.new_customer.email?.trim() || null,
          notes: bookingForm.new_customer.notes?.trim() || null,
        };
      }

      await spaApi.createBooking(payload);
      setCreateModalOpen(false);
      setBookingForm({
        customer_mode: "existing",
        customer_id: "",
        new_customer: { full_name: "", phone: "", email: "", notes: "" },
        staff_id: "",
        booking_date: new Date().toISOString().split("T")[0],
        start_time: "",
        selected_services: [],
        notes: "",
      });
      setSearchParams({});
      showSuccess("Appointment booked successfully!", "Booking Confirmed");
      fetchAllData();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to create booking.";
      showError(msg, "Booking Failed");
      if (err?.response?.status === 409) {
        fetchNewBookingSlots();
      }
    }
  };

  // Three-Stage Status transitions: Booked -> In Progress -> Completed
  const handleTransitionStatus = async (bookingId, targetStatus, promptMsg) => {
    if (promptMsg) {
      const isStart = targetStatus === "In Progress";
      const isComplete = targetStatus === "Completed";
      const confirmed = await confirm({
        title: isStart ? "Start Therapy Session" : isComplete ? "Complete Therapy Session" : "Confirm Status Transition",
        message: promptMsg,
        confirmText: isStart ? "Start Therapy" : isComplete ? "Complete Session" : "Confirm",
        cancelText: "Cancel",
        variant: "primary",
      });
      if (!confirmed) return;
    }
    try {
      setUpdatingStatusId(bookingId);
      const note =
        targetStatus === "In Progress"
          ? "Customer checked in; therapy session started."
          : targetStatus === "Completed"
          ? "Therapy session completed."
          : `Transitioned to ${targetStatus}.`;

      await spaApi.updateBookingStatus(bookingId, { status: targetStatus, note });
      showSuccess(
        targetStatus === "In Progress"
          ? "Therapy session started. Status is now In Progress."
          : targetStatus === "Completed"
          ? "Therapy completed. Invoice can now be generated."
          : `Status updated to ${targetStatus}.`,
        "Status Updated"
      );
      await fetchAllData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Status transition failed.", "Transition Error");
    } finally {
      setUpdatingStatusId(null);
    }
  };

  // Reschedule Submit
  const handleRescheduleSubmit = async (e) => {
    e.preventDefault();
    if (!rescheduleForm.start_time) {
      showWarning("Please select an available appointment time slot.", "Select Slot");
      return;
    }
    try {
      await spaApi.rescheduleBooking(selectedBookingForReschedule.id, {
        booking_date: rescheduleForm.booking_date,
        start_time: rescheduleForm.start_time,
        staff_id: rescheduleForm.staff_id ? Number(rescheduleForm.staff_id) : undefined,
      });
      setRescheduleModalOpen(false);
      showSuccess("Appointment rescheduled successfully.", "Rescheduled");
      fetchAllData();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Reschedule failed.";
      showError(msg, "Reschedule Failed");
      if (err?.response?.status === 409) {
        fetchRescheduleSlots();
      }
    }
  };

  // Cancel Submit
  const handleCancelSubmit = async (e) => {
    e.preventDefault();
    const confirmed = await confirm({
      title: "Cancel Appointment",
      message: `Are you sure you want to cancel booking #${bookingToCancel?.booking_number}? This cannot be undone.`,
      confirmText: "Cancel Appointment",
      cancelText: "Keep Booking",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      await spaApi.updateBookingStatus(bookingToCancel.id, {
        status: "Cancelled",
        note: cancelReason.trim() || "Cancelled by receptionist.",
      });
      setCancelModalOpen(false);
      setCancelReason("");
      showSuccess("Appointment has been cancelled.", "Appointment Cancelled");
      fetchAllData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Cancellation failed.", "Cancellation Failed");
    }
  };

  // Generate Invoice Action
  const handleGenerateInvoice = async (bookingId, bookingNumber) => {
    const confirmed = await confirm({
      title: "Generate Treatment Invoice",
      message: `Generate GST invoice for completed booking #${bookingNumber || bookingId}?`,
      confirmText: "Generate Invoice",
      cancelText: "Cancel",
      variant: "primary",
    });
    if (!confirmed) return;

    try {
      const res = await spaApi.createInvoice({ booking_id: bookingId });
      showSuccess(`Invoice #${res.data.invoice_number} generated successfully!`, "Invoice Generated");
      navigate(`/spa/invoices?id=${res.data.id}`);
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to generate invoice.", "Invoice Error");
    }
  };

  // Tab Filtering
  const todayStr = new Date().toISOString().split("T")[0];
  const filteredBookings = bookings.filter((b) => {
    // Tab filter
    if (activeTab === "today" && b.booking_date !== todayStr) return false;
    if (activeTab === "booked" && !["Booked", "Pending", "Confirmed"].includes(b.status)) return false;
    if (activeTab === "in_progress" && !["In Progress", "Checked In"].includes(b.status)) return false;
    if (activeTab === "completed" && b.status !== "Completed") return false;
    if (activeTab === "cancelled" && !["Cancelled", "No Show"].includes(b.status)) return false;

    // Date picker filter
    if (dateFilter && b.booking_date !== dateFilter) return false;

    // Search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchNum = b.booking_number.toLowerCase().includes(q);
      const matchCust = b.customer_name.toLowerCase().includes(q) || b.customer_phone.includes(q);
      const matchTherapist = b.therapist_name.toLowerCase().includes(q);
      if (!matchNum && !matchCust && !matchTherapist) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* A1 Standard PageHeader */}
      <PageHeader
        title="Spa Bookings"
        description="Appointment scheduling, treatment status transitions, therapist assignment, and billing."
        actions={
          <button
            type="button"
            onClick={() => {
              setBookingForm({
                customer_mode: "existing",
                customer_id: customers[0]?.id || "",
                new_customer: { full_name: "", phone: "", email: "", notes: "" },
                staff_id: therapists[0]?.id || "",
                booking_date: todayStr,
                start_time: "",
                selected_services: availableServices[0] ? [{ service_id: availableServices[0].id, quantity: 1 }] : [],
                notes: "",
              });
              setCreateModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-bold rounded-xl bg-[#F5B716] hover:bg-[#E5A910] text-[#1C1917] transition shadow-xs cursor-pointer"
          >
            <Plus size={16} />
            <span>New Appointment</span>
          </button>
        }
      />

      {error && (
        <AlertBanner
          type="error"
          message={error}
          onDismiss={() => setError("")}
        />
      )}

      {/* Tabs and Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: "all", label: "All" },
            { id: "today", label: "Today" },
            { id: "booked", label: "Booked" },
            { id: "in_progress", label: "In Progress" },
            { id: "completed", label: "Completed" },
            { id: "cancelled", label: "Cancelled" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                activeTab === tab.id
                  ? "bg-[#F5B716] text-[#1C1917]"
                  : "bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Date Controls */}
        <div className="flex items-center gap-2.5">
          <div className="relative w-44 sm:w-60">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reference, customer..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#F5B716]"
            />
          </div>

          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 focus:outline-none"
            title="Filter by appointment date"
          />
          {dateFilter && (
            <button
              type="button"
              onClick={() => setDateFilter("")}
              className="text-xs text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 underline cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Bookings Table */}
      <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-sm text-stone-400">Loading appointments...</div>
        ) : filteredBookings.length === 0 ? (
          <div className="p-16 text-center text-stone-400">
            <Calendar size={36} className="mx-auto mb-2 text-stone-300 dark:text-stone-700" />
            <p className="text-sm font-semibold text-stone-600 dark:text-stone-300">No bookings found</p>
            <p className="text-xs text-stone-400 mt-1">Adjust filters or create a new booking.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-stone-50 dark:bg-stone-800/60 text-stone-500 dark:text-stone-400 text-xs uppercase tracking-wider border-b border-stone-200 dark:border-stone-800">
                <tr>
                  <th className="py-3 px-4">Booking Ref</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Therapist</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Services</th>
                  <th className="py-3 px-4">Est. Total</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Workflow Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800 text-stone-700 dark:text-stone-200">
                {filteredBookings.map((b) => (
                  <tr
                    key={b.id}
                    className="hover:bg-stone-50/60 dark:hover:bg-stone-800/40 transition"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-xs text-stone-900 dark:text-stone-100 whitespace-nowrap">
                      {b.booking_number}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-stone-900 dark:text-stone-100">{b.customer_name}</div>
                      <div className="text-xs text-stone-400">{b.customer_phone}</div>
                    </td>
                    <td className="py-3 px-4 font-medium text-stone-800 dark:text-stone-200">
                      {b.therapist_name}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-medium text-stone-900 dark:text-stone-100">{b.booking_date}</div>
                      <div className="text-xs text-stone-500 dark:text-stone-400">
                        {formatTimeRange12Hour(b.start_time, b.end_time)}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="max-w-[180px] truncate text-xs text-stone-600 dark:text-stone-300">
                        {b.booking_services.map((s) => s.service_name).join(", ")}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-extrabold text-stone-900 dark:text-stone-100">
                      {formatCurrency(b.estimated_total)}
                    </td>
                    <td className="py-3 px-4">
                      <BookingStatusBadge status={b.status} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Three-Stage Primary Status Workflow Triggers: Booked -> In Progress -> Completed */}
                        {["Booked", "Pending", "Confirmed"].includes(b.status) && (
                          <button
                            type="button"
                            disabled={updatingStatusId === b.id}
                            onClick={() =>
                              handleTransitionStatus(
                                b.id,
                                "In Progress",
                                `Check-in customer and start therapy for #${b.booking_number}?`
                              )
                            }
                            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-stone-900 cursor-pointer transition shadow-2xs disabled:opacity-50 flex items-center gap-1"
                            title="Check in customer and start therapy"
                          >
                            <span>{updatingStatusId === b.id ? "Updating..." : "Check-in / Start Therapy"}</span>
                          </button>
                        )}

                        {["In Progress", "Checked In"].includes(b.status) && (
                          <button
                            type="button"
                            disabled={updatingStatusId === b.id}
                            onClick={() =>
                              handleTransitionStatus(
                                b.id,
                                "Completed",
                                `Confirm completion of therapy session #${b.booking_number}?`
                              )
                            }
                            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition shadow-2xs disabled:opacity-50 flex items-center gap-1"
                            title="Complete therapy session"
                          >
                            <span>{updatingStatusId === b.id ? "Updating..." : "Complete Session"}</span>
                          </button>
                        )}

                        {/* Completed: Invoice Action */}
                        {b.status === "Completed" && (
                          <>
                            {b.has_invoice ? (
                              <button
                                type="button"
                                onClick={() => navigate(`/spa/invoices?id=${b.invoice_id}`)}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-200 cursor-pointer transition flex items-center gap-1"
                              >
                                <FileText size={12} />
                                <span>Invoice</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleGenerateInvoice(b.id, b.booking_number)}
                                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-[#F5B716] text-[#1C1917] hover:bg-[#E5A910] cursor-pointer transition flex items-center gap-1"
                              >
                                <FileText size={12} />
                                <span>Bill</span>
                              </button>
                            )}
                          </>
                        )}

                        {/* Reschedule Button */}
                        {!["Completed", "Cancelled", "No Show"].includes(b.status) && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedBookingForReschedule(b);
                              setRescheduleForm({
                                booking_date: b.booking_date,
                                start_time: "",
                                staff_id: b.staff_id,
                              });
                              setRescheduleModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 cursor-pointer transition"
                            title="Reschedule appointment"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}

                        {/* Cancel Button */}
                        {!["Completed", "Cancelled", "No Show"].includes(b.status) && (
                          <button
                            type="button"
                            onClick={() => {
                              setBookingToCancel(b);
                              setCancelReason("");
                              setCancelModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 cursor-pointer transition"
                            title="Cancel appointment"
                          >
                            <XCircle size={14} />
                          </button>
                        )}

                        {/* View Details */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBookingDetails(b);
                            setDetailsModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 cursor-pointer transition"
                          title="View appointment details"
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE BOOKING MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl p-6 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-[#F5B716]" />
                <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                  Book Spa Appointment
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateBooking} className="mt-4 space-y-4 text-xs sm:text-sm">
              {/* Customer Mode Selection */}
              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                  Customer
                </label>
                <div className="flex items-center gap-4 mb-2">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="cust_mode"
                      checked={bookingForm.customer_mode === "existing"}
                      onChange={() => setBookingForm({ ...bookingForm, customer_mode: "existing" })}
                      className="text-[#F5B716] focus:ring-[#F5B716]"
                    />
                    <span className="text-stone-700 dark:text-stone-300 font-medium">Select Registered Customer</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="cust_mode"
                      checked={bookingForm.customer_mode === "new"}
                      onChange={() => setBookingForm({ ...bookingForm, customer_mode: "new" })}
                      className="text-[#F5B716] focus:ring-[#F5B716]"
                    />
                    <span className="text-stone-700 dark:text-stone-300 font-medium">+ Register New Customer</span>
                  </label>
                </div>

                {bookingForm.customer_mode === "existing" ? (
                  <select
                    required
                    value={bookingForm.customer_id}
                    onChange={(e) => setBookingForm({ ...bookingForm, customer_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F5B716] focus:outline-none"
                  >
                    <option value="">Select Customer...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name} ({c.phone})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-700">
                    <div>
                      <input
                        type="text"
                        required
                        placeholder="Customer Full Name *"
                        value={bookingForm.new_customer.full_name}
                        onChange={(e) =>
                          setBookingForm({
                            ...bookingForm,
                            new_customer: { ...bookingForm.new_customer, full_name: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F5B716] focus:outline-none"
                      />
                    </div>
                    <div>
                      <input
                        type="tel"
                        required
                        placeholder="Mobile Number *"
                        value={bookingForm.new_customer.phone}
                        onChange={(e) =>
                          setBookingForm({
                            ...bookingForm,
                            new_customer: { ...bookingForm.new_customer, phone: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F5B716] focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Therapist Selection */}
              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Primary Therapist *
                </label>
                <select
                  required
                  value={bookingForm.staff_id}
                  onChange={(e) =>
                    setBookingForm({ ...bookingForm, staff_id: e.target.value, start_time: "" })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F5B716] focus:outline-none"
                >
                  <option value="">Select Therapist...</option>
                  {therapists.map((th) => (
                    <option key={th.id} value={th.id}>
                      {th.full_name} — {th.designation} {th.specialization ? `(${th.specialization})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Appointment Date */}
              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Appointment Date *
                </label>
                <input
                  type="date"
                  required
                  min={new Date().toISOString().split("T")[0]}
                  value={bookingForm.booking_date}
                  onChange={(e) =>
                    setBookingForm({ ...bookingForm, booking_date: e.target.value, start_time: "" })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F5B716] focus:outline-none"
                />
              </div>

              {/* Service Selection */}
              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Select Treatments / Services *
                </label>
                <div className="max-h-44 overflow-y-auto space-y-1.5 border border-stone-200 dark:border-stone-700 rounded-xl p-2 bg-stone-50/50 dark:bg-stone-800/40">
                  {availableServices.map((svc) => {
                    const isSelected = bookingForm.selected_services.some(
                      (s) => Number(s.service_id) === svc.id
                    );
                    return (
                      <div
                        key={svc.id}
                        className={`flex items-center justify-between p-2 rounded-lg border transition ${
                          isSelected
                            ? "bg-amber-50/70 border-amber-300 dark:bg-amber-950/40 dark:border-amber-800"
                            : "bg-white dark:bg-stone-900 border-stone-200/60 dark:border-stone-800"
                        }`}
                      >
                        <label className="flex items-center gap-2 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setBookingForm({
                                  ...bookingForm,
                                  start_time: "",
                                  selected_services: [
                                    ...bookingForm.selected_services,
                                    { service_id: svc.id, quantity: 1 },
                                  ],
                                });
                              } else {
                                setBookingForm({
                                  ...bookingForm,
                                  start_time: "",
                                  selected_services: bookingForm.selected_services.filter(
                                    (s) => Number(s.service_id) !== svc.id
                                  ),
                                });
                              }
                            }}
                            className="rounded text-[#F5B716] focus:ring-[#F5B716]"
                          />
                          <div>
                            <span className="font-semibold text-stone-900 dark:text-stone-100">
                              {svc.name}
                            </span>
                            <span className="text-xs text-stone-400 ml-2">
                              ({svc.duration_minutes}m • {formatCurrency(svc.price)})
                            </span>
                          </div>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Therapy-Based Available Slots */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-stone-700 dark:text-stone-300">
                    Available Appointment Time Slot *
                  </label>
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                    +15 min therapist break buffer included
                  </span>
                </div>
                {loadingSlots ? (
                  <div className="p-4 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 text-center text-xs text-stone-500 flex items-center justify-center gap-2">
                    <Clock size={14} className="animate-spin text-amber-500" />
                    <span>Loading available therapy slots...</span>
                  </div>
                ) : slotsError ? (
                  <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs">
                    {slotsError}
                  </div>
                ) : !bookingForm.staff_id || !bookingForm.booking_date || bookingForm.selected_services.length === 0 ? (
                  <div className="p-3.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/40 text-center text-xs text-stone-500">
                    Select therapist, date, and treatment services to view available slots.
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-center text-xs text-rose-600 dark:text-rose-400 font-medium">
                    No available appointment slots for the selected date and therapist.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1.5 border border-stone-200 dark:border-stone-700 rounded-xl bg-stone-50/50 dark:bg-stone-800/40">
                      {availableSlots.map((slot) => {
                        const isSelected = bookingForm.start_time === slot.start_time;
                        return (
                          <button
                            type="button"
                            key={slot.start_time}
                            onClick={() => setBookingForm((prev) => ({ ...prev, start_time: slot.start_time }))}
                            className={`px-2.5 py-2 rounded-xl text-xs font-semibold transition border text-center cursor-pointer ${
                              isSelected
                                ? "bg-[#F5B716] text-stone-900 border-[#F5B716] shadow-xs ring-2 ring-amber-300 font-bold"
                                : "bg-white dark:bg-stone-900 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 border-stone-200 dark:border-stone-700"
                            }`}
                            title={`Therapy: ${slot.display_text} (Therapist reserved until next available appointment)`}
                          >
                            {slot.display_text}
                          </button>
                        );
                      })}
                    </div>
                    {bookingForm.start_time && (
                      <p className="text-xs text-stone-600 dark:text-stone-300 flex items-center justify-between">
                        <span>
                          Selected: <strong className="text-amber-600 dark:text-amber-400">
                            {availableSlots.find((s) => s.start_time === bookingForm.start_time)?.display_text || formatTimeRange12Hour(bookingForm.start_time, computedBookingStats.endTimeStr)}
                          </strong>
                        </span>
                        <span className="text-[11px] text-stone-400">
                          (Therapist break reserved: 15 min after therapy)
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Computed Duration, End Time and Conflict Bar */}
              <div className="p-3.5 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-stone-500 dark:text-stone-400">Total Duration: </span>
                  <span className="font-bold text-stone-900 dark:text-stone-100">
                    {computedBookingStats.totalMinutes} mins (+15m reset break)
                  </span>
                </div>
                <div>
                  <span className="text-stone-500 dark:text-stone-400">Appointment Window: </span>
                  <span className="font-bold text-stone-900 dark:text-stone-100">
                    {bookingForm.start_time ? formatTimeRange12Hour(bookingForm.start_time, computedBookingStats.endTimeStr) : "--:--"}
                  </span>
                </div>
                <div>
                  <span className="text-stone-500 dark:text-stone-400">Estimated Total: </span>
                  <span className="font-extrabold text-stone-900 dark:text-stone-100">
                    {formatCurrency(computedBookingStats.estimatedPrice)}
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Notes / Special Requests
                </label>
                <input
                  type="text"
                  value={bookingForm.notes}
                  onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })}
                  placeholder="e.g. Focus on shoulder tension, allergy notes..."
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F5B716] focus:outline-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 flex items-center justify-end gap-2 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!bookingForm.start_time || computedBookingStats.totalMinutes <= 0}
                  className="px-5 py-2 font-bold rounded-xl bg-[#F5B716] hover:bg-[#E5A910] text-[#1C1917] cursor-pointer transition shadow-xs disabled:opacity-50"
                >
                  Confirm & Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESCHEDULE MODAL */}
      {rescheduleModalOpen && selectedBookingForReschedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-stone-100 dark:border-stone-800">
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                Reschedule #{selectedBookingForReschedule.booking_number}
              </h2>
              <button
                type="button"
                onClick={() => setRescheduleModalOpen(false)}
                className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRescheduleSubmit} className="mt-4 space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Therapist
                </label>
                <select
                  value={rescheduleForm.staff_id}
                  onChange={(e) => setRescheduleForm({ ...rescheduleForm, staff_id: e.target.value, start_time: "" })}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F5B716] focus:outline-none"
                >
                  {therapists.map((th) => (
                    <option key={th.id} value={th.id}>
                      {th.full_name} ({th.designation})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  New Date *
                </label>
                <input
                  type="date"
                  required
                  min={new Date().toISOString().split("T")[0]}
                  value={rescheduleForm.booking_date}
                  onChange={(e) => setRescheduleForm({ ...rescheduleForm, booking_date: e.target.value, start_time: "" })}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F5B716] focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-stone-700 dark:text-stone-300">
                    Available Appointment Time Slot *
                  </label>
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                    +15 min break buffer included
                  </span>
                </div>
                {loadingRescheduleSlots ? (
                  <div className="p-4 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 text-center text-xs text-stone-500 flex items-center justify-center gap-2">
                    <Clock size={14} className="animate-spin text-amber-500" />
                    <span>Loading available therapy slots...</span>
                  </div>
                ) : rescheduleSlotsError ? (
                  <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs">
                    {rescheduleSlotsError}
                  </div>
                ) : rescheduleSlots.length === 0 ? (
                  <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-center text-xs text-rose-600 dark:text-rose-400 font-medium">
                    No available appointment slots for the selected date and therapist.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1.5 border border-stone-200 dark:border-stone-700 rounded-xl bg-stone-50/50 dark:bg-stone-800/40">
                      {rescheduleSlots.map((slot) => {
                        const isSelected = rescheduleForm.start_time === slot.start_time;
                        return (
                          <button
                            type="button"
                            key={slot.start_time}
                            onClick={() => setRescheduleForm((prev) => ({ ...prev, start_time: slot.start_time }))}
                            className={`px-2.5 py-2 rounded-xl text-xs font-semibold transition border text-center cursor-pointer ${
                              isSelected
                                ? "bg-[#F5B716] text-stone-900 border-[#F5B716] shadow-xs ring-2 ring-amber-300 font-bold"
                                : "bg-white dark:bg-stone-900 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 border-stone-200 dark:border-stone-700"
                            }`}
                            title={`Therapy: ${slot.display_text} (Therapist reserved until next available appointment)`}
                          >
                            {slot.display_text}
                          </button>
                        );
                      })}
                    </div>
                    {rescheduleForm.start_time && (
                      <p className="text-xs text-stone-600 dark:text-stone-300 flex items-center justify-between">
                        <span>
                          Selected: <strong className="text-amber-600 dark:text-amber-400">
                            {rescheduleSlots.find((s) => s.start_time === rescheduleForm.start_time)?.display_text || formatTime12Hour(rescheduleForm.start_time)}
                          </strong>
                        </span>
                        <span className="text-[11px] text-stone-400">
                          (Therapist break reserved: 15 min after therapy)
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setRescheduleModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!rescheduleForm.start_time}
                  className="px-5 py-2 font-bold rounded-xl bg-[#F5B716] hover:bg-[#E5A910] text-[#1C1917] cursor-pointer transition shadow-xs disabled:opacity-50"
                >
                  Confirm Reschedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANCEL BOOKING MODAL */}
      {cancelModalOpen && bookingToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl p-6">
            <h2 className="text-lg font-bold text-rose-600 dark:text-rose-400">
              Cancel Appointment #{bookingToCancel.booking_number}
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
              Customer: {bookingToCancel.customer_name} ({bookingToCancel.customer_phone})
            </p>

            <form onSubmit={handleCancelSubmit} className="mt-4 space-y-3 text-xs sm:text-sm">
              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Reason for Cancellation
                </label>
                <textarea
                  rows="3"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Customer requested cancellation due to personal reasons..."
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setCancelModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                >
                  Keep Appointment
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white cursor-pointer transition shadow-xs"
                >
                  Cancel Booking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAILS MODAL */}
      {detailsModalOpen && selectedBookingDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
              <div>
                <span className="font-mono text-xs text-stone-400">
                  {selectedBookingDetails.booking_number}
                </span>
                <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                  Appointment Overview
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDetailsModalOpen(false)}
                className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs sm:text-sm">
              <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-800/50">
                <div>
                  <div className="text-xs text-stone-400">Current Status</div>
                  <BookingStatusBadge status={selectedBookingDetails.status} />
                </div>
                <div className="text-right">
                  <div className="text-xs text-stone-400">Estimated Total</div>
                  <div className="font-bold text-stone-900 dark:text-stone-100">
                    {formatCurrency(selectedBookingDetails.estimated_total)}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-stone-800 dark:text-stone-200 mb-1">Appointment Schedule</h3>
                <p className="text-stone-700 dark:text-stone-300 font-semibold">
                  {selectedBookingDetails.booking_date} • {formatTimeRange12Hour(selectedBookingDetails.start_time, selectedBookingDetails.end_time)}
                </p>
                <p className="text-[11px] text-stone-400">
                  (Therapist break buffer: 15 mins reserved following session)
                </p>
              </div>

              <div>
                <h3 className="font-bold text-stone-800 dark:text-stone-200 mb-1">Customer</h3>
                <p className="text-stone-700 dark:text-stone-300 font-semibold">
                  {selectedBookingDetails.customer_name}
                </p>
                <p className="text-stone-500">{selectedBookingDetails.customer_phone}</p>
              </div>

              <div>
                <h3 className="font-bold text-stone-800 dark:text-stone-200 mb-1">Assigned Specialist</h3>
                <p className="text-stone-700 dark:text-stone-300 font-semibold">
                  {selectedBookingDetails.therapist_name}
                </p>
              </div>

              <div>
                <h3 className="font-bold text-stone-800 dark:text-stone-200 mb-1">Selected Services</h3>
                <div className="space-y-1">
                  {selectedBookingDetails.booking_services.map((bs) => (
                    <div
                      key={bs.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-stone-50 dark:bg-stone-800/40 text-xs"
                    >
                      <div>
                        <span className="font-medium text-stone-800 dark:text-stone-200">
                          {bs.service_name}
                        </span>
                        <span className="text-stone-400 ml-1.5">({bs.duration_minutes}m)</span>
                      </div>
                      <span className="font-bold text-stone-900 dark:text-stone-100">
                        {formatCurrency(bs.subtotal)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {selectedBookingDetails.notes && (
                <div>
                  <h3 className="font-bold text-stone-800 dark:text-stone-200 mb-1">Notes</h3>
                  <p className="p-2.5 rounded-lg bg-stone-50 dark:bg-stone-800/50 text-xs text-stone-600 dark:text-stone-300">
                    {selectedBookingDetails.notes}
                  </p>
                </div>
              )}

              {/* Status History */}
              {selectedBookingDetails.status_history?.length > 0 && (
                <div>
                  <h3 className="font-bold text-stone-800 dark:text-stone-200 mb-1.5">Audit Trail</h3>
                  <div className="space-y-1.5 border-l-2 border-[#F5B716] pl-3 py-1">
                    {selectedBookingDetails.status_history.map((h) => (
                      <div key={h.id} className="text-xs">
                        <div className="font-semibold text-stone-800 dark:text-stone-200">
                          {h.previous_status ? `${h.previous_status} → ` : ""}{h.new_status}
                        </div>
                        <div className="text-stone-400 text-[10px]">
                          {new Date(h.changed_at).toLocaleString("en-IN")} • {h.note || "No note"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
