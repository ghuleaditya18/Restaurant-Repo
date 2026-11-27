import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Download,
  IndianRupee,
  Package,
  Search,
  TrendingUp,
  Wallet,
  XCircle,
} from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import PageHeader from "../../components/PageHeader";
import StatCard from "../../components/StatCard";
import StatusBadge from "../../components/StatusBadge";
import { useNotification } from "../../context/NotificationContext";
import { BUTTON_VARIANTS, CARD_STYLES, INPUT_STYLES } from "../../utils/themeTokens";
import VillaDataTable from "../villas/VillaDataTable";
import { kolkataTodayIso, packagesApi, pkgDate, pkgError, pkgMoney } from "./packagesApi";

const CATEGORIES = ["Couple", "Family", "Weekend", "Wellness", "Adventure", "Event", "Seasonal"];
const BOOKING_STATUSES = ["Pending", "Confirmed", "In Progress", "Completed", "Cancelled"];

const REPORT_TABS = [
  { key: "bookings", label: "Bookings & Sales" },
  { key: "categories", label: "Category Sales" },
  { key: "revenue", label: "Revenue" },
  { key: "popular", label: "Popular Packages" },
  { key: "status", label: "Package Status" },
  { key: "cancellations", label: "Cancellations" },
  { key: "outstanding", label: "Outstanding Payments" },
];

export default function PackageReports() {
  const { showSuccess, showError } = useNotification();
  const [report, setReport] = useState(null);
  const [packagesList, setPackagesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("bookings");

  const [filters, setFilters] = useState({
    start_date: kolkataTodayIso(-30),
    end_date: kolkataTodayIso(30),
    package_id: "",
    category: "",
    status: "",
    search: "",
  });
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [repRes, pkgRes] = await Promise.all([
        packagesApi.reports({
          start_date: filters.start_date || undefined,
          end_date: filters.end_date || undefined,
          package_id: filters.package_id || undefined,
          category: filters.category || undefined,
          status: filters.status || undefined,
          search: filters.search.trim() || undefined,
          page,
          page_size: pageSize,
        }),
        packagesApi.list({ page: 1, page_size: 100 }),
      ]);
      setReport(repRes.data);
      setPackagesList(pkgRes.data?.items || []);
    } catch (err) {
      setError(pkgError(err));
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const handleExportCsv = async () => {
    try {
      const blob = await packagesApi.exportReportCsv({
        start_date: filters.start_date || undefined,
        end_date: filters.end_date || undefined,
        package_id: filters.package_id || undefined,
        category: filters.category || undefined,
        status: filters.status || undefined,
        search: filters.search.trim() || undefined,
      });
      const url = URL.createObjectURL(new Blob([blob], { type: "text/csv;charset=utf-8;" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "packages-report.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showSuccess("Packages report exported as CSV.");
    } catch (err) {
      showError(pkgError(err));
    }
  };

  const summary = report?.sales_summary || {};
  const rev = report?.revenue_report || {};
  const bookingReport = report?.booking_report || { items: [], total: 0, page: 1, total_pages: 1 };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        actions={
          <button type="button" onClick={handleExportCsv} className={BUTTON_VARIANTS.secondary}>
            <Download size={15} />
            <span>Export CSV</span>
          </button>
        }
      />

      {error && <AlertBanner variant="error" message={error} />}

      {/* FILTERS */}
      <div className={`${CARD_STYLES.base} !p-2.5`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-52">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search booking or package..."
              className={`${INPUT_STYLES.base} w-full pl-9 !py-1.5 text-xs`}
            />
          </div>
          <input
            type="date"
            value={filters.start_date}
            onChange={(e) => setFilters((f) => ({ ...f, start_date: e.target.value }))}
            className={`${INPUT_STYLES.base} w-full sm:!w-auto !py-1.5 text-xs`}
          />
          <input
            type="date"
            value={filters.end_date}
            onChange={(e) => setFilters((f) => ({ ...f, end_date: e.target.value }))}
            className={`${INPUT_STYLES.base} w-full sm:!w-auto !py-1.5 text-xs`}
          />
          <select
            value={filters.package_id}
            onChange={(e) => setFilters((f) => ({ ...f, package_id: e.target.value }))}
            className={`${INPUT_STYLES.select} w-full sm:!w-auto min-w-[150px] !py-1.5 text-xs`}
          >
            <option value="">All Packages</option>
            {packagesList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={filters.category}
            onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
            className={`${INPUT_STYLES.select} w-full sm:!w-auto min-w-[130px] !py-1.5 text-xs`}
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            className={`${INPUT_STYLES.select} w-full sm:!w-auto min-w-[130px] !py-1.5 text-xs`}
          >
            <option value="">All Statuses</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI SUMMARY */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard compact title="Total Booked Value" value={loading ? "—" : pkgMoney(summary.total_booked_value)} icon={TrendingUp} color="amber" />
        <StatCard compact title="Invoiced Total" value={loading ? "—" : pkgMoney(summary.total_invoiced)} icon={BarChart3} color="sky" />
        <StatCard compact title="Revenue Collected" value={loading ? "—" : pkgMoney(summary.revenue_collected)} icon={IndianRupee} color="emerald" />
        <StatCard compact title="Outstanding Balance" value={loading ? "—" : pkgMoney(summary.outstanding_balance)} icon={Wallet} color={Number(summary.outstanding_balance || 0) > 0 ? "rose" : "emerald"} />
        <StatCard compact title="Cancellations" value={loading ? "—" : summary.cancelled_bookings ?? 0} icon={XCircle} color="rose" />
      </div>

      {/* REPORT SUB-TABS */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-1.5 shadow-2xs">
        {REPORT_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              activeTab === t.key
                ? "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold"
                : "text-stone-600 dark:text-[#8A9AB2] hover:bg-stone-100 dark:hover:bg-[#161F30]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}
      {activeTab === "bookings" && (
        <VillaDataTable
          title="Package Sales & Booking Report"
          columns={[
            { key: "booking_number", label: "Booking #", cellClassName: "font-mono font-bold whitespace-nowrap" },
            { key: "customer_name", label: "Customer" },
            { key: "package_name", label: "Package" },
            { key: "package_category", label: "Category" },
            { key: "booking_date", label: "Booked", render: (r) => pkgDate(r.booking_date), cellClassName: "whitespace-nowrap" },
            { key: "guest_count", label: "Guests", align: "right" },
            { key: "total_amount", label: "Amount", align: "right", render: (r) => pkgMoney(r.total_amount), cellClassName: "font-semibold whitespace-nowrap" },
            { key: "status", label: "Status", align: "center", render: (r) => <StatusBadge status={r.status} label={r.status} size="sm" /> },
          ]}
          rows={bookingReport.items || []}
          loading={loading}
          emptyTitle="No bookings match the selected filters"
          tableMinWidth="min-w-[820px]"
          pagination={{
            currentPage: bookingReport.page || 1,
            totalPages: bookingReport.total_pages || 1,
            totalRecords: bookingReport.total || 0,
            pageSize,
            onPageChange: setPage,
          }}
        />
      )}

      {activeTab === "categories" && (
        <VillaDataTable
          title="Category-wise Sales Report"
          columns={[
            { key: "category", label: "Category", cellClassName: "font-semibold" },
            { key: "bookings", label: "Bookings", align: "right" },
            { key: "guests", label: "Total Guests", align: "right" },
            { key: "sales_amount", label: "Sales Total", align: "right", render: (r) => pkgMoney(r.sales_amount), cellClassName: "font-semibold" },
          ]}
          rows={report?.category_sales || []}
          rowKey={(r) => r.category}
          loading={loading}
          emptyTitle="No category sales recorded"
        />
      )}

      {activeTab === "revenue" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={CARD_STYLES.base}>
            <h3 className="text-sm font-bold mb-3">Revenue &amp; Tax Breakdown</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-[#E5E9F0] dark:border-[#1E293B]">
                <span>Total Booked Value</span>
                <span className="font-semibold">{pkgMoney(rev.total_booked_value)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E5E9F0] dark:border-[#1E293B]">
                <span>Total Invoiced</span>
                <span className="font-semibold">{pkgMoney(rev.total_invoiced)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E5E9F0] dark:border-[#1E293B]">
                <span>Total GST</span>
                <span className="font-semibold">{pkgMoney(rev.total_gst)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E5E9F0] dark:border-[#1E293B]">
                <span>Net Collected</span>
                <span className="font-bold text-emerald-600">{pkgMoney(rev.net_collected)}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span>Outstanding Balance</span>
                <span className="font-bold text-rose-600">{pkgMoney(rev.outstanding_balance)}</span>
              </div>
            </div>
          </div>

          <div className={CARD_STYLES.base}>
            <h3 className="text-sm font-bold mb-3">Collections by Payment Method</h3>
            <div className="space-y-2 text-xs">
              {(rev.by_payment_method || []).map((pm) => (
                <div
                  key={pm.method}
                  className="flex justify-between py-1.5 border-b border-[#E5E9F0] dark:border-[#1E293B] last:border-b-0"
                >
                  <span className="font-semibold">{pm.method}</span>
                  <span className="font-bold tabular-nums">{pkgMoney(pm.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "popular" && (
        <VillaDataTable
          title="Popular Packages Report"
          columns={[
            { key: "package_code", label: "Code", cellClassName: "font-mono font-bold" },
            { key: "package_name", label: "Package Name", cellClassName: "font-semibold" },
            { key: "category", label: "Category" },
            { key: "bookings", label: "Bookings", align: "right" },
            { key: "guests", label: "Guests", align: "right" },
            { key: "sales_amount", label: "Sales Revenue", align: "right", render: (r) => pkgMoney(r.sales_amount), cellClassName: "font-semibold" },
          ]}
          rows={report?.popular_packages || []}
          rowKey={(r) => r.package_id}
          loading={loading}
          emptyTitle="No package booking data yet"
        />
      )}

      {activeTab === "status" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {Object.entries(report?.package_status_report?.counts || {}).map(([st, cnt]) => (
              <StatCard key={st} compact title={st} value={cnt} icon={Package} color="amber" />
            ))}
          </div>
          <VillaDataTable
            title="Package Status Report"
            columns={[
              { key: "package_code", label: "Code", cellClassName: "font-mono font-bold" },
              { key: "name", label: "Package Name", cellClassName: "font-semibold" },
              { key: "category", label: "Category" },
              { key: "valid_to", label: "Valid To", render: (p) => pkgDate(p.valid_to) },
              { key: "booking_count", label: "Bookings", align: "right" },
              { key: "status", label: "Status", align: "center", render: (p) => <StatusBadge status={p.status} label={p.status} size="sm" /> },
            ]}
            rows={report?.package_status_report?.packages || []}
            loading={loading}
            emptyTitle="No packages configured"
          />
        </div>
      )}

      {activeTab === "cancellations" && (
        <VillaDataTable
          title="Booking Cancellation Report"
          columns={[
            { key: "booking_number", label: "Booking #", cellClassName: "font-mono font-bold" },
            { key: "customer_name", label: "Customer" },
            { key: "package_name", label: "Package" },
            { key: "start_date", label: "Start Date", render: (r) => pkgDate(r.start_date) },
            { key: "total_amount", label: "Amount", align: "right", render: (r) => pkgMoney(r.total_amount) },
            { key: "cancellation_reason", label: "Cancellation Reason" },
          ]}
          rows={report?.cancellation_report || []}
          rowKey={(r) => r.booking_id}
          loading={loading}
          emptyTitle="No cancelled bookings in this period"
        />
      )}

      {activeTab === "outstanding" && (
        <VillaDataTable
          title="Outstanding Payments Report"
          columns={[
            { key: "invoice_number", label: "Invoice #", cellClassName: "font-mono font-bold" },
            { key: "booking_number", label: "Booking #", cellClassName: "font-mono" },
            { key: "customer_name", label: "Customer" },
            { key: "package_name", label: "Package" },
            { key: "total_amount", label: "Total", align: "right", render: (r) => pkgMoney(r.total_amount) },
            { key: "paid_amount", label: "Paid", align: "right", render: (r) => pkgMoney(r.paid_amount) },
            { key: "balance_due", label: "Balance Due", align: "right", render: (r) => pkgMoney(r.balance_due), cellClassName: "font-bold text-rose-600" },
            { key: "payment_status", label: "Status", align: "center", render: (r) => <StatusBadge status={r.payment_status} label={r.payment_status} size="sm" /> },
          ]}
          rows={report?.outstanding_payments_report || []}
          rowKey={(r) => r.invoice_id}
          loading={loading}
          emptyTitle="All package invoices are settled"
        />
      )}
    </div>
  );
}
