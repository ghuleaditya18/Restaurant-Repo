import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarPlus,
  Car,
  CheckCircle2,
  Edit3,
  Eye,
  FilePlus2,
  Navigation,
  Plus,
  Search,
  UserPlus,
  XCircle,
} from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import StatusBadge from "../../components/StatusBadge";
import { useNotification } from "../../context/NotificationContext";
import { BUTTON_VARIANTS, CARD_STYLES, INPUT_STYLES } from "../../utils/themeTokens";
import { validateEmailAddress, validateMobileNumber } from "../../utils/validation";
import VillaDataTable from "../villas/VillaDataTable";
import {
  kolkataCurrentTimeHHMM,
  kolkataTodayIso,
  kolkataUpcomingDefaults,
  transportApi,
  trnDate,
  trnDateTime,
  trnError,
  trnMoney,
  trnTime,
} from "./transportApi";

const BOOKING_TYPES = [
  "Guest Transfer",
  "Airport Transfer",
  "Local Travel",
  "Activity Transfer",
  "Package Transfer",
  "Custom Transport",
];
const BOOKING_STATUSES = [
  "Pending",
  "Confirmed",
  "Assigned",
  "Driver En Route",
  "In Progress",
  "Completed",
  "Cancelled",
  "No Show",
];

const INITIAL_CUSTOMER = { full_name: "", phone: "", email: "", address: "" };

export default function TransportBookings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showSuccess, showError } = useNotification();

  const [bookings, setBookings] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [services, setServices] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [refs, setRefs] = useState({ stay_bookings: [], package_bookings: [], activity_bookings: [] });
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  // Filters
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 15;

  // Create / Edit Booking Modal
  const [formOpen, setFormOpen] = useState(Boolean(searchParams.get("new")));
  const [editingBooking, setEditingBooking] = useState(null);
  const [form, setForm] = useState(() => {
    const defaults = kolkataUpcomingDefaults(15);
    return {
      booking_type: "Airport Transfer",
      customer_id: "",
      stay_booking_id: "",
      package_booking_id: "",
      activity_booking_id: "",
      service_type_id: "",
      route_id: "",
      pickup_location: "",
      drop_location: "",
      pickup_date: defaults.pickup_date,
      pickup_time: defaults.pickup_time,
      estimated_distance_km: "0",
      estimated_duration_minutes: 60,
      passenger_count: 1,
      vehicle_id: "",
      driver_id: "",
      base_price: "",
      additional_charges: "0.00",
      discount_amount: "0.00",
      notes: "",
    };
  });
  const [passengers, setPassengers] = useState([]);
  const [availData, setAvailData] = useState(null);
  const [checkingAvail, setCheckingAvail] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Quick Inline Customer Modal
  const [custOpen, setCustOpen] = useState(false);
  const [custForm, setCustForm] = useState(INITIAL_CUSTOMER);
  const [custError, setCustError] = useState("");
  const [custFieldErrors, setCustFieldErrors] = useState({});
  const [savingCust, setSavingCust] = useState(false);

  // Detail & Trip Status / Assignment Modal
  const [detailBooking, setDetailBooking] = useState(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignAvail, setAssignAvail] = useState(null);
  const [assignVehicleId, setAssignVehicleId] = useState("");
  const [assignDriverId, setAssignDriverId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const [tripModal, setTripModal] = useState(null); // { booking, targetStatus }
  const [tripForm, setTripForm] = useState({ reason: "", start_odometer_km: "", end_odometer_km: "", remarks: "" });
  const [updatingTrip, setUpdatingTrip] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const [bkRes, custRes, svcRes, rtRes, refRes] = await Promise.all([
        transportApi.bookings({
          search: searchQuery.trim() || undefined,
          status: statusFilter || undefined,
          booking_type: typeFilter || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          page,
          page_size: pageSize,
        }),
        transportApi.customers(),
        transportApi.services({ active_only: true }),
        transportApi.routes({ active_only: true }),
        transportApi.integrationReferences().catch(() => ({ data: { stay_bookings: [], package_bookings: [], activity_bookings: [] } })),
      ]);
      setBookings(bkRes.data?.items || []);
      setTotalRecords(bkRes.data?.total ?? 0);
      setTotalPages(bkRes.data?.total_pages ?? 1);
      setCustomers(custRes.data || []);
      setServices(svcRes.data || []);
      setRoutes(rtRes.data || []);
      setRefs(refRes.data || { stay_bookings: [], package_bookings: [], activity_bookings: [] });
    } catch (err) {
      setPageError(trnError(err));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, typeFilter, dateFrom, dateTo, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, typeFilter, dateFrom, dateTo]);

  const openCreateBooking = useCallback(() => {
    const defaults = kolkataUpcomingDefaults(15);
    setEditingBooking(null);
    setForm({
      booking_type: "Airport Transfer",
      customer_id: "",
      stay_booking_id: "",
      package_booking_id: "",
      activity_booking_id: "",
      service_type_id: "",
      route_id: "",
      pickup_location: "",
      drop_location: "",
      pickup_date: defaults.pickup_date,
      pickup_time: defaults.pickup_time,
      estimated_distance_km: "0",
      estimated_duration_minutes: 60,
      passenger_count: 1,
      vehicle_id: "",
      driver_id: "",
      base_price: "",
      additional_charges: "0.00",
      discount_amount: "0.00",
      notes: "",
    });
    setPassengers([]);
    setAvailData(null);
    setFormError("");
    setFormOpen(true);
  }, []);

  const openEditBooking = async (b) => {
    let target = b;
    if (!b.passengers && b.id) {
      try {
        const res = await transportApi.bookingDetail(b.id);
        target = res.data;
      } catch {
        // fallback to row data
      }
    }
    setEditingBooking(target);
    setForm({
      booking_type: target.booking_type || "Airport Transfer",
      customer_id: target.customer_id ? String(target.customer_id) : "",
      stay_booking_id: target.stay_booking_id ? String(target.stay_booking_id) : "",
      package_booking_id: target.package_booking_id ? String(target.package_booking_id) : "",
      activity_booking_id: target.activity_booking_id ? String(target.activity_booking_id) : "",
      service_type_id: target.service_type_id ? String(target.service_type_id) : "",
      route_id: target.route_id ? String(target.route_id) : "",
      pickup_location: target.pickup_location || "",
      drop_location: target.drop_location || "",
      pickup_date: target.pickup_date || kolkataTodayIso(0),
      pickup_time: target.pickup_time || "10:00",
      estimated_distance_km: String(target.estimated_distance_km ?? "0"),
      estimated_duration_minutes: target.estimated_duration_minutes ?? 60,
      passenger_count: target.passenger_count ?? 1,
      vehicle_id: target.vehicle_id ? String(target.vehicle_id) : "",
      driver_id: target.driver_id ? String(target.driver_id) : "",
      base_price: target.base_price != null ? String(target.base_price) : "",
      additional_charges: String(target.additional_charges ?? "0.00"),
      discount_amount: String(target.discount_amount ?? "0.00"),
      notes: target.notes || "",
    });
    setPassengers(target.passengers || []);
    setAvailData(null);
    setFormError("");
    setDetailBooking(null);
    setFormOpen(true);
  };

  useEffect(() => {
    if (searchParams.get("new")) {
      openCreateBooking();
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, openCreateBooking]);

  const isPastSelection = useCallback((pickupDate, pickupTime) => {
    if (!pickupDate || !pickupTime) return false;
    const todayIso = kolkataTodayIso(0);
    if (pickupDate < todayIso) return true;
    if (pickupDate === todayIso && pickupTime < kolkataCurrentTimeHHMM()) return true;
    return false;
  }, []);

  // Selected stay/customer guest matching for Package & Activity filtering
  const selectedStayRef = useMemo(
    () => refs.stay_bookings.find((s) => String(s.id) === String(form.stay_booking_id)) || null,
    [refs.stay_bookings, form.stay_booking_id]
  );

  const selectedCustomerObj = useMemo(
    () => customers.find((c) => String(c.id) === String(form.customer_id)) || null,
    [customers, form.customer_id]
  );

  const activeGuestMatcher = useMemo(() => {
    if (selectedStayRef) {
      return {
        customer_id: selectedStayRef.customer_id || (form.customer_id ? Number(form.customer_id) : null),
        phone: selectedStayRef.guest_phone || selectedCustomerObj?.phone || "",
        email: (selectedStayRef.guest_email || selectedCustomerObj?.email || "").toLowerCase(),
        name: (selectedStayRef.guest_name || selectedCustomerObj?.full_name || "").trim().toLowerCase(),
      };
    }
    if (selectedCustomerObj) {
      return {
        customer_id: selectedCustomerObj.id,
        phone: selectedCustomerObj.phone || "",
        email: (selectedCustomerObj.email || "").toLowerCase(),
        name: (selectedCustomerObj.full_name || "").trim().toLowerCase(),
      };
    }
    return null;
  }, [selectedStayRef, selectedCustomerObj, form.customer_id]);

  const matchesGuestRecord = useCallback(
    (rec) => {
      if (!activeGuestMatcher) return true;
      if (activeGuestMatcher.customer_id && rec.customer_id && Number(rec.customer_id) === Number(activeGuestMatcher.customer_id)) {
        return true;
      }
      if (activeGuestMatcher.phone && rec.customer_phone && rec.customer_phone === activeGuestMatcher.phone) {
        return true;
      }
      if (activeGuestMatcher.email && rec.customer_email && rec.customer_email.toLowerCase() === activeGuestMatcher.email) {
        return true;
      }
      if (activeGuestMatcher.name && rec.customer_name && rec.customer_name.trim().toLowerCase() === activeGuestMatcher.name) {
        return true;
      }
      return false;
    },
    [activeGuestMatcher]
  );

  const filteredPackageRefs = useMemo(
    () => refs.package_bookings.filter(matchesGuestRecord),
    [refs.package_bookings, matchesGuestRecord]
  );

  const filteredActivityRefs = useMemo(
    () => refs.activity_bookings.filter(matchesGuestRecord),
    [refs.activity_bookings, matchesGuestRecord]
  );

  // Live price preview
  const computeSuggestedPrice = useCallback(
    (nextForm) => {
      const svc = services.find((s) => String(s.id) === String(nextForm.service_type_id));
      const rt = routes.find((r) => String(r.id) === String(nextForm.route_id));
      if (!svc && rt) return String(rt.standard_price);
      if (!svc) return nextForm.base_price || "0.00";
      const base = Number(svc.base_price || 0);
      const km = Number(nextForm.estimated_distance_km || 0);
      const hrs = Number(nextForm.estimated_duration_minutes || 60) / 60;
      if (svc.pricing_model === "Flat") return base > 0 ? base.toFixed(2) : String(rt?.standard_price || "0.00");
      if (svc.pricing_model === "Per Km") return (base + km * Number(svc.price_per_km || 0)).toFixed(2);
      if (svc.pricing_model === "Per Hour") return (base + hrs * Number(svc.price_per_hour || 0)).toFixed(2);
      if (svc.pricing_model === "Hybrid") {
        return (base + km * Number(svc.price_per_km || 0) + hrs * Number(svc.price_per_hour || 0)).toFixed(2);
      }
      return base.toFixed(2);
    },
    [services, routes]
  );

  const checkAvailability = useCallback(
    async ({ silent = false } = {}) => {
      if (!form.pickup_date || !form.pickup_time) return;
      const timeChangedInEdit =
        editingBooking &&
        (form.pickup_date !== editingBooking.pickup_date || form.pickup_time !== editingBooking.pickup_time);
      if ((!editingBooking || timeChangedInEdit) && isPastSelection(form.pickup_date, form.pickup_time)) {
        setAvailData(null);
        if (!silent) {
          setFieldErrors((previous) => ({ ...previous, pickup_time: "Choose the current time or a future pickup time." }));
        }
        return;
      }
      setCheckingAvail(true);
      if (!silent) {
        setFormError("");
        setFieldErrors((previous) => ({ ...previous, pickup_time: "" }));
      }
      try {
        const res = await transportApi.availability({
          pickup_date: form.pickup_date,
          pickup_time: form.pickup_time,
          duration_minutes: Number(form.estimated_duration_minutes || 60),
          passenger_count: Number(form.passenger_count || 1),
          service_type_id: form.service_type_id || undefined,
          exclude_booking_id: editingBooking?.id || undefined,
        });
        const data = res.data;
        setAvailData(data);
        setForm((prev) => {
          if (!prev.vehicle_id) return prev;
          const stillEligible = data?.available_vehicles?.some((v) => String(v.id) === String(prev.vehicle_id));
          return stillEligible ? prev : { ...prev, vehicle_id: "" };
        });
      } catch (err) {
        if (!silent) setFormError(trnError(err));
      } finally {
        setCheckingAvail(false);
      }
    },
    [form.pickup_date, form.pickup_time, form.estimated_duration_minutes, form.passenger_count, form.service_type_id, editingBooking, isPastSelection]
  );

  // Auto-refresh available fleet & drivers matching live time and passenger count while modal is open
  useEffect(() => {
    if (!formOpen) return undefined;
    const timer = setTimeout(() => {
      checkAvailability({ silent: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [formOpen, checkAvailability]);

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    setCustError("");
    const errors = {};
    const phoneRes = validateMobileNumber(custForm.phone, { required: true });
    if (!phoneRes.valid) errors.phone = phoneRes.error;
    const emailRes = validateEmailAddress(custForm.email, { required: true });
    if (!emailRes.valid) errors.email = emailRes.error;
    if (custForm.full_name.trim().length < 2) errors.full_name = "Full name must contain at least 2 characters.";
    setCustFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSavingCust(true);
    try {
      const res = await transportApi.createCustomer({
        full_name: custForm.full_name.trim(),
        phone: phoneRes.normalized,
        email: emailRes.normalized,
        address: custForm.address.trim() || null,
      });
      const updatedCusts = await transportApi.customers();
      setCustomers(updatedCusts.data || []);
      setForm((prev) => ({ ...prev, customer_id: String(res.data.id) }));
      setCustForm(INITIAL_CUSTOMER);
      setCustOpen(false);
      showSuccess("Customer created and selected.");
    } catch (err) {
      setCustError(trnError(err));
    } finally {
      setSavingCust(false);
    }
  };

  const handleSaveBooking = async (e) => {
    e.preventDefault();
    setFormError("");
    const nextFieldErrors = {};
    if (!form.customer_id && !form.stay_booking_id) {
      nextFieldErrors.customer_id = "Select a customer or link a stay guest.";
    }
    if (!form.pickup_location.trim()) nextFieldErrors.pickup_location = "Pickup location is required.";
    if (!form.drop_location.trim()) nextFieldErrors.drop_location = "Drop location is required.";
    const timeChangedInEdit =
      editingBooking &&
      (form.pickup_date !== editingBooking.pickup_date || form.pickup_time !== editingBooking.pickup_time);
    if ((!editingBooking || timeChangedInEdit) && isPastSelection(form.pickup_date, form.pickup_time)) {
      nextFieldErrors.pickup_time = "Choose the current time or a future pickup time.";
    }
    if ((form.vehicle_id && !form.driver_id) || (form.driver_id && !form.vehicle_id)) {
      nextFieldErrors.vehicle_id = "Assign a vehicle and driver together, or leave both unassigned.";
      nextFieldErrors.driver_id = "Assign a vehicle and driver together, or leave both unassigned.";
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }

    setSaving(true);
    try {
      const payload = {
        booking_type: form.booking_type,
        customer_id: form.customer_id ? Number(form.customer_id) : null,
        stay_booking_id: form.stay_booking_id ? Number(form.stay_booking_id) : null,
        package_booking_id: form.package_booking_id ? Number(form.package_booking_id) : null,
        activity_booking_id: form.activity_booking_id ? Number(form.activity_booking_id) : null,
        service_type_id: form.service_type_id ? Number(form.service_type_id) : null,
        route_id: form.route_id ? Number(form.route_id) : null,
        pickup_location: form.pickup_location.trim(),
        drop_location: form.drop_location.trim(),
        pickup_date: form.pickup_date,
        pickup_time: form.pickup_time,
        estimated_distance_km: Number(form.estimated_distance_km || 0),
        estimated_duration_minutes: Number(form.estimated_duration_minutes || 60),
        passenger_count: Number(form.passenger_count || 1),
        vehicle_id: form.vehicle_id ? Number(form.vehicle_id) : null,
        driver_id: form.driver_id ? Number(form.driver_id) : null,
        base_price: form.base_price !== "" ? Number(form.base_price) : Number(computeSuggestedPrice(form)),
        additional_charges: Number(form.additional_charges || 0),
        discount_amount: Number(form.discount_amount || 0),
        notes: form.notes.trim() || null,
      };
      if (editingBooking) {
        const res = await transportApi.updateBooking(editingBooking.id, payload);
        showSuccess(`Booking ${res.data.booking_number} updated.`);
      } else {
        const res = await transportApi.createBooking({
          ...payload,
          passengers: passengers.filter((p) => p.passenger_name.trim()),
        });
        showSuccess(`Booking ${res.data.booking_number} created.`);
      }
      setFormOpen(false);
      await loadData();
    } catch (err) {
      setFormError(trnError(err));
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (id) => {
    try {
      const res = await transportApi.bookingDetail(id);
      setDetailBooking(res.data);
    } catch (err) {
      showError(trnError(err));
    }
  };

  const openAssignModal = async (b) => {
    try {
      const res = await transportApi.availability({
        pickup_date: b.pickup_date,
        pickup_time: b.pickup_time,
        duration_minutes: b.estimated_duration_minutes,
        passenger_count: b.passenger_count,
        service_type_id: b.service_type_id || undefined,
        exclude_booking_id: b.id,
      });
      setAssignAvail(res.data);
      setAssignVehicleId(b.vehicle_id ? String(b.vehicle_id) : "");
      setAssignDriverId(b.driver_id ? String(b.driver_id) : "");
      setAssignModalOpen(true);
    } catch (err) {
      showError(trnError(err));
    }
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!detailBooking || !assignVehicleId || !assignDriverId) return;
    setAssigning(true);
    try {
      const res = await transportApi.assignBooking(detailBooking.id, {
        vehicle_id: Number(assignVehicleId),
        driver_id: Number(assignDriverId),
      });
      setDetailBooking(res.data);
      setAssignModalOpen(false);
      showSuccess("Vehicle & driver assigned.");
      await loadData();
    } catch (err) {
      showError(trnError(err));
    } finally {
      setAssigning(false);
    }
  };

  const handleTripStatusSubmit = async (e) => {
    e.preventDefault();
    if (!tripModal) return;
    setUpdatingTrip(true);
    try {
      const res = await transportApi.updateTripStatus(tripModal.booking.id, {
        status: tripModal.targetStatus,
        reason: tripForm.reason.trim() || null,
        start_odometer_km: tripForm.start_odometer_km !== "" ? Number(tripForm.start_odometer_km) : null,
        end_odometer_km: tripForm.end_odometer_km !== "" ? Number(tripForm.end_odometer_km) : null,
        remarks: tripForm.remarks.trim() || null,
      });
      setDetailBooking(res.data);
      setTripModal(null);
      showSuccess(`Trip status updated to ${tripModal.targetStatus}.`);
      await loadData();
    } catch (err) {
      showError(trnError(err));
    } finally {
      setUpdatingTrip(false);
    }
  };

  const netPreview = Math.max(
    0,
    Number(form.base_price !== "" ? form.base_price : computeSuggestedPrice(form)) +
      Number(form.additional_charges || 0) -
      Number(form.discount_amount || 0)
  );

  const columns = [
    { key: "booking_number", label: "Booking #", cellClassName: "font-mono font-bold whitespace-nowrap" },
    {
      key: "customer_name",
      label: "Customer",
      render: (b) => (
        <div>
          <div className="font-semibold">{b.customer_name}</div>
          <div className="text-xs text-[#8A9AB2]">{b.customer_phone}</div>
        </div>
      ),
    },
    {
      key: "route",
      label: "Pickup → Drop",
      render: (b) => (
        <div className="min-w-[210px] max-w-[300px]">
          <div className="text-xs font-semibold break-words">{b.pickup_location} → {b.drop_location}</div>
          <div className="text-[11px] text-[#8A9AB2]">{b.booking_type}</div>
        </div>
      ),
    },
    {
      key: "pickup_date",
      label: "Date & Time",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (b) => `${trnDate(b.pickup_date)} · ${trnTime(b.pickup_time)}`,
    },
    {
      key: "assignment",
      label: "Vehicle & Driver",
      render: (b) =>
        b.vehicle_name ? (
          <div className="text-xs">
            <div className="font-semibold">{b.vehicle_name}</div>
            <div className="text-[#8A9AB2]">{b.driver_name}</div>
          </div>
        ) : (
          <span className="text-xs font-semibold text-amber-600">Unassigned</span>
        ),
    },
    { key: "passenger_count", label: "Pax", align: "right", cellClassName: "tabular-nums font-semibold" },
    { key: "total_amount", label: "Amount", align: "right", cellClassName: "font-semibold tabular-nums", render: (b) => trnMoney(b.total_amount) },
    { key: "status", label: "Status", align: "center", render: (b) => <StatusBadge status={b.status} size="sm" /> },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (b) => (
        <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => openDetail(b.id)} className="p-1.5 rounded-lg text-stone-500 hover:text-amber-600 cursor-pointer" title="View & Manage">
            <Eye size={15} />
          </button>
          {!["Completed", "Cancelled", "No Show"].includes(b.status) && (
            <button type="button" onClick={() => openEditBooking(b)} className="p-1.5 rounded-lg text-stone-500 hover:text-amber-600 cursor-pointer" title="Edit booking">
              <Edit3 size={15} />
            </button>
          )}
          {!b.invoice_id && b.status !== "Cancelled" && (
            <button
              type="button"
              onClick={() => navigate(`/transport/invoices?bookingId=${b.id}`)}
              className="p-1.5 rounded-lg text-stone-500 hover:text-emerald-600 cursor-pointer"
              title="Generate invoice"
            >
              <FilePlus2 size={15} />
            </button>
          )}
        </div>
      ),
    },
  ];

  const nextStatuses = (status) => {
    const map = {
      Pending: ["Confirmed", "Cancelled", "No Show"],
      Confirmed: ["Cancelled", "No Show"],
      Assigned: ["Driver En Route", "In Progress", "Cancelled", "No Show"],
      "Driver En Route": ["In Progress", "Cancelled", "No Show"],
      "In Progress": ["Completed", "Cancelled"],
    };
    return map[status] || [];
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bookings"
        actions={
          <button type="button" onClick={openCreateBooking} className={BUTTON_VARIANTS.primary}>
            <CalendarPlus size={15} /> New Transport Booking
          </button>
        }
      />

      {pageError && <AlertBanner variant="error" title="Error" message={pageError} onDismiss={() => setPageError("")} />}

      <div className={`${CARD_STYLES.base} w-fit max-w-full !p-2`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-52">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search booking #, guest..." className={`${INPUT_STYLES.base} pl-9 !py-1.5 text-xs`} />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${INPUT_STYLES.select} !w-auto min-w-[130px] !py-1.5 text-xs`}>
            <option value="">All Statuses</option>
            {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={`${INPUT_STYLES.select} !w-auto min-w-[145px] !py-1.5 text-xs`}>
            <option value="">All Booking Types</option>
            {BOOKING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={`${INPUT_STYLES.base} !w-auto !py-1.5 text-xs`} title="From date" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={`${INPUT_STYLES.base} !w-auto !py-1.5 text-xs`} title="To date" />
          {(searchQuery || statusFilter || typeFilter || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("");
                setTypeFilter("");
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
        emptyTitle="No transport bookings found"
        emptyDescription="Create a transport booking to dispatch a vehicle and driver."
        tableMinWidth="min-w-[920px]"
        pagination={{ currentPage: page, totalPages, totalRecords, pageSize, onPageChange: setPage }}
        onRowClick={(b) => openDetail(b.id)}
      />

      {/* CREATE / EDIT BOOKING MODAL */}
      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingBooking ? `Edit Booking · ${editingBooking.booking_number}` : "New Transport Booking"}
        size="lg"
      >
        <form onSubmit={handleSaveBooking} className="space-y-4">
          {formError && <AlertBanner variant="error" title="Booking Validation" message={formError} />}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Booking Type *</label>
              <select value={form.booking_type} onChange={(e) => setForm({ ...form, booking_type: e.target.value })} className={INPUT_STYLES.select}>
                {BOOKING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold">
                  Customer {form.stay_booking_id ? "(Auto-linked from Stay Guest)" : "*"}
                </label>
                <button type="button" onClick={() => setCustOpen(true)} className="text-[11px] font-semibold text-amber-600 hover:underline inline-flex items-center gap-1 cursor-pointer">
                  <UserPlus size={12} /> Quick Add Customer
                </button>
              </div>
              <select
                required={!form.stay_booking_id}
                value={form.customer_id}
                onChange={(e) => {
                  const nextCustId = e.target.value;
                  const cust = customers.find((c) => String(c.id) === nextCustId);
                  setFieldErrors((p) => ({ ...p, customer_id: "" }));
                  setForm((prev) => {
                    const next = { ...prev, customer_id: nextCustId };
                    if (nextCustId) {
                      const matchingPkgs = refs.package_bookings.filter(
                        (p) =>
                          String(p.customer_id) === nextCustId ||
                          (cust && p.customer_phone === cust.phone)
                      );
                      const matchingActs = refs.activity_bookings.filter(
                        (a) =>
                          String(a.customer_id) === nextCustId ||
                          (cust && a.customer_phone === cust.phone)
                      );
                      next.package_booking_id = matchingPkgs.length === 1 ? String(matchingPkgs[0].id) : "";
                      next.activity_booking_id = matchingActs.length === 1 ? String(matchingActs[0].id) : "";
                    } else {
                      next.package_booking_id = "";
                      next.activity_booking_id = "";
                    }
                    return next;
                  });
                }}
                className={INPUT_STYLES.select}
              >
                <option value="">
                  {selectedStayRef ? `${selectedStayRef.guest_name} (Will link from stay guest)` : "Select customer..."}
                </option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name} ({c.phone})</option>)}
              </select>
              {fieldErrors.customer_id && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.customer_id}</p>}
            </div>
          </div>

          {/* Resort Guest / Package / Activity Associations */}
          <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] border border-[#E5E9F0] dark:border-[#1E293B] p-3 space-y-2.5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold mb-1">Stay Guest & Booking (Optional)</label>
                <select
                  value={form.stay_booking_id}
                  onChange={(e) => {
                    const val = e.target.value;
                    const st = refs.stay_bookings.find((x) => String(x.id) === val);
                    setForm((prev) => {
                      const next = {
                        ...prev,
                        stay_booking_id: val,
                        customer_id: st?.customer_id ? String(st.customer_id) : (val ? "" : prev.customer_id),
                        passenger_count: st?.guests_count ? Number(st.guests_count) : prev.passenger_count,
                      };
                      if (st) {
                        const matchFn = (rec) =>
                          (st.customer_id && rec.customer_id && Number(rec.customer_id) === Number(st.customer_id)) ||
                          (st.guest_phone && rec.customer_phone === st.guest_phone) ||
                          (st.guest_email && rec.customer_email && rec.customer_email.toLowerCase() === st.guest_email.toLowerCase()) ||
                          (st.guest_name && rec.customer_name && rec.customer_name.trim().toLowerCase() === st.guest_name.trim().toLowerCase());
                        const pkgs = refs.package_bookings.filter(matchFn);
                        const acts = refs.activity_bookings.filter(matchFn);
                        next.package_booking_id = pkgs.length === 1 ? String(pkgs[0].id) : "";
                        next.activity_booking_id = acts.length === 1 ? String(acts[0].id) : "";
                      } else {
                        next.package_booking_id = "";
                        next.activity_booking_id = "";
                      }
                      return next;
                    });
                  }}
                  className={INPUT_STYLES.select}
                >
                  <option value="">None (Walk-in / External Guest)</option>
                  {refs.stay_bookings.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1">Applicable Package (Optional)</label>
                <select
                  value={form.package_booking_id}
                  onChange={(e) => {
                    const pk = filteredPackageRefs.find((x) => String(x.id) === e.target.value);
                    setForm((prev) => ({
                      ...prev,
                      package_booking_id: e.target.value,
                      booking_type: e.target.value ? "Package Transfer" : prev.booking_type,
                      customer_id: pk?.customer_id ? String(pk.customer_id) : prev.customer_id,
                      passenger_count: pk?.guests_count ? Number(pk.guests_count) : prev.passenger_count,
                    }));
                  }}
                  className={INPUT_STYLES.select}
                >
                  <option value="">
                    {activeGuestMatcher && filteredPackageRefs.length === 0 ? "No package for selected guest" : "None"}
                  </option>
                  {filteredPackageRefs.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1">Guest Activity (Optional)</label>
                <select
                  value={form.activity_booking_id}
                  onChange={(e) => {
                    const ac = filteredActivityRefs.find((x) => String(x.id) === e.target.value);
                    setForm((prev) => ({
                      ...prev,
                      activity_booking_id: e.target.value,
                      booking_type: e.target.value ? "Activity Transfer" : prev.booking_type,
                      customer_id: ac?.customer_id ? String(ac.customer_id) : prev.customer_id,
                      passenger_count: ac?.participant_count ? Number(ac.participant_count) : prev.passenger_count,
                    }));
                  }}
                  className={INPUT_STYLES.select}
                >
                  <option value="">
                    {activeGuestMatcher && filteredActivityRefs.length === 0 ? "No activity for selected guest" : "None"}
                  </option>
                  {filteredActivityRefs.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
            </div>
            {selectedStayRef && (
              <div className="text-[11px] text-stone-700 dark:text-stone-300 flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 border-t border-[#E5E9F0] dark:border-[#1E293B]">
                <span><strong>Guest:</strong> {selectedStayRef.guest_name}</span>
                <span><strong>Guest ID:</strong> {selectedStayRef.guest_reference}</span>
                {selectedStayRef.guest_phone && <span><strong>Phone:</strong> {selectedStayRef.guest_phone}</span>}
                {selectedStayRef.unit_label && <span><strong>Stay Unit:</strong> {selectedStayRef.unit_label}</span>}
                <span><strong>Stay Pax:</strong> {selectedStayRef.guests_count}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Transport Service</label>
              <select
                value={form.service_type_id}
                onChange={(e) => {
                  const next = { ...form, service_type_id: e.target.value };
                  next.base_price = computeSuggestedPrice(next);
                  setForm(next);
                }}
                className={INPUT_STYLES.select}
              >
                <option value="">Custom / Route Rate</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.service_name} ({s.pricing_model})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Route Template</label>
              <select
                value={form.route_id}
                onChange={(e) => {
                  const rt = routes.find((r) => String(r.id) === e.target.value);
                  const next = {
                    ...form,
                    route_id: e.target.value,
                    pickup_location: rt ? rt.starting_location : form.pickup_location,
                    drop_location: rt ? rt.destination : form.drop_location,
                    estimated_distance_km: rt ? String(rt.approximate_distance_km) : form.estimated_distance_km,
                    estimated_duration_minutes: rt ? rt.estimated_duration_minutes : form.estimated_duration_minutes,
                  };
                  next.base_price = computeSuggestedPrice(next);
                  setForm(next);
                }}
                className={INPUT_STYLES.select}
              >
                <option value="">Custom Pickup / Drop</option>
                {routes.map((r) => <option key={r.id} value={r.id}>{r.route_name} ({trnMoney(r.standard_price)})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Passengers *</label>
              <input
                type="number"
                min={1}
                max={100}
                required
                value={form.passenger_count}
                onChange={(e) => setForm({ ...form, passenger_count: e.target.value })}
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Pickup Location *</label>
              <input type="text" required value={form.pickup_location} onChange={(e) => { setForm({ ...form, pickup_location: e.target.value }); setFieldErrors((p) => ({ ...p, pickup_location: "" })); }} aria-invalid={Boolean(fieldErrors.pickup_location)} className={`${INPUT_STYLES.base} ${fieldErrors.pickup_location ? "border-red-500 focus:border-red-500" : ""}`} />
              {fieldErrors.pickup_location && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.pickup_location}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Drop Location *</label>
              <input type="text" required value={form.drop_location} onChange={(e) => { setForm({ ...form, drop_location: e.target.value }); setFieldErrors((p) => ({ ...p, drop_location: "" })); }} aria-invalid={Boolean(fieldErrors.drop_location)} className={`${INPUT_STYLES.base} ${fieldErrors.drop_location ? "border-red-500 focus:border-red-500" : ""}`} />
              {fieldErrors.drop_location && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.drop_location}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold mb-1">Pickup Date *</label>
                <input
                  type="date"
                  required
                  min={editingBooking ? undefined : kolkataTodayIso(0)}
                  value={form.pickup_date}
                  onChange={(e) => { setForm({ ...form, pickup_date: e.target.value }); setFieldErrors((p) => ({ ...p, pickup_time: "" })); }}
                  className={INPUT_STYLES.base}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Pickup Time *</label>
                <input
                  type="time"
                  required
                  min={!editingBooking && form.pickup_date === kolkataTodayIso(0) ? kolkataCurrentTimeHHMM() : undefined}
                  value={form.pickup_time}
                  onChange={(e) => { setForm({ ...form, pickup_time: e.target.value }); setFieldErrors((p) => ({ ...p, pickup_time: "" })); }}
                  aria-invalid={Boolean(fieldErrors.pickup_time)}
                  className={`${INPUT_STYLES.base} ${fieldErrors.pickup_time ? "border-red-500 focus:border-red-500" : ""}`}
                />
                {fieldErrors.pickup_time && <p className="mt-1 text-xs text-red-600 dark:text-red-400 col-span-2">{fieldErrors.pickup_time}</p>}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Est. Distance (km)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.estimated_distance_km}
                onChange={(e) => {
                  const next = { ...form, estimated_distance_km: e.target.value };
                  next.base_price = computeSuggestedPrice(next);
                  setForm(next);
                }}
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Est. Duration (min)</label>
              <input
                type="number"
                min={1}
                value={form.estimated_duration_minutes}
                onChange={(e) => {
                  const next = { ...form, estimated_duration_minutes: e.target.value };
                  next.base_price = computeSuggestedPrice(next);
                  setForm(next);
                }}
                className={INPUT_STYLES.base}
              />
            </div>
            <div className="flex items-end">
              <button type="button" onClick={() => checkAvailability()} disabled={checkingAvail} className={`${BUTTON_VARIANTS.secondary} w-full`}>
                <Car size={14} /> {checkingAvail ? "Checking..." : "Refresh Available Fleet"}
              </button>
            </div>
          </div>

          {availData && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 space-y-2.5">
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                Available for {trnDate(availData.pickup_date)} ({trnTime(availData.pickup_time)} – {trnTime(availData.estimated_end_time)}) ·{" "}
                {availData.available_vehicles.length} vehicle{availData.available_vehicles.length === 1 ? "" : "s"} (capacity ≥ {form.passenger_count}),{" "}
                {availData.available_drivers.length} driver{availData.available_drivers.length === 1 ? "" : "s"} eligible
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Assign Vehicle (≥ {form.passenger_count} seats)</label>
                  <select value={form.vehicle_id} onChange={(e) => { setForm({ ...form, vehicle_id: e.target.value }); setFieldErrors((p) => ({ ...p, vehicle_id: "", driver_id: "" })); }} aria-invalid={Boolean(fieldErrors.vehicle_id)} className={`${INPUT_STYLES.select} ${fieldErrors.vehicle_id ? "border-red-500 focus:border-red-500" : ""}`}>
                    <option value="">
                      {availData.available_vehicles.length === 0 ? `No vehicles with ≥ ${form.passenger_count} seats available` : "Leave Unassigned"}
                    </option>
                    {availData.available_vehicles.map((v) => (
                      <option key={v.id} value={v.id}>{v.vehicle_name} ({v.registration_number} · {v.seating_capacity} seats)</option>
                    ))}
                  </select>
                  {fieldErrors.vehicle_id && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.vehicle_id}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Assign Driver</label>
                  <select value={form.driver_id} onChange={(e) => { setForm({ ...form, driver_id: e.target.value }); setFieldErrors((p) => ({ ...p, vehicle_id: "", driver_id: "" })); }} aria-invalid={Boolean(fieldErrors.driver_id)} className={`${INPUT_STYLES.select} ${fieldErrors.driver_id ? "border-red-500 focus:border-red-500" : ""}`}>
                    <option value="">Leave Unassigned</option>
                    {availData.available_drivers.map((d) => (
                      <option key={d.id} value={d.id}>{d.driver_name} ({d.phone})</option>
                    ))}
                  </select>
                  {fieldErrors.driver_id && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.driver_id}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Passenger List (create mode) */}
          {!editingBooking && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold">Additional Passenger Details (Optional)</label>
                <button
                  type="button"
                  onClick={() => setPassengers([...passengers, { passenger_name: "", phone: "", age: "" }])}
                  className="text-xs font-semibold text-amber-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={12} /> Add Passenger
                </button>
              </div>
              {passengers.map((p, idx) => (
                <div key={idx} className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Passenger Name"
                    value={p.passenger_name}
                    onChange={(e) => {
                      const copy = [...passengers];
                      copy[idx].passenger_name = e.target.value;
                      setPassengers(copy);
                    }}
                    className={INPUT_STYLES.base}
                  />
                  <input
                    type="text"
                    placeholder="Phone"
                    value={p.phone}
                    onChange={(e) => {
                      const copy = [...passengers];
                      copy[idx].phone = e.target.value;
                      setPassengers(copy);
                    }}
                    className={INPUT_STYLES.base}
                  />
                  <input
                    type="number"
                    placeholder="Age"
                    value={p.age}
                    onChange={(e) => {
                      const copy = [...passengers];
                      copy[idx].age = e.target.value;
                      setPassengers(copy);
                    }}
                    className={INPUT_STYLES.base}
                  />
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold mb-1">Notes</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={INPUT_STYLES.base} placeholder="Pickup instructions, flight number, luggage notes..." />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] border border-[#E5E9F0] dark:border-[#1E293B] p-3">
            <div>
              <label className="block text-[11px] font-semibold mb-1">Base Fare (INR)</label>
              <input type="number" step="0.01" min={0} value={form.base_price} placeholder={computeSuggestedPrice(form)} onChange={(e) => setForm({ ...form, base_price: e.target.value })} className={INPUT_STYLES.base} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold mb-1">Additional Charges</label>
              <input type="number" step="0.01" min={0} value={form.additional_charges} onChange={(e) => setForm({ ...form, additional_charges: e.target.value })} className={INPUT_STYLES.base} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold mb-1">Discount</label>
              <input type="number" step="0.01" min={0} value={form.discount_amount} onChange={(e) => setForm({ ...form, discount_amount: e.target.value })} className={INPUT_STYLES.base} />
            </div>
            <div className="flex flex-col justify-center items-end">
              <span className="text-[10px] font-bold uppercase text-[#8A9AB2]">Estimated Total</span>
              <span className="text-lg font-bold text-amber-600 tabular-nums">{trnMoney(netPreview)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E9F0] dark:border-[#1E293B]">
            <button type="button" onClick={() => setFormOpen(false)} className={BUTTON_VARIANTS.secondary}>Cancel</button>
            <button type="submit" disabled={saving} className={BUTTON_VARIANTS.primary}>
              {saving ? (editingBooking ? "Saving..." : "Creating...") : (editingBooking ? "Save Changes" : "Create Booking")}
            </button>
          </div>
        </form>
      </Modal>

      {/* QUICK CUSTOMER MODAL */}
      <Modal isOpen={custOpen} onClose={() => setCustOpen(false)} title="Create Customer" size="sm">
        <form onSubmit={handleSaveCustomer} className="space-y-3">
          {custError && <AlertBanner variant="error" title="Error" message={custError} />}
          <div>
            <label className="block text-xs font-semibold mb-1">Full Name *</label>
            <input type="text" required value={custForm.full_name} onChange={(e) => { setCustForm({ ...custForm, full_name: e.target.value }); setCustFieldErrors((p) => ({ ...p, full_name: "" })); }} aria-invalid={Boolean(custFieldErrors.full_name)} className={`${INPUT_STYLES.base} ${custFieldErrors.full_name ? "border-red-500" : ""}`} />
            {custFieldErrors.full_name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{custFieldErrors.full_name}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Mobile Number *</label>
            <input type="text" required value={custForm.phone} onChange={(e) => { setCustForm({ ...custForm, phone: e.target.value }); setCustFieldErrors((p) => ({ ...p, phone: "" })); }} aria-invalid={Boolean(custFieldErrors.phone)} className={`${INPUT_STYLES.base} ${custFieldErrors.phone ? "border-red-500" : ""}`} />
            {custFieldErrors.phone && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{custFieldErrors.phone}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Email *</label>
            <input type="email" required value={custForm.email} onChange={(e) => { setCustForm({ ...custForm, email: e.target.value }); setCustFieldErrors((p) => ({ ...p, email: "" })); }} aria-invalid={Boolean(custFieldErrors.email)} className={`${INPUT_STYLES.base} ${custFieldErrors.email ? "border-red-500" : ""}`} />
            {custFieldErrors.email && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{custFieldErrors.email}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Address</label>
            <input type="text" value={custForm.address} onChange={(e) => setCustForm({ ...custForm, address: e.target.value })} className={INPUT_STYLES.base} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCustOpen(false)} className={BUTTON_VARIANTS.secondary}>Cancel</button>
            <button type="submit" disabled={savingCust} className={BUTTON_VARIANTS.primary}>{savingCust ? "Saving..." : "Save Customer"}</button>
          </div>
        </form>
      </Modal>

      {/* BOOKING DETAIL & TRIP WORKFLOW MODAL */}
      <Modal
        isOpen={Boolean(detailBooking)}
        onClose={() => setDetailBooking(null)}
        title={detailBooking ? `${detailBooking.booking_number} · ${detailBooking.customer_name}` : ""}
        size="lg"
      >
        {detailBooking && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E5E9F0] dark:border-[#1E293B]">
              <div className="flex items-center gap-2">
                <StatusBadge status={detailBooking.status} />
                <span className="text-xs font-semibold text-[#64748B] dark:text-[#8A9AB2]">{detailBooking.booking_type}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!["Completed", "Cancelled", "No Show"].includes(detailBooking.status) && (
                  <button type="button" onClick={() => openEditBooking(detailBooking)} className={BUTTON_VARIANTS.secondary}>
                    <Edit3 size={14} /> Edit Booking
                  </button>
                )}
                {!["Completed", "Cancelled", "No Show"].includes(detailBooking.status) && (
                  <button type="button" onClick={() => openAssignModal(detailBooking)} className={BUTTON_VARIANTS.secondary}>
                    <Car size={14} /> {detailBooking.vehicle_id ? "Reassign Fleet" : "Assign Vehicle & Driver"}
                  </button>
                )}
                {nextStatuses(detailBooking.status).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      setTripForm({ reason: "", start_odometer_km: "", end_odometer_km: "", remarks: "" });
                      setTripModal({ booking: detailBooking, targetStatus: st });
                    }}
                    className={st === "Cancelled" || st === "No Show" ? BUTTON_VARIANTS.danger : BUTTON_VARIANTS.primary}
                  >
                    {st === "Completed" ? <CheckCircle2 size={14} /> : st === "Cancelled" ? <XCircle size={14} /> : <Navigation size={14} />}
                    <span>{st}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div className="sm:col-span-2 lg:col-span-3 rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] border border-[#E5E9F0] dark:border-[#1E293B] p-2.5">
                <p className="text-[10px] font-bold uppercase text-[#8A9AB2]">Pickup → Drop</p>
                <p className="mt-0.5 font-semibold break-words">{detailBooking.pickup_location} → {detailBooking.drop_location}</p>
              </div>
              {[
                ["Date & Time", `${trnDate(detailBooking.pickup_date)} · ${trnTime(detailBooking.pickup_time)} – ${trnTime(detailBooking.estimated_end_time)}`],
                ["Passengers", `${detailBooking.passenger_count}`],
                ["Vehicle", detailBooking.vehicle_name ? `${detailBooking.vehicle_name} (${detailBooking.vehicle_reg})` : "Unassigned"],
                ["Driver", detailBooking.driver_name ? `${detailBooking.driver_name} (${detailBooking.driver_phone})` : "Unassigned"],
                ["Total Fare", `${trnMoney(detailBooking.total_amount)} (${detailBooking.payment_status || "Unbilled"})`],
                [
                  "Linked Stay",
                  detailBooking.stay_booking_number
                    ? `${detailBooking.stay_booking_number}${detailBooking.stay_guest_name ? ` · ${detailBooking.stay_guest_name}` : ""}${detailBooking.stay_guest_reference ? ` (${detailBooking.stay_guest_reference})` : ""}`
                    : "—",
                ],
                [
                  "Linked Package",
                  detailBooking.package_booking_number
                    ? `${detailBooking.package_booking_number}${detailBooking.package_name ? ` · ${detailBooking.package_name}` : ""}`
                    : "—",
                ],
                [
                  "Linked Activity",
                  detailBooking.activity_booking_number
                    ? `${detailBooking.activity_booking_number}${detailBooking.activity_name ? ` · ${detailBooking.activity_name}` : ""}`
                    : "—",
                ],
                ["Notes", detailBooking.notes || "—"],
              ].map(([k, val]) => (
                <div key={k} className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] border border-[#E5E9F0] dark:border-[#1E293B] p-2.5 min-w-0">
                  <p className="text-[10px] font-bold uppercase text-[#8A9AB2]">{k}</p>
                  <p className="mt-0.5 font-semibold break-words">{val}</p>
                </div>
              ))}
            </div>

            {(detailBooking.actual_departure_at || detailBooking.actual_arrival_at || detailBooking.start_odometer_km != null) && (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 text-xs grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div><span className="text-[#8A9AB2]">Departure:</span> <strong>{trnDateTime(detailBooking.actual_departure_at)}</strong></div>
                <div><span className="text-[#8A9AB2]">Arrival:</span> <strong>{trnDateTime(detailBooking.actual_arrival_at)}</strong></div>
                <div><span className="text-[#8A9AB2]">Odometer:</span> <strong>{detailBooking.start_odometer_km ?? "—"} → {detailBooking.end_odometer_km ?? "—"} km</strong></div>
                <div><span className="text-[#8A9AB2]">Remarks:</span> <strong>{detailBooking.trip_remarks || "—"}</strong></div>
              </div>
            )}

            {detailBooking.history?.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase text-[#8A9AB2] mb-2">Trip Audit History</h4>
                <div className="space-y-1.5 max-h-44 overflow-y-auto text-xs">
                  {detailBooking.history.map((h) => (
                    <div key={h.id} className="flex items-center justify-between rounded-lg bg-[#F8FAFC] dark:bg-[#151D29] px-3 py-2">
                      <div>
                        <span className="font-semibold">{h.action}:</span> {h.previous_status ? `${h.previous_status} → ` : ""}{h.new_status}
                        {h.reason && <span className="text-[#8A9AB2]"> · {h.reason}</span>}
                      </div>
                      <span className="text-[11px] text-[#8A9AB2]">{trnDateTime(h.changed_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ASSIGN FLEET & DRIVER MODAL */}
      <Modal isOpen={assignModalOpen} onClose={() => setAssignModalOpen(false)} title="Assign Eligible Vehicle & Driver" size="md">
        <form onSubmit={handleAssignSubmit} className="space-y-3">
          {assignAvail && (
            <>
              <div>
                <label className="block text-xs font-semibold mb-1">Available Vehicles (Capacity ≥ {assignAvail.passenger_count})</label>
                <select required value={assignVehicleId} onChange={(e) => setAssignVehicleId(e.target.value)} className={INPUT_STYLES.select}>
                  <option value="">Select vehicle...</option>
                  {assignAvail.available_vehicles.map((v) => (
                    <option key={v.id} value={v.id}>{v.vehicle_name} ({v.registration_number} · {v.seating_capacity} seats)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Available Drivers</label>
                <select required value={assignDriverId} onChange={(e) => setAssignDriverId(e.target.value)} className={INPUT_STYLES.select}>
                  <option value="">Select driver...</option>
                  {assignAvail.available_drivers.map((d) => (
                    <option key={d.id} value={d.id}>{d.driver_name} ({d.phone})</option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setAssignModalOpen(false)} className={BUTTON_VARIANTS.secondary}>Cancel</button>
            <button type="submit" disabled={assigning} className={BUTTON_VARIANTS.primary}>{assigning ? "Assigning..." : "Confirm Assignment"}</button>
          </div>
        </form>
      </Modal>

      {/* TRIP STATUS TRANSITION MODAL */}
      <Modal
        isOpen={Boolean(tripModal)}
        onClose={() => setTripModal(null)}
        title={tripModal ? `Update Trip Status → ${tripModal.targetStatus}` : ""}
        size="sm"
      >
        {tripModal && (
          <form onSubmit={handleTripStatusSubmit} className="space-y-3">
            {tripModal.targetStatus === "Cancelled" && (
              <div>
                <label className="block text-xs font-semibold mb-1">Cancellation Reason *</label>
                <textarea required minLength={3} rows={2} value={tripForm.reason} onChange={(e) => setTripForm({ ...tripForm, reason: e.target.value })} className={INPUT_STYLES.base} />
              </div>
            )}
            {tripModal.targetStatus === "In Progress" && (
              <div>
                <label className="block text-xs font-semibold mb-1">Start Odometer Reading (km)</label>
                <input type="number" min={0} value={tripForm.start_odometer_km} onChange={(e) => setTripForm({ ...tripForm, start_odometer_km: e.target.value })} className={INPUT_STYLES.base} />
              </div>
            )}
            {tripModal.targetStatus === "Completed" && (
              <div>
                <label className="block text-xs font-semibold mb-1">End Odometer Reading (km)</label>
                <input type="number" min={0} value={tripForm.end_odometer_km} onChange={(e) => setTripForm({ ...tripForm, end_odometer_km: e.target.value })} className={INPUT_STYLES.base} />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold mb-1">Trip Remarks</label>
              <textarea rows={2} value={tripForm.remarks} onChange={(e) => setTripForm({ ...tripForm, remarks: e.target.value })} className={INPUT_STYLES.base} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setTripModal(null)} className={BUTTON_VARIANTS.secondary}>Cancel</button>
              <button type="submit" disabled={updatingTrip} className={BUTTON_VARIANTS.primary}>{updatingTrip ? "Updating..." : "Confirm"}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
