import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CreditCard,
  Download,
  Eye,
  FilePlus2,
  FileText,
  IndianRupee,
  Search,
  Wallet,
} from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import StatCard from "../../components/StatCard";
import StatusBadge from "../../components/StatusBadge";
import { useNotification } from "../../context/NotificationContext";
import { BUTTON_VARIANTS, CARD_STYLES, INPUT_STYLES } from "../../utils/themeTokens";
import VillaDataTable from "../villas/VillaDataTable";
import { packagesApi, pkgDateTime, pkgError, pkgMoney } from "./packagesApi";

const PAYMENT_METHODS = ["Cash", "UPI", "Card", "Net Banking"];
const PAYMENT_TYPES = ["Advance", "Partial", "Full"];

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

export default function PackageInvoices() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showSuccess, showError } = useNotification();

  const preselectedBookingId = searchParams.get("bookingId") || "";

  const [invoices, setInvoices] = useState([]);
  const [unbilledBookings, setUnbilledBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("payment_status") || "");
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 15;

  // Generate Invoice Modal
  const [genOpen, setGenOpen] = useState(Boolean(preselectedBookingId));
  const [genForm, setGenForm] = useState({
    booking_id: preselectedBookingId,
    gst_rate: "18.00",
    notes: "",
  });
  const [genError, setGenError] = useState("");
  const [generating, setGenerating] = useState(false);

  // Collect Payment Modal
  const [payTarget, setPayTarget] = useState(null);
  const [payForm, setPayForm] = useState({
    amount: "",
    payment_method: "UPI",
    payment_type: "Full",
    reference_number: "",
  });
  const [payError, setPayError] = useState("");
  const [paying, setPaying] = useState(false);

  // Invoice Detail Modal
  const [detailInvoice, setDetailInvoice] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const [invRes, bkRes] = await Promise.all([
        packagesApi.invoices({
          search: searchQuery.trim() || undefined,
          payment_status: statusFilter || undefined,
          page,
          page_size: pageSize,
        }),
        packagesApi.bookings({ page: 1, page_size: 100 }),
      ]);
      setInvoices(invRes.data?.items || []);
      setTotalRecords(invRes.data?.total ?? 0);
      setTotalPages(invRes.data?.total_pages ?? 1);

      const allBk = bkRes.data?.items || [];
      setUnbilledBookings(allBk.filter((b) => !b.invoice_id && b.status !== "Cancelled"));
    } catch (err) {
      setPageError(pkgError(err));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter]);

  const handleGenerateInvoice = async (e) => {
    e.preventDefault();
    setGenError("");
    if (!genForm.booking_id) {
      setGenError("Please select a booking.");
      return;
    }
    setGenerating(true);
    try {
      const res = await packagesApi.createInvoice({
        booking_id: Number(genForm.booking_id),
        gst_rate: Number(genForm.gst_rate || 18),
        notes: genForm.notes.trim() || null,
      });
      showSuccess(`Invoice ${res.data.invoice_number} generated.`);
      setGenOpen(false);
      setGenForm({ booking_id: "", gst_rate: "18.00", notes: "" });
      await loadData();
    } catch (err) {
      setGenError(pkgError(err));
    } finally {
      setGenerating(false);
    }
  };

  const openPayModal = (inv) => {
    setPayTarget(inv);
    setPayError("");
    setPayForm({
      amount: String(inv.balance_due ?? ""),
      payment_method: "UPI",
      payment_type: Number(inv.paid_amount || 0) === 0 ? "Advance" : "Full",
      reference_number: "",
    });
  };

  const handleCollectPayment = async (e) => {
    e.preventDefault();
    if (!payTarget) return;
    setPayError("");
    const amt = Number(payForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setPayError("Payment amount must be greater than zero.");
      return;
    }
    if (amt > Number(payTarget.balance_due)) {
      setPayError(`Amount cannot exceed balance due (${pkgMoney(payTarget.balance_due)}).`);
      return;
    }
    setPaying(true);
    try {
      const res = await packagesApi.recordPayment(payTarget.id, {
        amount: Number(amt.toFixed(2)),
        payment_method: payForm.payment_method,
        payment_type: payForm.payment_type,
        reference_number: payForm.reference_number.trim() || null,
      });
      showSuccess(`Recorded ${pkgMoney(amt)} payment on ${payTarget.invoice_number}.`);
      setPayTarget(null);
      await loadData();
      if (detailInvoice?.id === payTarget.id && res.data?.invoice) {
        setDetailInvoice(res.data.invoice);
      }
    } catch (err) {
      setPayError(pkgError(err));
    } finally {
      setPaying(false);
    }
  };

  const handleDownloadPdf = async (inv) => {
    try {
      const blob = await packagesApi.downloadInvoicePdf(inv.id);
      savePdfBlob(blob, `${inv.invoice_number}.pdf`);
      showSuccess(`Downloaded ${inv.invoice_number}.pdf`);
    } catch (err) {
      showError(pkgError(err));
    }
  };

  const openDetail = async (id) => {
    try {
      const res = await packagesApi.invoiceDetail(id);
      setDetailInvoice(res.data);
    } catch (err) {
      showError(pkgError(err));
    }
  };

  const totals = useMemo(() => {
    return invoices.reduce(
      (acc, inv) => {
        acc.total += Number(inv.total_amount || 0);
        acc.paid += Number(inv.paid_amount || 0);
        acc.balance += Number(inv.balance_due || 0);
        return acc;
      },
      { total: 0, paid: 0, balance: 0 }
    );
  }, [invoices]);

  const columns = [
    {
      key: "invoice_number",
      label: "Invoice #",
      cellClassName: "whitespace-nowrap font-mono font-bold",
      render: (inv) => (
        <div>
          <div>{inv.invoice_number}</div>
          <div className="text-[11px] font-sans text-stone-500">
            Source: {inv.source_module}
          </div>
        </div>
      ),
    },
    {
      key: "booking",
      label: "Booking & Package",
      render: (inv) => (
        <div className="min-w-[160px]">
          <div className="font-mono font-semibold text-xs">{inv.booking_number || "—"}</div>
          <div className="text-xs text-stone-500 truncate max-w-[200px]">
            {inv.package_name || "Package"}
          </div>
        </div>
      ),
    },
    {
      key: "customer",
      label: "Customer",
      render: (inv) => (
        <div>
          <div className="font-semibold">{inv.customer_name}</div>
          <div className="text-xs text-stone-500">{inv.customer_phone || "—"}</div>
        </div>
      ),
    },
    {
      key: "total",
      label: "Total (incl. GST)",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums font-semibold",
      render: (inv) => pkgMoney(inv.total_amount),
    },
    {
      key: "paid",
      label: "Paid",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums text-emerald-700 dark:text-emerald-300 font-semibold",
      render: (inv) => pkgMoney(inv.paid_amount),
    },
    {
      key: "balance",
      label: "Balance Due",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums font-bold",
      render: (inv) => pkgMoney(inv.balance_due),
    },
    {
      key: "status",
      label: "Status",
      align: "center",
      render: (inv) => (
        <StatusBadge status={inv.payment_status} label={inv.payment_status} size="sm" />
      ),
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      cellClassName: "whitespace-nowrap",
      render: (inv) => (
        <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => openDetail(inv.id)}
            title="View Invoice & Payment History"
            className="rounded-lg p-1.5 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/30 cursor-pointer"
          >
            <Eye size={15} />
          </button>
          {Number(inv.balance_due || 0) > 0 && inv.booking_status !== "Cancelled" && (
            <button
              type="button"
              onClick={() => openPayModal(inv)}
              title="Record Payment (Advance / Partial / Full)"
              className="rounded-lg px-2 py-1 text-xs font-semibold bg-amber-100 dark:bg-[#30251C] text-amber-900 dark:text-[#FFB02E] hover:brightness-95 cursor-pointer"
            >
              Pay
            </button>
          )}
          <button
            type="button"
            onClick={() => handleDownloadPdf(inv)}
            title="Download Invoice PDF"
            className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <Download size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Invoices & Payments"
        description="Manage package invoices, advance/partial/full payments across Cash, UPI, Card, Net Banking, and PDF receipts."
        actions={
          <button
            type="button"
            onClick={() => {
              setGenError("");
              setGenOpen(true);
            }}
            className={BUTTON_VARIANTS.primary}
          >
            <FilePlus2 size={16} />
            <span>Generate Invoice</span>
          </button>
        }
      />

      {pageError && <AlertBanner variant="error" message={pageError} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl">
        <StatCard compact title="Invoiced Total (Page)" value={loading ? "—" : pkgMoney(totals.total)} icon={FileText} color="amber" />
        <StatCard compact title="Collected (Page)" value={loading ? "—" : pkgMoney(totals.paid)} icon={IndianRupee} color="emerald" />
        <StatCard compact title="Outstanding Balance (Page)" value={loading ? "—" : pkgMoney(totals.balance)} icon={Wallet} color={totals.balance > 0 ? "rose" : "emerald"} />
      </div>

      <div className={`${CARD_STYLES.base} !p-2.5`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search invoice #, booking #, customer..."
              className={`${INPUT_STYLES.base} w-full pl-9 !py-1.5 text-xs`}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`${INPUT_STYLES.select} !w-auto min-w-[150px] !py-1.5 text-xs`}
          >
            <option value="">All Payment Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Paid">Paid</option>
          </select>
          {(searchQuery || statusFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("");
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
        rows={invoices}
        loading={loading}
        loadingMessage="Loading package invoices..."
        emptyTitle="No package invoices found"
        emptyDescription="Generate an invoice for any active package booking to collect payments."
        tableMinWidth="min-w-[920px]"
        onRowClick={(inv) => openDetail(inv.id)}
        pagination={{
          currentPage: page,
          totalPages,
          totalRecords,
          pageSize,
          onPageChange: setPage,
        }}
      />

      {/* GENERATE INVOICE MODAL */}
      <Modal
        isOpen={genOpen}
        onClose={() => {
          setGenOpen(false);
          if (searchParams.get("bookingId")) {
            const next = new URLSearchParams(searchParams);
            next.delete("bookingId");
            setSearchParams(next, { replace: true });
          }
        }}
        title="Generate Package Invoice"
        size="sm"
      >
        <form onSubmit={handleGenerateInvoice} className="space-y-3">
          {genError && <AlertBanner variant="error" message={genError} />}
          <div>
            <label className="block text-xs font-bold uppercase mb-1">Select Booking *</label>
            <select
              required
              value={genForm.booking_id}
              onChange={(e) => setGenForm((f) => ({ ...f, booking_id: e.target.value }))}
              className={INPUT_STYLES.select}
            >
              <option value="">— Select Unbilled Booking —</option>
              {unbilledBookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.booking_number} · {b.customer_name} ({pkgMoney(b.total_amount)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase mb-1">GST Rate (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={genForm.gst_rate}
              onChange={(e) => setGenForm((f) => ({ ...f, gst_rate: e.target.value }))}
              className={INPUT_STYLES.base}
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase mb-1">Notes</label>
            <input
              type="text"
              value={genForm.notes}
              onChange={(e) => setGenForm((f) => ({ ...f, notes: e.target.value }))}
              className={INPUT_STYLES.base}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setGenOpen(false);
                if (searchParams.get("bookingId")) {
                  const next = new URLSearchParams(searchParams);
                  next.delete("bookingId");
                  setSearchParams(next, { replace: true });
                }
              }}
              className={BUTTON_VARIANTS.secondary}
            >
              Cancel
            </button>
            <button type="submit" disabled={generating} className={BUTTON_VARIANTS.primary}>
              {generating ? "Generating..." : "Create Invoice"}
            </button>
          </div>
        </form>
      </Modal>

      {/* COLLECT PAYMENT MODAL */}
      <Modal
        isOpen={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        title={payTarget ? `Record Payment · ${payTarget.invoice_number}` : "Record Payment"}
        size="sm"
      >
        {payTarget && (
          <form onSubmit={handleCollectPayment} className="space-y-3">
            {payError && <AlertBanner variant="error" message={payError} />}
            <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] p-3 text-xs border border-[#E5E9F0] dark:border-[#1E293B]">
              <p>
                Customer: <strong>{payTarget.customer_name}</strong>
              </p>
              <p className="mt-0.5">
                Total: <strong>{pkgMoney(payTarget.total_amount)}</strong> · Paid:{" "}
                <strong>{pkgMoney(payTarget.paid_amount)}</strong> · Balance:{" "}
                <strong className="text-amber-700 dark:text-[#FFB02E]">{pkgMoney(payTarget.balance_due)}</strong>
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Payment Type *</label>
              <select
                value={payForm.payment_type}
                onChange={(e) => {
                  const nextType = e.target.value;
                  setPayForm((f) => ({
                    ...f,
                    payment_type: nextType,
                    amount: nextType === "Full" ? String(payTarget.balance_due) : f.amount,
                  }));
                }}
                className={INPUT_STYLES.select}
              >
                {PAYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Payment Method *</label>
              <select
                value={payForm.payment_method}
                onChange={(e) => setPayForm((f) => ({ ...f, payment_method: e.target.value }))}
                className={INPUT_STYLES.select}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Amount (INR) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={payTarget.balance_due}
                required
                value={payForm.amount}
                onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Transaction Reference</label>
              <input
                type="text"
                value={payForm.reference_number}
                onChange={(e) => setPayForm((f) => ({ ...f, reference_number: e.target.value }))}
                placeholder="UPI ID / Card Auth / Bank Ref"
                className={INPUT_STYLES.base}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setPayTarget(null)} className={BUTTON_VARIANTS.secondary}>
                Cancel
              </button>
              <button type="submit" disabled={paying} className={BUTTON_VARIANTS.primary}>
                <CreditCard size={14} />
                <span>{paying ? "Recording..." : "Record Payment"}</span>
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* INVOICE DETAIL & PAYMENT HISTORY MODAL */}
      <Modal
        isOpen={Boolean(detailInvoice)}
        onClose={() => setDetailInvoice(null)}
        title={detailInvoice ? `Invoice ${detailInvoice.invoice_number}` : "Invoice Detail"}
        size="md"
      >
        {detailInvoice && (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E9F0] dark:border-[#1E293B] pb-3">
              <div>
                <p className="text-sm font-bold">{detailInvoice.package_name || "Package Invoice"}</p>
                <p className="text-stone-500">
                  Booking {detailInvoice.booking_number} · Source: {detailInvoice.source_module}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={detailInvoice.payment_status} label={detailInvoice.payment_status} size="sm" />
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(detailInvoice)}
                  className={`${BUTTON_VARIANTS.secondary} !py-1 !px-2.5 text-xs`}
                >
                  <Download size={13} />
                  <span>PDF</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] p-2.5 border border-[#E5E9F0] dark:border-[#1E293B]">
                <p className="text-[10px] uppercase font-bold text-stone-500">Subtotal</p>
                <p className="font-semibold mt-0.5">{pkgMoney(detailInvoice.subtotal)}</p>
              </div>
              <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] p-2.5 border border-[#E5E9F0] dark:border-[#1E293B]">
                <p className="text-[10px] uppercase font-bold text-stone-500">GST ({detailInvoice.gst_rate}%)</p>
                <p className="font-semibold mt-0.5">{pkgMoney(detailInvoice.gst_amount)}</p>
              </div>
              <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] p-2.5 border border-[#E5E9F0] dark:border-[#1E293B]">
                <p className="text-[10px] uppercase font-bold text-stone-500">Total / Paid</p>
                <p className="font-semibold mt-0.5">
                  {pkgMoney(detailInvoice.total_amount)} / {pkgMoney(detailInvoice.paid_amount)}
                </p>
              </div>
              <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] p-2.5 border border-[#E5E9F0] dark:border-[#1E293B]">
                <p className="text-[10px] uppercase font-bold text-stone-500">Balance Due</p>
                <p className="font-bold text-amber-700 dark:text-[#FFB02E] mt-0.5">
                  {pkgMoney(detailInvoice.balance_due)}
                </p>
              </div>
            </div>

            <div>
              <p className="font-bold uppercase text-[10px] text-stone-500 mb-1.5">
                Payment History ({detailInvoice.payments?.length || 0})
              </p>
              {detailInvoice.payments?.length === 0 ? (
                <p className="text-stone-500 py-3">No payments recorded yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {detailInvoice.payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-lg bg-[#F8FAFC] dark:bg-[#151D29] px-3 py-2 border border-[#E5E9F0] dark:border-[#1E293B]"
                    >
                      <div>
                        <span className="font-semibold">{p.payment_type}</span> · {p.payment_method}
                        {p.reference_number && <span className="text-stone-500"> · Ref {p.reference_number}</span>}
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-emerald-700 dark:text-emerald-300">
                          {pkgMoney(p.amount)}
                        </span>
                        <span className="ml-2 text-[11px] text-stone-500">{pkgDateTime(p.paid_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
