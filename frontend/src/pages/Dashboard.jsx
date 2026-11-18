import { useCallback, useEffect, useState } from "react";
import {
  ShoppingBag,
  Users,
  UserCheck,
  UtensilsCrossed,
  Grid3X3,
  Plus,
  RefreshCw,
  ArrowRight,
  IndianRupee,
  Clock,
  AlertCircle,
} from "lucide-react";
import { Link } from "react-router-dom";

import StatCard from "../components/StatCard";
import RecentOrders from "../components/RecentOrders";
import DateFilter from "../components/DateFilter";
import { getDashboardSummary } from "../services/dashboardService";

const INITIAL_STATISTICS = {
  total_orders: 0,
  total_customers: 0,
  total_staff: 0,
  total_menu_items: 0,
  pending_orders: 0,
  preparing_orders: 0,
  completed_orders: 0,
  total_tables: 0,
  available_tables: 0,
  occupied_tables: 0,
  today_orders: 0,
  active_orders: 0,
  pending_payments: 0,
  total_revenue: "0.00",
  date_filter_label: "Today",
};

function Dashboard() {
  const [data, setData] = useState({
    statistics: INITIAL_STATISTICS,
    recent_orders: [],
    tables: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateFilter, setDateFilter] = useState({
    preset: "today",
    startDate: "",
    endDate: "",
  });

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = {
        preset: dateFilter.preset,
      };
      if (dateFilter.preset === "custom") {
        if (dateFilter.startDate) params.start_date = dateFilter.startDate;
        if (dateFilter.endDate) params.end_date = dateFilter.endDate;
      }

      const result = await getDashboardSummary(params);
      setData({
        statistics: result?.statistics || INITIAL_STATISTICS,
        recent_orders: Array.isArray(result?.recent_orders)
          ? result.recent_orders
          : [],
        tables: Array.isArray(result?.tables) ? result.tables : [],
      });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      const message =
        typeof detail === "string"
          ? detail
          : err?.message || "Failed to load dashboard data. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const stats = data.statistics;
  const periodLabel = stats.date_filter_label || "Selected Period";

  return (
    <div>
      {/* Welcome & Filter Section */}
      <section className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-bold leading-tight text-[#29231F] md:text-[26px]">
            Operational Overview
          </h1>

          <p className="mt-1 text-xs text-[#8A817B] sm:text-sm">
            Real-time daily operations and metrics for <span className="font-semibold text-stone-700">{periodLabel}</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <DateFilter
            selectedPreset={dateFilter.preset}
            startDate={dateFilter.startDate}
            endDate={dateFilter.endDate}
            onChange={(newFilter) => setDateFilter(newFilter)}
          />

          <Link
            to="/orders"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#C65D35] px-3.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#A94B2B]"
          >
            <Plus size={16} />
            <span>Create Order</span>
          </Link>

          <button
            onClick={loadDashboard}
            disabled={loading}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#E9E3DA] bg-white text-[#29231F] shadow-xs transition hover:bg-[#FAF9F6] disabled:opacity-60"
            title="Refresh Dashboard Data"
            aria-label="Refresh Dashboard Data"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </section>

      {/* Error alert */}
      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* PERIOD-SPECIFIC METRICS */}
      <div className="mb-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">
          Period Statistics ({periodLabel})
        </h2>
      </div>

      <section className="mb-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={`Orders (${periodLabel})`}
          value={loading ? "..." : String(stats.total_orders).padStart(2, "0")}
          description={
            loading
              ? "Fetching orders..."
              : `${stats.pending_orders} Pending • ${stats.preparing_orders} In Kitchen • ${stats.completed_orders} Completed`
          }
          icon={ShoppingBag}
          color="bg-[#F8EAE1] text-[#C65D35]"
        />

        <StatCard
          title={`Revenue (${periodLabel})`}
          value={loading ? "..." : `₹${Number(stats.total_revenue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
          description="Collected from completed payments"
          icon={IndianRupee}
          color="bg-[#EEF3EA] text-[#4F6D49]"
        />

        <StatCard
          title="Active Operational Orders"
          value={loading ? "..." : String(stats.active_orders).padStart(2, "0")}
          description="Orders requiring kitchen / table attention"
          icon={Clock}
          color="bg-[#FFF4E5] text-[#D97706]"
        />

        <StatCard
          title="Pending Payments"
          value={loading ? "..." : String(stats.pending_payments).padStart(2, "0")}
          description="Served orders / pending settlement"
          icon={AlertCircle}
          color="bg-[#FEE2E2] text-[#DC2626]"
        />
      </section>

      {/* RESTAURANT OVERVIEW */}
      <div className="mb-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">
          Restaurant Overview
        </h2>
      </div>

      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-center gap-3.5 rounded-xl border border-[#E9E3DA] bg-white p-3.5 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F4ECE6] text-[#6E584B]">
            <Users size={18} />
          </div>
          <div>
            <p className="text-xs text-stone-500">Total Customers</p>
            <p className="text-lg font-bold text-stone-900">{stats.total_customers}</p>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-xl border border-[#E9E3DA] bg-white p-3.5 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F6EFE5] text-[#8C6438]">
            <UserCheck size={18} />
          </div>
          <div>
            <p className="text-xs text-stone-500">Total Staff</p>
            <p className="text-lg font-bold text-stone-900">{stats.total_staff}</p>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-xl border border-[#E9E3DA] bg-white p-3.5 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#EEF3EA] text-[#4F6D49]">
            <UtensilsCrossed size={18} />
          </div>
          <div>
            <p className="text-xs text-stone-500">Menu Items</p>
            <p className="text-lg font-bold text-stone-900">{stats.total_menu_items}</p>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-xl border border-[#E9E3DA] bg-white p-3.5 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F8EAE1] text-[#C65D35]">
            <Grid3X3 size={18} />
          </div>
          <div>
            <p className="text-xs text-stone-500">Dining Tables</p>
            <p className="text-lg font-bold text-stone-900">{stats.total_tables}</p>
          </div>
        </div>
      </section>

      {/* Main Content: Recent Orders and Live Table Status */}
      <section className="grid grid-cols-1 items-start gap-5 2xl:grid-cols-3">
        <div className="2xl:col-span-2">
          <RecentOrders orders={data.recent_orders} loading={loading} />
        </div>

        {/* Live Table Status */}
        <div className="rounded-xl border border-[#E9E3DA] bg-white p-5 shadow-xs">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#29231F]">Live Table Status</h2>
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                  Live
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[#8A817B]">
                Real-time table occupancy & active orders
              </p>
            </div>

            <div className="rounded-lg border border-[#EEE9E2] bg-[#FAF9F6] px-2.5 py-1 text-[11px]">
              <span className="font-semibold text-[#4F6D49]">
                {stats.available_tables} Available
              </span>
              <span className="mx-1 text-[#8A817B]">•</span>
              <span className="font-semibold text-[#C65D35]">
                {stats.occupied_tables} Occupied
              </span>
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-xs text-[#8A817B]">
              Loading table status...
            </div>
          ) : data.tables.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#8A817B]">
              No active tables found.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 2xl:grid-cols-2">
              {data.tables.map((table) => (
                <div
                  key={table.id || table.number}
                  className={`rounded-lg border p-3 transition ${
                    table.status === "Occupied"
                      ? "border-[#EAC6B2] bg-[#FCF4EF]"
                      : "border-[#D1E0CD] bg-[#F4F8F2]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Grid3X3
                      size={16}
                      className={
                        table.status === "Occupied"
                          ? "text-[#C65D35]"
                          : "text-[#4F6D49]"
                      }
                    />

                    <span
                      className={`h-2 w-2 rounded-full ${
                        table.status === "Occupied"
                          ? "bg-[#C65D35]"
                          : "bg-[#4F6D49]"
                      }`}
                    />
                  </div>

                  <h3 className="mt-2.5 text-sm font-bold text-[#29231F]">
                    {table.number}
                  </h3>

                  <p className="mt-0.5 text-[11px] font-medium text-[#78716C]">
                    {table.status}
                  </p>

                  <p className="mt-0.5 text-[11px] text-[#8A817B]">
                    {table.orders} Active {table.orders === 1 ? "Order" : "Orders"}
                  </p>
                </div>
              ))}
            </div>
          )}

          <Link
            to="/tables"
            className="mt-4 inline-flex w-full items-center justify-center gap-1 text-center text-xs font-semibold text-[#C65D35] transition hover:text-[#A94B2B]"
          >
            <span>Manage All Tables</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
