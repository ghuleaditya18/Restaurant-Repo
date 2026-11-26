import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Download,
  IndianRupee,
  Search,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import PageHeader from "../../components/PageHeader";
import StatCard from "../../components/StatCard";
import StatusBadge from "../../components/StatusBadge";
import { useNotification } from "../../context/NotificationContext";
import { BUTTON_VARIANTS, CARD_STYLES, INPUT_STYLES } from "../../utils/themeTokens";
import VillaDataTable from "../villas/VillaDataTable";
import {
  actDate,
  actError,
  activitiesApi,
  actMoney,
  actTime,
  bookingTypeLabel,
  kolkataTodayIso,
} from "./activitiesApi";

const CATEGORIES = ["Water", "Adventure", "Indoor", "Outdoor", "Tour", "Nature", "Kids", "Special"];
const REPORT_TABS = [
  { key: "bookings", label: "Bookings Report" },
  { key: "sessions", label: "Session Utilization" },
  { key: "usage", label: "Walk-In Usage Logs" },
  { key: "revenue", label: "Revenue & Invoices" },
];

export default function ActivityReports() {
  const { showSuccess, showError } = useNotification();
  const [report, setReport] = useState(null);
  const [activitiesList, setActivitiesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("bookings");

  const [filters, setFilters] = useState({
    date_from: kolkataTodayIso(-30),
    date_to: kolkataTodayIso(30),
    activity_id: "",
    category: "",
    booking_type: "",
    status: "",
    search: "",
  });
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [repRes, actRes] = await Promise.all([
        activitiesApi.reports({
          report_type: activeTab,
          date_from: filters.date_from || undefined,
          date_to: filters.date_to || undefined,
          activity_id: filters.activity_id || undefined,
          category: filters.category || undefined,
          booking_type: filters.booking_type || undefined,
          status: filters.status || undefined,
          search: filters.search.trim() || undefined,
          page,
          page_size: pageSize,
        }),
        activitiesApi.list({ page: 1, page_size: 100 }),
      ]);
      setReport(repRes.data);
      setActivitiesList(actRes.data?.items || []);
    } catch (err) {
      setError(actError(err));
    } finally {
      setLoading(false);
    }
  }, [activeTab, filters, page]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, filters]);

  const handleExportCsv = async () => {
    try {
      const blob = await activitiesApi.exportReportCsv({
        report_type: activeTab,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
        activity_id: filters.activity_id || undefined,
        category: filters.category || undefined,
        booking_type: filters.booking_type || undefined,
        status: filters.status || undefined,
        search: filters.search.trim() || undefined,
      });
      const url = URL.createObjectURL(new Blob([blob], { type: "text/csv;charset=utf-8;" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `activities-${activeTab}-report.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showSuccess("Activities report exported as CSV.");
    } catch (err) {
      showError(actError(err));
    }
  };

  const summary = report?.summary || {};
  const items = report?.items || [];

  const bookingsColumns = [
    { key: "booking_number", label: "Booking #", cellClassName: "font-mono font-bold whitespace-nowrap" },
    { key: "customer_name", label: "Customer" },
    { key: "activity_name", label: "Activity" },
    {
      key: "booking_type",
      label: "Type",
      render: (r) => <StatusBadge status={r.booking_type} label={bookingTypeLabel(r.booking_type)} size="sm" />,
    },
    { key: "booking_date", label: "Date", render: (r) => actDate(r.booking_date), cellClassName: "whitespace-nowrap" },
    { key: "participant_count", label: "Participants", align: "right" },
    { key: "total_amount", label: "Amount", align: "right", render: (r) => actMoney(r.total_amount), cellClassName: "font-semibold whitespace-nowrap" },
    { key: "status", label: "Status", align: "center", render: (r) => <StatusBadge status={r.status} size="sm" /> },
  ];

  const sessionColumns = [
    { key: "session_date", label: "Date", render: (r) => actDate(r.session_date), cellClassName: "whitespace-nowrap" },
    { key: "activity_name", label: "Activity", cellClassName: "font-semibold" },
    { key: "time", label: "Time", render: (r) => `${actTime(r.start_time)} – ${actTime(r.end_time)}`, cellClassName: "whitespace-nowrap" },
    { key: "assigned_staff_name", label: "Instructor", render: (r) => r.assigned_staff_name || "Unassigned" },
    { key: "seats_booked", label: "Booked", align: "right" },
    { key: "capacity", label: "Capacity", align: "right" },
    {
      key: "utilization",
      label: "Utilization",
      align: "right",
      render: (r) => `${Math.round(((r.seats_booked || 0) / Math.max(1, r.capacity)) * 100)}%`,
    },
    { key: "status", label: "Status", align: "center", render: (r) => <StatusBadge status={r.status} size="sm" /> },
  ];

  const usageColumns = [
    { key: "usage_date", label: "Date", render: (r) => actDate(r.usage_date), cellClassName: "whitespace-nowrap" },
    { key: "activity_name", label: "Activity", cellClassName: "font-semibold" },
    { key: "category", label: "Category" },
    { key: "customer_name", label: "Guest" },
    { key: "participant_count", label: "Participants", align: "right" },
    { key: "amount_charged", label: "Amount Charged", align: "right", render: (r) => actMoney(r.amount_charged), cellClassName: "font-semibold" },
  ];

  const revenueColumns = [
    { key: "invoice_number", label: "Invoice #", cellClassName: "font-mono font-bold whitespace-nowrap" },
    { key: "booking_number", label: "Booking #", cellClassName: "font-mono" },
    { key: "activity_name", label: "Activity" },
    { key: "customer_name", label: "Customer" },
    { key: "total_amount", label: "Total", align: "right", render: (r) => actMoney(r.total_amount) },
    { key: "paid_amount", label: "Paid", align: "right", render: (r) => actMoney(r.paid_amount), cellClassName: "text-emerald-600 font-semibold" },
    { key: "balance_due", label: "Balance", align: "right", render: (r) => actMoney(r.balance_due) },
    { key: "payment_status", label: "Status", align: "center", render: (r) => <StatusBadge status={r.payment_status} size="sm" /> },
  ];

  const activeColumns =
    activeTab === "sessions"
      ? sessionColumns
      : activeTab === "usage"
        ? usageColumns
        : activeTab === "revenue"
          ? revenueColumns
          : bookingsColumns;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Activities Reports"
        description="Analyze activity bookings, session utilization, walk-in usage logs, and collected revenue with CSV export."
        actions={
          <button type="button" onClick={handleExportCsv} className={BUTTON_VARIANTS.secondary}>
            <Download size={15} />
            <span>Export CSV</span>
          </button>
        }
      />

      {error && <AlertBanner variant="error" message={error} />}

      <div className={`${CARD_STYLES.base} !p-2.5`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-52">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search booking, guest..."
              className={`${INPUT_STYLES.base} w-full pl-9 !py-1.5 text-xs`}
            />
          </div>
          <input
            type="date"
            value={filters.date_from}
            onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
            className={`${INPUT_STYLES.base} w-full sm:!w-auto !py-1.5 text-xs`}
          />
          <input
            type="date"
            value={filters.date_to}
            onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))}
            className={`${INPUT_STYLES.base} w-full sm:!w-auto !py-1.5 text-xs`}
          />
          <select
            value={filters.activity_id}
            onChange={(e) => setFilters((f) => ({ ...f, activity_id: e.target.value }))}
            className={`${INPUT_STYLES.select} w-full sm:!w-auto min-w-[140px] !py-1.5 text-xs`}
          >
            <option value="">All Activities</option>
            {activitiesList.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <select
            value={filters.category}
            onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
            className={`${INPUT_STYLES.select} w-full sm:!w-auto min-w-[125px] !py-1.5 text-xs`}
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={filters.booking_type}
            onChange={(e) => setFilters((f) => ({ ...f, booking_type: e.target.value }))}
            className={`${INPUT_STYLES.select} w-full sm:!w-auto min-w-[125px] !py-1.5 text-xs`}
          >
            <option value="">All Booking Types</option>
            <option value="time_slot">Time Slot</option>
            <option value="session">Session</option>
            <option value="walk_in">Walk-In</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard compact title="Total Booked Value" value={loading ? "—" : actMoney(summary.total_booked_value)} icon={TrendingUp} color="amber" />
        <StatCard compact title="Revenue Collected" value={loading ? "—" : actMoney(summary.revenue_collected)} icon={IndianRupee} color="emerald" />
        <StatCard compact title="Outstanding Balance" value={loading ? "—" : actMoney(summary.outstanding_balance)} icon={Wallet} color={Number(summary.outstanding_balance || 0) > 0 ? "rose" : "emerald"} />
        <StatCard compact title="Total Participants" value={loading ? "—" : summary.total_participants ?? 0} description={`${summary.cancelled_bookings ?? 0} cancelled`} icon={Users} color="sky" />
      </div>

      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-1.5 shadow-2xs">
        {REPORT_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              activeTab === t.key
                ? "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold"
                : "text-stone-600 dark:text-[#8A9AB2] hover:bg-stone-100 dark:hover:bg-[#161F30]"
            }`}
          >
            <BarChart3 size={13} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <VillaDataTable
        title={REPORT_TABS.find((t) => t.key === activeTab)?.label || "Report"}
        columns={activeColumns}
        rows={items}
        loading={loading}
        emptyTitle="No report records match the selected filters"
        tableMinWidth="min-w-[840px]"
        pagination={{
          currentPage: report?.page || 1,
          totalPages: report?.total_pages || 1,
          totalRecords: report?.total || 0,
          pageSize,
          onPageChange: setPage,
        }}
      />
    </div>
  );
}
