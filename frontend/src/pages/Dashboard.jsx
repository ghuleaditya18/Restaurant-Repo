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
} from "lucide-react";
import { Link } from "react-router-dom";

import StatCard from "../components/StatCard";
import RecentOrders from "../components/RecentOrders";
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
};

function Dashboard() {
  const [data, setData] = useState({
    statistics: INITIAL_STATISTICS,
    recent_orders: [],
    tables: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await getDashboardSummary();
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
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const stats = data.statistics;

  return (
    <div>
      {/* Welcome Section */}
      <section className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[1.5px] text-[#C65D35]">
            Restaurant Management
          </p>

          <h1 className="text-2xl font-bold leading-tight text-[#29231F] md:text-[26px]">
            Welcome Back, Manager
          </h1>

          <p className="mt-1 text-xs text-[#8A817B] sm:text-sm">
            Manage your restaurant operations efficiently.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadDashboard}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#E9E3DA] bg-white px-3.5 text-xs font-semibold text-[#29231F] shadow-xs transition hover:bg-[#FAF9F6] disabled:opacity-60 sm:text-sm"
            title="Refresh Dashboard Data"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>

          <Link
            to="/orders"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#C65D35] px-4 text-xs font-semibold text-white shadow-xs transition hover:bg-[#A94B2B] sm:text-sm"
          >
            <Plus size={17} />
            <span>Create Order</span>
          </Link>
        </div>
      </section>

      {/* Error alert */}
      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Statistics */}
      <section className="mb-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Orders"
          value={loading ? "..." : String(stats.total_orders).padStart(2, "0")}
          description={
            loading
              ? "Fetching orders..."
              : `${stats.pending_orders} Pending • ${stats.preparing_orders} Preparing • ${stats.completed_orders} Completed`
          }
          icon={ShoppingBag}
          color="bg-[#F8EAE1] text-[#C65D35]"
        />

        <StatCard
          title="Total Customers"
          value={
            loading ? "..." : String(stats.total_customers).padStart(2, "0")
          }
          description="Registered dining customers"
          icon={Users}
          color="bg-[#F4ECE6] text-[#6E584B]"
        />

        <StatCard
          title="Total Staff"
          value={loading ? "..." : String(stats.total_staff).padStart(2, "0")}
          description="Active restaurant staff"
          icon={UserCheck}
          color="bg-[#F6EFE5] text-[#8C6438]"
        />

        <StatCard
          title="Total Menu Items"
          value={
            loading ? "..." : String(stats.total_menu_items).padStart(2, "0")
          }
          description="Available food & beverages"
          icon={UtensilsCrossed}
          color="bg-[#EEF3EA] text-[#4F6D49]"
        />
      </section>

      {/* Main Content */}
      <section className="grid grid-cols-1 items-start gap-5 2xl:grid-cols-3">
        <div className="2xl:col-span-2">
          <RecentOrders orders={data.recent_orders} loading={loading} />
        </div>

        {/* Table Status */}
        <div className="rounded-xl border border-[#E9E3DA] bg-white p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#29231F]">Table Status</h2>

              <p className="mt-0.5 text-xs text-[#8A817B]">
                Current table availability
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
                    {table.orders} Active Orders
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
