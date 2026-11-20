import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ShoppingBag,
  IndianRupee,
  Clock,
  AlertCircle,
  AlertTriangle,
  Users,
  UserCheck,
  UtensilsCrossed,
  Grid3X3,
  Plus,
  RefreshCw,
  ArrowRight,
  RotateCcw,
  ShieldAlert,
  ServerCrash,
  WifiOff,
} from "lucide-react";

import StatCard from "../components/StatCard";
import RecentOrders from "../components/RecentOrders";
import DateFilter from "../components/DateFilter";
import { getDashboardSummary } from "../services/dashboardService";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorInfo, setErrorInfo] = useState(null);

  const [dateFilter, setDateFilter] = useState({
    preset: "today",
    startDate: "",
    endDate: "",
  });

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setErrorInfo(null);

    try {
      const summary = await getDashboardSummary({
        preset: dateFilter.preset,
        start_date: dateFilter.startDate || undefined,
        end_date: dateFilter.endDate || undefined,
      });
      setData(summary);
      setErrorInfo(null);
    } catch (err) {
      console.error("Dashboard metrics request failed:", err);
      let message = "Failed to load dashboard metrics. Please refresh.";
      let category = "api";

      const status = err?.response?.status;
      if (status === 401) {
        message = "Your authentication session has expired. Please sign in again.";
        category = "auth";
      } else if (status === 403) {
        message = "Access restricted: Receptionist or Manager privileges required.";
        category = "auth";
      } else if (status >= 500) {
        message = "Database or server error encountered while computing dashboard statistics.";
        category = "database";
      } else if (err?.code === "ERR_NETWORK" || err?.message?.includes("Network Error")) {
        message = "Unable to connect to the backend server. Please verify the API service is running.";
        category = "network";
      } else if (err?.response?.data?.detail) {
        message =
          typeof err.response.data.detail === "string"
            ? err.response.data.detail
            : "API validation error loading metrics.";
      }

      setErrorInfo({ message, category });
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const stats = data?.statistics;

  const formattedRevenue = useMemo(() => {
    if (!stats) return "₹0.00";
    return formatCurrency(stats.total_revenue);
  }, [stats]);

  const periodLabel = stats?.date_filter_label || "Today";

  return (
    <div className="space-y-6">
      {/* Welcome & Filter Section */}
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1C1917] dark:text-stone-100 sm:text-3xl">
            Operational Overview
          </h1>

          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400 sm:text-sm">
            Live operations, metrics, and dining activity for{" "}
            <span className="font-semibold text-stone-800 dark:text-stone-200">{periodLabel}</span>.
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
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#F5B716] px-4 text-xs font-bold text-[#1C1917] shadow-xs transition hover:bg-[#E5A910] cursor-pointer"
          >
            <Plus size={16} />
            <span>Create Order</span>
          </Link>

          <button
            type="button"
            onClick={loadDashboard}
            disabled={loading}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1C1917] text-stone-700 dark:text-stone-300 shadow-xs transition hover:bg-stone-50 dark:hover:bg-stone-800 disabled:opacity-60 cursor-pointer"
            title="Refresh Dashboard Data"
            aria-label="Refresh Dashboard Data"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </section>

      {/* ERROR BANNER WHEN EXISTING DATA IS PRESENT */}
      {errorInfo && data && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-xs font-medium text-red-700 dark:text-red-300">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="shrink-0 text-red-600 dark:text-red-400" />
            <span>{errorInfo.message}</span>
          </div>
          <button
            type="button"
            onClick={loadDashboard}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-red-700 transition cursor-pointer"
          >
            <RotateCcw size={13} />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* DEDICATED FULL ERROR STATE (WHEN NO DATA COULD BE LOADED) */}
      {errorInfo && !data && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900/80 bg-red-50/50 dark:bg-red-950/20 p-8 sm:p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 mb-4">
            {errorInfo.category === "auth" ? (
              <ShieldAlert size={28} />
            ) : errorInfo.category === "database" ? (
              <ServerCrash size={28} />
            ) : errorInfo.category === "network" ? (
              <WifiOff size={28} />
            ) : (
              <AlertTriangle size={28} />
            )}
          </div>

          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
            Failed to Load Dashboard Metrics
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
            {errorInfo.message}
          </p>

          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={loadDashboard}
              className="inline-flex items-center gap-2 rounded-lg bg-[#F5B716] px-5 py-2.5 text-sm font-bold text-[#1C1917] shadow-xs hover:bg-[#E5A910] transition cursor-pointer"
            >
              <RotateCcw size={16} />
              <span>Retry Request</span>
            </button>
          </div>
        </div>
      )}

      {/* SKELETON LOADING STATE (FIRST LOAD) */}
      {loading && !data && !errorInfo && (
        <div className="space-y-6">
          <div className="h-6 w-48 rounded-md bg-stone-200 dark:bg-stone-800 animate-pulse" />
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-28 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1C1917] p-5 shadow-xs animate-pulse"
              />
            ))}
          </div>
          <div className="h-44 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1C1917] p-5 shadow-xs animate-pulse" />
        </div>
      )}

      {/* POPULATED DATA VIEW */}
      {data && stats && (
        <>
          {/* PERIOD-SPECIFIC METRICS */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Period Performance ({periodLabel})
              </h2>
              <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                Live Aggregation
              </span>
            </div>

            <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title={`Orders (${periodLabel})`}
                value={String(stats.total_orders).padStart(2, "0")}
                description={
                  stats.completed_orders > 0
                    ? `${stats.completed_orders} completed in this period`
                    : "Total orders recorded"
                }
                icon={ShoppingBag}
                color="bg-[#FEF9C3] dark:bg-[#713F12]/40 text-amber-900 dark:text-amber-200 border border-yellow-200 dark:border-amber-800"
              />

              <StatCard
                title={`Revenue (${periodLabel})`}
                value={formattedRevenue}
                description="Net invoiced period revenue"
                icon={IndianRupee}
                color="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
              />

              <StatCard
                title="Active Dining Orders"
                value={String(stats.active_orders).padStart(2, "0")}
                description={
                  stats.preparing_orders > 0
                    ? `${stats.preparing_orders} in kitchen preparation`
                    : "Live orders in service"
                }
                icon={Clock}
                color="bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
              />

              <StatCard
                title="Pending Payments"
                value={String(stats.pending_payments).padStart(2, "0")}
                description="Unsettled customer invoices"
                icon={AlertCircle}
                color="bg-orange-50 dark:bg-orange-950/40 text-orange-800 dark:text-orange-200 border border-orange-200 dark:border-orange-800"
              />
            </section>
          </div>

          {/* RESTAURANT CAPACITY & RESOURCES */}
          <div>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Restaurant Capacity & Resources
            </h2>

            <section className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
              <div className="flex items-center gap-3.5 rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-[#1C1917] p-4 shadow-xs">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FEF9C3] dark:bg-[#713F12]/40 text-amber-900 dark:text-amber-200 border border-yellow-200 dark:border-amber-800">
                  <Users size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-stone-500 dark:text-stone-400 font-medium">Customers</p>
                  <p className="text-lg font-bold text-stone-900 dark:text-stone-100">{stats.total_customers}</p>
                </div>
              </div>

              <div className="flex items-center gap-3.5 rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-[#1C1917] p-4 shadow-xs">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700">
                  <UserCheck size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-stone-500 dark:text-stone-400 font-medium">Staff Members</p>
                  <p className="text-lg font-bold text-stone-900 dark:text-stone-100">{stats.total_staff}</p>
                </div>
              </div>

              <div className="flex items-center gap-3.5 rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-[#1C1917] p-4 shadow-xs">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800">
                  <UtensilsCrossed size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-stone-500 dark:text-stone-400 font-medium">Menu Items</p>
                  <p className="text-lg font-bold text-stone-900 dark:text-stone-100">{stats.total_menu_items}</p>
                </div>
              </div>

              <div className="flex items-center gap-3.5 rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-[#1C1917] p-4 shadow-xs">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-yellow-50 dark:bg-yellow-950/40 text-yellow-800 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800">
                  <Grid3X3 size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-stone-500 dark:text-stone-400 font-medium">Dining Tables</p>
                  <p className="text-lg font-bold text-stone-900 dark:text-stone-100">{stats.total_tables}</p>
                </div>
              </div>
            </section>
          </div>

          {/* Main Content: Recent Orders and Live Table Status */}
          <section className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <RecentOrders orders={data.recent_orders} loading={loading} />
            </div>

            {/* Live Table Status */}
            <div className="rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-[#1C1917] p-5 shadow-xs">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-[#1C1917] dark:text-stone-100">Live Table Status</h2>
                    <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      Live
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                    Seating occupancy & active orders
                  </p>
                </div>

                <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-850 px-2.5 py-1 text-[11px]">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {stats.available_tables} Available
                  </span>
                  <span className="mx-1 text-stone-300 dark:text-stone-600">•</span>
                  <span className="font-semibold text-amber-700 dark:text-amber-400">
                    {stats.occupied_tables} Occupied
                  </span>
                </div>
              </div>

              {data.tables.length === 0 ? (
                <div className="py-10 text-center text-xs text-stone-500 dark:text-stone-400">
                  No active tables found.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-2">
                  {data.tables.map((table) => {
                    const isOccupied = table.status === "Occupied";
                    return (
                      <div
                        key={table.id || table.number}
                        className={`rounded-lg border p-3 transition ${
                          isOccupied
                            ? "border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/40"
                            : "border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-850/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <Grid3X3
                            size={16}
                            className={
                              isOccupied
                                ? "text-amber-700 dark:text-amber-400"
                                : "text-emerald-600 dark:text-emerald-400"
                            }
                          />

                          <span
                            className={`h-2 w-2 rounded-full ${
                              isOccupied ? "bg-amber-500" : "bg-emerald-500"
                            }`}
                          />
                        </div>

                        <h3 className="mt-2.5 text-sm font-bold text-[#1C1917] dark:text-stone-100">
                          {table.number}
                        </h3>

                        <p
                          className={`mt-0.5 text-[11px] font-semibold ${
                            isOccupied
                              ? "text-amber-800 dark:text-amber-300"
                              : "text-emerald-700 dark:text-emerald-300"
                          }`}
                        >
                          {table.status}
                        </p>

                        <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
                          {table.orders} Active {table.orders === 1 ? "Order" : "Orders"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              <Link
                to="/tables"
                className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-850 py-2 text-center text-xs font-semibold text-stone-700 dark:text-stone-300 transition hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100"
              >
                <span>Manage All Dining Tables</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default Dashboard;
