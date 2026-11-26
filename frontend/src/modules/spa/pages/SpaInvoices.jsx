import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Receipt,
  Plus,
  Search,
  RefreshCw,
  Eye,
  CreditCard,
  CheckCircle2,
  Clock,
  X,
  IndianRupee,
  Printer,
  Download,
  Share2,
  MessageCircle,
  AlertCircle,
  Smartphone,
  Banknote,
  FileText,
  Trash2,
} from "lucide-react";

import spaApi from "../services/spaApi";
import { PaymentStatusBadge } from "../components/StatusBadges";
import DateFilter from "../../../components/DateFilter";
import PageHeader from "../../../components/PageHeader";
import StatCard from "../../../components/StatCard";
import Pagination from "../../../components/Pagination";
import { useNotification } from "../../../context/NotificationContext";
import { formatTimeRange12Hour } from "../utils/timeFormat";
import BulkSelectionBar from "../../../components/BulkSelectionBar";
import useBulkSelection from "../../../hooks/useBulkSelection";
import { APP_NAME, MODULE_NAMES } from "../../../config/branding";

// ==========================================
// CONSTANTS
// ==========================================

const PAYMENT_METHODS = ["UPI", "Card", "Net Banking", "Cash"];

const EMPTY_PAYMENT_FORM = {
  payment_method: "UPI",
  amount: "",
  transaction_reference: "",
};

// ==========================================
// HELPERS
// ==========================================

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const getInvoiceFilename = (invoice) => {
  const safeNumber = String(
    invoice?.invoice_number || `spa-invoice-${invoice?.id || "document"}`
  ).replace(/[\\/:*?"<>|]/g, "-");
  return `${safeNumber}.pdf`;
};

const getWhatsAppNumber = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits;
  return null;
};

const getSpaInvoiceShareText = (invoice) =>
  `Spa Treatment Invoice ${invoice.invoice_number}\n` +
  `Booking Reference: ${invoice.booking_number || "—"}\n` +
  `Customer: ${invoice.customer_name}\n` +
  `Subtotal: ${formatCurrency(invoice.subtotal)}\n` +
  `GST (${invoice.tax_rate}%): ${formatCurrency(invoice.tax_amount)}\n` +
  (Number(invoice.discount_amount || 0) > 0
    ? `Discount: -${formatCurrency(invoice.discount_amount)}\n`
    : "") +
  `Total Amount: ${formatCurrency(invoice.total_amount)}\n` +
  `Paid: ${formatCurrency(invoice.paid_amount)}\n` +
  `Balance Due: ${formatCurrency(invoice.balance_due)}\n` +
  `Payment Status: ${invoice.payment_status}\n\n` +
  `Thank you for choosing ${APP_NAME} ${MODULE_NAMES.SPA}!`;

const toPdfBlob = (value) => {
  if (value instanceof Blob) {
    return value.type === "application/pdf"
      ? value
      : new Blob([value], { type: "application/pdf" });
  }
  return new Blob([value], { type: "application/pdf" });
};

const savePdfFile = (blob, filename) => {
  const pdfBlob = toPdfBlob(blob);
  const url = URL.createObjectURL(pdfBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
};

// Payment Method Badge Component
function PaymentMethodBadge({ method }) {
  switch (method) {
    case "UPI":
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-700 bg-violet-50 dark:bg-violet-950/40 dark:text-violet-300 px-2 py-0.5 rounded-full">
          <Smartphone size={11} />
          UPI
        </span>
      );
    case "Card":
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300 px-2 py-0.5 rounded-full">
          <CreditCard size={11} />
          Card
        </span>
      );
    case "Cash":
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 rounded-full">
          <Banknote size={11} />
          Cash
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-stone-700 bg-stone-100 dark:bg-stone-800 dark:text-stone-300 px-2 py-0.5 rounded-full">
          {method}
        </span>
      );
  }
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function SpaInvoices() {
  const [searchParams] = useSearchParams();
  const { showSuccess, showError, showDelete, confirm } = useNotification();

  // Data states
  const [invoices, setInvoices] = useState([]);
  const { selectedIds, toggle, toggleMany, clear } = useBulkSelection();
  const [payments, setPayments] = useState([]);
  const [completedBookings, setCompletedBookings] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Tabs: 'invoices' | 'transactions'
  const initialTab = searchParams.get("tab") === "transactions" ? "transactions" : "invoices";
  const [activeTab, setActiveTab] = useState(initialTab);

  // Filters
  const [search, setSearch] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("ALL");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [transactionMethodFilter, setTransactionMethodFilter] = useState("ALL");
  const [transactionStatusFilter, setTransactionStatusFilter] = useState("ALL");

  // Pagination states
  const [invoicePage, setInvoicePage] = useState(1);
  const [transactionPage, setTransactionPage] = useState(1);
  const pageSize = 10;

  // Date Filter State
  const [dateFilter, setDateFilter] = useState({
    preset: "today",
    startDate: "",
    endDate: "",
  });

  // Modals
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Selected records
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [gstRate, setGstRate] = useState("18");
  const [discountAmount, setDiscountAmount] = useState("0");

  // Payment Form
  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT_FORM);
  const [paymentError, setPaymentError] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // PDF Cache for Details Modal
  const [preparedPdf, setPreparedPdf] = useState(null);
  const [pdfPreparing, setPdfPreparing] = useState(false);
  const [pdfError, setPdfError] = useState("");

  // ==========================================
  // VIEW INVOICE & PDF HANDLING
  // ==========================================

  const handleViewInvoice = useCallback(async (invoice) => {
    setPdfError("");
    setPreparedPdf(null);
    setSelectedInvoice(invoice);
    setShowDetailsModal(true);
    setPdfPreparing(true);

    try {
      const res = await spaApi.getInvoice(invoice.id);
      setSelectedInvoice(res.data);

      const blob = await spaApi.downloadInvoicePdfBlob(invoice.id);
      const pdfBlob = toPdfBlob(blob);

      if (pdfBlob.size === 0) {
        throw new Error("The generated invoice PDF is empty.");
      }

      setPreparedPdf({
        invoiceId: Number(invoice.id),
        blob: pdfBlob,
      });
    } catch (err) {
      setPdfError(err?.response?.data?.detail || err?.message || "Failed to prepare PDF");
    } finally {
      setPdfPreparing(false);
    }
  }, []);

  const closeDetailsModal = () => {
    setShowDetailsModal(false);
    setSelectedInvoice(null);
    setPreparedPdf(null);
    setPdfError("");
  };

  const getPdfForInvoice = async (invoice) => {
    if (preparedPdf && Number(preparedPdf.invoiceId) === Number(invoice.id)) {
      return preparedPdf.blob;
    }

    const blob = await spaApi.downloadInvoicePdfBlob(invoice.id);
    const pdfBlob = toPdfBlob(blob);

    if (pdfBlob.size === 0) {
      throw new Error("The generated invoice PDF is empty.");
    }

    setPreparedPdf({
      invoiceId: Number(invoice.id),
      blob: pdfBlob,
    });

    return pdfBlob;
  };

  const handleDownloadPdf = async (invoice, e) => {
    e?.stopPropagation();
    if (!invoice?.id) return;

    try {
      const blob = await getPdfForInvoice(invoice);
      savePdfFile(blob, getInvoiceFilename(invoice));
      showSuccess("Invoice PDF downloaded successfully.", "PDF Downloaded");
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to download PDF", "Download Error");
    }
  };

  const handlePrint = async (invoice) => {
    if (!invoice?.id) return;

    const printWindow = window.open("about:blank", "_blank");

    try {
      const blob = await getPdfForInvoice(invoice);
      const url = URL.createObjectURL(blob);

      if (printWindow && !printWindow.closed) {
        printWindow.location.href = url;
        showSuccess("Invoice PDF opened. Use the PDF viewer's Print option.", "Print Ready");
        window.setTimeout(() => URL.revokeObjectURL(url), 120000);
      } else {
        savePdfFile(blob, getInvoiceFilename(invoice));
        showSuccess(
          "The PDF was downloaded because the browser blocked the new tab. Open it and select Print.",
          "PDF Downloaded"
        );
      }
    } catch (err) {
      if (printWindow && !printWindow.closed) {
        printWindow.close();
      }
      showError(err?.message || "Failed to prepare PDF for print", "Print Error");
    }
  };

  const handleWhatsAppShare = (invoice) => {
    const phone = getWhatsAppNumber(invoice.customer_phone);
    if (!phone) {
      showError("This customer does not have a valid Indian WhatsApp mobile number.", "Invalid Phone");
      return;
    }

    const shareText = getSpaInvoiceShareText(invoice);
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(shareText)}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    showSuccess(`WhatsApp opened for ${invoice.customer_name} with invoice details ready to send.`, "WhatsApp Opened");
  };

  const handleWhatsAppPdfShare = (invoice) => {
    const phone = getWhatsAppNumber(invoice.customer_phone);
    if (!phone) {
      showError("This customer does not have a valid Indian WhatsApp mobile number.", "Invalid Phone");
      return;
    }

    if (!preparedPdf || Number(preparedPdf.invoiceId) !== Number(invoice.id)) {
      showError("The invoice PDF is not ready yet. Please wait a moment.", "PDF Preparing");
      return;
    }

    const file = new File([preparedPdf.blob], getInvoiceFilename(invoice), {
      type: "application/pdf",
    });

    const shareData = {
      title: `Invoice ${invoice.invoice_number}`,
      text: getSpaInvoiceShareText(invoice),
      files: [file],
    };

    let canShareFile = false;
    try {
      if (
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        canShareFile = true;
      }
    } catch {
      // Not supported
    }

    if (canShareFile) {
      navigator
        .share(shareData)
        .then(() => showSuccess("Invoice PDF sharing completed.", "Shared"))
        .catch((shareError) => {
          if (shareError?.name !== "AbortError") {
            showError("Could not share the PDF file. You can download the PDF instead.", "Share Error");
          }
        });
      return;
    }

    savePdfFile(preparedPdf.blob, getInvoiceFilename(invoice));
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(getSpaInvoiceShareText(invoice))}`,
      "_blank",
      "noopener,noreferrer"
    );
    showSuccess(
      "The PDF was downloaded and customer's WhatsApp chat was opened. Attach the PDF and tap Send.",
      "WhatsApp Chat Opened"
    );
  };

  // ==========================================
  // LOAD DATA
  // ==========================================

  const loadData = useCallback(
    async ({ showLoader = true } = {}) => {
      if (showLoader) setLoading(true);

      try {
        const params = {
          preset: dateFilter.preset,
        };
        if (dateFilter.preset === "custom") {
          if (dateFilter.startDate) params.start_date = dateFilter.startDate;
          if (dateFilter.endDate) params.end_date = dateFilter.endDate;
        }

        const [invoiceRes, paymentRes] = await Promise.all([
          spaApi.getInvoices(params),
          spaApi.getPayments(params),
        ]);

        const nextInvoices = Array.isArray(invoiceRes?.data) ? invoiceRes.data : [];
        const nextPayments = Array.isArray(paymentRes?.data) ? paymentRes.data : [];

        setInvoices(nextInvoices);
        setPayments(nextPayments);

        return {
          invoices: nextInvoices,
          payments: nextPayments,
        };
      } catch (err) {
        const msg = err?.response?.data?.detail || "Failed to load invoices and payments";
        showError(msg, "Data Load Failed");
        setInvoices([]);
        setPayments([]);
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    [dateFilter, showError]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle URL query parameters (?id=... to auto-open invoice modal)
  useEffect(() => {
    const invoiceIdParam = searchParams.get("id");
    if (invoiceIdParam) {
      const parsedId = Number(invoiceIdParam);
      if (parsedId) {
        spaApi
          .getInvoice(parsedId)
          .then((res) => {
            if (res?.data) {
              handleViewInvoice(res.data);
            }
          })
          .catch(() => {
            // Ignore if not found
          });
      }
    }
  }, [searchParams, handleViewInvoice]);

  // ==========================================
  // METRICS & AGGREGATES
  // ==========================================

  const totalAmount = useMemo(
    () =>
      invoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0),
    [invoices]
  );

  const paidInvoicesCount = useMemo(
    () =>
      invoices.filter(
        (inv) =>
          String(inv.payment_status || "")
            .trim()
            .toLowerCase() === "paid"
      ).length,
    [invoices]
  );

  const pendingInvoicesCount = useMemo(
    () =>
      invoices.filter(
        (inv) =>
          String(inv.payment_status || "")
            .trim()
            .toLowerCase() === "pending" ||
          String(inv.payment_status || "")
            .trim()
            .toLowerCase() === "partially paid"
      ).length,
    [invoices]
  );

  // ==========================================
  // FILTER INVOICES
  // ==========================================

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();

    return invoices.filter((inv) => {
      const invoiceNumber = String(inv.invoice_number || "").toLowerCase();
      const bookingNumber = String(inv.booking_number || "").toLowerCase();
      const customerName = String(inv.customer_name || "").toLowerCase();
      const customerPhone = String(inv.customer_phone || "").toLowerCase();

      const matchesSearch =
        invoiceNumber.includes(q) ||
        bookingNumber.includes(q) ||
        customerName.includes(q) ||
        customerPhone.includes(q);

      const status = String(inv.payment_status || "").trim().toUpperCase();
      let matchesStatus = true;
      if (paymentStatusFilter === "PAID") {
        matchesStatus = status === "PAID";
      } else if (paymentStatusFilter === "PENDING") {
        matchesStatus = status === "PENDING";
      } else if (paymentStatusFilter === "PARTIALLY_PAID") {
        matchesStatus = status === "PARTIALLY PAID";
      }

      return matchesSearch && matchesStatus;
    });
  }, [invoices, search, paymentStatusFilter]);

  const canDeleteInvoice = (invoice) =>
    String(invoice.payment_status || "").trim().toLowerCase() === "pending" &&
    Number(invoice.paid_amount || 0) === 0 &&
    (invoice.payments || []).length === 0;

  const handleDeleteInvoice = async (invoice) => {
    const ok = await confirm({
      title: "Delete Treatment Invoice",
      message: `Delete invoice ${invoice.invoice_number}? Invoices with recorded payments cannot be deleted.`,
      confirmText: "Delete Invoice",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await spaApi.deleteInvoice(invoice.id);
      clear();
      showDelete(`Invoice ${invoice.invoice_number} deleted successfully.`, "Invoice Deleted");
      await loadData({ showLoader: false });
    } catch (err) {
      showError(err?.response?.data?.detail || "Invoice could not be deleted.", "Delete Failed");
    }
  };

  const handleDeleteSelectedInvoices = async () => {
    const targets = filteredInvoices.filter((invoice) => selectedIds.has(invoice.id) && canDeleteInvoice(invoice));
    if (!targets.length) return;
    const ok = await confirm({
      title: "Delete Selected Treatment Invoices",
      message: `Delete ${targets.length} selected unpaid invoice(s) with no payment records? Invoices with payment history are protected.`,
      confirmText: "Delete Selected",
      variant: "danger",
    });
    if (!ok) return;

    const results = await Promise.allSettled(targets.map((invoice) => spaApi.deleteInvoice(invoice.id)));
    clear();
    const deleted = results.filter((result) => result.status === "fulfilled").length;
    const failed = results.length - deleted;
    if (deleted) showDelete(`${deleted} invoice(s) deleted successfully.`, "Invoices Deleted");
    if (failed) showError(`${failed} invoice(s) could not be deleted. Payment history may be attached.`, "Some Deletions Failed");
    await loadData({ showLoader: false });
  };

  // ==========================================
  // FILTER PAYMENTS
  // ==========================================

  const filteredPayments = useMemo(() => {
    const q = transactionSearch.trim().toLowerCase();

    return payments.filter((p) => {
      const refNumber = String(p.payment_reference || "").toLowerCase();
      const invoiceNumber = String(p.invoice_number || "").toLowerCase();
      const bookingNumber = String(p.booking_number || "").toLowerCase();
      const customerName = String(p.customer_name || "").toLowerCase();
      const txRef = String(p.transaction_reference || "").toLowerCase();
      const method = String(p.payment_method || "").toLowerCase();

      const matchesSearch =
        refNumber.includes(q) ||
        invoiceNumber.includes(q) ||
        bookingNumber.includes(q) ||
        customerName.includes(q) ||
        txRef.includes(q) ||
        method.includes(q);

      const matchesMethod =
        transactionMethodFilter === "ALL" ||
        String(p.payment_method || "").toUpperCase() === transactionMethodFilter.toUpperCase();

      const matchesStatus =
        transactionStatusFilter === "ALL" ||
        String(p.payment_status || "").toUpperCase() === transactionStatusFilter.toUpperCase();

      return matchesSearch && matchesMethod && matchesStatus;
    });
  }, [payments, transactionSearch, transactionMethodFilter, transactionStatusFilter]);

  // ==========================================
  // GENERATE INVOICE MODAL
  // ==========================================

  const openGenerateInvoiceModal = async () => {
    setSelectedBookingId("");
    setGstRate("18");
    setDiscountAmount("0");
    setShowGenerateModal(true);
    setSaving(false);

    try {
      const res = await spaApi.getBookings({ status: "Completed" });
      const completedList = Array.isArray(res?.data) ? res.data : [];
      // Only bookings that do not already have an invoice
      const eligible = completedList.filter((b) => !b.has_invoice && !b.invoice_id);
      setCompletedBookings(eligible);
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to load completed bookings", "Error");
      setCompletedBookings([]);
    }
  };

  const selectedBookingData = useMemo(() => {
    if (!selectedBookingId) return null;
    return completedBookings.find((b) => Number(b.id) === Number(selectedBookingId)) || null;
  }, [selectedBookingId, completedBookings]);

  const bookingSubtotal = useMemo(() => {
    if (!selectedBookingData) return 0;
    const services = selectedBookingData.booking_services || [];
    return services.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  }, [selectedBookingData]);

  const calculatedGstAmount = useMemo(() => {
    const rate = Number(gstRate) || 0;
    return (bookingSubtotal * rate) / 100;
  }, [bookingSubtotal, gstRate]);

  const calculatedGrandTotal = useMemo(() => {
    const discount = Number(discountAmount) || 0;
    return Math.max(0, bookingSubtotal + calculatedGstAmount - discount);
  }, [bookingSubtotal, calculatedGstAmount, discountAmount]);

  const handleGenerateInvoice = async (e) => {
    e.preventDefault();

    if (!selectedBookingId) {
      showError("Please select a completed appointment.", "Validation Error");
      return;
    }

    const rate = Number(gstRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      showError("GST rate must be between 0 and 100%.", "Validation Error");
      return;
    }

    const disc = Number(discountAmount) || 0;
    if (disc < 0) {
      showError("Discount cannot be negative.", "Validation Error");
      return;
    }

    setSaving(true);
    try {
      const res = await spaApi.createInvoice({
        booking_id: Number(selectedBookingId),
        tax_rate: rate,
        discount_amount: disc,
      });

      setShowGenerateModal(false);
      showSuccess(
        `Invoice #${res.data.invoice_number} generated successfully.`,
        "Invoice Generated"
      );

      await loadData({ showLoader: false });

      // Automatically open the new invoice in details view
      if (res?.data) {
        handleViewInvoice(res.data);
      }
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to generate invoice", "Error");
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // RECORD PAYMENT
  // ==========================================

  const openRecordPaymentModal = (invoice, e) => {
    e?.stopPropagation();
    setSelectedInvoice(invoice);
    const bal = Number(invoice.balance_due || 0);
    setPaymentForm({
      payment_method: "UPI",
      amount: bal > 0 ? bal.toFixed(2) : "0.00",
      transaction_reference: "",
    });
    setPaymentError("");
    setShowPaymentModal(true);
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();

    if (!selectedInvoice) return;

    const amountVal = parseFloat(paymentForm.amount);
    if (!amountVal || amountVal <= 0) {
      setPaymentError("Please enter a valid payment amount greater than zero.");
      return;
    }

    const maxBalance = Number(selectedInvoice.balance_due || 0);
    if (amountVal > maxBalance + 0.01) {
      setPaymentError(
        `Payment amount (₹${amountVal.toFixed(2)}) cannot exceed the outstanding balance of ₹${maxBalance.toFixed(2)}.`
      );
      return;
    }

    setSubmittingPayment(true);
    setPaymentError("");

    try {
      await spaApi.recordPayment(selectedInvoice.id, {
        payment_method: paymentForm.payment_method,
        amount: amountVal,
        transaction_reference: paymentForm.transaction_reference.trim() || undefined,
      });

      setShowPaymentModal(false);
      showSuccess(
        `Payment of ₹${amountVal.toFixed(2)} recorded successfully.`,
        "Payment Settled"
      );

      // Refresh invoices and payments
      await loadData({ showLoader: false });

      // Refresh details modal if open
      if (showDetailsModal && selectedInvoice?.id) {
        const refreshed = await spaApi.getInvoice(selectedInvoice.id);
        setSelectedInvoice(refreshed.data);
      }
    } catch (err) {
      setPaymentError(err?.response?.data?.detail || "Failed to record payment.");
    } finally {
      setSubmittingPayment(false);
    }
  };

  // ==========================================
  // RENDER PAGE UI
  // ==========================================

  return (
    <div className="space-y-6">
      {/* A1 Standard PageHeader */}
      <PageHeader
        title="Spa Invoices"
        description="Generate treatment invoices, manage customer payments and track outstanding balances."
        actions={
          <button
            type="button"
            onClick={openGenerateInvoiceModal}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#F59E0B] px-4 py-2.5 text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100 shadow-xs hover:bg-[#E5A910] cursor-pointer transition self-start sm:self-auto"
          >
            <Plus size={16} />
            <span>Generate Invoice</span>
          </button>
        }
      />

      {/* DATE FILTER */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateFilter
          selectedPreset={dateFilter.preset}
          startDate={dateFilter.startDate}
          endDate={dateFilter.endDate}
          onChange={(newFilter) => setDateFilter(newFilter)}
        />
      </div>

      {/* 4 SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full">
        <StatCard
          compact
          title="Total Invoices"
          value={invoices.length}
          icon={<Receipt size={20} />}
        />

        <StatCard
          compact
          title="Total Amount"
          value={formatCurrency(totalAmount)}
          icon={<IndianRupee size={20} />}
        />

        <StatCard
          compact
          title="Paid Invoices"
          value={paidInvoicesCount}
          icon={<CheckCircle2 size={20} />}
          color="emerald"
          active={paymentStatusFilter === "PAID"}
          onClick={() => {
            setActiveTab("invoices");
            setPaymentStatusFilter((prev) => (prev === "PAID" ? "ALL" : "PAID"));
          }}
        />

        <StatCard
          compact
          title="Pending Invoices"
          value={pendingInvoicesCount}
          icon={<Clock size={20} />}
          color="amber"
          active={paymentStatusFilter === "PENDING"}
          onClick={() => {
            setActiveTab("invoices");
            setPaymentStatusFilter((prev) => (prev === "PENDING" ? "ALL" : "PENDING"));
          }}
        />
      </div>

      {/* TABS HEADER */}
      <div className="flex border-b border-stone-200 dark:border-stone-800">
        <button
          type="button"
          onClick={() => setActiveTab("invoices")}
          className={`border-b-2 px-5 py-3 text-xs sm:text-sm font-semibold transition cursor-pointer ${
            activeTab === "invoices"
              ? "border-[#F59E0B] text-stone-900 dark:text-white font-bold"
              : "border-transparent text-stone-500 hover:text-stone-900 dark:hover:text-stone-300"
          }`}
        >
          Invoices ({invoices.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("transactions")}
          className={`border-b-2 px-5 py-3 text-xs sm:text-sm font-semibold transition cursor-pointer ${
            activeTab === "transactions"
              ? "border-[#F59E0B] text-stone-900 dark:text-white font-bold"
              : "border-transparent text-stone-500 hover:text-stone-900 dark:hover:text-stone-300"
          }`}
        >
          Payment Transactions ({payments.length})
        </button>
      </div>

      {/* TAB 1: INVOICES LIST */}
      {activeTab === "invoices" && (
        <div className="overflow-hidden rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#101722] shadow-xs">
          {/* Controls Bar */}
          <div className="flex flex-col justify-between gap-3 border-b border-stone-200/80 dark:border-stone-800 p-4 md:flex-row md:items-center">
            <div>
              <h2 className="font-bold text-sm sm:text-base text-stone-900 dark:text-white">
                Spa Treatment Invoices
              </h2>
              <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                {filteredInvoices.length} invoice(s) found
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  className="w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 py-2 pl-9 pr-3 text-xs sm:text-sm outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]"
                />
              </div>

              <select
                value={paymentStatusFilter}
                onChange={(e) => setPaymentStatusFilter(e.target.value)}
                className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 px-3 py-2 text-xs sm:text-sm outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]"
              >
                <option value="ALL">All Payment Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="PARTIALLY_PAID">Partially Paid</option>
                <option value="PAID">Paid</option>
              </select>

              <button
                type="button"
                onClick={() => loadData()}
                disabled={loading}
                title="Refresh invoices"
                className="rounded-xl border border-stone-200 dark:border-stone-800 p-2 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 disabled:opacity-50 cursor-pointer transition"
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="px-4 pt-3">
            <BulkSelectionBar count={selectedIds.size} onDelete={handleDeleteSelectedInvoices} onClear={clear} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-xs sm:text-sm">
              <thead className="bg-stone-50 dark:bg-stone-900/50 text-stone-500 dark:text-stone-400 text-[11px] uppercase tracking-wider font-semibold border-b border-stone-100 dark:border-stone-800">
                <tr>
                  <th className="px-4 py-3"><input type="checkbox" aria-label="Select deletable invoices on this page" checked={filteredInvoices.slice((invoicePage - 1) * pageSize, invoicePage * pageSize).filter(canDeleteInvoice).length > 0 && filteredInvoices.slice((invoicePage - 1) * pageSize, invoicePage * pageSize).filter(canDeleteInvoice).every((invoice) => selectedIds.has(invoice.id))} onChange={() => toggleMany(filteredInvoices.slice((invoicePage - 1) * pageSize, invoicePage * pageSize).filter(canDeleteInvoice).map((invoice) => invoice.id))} className="h-4 w-4 accent-amber-500" /></th>
                  <th className="px-4 py-3">Invoice Number</th>
                  <th className="px-4 py-3">Booking Ref</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3 text-right">Subtotal</th>
                  <th className="px-4 py-3 text-right">GST</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Balance Due</th>
                  <th className="px-4 py-3 text-center">Payment Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-stone-100 dark:divide-stone-800/80">
                {loading ? (
                  <tr>
                    <td colSpan="12" className="p-12 text-center text-xs sm:text-sm text-stone-400">
                      <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-[#F59E0B]" />
                      Loading treatment invoices...
                    </td>
                  </tr>
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan="12" className="p-12 text-center text-xs sm:text-sm text-stone-400">
                      <FileText size={36} className="mx-auto mb-2 text-stone-300 dark:text-stone-700" />
                      No invoices found for the selected period.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.slice((invoicePage - 1) * pageSize, invoicePage * pageSize).map((inv) => {
                    const balance = Number(inv.balance_due || 0);
                    return (
                      <tr
                        key={inv.id}
                        className="hover:bg-stone-50/60 dark:hover:bg-stone-800/30 transition-colors"
                      >
                        <td className="px-4 py-3.5"><input type="checkbox" aria-label={`Select invoice ${inv.invoice_number}`} checked={selectedIds.has(inv.id)} disabled={!canDeleteInvoice(inv)} onChange={() => toggle(inv.id)} title={canDeleteInvoice(inv) ? "Select invoice for deletion" : "Only unpaid invoices with no payment records can be deleted"} className="h-4 w-4 accent-amber-500 disabled:opacity-30" /></td>
                        <td className="px-4 py-3.5">
                          <p className="font-mono font-bold text-stone-900 dark:text-white">
                            {inv.invoice_number}
                          </p>
                          <p className="text-[10px] text-stone-400">ID: #{inv.id}</p>
                        </td>

                        <td className="px-4 py-3.5 font-mono text-xs text-stone-700 dark:text-stone-300">
                          {inv.booking_number || "—"}
                        </td>

                        <td className="px-4 py-3.5 text-xs text-stone-600 dark:text-stone-400 whitespace-nowrap">
                          {formatDate(inv.created_at)}
                        </td>

                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-stone-900 dark:text-white">
                            {inv.customer_name || "Guest Customer"}
                          </p>
                          {inv.customer_phone && (
                            <p className="text-[11px] text-stone-500 dark:text-stone-400">
                              {inv.customer_phone}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-right font-medium text-stone-700 dark:text-stone-300">
                          {formatCurrency(inv.subtotal)}
                        </td>

                        <td className="px-4 py-3.5 text-right text-xs text-stone-600 dark:text-stone-400">
                          {formatCurrency(inv.tax_amount)}
                          <span className="block text-[10px] text-stone-400">
                            ({inv.tax_rate}%)
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-right font-bold text-stone-900 dark:text-white">
                          {formatCurrency(inv.total_amount)}
                        </td>

                        <td className="px-4 py-3.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(inv.paid_amount)}
                        </td>

                        <td className="px-4 py-3.5 text-right font-bold text-amber-600 dark:text-amber-400">
                          {formatCurrency(inv.balance_due)}
                        </td>

                        <td className="px-4 py-3.5 text-center">
                          <PaymentStatusBadge status={inv.payment_status} />
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleViewInvoice(inv)}
                              title="View Invoice Details"
                              className="rounded-lg p-1.5 text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
                            >
                              <Eye size={16} />
                            </button>

                            <button
                              type="button"
                              onClick={(e) => handleDownloadPdf(inv, e)}
                              title="Download PDF Invoice"
                              className="rounded-lg p-1.5 text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
                            >
                              <Download size={16} />
                            </button>

                            {balance > 0 && (
                              <button
                                type="button"
                                onClick={(e) => openRecordPaymentModal(inv, e)}
                                title="Record Customer Payment"
                                className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 dark:bg-amber-500/20 px-2 py-1 text-xs font-semibold text-amber-700 dark:text-[#F59E0B] hover:bg-amber-500/20 transition cursor-pointer"
                              >
                                <CreditCard size={12} />
                                <span>Pay</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteInvoice(inv)}
                              disabled={!canDeleteInvoice(inv)}
                              title={canDeleteInvoice(inv) ? "Delete invoice" : "Only unpaid invoices with no payment records can be deleted"}
                              aria-label={`Delete invoice ${inv.invoice_number}`}
                              className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-rose-950/30 transition cursor-pointer"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={invoicePage}
            totalPages={Math.ceil(filteredInvoices.length / pageSize) || 1}
            onPageChange={setInvoicePage}
            totalRecords={filteredInvoices.length}
            limit={pageSize}
          />
        </div>
      )}

      {/* TAB 2: PAYMENT TRANSACTIONS */}
      {activeTab === "transactions" && (
        <div className="overflow-hidden rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#101722] shadow-xs">
          {/* Controls Bar */}
          <div className="flex flex-col justify-between gap-3 border-b border-stone-200/80 dark:border-stone-800 p-4 md:flex-row md:items-center">
            <div>
              <h2 className="font-bold text-sm sm:text-base text-stone-900 dark:text-white">
                Payment Transactions Ledger
              </h2>
              <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                {filteredPayments.length} transaction(s) recorded
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                />
                <input
                  value={transactionSearch}
                  onChange={(e) => setTransactionSearch(e.target.value)}
                  placeholder="Search ref #, invoice #, customer..."
                  className="w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 py-2 pl-9 pr-3 text-xs sm:text-sm outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]"
                />
              </div>

              <select
                value={transactionMethodFilter}
                onChange={(e) => setTransactionMethodFilter(e.target.value)}
                className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 px-3 py-2 text-xs sm:text-sm outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]"
              >
                <option value="ALL">All Payment Methods</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              <select
                value={transactionStatusFilter}
                onChange={(e) => setTransactionStatusFilter(e.target.value)}
                className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 px-3 py-2 text-xs sm:text-sm outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]"
              >
                <option value="ALL">All Statuses</option>
                <option value="PAID">Paid</option>
                <option value="PENDING">Pending</option>
              </select>

              <button
                type="button"
                onClick={() => loadData()}
                disabled={loading}
                title="Refresh payment transactions"
                className="rounded-xl border border-stone-200 dark:border-stone-800 p-2 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 disabled:opacity-50 cursor-pointer transition"
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-xs sm:text-sm">
              <thead className="bg-stone-50 dark:bg-stone-900/50 text-stone-500 dark:text-stone-400 text-[11px] uppercase tracking-wider font-semibold border-b border-stone-100 dark:border-stone-800">
                <tr>
                  <th className="px-4 py-3">Payment Ref</th>
                  <th className="px-4 py-3">Invoice Number</th>
                  <th className="px-4 py-3">Booking Ref</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3">Received By</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-stone-100 dark:divide-stone-800/80">
                {loading ? (
                  <tr>
                    <td colSpan="10" className="p-12 text-center text-xs sm:text-sm text-stone-400">
                      <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-[#F59E0B]" />
                      Loading payment transactions...
                    </td>
                  </tr>
                ) : filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="p-12 text-center text-xs sm:text-sm text-stone-400">
                      <CreditCard size={36} className="mx-auto mb-2 text-stone-300 dark:text-stone-700" />
                      No payment transactions found.
                    </td>
                  </tr>
                ) : (
                  filteredPayments.slice((transactionPage - 1) * pageSize, transactionPage * pageSize).map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-stone-50/60 dark:hover:bg-stone-800/30 transition-colors"
                    >
                      <td className="px-4 py-3.5">
                        <span className="font-mono font-bold text-stone-900 dark:text-white">
                          {p.payment_reference}
                        </span>
                        {p.transaction_reference && (
                          <span className="block text-[11px] text-stone-400 font-mono">
                            Ref: {p.transaction_reference}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 font-mono text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            spaApi.getInvoice(p.invoice_id).then((res) => {
                              handleViewInvoice(res.data);
                            });
                          }}
                          className="font-bold text-[#9A3412] dark:text-[#FFB02E] hover:underline cursor-pointer"
                          title="View associated invoice"
                        >
                          {p.invoice_number || `INV #${p.invoice_id}`}
                        </button>
                      </td>

                      <td className="px-4 py-3.5 font-mono text-xs text-stone-600 dark:text-stone-400">
                        {p.booking_number || "—"}
                      </td>

                      <td className="px-4 py-3.5 font-semibold text-stone-900 dark:text-white">
                        {p.customer_name || "Guest Customer"}
                      </td>

                      <td className="px-4 py-3.5 text-xs text-stone-600 dark:text-stone-400 whitespace-nowrap">
                        {formatDate(p.paid_at)}
                      </td>

                      <td className="px-4 py-3.5">
                        <PaymentMethodBadge method={p.payment_method} />
                      </td>

                      <td className="px-4 py-3.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(p.amount)}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={11} />
                          {p.payment_status || "Paid"}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-xs text-stone-600 dark:text-stone-400">
                        {p.receiver_name || "Spa Receptionist"}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            spaApi.getInvoice(p.invoice_id).then((res) => {
                              handleViewInvoice(res.data);
                            });
                          }}
                          title="View Invoice Details"
                          className="rounded-lg p-1.5 text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={transactionPage}
            totalPages={Math.ceil(filteredPayments.length / pageSize) || 1}
            onPageChange={setTransactionPage}
            totalRecords={filteredPayments.length}
            limit={pageSize}
          />
        </div>
      )}

      {/* MODAL 1: GENERATE INVOICE */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={(e) => e.target === e.currentTarget && setShowGenerateModal(false)}>
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#101722] border border-stone-200 dark:border-stone-800 shadow-2xl p-6 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-2.5">
                <div className="rounded-xl bg-[#F59E0B]/10 p-2 text-[#9A3412] dark:text-[#FFB02E]">
                  <Receipt size={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-stone-900 dark:text-white">
                    Generate Treatment Invoice
                  </h2>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Create official billing for a completed Spa appointment
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowGenerateModal(false)}
                className="rounded-lg p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleGenerateInvoice} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Select Completed Appointment *
                </label>
                {completedBookings.length === 0 ? (
                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
                    <p className="font-semibold">No eligible completed appointments.</p>
                    <p className="mt-0.5 text-stone-600 dark:text-stone-400">
                      Invoices can only be generated for appointments in <strong>Completed</strong> status that have not yet been invoiced.
                    </p>
                  </div>
                ) : (
                  <select
                    value={selectedBookingId}
                    onChange={(e) => setSelectedBookingId(e.target.value)}
                    required
                    className="w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 px-3 py-2 text-xs sm:text-sm outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]"
                  >
                    <option value="">-- Choose a completed booking --</option>
                    {completedBookings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.booking_number} • {b.customer_name} • {b.booking_date} ({formatTimeRange12Hour(b.start_time, b.end_time)})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedBookingData && (
                <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/30 p-3.5 space-y-2.5 text-xs">
                  <div className="grid grid-cols-2 gap-2 border-b border-stone-200/70 dark:border-stone-800 pb-2">
                    <div>
                      <span className="text-stone-500 dark:text-stone-400">Customer:</span>
                      <p className="font-bold text-stone-900 dark:text-white">
                        {selectedBookingData.customer_name} ({selectedBookingData.customer_phone})
                      </p>
                    </div>
                    <div>
                      <span className="text-stone-500 dark:text-stone-400">Primary Therapist:</span>
                      <p className="font-bold text-stone-900 dark:text-white">
                        {selectedBookingData.therapist_name}
                      </p>
                    </div>
                  </div>

                  {/* Services Snapshot */}
                  <div>
                    <span className="text-stone-500 dark:text-stone-400 block font-semibold mb-1">
                      Rendered Therapies:
                    </span>
                    <div className="space-y-1">
                      {selectedBookingData.booking_services?.map((svc) => (
                        <div key={svc.id} className="flex justify-between text-stone-700 dark:text-stone-300">
                          <span>
                            {svc.service_name} × {svc.quantity} ({svc.duration_minutes}m)
                          </span>
                          <span className="font-semibold text-stone-900 dark:text-white">
                            {formatCurrency(svc.subtotal)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    GST Rate (%) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={gstRate}
                    onChange={(e) => setGstRate(e.target.value)}
                    required
                    className="w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 text-xs sm:text-sm outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    Discount Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 text-xs sm:text-sm outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]"
                  />
                </div>
              </div>

              {selectedBookingData && (
                <div className="rounded-xl bg-stone-100 dark:bg-[#151D29] p-3.5 space-y-1.5 text-xs">
                  <div className="flex justify-between text-stone-600 dark:text-stone-400">
                    <span>Subtotal:</span>
                    <span className="font-bold text-stone-900 dark:text-white">
                      {formatCurrency(bookingSubtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-stone-600 dark:text-stone-400">
                    <span>GST ({gstRate}%):</span>
                    <span className="font-bold text-stone-900 dark:text-white">
                      {formatCurrency(calculatedGstAmount)}
                    </span>
                  </div>
                  {Number(discountAmount) > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Discount:</span>
                      <span>-{formatCurrency(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-stone-200 dark:border-stone-700 pt-1.5 font-bold text-sm text-stone-900 dark:text-white">
                    <span>Grand Total:</span>
                    <span className="text-[#9A3412] dark:text-[#FFB02E]">
                      {formatCurrency(calculatedGrandTotal)}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-3 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setShowGenerateModal(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !selectedBookingId}
                  className="rounded-xl bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold hover:opacity-95 px-4 py-2 text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer transition flex items-center gap-1.5"
                >
                  <Plus size={14} />
                  <span>{saving ? "Generating..." : "Generate Invoice"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: INVOICE DETAILS MODAL (FOLLOWING RESTAURANT FLOW) */}
      {showDetailsModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={(e) => e.target === e.currentTarget && closeDetailsModal()}>
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#101722] border border-stone-200 dark:border-stone-800 shadow-2xl p-6 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/10 text-[#9A3412] dark:text-[#FFB02E] flex items-center justify-center font-bold">
                  <FileText size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-stone-900 dark:text-white">
                      Invoice {selectedInvoice.invoice_number}
                    </h2>
                    {pdfPreparing && (
                      <span className="text-[11px] text-stone-400 animate-pulse">
                        (Preparing PDF...)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Created on {formatDate(selectedInvoice.created_at)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeDetailsModal}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Error / Loading */}
            {pdfError && (
              <div className="mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{pdfError}</span>
              </div>
            )}

            <div className="mt-4 space-y-5">
              {/* Customer & Booking Meta Header */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-stone-50 dark:bg-stone-900/40 border border-stone-200/80 dark:border-stone-800 text-xs">
                <div>
                  <span className="text-stone-500 dark:text-stone-400 block font-medium">Billed To:</span>
                  <strong className="text-stone-900 dark:text-white text-sm block mt-0.5">
                    {selectedInvoice.customer_name || "Guest Customer"}
                  </strong>
                  {selectedInvoice.customer_phone && (
                    <span className="text-stone-600 dark:text-stone-400 block mt-0.5">
                      Phone: {selectedInvoice.customer_phone}
                    </span>
                  )}
                  {selectedInvoice.customer_email && (
                    <span className="text-stone-500 dark:text-stone-400 block text-[11px]">
                      Email: {selectedInvoice.customer_email}
                    </span>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-stone-500 dark:text-stone-400 block font-medium">Booking Reference:</span>
                  <strong className="font-mono text-stone-900 dark:text-white text-sm block mt-0.5">
                    {selectedInvoice.booking_number || "—"}
                  </strong>
                  <div className="mt-2 flex justify-end">
                    <PaymentStatusBadge status={selectedInvoice.payment_status} />
                  </div>
                </div>
              </div>

              {/* Treatment Details Table */}
              <div>
                <h4 className="text-xs font-bold text-stone-800 dark:text-stone-200 uppercase tracking-wider mb-2">
                  Treatment Details
                </h4>
                <div className="rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-stone-50 dark:bg-stone-900/50 border-b border-stone-100 dark:border-stone-800 text-stone-500 font-semibold">
                      <tr>
                        <th className="px-4 py-2.5 text-left">Service / Treatment</th>
                        <th className="px-4 py-2.5 text-center">Qty</th>
                        <th className="px-4 py-2.5 text-right">Unit Price</th>
                        <th className="px-4 py-2.5 text-center">Duration</th>
                        <th className="px-4 py-2.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                      {selectedInvoice.items?.map((item) => {
                        const unitPrice = Number(item.unit_price || 0);
                        const totalItemPrice = Number(item.total_amount || item.subtotal || 0);
                        return (
                          <tr key={item.id}>
                            <td className="px-4 py-2.5 font-semibold text-stone-900 dark:text-white">
                              {item.service_name}
                            </td>
                            <td className="px-4 py-2.5 text-center text-stone-500">
                              {item.quantity || 1}
                            </td>
                            <td className="px-4 py-2.5 text-right text-stone-600 dark:text-stone-400">
                              {formatCurrency(unitPrice)}
                            </td>
                            <td className="px-4 py-2.5 text-center text-stone-500">
                              {item.duration_minutes ? `${item.duration_minutes} mins` : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-stone-900 dark:text-white">
                              {formatCurrency(totalItemPrice)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="flex justify-end pt-2">
                <div className="w-64 space-y-2 text-xs">
                  <div className="flex justify-between text-stone-600 dark:text-stone-400">
                    <span>Subtotal</span>
                    <span className="font-semibold text-stone-900 dark:text-white">
                      {formatCurrency(selectedInvoice.subtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-stone-600 dark:text-stone-400">
                    <span>GST ({selectedInvoice.tax_rate}%)</span>
                    <span className="font-semibold text-stone-900 dark:text-white">
                      {formatCurrency(selectedInvoice.tax_amount)}
                    </span>
                  </div>
                  {Number(selectedInvoice.discount_amount || 0) > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Discount</span>
                      <span>-{formatCurrency(selectedInvoice.discount_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-stone-200 dark:border-stone-700 pt-2 font-bold text-sm text-stone-900 dark:text-white">
                    <span>Total Amount</span>
                    <span>{formatCurrency(selectedInvoice.total_amount)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600 font-semibold">
                    <span>Paid Amount</span>
                    <span>{formatCurrency(selectedInvoice.paid_amount)}</span>
                  </div>
                  <div className="flex justify-between border-t border-dashed border-stone-200 dark:border-stone-700 pt-2 font-bold text-amber-600 dark:text-amber-400">
                    <span>Outstanding Balance</span>
                    <span>{formatCurrency(selectedInvoice.balance_due)}</span>
                  </div>
                </div>
              </div>

              {/* Payment History Section */}
              <div>
                <h4 className="text-xs font-bold text-stone-800 dark:text-stone-200 uppercase tracking-wider mb-2">
                  Payment History ({selectedInvoice.payments?.length || 0})
                </h4>
                {selectedInvoice.payments && selectedInvoice.payments.length > 0 ? (
                  <div className="rounded-xl border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800 text-xs">
                    {selectedInvoice.payments.map((p) => (
                      <div key={p.id} className="p-3 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <PaymentMethodBadge method={p.payment_method} />
                            <span className="font-mono text-[11px] font-semibold text-stone-800 dark:text-stone-200">
                              {p.payment_reference}
                            </span>
                            {p.transaction_reference && (
                              <span className="text-[11px] text-stone-500 font-mono">
                                ({p.transaction_reference})
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-stone-400 mt-1">
                            {formatDate(p.paid_at)} • Received by: {p.receiver_name || "Spa Receptionist"}
                          </div>
                        </div>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                          {formatCurrency(p.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-stone-200 dark:border-stone-800 p-4 text-center text-xs text-stone-400">
                    No payment transactions recorded yet for this invoice.
                  </div>
                )}
              </div>

              {/* Modal Actions (Restaurant Reference Workflow) */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-4 border-t border-stone-100 dark:border-stone-800">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => handleDownloadPdf(selectedInvoice, e)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 dark:border-stone-700 px-3 py-2 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition cursor-pointer"
                    title="Download invoice PDF"
                  >
                    <Download size={14} />
                    <span>Download</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrint(selectedInvoice)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 dark:border-stone-700 px-3 py-2 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition cursor-pointer"
                    title="Print invoice PDF"
                  >
                    <Printer size={14} />
                    <span>Print</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleWhatsAppShare(selectedInvoice)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition cursor-pointer"
                    title="Open direct WhatsApp chat with customer"
                  >
                    <MessageCircle size={14} />
                    <span>WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleWhatsAppPdfShare(selectedInvoice)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 dark:border-stone-700 px-3 py-2 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition cursor-pointer"
                    title="Share invoice PDF file with customer"
                  >
                    <Share2 size={14} />
                    <span>Share PDF</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {Number(selectedInvoice.balance_due || 0) > 0 && (
                    <button
                      type="button"
                      onClick={(e) => openRecordPaymentModal(selectedInvoice, e)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#F59E0B] px-4 py-2 text-xs font-bold text-stone-900 dark:text-stone-100 hover:bg-[#E5A910] transition cursor-pointer shadow-xs"
                    >
                      <CreditCard size={14} />
                      <span>Record Payment</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeDetailsModal}
                    className="rounded-xl px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: RECORD PAYMENT MODAL */}
      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={(e) => e.target === e.currentTarget && setShowPaymentModal(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#101722] border border-stone-200 dark:border-stone-800 shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-stone-100 dark:border-stone-800">
              <h2 className="text-base font-bold text-stone-900 dark:text-white flex items-center gap-2">
                <CreditCard size={18} className="text-[#F59E0B]" />
                <span>Record Customer Payment</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Invoice & Outstanding Balance Summary Box */}
            <div className="mt-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <div className="flex justify-between">
                <span>Invoice Number:</span>
                <strong className="font-mono">{selectedInvoice.invoice_number}</strong>
              </div>
              <div className="flex justify-between">
                <span>Customer:</span>
                <strong>{selectedInvoice.customer_name}</strong>
              </div>
              <div className="flex justify-between">
                <span>Invoice Total:</span>
                <span>{formatCurrency(selectedInvoice.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Previously Paid:</span>
                <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
                  {formatCurrency(selectedInvoice.paid_amount)}
                </span>
              </div>
              <div className="flex justify-between border-t border-amber-200/80 dark:border-amber-800 pt-1 font-bold">
                <span>Outstanding Balance:</span>
                <span className="text-amber-700 dark:text-[#F59E0B]">
                  {formatCurrency(selectedInvoice.balance_due)}
                </span>
              </div>
            </div>

            {paymentError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{paymentError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitPayment} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Payment Method *
                </label>
                <select
                  value={paymentForm.payment_method}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, payment_method: e.target.value })
                  }
                  required
                  className="w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 text-xs sm:text-sm outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Payment Amount (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={Number(selectedInvoice.balance_due || 0)}
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  required
                  className="w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 text-xs sm:text-sm outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]"
                />
                <span className="text-[11px] text-stone-400 mt-0.5 block">
                  Max payable: {formatCurrency(selectedInvoice.balance_due)}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Transaction Reference (UPI ID, Card Receipt, Bank Ref)
                </label>
                <input
                  type="text"
                  placeholder="e.g. UPI-TXN-1029384"
                  value={paymentForm.transaction_reference}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, transaction_reference: e.target.value })
                  }
                  className="w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 text-xs sm:text-sm outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPayment}
                  className="rounded-xl bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold hover:opacity-95 px-4 py-2 text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer transition flex items-center gap-1.5"
                >
                  <CreditCard size={14} />
                  <span>{submittingPayment ? "Recording..." : "Confirm & Settle"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
