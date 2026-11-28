import { useState, useEffect, useCallback } from "react";
import {
  CreditCard,
  Search,
  IndianRupee,
  CheckCircle2,
  Banknote,
  Smartphone,
} from "lucide-react";
import spaApi from "../services/spaApi";
import PageHeader from "../../../components/PageHeader";
import Pagination from "../../../components/Pagination";
import { useNotification } from "../../../context/NotificationContext";

export default function SpaPayments() {
  const { showError } = useNotification();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [methodFilter, setMethodFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (methodFilter !== "all") params.payment_method = methodFilter;
      const res = await spaApi.getPayments(params);
      const data = Array.isArray(res?.data) ? res.data : [];
      setPayments(data);
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to load payment transactions";
      setError(msg);
      showError(msg);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [methodFilter, showError]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  useEffect(() => {
    setCurrentPage(1);
  }, [methodFilter, search]);

  const safePayments = Array.isArray(payments) ? payments : [];
  const filteredPayments = safePayments.filter((p) => {
    const q = search.toLowerCase();
    const ref = (p.payment_reference || "").toLowerCase();
    const tx = (p.transaction_reference || "").toLowerCase();
    const inv = (p.invoice_id ? `inv #${p.invoice_id}` : "").toLowerCase();
    return ref.includes(q) || tx.includes(q) || inv.includes(q);
  });

  // Financial aggregates
  const totalCollected = safePayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const upiCollected = safePayments
    .filter((p) => p.payment_method === "UPI")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const cardCollected = safePayments
    .filter((p) => p.payment_method === "Card")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const cashCollected = safePayments
    .filter((p) => p.payment_method === "Cash" || p.payment_method === "Net Banking")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const getMethodBadge = (method) => {
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
  };

  return (
    <div className="space-y-4">
      {/* A1 Standard PageHeader */}
      <PageHeader
        title="Spa Payments"
        description="Complete settlement ledger across UPI, Cards, Net Banking and Cash collections."
      />

      {/* Aggregate Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 w-full">
        <div className="rounded-xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#101722] px-3 py-2.5 shadow-xs">
          <p className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider truncate">
            Total Revenue
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <IndianRupee size={16} className="text-[#F59E0B] shrink-0" />
            <span className="text-base sm:text-lg font-semibold tabular-nums text-stone-900 dark:text-white truncate">
              {totalCollected.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[11px] text-stone-400 mt-1 border-t border-stone-100 dark:border-stone-800 pt-1 truncate">{safePayments.length} successful payment(s)</p>
        </div>

        <div className="rounded-xl border border-violet-200/60 dark:border-violet-900/40 bg-violet-50/40 dark:bg-violet-950/20 px-3 py-2.5 shadow-xs">
          <p className="text-[11px] font-semibold text-violet-800 dark:text-violet-300 uppercase tracking-wider truncate">
            UPI Settlements
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <IndianRupee size={16} className="text-violet-600 dark:text-violet-400 shrink-0" />
            <span className="text-base sm:text-lg font-semibold tabular-nums text-violet-900 dark:text-violet-200 truncate">
              {upiCollected.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[11px] text-violet-700/70 dark:text-violet-400/70 mt-1 border-t border-violet-200/50 dark:border-violet-900/40 pt-1 truncate">Instant QR / VPA</p>
        </div>

        <div className="rounded-xl border border-blue-200/60 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 px-3 py-2.5 shadow-xs">
          <p className="text-[11px] font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-wider truncate">
            Card POS
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <IndianRupee size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-base sm:text-lg font-semibold tabular-nums text-blue-900 dark:text-blue-200 truncate">
              {cardCollected.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[11px] text-blue-700/70 dark:text-blue-400/70 mt-1 border-t border-blue-200/50 dark:border-blue-900/40 pt-1 truncate">Debit & Credit cards</p>
        </div>

        <div className="rounded-xl border border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20 px-3 py-2.5 shadow-xs">
          <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider truncate">
            Cash / Direct
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <IndianRupee size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-base sm:text-lg font-semibold tabular-nums text-emerald-900 dark:text-emerald-200 truncate">
              {cashCollected.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[11px] text-emerald-700/70 dark:text-emerald-400/70 mt-1 border-t border-emerald-200/50 dark:border-emerald-900/40 pt-1 truncate">Front desk collections</p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0">
          {[
            { key: "all", label: "All Methods" },
            { key: "UPI", label: "UPI" },
            { key: "Card", label: "Card" },
            { key: "Net Banking", label: "Net Banking" },
            { key: "Cash", label: "Cash" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setMethodFilter(tab.key)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                methodFilter === tab.key
                  ? "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold shadow-xs"
                  : "border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] text-stone-700 dark:text-[#8A9AB2] hover:bg-stone-50 dark:hover:bg-[#151D29]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-52">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <input
            type="text"
            placeholder="Search reference, txn ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#101722] pl-8 pr-3 py-1.5 text-xs text-stone-900 dark:text-white placeholder-stone-400 focus:border-[#F59E0B] focus:outline-none"
          />
        </div>
      </div>

      {/* Ledger Table */}
      <div className="rounded-xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#101722] overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8 text-center text-xs sm:text-sm text-stone-400">
            Loading transaction ledger...
          </div>
        ) : error ? (
          <div className="p-6 text-center text-xs sm:text-sm text-red-600">
            {error}
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="p-8 text-center">
            <CreditCard size={34} className="mx-auto text-stone-300 dark:text-stone-600 mb-2" />
            <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200">
              No transactions recorded yet
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
              Payments settled against completed spa invoices will automatically be tracked here
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-stone-50 dark:bg-stone-900/50 border-b border-stone-100 dark:border-stone-800 text-stone-500 dark:text-stone-400 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-3.5 py-2.5">Payment Ref</th>
                  <th className="px-3.5 py-2.5">Timestamp</th>
                  <th className="px-3.5 py-2.5">Invoice ID</th>
                  <th className="px-3.5 py-2.5">Method</th>
                  <th className="px-3.5 py-2.5">Transaction / Gateway Ref</th>
                  <th className="px-3.5 py-2.5 text-right">Amount</th>
                  <th className="px-3.5 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800/80">
                {filteredPayments
                  .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                  .map((p) => {
                  const amount = Number(p.amount || 0);
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-stone-50/60 dark:hover:bg-stone-800/30 transition-colors"
                    >
                      <td className="px-3.5 py-2.5 font-mono font-bold text-stone-900 dark:text-white">
                        {p.payment_reference}
                      </td>
                      <td className="px-3.5 py-2.5 text-stone-600 dark:text-stone-400 text-xs">
                        {new Date(p.paid_at || p.created_at).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-stone-700 dark:text-stone-300">
                        {p.invoice_id ? `#${p.invoice_id}` : "—"}
                      </td>
                      <td className="px-3.5 py-2.5">
                        {getMethodBadge(p.payment_method)}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-xs text-stone-500 dark:text-stone-400">
                        {p.transaction_reference || "—"}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        ₹{amount.toFixed(2)}
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={11} />
                          {p.payment_status || "Completed"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredPayments.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={Math.ceil(filteredPayments.length / pageSize) || 1}
            onPageChange={setCurrentPage}
            totalRecords={filteredPayments.length}
            pageSize={pageSize}
            className="px-4 pb-3"
          />
        )}
      </div>
    </div>
  );
}
