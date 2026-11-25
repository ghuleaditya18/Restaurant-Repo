import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ShoppingCart,
  IndianRupee,
  Clock,
  Receipt,
  AlertTriangle,
  Users,
  UserCog,
  UtensilsCrossed,
  Grid3X3,
  Plus,
  RefreshCw,
  ArrowRight,
  RotateCcw,
  ShieldAlert,
  ServerCrash,
  WifiOff,
  Package,
  PackageX,
} from "lucide-react";

import StatCard from "../components/StatCard";
import RecentOrders from "../components/RecentOrders";
import DateFilter from "../components/DateFilter";
import PageHeader from "../components/PageHeader";
import AlertBanner from "../components/AlertBanner";
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
    <div className="space-y-4">
      {/* A1 Standard PageHeader */}
      <PageHeader
        title="Dashboard"
        description={`Live operations, metrics, and dining activity for ${periodLabel}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <DateFilter
              selectedPreset={dateFilter.preset}
              startDate={dateFilter.startDate}
              endDate={dateFilter.endDate}
              onChange={(newFilter) => setDateFilter(newFilter)}
            />

            <Link
              to="/orders"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] px-4 text-xs font-bold text-[#0D1420] shadow-xs transition hover:brightness-105 cursor-pointer"
            >
              <Plus size={16} />
              <span>Create Order</span>
            </Link>

            <button
              type="button"
              onClick={loadDashboard}
              disabled={loading}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] text-stone-700 dark:text-[#8A9AB2] shadow-xs transition hover:bg-stone-50 dark:hover:bg-[#151D29] disabled:opacity-60 cursor-pointer"
              title="Refresh Dashboard Data"
              aria-label="Refresh Dashboard Data"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        }
      />

      {/* ERROR BANNER WHEN EXISTING DATA IS PRESENT */}
      {errorInfo && data && (
        <AlertBanner
          type="error"
          message={errorInfo.message}
          action={
            <button
              type="button"
              onClick={loadDashboard}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-red-700 transition cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>Retry</span>
            </button>
          }
        />
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
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] px-5 py-2.5 text-sm font-bold text-[#0D1420] shadow-xs hover:opacity-95 transition cursor-pointer"
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
                className="h-28 rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-5 shadow-xs animate-pulse"
              />
            ))}
          </div>
          <div className="h-44 rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-5 shadow-xs animate-pulse" />
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

            <section className="grid grid-cols-2 gap-2.5 sm:gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title={`Orders (${periodLabel})`}
                value={String(stats.total_orders).padStart(2, "0")}
                description={
                  stats.completed_orders > 0
                    ? `${stats.completed_orders} completed in this period`
                    : "Total orders recorded"
                }
                icon={ShoppingCart}
                color="bg-[#FFF7E8] dark:bg-[#30251C] text-[#9A3412] dark:text-[#FFB02E] border border-[#FFEDD5] dark:border-[#9A3412]/40"
              />

              <StatCard
                title={`Revenue (${periodLabel})`}
                value={formattedRevenue}
                description="Net invoiced period revenue"
                icon={IndianRupee}
                color="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
              />

              <StatCard
                title="Active Orders"
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
                title="Pending Bills"
                value={String(stats.pending_payments).padStart(2, "0")}
                description="Unsettled customer invoices"
                icon={Receipt}
                color="bg-orange-50 dark:bg-orange-950/40 text-orange-800 dark:text-orange-200 border border-orange-200 dark:border-orange-800"
              />
            </section>
          </div>

          {/* RESTAURANT CAPACITY & RESOURCES */}
          <div>
            <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Restaurant Capacity & Resources
            </h2>

            <section className="grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-4">
              <StatCard
                layout="horizontal"
                title="Customers"
                value={stats.total_customers}
                icon={Users}
                color="bg-[#FFF7E8] dark:bg-[#30251C] text-[#9A3412] dark:text-[#FFB02E] border border-[#FFEDD5] dark:border-[#9A3412]/40"
              />

              <StatCard
                layout="horizontal"
                title="Staff Members"
                value={stats.total_staff}
                icon={UserCog}
                color="bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700"
              />

              <StatCard
                layout="horizontal"
                title="Menu Items"
                value={stats.total_menu_items}
                icon={UtensilsCrossed}
                color="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
              />

              <StatCard
                layout="horizontal"
                title="Dining Tables"
                value={stats.total_tables}
                icon={Grid3X3}
                color="bg-yellow-50 dark:bg-yellow-950/40 text-yellow-800 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800"
              />
            </section>
          </div>

          {/* INVENTORY HEALTH & STOCK OVERVIEW */}
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Inventory Health & Stock
              </h2>
              <Link
                to="/inventory"
                className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition"
              >
                <span>Manage Inventory</span>
                <ArrowRight size={13} />
              </Link>
            </div>

            <section className="grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-4">
              <StatCard
                layout="horizontal"
                title="Stock Items"
                value={stats.total_inventory_items || 0}
                icon={Package}
                color="bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
              />

              <StatCard
                layout="horizontal"
                title="Low Stock"
                value={stats.low_stock_items_count || 0}
                icon={AlertTriangle}
                color="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
              />

              <StatCard
                layout="horizontal"
                title="Out of Stock"
                value={stats.out_of_stock_items_count || 0}
                icon={PackageX}
                color="bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
              />

              <StatCard
                layout="horizontal"
                title="Valuation"
                value={formatCurrency(stats.total_inventory_valuation || 0)}
                icon={IndianRupee}
                color="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
              />
            </section>
          </div>

          {/* Main Content: Recent Orders and Live Table Status */}
          <section className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <RecentOrders orders={data.recent_orders} loading={loading} />
            </div>

            {/* Live Table Status */}
            <div className="rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-4 shadow-xs">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">Live Table Status</h2>
                    <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      Live
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500 dark:text-[#8A9AB2]">
                    Seating occupancy & active orders
                  </p>
                </div>

                <div className="rounded-lg border border-[#E5E9F0] dark:border-[#1E293B] bg-stone-50 dark:bg-[#151D29] px-2.5 py-1 text-[11px]">
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
                            : "border-[#E5E9F0] dark:border-[#1E293B] bg-stone-50/50 dark:bg-[#151D29]/50"
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

                        <h3 className="mt-2.5 text-sm font-bold text-stone-900 dark:text-stone-100">
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
