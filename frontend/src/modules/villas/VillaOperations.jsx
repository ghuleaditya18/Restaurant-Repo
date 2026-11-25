import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BarChart3,
  CheckCircle2,
  CreditCard,
  Download,
  Edit3,
  Eye,
  FileText,
  IndianRupee,
  Percent,
  Plus,
  Power,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import DeleteConfirm from "../../components/DeleteConfirm";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import StatCard from "../../components/StatCard";
import StatusBadge from "../../components/StatusBadge";
import { useNotification } from "../../context/NotificationContext";
import { getBusinessProfile, updateBusinessProfile } from "../../services/businessProfileService";
import {
  BUTTON_VARIANTS,
  CARD_STYLES,
  INPUT_STYLES,
} from "../../utils/themeTokens";
import {
  clearPaymentForm,
  getPaymentForm,
  setPaymentFormError,
  setPaymentFormField,
  validateInvoicePayment,
} from "./paymentFormState";
import VillaDataTable from "./VillaDataTable";
import {
  villaDateRange,
  villaDateTime,
  villaDateWithTime,
  villaError,
  villaMoney,
  villasApi,
} from "./villasApi";

const PAGE_SIZE = 10;

function toIsoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function paginate(items, page) {
  const totalRecords = items.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  return {
    items: items.slice(start, start + PAGE_SIZE),
    totalRecords,
    totalPages,
    currentPage,
  };
}

function savePdfBlob(blob, filename) {
  const pdfBlob =
    blob instanceof Blob && blob.type === "application/pdf"
      ? blob
      : new Blob([blob], { type: "application/pdf" });
  const url = URL.createObjectURL(pdfBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const REQUEST_STATUSES = [
  "Requested",
  "Scheduled",
  "In Progress",
  "Completed",
  "Cancelled",
];

export default function VillaOperations({ view = "services" }) {
  const [searchParams] = useSearchParams();
  const { showSuccess, showError, confirm } = useNotification();

  const initialSearch = searchParams.get("search") || "";
  const initialBookingId = searchParams.get("bookingId") || "";

  const [services, setServices] = useState([]);
  const [requests, setRequests] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [staff, setStaff] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Guest Services state
  const [serviceModal, setServiceModal] = useState(null);
  const [serviceForm, setServiceForm] = useState({
    name: "",
    description: "",
    price: "",
    is_active: true,
  });
  const [serviceFormError, setServiceFormError] = useState("");
  const [savingService, setSavingService] = useState(false);
  const [deleteServiceTarget, setDeleteServiceTarget] = useState(null);
  const [deleteServiceLoading, setDeleteServiceLoading] = useState(false);
  const [deleteServiceError, setDeleteServiceError] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");

  const [requestForm, setRequestForm] = useState({
    booking_id: initialBookingId,
    service_id: "",
    staff_id: "",
    quantity: 1,
    scheduled_for: "",
    notes: "",
  });
  const [reqSearch, setReqSearch] = useState(initialSearch);
  const [reqStatusFilter, setReqStatusFilter] = useState("");
  const [reqPage, setReqPage] = useState(1);
  const [deleteReqTarget, setDeleteReqTarget] = useState(null);
  const [deleteReqLoading, setDeleteReqLoading] = useState(false);
  const [deleteReqError, setDeleteReqError] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState(new Set());
  const [selectedRequestIds, setSelectedRequestIds] = useState(new Set());
  const [bulkDeleteKind, setBulkDeleteKind] = useState("");
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [bulkDeleteFailures, setBulkDeleteFailures] = useState([]);

  // Invoices state (Phase 1 independent per-invoice paymentForms preserved)
  const [paymentForms, setPaymentForms] = useState({});
  const [expandedPayInvoiceIds, setExpandedPayInvoiceIds] = useState({});
  const [payingInvoiceId, setPayingInvoiceId] = useState(null);
  const [downloadingPdfId, setDownloadingPdfId] = useState(null);
  const [invoiceSearch, setInvoiceSearch] = useState(initialSearch);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("");
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoiceModal, setInvoiceModal] = useState(null);
  const [refundForm, setRefundForm] = useState({
    payment_id: "",
    refund_amount: "",
    refund_method: "UPI",
    refund_reference: "",
    reason: "",
    error: "",
  });
  const [refunding, setRefunding] = useState(false);

  // Reports state
  const [reportRange, setReportRange] = useState({
    start_date: toIsoDate(-30),
    end_date: toIsoDate(30),
  });
  const [reportPage, setReportPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (view === "invoices") {
        const res = await villasApi.invoices();
        setInvoices(res.data || []);
      } else if (view === "reports") {
        const [repRes, bkRes] = await Promise.all([
          villasApi.reports({
            start_date: reportRange.start_date || undefined,
            end_date: reportRange.end_date || undefined,
          }),
          villasApi.bookings({
            start_date: reportRange.start_date || undefined,
            end_date: reportRange.end_date || undefined,
          }),
        ]);
        setReportData(repRes.data);
        setBookings(bkRes.data || []);
      } else if (view === "settings") {
        const prof = await getBusinessProfile();
        setProfile(prof);
      } else {
        const [svcRes, reqRes, bkRes, stfRes] = await Promise.all([
          villasApi.services(),
          villasApi.allServiceRequests(),
          villasApi.bookings(),
          villasApi.staff(),
        ]);
        const svcList = svcRes.data || [];
        const bkList = bkRes.data || [];
        setServices(svcList);
        setRequests(reqRes.data || []);
        setBookings(bkList);
        setStaff(stfRes.data || []);

        setRequestForm((prev) => {
          const activeCheckedIn = bkList.filter((b) => b.status === "Checked In");
          const firstActiveSvc = svcList.find((s) => s.is_active);
          return {
            ...prev,
            booking_id:
              prev.booking_id && activeCheckedIn.some((b) => String(b.id) === String(prev.booking_id))
                ? prev.booking_id
                : String(activeCheckedIn[0]?.id || ""),
            service_id:
              prev.service_id && svcList.some((s) => String(s.id) === String(prev.service_id) && s.is_active)
                ? prev.service_id
                : String(firstActiveSvc?.id || ""),
          };
        });
      }
      setError("");
    } catch (err) {
      setError(villaError(err));
    } finally {
      setLoading(false);
    }
  }, [view, reportRange.start_date, reportRange.end_date]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setSelectedServiceIds(new Set());
    setBulkDeleteFailures([]);
  }, [serviceSearch]);

  useEffect(() => {
    setSelectedRequestIds(new Set());
    setBulkDeleteFailures([]);
  }, [reqSearch, reqStatusFilter, reqPage]);

  const runAction = async (fn, successMsg) => {
    try {
      await fn();
      setError("");
      if (successMsg) showSuccess(successMsg);
      await load();
    } catch (err) {
      const msg = villaError(err);
      setError(msg);
      showError(msg);
    }
  };

  // --- Guest Services Handlers ---
  const openCreateService = () => {
    setServiceFormError("");
    setServiceForm({ name: "", description: "", price: "", is_active: true });
    setServiceModal({ mode: "create", item: null });
  };

  const openEditService = (svc) => {
    setServiceFormError("");
    setServiceForm({
      name: svc.name || "",
      description: svc.description || "",
      price: svc.price ?? "",
      is_active: Boolean(svc.is_active),
    });
    setServiceModal({ mode: "edit", item: svc });
  };

  const handleSaveService = async (e) => {
    e.preventDefault();
    setServiceFormError("");
    if (!serviceForm.name.trim() || serviceForm.name.trim().length < 2) {
      setServiceFormError("Service name must contain at least 2 characters.");
      return;
    }
    if (serviceForm.price === "" || Number(serviceForm.price) < 0) {
      setServiceFormError("Enter a valid non-negative price.");
      return;
    }
    setSavingService(true);
    const payload = {
      name: serviceForm.name.trim(),
      description: serviceForm.description.trim() || null,
      price: Number(serviceForm.price),
      is_active: Boolean(serviceForm.is_active),
    };
    try {
      if (serviceModal?.mode === "edit") {
        await villasApi.updateService(serviceModal.item.id, payload);
        showSuccess(`Updated guest service "${payload.name}".`);
      } else {
        await villasApi.createService(payload);
        showSuccess(`Added guest service "${payload.name}".`);
      }
      setServiceModal(null);
      await load();
    } catch (err) {
      setServiceFormError(villaError(err));
    } finally {
      setSavingService(false);
    }
  };

  const handleDeleteService = async () => {
    if (!deleteServiceTarget) return;
    setDeleteServiceLoading(true);
    setDeleteServiceError("");
    try {
      await villasApi.deleteService(deleteServiceTarget.id);
      showSuccess(`Removed service "${deleteServiceTarget.name}".`);
      setDeleteServiceTarget(null);
      await load();
    } catch (err) {
      setDeleteServiceError(villaError(err));
    } finally {
      setDeleteServiceLoading(false);
    }
  };

  const handleDeleteServiceRequest = async () => {
    if (!deleteReqTarget) return;
    setDeleteReqLoading(true);
    setDeleteReqError("");
    try {
      await villasApi.deleteServiceRequest(deleteReqTarget.id);
      showSuccess(`Removed service request "${deleteReqTarget.service_name}".`);
      setDeleteReqTarget(null);
      await load();
    } catch (err) {
      setDeleteReqError(villaError(err));
    } finally {
      setDeleteReqLoading(false);
    }
  };

  const confirmBulkDelete = async () => {
    const isService = bulkDeleteKind === "services";
    const ids = isService ? selectedServiceIds : selectedRequestIds;
    setBulkDeleteLoading(true);
    const failures = [];
    let deleted = 0;
    for (const id of ids) {
      const item = isService ? services.find((row) => row.id === id) : requests.find((row) => row.id === id);
      try {
        if (isService) await villasApi.deleteService(id);
        else await villasApi.deleteServiceRequest(id);
        deleted += 1;
      } catch (err) {
        failures.push({ id, name: isService ? item?.name : `${item?.service_name || "Service"} (${item?.booking_number || `#${id}`})`, reason: villaError(err) });
      }
    }
    if (isService) setSelectedServiceIds(new Set(failures.map((item) => item.id)));
    else setSelectedRequestIds(new Set(failures.map((item) => item.id)));
    setBulkDeleteFailures(failures);
    setBulkDeleteKind("");
    await load();
    if (deleted) showSuccess(`Deleted ${deleted} ${isService ? "service" : "request"}${deleted !== 1 ? "s" : ""}.`);
    if (failures.length) showError(`${failures.length} record${failures.length !== 1 ? "s were" : " was"} protected; see the details below.`);
    setBulkDeleteLoading(false);
  };

  const toggleSelection = (setter, id) => {
    setBulkDeleteFailures([]);
    setter((previous) => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const togglePageSelection = (setter, ids) => {
    setBulkDeleteFailures([]);
    setter((previous) => {
      const next = new Set(previous);
      const allSelected = ids.length > 0 && ids.every((id) => previous.has(id));
      ids.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  // --- Invoices Handlers (Phase 1 & 2 intact) ---
  const handlePaymentSubmit = async (e, invoice) => {
    e.preventDefault();
    const rowForm = getPaymentForm(paymentForms, invoice.id);
    const balance = Number(
      Number(invoice.balance_due ?? Number(invoice.total_amount) - Number(invoice.paid_amount)).toFixed(2)
    );
    const validationError = validateInvoicePayment(rowForm, balance);
    if (validationError) {
      setPaymentForms((prev) => setPaymentFormError(prev, invoice.id, validationError));
      return;
    }
    setPayingInvoiceId(invoice.id);
    try {
      await villasApi.receivePayment(invoice.id, {
        amount: Number(rowForm.amount),
        method: rowForm.method,
        reference: rowForm.reference?.trim() || undefined,
      });
      setPaymentForms((prev) => clearPaymentForm(prev, invoice.id));
      setExpandedPayInvoiceIds((prev) => ({ ...prev, [invoice.id]: false }));
      setError("");
      showSuccess("Payment recorded.");
      await load();
    } catch (err) {
      const msg = villaError(err);
      setPaymentForms((prev) => setPaymentFormError(prev, invoice.id, msg));
      showError(msg);
    } finally {
      setPayingInvoiceId(null);
    }
  };

  const handleDownloadPdf = async (invoice) => {
    setDownloadingPdfId(invoice.id);
    try {
      const blob = await villasApi.downloadInvoicePdf(invoice.id);
      if (!blob || blob.size === 0) {
        throw new Error("Generated PDF is empty.");
      }
      savePdfBlob(blob, `Villa-Invoice-${invoice.invoice_number}.pdf`);
      showSuccess(`Downloaded ${invoice.invoice_number}.pdf`);
    } catch (err) {
      const msg = villaError(err);
      setError(msg);
      showError(msg);
    } finally {
      setDownloadingPdfId(null);
    }
  };

  const openInvoiceDetails = async (invoice, preselectPayment = null) => {
    setInvoiceModal({ invoice, history: null, loading: true, error: "" });
    setRefundForm({
      payment_id: preselectPayment ? String(preselectPayment.id) : "",
      refund_amount: preselectPayment ? String(preselectPayment.refundable_amount) : "",
      refund_method: preselectPayment ? preselectPayment.method : "UPI",
      refund_reference: "",
      reason: "",
      error: "",
    });
    try {
      const [detailRes, historyRes] = await Promise.all([
        villasApi.invoiceDetail(invoice.id),
        villasApi.invoicePayments(invoice.id),
      ]);
      setInvoiceModal({
        invoice: detailRes.data,
        history: historyRes.data,
        loading: false,
        error: "",
      });
    } catch (err) {
      setInvoiceModal({ invoice, history: null, loading: false, error: villaError(err) });
    }
  };

  const handleRefundSubmit = async (e) => {
    e.preventDefault();
    if (!invoiceModal?.invoice) return;
    const inv = invoiceModal.invoice;
    const payments = invoiceModal.history?.payments || inv.payments || [];
    const selectedPayment = refundForm.payment_id
      ? payments.find((p) => String(p.id) === String(refundForm.payment_id))
      : null;
    const maxRefundable = selectedPayment
      ? Number(selectedPayment.refundable_amount)
      : Number(invoiceModal.history?.paid_amount ?? inv.paid_amount ?? 0);

    const amountNum = Number(refundForm.refund_amount);
    if (!refundForm.refund_amount || !Number.isFinite(amountNum) || amountNum <= 0) {
      setRefundForm((prev) => ({ ...prev, error: "Enter a valid refund amount greater than zero." }));
      return;
    }
    if (Number(amountNum.toFixed(2)) > Number(maxRefundable.toFixed(2))) {
      setRefundForm((prev) => ({ ...prev, error: `Refund amount cannot exceed ${villaMoney(maxRefundable)}.` }));
      return;
    }
    if (!refundForm.reason.trim() || refundForm.reason.trim().length < 2) {
      setRefundForm((prev) => ({ ...prev, error: "Refund reason is required." }));
      return;
    }

    const ok = await confirm({
      title: "Confirm Payment Refund?",
      message: `Issue a refund of ${villaMoney(amountNum)} via ${refundForm.refund_method} for invoice ${inv.invoice_number}? Original payment records will remain preserved.`,
      confirmText: "Issue Refund",
      cancelText: "Cancel",
      variant: "warning",
    });
    if (!ok) return;

    setRefunding(true);
    setRefundForm((prev) => ({ ...prev, error: "" }));
    try {
      await villasApi.issueRefund(inv.id, {
        payment_id: refundForm.payment_id ? Number(refundForm.payment_id) : undefined,
        refund_amount: amountNum,
        refund_method: refundForm.refund_method,
        refund_reference: refundForm.refund_reference.trim() || undefined,
        reason: refundForm.reason.trim(),
      });
      showSuccess("Refund recorded cleanly.");
      await load();
      await openInvoiceDetails(inv);
    } catch (err) {
      const msg = villaError(err);
      setRefundForm((prev) => ({ ...prev, error: msg }));
      showError(msg);
    } finally {
      setRefunding(false);
    }
  };

  // --- Computed Lists ---
  const checkedInStays = useMemo(
    () => bookings.filter((b) => b.status === "Checked In"),
    [bookings]
  );

  const activeCatalogueServices = useMemo(
    () => services.filter((s) => s.is_active),
    [services]
  );

  const filteredCatalogue = useMemo(() => {
    const q = serviceSearch.trim().toLowerCase();
    return services.filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.description || "").toLowerCase().includes(q)
    );
  }, [services, serviceSearch]);

  const filteredRequests = useMemo(() => {
    const q = reqSearch.trim().toLowerCase();
    return requests.filter((r) => {
      if (reqStatusFilter && r.status !== reqStatusFilter) return false;
      if (!q) return true;
      return (
        (r.service_name || "").toLowerCase().includes(q) ||
        (r.booking_number || "").toLowerCase().includes(q) ||
        (r.guest_name || "").toLowerCase().includes(q) ||
        (r.unit_name || "").toLowerCase().includes(q) ||
        (r.staff_name || "").toLowerCase().includes(q)
      );
    });
  }, [requests, reqSearch, reqStatusFilter]);

  const pagedRequests = useMemo(
    () => paginate(filteredRequests, reqPage),
    [filteredRequests, reqPage]
  );

  const filteredInvoices = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    return invoices.filter((i) => {
      if (invoiceStatusFilter && i.payment_status !== invoiceStatusFilter) return false;
      if (!q) return true;
      return (
        (i.invoice_number || "").toLowerCase().includes(q) ||
        (i.booking_number || "").toLowerCase().includes(q) ||
        (i.customer_name || "").toLowerCase().includes(q) ||
        (i.unit_name || "").toLowerCase().includes(q)
      );
    });
  }, [invoices, invoiceSearch, invoiceStatusFilter]);

  const pagedInvoices = useMemo(
    () => paginate(filteredInvoices, invoicePage),
    [filteredInvoices, invoicePage]
  );

  const invoiceTotals = useMemo(() => {
    const netCollected = invoices.reduce((sum, i) => sum + Number(i.paid_amount || 0), 0);
    const totalRefunded = invoices.reduce((sum, i) => sum + Number(i.refunded_amount || 0), 0);
    const outstanding = invoices.reduce(
      (sum, i) =>
        i.payment_status === "Void"
          ? sum
          : sum + Number(i.balance_due ?? Math.max(0, Number(i.total_amount) - Number(i.paid_amount))),
      0
    );
    return { netCollected, totalRefunded, outstanding };
  }, [invoices]);

  const pagedReportBookings = useMemo(
    () => paginate(bookings, reportPage),
    [bookings, reportPage]
  );

  const pageMeta = {
    services: {
      title: "Guest Services",
      description:
        "Manage concierge, transfer, and villa service catalogue items and schedule requests for checked-in stays.",
    },
    invoices: {
      title: "Villas Invoices & Settlements",
      description:
        "Track stay folios, record payments per invoice, process refunds/reversals, and download PDF folios.",
    },
    reports: {
      title: "Villas Operational Reports",
      description:
        "Analyze occupancy rate, average daily rate (ADR), accommodation vs. service revenue, unit utilization, and repeat guest activity.",
    },
    settings: {
      title: "Property Settings",
      description: "Update Villas & Units property contact details and public business profile.",
    },
  }[view];

  // --- Exact Column Configs per Section 4 ---
  const serviceCatalogueColumns = [
    {
      key: "name",
      label: "Service",
      width: "min-w-[180px]",
      render: (s) => (
        <span className="font-semibold text-[#172033] dark:text-[#F8FAFC]">{s.name}</span>
      ),
    },
    {
      key: "description",
      label: "Description",
      width: "min-w-[200px]",
      render: (s) => (
        <span
          className="block max-w-[260px] truncate text-xs text-[#64748B] dark:text-[#CBD5E1]"
          title={s.description || ""}
        >
          {s.description || "—"}
        </span>
      ),
    },
    {
      key: "price",
      label: "Price",
      align: "right",
      cellClassName: "whitespace-nowrap font-semibold tabular-nums",
      render: (s) => villaMoney(s.price),
    },
    {
      key: "status",
      label: "Status",
      align: "center",
      render: (s) => (
        <StatusBadge
          status={s.is_active ? "ACTIVE" : "INACTIVE"}
          label={s.is_active ? "Active" : "Inactive"}
          size="sm"
        />
      ),
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      cellClassName: "whitespace-nowrap",
      render: (s) => (
        <div className="inline-flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => openEditService(s)}
            title="Edit Service"
            className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <Edit3 size={14} />
          </button>
          <button
            type="button"
            onClick={() =>
              runAction(
                () =>
                  villasApi.updateService(s.id, {
                    name: s.name,
                    description: s.description,
                    price: Number(s.price),
                    is_active: !s.is_active,
                  }),
                `Service "${s.name}" ${!s.is_active ? "activated" : "deactivated"}.`
              )
            }
            title={s.is_active ? "Deactivate Service" : "Activate Service"}
            className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <Power size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              setDeleteServiceError("");
              setDeleteServiceTarget(s);
            }}
            title="Delete Service"
            className="rounded-lg p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  const serviceRequestColumns = [
    {
      key: "service",
      label: "Service",
      width: "min-w-[190px]",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[#172033] dark:text-[#F8FAFC]">
            {r.service_name}
          </div>
          {r.notes && (
            <div
              className="text-xs text-[#64748B] dark:text-[#8A9AB2] truncate max-w-[220px]"
              title={r.notes}
            >
              {r.notes}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "stay_guest",
      label: "Stay & Guest",
      width: "min-w-[190px]",
      render: (r) => (
        <div>
          <div className="font-mono text-xs font-bold whitespace-nowrap">{r.booking_number}</div>
          <div className="text-xs text-[#64748B] dark:text-[#8A9AB2]">
            {r.guest_name} {r.unit_name ? `· ${r.unit_name}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "staff_name",
      label: "Assigned Staff",
      cellClassName: "whitespace-nowrap",
      render: (r) => r.staff_name || "Unassigned",
    },
    {
      key: "charge",
      label: "Quantity / Charge",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (r) => (
        <div>
          <div className="font-semibold">
            {villaMoney(r.line_total ?? Number(r.unit_price) * Number(r.quantity))}
          </div>
          <div className="text-[11px] text-[#64748B] dark:text-[#8A9AB2]">
            {r.quantity} × {villaMoney(r.unit_price)}
          </div>
        </div>
      ),
    },
    {
      key: "scheduled_for",
      label: "Scheduled Time",
      cellClassName: "whitespace-nowrap tabular-nums text-xs",
      render: (r) => (r.scheduled_for ? villaDateTime(r.scheduled_for) : "—"),
    },
    {
      key: "status",
      label: "Status",
      align: "center",
      render: (r) => <StatusBadge status={r.status} label={r.status} size="sm" />,
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      cellClassName: "whitespace-nowrap",
      render: (r) => {
        const stayLocked = Boolean(r.booking_status && r.booking_status !== "Checked In");
        const canRemove =
          !stayLocked && !["Completed", "In Progress"].includes(r.status);
        return (
          <div className="inline-flex items-center justify-end gap-1.5">
            <select
              aria-label={`Update status for ${r.service_name}`}
              disabled={stayLocked}
              value={r.status}
              onChange={(e) =>
                runAction(
                  () => villasApi.requestStatus(r.id, e.target.value),
                  `Service request marked "${e.target.value}".`
                )
              }
              className={`${INPUT_STYLES.select} w-[135px] py-1 text-xs disabled:opacity-50`}
            >
              {REQUEST_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
            {canRemove && (
              <button
                type="button"
                onClick={() => {
                  setDeleteReqError("");
                  setDeleteReqTarget(r);
                }}
                title="Remove Unbilled Request"
                className="rounded-lg p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  // Invoices exact 8 columns from Section 4J
  const invoiceColumns = [
    {
      key: "invoice",
      label: "Invoice",
      cellClassName: "whitespace-nowrap",
      render: (i) => (
        <div>
          <div className="font-mono font-bold text-[#172033] dark:text-[#F8FAFC]">
            {i.invoice_number}
          </div>
          <div className="text-[11px] text-[#64748B] dark:text-[#8A9AB2]">
            {i.is_finalized ? "Finalized" : "Draft Folio"}
          </div>
        </div>
      ),
    },
    {
      key: "stay",
      label: "Stay & Guest",
      width: "min-w-[190px]",
      render: (i) => (
        <div>
          <div className="font-semibold text-[#172033] dark:text-[#F8FAFC] whitespace-nowrap">
            {i.booking_number}
          </div>
          <div className="text-xs text-[#64748B] dark:text-[#8A9AB2]">
            {i.customer_name} · {i.booking_status}
          </div>
        </div>
      ),
    },
    {
      key: "total_amount",
      label: "Total Amount",
      align: "right",
      cellClassName: "whitespace-nowrap font-semibold tabular-nums",
      render: (i) => villaMoney(i.total_amount),
    },
    {
      key: "paid_amount",
      label: "Net Paid",
      align: "right",
      cellClassName: "whitespace-nowrap font-semibold tabular-nums text-emerald-600 dark:text-emerald-400",
      render: (i) => villaMoney(i.paid_amount),
    },
    {
      key: "refunded_amount",
      label: "Refunds",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (i) => {
        const refAmt = Number(i.refunded_amount || 0);
        return (
          <span className={refAmt > 0 ? "font-semibold text-rose-600 dark:text-rose-400" : "text-stone-400"}>
            {villaMoney(refAmt)}
          </span>
        );
      },
    },
    {
      key: "balance_due",
      label: "Balance Due",
      align: "right",
      cellClassName: "whitespace-nowrap font-semibold tabular-nums",
      render: (i) => {
        const balance = Number(
          Number(i.balance_due ?? Number(i.total_amount) - Number(i.paid_amount)).toFixed(2)
        );
        return (
          <span className={balance > 0 ? "text-rose-600 dark:text-rose-400" : "text-stone-500"}>
            {villaMoney(balance)}
          </span>
        );
      },
    },
    {
      key: "payment_status",
      label: "Payment Status",
      align: "center",
      cellClassName: "whitespace-nowrap",
      render: (i) => <StatusBadge status={i.payment_status} label={i.payment_status} size="sm" />,
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      cellClassName: "whitespace-nowrap",
      render: (i) => {
        const balance = Number(
          Number(i.balance_due ?? Number(i.total_amount) - Number(i.paid_amount)).toFixed(2)
        );
        const canPay =
          i.payment_status !== "Void" &&
          !["Cancelled", "No Show"].includes(i.booking_status) &&
          balance > 0;
        const isPayExpanded = Boolean(expandedPayInvoiceIds[i.id]);
        return (
          <div className="inline-flex items-center justify-end gap-1.5">
            {canPay && (
              <button
                type="button"
                onClick={() =>
                  setExpandedPayInvoiceIds((prev) => ({ ...prev, [i.id]: !prev[i.id] }))
                }
                title={`Receive payment for ${i.invoice_number}`}
                className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  isPayExpanded
                    ? "bg-amber-600 text-white"
                    : "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold shadow-2xs"
                }`}
              >
                <CreditCard size={13} />
                <span>{isPayExpanded ? "Hide Pay" : "Pay"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => openInvoiceDetails(i)}
              className={BUTTON_VARIANTS.outline}
              title="View line items, payments and refunds"
            >
              <Eye size={13} />
              <span>Details</span>
            </button>
            <button
              type="button"
              onClick={() => handleDownloadPdf(i)}
              disabled={downloadingPdfId === i.id}
              className={BUTTON_VARIANTS.outline}
              title="Download invoice PDF"
            >
              <Download size={13} />
              <span>{downloadingPdfId === i.id ? "..." : "PDF"}</span>
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={pageMeta.title}
        description={pageMeta.description}
        actions={
          view === "services" && (
            <button
              type="button"
              onClick={openCreateService}
              className={BUTTON_VARIANTS.primary}
            >
              <Plus size={16} />
              <span>Add Service</span>
            </button>
          )
        }
      />

      {error && (
        <AlertBanner
          variant="error"
          title="Operation notice"
          message={error}
          onDismiss={() => setError("")}
        />
      )}

      {/* ===================== VIEW: GUEST SERVICES ===================== */}
      {view === "services" && (
        <>
          {bulkDeleteFailures.length > 0 && (
            <div role="status" className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/20 px-4 py-3 text-xs text-rose-800 dark:text-rose-200">
              <p className="font-semibold">Some selected records were protected:</p>
              <ul className="mt-1 space-y-1">{bulkDeleteFailures.map((item) => <li key={item.id}><span className="font-medium">{item.name}:</span> {item.reason}</li>)}</ul>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              title="Catalogue Services"
              value={services.length}
              description={`${activeCatalogueServices.length} active offerings`}
              icon={Sparkles}
              color="amber"
            />
            <StatCard
              title="Active In-House Stays"
              value={checkedInStays.length}
              description="Eligible for service charges"
              icon={CheckCircle2}
              color="emerald"
            />
            <StatCard
              title="Open Requests"
              value={requests.filter((r) => ["Requested", "Scheduled", "In Progress"].includes(r.status)).length}
              description="Awaiting fulfilment"
              icon={Wrench}
              color="sky"
            />
            <StatCard
              title="Completed Revenue"
              value={villaMoney(
                requests
                  .filter((r) => r.status === "Completed")
                  .reduce((sum, r) => sum + Number(r.line_total || Number(r.unit_price) * Number(r.quantity)), 0)
              )}
              description="Billed to stay folios"
              icon={IndianRupee}
              color="emerald"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
            {/* LEFT: CREATE GUEST SERVICE REQUEST */}
            <div className={`${CARD_STYLES.base} xl:col-span-5 space-y-4`}>
              <div className="border-b border-stone-200 dark:border-stone-800 pb-3">
                <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                  Request Service for Checked-In Stay
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Completed requests automatically post to the guest&apos;s active villa invoice.
                </p>
              </div>

              {checkedInStays.length === 0 ? (
                <AlertBanner
                  variant="info"
                  title="No In-House Stays"
                  message="Guest services can only be scheduled once a confirmed reservation has been checked in."
                />
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!requestForm.booking_id || !requestForm.service_id) {
                      showError("Select both a checked-in stay and an active service.");
                      return;
                    }
                    runAction(async () => {
                      await villasApi.addServiceRequest(requestForm.booking_id, {
                        service_id: Number(requestForm.service_id),
                        staff_id: requestForm.staff_id ? Number(requestForm.staff_id) : null,
                        quantity: Number(requestForm.quantity),
                        scheduled_for: requestForm.scheduled_for || null,
                        notes: requestForm.notes.trim() || null,
                      });
                      setRequestForm((prev) => ({
                        ...prev,
                        quantity: 1,
                        scheduled_for: "",
                        notes: "",
                      }));
                    }, "Service request logged.");
                  }}
                >
                  <div>
                    <label className="block text-xs font-semibold mb-1">Checked-In Stay *</label>
                    <select
                      required
                      value={requestForm.booking_id}
                      onChange={(e) => setRequestForm({ ...requestForm, booking_id: e.target.value })}
                      className={INPUT_STYLES.select}
                    >
                      <option value="">Select in-house stay</option>
                      {checkedInStays.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.booking_number} · {b.guest_name} ({b.unit_name})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold mb-1">Service *</label>
                      <select
                        required
                        value={requestForm.service_id}
                        onChange={(e) => setRequestForm({ ...requestForm, service_id: e.target.value })}
                        className={INPUT_STYLES.select}
                      >
                        <option value="">Select service</option>
                        {activeCatalogueServices.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({villaMoney(s.price)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Quantity *</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        required
                        value={requestForm.quantity}
                        onChange={(e) => setRequestForm({ ...requestForm, quantity: e.target.value })}
                        className={INPUT_STYLES.base}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">Assign Staff (Optional)</label>
                      <select
                        value={requestForm.staff_id}
                        onChange={(e) => setRequestForm({ ...requestForm, staff_id: e.target.value })}
                        className={INPUT_STYLES.select}
                      >
                        <option value="">Unassigned</option>
                        {staff.map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.name} {st.designation ? `(${st.designation})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Scheduled Time</label>
                      <input
                        type="datetime-local"
                        value={requestForm.scheduled_for}
                        onChange={(e) => setRequestForm({ ...requestForm, scheduled_for: e.target.value })}
                        className={INPUT_STYLES.base}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Concierge Notes</label>
                    <input
                      type="text"
                      value={requestForm.notes}
                      onChange={(e) => setRequestForm({ ...requestForm, notes: e.target.value })}
                      placeholder="Setup location, dietary preferences, flight details..."
                      className={INPUT_STYLES.base}
                    />
                  </div>

                  <button type="submit" className={`${BUTTON_VARIANTS.primary} w-full justify-center`}>
                    <Plus size={15} />
                    <span>Log Guest Service Request</span>
                  </button>
                </form>
              )}
            </div>

            {/* RIGHT: SERVICE CATALOGUE */}
            <div className="xl:col-span-7 min-w-0">
              {selectedServiceIds.size > 0 && (
                <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20 px-4 py-2.5">
                  <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">{selectedServiceIds.size} eligible service{selectedServiceIds.size !== 1 ? "s" : ""} selected</span>
                  <div className="flex items-center gap-2"><button type="button" className={BUTTON_VARIANTS.secondary} onClick={() => setSelectedServiceIds(new Set())}>Clear Selection</button><button type="button" className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white" onClick={() => setBulkDeleteKind("services")}>Delete Selected</button></div>
                </div>
              )}
              <VillaDataTable
                title="Service Catalogue"
                subtitle="Configure experiences, transfers, and in-villa extras."
                headerActions={
                  <div className="relative w-full sm:w-56">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input
                      type="text"
                      value={serviceSearch}
                      onChange={(e) => setServiceSearch(e.target.value)}
                      placeholder="Filter services..."
                      className={`${INPUT_STYLES.base} pl-8 py-1.5 text-xs`}
                    />
                  </div>
                }
                columns={serviceCatalogueColumns}
                rows={filteredCatalogue}
                loading={loading}
                loadingMessage="Loading service catalogue..."
                emptyTitle="No services configured"
                emptyDescription='Click "Add Service" above to add an offering.'
                tableMinWidth="min-w-[680px]"
                selectedIds={selectedServiceIds}
                onSelectRow={(id) => toggleSelection(setSelectedServiceIds, id)}
                onSelectAll={(ids) => togglePageSelection(setSelectedServiceIds, ids)}
                isRowSelectable={(service) => !requests.some((request) => request.service_id === service.id)}
              />
            </div>
          </div>

          {/* SERVICE REQUESTS TABLE */}
          {selectedRequestIds.size > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20 px-4 py-2.5">
              <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">{selectedRequestIds.size} eligible request{selectedRequestIds.size !== 1 ? "s" : ""} selected on this page</span>
              <div className="flex items-center gap-2"><button type="button" className={BUTTON_VARIANTS.secondary} onClick={() => setSelectedRequestIds(new Set())}>Clear Selection</button><button type="button" className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white" onClick={() => setBulkDeleteKind("requests")}>Delete Selected</button></div>
            </div>
          )}
          <VillaDataTable
            title="Service Requests & Fulfilment"
            subtitle="Completed or invoiced requests remain protected; unbilled open requests can be removed."
            headerActions={
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    value={reqSearch}
                    onChange={(e) => {
                      setReqSearch(e.target.value);
                      setReqPage(1);
                    }}
                    placeholder="Search stay, guest, service..."
                    className={`${INPUT_STYLES.base} pl-8 py-1.5 text-xs w-52`}
                  />
                </div>
                <select
                  value={reqStatusFilter}
                  onChange={(e) => {
                    setReqStatusFilter(e.target.value);
                    setReqPage(1);
                  }}
                  className={`${INPUT_STYLES.select} w-auto py-1.5 text-xs`}
                >
                  <option value="">All Statuses</option>
                  {REQUEST_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            }
            columns={serviceRequestColumns}
            rows={pagedRequests.items}
            loading={loading}
            emptyTitle="No guest service requests match your filters"
            tableMinWidth="min-w-[1040px]"
            pagination={{
              currentPage: pagedRequests.currentPage,
              totalPages: pagedRequests.totalPages,
              totalRecords: pagedRequests.totalRecords,
              pageSize: PAGE_SIZE,
              onPageChange: setReqPage,
            }}
            selectedIds={selectedRequestIds}
            onSelectRow={(id) => toggleSelection(setSelectedRequestIds, id)}
            onSelectAll={(ids) => togglePageSelection(setSelectedRequestIds, ids)}
            isRowSelectable={(request) => request.booking_status === "Checked In" && !["Completed", "In Progress"].includes(request.status)}
          />
        </>
      )}

      {/* ===================== VIEW: INVOICES ===================== */}
      {view === "invoices" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              title="Total Invoices"
              value={invoices.length}
              description="Active and archived folios"
              icon={FileText}
              color="amber"
            />
            <StatCard
              title="Net Revenue Collected"
              value={villaMoney(invoiceTotals.netCollected)}
              description="Gross receipts less refunds"
              icon={IndianRupee}
              color="emerald"
            />
            <StatCard
              title="Refunds & Reversals"
              value={villaMoney(invoiceTotals.totalRefunded)}
              description="Returned advances and adjustments"
              icon={RotateCcw}
              color="stone"
            />
            <StatCard
              title="Balance Outstanding"
              value={villaMoney(invoiceTotals.outstanding)}
              description="Due across open folios"
              icon={Wallet}
              color={invoiceTotals.outstanding > 0 ? "rose" : "emerald"}
            />
          </div>

          <div className={`${CARD_STYLES.base} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
            <div className="relative flex-1 max-w-md min-w-0">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={invoiceSearch}
                onChange={(e) => {
                  setInvoiceSearch(e.target.value);
                  setInvoicePage(1);
                }}
                placeholder="Search invoice #, booking #, guest, or unit..."
                className={`${INPUT_STYLES.base} pl-9`}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={invoiceStatusFilter}
                onChange={(e) => {
                  setInvoiceStatusFilter(e.target.value);
                  setInvoicePage(1);
                }}
                className={`${INPUT_STYLES.select} w-full sm:w-auto min-w-[165px]`}
              >
                <option value="">All Payment Statuses</option>
                {["Pending", "Partially Paid", "Paid", "Refunded", "Void"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {(invoiceSearch || invoiceStatusFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setInvoiceSearch("");
                    setInvoiceStatusFilter("");
                    setInvoicePage(1);
                  }}
                  className={BUTTON_VARIANTS.secondary}
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <VillaDataTable
            columns={invoiceColumns}
            rows={pagedInvoices.items}
            loading={loading}
            loadingMessage="Loading invoices..."
            emptyIcon={FileText}
            emptyTitle="No invoices match your filters"
            tableMinWidth="min-w-[1060px]"
            renderExpandedRow={(i) => {
              if (!expandedPayInvoiceIds[i.id]) return null;
              const balance = Number(
                Number(i.balance_due ?? Number(i.total_amount) - Number(i.paid_amount)).toFixed(2)
              );
              const rowForm = getPaymentForm(paymentForms, i.id);
              return (
                <div className="space-y-2 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-white dark:bg-[#101722] p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-[#172033] dark:text-[#F8FAFC]">
                      Record Payment for {i.invoice_number} (Balance Due: {villaMoney(balance)})
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPaymentForms((prev) =>
                          setPaymentFormField(prev, i.id, "amount", String(balance))
                        )
                      }
                      className="font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                    >
                      Fill Full Balance
                    </button>
                  </div>
                  <form
                    className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-center"
                    onSubmit={(e) => handlePaymentSubmit(e, i)}
                  >
                    <input
                      aria-label={`Payment amount for ${i.invoice_number}`}
                      className={INPUT_STYLES.base}
                      type="number"
                      min="0.01"
                      max={balance}
                      step="0.01"
                      placeholder="Amount (₹)"
                      required
                      value={rowForm.amount}
                      onChange={(e) =>
                        setPaymentForms((prev) =>
                          setPaymentFormField(prev, i.id, "amount", e.target.value)
                        )
                      }
                    />
                    <select
                      aria-label={`Payment method for ${i.invoice_number}`}
                      className={INPUT_STYLES.select}
                      value={rowForm.method}
                      onChange={(e) =>
                        setPaymentForms((prev) =>
                          setPaymentFormField(prev, i.id, "method", e.target.value)
                        )
                      }
                    >
                      <option>UPI</option>
                      <option>Card</option>
                      <option>Net Banking</option>
                      <option>Cash</option>
                    </select>
                    <input
                      aria-label={`Payment reference for ${i.invoice_number}`}
                      className={INPUT_STYLES.base}
                      type="text"
                      maxLength={100}
                      placeholder="Reference (optional)"
                      value={rowForm.reference}
                      onChange={(e) =>
                        setPaymentForms((prev) =>
                          setPaymentFormField(prev, i.id, "reference", e.target.value)
                        )
                      }
                    />
                    <button
                      type="submit"
                      title={`Receive payment for ${i.invoice_number}`}
                      disabled={payingInvoiceId === i.id}
                      className={BUTTON_VARIANTS.primary}
                    >
                      <CreditCard size={14} />
                      <span>{payingInvoiceId === i.id ? "Saving..." : "Record Payment"}</span>
                    </button>
                  </form>
                  {rowForm.error && (
                    <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                      {rowForm.error}
                    </p>
                  )}
                </div>
              );
            }}
            pagination={{
              currentPage: pagedInvoices.currentPage,
              totalPages: pagedInvoices.totalPages,
              totalRecords: pagedInvoices.totalRecords,
              pageSize: PAGE_SIZE,
              onPageChange: setInvoicePage,
            }}
          />
        </>
      )}

      {/* ===================== VIEW: REPORTS ===================== */}
      {view === "reports" && (
        <>
          <div className={`${CARD_STYLES.base} flex flex-col sm:flex-row sm:items-end justify-between gap-4`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 max-w-lg">
              <div>
                <label className="block text-xs font-semibold mb-1">Period Start</label>
                <input
                  type="date"
                  value={reportRange.start_date}
                  onChange={(e) => {
                    setReportPage(1);
                    setReportRange({ ...reportRange, start_date: e.target.value });
                  }}
                  className={INPUT_STYLES.base}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Period End</label>
                <input
                  type="date"
                  value={reportRange.end_date}
                  onChange={(e) => {
                    setReportPage(1);
                    setReportRange({ ...reportRange, end_date: e.target.value });
                  }}
                  className={INPUT_STYLES.base}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setReportRange({ start_date: toIsoDate(-30), end_date: toIsoDate(30) })
                }
                className={BUTTON_VARIANTS.secondary}
              >
                60-Day Window
              </button>
              <button
                type="button"
                onClick={() =>
                  setReportRange({ start_date: toIsoDate(-7), end_date: toIsoDate(7) })
                }
                className={BUTTON_VARIANTS.secondary}
              >
                This &amp; Next Week
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              title="Occupancy Rate"
              value={loading ? "—" : `${reportData?.summary?.occupancy_rate ?? 0}%`}
              description={`${reportData?.summary?.nights_sold ?? 0} of ${reportData?.summary?.available_unit_nights ?? 0} unit-nights`}
              icon={Percent}
              color="sky"
            />
            <StatCard
              title="Avg Daily Rate (ADR)"
              value={loading ? "—" : villaMoney(reportData?.summary?.adr)}
              description={`Accommodation: ${villaMoney(reportData?.summary?.accommodation_revenue)}`}
              icon={BarChart3}
              color="amber"
            />
            <StatCard
              title="Net Revenue Collected"
              value={loading ? "—" : villaMoney(reportData?.summary?.net_revenue_received)}
              description={`Service rev: ${villaMoney(reportData?.summary?.service_revenue)}`}
              icon={IndianRupee}
              color="emerald"
            />
            <StatCard
              title="Outstanding Balance"
              value={loading ? "—" : villaMoney(reportData?.summary?.outstanding_balance)}
              description={`Cancel / No-Show: ${reportData?.summary?.cancellation_no_show_rate ?? 0}%`}
              icon={Wallet}
              color={Number(reportData?.summary?.outstanding_balance || 0) > 0 ? "rose" : "emerald"}
            />
          </div>

          {reportData?.status_breakdown && (
            <div className={CARD_STYLES.base}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">
                Stay Status Distribution ({reportData.summary?.total_stays ?? 0} total stays)
              </h3>
              <div className="flex flex-wrap gap-2.5">
                {Object.entries(reportData.status_breakdown).map(([statusKey, count]) => (
                  <div
                    key={statusKey}
                    className="inline-flex items-center gap-2 rounded-xl border border-stone-200 dark:border-stone-800 px-3 py-1.5 text-xs"
                  >
                    <StatusBadge status={statusKey} label={statusKey} size="sm" />
                    <span className="font-bold tabular-nums text-stone-900 dark:text-stone-100">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unit Performance + Top Guests (Aligned VillaDataTables) */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
            <VillaDataTable
              title="Unit Performance"
              tableMinWidth="min-w-[520px]"
              rows={reportData?.unit_performance || []}
              rowKey={(u) => u.unit_id}
              loading={loading}
              emptyTitle="No unit performance records"
              columns={[
                {
                  key: "unit_name",
                  label: "Unit & Villa",
                  render: (u) => (
                    <div>
                      <div className="font-semibold text-[#172033] dark:text-[#F8FAFC]">{u.unit_name}</div>
                      <div className="text-[11px] text-[#64748B] dark:text-[#8A9AB2]">{u.villa_name}</div>
                    </div>
                  ),
                },
                { key: "stays", label: "Stays", align: "right", cellClassName: "tabular-nums" },
                { key: "nights_sold", label: "Nights", align: "right", cellClassName: "tabular-nums" },
                {
                  key: "accommodation_revenue",
                  label: "Room Revenue",
                  align: "right",
                  cellClassName: "whitespace-nowrap font-semibold tabular-nums",
                  render: (u) => villaMoney(u.accommodation_revenue),
                },
              ]}
            />

            <VillaDataTable
              title="Top Guests & Loyalty"
              headerActions={
                <span className="inline-flex items-center gap-1 text-xs text-[#64748B] dark:text-[#8A9AB2]">
                  <Users size={13} />
                  {reportData?.guest_summary?.repeat_guests ?? 0} repeat guests
                </span>
              }
              tableMinWidth="min-w-[440px]"
              rows={reportData?.guest_summary?.top_guests || []}
              rowKey={(g) => g.guest_id}
              loading={loading}
              emptyTitle="No guest stay activity recorded yet"
              columns={[
                {
                  key: "full_name",
                  label: "Guest",
                  render: (g) => (
                    <div>
                      <div className="font-semibold text-[#172033] dark:text-[#F8FAFC]">{g.full_name}</div>
                      <div className="text-[11px] font-mono text-[#64748B] dark:text-[#8A9AB2]">
                        {g.guest_reference}
                      </div>
                    </div>
                  ),
                },
                { key: "stays", label: "Stays", align: "right", cellClassName: "tabular-nums" },
                {
                  key: "total_booked",
                  label: "Room Spend",
                  align: "right",
                  cellClassName: "whitespace-nowrap font-semibold tabular-nums",
                  render: (g) => villaMoney(g.total_booked),
                },
              ]}
            />
          </div>

          {/* Filtered Bookings Breakdown (Read-Only) */}
          <VillaDataTable
            title="Stays Within Selected Period"
            tableMinWidth="min-w-[820px]"
            rows={pagedReportBookings.items}
            loading={loading}
            emptyTitle="No stays overlap this date range"
            columns={[
              {
                key: "booking_number",
                label: "Booking #",
                cellClassName: "font-mono font-bold whitespace-nowrap",
              },
              {
                key: "guest",
                label: "Guest",
                cellClassName: "whitespace-nowrap",
                render: (b) => b.guest_name || b.customer_name,
              },
              { key: "unit_name", label: "Unit", cellClassName: "whitespace-nowrap" },
              {
                key: "dates",
                label: "Stay Dates",
                cellClassName: "whitespace-nowrap tabular-nums",
                render: (b) => villaDateRange(b.check_in, b.check_out),
              },
              {
                key: "status",
                label: "Status",
                align: "center",
                render: (b) => <StatusBadge status={b.status} label={b.status} size="sm" />,
              },
              {
                key: "total_amount",
                label: "Stay Total",
                align: "right",
                cellClassName: "whitespace-nowrap font-semibold tabular-nums",
                render: (b) => villaMoney(b.total_amount),
              },
            ]}
            pagination={{
              currentPage: pagedReportBookings.currentPage,
              totalPages: pagedReportBookings.totalPages,
              totalRecords: pagedReportBookings.totalRecords,
              pageSize: PAGE_SIZE,
              onPageChange: setReportPage,
            }}
          />
        </>
      )}

      {/* ===================== VIEW: SETTINGS ===================== */}
      {view === "settings" && profile && (
        <section className={`${CARD_STYLES.base} max-w-3xl`}>
          <h2 className="mb-4 text-base font-bold text-stone-900 dark:text-stone-100">
            Villas &amp; Units Property Details
          </h2>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              runAction(async () => {
                const updated = await updateBusinessProfile(profile);
                setProfile(updated);
              }, "Property details saved.");
            }}
          >
            <Field label="Property Name" field="business_name" profile={profile} setProfile={setProfile} />
            <Field label="Official Email" field="business_email" profile={profile} setProfile={setProfile} />
            <Field label="Contact Phone" field="business_phone" profile={profile} setProfile={setProfile} />
            <Field label="City" field="city" profile={profile} setProfile={setProfile} />
            <label className="text-xs font-semibold sm:col-span-2">
              Address
              <textarea
                className={`${INPUT_STYLES.base} mt-1`}
                rows="2"
                value={profile.address_line || ""}
                onChange={(e) => setProfile({ ...profile, address_line: e.target.value })}
              />
            </label>
            <label className="text-xs font-semibold sm:col-span-2">
              Description
              <textarea
                className={`${INPUT_STYLES.base} mt-1`}
                rows="3"
                value={profile.description || ""}
                onChange={(e) => setProfile({ ...profile, description: e.target.value })}
              />
            </label>
            <div>
              <button type="submit" className={BUTTON_VARIANTS.primary}>
                <Save size={15} />
                <span>Save Settings</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* ADD / EDIT SERVICE CATALOGUE MODAL */}
      <Modal
        isOpen={Boolean(serviceModal)}
        onClose={() => !savingService && setServiceModal(null)}
        title={serviceModal?.mode === "edit" ? "Edit Guest Service" : "Add Guest Service"}
        subtitle="Configure billable resort amenities, experiences, or transfers."
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <button
              type="button"
              onClick={() => setServiceModal(null)}
              disabled={savingService}
              className={BUTTON_VARIANTS.secondary}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="villa-service-modal-form"
              disabled={savingService}
              className={BUTTON_VARIANTS.primary}
            >
              {savingService ? "Saving..." : serviceModal?.mode === "edit" ? "Save Service" : "Create Service"}
            </button>
          </div>
        }
      >
        <form id="villa-service-modal-form" onSubmit={handleSaveService} className="space-y-4">
          {serviceFormError && (
            <AlertBanner
              variant="error"
              message={serviceFormError}
              onDismiss={() => setServiceFormError("")}
            />
          )}
          <div>
            <label className="block text-xs font-semibold mb-1">Service Name *</label>
            <input
              type="text"
              required
              value={serviceForm.name}
              onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
              placeholder="e.g. Private Floating Breakfast"
              className={INPUT_STYLES.base}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Price (₹) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={serviceForm.price}
              onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })}
              className={INPUT_STYLES.base}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Description</label>
            <textarea
              rows={2}
              value={serviceForm.description}
              onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
              placeholder="Included inclusions, lead time, or setup notes..."
              className={INPUT_STYLES.base}
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(serviceForm.is_active)}
              onChange={(e) => setServiceForm({ ...serviceForm, is_active: e.target.checked })}
            />
            <span>Service is active and available for requests</span>
          </label>
        </form>
      </Modal>

      <DeleteConfirm
        isOpen={Boolean(deleteServiceTarget)}
        onClose={() => !deleteServiceLoading && setDeleteServiceTarget(null)}
        onConfirm={handleDeleteService}
        title="Delete Guest Service"
        recordName={deleteServiceTarget?.name || ""}
        message="Services already billed or referenced by guest requests cannot be deleted; deactivate them instead."
        confirmButtonText="Delete Service"
        loading={deleteServiceLoading}
        error={deleteServiceError}
      />

      <DeleteConfirm
        isOpen={Boolean(deleteReqTarget)}
        onClose={() => !deleteReqLoading && setDeleteReqTarget(null)}
        onConfirm={handleDeleteServiceRequest}
        title="Remove Service Request"
        recordName={
          deleteReqTarget
            ? `${deleteReqTarget.service_name} (${deleteReqTarget.booking_number})`
            : ""
        }
        message="Only unbilled pending or scheduled requests on an active checked-in stay can be removed. Completed requests are preserved for billing integrity."
        impactSummary={
          deleteReqTarget
            ? `${deleteReqTarget.guest_name} · ${villaMoney(
                deleteReqTarget.line_total ?? Number(deleteReqTarget.unit_price) * Number(deleteReqTarget.quantity)
              )}`
            : null
        }
        confirmButtonText="Remove Request"
        loading={deleteReqLoading}
        error={deleteReqError}
      />

      <Modal
        isOpen={Boolean(bulkDeleteKind)}
        onClose={() => !bulkDeleteLoading && setBulkDeleteKind("")}
        title={`Delete ${(bulkDeleteKind === "services" ? selectedServiceIds : selectedRequestIds).size} Selected ${bulkDeleteKind === "services" ? "Service" : "Request"}${(bulkDeleteKind === "services" ? selectedServiceIds : selectedRequestIds).size !== 1 ? "s" : ""}`}
        size="sm"
        footer={<div className="flex justify-end gap-2"><button type="button" className={BUTTON_VARIANTS.secondary} disabled={bulkDeleteLoading} onClick={() => setBulkDeleteKind("")}>Cancel</button><button type="button" className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={bulkDeleteLoading} onClick={confirmBulkDelete}>{bulkDeleteLoading ? "Deleting..." : "Confirm Delete"}</button></div>}
      >
        <p className="mb-3 text-sm text-[#64748B] dark:text-[#8A9AB2]">Protected services and billed or closed requests are rejected by the server and reported after processing.</p>
        <ul className="max-h-48 overflow-y-auto divide-y divide-[#E5E9F0] rounded-xl border border-[#E5E9F0]">
          {Array.from(bulkDeleteKind === "services" ? selectedServiceIds : selectedRequestIds).map((id) => {
            const service = bulkDeleteKind === "services";
            const row = service ? services.find((item) => item.id === id) : requests.find((item) => item.id === id);
            return <li key={id} className="px-3 py-2 text-sm">{service ? row?.name : `${row?.service_name || "Service"} (${row?.booking_number || `#${id}`})`}</li>;
          })}
        </ul>
      </Modal>

      {/* Invoice Details, Line Items, Payment & Refund History Modal */}
      <Modal
        isOpen={Boolean(invoiceModal)}
        onClose={() => !refunding && setInvoiceModal(null)}
        title={invoiceModal ? `Invoice ${invoiceModal.invoice.invoice_number}` : "Invoice Details"}
        subtitle={
          invoiceModal
            ? `${invoiceModal.invoice.booking_number} · ${invoiceModal.invoice.customer_name} · Check-in: ${villaDateWithTime(invoiceModal.invoice.check_in, invoiceModal.invoice.check_in_time)} · Check-out: ${villaDateWithTime(invoiceModal.invoice.check_out, invoiceModal.invoice.check_out_time)}`
            : ""
        }
        size="lg"
        footer={
          invoiceModal && (
            <div className="flex justify-between items-center w-full">
              <button
                type="button"
                onClick={() => handleDownloadPdf(invoiceModal.invoice)}
                disabled={downloadingPdfId === invoiceModal.invoice.id}
                className={BUTTON_VARIANTS.outline}
              >
                <Download size={15} />
                <span>Download PDF</span>
              </button>
              <button
                type="button"
                className={BUTTON_VARIANTS.secondary}
                onClick={() => setInvoiceModal(null)}
              >
                Close
              </button>
            </div>
          )
        }
      >
        {invoiceModal && (
          <div className="space-y-5 text-sm">
            {invoiceModal.loading && <p className="text-stone-500">Loading invoice breakdown...</p>}
            {invoiceModal.error && (
              <AlertBanner variant="error" message={invoiceModal.error} />
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60 p-3">
              <div>
                <span className="text-xs text-stone-500 block">Grand Total</span>
                <b className="tabular-nums">{villaMoney(invoiceModal.invoice.total_amount)}</b>
              </div>
              <div>
                <span className="text-xs text-stone-500 block">Gross Paid</span>
                <b className="tabular-nums">
                  {villaMoney(
                    invoiceModal.history?.gross_paid_amount ?? invoiceModal.invoice.gross_paid_amount
                  )}
                </b>
              </div>
              <div>
                <span className="text-xs text-stone-500 block">Refunded</span>
                <b className="text-rose-600 dark:text-rose-400 tabular-nums">
                  {villaMoney(
                    invoiceModal.history?.refunded_amount ?? invoiceModal.invoice.refunded_amount
                  )}
                </b>
              </div>
              <div>
                <span className="text-xs text-stone-500 block">Net Paid</span>
                <b className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {villaMoney(invoiceModal.history?.paid_amount ?? invoiceModal.invoice.paid_amount)}
                </b>
              </div>
              <div>
                <span className="text-xs text-stone-500 block">Balance Due</span>
                <b className="text-amber-700 dark:text-amber-300 tabular-nums">
                  {villaMoney(invoiceModal.history?.balance_due ?? invoiceModal.invoice.balance_due)}
                </b>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500">
                Itemized Charges
              </h4>
              <VillaDataTable
                tableMinWidth="min-w-[540px]"
                rows={invoiceModal.invoice.items || []}
                emptyTitle="No itemized charges recorded"
                columns={[
                  { key: "item_type", label: "Type", cellClassName: "font-semibold whitespace-nowrap" },
                  { key: "description", label: "Description" },
                  { key: "quantity", label: "Qty", align: "right", cellClassName: "tabular-nums" },
                  {
                    key: "unit_price",
                    label: "Unit Price",
                    align: "right",
                    cellClassName: "tabular-nums whitespace-nowrap",
                    render: (it) => villaMoney(it.unit_price),
                  },
                  {
                    key: "total_amount",
                    label: "Total",
                    align: "right",
                    cellClassName: "font-semibold tabular-nums whitespace-nowrap",
                    render: (it) => villaMoney(it.total_amount),
                  },
                ]}
              />
            </div>

            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500">
                Payment History
              </h4>
              <VillaDataTable
                tableMinWidth="min-w-[640px]"
                rows={invoiceModal.history?.payments || invoiceModal.invoice.payments || []}
                emptyTitle="No payments recorded yet"
                columns={[
                  {
                    key: "created_at",
                    label: "Date",
                    cellClassName: "whitespace-nowrap text-xs",
                    render: (p) => (p.created_at ? villaDateTime(p.created_at) : "—"),
                  },
                  { key: "method", label: "Method", cellClassName: "whitespace-nowrap" },
                  {
                    key: "reference",
                    label: "Reference",
                    render: (p) => p.reference || "—",
                  },
                  {
                    key: "amount",
                    label: "Amount",
                    align: "right",
                    cellClassName: "font-semibold tabular-nums whitespace-nowrap",
                    render: (p) => villaMoney(p.amount),
                  },
                  {
                    key: "refunded_amount",
                    label: "Refunded",
                    align: "right",
                    cellClassName: "text-rose-600 dark:text-rose-400 tabular-nums whitespace-nowrap",
                    render: (p) => villaMoney(p.refunded_amount),
                  },
                  {
                    key: "status",
                    label: "Status",
                    align: "center",
                    render: (p) => <StatusBadge status={p.status} label={p.status} size="sm" />,
                  },
                  {
                    key: "action",
                    label: "Action",
                    align: "right",
                    cellClassName: "whitespace-nowrap",
                    render: (p) =>
                      Number(p.refundable_amount) > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setRefundForm((prev) => ({
                              ...prev,
                              payment_id: String(p.id),
                              refund_amount: String(p.refundable_amount),
                              refund_method: p.method,
                              error: "",
                            }))
                          }
                          className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 text-xs font-medium text-amber-900 dark:text-amber-300 cursor-pointer"
                        >
                          <RotateCcw size={11} /> Select to Refund
                        </button>
                      ) : (
                        "—"
                      ),
                  },
                ]}
              />
            </div>

            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500">
                Refund &amp; Reversal History
              </h4>
              <VillaDataTable
                tableMinWidth="min-w-[640px]"
                rows={invoiceModal.history?.reversals || invoiceModal.invoice.reversals || []}
                emptyTitle="No refunds recorded"
                columns={[
                  {
                    key: "created_at",
                    label: "Date",
                    cellClassName: "whitespace-nowrap text-xs",
                    render: (r) => (r.created_at ? villaDateTime(r.created_at) : "—"),
                  },
                  {
                    key: "payment_id",
                    label: "Payment #",
                    cellClassName: "whitespace-nowrap font-mono",
                    render: (r) => `#${r.payment_id}`,
                  },
                  { key: "refund_method", label: "Method", cellClassName: "whitespace-nowrap" },
                  {
                    key: "refund_reference",
                    label: "Reference",
                    render: (r) => r.refund_reference || "—",
                  },
                  { key: "reason", label: "Reason" },
                  {
                    key: "refund_amount",
                    label: "Amount",
                    align: "right",
                    cellClassName: "font-semibold text-rose-600 dark:text-rose-400 tabular-nums whitespace-nowrap",
                    render: (r) => villaMoney(r.refund_amount),
                  },
                  {
                    key: "reversal_status",
                    label: "Status",
                    align: "center",
                    render: (r) => (
                      <StatusBadge status={r.reversal_status} label={r.reversal_status} size="sm" />
                    ),
                  },
                ]}
              />
            </div>

            {Number(invoiceModal.history?.paid_amount ?? invoiceModal.invoice.paid_amount ?? 0) > 0 && (
              <form
                onSubmit={handleRefundSubmit}
                className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-stone-900 p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                    Issue Payment Refund
                  </h4>
                  <button
                    type="button"
                    className="text-xs font-semibold text-amber-800 dark:text-amber-300 underline cursor-pointer"
                    onClick={() =>
                      setRefundForm((prev) => ({
                        ...prev,
                        payment_id: "",
                        refund_amount: String(
                          invoiceModal.history?.paid_amount ?? invoiceModal.invoice.paid_amount
                        ),
                        error: "",
                      }))
                    }
                  >
                    Fill Full Net Refund (
                    {villaMoney(invoiceModal.history?.paid_amount ?? invoiceModal.invoice.paid_amount)})
                  </button>
                </div>
                {refundForm.error && (
                  <AlertBanner variant="error" message={refundForm.error} />
                )}
                <div className="grid gap-2 sm:grid-cols-4">
                  <input
                    className={INPUT_STYLES.base}
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Refund amount"
                    required
                    value={refundForm.refund_amount}
                    onChange={(e) =>
                      setRefundForm((prev) => ({ ...prev, refund_amount: e.target.value, error: "" }))
                    }
                  />
                  <select
                    className={INPUT_STYLES.select}
                    value={refundForm.refund_method}
                    onChange={(e) =>
                      setRefundForm((prev) => ({ ...prev, refund_method: e.target.value }))
                    }
                  >
                    <option>UPI</option>
                    <option>Card</option>
                    <option>Net Banking</option>
                    <option>Cash</option>
                  </select>
                  <input
                    className={INPUT_STYLES.base}
                    placeholder="Refund ref (optional)"
                    value={refundForm.refund_reference}
                    onChange={(e) =>
                      setRefundForm((prev) => ({ ...prev, refund_reference: e.target.value }))
                    }
                  />
                  <input
                    className={INPUT_STYLES.base}
                    placeholder="Refund reason *"
                    required
                    value={refundForm.reason}
                    onChange={(e) =>
                      setRefundForm((prev) => ({ ...prev, reason: e.target.value, error: "" }))
                    }
                  />
                </div>
                <button
                  type="submit"
                  disabled={refunding}
                  className={BUTTON_VARIANTS.danger}
                >
                  <RotateCcw size={13} />
                  <span>{refunding ? "Recording refund..." : "Submit Refund"}</span>
                </button>
              </form>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Field({ label, field, profile, setProfile }) {
  return (
    <label className="text-xs font-semibold">
      {label}
      <input
        className={`${INPUT_STYLES.base} mt-1`}
        value={profile[field] || ""}
        onChange={(e) => setProfile({ ...profile, [field]: e.target.value })}
      />
    </label>
  );
}
