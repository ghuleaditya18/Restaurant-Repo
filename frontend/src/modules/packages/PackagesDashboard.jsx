import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  CalendarCheck2,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Clock,
  FileEdit,
  IndianRupee,
  Package,
  PackagePlus,
  PauseCircle,
  Wallet,
} from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import PageHeader from "../../components/PageHeader";
import StatCard from "../../components/StatCard";
import StatusBadge from "../../components/StatusBadge";
import { BUTTON_VARIANTS, CARD_STYLES } from "../../utils/themeTokens";
import VillaDataTable from "../villas/VillaDataTable";
import { packagesApi, pkgDate, pkgError, pkgMoney } from "./packagesApi";

export default function PackagesDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await packagesApi.dashboard();
      setData(res.data);
    } catch (err) {
      setError(pkgError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const stats = data?.statistics || {};
  const alerts = data?.alerts || [];

  const recentColumns = [
    {
      key: "booking_number",
      label: "Booking #",
      cellClassName: "whitespace-nowrap font-mono font-bold",
      render: (b) => b.booking_number,
    },
    {
      key: "customer",
      label: "Customer",
      render: (b) => (
        <div className="min-w-[140px]">
          <div className="font-semibold text-[#172033] dark:text-[#F8FAFC] whitespace-nowrap">
            {b.customer_name}
          </div>
          <div className="text-xs text-[#64748B] dark:text-[#8A9AB2]">
            {b.customer_phone || "—"}
          </div>
        </div>
      ),
    },
    {
      key: "package",
      label: "Package",
      render: (b) => (
        <div className="min-w-[160px]">
          <div className="font-medium text-[#172033] dark:text-[#F8FAFC] truncate max-w-[220px]">
            {b.package_name}
          </div>
          <div className="text-xs text-[#64748B] dark:text-[#8A9AB2] font-mono">
            {b.package_code}
          </div>
        </div>
      ),
    },
    {
      key: "booking_date",
      label: "Booking Date",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (b) => pkgDate(b.booking_date),
    },
    {
      key: "start_date",
      label: "Start Date",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (b) => pkgDate(b.start_date),
    },
    {
      key: "guest_count",
      label: "Guests",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (b) => `${b.guest_count}`,
    },
    {
      key: "total_amount",
      label: "Amount",
      align: "right",
      cellClassName: "whitespace-nowrap font-semibold tabular-nums",
      render: (b) => pkgMoney(b.total_amount),
    },
    {
      key: "status",
      label: "Status",
      align: "center",
      render: (b) => <StatusBadge status={b.status} label={b.status} size="sm" />,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Packages Dashboard"
        description="Real-time package inventory, upcoming bookings, operational alerts, and revenue overview."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/packages/catalog?new=1")}
              className={BUTTON_VARIANTS.secondary}
            >
              <PackagePlus size={15} />
              <span>Create Package</span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/packages/bookings?new=1")}
              className={BUTTON_VARIANTS.primary}
            >
              <CalendarPlus size={15} />
              <span>New Package Booking</span>
            </button>
          </div>
        }
      />

      {error && (
        <AlertBanner
          variant="error"
          title="Unable to load dashboard"
          message={error}
          onDismiss={() => setError("")}
        />
      )}

      {/* COMPACT KPI GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 w-full">
        <StatCard
          compact
          title="Total Packages"
          value={loading ? "—" : stats.total_packages ?? 0}
          description="Configured catalog packages"
          icon={Package}
          color="amber"
          onClick={() => navigate("/packages/catalog")}
        />
        <StatCard
          compact
          title="Active Packages"
          value={loading ? "—" : stats.active_packages ?? 0}
          description="Available for bookings"
          icon={CheckCircle2}
          color="emerald"
          onClick={() => navigate("/packages/catalog?status=Active")}
        />
        <StatCard
          compact
          title="Inactive Packages"
          value={loading ? "—" : stats.inactive_packages ?? 0}
          description="Temporarily paused"
          icon={PauseCircle}
          color="slate"
          onClick={() => navigate("/packages/catalog?status=Inactive")}
        />
        <StatCard
          compact
          title="Draft Packages"
          value={loading ? "—" : stats.draft_packages ?? 0}
          description="Awaiting inclusions / activation"
          icon={FileEdit}
          color="sky"
          onClick={() => navigate("/packages/catalog?status=Draft")}
        />
        <StatCard
          compact
          title="Expired Packages"
          value={loading ? "—" : stats.expired_packages ?? 0}
          description="Past validity window"
          icon={Clock}
          color="rose"
          onClick={() => navigate("/packages/catalog?status=Expired")}
        />
        <StatCard
          compact
          title="Total Bookings"
          value={loading ? "—" : stats.total_bookings ?? 0}
          description={`${stats.pending_confirmations ?? 0} pending confirmation`}
          icon={CalendarCheck2}
          color="indigo"
          onClick={() => navigate("/packages/bookings")}
        />
        <StatCard
          compact
          title="Upcoming Bookings"
          value={loading ? "—" : stats.upcoming_bookings ?? 0}
          description="Scheduled arrivals ahead"
          icon={CalendarClock}
          color="sky"
          onClick={() => navigate("/packages/bookings")}
        />
        <StatCard
          compact
          title="Revenue Generated"
          value={loading ? "—" : pkgMoney(stats.revenue_generated)}
          description="Collected package payments"
          icon={IndianRupee}
          color="emerald"
          onClick={() => navigate("/packages/invoices")}
        />
        <StatCard
          compact
          title="Outstanding Balance"
          value={loading ? "—" : pkgMoney(stats.outstanding_balance)}
          description="Pending invoice settlements"
          icon={Wallet}
          color={Number(stats.outstanding_balance || 0) > 0 ? "rose" : "emerald"}
          onClick={() => navigate("/packages/invoices?payment_status=Pending")}
        />
      </div>

      {/* OPERATIONAL ALERTS */}
      {!loading && alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((al) => (
            <AlertBanner
              key={al.id}
              variant={al.severity || "warning"}
              title={al.title}
              message={al.message}
              action={
                al.route ? (
                  <button
                    type="button"
                    onClick={() => navigate(al.route)}
                    className={BUTTON_VARIANTS.secondary}
                  >
                    Review
                  </button>
                ) : null
              }
            />
          ))}
        </div>
      )}

      {/* QUICK ACTIONS */}
      <div className={CARD_STYLES.base}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-[#172033] dark:text-[#F8FAFC]">
            Quick Actions
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Create Package", path: "/packages/catalog?new=1", icon: PackagePlus },
            { label: "New Package Booking", path: "/packages/bookings?new=1", icon: CalendarPlus },
            { label: "View Packages", path: "/packages/catalog", icon: Package },
            { label: "View Reports", path: "/packages/reports", icon: BarChart3 },
          ].map(({ label, path, icon: Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => navigate(path)}
              className="flex items-center justify-between rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#151D29] px-3 py-2.5 text-xs font-semibold text-[#172033] dark:text-[#F8FAFC] hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition cursor-pointer"
            >
              <span className="inline-flex items-center gap-2">
                <Icon size={14} className="text-amber-600 dark:text-amber-400" />
                {label}
              </span>
              <ArrowRight size={13} className="text-stone-400" />
            </button>
          ))}
        </div>
      </div>

      {/* RECENT PACKAGE BOOKINGS */}
      <VillaDataTable
        title="Recent Package Bookings"
        subtitle="Latest curated package reservations across all categories"
        headerActions={
          <button
            type="button"
            onClick={() => navigate("/packages/bookings")}
            className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
          >
            View All Bookings →
          </button>
        }
        columns={recentColumns}
        rows={data?.recent_bookings || []}
        loading={loading}
        loadingMessage="Loading recent package bookings..."
        emptyTitle="No package bookings recorded yet"
        emptyDescription="Create a package booking to track reservations and settlements here."
        tableMinWidth="min-w-[880px]"
        onRowClick={(b) => navigate(`/packages/bookings?search=${b.booking_number}`)}
      />
    </div>
  );
}
