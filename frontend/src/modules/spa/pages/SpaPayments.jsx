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

export default function SpaPayments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [methodFilter, setMethodFilter] = useState("all");
  const [search, setSearch] = useState("");

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
      setError(err.response?.data?.detail || "Failed to load payment transactions");
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [methodFilter]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-white tracking-tight">
          Payment Transactions
        </h1>
        <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400">
          Complete settlement ledger across UPI, Cards, Net Banking and Cash collections
        </p>
      </div>

      {/* Aggregate Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#1C1917] p-4 sm:p-5 shadow-xs">
          <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
            Total Revenue
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <IndianRupee size={22} className="text-[#F5B716]" />
            <span className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-white">
              {totalCollected.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[11px] text-stone-400 mt-1">{safePayments.length} successful payment(s)</p>
        </div>

        <div className="rounded-2xl border border-violet-200/60 dark:border-violet-900/40 bg-violet-50/40 dark:bg-violet-950/20 p-4 sm:p-5 shadow-xs">
          <p className="text-xs font-semibold text-violet-800 dark:text-violet-300 uppercase tracking-wider">
            UPI Settlements
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <IndianRupee size={22} className="text-violet-600 dark:text-violet-400" />
            <span className="text-xl sm:text-2xl font-bold text-violet-900 dark:text-violet-200">
              {upiCollected.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[11px] text-violet-700/70 dark:text-violet-400/70 mt-1">Instant QR / VPA</p>
        </div>

        <div className="rounded-2xl border border-blue-200/60 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 p-4 sm:p-5 shadow-xs">
          <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-wider">
            Card POS
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <IndianRupee size={22} className="text-blue-600 dark:text-blue-400" />
            <span className="text-xl sm:text-2xl font-bold text-blue-900 dark:text-blue-200">
              {cardCollected.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[11px] text-blue-700/70 dark:text-blue-400/70 mt-1">Debit & Credit cards</p>
        </div>

        <div className="rounded-2xl border border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 sm:p-5 shadow-xs">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
            Cash / Direct
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <IndianRupee size={22} className="text-emerald-600 dark:text-emerald-400" />
            <span className="text-xl sm:text-2xl font-bold text-emerald-900 dark:text-emerald-200">
              {cashCollected.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[11px] text-emerald-700/70 dark:text-emerald-400/70 mt-1">Front desk collections</p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
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
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                methodFilter === tab.key
                  ? "bg-[#1C1917] dark:bg-white text-white dark:text-[#1C1917]"
                  : "border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1C1917] text-stone-700 dark:text-stone-300 hover:bg-stone-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[260px]">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <input
            type="text"
            placeholder="Search reference, transaction ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1C1917] pl-10 pr-4 py-2 text-xs sm:text-sm text-stone-900 dark:text-white placeholder-stone-400 focus:border-[#F5B716] focus:outline-none"
          />
        </div>
      </div>

      {/* Ledger Table */}
      <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#1C1917] overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-12 text-center text-xs sm:text-sm text-stone-400">
            Loading transaction ledger...
          </div>
        ) : error ? (
          <div className="p-6 text-center text-xs sm:text-sm text-red-600">
            {error}
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="p-12 text-center">
            <CreditCard size={40} className="mx-auto text-stone-300 dark:text-stone-600 mb-3" />
            <h3 className="text-base font-semibold text-stone-800 dark:text-stone-200">
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
                  <th className="px-5 py-3">Payment Ref</th>
                  <th className="px-5 py-3">Timestamp</th>
                  <th className="px-5 py-3">Invoice ID</th>
                  <th className="px-5 py-3">Method</th>
                  <th className="px-5 py-3">Transaction / Gateway Ref</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800/80">
                {filteredPayments.map((p) => {
                  const amount = Number(p.amount || 0);
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-stone-50/60 dark:hover:bg-stone-800/30 transition-colors"
                    >
                      <td className="px-5 py-3.5 font-mono font-bold text-stone-900 dark:text-white">
                        {p.payment_reference}
                      </td>
                      <td className="px-5 py-3.5 text-stone-600 dark:text-stone-400 text-xs">
                        {new Date(p.paid_at || p.created_at).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-stone-700 dark:text-stone-300">
                        {p.invoice_id ? `#${p.invoice_id}` : "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        {getMethodBadge(p.payment_method)}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-stone-500 dark:text-stone-400">
                        {p.transaction_reference || "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        ₹{amount.toFixed(2)}
                      </td>
                      <td className="px-5 py-3.5 text-center">
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
      </div>
    </div>
  );
}
