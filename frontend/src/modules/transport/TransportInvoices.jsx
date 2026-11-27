import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CreditCard, Download, Eye, FilePlus2, Search } from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import StatusBadge from "../../components/StatusBadge";
import { useNotification } from "../../context/NotificationContext";
import { BUTTON_VARIANTS, CARD_STYLES, INPUT_STYLES } from "../../utils/themeTokens";
import VillaDataTable from "../villas/VillaDataTable";
import { transportApi, trnDateTime, trnError, trnMoney } from "./transportApi";

const PAYMENT_METHODS = ["Cash", "UPI", "Card", "Net Banking"];
const PAYMENT_TYPES = ["Advance", "Partial", "Full", "Refund"];

export default function TransportInvoices() {
  const [searchParams] = useSearchParams();
  const { showSuccess, showError } = useNotification();
  const preselectedBookingId = searchParams.get("bookingId") || "";

  const [invoices, setInvoices] = useState([]);
  const [unbilledBookings, setUnbilledBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 15;

  const [genOpen, setGenOpen] = useState(Boolean(preselectedBookingId));
  const [genForm, setGenForm] = useState({ booking_id: preselectedBookingId, gst_rate: "5.00", notes: "" });
  const [genError, setGenError] = useState("");
  const [generating, setGenerating] = useState(false);

  const [payTarget, setPayTarget] = useState(null);
  const [payForm, setPayForm] = useState({ amount: "", payment_method: "UPI", payment_type: "Full", reference_number: "" });
  const [payError, setPayError] = useState("");
  const [paying, setPaying] = useState(false);

  const [detailInvoice, setDetailInvoice] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [invRes, bkRes] = await Promise.all([
        transportApi.invoices({
          search: searchQuery.trim() || undefined,
          payment_status: statusFilter || undefined,
          page,
          page_size: pageSize,
        }),
        transportApi.bookings({ page: 1, page_size: 100 }),
      ]);
      setInvoices(invRes.data?.items || []);
      setTotalRecords(invRes.data?.total ?? 0);
      setTotalPages(invRes.data?.total_pages ?? 1);
      setUnbilledBookings((bkRes.data?.items || []).filter((b) => !b.invoice_id && b.status !== "Cancelled"));
    } catch (err) {
      setError(trnError(err));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setGenError("");
    if (!genForm.booking_id) return setGenError("Please select a transport booking.");
    setGenerating(true);
    try {
      const res = await transportApi.createInvoice({
        booking_id: Number(genForm.booking_id),
        gst_rate: Number(genForm.gst_rate || 5),
        notes: genForm.notes.trim() || null,
      });
      showSuccess(`Invoice ${res.data.invoice_number} generated.`);
      setGenOpen(false);
      setGenForm({ booking_id: "", gst_rate: "5.00", notes: "" });
      await loadData();
    } catch (err) {
      setGenError(trnError(err));
    } finally {
      setGenerating(false);
    }
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    if (!payTarget) return;
    setPayError("");
    const amt = Number(payForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) return setPayError("Amount must be greater than zero.");
    setPaying(true);
    try {
      const res = await transportApi.recordPayment(payTarget.id, {
        amount: Number(amt.toFixed(2)),
        payment_method: payForm.payment_method,
        payment_type: payForm.payment_type,
        reference_number: payForm.reference_number.trim() || null,
      });
      showSuccess(`${payForm.payment_type} of ${trnMoney(amt)} recorded.`);
      setPayTarget(null);
      if (detailInvoice?.id === payTarget.id && res.data?.invoice) {
        setDetailInvoice(res.data.invoice);
      }
      await loadData();
    } catch (err) {
      setPayError(trnError(err));
    } finally {
      setPaying(false);
    }
  };

  const handlePdf = async (inv) => {
    try {
      const blob = await transportApi.downloadInvoicePdf(inv.id);
      const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${inv.invoice_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      showError(trnError(err));
    }
  };

  const columns = [
    { key: "invoice_number", label: "Invoice #", cellClassName: "font-mono font-bold whitespace-nowrap" },
    { key: "booking_number", label: "Booking #", cellClassName: "font-mono whitespace-nowrap" },
    {
      key: "customer_name",
      label: "Customer",
      render: (inv) => (
        <div>
          <div className="font-semibold">{inv.customer_name}</div>
          <div className="text-xs text-[#8A9AB2]">{inv.customer_phone || "—"}</div>
        </div>
      ),
    },
    { key: "total_amount", label: "Total", align: "right", cellClassName: "font-semibold tabular-nums", render: (inv) => trnMoney(inv.total_amount) },
    { key: "paid_amount", label: "Paid", align: "right", cellClassName: "tabular-nums text-emerald-600 font-semibold", render: (inv) => trnMoney(inv.paid_amount) },
    { key: "balance_due", label: "Balance", align: "right", cellClassName: "tabular-nums font-semibold", render: (inv) => trnMoney(inv.balance_due) },
    { key: "payment_status", label: "Status", align: "center", render: (inv) => <StatusBadge status={inv.payment_status} size="sm" /> },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (inv) => (
        <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => setDetailInvoice(inv)} className="p-1.5 rounded-lg text-stone-500 hover:text-amber-600 cursor-pointer" title="View invoice"><Eye size={15} /></button>
          <button
            type="button"
            onClick={() => {
              setPayTarget(inv);
              setPayError("");
              setPayForm({
                amount: String(Number(inv.balance_due) > 0 ? inv.balance_due : inv.paid_amount),
                payment_method: "UPI",
                payment_type: Number(inv.balance_due) > 0 ? "Full" : "Refund",
                reference_number: "",
              });
            }}
            className="p-1.5 rounded-lg text-stone-500 hover:text-emerald-600 cursor-pointer"
            title="Record payment / refund"
          >
            <CreditCard size={15} />
          </button>
          <button type="button" onClick={() => handlePdf(inv)} className="p-1.5 rounded-lg text-stone-500 hover:text-sky-600 cursor-pointer" title="Download PDF"><Download size={15} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Invoices"
        actions={
          <button type="button" onClick={() => setGenOpen(true)} className={BUTTON_VARIANTS.primary}>
            <FilePlus2 size={15} /> Generate Invoice
          </button>
        }
      />

      {error && <AlertBanner variant="error" title="Error" message={error} onDismiss={() => setError("")} />}

      <div className={`${CARD_STYLES.base} w-fit max-w-full !p-2`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search invoice #, booking #..." className={`${INPUT_STYLES.base} pl-9 !py-1.5 text-xs`} />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${INPUT_STYLES.select} !w-auto min-w-[160px] !py-1.5 text-xs`}>
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
        emptyTitle="No transport invoices found"
        tableMinWidth="min-w-[860px]"
        pagination={{ currentPage: page, totalPages, totalRecords, pageSize, onPageChange: setPage }}
        onRowClick={(inv) => setDetailInvoice(inv)}
      />

      {/* GENERATE INVOICE MODAL */}
      <Modal isOpen={genOpen} onClose={() => setGenOpen(false)} title="Generate Transport Invoice" size="sm">
        <form onSubmit={handleGenerate} className="space-y-3">
          {genError && <AlertBanner variant="error" title="Error" message={genError} />}
          <div>
            <label className="block text-xs font-semibold mb-1">Transport Booking *</label>
            <select required value={genForm.booking_id} onChange={(e) => setGenForm({ ...genForm, booking_id: e.target.value })} className={INPUT_STYLES.select}>
              <option value="">Select unbilled booking...</option>
              {unbilledBookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.booking_number} · {b.customer_name} ({trnMoney(b.total_amount)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">GST Rate (%)</label>
            <input type="number" step="0.01" min={0} max={100} value={genForm.gst_rate} onChange={(e) => setGenForm({ ...genForm, gst_rate: e.target.value })} className={INPUT_STYLES.base} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Notes</label>
            <textarea rows={2} value={genForm.notes} onChange={(e) => setGenForm({ ...genForm, notes: e.target.value })} className={INPUT_STYLES.base} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setGenOpen(false)} className={BUTTON_VARIANTS.secondary}>Cancel</button>
            <button type="submit" disabled={generating} className={BUTTON_VARIANTS.primary}>{generating ? "Generating..." : "Generate Invoice"}</button>
          </div>
        </form>
      </Modal>

      {/* RECORD PAYMENT / REFUND MODAL */}
      <Modal isOpen={Boolean(payTarget)} onClose={() => setPayTarget(null)} title={payTarget ? `Record Transaction · ${payTarget.invoice_number}` : ""} size="sm">
        {payTarget && (
          <form onSubmit={handlePayment} className="space-y-3">
            {payError && <AlertBanner variant="error" title="Error" message={payError} />}
            <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] p-3 text-xs flex justify-between">
              <span>Paid: <strong>{trnMoney(payTarget.paid_amount)}</strong></span>
              <span>Balance Due: <strong>{trnMoney(payTarget.balance_due)}</strong></span>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Transaction Type</label>
              <select value={payForm.payment_type} onChange={(e) => setPayForm({ ...payForm, payment_type: e.target.value })} className={INPUT_STYLES.select}>
                {PAYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Payment Method</label>
              <select value={payForm.payment_method} onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })} className={INPUT_STYLES.select}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Amount (INR) *</label>
              <input type="number" step="0.01" min="0.01" required value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} className={INPUT_STYLES.base} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Reference Number</label>
              <input type="text" value={payForm.reference_number} onChange={(e) => setPayForm({ ...payForm, reference_number: e.target.value })} className={INPUT_STYLES.base} placeholder="UPI / Card / Receipt Ref" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setPayTarget(null)} className={BUTTON_VARIANTS.secondary}>Cancel</button>
              <button type="submit" disabled={paying} className={BUTTON_VARIANTS.primary}>{paying ? "Saving..." : "Record"}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* INVOICE DETAIL MODAL */}
      <Modal isOpen={Boolean(detailInvoice)} onClose={() => setDetailInvoice(null)} title={detailInvoice?.invoice_number || ""} size="md">
        {detailInvoice && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {[
                ["Customer", `${detailInvoice.customer_name} (${detailInvoice.customer_phone || "—"})`],
                ["Booking #", detailInvoice.booking_number],
                ["Route", detailInvoice.pickup_location ? `${detailInvoice.pickup_location} → ${detailInvoice.drop_location}` : "—"],
                ["Subtotal", trnMoney(detailInvoice.subtotal)],
                [`GST (${detailInvoice.gst_rate}%)`, trnMoney(detailInvoice.gst_amount)],
                ["Total Amount", trnMoney(detailInvoice.total_amount)],
                ["Net Paid", trnMoney(detailInvoice.paid_amount)],
                ["Balance Due", trnMoney(detailInvoice.balance_due)],
                ["Status", detailInvoice.payment_status],
              ].map(([k, val]) => (
                <div key={k} className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] border border-[#E5E9F0] dark:border-[#1E293B] p-2.5">
                  <p className="text-[10px] font-bold uppercase text-[#8A9AB2]">{k}</p>
                  <p className="mt-0.5 font-semibold">{val}</p>
                </div>
              ))}
            </div>

            {detailInvoice.payments?.length > 0 && (
              <div>
                <h4 className="font-bold uppercase text-[#8A9AB2] mb-2">Payment History</h4>
                <div className="space-y-1.5">
                  {detailInvoice.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg bg-[#F8FAFC] dark:bg-[#151D29] px-3 py-2">
                      <span>{p.payment_type} · {p.payment_method} {p.reference_number ? `(${p.reference_number})` : ""}</span>
                      <span className="font-bold tabular-nums">{trnMoney(p.amount)} · {trnDateTime(p.paid_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E9F0] dark:border-[#1E293B]">
              <button type="button" onClick={() => handlePdf(detailInvoice)} className={BUTTON_VARIANTS.primary}>
                <Download size={14} /> Download Tax Invoice PDF
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
