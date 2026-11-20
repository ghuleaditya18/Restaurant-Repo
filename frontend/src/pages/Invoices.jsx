import { useCallback, useEffect, useMemo, useState } from "react";

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
  MessageCircle,
  Share2,
} from "lucide-react";

import {
  getAllInvoices,
  getInvoiceById,
  createInvoice,
  downloadInvoicePdf,
} from "../services/invoiceService";

import {
  getAllPayments,
  createPayment,
  updatePaymentStatus,
} from "../services/paymentService";

import { getAllOrders } from "../services/orderService";
import DateFilter from "../components/DateFilter";
import { useNotification } from "../context/NotificationContext";

// ==========================================
// CONSTANTS
// ==========================================

const PAYMENT_METHODS = ["UPI", "Net Banking", "Card", "Cash"];

const EMPTY_PAYMENT = {
  payment_method: "UPI",
  reference_number: "",
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

const errorMessage = (error) => {
  const detail = error?.response?.data?.detail;

  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || "Invalid value").join(", ");
  }

  if (typeof detail === "string") {
    return detail;
  }

  return error?.message || "Something went wrong. Please try again.";
};

const statusStyle = (status) => {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();

  if (normalized === "paid") {
    return "bg-green-50 text-green-700";
  }

  if (normalized === "failed" || normalized === "cancelled") {
    return "bg-red-50 text-red-700";
  }

  return "bg-amber-50 text-amber-700";
};

const getInvoiceFilename = (invoice) => {
  const safeNumber = String(
    invoice?.invoice_number || `invoice-${invoice?.id || "document"}`,
  ).replace(/[\\/:*?"<>|]/g, "-");

  return `${safeNumber}.pdf`;
};

const getWhatsAppNumber = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");

  // Customer records use valid 10-digit Indian mobile numbers.
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits;

  return null;
};

const getInvoiceShareText = (invoice) =>
  `Invoice ${invoice.invoice_number}\n` +
  `Order: ${invoice.order_number}\n` +
  `Customer: ${invoice.customer_name}\n` +
  `Subtotal: ${formatCurrency(invoice.subtotal)}\n` +
  `GST (${invoice.gst_rate}%): ${formatCurrency(invoice.gst_amount)}\n` +
  `Total: ${formatCurrency(invoice.total_amount)}\n\n` +
  "Thank you for dining with us!";

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

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

  // Give the browser enough time to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [orders, setOrders] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingOrders, setRefreshingOrders] = useState(false);

  const [search, setSearch] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("ALL");
  const [activeTab, setActiveTab] = useState("invoices");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [transactionStatusFilter, setTransactionStatusFilter] = useState("ALL");

  // Modals
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Selected records
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState("");

  // Forms
  const [gstRate, setGstRate] = useState("5");
  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT);

  // PDF cache for the currently opened invoice's download and print actions.
  const [preparedPdf, setPreparedPdf] = useState(null);
  const [pdfPreparing, setPdfPreparing] = useState(false);
  const [pdfError, setPdfError] = useState("");

  const { showSuccess, showError, confirm } = useNotification();

  // Date Filter State
  const [dateFilter, setDateFilter] = useState({
    preset: "today",
    startDate: "",
    endDate: "",
  });

  // Notifications
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [generateError, setGenerateError] = useState("");

  // ==========================================
  // LOAD ALL DATA
  // ==========================================

  const loadData = useCallback(async ({ showLoader = true } = {}) => {
    if (showLoader) setLoading(true);

    setError("");

    try {
      const params = {
        preset: dateFilter.preset,
      };
      if (dateFilter.preset === "custom") {
        if (dateFilter.startDate) params.start_date = dateFilter.startDate;
        if (dateFilter.endDate) params.end_date = dateFilter.endDate;
      }

      const [invoiceData, paymentData, orderData] = await Promise.all([
        getAllInvoices(params),
        getAllPayments(params),
        getAllOrders(),
      ]);

      const nextInvoices = Array.isArray(invoiceData) ? invoiceData : [];
      const nextPayments = Array.isArray(paymentData) ? paymentData : [];
      const nextOrders = Array.isArray(orderData) ? orderData : [];

      setInvoices(nextInvoices);
      setPayments(nextPayments);
      setOrders(nextOrders);

      return {
        invoices: nextInvoices,
        payments: nextPayments,
        orders: nextOrders,
      };
    } catch (err) {
      const msg = errorMessage(err);
      setError(msg);
      showError(msg, "Failed to load invoices");
      throw err;
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [dateFilter, showError]);

  useEffect(() => {
    loadData().catch(() => {
      // loadData sets the visible page error.
    });
  }, [loadData]);

  // ==========================================
  // REFRESH ELIGIBLE ORDERS WHEN MODAL OPENS
  // ==========================================

  const openGenerateInvoiceModal = async () => {
    setGenerateError("");
    setMessage("");
    setSelectedOrder("");
    setShowGenerateModal(true);
    setRefreshingOrders(true);

    try {
      const [latestOrders, latestInvoices] = await Promise.all([
        getAllOrders(),
        getAllInvoices(),
      ]);

      setOrders(Array.isArray(latestOrders) ? latestOrders : []);
      setInvoices(Array.isArray(latestInvoices) ? latestInvoices : []);
    } catch (err) {
      setGenerateError(errorMessage(err));
    } finally {
      setRefreshingOrders(false);
    }
  };

  // ==========================================
  // STATISTICS
  // ==========================================

  const totalAmount = useMemo(
    () =>
      invoices.reduce(
        (sum, invoice) => sum + Number(invoice.total_amount || 0),
        0,
      ),
    [invoices],
  );

  const paidInvoices = invoices.filter(
    (invoice) =>
      String(invoice.payment_status || "")
        .trim()
        .toLowerCase() === "paid",
  ).length;

  const pendingInvoices = invoices.filter(
    (invoice) =>
      String(invoice.payment_status || "")
        .trim()
        .toLowerCase() === "pending",
  ).length;

  // ==========================================
  // FILTER INVOICES
  // ==========================================

  const filteredInvoices = useMemo(() => {
    const value = search.trim().toLowerCase();

    return invoices.filter((invoice) => {
      const matchesSearch =
        String(invoice.invoice_number || "").toLowerCase().includes(value) ||
        String(invoice.order_number || "").toLowerCase().includes(value) ||
        String(invoice.customer_name || "").toLowerCase().includes(value);

      const status = String(invoice.payment_status || "").trim().toUpperCase();
      const matchesStatus =
        paymentStatusFilter === "ALL" || status === paymentStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [invoices, search, paymentStatusFilter]);

  const invoiceMap = useMemo(() => {
    const map = {};
    invoices.forEach((inv) => {
      map[inv.id] = inv;
    });
    return map;
  }, [invoices]);

  const filteredPayments = useMemo(() => {
    const value = transactionSearch.trim().toLowerCase();
    return payments.filter((payment) => {
      const inv = invoiceMap[payment.invoice_id];
      const invoiceNumber = String(
        inv?.invoice_number || `INV-${payment.invoice_id}`,
      ).toLowerCase();
      const refNumber = String(payment.reference_number || "").toLowerCase();
      const method = String(payment.payment_method || "").toLowerCase();

      const matchesSearch =
        invoiceNumber.includes(value) ||
        refNumber.includes(value) ||
        method.includes(value);

      const status = String(payment.status || "").trim().toUpperCase();
      const matchesStatus =
        transactionStatusFilter === "ALL" || status === transactionStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [payments, invoiceMap, transactionSearch, transactionStatusFilter]);

  // ==========================================
  // IDENTIFY ELIGIBLE ORDERS
  // ==========================================

  const invoicedOrderIds = useMemo(
    () => new Set(invoices.map((invoice) => Number(invoice.order_id))),
    [invoices],
  );

  const eligibleOrders = useMemo(
    () =>
      orders.filter((order) => {
        const normalizedStatus = String(order.status || "")
          .trim()
          .toLowerCase();

        const alreadyInvoiced = invoicedOrderIds.has(Number(order.id));

        return normalizedStatus === "served" && !alreadyInvoiced;
      }),
    [orders, invoicedOrderIds],
  );

  // ==========================================
  // GENERATE INVOICE
  // ==========================================

  const handleGenerateInvoice = async (event) => {
    event.preventDefault();

    if (!selectedOrder) {
      setGenerateError("Please select an order.");
      return;
    }

    const rate = Number(gstRate);

    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setGenerateError("GST rate must be between 0 and 100.");
      return;
    }

    setSaving(true);
    setGenerateError("");

    try {
      await createInvoice({
        order_id: Number(selectedOrder),
        gst_rate: rate,
      });

      setShowGenerateModal(false);
      setSelectedOrder("");
      setGstRate("5");
      const msg = "Invoice generated successfully.";
      setMessage(msg);
      showSuccess(msg, "Invoice Generated");

      await loadData({ showLoader: false });
    } catch (err) {
      setGenerateError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // VIEW INVOICE AND PREPARE PDF
  // ==========================================

  const handleViewInvoice = async (invoice) => {
    setError("");
    setPdfError("");
    setPreparedPdf(null);

    setSelectedInvoice(invoice);
    setShowDetailsModal(true);
    setPdfPreparing(true);

    try {
      const data = await getInvoiceById(invoice.id);
      setSelectedInvoice(data);

      // Prepare the PDF for download and print actions.
      const blob = await downloadInvoicePdf(invoice.id);
      const pdfBlob = toPdfBlob(blob);

      if (pdfBlob.size === 0) {
        throw new Error("The generated invoice PDF is empty.");
      }

      setPreparedPdf({
        invoiceId: Number(invoice.id),
        blob: pdfBlob,
      });
    } catch (err) {
      setPdfError(errorMessage(err));
    } finally {
      setPdfPreparing(false);
    }
  };

  const closeDetailsModal = () => {
    setShowDetailsModal(false);
    setSelectedInvoice(null);
    setPreparedPdf(null);
    setPdfError("");
  };

  // ==========================================
  // GET PDF FOR ACTIONS
  // ==========================================

  const getPdfForInvoice = async (invoice) => {
    if (preparedPdf && Number(preparedPdf.invoiceId) === Number(invoice.id)) {
      return preparedPdf.blob;
    }

    const blob = await downloadInvoicePdf(invoice.id);
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

  // ==========================================
  // DOWNLOAD PDF
  // ==========================================

  const handleDownloadPdf = async (invoice) => {
    if (!invoice?.id) return;

    setSaving(true);
    setError("");

    try {
      const blob = await getPdfForInvoice(invoice);

      savePdfFile(blob, getInvoiceFilename(invoice));
      const msg = "Invoice PDF downloaded successfully.";
      setMessage(msg);
      showSuccess(msg, "PDF Downloaded");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // PRINT PDF
  // ==========================================

  const handlePrint = async (invoice) => {
    if (!invoice?.id) return;

    // Open the tab immediately from the user click to reduce popup blocking.
    const printWindow = window.open("about:blank", "_blank");

    setSaving(true);
    setError("");

    try {
      const blob = await getPdfForInvoice(invoice);
      const url = URL.createObjectURL(blob);

      if (printWindow && !printWindow.closed) {
        printWindow.location.href = url;
        setMessage("Invoice PDF opened. Use the PDF viewer's Print option.");

        window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
      } else {
        savePdfFile(blob, getInvoiceFilename(invoice));
        setMessage(
          "The PDF was downloaded because the browser blocked the new tab. Open it and select Print.",
        );
      }
    } catch (err) {
      if (printWindow && !printWindow.closed) {
        printWindow.close();
      }

      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // OPEN A DIRECT WHATSAPP CHAT FOR THE INVOICE CUSTOMER
  // ==========================================

  const handleWhatsAppShare = (invoice) => {
    const phone = getWhatsAppNumber(invoice.customer_phone);

    if (!phone) {
      setError("This customer does not have a valid WhatsApp mobile number.");
      return;
    }

    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(getInvoiceShareText(invoice))}`;

    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    setMessage(
      `WhatsApp opened for ${invoice.customer_name} with the invoice details ready to send.`,
    );
  };

  const handleWhatsAppPdfShare = (invoice) => {
    const phone = getWhatsAppNumber(invoice.customer_phone);

    if (!phone) {
      setError("This customer does not have a valid WhatsApp mobile number.");
      return;
    }

    if (!preparedPdf || Number(preparedPdf.invoiceId) !== Number(invoice.id)) {
      setPdfError(
        "The invoice PDF is not ready yet. Please wait and try again.",
      );
      return;
    }

    const file = new File([preparedPdf.blob], getInvoiceFilename(invoice), {
      type: "application/pdf",
    });
    const shareData = {
      title: `Invoice ${invoice.invoice_number}`,
      text: getInvoiceShareText(invoice),
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
      // browser does not support file sharing
    }

    if (canShareFile) {
      try {
        navigator
          .share(shareData)
          .then(() => setMessage("Invoice PDF sharing completed."))
          .catch((shareError) => {
            if (shareError?.name !== "AbortError") {
              setError("Could not share the PDF. Try Download PDF instead.");
            }
          });
        return;
      } catch {
        // Fall through to download and open the direct customer chat.
      }
    }

    savePdfFile(preparedPdf.blob, getInvoiceFilename(invoice));
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(getInvoiceShareText(invoice))}`,
      "_blank",
      "noopener,noreferrer",
    );
    setMessage(
      "The PDF was downloaded and the customer’s WhatsApp chat was opened. Attach the PDF and tap Send.",
    );
  };

  // ==========================================
  // PAYMENT MODAL
  // ==========================================

  const openPaymentModal = (invoice) => {
    setSelectedInvoice(invoice);
    setPaymentForm(EMPTY_PAYMENT);
    setError("");
    setShowPaymentModal(true);
  };

  // ==========================================
  // RECORD PAYMENT
  // ==========================================

  const handleRecordPayment = async (event) => {
    event.preventDefault();

    if (!selectedInvoice) return;

    setSaving(true);
    setError("");

    try {
      await createPayment(selectedInvoice.id, {
        payment_method: paymentForm.payment_method,
        reference_number: paymentForm.reference_number.trim() || null,
      });

      setShowPaymentModal(false);
      const msg = "Payment record created successfully. Payment is currently Pending.";
      setMessage(msg);
      showSuccess(msg, "Payment Recorded");

      await loadData({ showLoader: false });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // MARK PAYMENT AS PAID
  // ==========================================

  const handleMarkPaid = async (payment) => {
    const confirmed = await confirm({
      title: "Confirm Payment Receipt",
      message: "Are you sure you want to mark this payment as Paid?",
      confirmText: "Mark Paid",
      cancelText: "Cancel",
      variant: "primary",
    });

    if (!confirmed) return;

    setSaving(true);
    setError("");

    try {
      await updatePaymentStatus(payment.id, { status: "Paid" });

      const successText = "Payment marked as Paid successfully.";
      setMessage(successText);
      showSuccess(successText, "Payment Settled");

      await loadData({ showLoader: false });

      if (selectedInvoice?.id) {
        const updatedInvoice = await getInvoiceById(selectedInvoice.id);
        setSelectedInvoice(updatedInvoice);
      }
    } catch (err) {
      const msg = errorMessage(err);
      setError(msg);
      showError(msg, "Payment Update Failed");
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // PAGE UI
  // ==========================================

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}

      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-[#1C1917] md:text-3xl">
            Invoice Management
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Generate invoices and manage customer payments.
          </p>
        </div>

        <button
          type="button"
          onClick={openGenerateInvoiceModal}
          className="flex items-center justify-center gap-2 rounded-lg bg-[#F5B716] px-4 py-2.5 text-sm font-bold text-[#1C1917] shadow-xs hover:bg-[#E5A910] cursor-pointer transition"
        >
          <Plus size={18} />
          Generate Invoice
        </button>
      </div>

      {/* NOTIFICATIONS */}

      {message && (
        <Notification
          message={message}
          onClose={() => setMessage("")}
          variant="success"
        />
      )}

      {error && (
        <Notification
          message={error}
          onClose={() => setError("")}
          variant="error"
        />
      )}

      {/* DATE FILTER */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <DateFilter
          selectedPreset={dateFilter.preset}
          startDate={dateFilter.startDate}
          endDate={dateFilter.endDate}
          onChange={(newFilter) => setDateFilter(newFilter)}
        />
      </div>

      {/* SUMMARY CARDS */}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Total Invoices"
          value={invoices.length}
          icon={<Receipt size={20} />}
        />

        <SummaryCard
          title="Total Amount"
          value={formatCurrency(totalAmount)}
          icon={<IndianRupee size={20} />}
        />

        <SummaryCard
          title="Paid Invoices"
          value={paidInvoices}
          icon={<CheckCircle2 size={20} />}
          active={paymentStatusFilter === "PAID"}
          onClick={() => {
            setActiveTab("invoices");
            setPaymentStatusFilter((prev) => (prev === "PAID" ? "ALL" : "PAID"));
          }}
        />

        <SummaryCard
          title="Pending Invoices"
          value={pendingInvoices}
          icon={<Clock size={20} />}
          active={paymentStatusFilter === "PENDING"}
          onClick={() => {
            setActiveTab("invoices");
            setPaymentStatusFilter((prev) => (prev === "PENDING" ? "ALL" : "PENDING"));
          }}
        />
      </div>

      {/* TABS */}
      <div className="mb-4 flex border-b border-[#E7E5E4]">
        <button
          type="button"
          onClick={() => setActiveTab("invoices")}
          className={`border-b-2 px-5 py-3 text-sm font-semibold transition ${
            activeTab === "invoices"
              ? "border-[#F5B716] text-[#1C1917] font-bold border-b-2"
              : "border-transparent text-stone-500 hover:text-[#1C1917]"
          }`}
        >
          Invoices ({filteredInvoices.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("transactions")}
          className={`border-b-2 px-5 py-3 text-sm font-semibold transition ${
            activeTab === "transactions"
              ? "border-[#F5B716] text-[#1C1917] font-bold border-b-2"
              : "border-transparent text-stone-500 hover:text-[#1C1917]"
          }`}
        >
          Payment Transactions ({filteredPayments.length})
        </button>
      </div>

      {/* INVOICE TABLE */}

      {activeTab === "invoices" && (
      <div className="overflow-hidden rounded-xl border border-[#E7E5E4] bg-white">
        <div className="flex flex-col justify-between gap-4 border-b border-[#E7E5E4] p-4 md:flex-row md:items-center">
          <div>
            <h2 className="font-semibold text-[#1C1917]">
              Restaurant Invoices
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              {filteredInvoices.length} invoices found
            </p>
          </div>

          <div className="flex gap-2">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search invoice..."
                className="w-full rounded-lg border border-[#E7E5E4] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30 sm:w-64"
              />
            </div>

            <select
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
              className="rounded-lg border border-[#E7E5E4] px-3 py-2.5 text-sm outline-none focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30"
            >
              <option value="ALL">All Payment Statuses</option>
              <option value="PAID">Paid</option>
              <option value="PENDING">Pending</option>
            </select>

            <button
              type="button"
              onClick={() => loadData()}
              disabled={loading}
              title="Refresh invoices"
              className="rounded-lg border border-[#E7E5E4] px-3 text-gray-600 hover:bg-[#FAFAF9] disabled:opacity-50"
            >
              <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left">
            <thead className="bg-[#FAF9F6] text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Invoice Number</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Subtotal</th>
                <th className="px-4 py-3">GST</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Payment Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F0ECE6]">
              {loading ? (
                <tr>
                  <td
                    colSpan="8"
                    className="p-10 text-center text-sm text-gray-500"
                  >
                    Loading invoices...
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td
                    colSpan="8"
                    className="p-10 text-center text-sm text-gray-500"
                  >
                    No invoices found.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-[#FAF9F6]">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-[#1C1917]">
                        {invoice.invoice_number}
                      </p>

                      <p className="mt-1 text-xs text-gray-500">
                        ID: {invoice.id}
                      </p>
                    </td>

                    <td className="px-4 py-4 text-sm">
                      {invoice.order_number}
                    </td>

                    <td className="px-4 py-4 text-sm">
                      {invoice.customer_name}
                    </td>

                    <td className="px-4 py-4 text-sm">
                      {formatCurrency(invoice.subtotal)}
                    </td>

                    <td className="px-4 py-4 text-sm">
                      {Number(invoice.gst_rate)}%
                    </td>

                    <td className="px-4 py-4 text-sm font-semibold text-[#1C1917]">
                      {formatCurrency(invoice.total_amount)}
                    </td>

                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyle(invoice.payment_status)}`}
                      >
                        {invoice.payment_status}
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleViewInvoice(invoice)}
                          title="View invoice"
                          className="rounded-lg p-2 hover:bg-stone-100"
                        >
                          <Eye size={17} />
                        </button>

                        {String(invoice.payment_status).toLowerCase() ===
                          "pending" && (
                          <button
                            type="button"
                            onClick={() => openPaymentModal(invoice)}
                            title="Record payment"
                            className="rounded-lg p-2 text-stone-900 hover:bg-stone-100"
                          >
                            <CreditCard size={17} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* PAYMENT TRANSACTIONS TABLE */}
      {activeTab === "transactions" && (
        <div className="overflow-hidden rounded-xl border border-[#E7E5E4] bg-white">
          <div className="flex flex-col justify-between gap-4 border-b border-[#E7E5E4] p-4 md:flex-row md:items-center">
            <div>
              <h2 className="font-semibold text-[#1C1917]">
                Payment Transactions
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {filteredPayments.length} transactions recorded
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={transactionSearch}
                  onChange={(event) => setTransactionSearch(event.target.value)}
                  placeholder="Search transaction or ref..."
                  className="w-full rounded-lg border border-[#E7E5E4] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30 sm:w-60"
                />
              </div>

              <select
                value={transactionStatusFilter}
                onChange={(e) => setTransactionStatusFilter(e.target.value)}
                className="rounded-lg border border-[#E7E5E4] px-3 py-2.5 text-sm outline-none focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30"
              >
                <option value="ALL">All Statuses</option>
                <option value="PAID">Paid</option>
                <option value="PENDING">Pending</option>
                <option value="FAILED">Failed</option>
              </select>

              <button
                type="button"
                onClick={() => loadData()}
                disabled={loading}
                title="Refresh payments"
                className="rounded-lg border border-[#E7E5E4] px-3 py-2.5 text-gray-600 hover:bg-[#FAFAF9] disabled:opacity-50"
              >
                <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left">
              <thead className="bg-[#FAF9F6] text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Txn ID</th>
                  <th className="px-4 py-3">Invoice Number</th>
                  <th className="px-4 py-3">Payment Method</th>
                  <th className="px-4 py-3">Reference Number</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Paid Date</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0ECE6]">
                {loading ? (
                  <tr>
                    <td colSpan="7" className="p-10 text-center text-sm text-gray-500">
                      Loading payments...
                    </td>
                  </tr>
                ) : filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-10 text-center text-sm text-gray-500">
                      No payment transactions found.
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((payment) => {
                    const inv = invoiceMap[payment.invoice_id];
                    return (
                      <tr key={payment.id} className="hover:bg-[#FAF9F6]">
                        <td className="px-4 py-4 text-sm font-medium text-[#1C1917]">
                          #{payment.id}
                        </td>
                        <td className="px-4 py-4 text-sm text-stone-900 font-medium">
                          {inv?.invoice_number || `Invoice #${payment.invoice_id}`}
                        </td>
                        <td className="px-4 py-4 text-sm text-[#1C1917]">
                          {payment.payment_method}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500">
                          {payment.reference_number || "—"}
                        </td>
                        <td className="px-4 py-4 text-sm font-semibold text-[#1C1917]">
                          {formatCurrency(payment.amount)}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500">
                          {payment.paid_at
                            ? new Date(payment.paid_at).toLocaleString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyle(
                              payment.status,
                            )}`}
                          >
                            {payment.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================
          GENERATE INVOICE MODAL
      ===================================== */}

      {showGenerateModal && (
        <Modal
          title="Generate Invoice"
          onClose={() => setShowGenerateModal(false)}
        >
          <form onSubmit={handleGenerateInvoice} className="space-y-4">
            {generateError && <ErrorBox message={generateError} />}

            <div>
              <label className="mb-2 block text-sm font-medium text-[#1C1917]">
                Select Served Order
              </label>

              <select
                value={selectedOrder}
                onChange={(event) => setSelectedOrder(event.target.value)}
                disabled={refreshingOrders}
                required
                className="w-full rounded-lg border border-[#E7E5E4] px-3 py-3 text-sm outline-none focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30 disabled:bg-gray-50"
              >
                <option value="">
                  {refreshingOrders ? "Refreshing orders..." : "Choose order"}
                </option>

                {eligibleOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.order_number} – {order.customer_name} – Table{" "}
                    {order.table_number}
                  </option>
                ))}
              </select>

              {refreshingOrders && (
                <p className="mt-2 text-xs text-gray-500">
                  Fetching the latest order information...
                </p>
              )}

              {!refreshingOrders &&
                !generateError &&
                eligibleOrders.length === 0 && (
                  <p className="mt-2 text-xs text-amber-700">
                    No eligible Served orders are available for invoicing.
                  </p>
                )}

              {!refreshingOrders && eligibleOrders.length > 0 && (
                <p className="mt-2 text-xs text-green-700">
                  {eligibleOrders.length} eligible order(s) available.
                </p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#1C1917]">
                GST Rate (%)
              </label>

              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={gstRate}
                onChange={(event) => setGstRate(event.target.value)}
                required
                className="w-full rounded-lg border border-[#E7E5E4] px-3 py-3 text-sm outline-none focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30"
              />

              <p className="mt-1 text-xs text-gray-500">
                Enter the GST rate applicable to this invoice.
              </p>
            </div>

            <div className="flex justify-end gap-3 border-t border-[#E7E5E4] pt-4">
              <button
                type="button"
                onClick={() => setShowGenerateModal(false)}
                className="rounded-lg border border-[#E7E5E4] px-4 py-2.5 text-sm"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={
                  saving || refreshingOrders || eligibleOrders.length === 0
                }
                className="rounded-lg bg-[#F5B716] px-5 py-2 text-sm font-bold text-[#1C1917] hover:bg-[#E5A910] disabled:opacity-50 shadow-xs cursor-pointer transition"
              >
                {saving ? "Generating..." : "Generate Invoice"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* =====================================
          PAYMENT MODAL
      ===================================== */}

      {showPaymentModal && selectedInvoice && (
        <Modal
          title="Record Payment"
          onClose={() => setShowPaymentModal(false)}
        >
          <form onSubmit={handleRecordPayment} className="space-y-4">
            {error && <ErrorBox message={error} />}

            <div className="rounded-lg bg-[#FAFAF9] p-4">
              <p className="text-xs text-gray-500">Invoice Number</p>

              <p className="mt-1 font-semibold text-[#1C1917]">
                {selectedInvoice.invoice_number}
              </p>

              <p className="mt-3 text-xs text-gray-500">Amount Payable</p>

              <p className="mt-1 text-xl font-semibold text-stone-900">
                {formatCurrency(selectedInvoice.total_amount)}
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#1C1917]">
                Payment Method
              </label>

              <select
                value={paymentForm.payment_method}
                onChange={(event) =>
                  setPaymentForm((previous) => ({
                    ...previous,
                    payment_method: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-[#E7E5E4] px-3 py-3 text-sm"
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#1C1917]">
                Reference Number (Optional)
              </label>

              <input
                value={paymentForm.reference_number}
                onChange={(event) =>
                  setPaymentForm((previous) => ({
                    ...previous,
                    reference_number: event.target.value,
                  }))
                }
                maxLength={100}
                placeholder="Enter transaction reference"
                className="w-full rounded-lg border border-[#E7E5E4] px-3 py-3 text-sm"
              />
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Creating a payment record will initially set its status to
              Pending. Mark it Paid only after confirming receipt.
            </div>

            <div className="flex justify-end gap-3 border-t border-[#E7E5E4] pt-4">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="rounded-lg border border-[#E7E5E4] px-4 py-2.5 text-sm"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#F5B716] px-5 py-2 text-sm font-bold text-[#1C1917] hover:bg-[#E5A910] disabled:opacity-50 shadow-xs cursor-pointer transition"
              >
                {saving ? "Saving..." : "Record Payment"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* =====================================
          INVOICE DETAILS MODAL
      ===================================== */}

      {showDetailsModal && selectedInvoice && (
        <Modal title="Invoice Details" onClose={closeDetailsModal} wide>
          <div className="space-y-5">
            {error && <ErrorBox message={error} />}

            {pdfError && <ErrorBox message={pdfError} />}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-[#1C1917]">
                  {selectedInvoice.invoice_number}
                </h3>

                <p className="mt-1 text-xs text-gray-500">
                  Order: {selectedInvoice.order_number}
                </p>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs ${statusStyle(selectedInvoice.payment_status)}`}
              >
                {selectedInvoice.payment_status}
              </span>
            </div>

            {pdfPreparing && (
              <div className="rounded-lg border border-[#E7E5E4] bg-[#FAF9F6] px-4 py-3 text-sm text-gray-600">
                Preparing invoice PDF for download, printing and sharing...
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 rounded-lg bg-[#FAFAF9] p-4 sm:grid-cols-2">
              <Detail label="Customer" value={selectedInvoice.customer_name} />

              <Detail
                label="Table"
                value={`Table ${selectedInvoice.table_number}`}
              />

              <Detail
                label="Invoice Date"
                value={formatDate(selectedInvoice.created_at)}
              />

              <Detail label="GST Rate" value={`${selectedInvoice.gst_rate}%`} />
            </div>

            <div className="overflow-x-auto rounded-lg border border-[#E7E5E4]">
              <table className="w-full min-w-[450px] text-left">
                <thead className="bg-[#FAF9F6] text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-3">Item</th>
                    <th className="px-3 py-3">Quantity</th>
                    <th className="px-3 py-3">Unit Price</th>
                    <th className="px-3 py-3">Amount</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#F0ECE6]">
                  {(selectedInvoice.items || []).map((item, index) => (
                    <tr key={item.id ?? index}>
                      <td className="px-3 py-3 text-sm">{item.item_name}</td>

                      <td className="px-3 py-3 text-sm">{item.quantity}</td>

                      <td className="px-3 py-3 text-sm">
                        {formatCurrency(item.unit_price)}
                      </td>

                      <td className="px-3 py-3 text-sm font-medium">
                        {formatCurrency(item.line_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ml-auto max-w-sm space-y-3 rounded-lg bg-[#FAFAF9] p-4">
              <AmountRow label="Subtotal" value={selectedInvoice.subtotal} />

              <AmountRow
                label={`GST (${selectedInvoice.gst_rate}%)`}
                value={selectedInvoice.gst_amount}
              />

              <div className="flex justify-between border-t border-[#DED6CA] pt-3">
                <span className="font-semibold text-[#1C1917]">
                  Total Amount
                </span>

                <span className="text-xl font-bold text-stone-900">
                  {formatCurrency(selectedInvoice.total_amount)}
                </span>
              </div>
            </div>

            {/* PAYMENT HISTORY */}

            <div>
              <h3 className="mb-3 font-semibold text-[#1C1917]">
                Payment History
              </h3>

              {payments.filter(
                (payment) =>
                  Number(payment.invoice_id) === Number(selectedInvoice.id),
              ).length === 0 ? (
                <p className="rounded-lg bg-[#FAF9F6] p-4 text-sm text-gray-500">
                  No payment records available.
                </p>
              ) : (
                <div className="space-y-3">
                  {payments
                    .filter(
                      (payment) =>
                        Number(payment.invoice_id) ===
                        Number(selectedInvoice.id),
                    )
                    .map((payment) => (
                      <div
                        key={payment.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E7E5E4] p-4"
                      >
                        <div>
                          <p className="text-sm font-medium text-[#1C1917]">
                            {payment.payment_method}
                          </p>

                          <p className="mt-1 text-xs text-gray-500">
                            Reference: {payment.reference_number || "—"}
                          </p>

                          <p className="mt-1 text-xs text-gray-500">
                            {formatCurrency(payment.amount)}
                          </p>

                          {payment.paid_at && (
                            <p className="mt-1 text-xs text-gray-400">
                              Paid: {formatDate(payment.paid_at)}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <span
                            className={`rounded-full px-3 py-1 text-xs ${statusStyle(payment.status)}`}
                          >
                            {payment.status}
                          </span>

                          {String(payment.status).toLowerCase() ===
                            "pending" && (
                            <button
                              type="button"
                              onClick={() => handleMarkPaid(payment)}
                              disabled={saving}
                              className="rounded-lg bg-[#F5B716] px-3 py-1.5 text-xs font-bold text-[#1C1917] hover:bg-[#E5A910] disabled:opacity-50 shadow-xs cursor-pointer transition"
                            >
                              Mark Paid
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* PDF ACTIONS */}

            <div className="flex flex-wrap justify-end gap-2 border-t border-[#E7E5E4] pt-4">
              <button
                type="button"
                onClick={() => handleDownloadPdf(selectedInvoice)}
                disabled={saving || pdfPreparing}
                className="flex items-center gap-2 rounded-lg border border-[#E7E5E4] px-4 py-2.5 text-sm text-[#1C1917] hover:bg-[#FAFAF9] disabled:opacity-50"
              >
                <Download size={16} />
                Download PDF
              </button>

              <button
                type="button"
                onClick={() => handlePrint(selectedInvoice)}
                disabled={saving || pdfPreparing}
                className="flex items-center gap-2 rounded-lg border border-[#E7E5E4] px-4 py-2.5 text-sm text-[#1C1917] hover:bg-[#FAFAF9] disabled:opacity-50"
              >
                <Printer size={16} />
                Print PDF
              </button>

              <button
                type="button"
                onClick={() => handleWhatsAppPdfShare(selectedInvoice)}
                disabled={
                  saving ||
                  pdfPreparing ||
                  !preparedPdf ||
                  Number(preparedPdf.invoiceId) !== Number(selectedInvoice.id)
                }
                className="flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 shadow-xs disabled:opacity-50 cursor-pointer transition"
              >
                <Share2 size={16} />
                Share PDF
              </button>

              <button
                type="button"
                onClick={() => handleWhatsAppShare(selectedInvoice)}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-bold text-white hover:bg-[#1EBE5D] shadow-xs disabled:opacity-50 cursor-pointer transition"
              >
                <MessageCircle size={16} />
                WhatsApp
              </button>
            </div>

            <p className="text-right text-xs text-gray-500">
              Share PDF opens your device’s share options. Choose WhatsApp and
              confirm the customer chat and Send action.
            </p>

            {!pdfPreparing && !preparedPdf && (
              <p className="text-right text-xs text-gray-500">
                PDF is not ready. Close and reopen this invoice to try preparing
                it again.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ==========================================
// REUSABLE COMPONENTS
// ==========================================

function SummaryCard({ title, value, icon, active = false, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-4 transition ${
        onClick ? "cursor-pointer" : ""
      } ${
        active
          ? "border-[#F5B716] bg-[#FEF9C3]/40 shadow-xs ring-1 ring-[#F5B716]"
          : "border-stone-200/90 bg-white hover:border-stone-300"
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>

          <h3 className="mt-1 text-xl font-semibold text-[#1C1917]">{value}</h3>
        </div>

        <div
          className={`rounded-lg p-2.5 transition ${
            active ? "bg-[#F5B716] text-[#1C1917] font-bold" : "bg-[#FEF9C3] text-amber-900 border border-yellow-200"
          }`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div
        className={`my-auto max-h-[92vh] w-full ${
          wide ? "max-w-3xl" : "max-w-lg"
        } overflow-y-auto rounded-xl bg-white shadow-xl`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E7E5E4] bg-white px-5 py-4">
          <h2 className="font-semibold text-[#1C1917]">{title}</h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-gray-100"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase text-gray-500">{label}</p>

      <p className="mt-1 text-sm font-medium text-[#1C1917]">{value ?? "—"}</p>
    </div>
  );
}

function AmountRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-gray-600">{label}</span>

      <span className="font-medium text-[#1C1917]">
        {formatCurrency(value)}
      </span>
    </div>
  );
}

function ErrorBox({ message }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

function Notification({ message, onClose, variant = "success" }) {
  const className =
    variant === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-green-200 bg-green-50 text-green-700";

  return (
    <div
      className={`mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${className}`}
    >
      <span>{message}</span>

      <button type="button" onClick={onClose} aria-label="Dismiss notification">
        <X size={16} />
      </button>
    </div>
  );
}
