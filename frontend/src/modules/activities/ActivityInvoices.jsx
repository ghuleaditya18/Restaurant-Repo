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
  Trash2,
  Wallet,
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
import VillaDataTable from "../villas/VillaDataTable";
import {
  actDateTime,
  actError,
  activitiesApi,
  actMoney,
  bookingTypeLabel,
} from "./activitiesApi";

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

export default function ActivityInvoices() {
  const [searchParams] = useSearchParams();
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
  const [genFieldError, setGenFieldError] = useState("");
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
  const [payFieldError, setPayFieldError] = useState("");
  const [paying, setPaying] = useState(false);

  // Detail Modal
  const [detailInvoice, setDetailInvoice] = useState(null);

  // Selection & Clear/Delete Modals
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkFailures, setBulkFailures] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const [invRes, bkRes] = await Promise.all([
        activitiesApi.invoices({
          search: searchQuery.trim() || undefined,
          payment_status: statusFilter || undefined,
          page,
          page_size: pageSize,
        }),
        activitiesApi.bookings({ page: 1, page_size: 100 }),
      ]);
      setInvoices(invRes.data?.items || []);
      setTotalRecords(invRes.data?.total ?? 0);
      setTotalPages(invRes.data?.total_pages ?? 1);

      const allBk = bkRes.data?.items || [];
      setUnbilledBookings(allBk.filter((b) => !b.invoice_id && b.status !== "Cancelled"));
    } catch (err) {
      setPageError(actError(err));
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
    setGenFieldError("");
    if (!genForm.booking_id) {
      setGenFieldError("Select a booking to generate its invoice.");
      return;
    }
    setGenerating(true);
    try {
      const res = await activitiesApi.createInvoice({
        booking_id: Number(genForm.booking_id),
        gst_rate: Number(genForm.gst_rate || 18),
        notes: genForm.notes.trim() || null,
      });
      showSuccess(`Invoice ${res.data.invoice_number} generated.`);
      setGenOpen(false);
      setGenForm({ booking_id: "", gst_rate: "18.00", notes: "" });
      await loadData();
    } catch (err) {
      setGenError(actError(err));
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
    setPayFieldError("");
    const amt = Number(payForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setPayFieldError("Enter a payment amount greater than zero.");
      return;
    }
    if (amt > Number(payTarget.balance_due)) {
      setPayFieldError(`Amount cannot exceed the balance due (${actMoney(payTarget.balance_due)}).`);
      return;
    }
    setPaying(true);
    try {
      const res = await activitiesApi.recordPayment(payTarget.id, {
        amount: Number(amt.toFixed(2)),
        payment_method: payForm.payment_method,
        payment_type: payForm.payment_type,
        reference_number: payForm.reference_number.trim() || null,
      });
      showSuccess(`Recorded ${actMoney(amt)} payment on ${payTarget.invoice_number}.`);
      setPayTarget(null);
      await loadData();
      if (detailInvoice?.id === payTarget.id && res.data?.invoice) {
        setDetailInvoice(res.data.invoice);
      }
    } catch (err) {
      setPayError(actError(err));
    } finally {
      setPaying(false);
    }
  };

  const handleDownloadPdf = async (inv) => {
    try {
      const blob = await activitiesApi.downloadInvoicePdf(inv.id);
      savePdfBlob(blob, `${inv.invoice_number}.pdf`);
      showSuccess(`Downloaded ${inv.invoice_number}.pdf`);
    } catch (err) {
      showError(actError(err));
    }
  };

  const openDetail = async (id) => {
    try {
      const res = await activitiesApi.invoiceDetail(id);
      setDetailInvoice(res.data);
    } catch (err) {
      showError(actError(err));
    }
  };

  const handleSelectRow = (id) => {
    setBulkFailures([]);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSelectAll = (ids) => {
    setBulkFailures([]);
    setSelectedIds((prev) => {
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

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await activitiesApi.deleteInvoice(deleteTarget.id);
      showSuccess(res.data?.message || `Invoice ${deleteTarget.invoice_number} cleared.`);
      if (detailInvoice?.id === deleteTarget.id) setDetailInvoice(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
      });
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      showError(actError(err));
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setBulkDeleting(true);
    setBulkFailures([]);
    try {
      const res = await activitiesApi.bulkDeleteInvoices(ids);
      const { deleted = 0, failed = [], message } = res.data || {};
      setBulkFailures(failed);
      setSelectedIds(new Set(failed.map((f) => f.id)));
      setBulkDeleteOpen(false);
      await loadData();
      if (deleted > 0) showSuccess(message || `Cleared ${deleted} invoice(s).`);
      if (failed.length > 0) showError(`${failed.length} invoice(s) could not be cleared.`);
    } catch (err) {
      showError(actError(err));
    } finally {
      setBulkDeleting(false);
    }
  };

  const totals = useMemo(
    () =>
      invoices.reduce(
        (acc, inv) => {
          acc.total += Number(inv.total_amount || 0);
          acc.paid += Number(inv.paid_amount || 0);
          acc.balance += Number(inv.balance_due || 0);
          return acc;
        },
        { total: 0, paid: 0, balance: 0 }
      ),
    [invoices]
  );

  const columns = [
    {
      key: "invoice_number",
      label: "Invoice #",
      cellClassName: "whitespace-nowrap font-mono font-bold",
      render: (inv) => (
        <div>
          <div>{inv.invoice_number}</div>
          <div className="text-[11px] font-sans text-stone-500">Source: {inv.source_module}</div>
        </div>
      ),
    },
    {
      key: "booking",
      label: "Booking & Activity",
      render: (inv) => (
        <div className="min-w-[160px]">
          <div className="font-mono font-semibold text-xs">{inv.booking_number || "—"}</div>
          <div className="text-xs text-stone-500 truncate max-w-[200px]">
            {inv.activity_name || "Activity"} {inv.booking_type ? `· ${bookingTypeLabel(inv.booking_type)}` : ""}
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
      key: "total_amount",
      label: "Total",
      align: "right",
      cellClassName: "whitespace-nowrap font-semibold tabular-nums",
      render: (inv) => actMoney(inv.total_amount),
    },
    {
      key: "paid_amount",
      label: "Paid",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold",
      render: (inv) => actMoney(inv.paid_amount),
    },
    {
      key: "balance_due",
      label: "Balance",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums font-semibold",
      render: (inv) => actMoney(inv.balance_due),
    },
    {
      key: "payment_status",
      label: "Status",
      align: "center",
      render: (inv) => <StatusBadge status={inv.payment_status} size="sm" />,
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
            title="View Invoice"
            className="rounded-lg p-1.5 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/30 cursor-pointer"
          >
            <Eye size={15} />
          </button>
          {Number(inv.balance_due || 0) > 0 && (
            <button
              type="button"
              onClick={() => openPayModal(inv)}
              title="Collect Payment"
              className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer"
            >
              <CreditCard size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={() => handleDownloadPdf(inv)}
            title="Download PDF"
            className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer"
          >
            <Download size={15} />
          </button>
          {inv.payment_status === "Pending" && (
            <button
              type="button"
              onClick={() => setDeleteTarget(inv)}
              title="Clear Pending Invoice"
              className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Activity Invoices & Payments"
        description="Generate GST invoices from activity bookings, collect Advance/Partial/Full payments, and download PDF receipts."
        actions={
          <button type="button" onClick={() => setGenOpen(true)} className={BUTTON_VARIANTS.primary}>
            <FilePlus2 size={15} />
            <span>Generate Invoice</span>
          </button>
        }
      />

      {pageError && <AlertBanner variant="error" message={pageError} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-fit max-w-full">
        <StatCard compact className="!p-2.5" title="Invoiced Total (Page)" value={loading ? "—" : actMoney(totals.total)} icon={FileText} color="amber" />
        <StatCard compact className="!p-2.5" title="Collected (Page)" value={loading ? "—" : actMoney(totals.paid)} icon={IndianRupee} color="emerald" />
        <StatCard compact className="!p-2.5" title="Balance Due (Page)" value={loading ? "—" : actMoney(totals.balance)} icon={Wallet} color={totals.balance > 0 ? "rose" : "emerald"} />
      </div>

      <div className={`${CARD_STYLES.base} !p-2.5`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Invoice #, booking #, customer..."
              className={`${INPUT_STYLES.base} w-full pl-9 !py-1.5 text-xs`}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`${INPUT_STYLES.select} w-full sm:!w-auto min-w-[140px] !py-1.5 text-xs`}
          >
            <option value="">All Payment Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Paid">Paid</option>
          </select>
        </div>
      </div>

      <BulkSelectionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onDelete={() => setBulkDeleteOpen(true)}
        deleting={bulkDeleting}
      />

      {bulkFailures.length > 0 && (
        <AlertBanner
          variant="warning"
          title="Some invoices could not be cleared"
          message={bulkFailures.map((f) => `${f.name}: ${f.reason}`).join(" | ")}
          onDismiss={() => setBulkFailures([])}
        />
      )}

      <VillaDataTable
        title="Activity Invoices"
        columns={columns}
        rows={invoices}
        loading={loading}
        emptyTitle="No activity invoices generated yet"
        tableMinWidth="min-w-[880px]"
        onRowClick={(inv) => openDetail(inv.id)}
        selectedIds={selectedIds}
        onSelectRow={handleSelectRow}
        onSelectAll={handleSelectAll}
        isRowSelectable={(inv) => inv.payment_status === "Pending"}
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
        onClose={() => setGenOpen(false)}
        title="Generate Activity Invoice"
        size="sm"
      >
        <form onSubmit={handleGenerateInvoice} className="space-y-3">
          {genError && <AlertBanner variant="error" message={genError} />}
          <div>
            <label className="mb-1 block text-xs font-bold">Select Unbilled Booking *</label>
            <select
              required
              value={genForm.booking_id}
              onChange={(e) => { setGenForm({ ...genForm, booking_id: e.target.value }); setGenFieldError(""); }}
              aria-invalid={Boolean(genFieldError)}
              className={`${INPUT_STYLES.select} ${genFieldError ? "border-red-500" : ""}`}
            >
              <option value="">Choose booking...</option>
              {unbilledBookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.booking_number} · {b.customer_name} · {actMoney(b.total_amount)}
                </option>
              ))}
            </select>
            {genFieldError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{genFieldError}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold">GST Rate (%) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={genForm.gst_rate}
              onChange={(e) => setGenForm({ ...genForm, gst_rate: e.target.value })}
              className={INPUT_STYLES.base}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold">Notes</label>
            <input
              type="text"
              value={genForm.notes}
              onChange={(e) => setGenForm({ ...genForm, notes: e.target.value })}
              className={INPUT_STYLES.base}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setGenOpen(false)} className={BUTTON_VARIANTS.secondary}>Cancel</button>
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
        title={`Collect Payment — ${payTarget?.invoice_number || ""}`}
        size="sm"
      >
        <form onSubmit={handleCollectPayment} className="space-y-3">
          {payError && <AlertBanner variant="error" message={payError} />}
          <div className="rounded-xl bg-stone-50 dark:bg-[#151D29] p-3 text-xs flex justify-between">
            <span>Balance Due:</span>
            <strong className="text-sm">{actMoney(payTarget?.balance_due)}</strong>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold">Amount (₹) *</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={payForm.amount}
              onChange={(e) => { setPayForm({ ...payForm, amount: e.target.value }); setPayFieldError(""); }}
              aria-invalid={Boolean(payFieldError)}
              className={`${INPUT_STYLES.base} ${payFieldError ? "border-red-500" : ""}`}
            />
            {payFieldError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{payFieldError}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-xs font-bold">Method *</label>
              <select
                value={payForm.payment_method}
                onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })}
                className={INPUT_STYLES.select}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold">Payment Type *</label>
              <select
                value={payForm.payment_type}
                onChange={(e) => setPayForm({ ...payForm, payment_type: e.target.value })}
                className={INPUT_STYLES.select}
              >
                {PAYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold">Reference Number</label>
            <input
              type="text"
              value={payForm.reference_number}
              onChange={(e) => setPayForm({ ...payForm, reference_number: e.target.value })}
              placeholder="UPI / Card / Receipt ref"
              className={INPUT_STYLES.base}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setPayTarget(null)} className={BUTTON_VARIANTS.secondary}>Cancel</button>
            <button type="submit" disabled={paying} className={BUTTON_VARIANTS.primary}>
              {paying ? "Recording..." : "Record Payment"}
            </button>
          </div>
        </form>
      </Modal>

      {/* INVOICE DETAIL MODAL */}
      <Modal
        isOpen={Boolean(detailInvoice)}
        onClose={() => setDetailInvoice(null)}
        title={`Invoice ${detailInvoice?.invoice_number || ""}`}
        size="md"
      >
        {detailInvoice && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-xl bg-stone-50 dark:bg-[#151D29] p-2.5">
                <span className="text-[10px] uppercase text-stone-500 font-bold">Customer</span>
                <p className="mt-0.5 font-semibold">{detailInvoice.customer_name}</p>
              </div>
              <div className="rounded-xl bg-stone-50 dark:bg-[#151D29] p-2.5">
                <span className="text-[10px] uppercase text-stone-500 font-bold">Total</span>
                <p className="mt-0.5 font-bold">{actMoney(detailInvoice.total_amount)}</p>
              </div>
              <div className="rounded-xl bg-stone-50 dark:bg-[#151D29] p-2.5">
                <span className="text-[10px] uppercase text-stone-500 font-bold">Paid</span>
                <p className="mt-0.5 font-bold text-emerald-600">{actMoney(detailInvoice.paid_amount)}</p>
              </div>
              <div className="rounded-xl bg-stone-50 dark:bg-[#151D29] p-2.5">
                <span className="text-[10px] uppercase text-stone-500 font-bold">Balance Due</span>
                <p className="mt-0.5 font-bold">{actMoney(detailInvoice.balance_due)}</p>
              </div>
            </div>

            <div className="divide-y divide-[#E5E9F0] dark:divide-[#1E293B] rounded-xl border border-[#E5E9F0] dark:border-[#1E293B]">
              {(detailInvoice.payments || []).length === 0 ? (
                <p className="p-4 text-center text-stone-500">No payments recorded yet.</p>
              ) : (
                detailInvoice.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-2.5">
                    <div>
                      <span className="font-semibold">{p.payment_method} ({p.payment_type})</span>
                      {p.reference_number && <span className="ml-2 text-stone-500">Ref: {p.reference_number}</span>}
                      <p className="text-[11px] text-stone-500">{actDateTime(p.paid_at)}</p>
                    </div>
                    <span className="font-bold">{actMoney(p.amount)}</span>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end gap-2">
              {Number(detailInvoice.balance_due || 0) > 0 && (
                <button
                  type="button"
                  onClick={() => openPayModal(detailInvoice)}
                  className={BUTTON_VARIANTS.primary}
                >
                  Collect Payment
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDownloadPdf(detailInvoice)}
                className={BUTTON_VARIANTS.secondary}
              >
                <Download size={14} />
                <span>Download PDF</span>
              </button>
              {detailInvoice.payment_status === "Pending" && (
                <button
                  type="button"
                  onClick={() => setDeleteTarget(detailInvoice)}
                  className={BUTTON_VARIANTS.danger}
                >
                  <Trash2 size={14} />
                  <span>Clear Invoice</span>
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <DeleteConfirm
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title={`Clear Invoice ${deleteTarget?.invoice_number || ""}?`}
        message="This permanently removes the unpaid pending invoice. Paid or partially paid invoices remain protected."
        confirmText="Clear Invoice"
        loading={deleting}
      />

      <DeleteConfirm
        isOpen={bulkDeleteOpen}
        onClose={() => !bulkDeleting && setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title={`Clear ${selectedIds.size} Selected Invoice(s)?`}
        message="Unpaid pending invoices will be permanently deleted. Invoices with recorded payments remain protected."
        confirmText="Clear Selected"
        loading={bulkDeleting}
      />
    </div>
  );
}
