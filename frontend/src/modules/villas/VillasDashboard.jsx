import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  Building2,
  CalendarDays,
  CalendarPlus,
  DoorClosed,
  DoorOpen,
  IndianRupee,
  Percent,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import PageHeader from "../../components/PageHeader";
import StatCard from "../../components/StatCard";
import StatusBadge from "../../components/StatusBadge";
import { BUTTON_VARIANTS, CARD_STYLES } from "../../utils/themeTokens";
import VillaDataTable from "./VillaDataTable";
import { villaDateRange, villaError, villaMoney, villasApi } from "./villasApi";

export default function VillasDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await villasApi.dashboard();
      setData(res.data);
    } catch (err) {
      setError(villaError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const upcomingColumns = [
    {
      key: "booking_number",
      label: "Stay #",
      cellClassName: "whitespace-nowrap font-mono font-bold",
      render: (b) => b.booking_number,
    },
    {
      key: "guest",
      label: "Guest",
      render: (b) => (
        <div className="min-w-[150px]">
          <div className="font-semibold text-[#172033] dark:text-[#F8FAFC] whitespace-nowrap">
            {b.guest_name || b.customer_name}
          </div>
          <div className="text-xs text-[#64748B] dark:text-[#8A9AB2]">
            {b.guest_phone || b.customer_phone || "—"}
          </div>
        </div>
      ),
    },
    {
      key: "unit",
      label: "Unit & Villa",
      render: (b) => (
        <div className="min-w-[170px]">
          <div className="font-medium text-[#172033] dark:text-[#F8FAFC]">{b.unit_name}</div>
          <div className="text-xs text-[#64748B] dark:text-[#8A9AB2]">{b.villa_name}</div>
        </div>
      ),
    },
    {
      key: "dates",
      label: "Stay Dates",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (b) => villaDateRange(b.check_in, b.check_out),
    },
    {
      key: "status",
      label: "Status",
      align: "center",
      render: (b) => <StatusBadge status={b.status} label={b.status} size="sm" />,
    },
    {
      key: "total",
      label: "Total / Balance",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (b) => (
        <div>
          <div className="font-semibold">{villaMoney(b.invoice_total ?? b.total_amount)}</div>
          <div className="text-[11px] text-[#64748B] dark:text-[#8A9AB2]">
            Bal {villaMoney(b.invoice_balance_due)}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        description="Real-time resort occupancy, arrivals and departures, housekeeping readiness, and revenue summary."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/villas/inventory")}
              className={BUTTON_VARIANTS.secondary}
            >
              <BedDouble size={15} />
              <span>Manage Units</span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/villas/bookings?new=1")}
              className={BUTTON_VARIANTS.primary}
            >
              <CalendarPlus size={15} />
              <span>New Stay</span>
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

      {/* PORTFOLIO & OPERATIONS KPI GRID (6 CARDS PER ROW, FULL WIDTH) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 w-full">
        <StatCard
          compact
          title="Active Villas"
          value={loading ? "—" : data?.villas ?? 0}
          description={`${data?.units ?? 0} active units across portfolio`}
          icon={Building2}
          color="bg-[#FFF7E8] dark:bg-[#30251C] text-[#9A3412] dark:text-[#FFB02E] border border-[#FFEDD5] dark:border-[#9A3412]/40"
          onClick={() => navigate("/villas/inventory?tab=villas")}
        />
        <StatCard
          compact
          title="Available Today"
          value={loading ? "—" : data?.available_units ?? 0}
          description={`${data?.occupied_units ?? 0} occupied · ${data?.out_of_order_units ?? 0} out of order`}
          icon={BedDouble}
          color="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
          onClick={() => navigate("/villas/inventory?tab=units")}
        />
        <StatCard
          compact
          title="Occupancy Rate"
          value={loading ? "—" : `${data?.occupancy_rate ?? 0}%`}
          description={`${data?.checked_in ?? 0} active in-house stays`}
          icon={Percent}
          color="bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-800"
          onClick={() => navigate("/villas/reports")}
        />
        <StatCard
          compact
          title="Net Revenue Received"
          value={loading ? "—" : villaMoney(data?.revenue_received)}
          description={`Outstanding: ${villaMoney(data?.outstanding_balance)}`}
          icon={IndianRupee}
          color="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
          onClick={() => navigate("/villas/invoices")}
        />
        <StatCard
          compact
          title="Arrivals Today"
          value={loading ? "—" : data?.arrivals_today ?? 0}
          description="Expected check-ins today"
          icon={DoorOpen}
          color="bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-800"
          onClick={() => navigate("/villas/bookings")}
        />
        <StatCard
          compact
          title="Departures Today"
          value={loading ? "—" : data?.departures_today ?? 0}
          description="Scheduled check-outs today"
          icon={DoorClosed}
          color="bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
          onClick={() => navigate("/villas/bookings")}
        />
        <StatCard
          compact
          title="Needs Housekeeping"
          value={loading ? "—" : data?.needs_housekeeping_units ?? 0}
          description={`${data?.out_of_order_units ?? 0} marked Out of Order`}
          icon={Wrench}
          color={
            (data?.needs_housekeeping_units || 0) > 0
              ? "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
              : "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700"
          }
          onClick={() => navigate("/villas/inventory?tab=housekeeping")}
        />
        <StatCard
          compact
          title="Outstanding Balance"
          value={loading ? "—" : villaMoney(data?.outstanding_balance)}
          description="Pending guest invoice settlements"
          icon={Wallet}
          color={
            Number(data?.outstanding_balance || 0) > 0
              ? "bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800"
              : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
          }
          onClick={() => navigate("/villas/invoices")}
        />
      </div>

      {/* HOUSEKEEPING / OUT-OF-ORDER ALERT */}
      {!loading && ((data?.out_of_order_units || 0) > 0 || (data?.needs_housekeeping_units || 0) > 0) && (
        <AlertBanner
          variant={data.out_of_order_units > 0 ? "warning" : "info"}
          title="Housekeeping & Unit Readiness Attention"
          message={`${data.needs_housekeeping_units || 0} unit(s) require cleaning/inspection and ${data.out_of_order_units || 0} unit(s) are currently Out of Order.`}
          action={
            <button
              type="button"
              onClick={() => navigate("/villas/inventory?tab=housekeeping")}
              className={BUTTON_VARIANTS.secondary}
            >
              Open Housekeeping
            </button>
          }
        />
      )}

      {/* QUICK ACTIONS */}
      <div className={CARD_STYLES.base}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-[#172033] dark:text-[#F8FAFC]">
            Quick Front-Desk Actions
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "New Reservation", path: "/villas/bookings?new=1", icon: CalendarPlus },
            { label: "All Stays", path: "/villas/bookings", icon: CalendarDays },
            { label: "Guest Directory", path: "/villas/guests", icon: Users },
            { label: "Housekeeping", path: "/villas/inventory?tab=housekeeping", icon: AlertTriangle },
            { label: "Guest Services", path: "/villas/services", icon: Wrench },
            { label: "Reports", path: "/villas/reports", icon: Percent },
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

      {/* UPCOMING & ACTIVE STAYS */}
      <VillaDataTable
        title="Active & Upcoming Stays"
        subtitle="Next scheduled check-ins and current in-house villa stays"
        headerActions={
          <button
            type="button"
            onClick={() => navigate("/villas/bookings")}
            className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
          >
            View All Stays →
          </button>
        }
        columns={upcomingColumns}
        rows={data?.upcoming_bookings || []}
        loading={loading}
        loadingMessage="Loading upcoming stays..."
        emptyTitle="No active or upcoming stays scheduled"
        emptyDescription="Create a new reservation to see upcoming arrivals here."
        tableMinWidth="min-w-[820px]"
        onRowClick={(b) => navigate(`/villas/bookings?search=${b.booking_number}`)}
      />
    </div>
  );
}
