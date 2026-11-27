import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  Car,
  CheckCircle2,
  Clock,
  IndianRupee,
  Navigation,
  Plus,
  Route,
  UserCheck,
  UserPlus,
  Wrench,
  XCircle,
} from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import PageHeader from "../../components/PageHeader";
import StatCard from "../../components/StatCard";
import StatusBadge from "../../components/StatusBadge";
import { BUTTON_VARIANTS, CARD_STYLES } from "../../utils/themeTokens";
import VillaDataTable from "../villas/VillaDataTable";
import { transportApi, trnDate, trnError, trnMoney, trnTime } from "./transportApi";

export default function TransportDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await transportApi.dashboard();
      setData(res.data);
    } catch (err) {
      setError(trnError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const stats = data?.statistics || {};
  const alerts = data?.alerts || [];

  const pickupColumns = [
    {
      key: "booking_number",
      label: "Booking #",
      cellClassName: "whitespace-nowrap font-mono font-bold",
      render: (b) => b.booking_number,
    },
    {
      key: "customer_name",
      label: "Guest / Customer",
      render: (b) => (
        <div className="min-w-[140px]">
          <div className="font-semibold text-[#172033] dark:text-[#F8FAFC]">{b.customer_name}</div>
          <div className="text-xs text-[#64748B] dark:text-[#8A9AB2]">{b.customer_phone || "—"}</div>
        </div>
      ),
    },
    {
      key: "route",
      label: "Pickup → Drop",
      render: (b) => (
        <div className="min-w-[180px]">
          <div className="text-xs font-semibold text-[#172033] dark:text-[#F8FAFC] truncate max-w-[240px]">
            {b.pickup_location} → {b.drop_location}
          </div>
          <div className="text-[11px] text-[#64748B] dark:text-[#8A9AB2]">{b.booking_type}</div>
        </div>
      ),
    },
    {
      key: "pickup_date",
      label: "Pickup",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (b) => `${trnDate(b.pickup_date)} · ${trnTime(b.pickup_time)}`,
    },
    {
      key: "assignment",
      label: "Vehicle / Driver",
      render: (b) =>
        b.vehicle_name ? (
          <div className="min-w-[140px]">
            <div className="text-xs font-semibold text-[#172033] dark:text-[#F8FAFC]">
              {b.vehicle_name} ({b.vehicle_reg})
            </div>
            <div className="text-[11px] text-[#64748B] dark:text-[#8A9AB2]">{b.driver_name || "No driver"}</div>
          </div>
        ) : (
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Unassigned</span>
        ),
    },
    {
      key: "passenger_count",
      label: "Pax",
      align: "right",
      cellClassName: "tabular-nums font-semibold",
    },
    {
      key: "status",
      label: "Status",
      align: "center",
      render: (b) => <StatusBadge status={b.status} size="sm" />,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/transport/vehicles?new=1")}
              className={BUTTON_VARIANTS.secondary}
            >
              <Plus size={15} />
              <span>Add Vehicle</span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/transport/bookings?new=1")}
              className={BUTTON_VARIANTS.primary}
            >
              <CalendarPlus size={15} />
              <span>New Booking</span>
            </button>
          </div>
        }
      />

      {error && (
        <AlertBanner
          variant="error"
          title="Unable to load transport dashboard"
          message={error}
          onDismiss={() => setError("")}
        />
      )}

      {/* 12 REAL-TIME OPERATIONAL METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 w-full">
        <StatCard
          compact
          title="Total Vehicles"
          value={loading ? "—" : stats.total_vehicles ?? 0}
          icon={Car}
          color="amber"
          onClick={() => navigate("/transport/vehicles")}
        />
        <StatCard
          compact
          title="Available Vehicles"
          value={loading ? "—" : stats.available_vehicles ?? 0}
          icon={CheckCircle2}
          color="emerald"
          onClick={() => navigate("/transport/vehicles?status=Available")}
        />
        <StatCard
          compact
          title="On Trip"
          value={loading ? "—" : stats.on_trip_vehicles ?? 0}
          icon={Navigation}
          color="sky"
          onClick={() => navigate("/transport/vehicles?status=On+Trip")}
        />
        <StatCard
          compact
          title="Under Maintenance"
          value={loading ? "—" : stats.maintenance_vehicles ?? 0}
          icon={Wrench}
          color="rose"
          onClick={() => navigate("/transport/maintenance")}
        />
        <StatCard
          compact
          title="Active Drivers"
          value={loading ? "—" : stats.active_drivers ?? 0}
          icon={UserCheck}
          color="indigo"
          onClick={() => navigate("/transport/drivers")}
        />
        <StatCard
          compact
          title="Today's Trips"
          value={loading ? "—" : stats.todays_scheduled_trips ?? 0}
          icon={CalendarDays}
          color="sky"
          onClick={() => navigate("/transport/schedule")}
        />
        <StatCard
          compact
          title="Upcoming Pickups"
          value={loading ? "—" : stats.upcoming_pickups ?? 0}
          icon={CalendarClock}
          color="amber"
          onClick={() => navigate("/transport/bookings")}
        />
        <StatCard
          compact
          title="Pending Requests"
          value={loading ? "—" : stats.pending_requests ?? 0}
          icon={Clock}
          color="orange"
          onClick={() => navigate("/transport/bookings?status=Pending")}
        />
        <StatCard
          compact
          title="Completed Trips"
          value={loading ? "—" : stats.completed_trips ?? 0}
          icon={CheckCircle2}
          color="emerald"
          onClick={() => navigate("/transport/bookings?status=Completed")}
        />
        <StatCard
          compact
          title="Cancelled / No-Show"
          value={loading ? "—" : stats.cancelled_trips ?? 0}
          icon={XCircle}
          color="rose"
          onClick={() => navigate("/transport/bookings?status=Cancelled")}
        />
        <StatCard
          compact
          title="Transport Revenue"
          value={loading ? "—" : trnMoney(stats.transport_revenue)}
          icon={IndianRupee}
          color="emerald"
          onClick={() => navigate("/transport/invoices")}
        />
        <StatCard
          compact
          title="Maintenance Alerts"
          value={loading ? "—" : stats.maintenance_alerts_count ?? 0}
          icon={AlertTriangle}
          color={Number(stats.maintenance_alerts_count || 0) > 0 ? "rose" : "slate"}
          onClick={() => navigate("/transport/maintenance")}
        />
      </div>

      {/* COMPACT OPERATIONAL ALERTS */}
      {!loading && alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.slice(0, 4).map((al) => (
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
          <h2 className="text-sm font-bold text-[#172033] dark:text-[#F8FAFC]">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Add Vehicle", path: "/transport/vehicles?new=1", icon: Car },
            { label: "Add Driver", path: "/transport/drivers?new=1", icon: UserPlus },
            { label: "New Transport Booking", path: "/transport/bookings?new=1", icon: CalendarPlus },
            { label: "Manage Routes", path: "/transport/routes", icon: Route },
            { label: "View Schedules", path: "/transport/schedule", icon: CalendarDays },
          ].map(({ label, path, icon: Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => navigate(path)}
              className="flex items-center justify-between rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#151D29] px-3 py-2.5 text-xs font-semibold text-[#172033] dark:text-[#F8FAFC] hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition cursor-pointer"
            >
              <span className="inline-flex items-center gap-2 truncate">
                <Icon size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="truncate">{label}</span>
              </span>
              <ArrowRight size={13} className="text-stone-400 shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* UPCOMING PICKUPS */}
      <VillaDataTable
        title="Upcoming Pickups & Active Trips"
        headerActions={
          <button
            type="button"
            onClick={() => navigate("/transport/bookings")}
            className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
          >
            View All Bookings →
          </button>
        }
        columns={pickupColumns}
        rows={data?.upcoming_pickups || []}
        loading={loading}
        loadingMessage="Loading upcoming pickups..."
        emptyTitle="No upcoming pickups scheduled"
        emptyDescription="Create a transport booking to schedule guest pickups and fleet assignments."
        tableMinWidth="min-w-[860px]"
        onRowClick={(b) => navigate(`/transport/bookings?search=${b.booking_number}`)}
      />
    </div>
  );
}
