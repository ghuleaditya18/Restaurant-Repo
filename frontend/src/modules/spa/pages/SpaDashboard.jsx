import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  Sparkles,
  Users,
  UserCheck,
  CreditCard,
  RefreshCw,
  Plus,
  ArrowRight,
  TrendingUp,
  Receipt,
} from "lucide-react";
import spaApi from "../services/spaApi";
import { BookingStatusBadge } from "../components/StatusBadges";
import { formatTimeRange12Hour } from "../utils/timeFormat";
import PageHeader from "../../../components/PageHeader";
import AlertBanner from "../../../components/AlertBanner";
import StatCard from "../../../components/StatCard";
import { CARD_STYLES } from "../../../utils/themeTokens";

function formatCurrency(val) {
  const num = Number(val || 0);
  return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SpaDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await spaApi.getDashboardSummary();
      setData(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to load Spa dashboard metrics. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const schedule = data?.today_schedule || [];

  return (
    <div className="space-y-4">
      {/* A1 Standard PageHeader */}
      <PageHeader
        title="Dashboard"
        actions={
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={fetchSummary}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 transition cursor-pointer shadow-xs disabled:opacity-50"
              title="Refresh metrics"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>

            <Link
              to="/spa/bookings?action=new"
              className="flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-bold rounded-xl bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold hover:opacity-95 transition shadow-xs cursor-pointer"
            >
              <Plus size={16} />
              <span>Book Appointment</span>
            </Link>
          </div>
        }
      />

      {error && (
        <AlertBanner
          type="error"
          message={error}
          action={
            <button
              type="button"
              onClick={fetchSummary}
              className="text-xs underline font-semibold cursor-pointer"
            >
              Retry
            </button>
          }
        />
      )}

      {/* UNIFIED KPI METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 w-full">
        <StatCard
          compact
          title="Today's Bookings"
          value={loading ? "--" : String(data?.total_bookings_today || 0).padStart(2, "0")}
          icon={Calendar}
          color="amber"
          onClick={() => navigate("/spa/bookings")}
        />

        <StatCard
          compact
          title="Upcoming Bookings"
          value={loading ? "--" : String(data?.upcoming_bookings || 0).padStart(2, "0")}
          icon={CalendarClock}
          color="sky"
          onClick={() => navigate("/spa/bookings?tab=booked")}
        />

        <StatCard
          compact
          title="In-Progress"
          value={loading ? "--" : String(data?.in_progress_appointments || 0).padStart(2, "0")}
          icon={Clock}
          color="orange"
          onClick={() => navigate("/spa/bookings")}
        />

        <StatCard
          compact
          title="Completed Today"
          value={loading ? "--" : String(data?.completed_appointments_today || 0).padStart(2, "0")}
          icon={CheckCircle2}
          color="emerald"
          onClick={() => navigate("/spa/bookings")}
        />

        <StatCard
          compact
          title="Available Therapists"
          value={loading ? "--" : `${data?.available_therapists || 0}/${data?.total_therapists || 0}`}
          icon={UserCheck}
          color="sky"
          onClick={() => navigate("/spa/staff")}
        />

        <StatCard
          compact
          title="Active Services"
          value={loading ? "--" : data?.active_services || 0}
          icon={Sparkles}
          color="indigo"
          onClick={() => navigate("/spa/services")}
        />

        <StatCard
          compact
          title="Spa Customers"
          value={loading ? "--" : data?.total_customers || 0}
          icon={Users}
          color="amber"
          onClick={() => navigate("/spa/customers")}
        />

        <StatCard
          compact
          title="Today's Revenue"
          value={loading ? "--" : formatCurrency(data?.today_revenue)}
          icon={TrendingUp}
          color="emerald"
          onClick={() => navigate("/spa/invoices")}
        />

        <StatCard
          compact
          title="Pending Invoices"
          value={loading ? "--" : data?.pending_payments_count || 0}
          icon={Receipt}
          color="amber"
          onClick={() => navigate("/spa/invoices")}
        />

        <StatCard
          compact
          title="Outstanding Due"
          value={loading ? "--" : formatCurrency(data?.outstanding_balance)}
          icon={CreditCard}
          color={Number(data?.outstanding_balance || 0) > 0 ? "rose" : "emerald"}
          onClick={() => navigate("/spa/invoices")}
        />
      </div>

      {/* QUICK ACTIONS (4 PRIORITIZED TABS) */}
      <div className={`${CARD_STYLES.base} !p-3.5`}>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-sm font-bold text-[#172033] dark:text-[#F8FAFC]">
            Quick Actions
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Manage Bookings", path: "/spa/bookings", icon: Calendar },
            { label: "Spa Services", path: "/spa/services", icon: Sparkles },
            { label: "Therapists", path: "/spa/staff", icon: UserCheck },
            { label: "Invoices & Billing", path: "/spa/invoices", icon: Receipt },
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

      {/* Today's Schedule Table */}
      <div className="rounded-xl bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-[#F59E0B]" />
            <h2 className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100">
              Today's Appointment Schedule
            </h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
              {schedule.length}
            </span>
          </div>

          <Link
            to="/spa/bookings"
            className="text-xs font-semibold text-[#9A3412] hover:text-[#78350F] dark:text-[#FFB02E] dark:hover:text-[#FCD34D] flex items-center gap-1 transition"
          >
            <span>View All Bookings</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-stone-400">
            <RefreshCw size={22} className="animate-spin mx-auto mb-2 text-[#F59E0B]" />
            Loading today's schedule...
          </div>
        ) : schedule.length === 0 ? (
          <div className="p-8 text-center text-stone-400">
            <Calendar size={30} className="mx-auto mb-2 text-stone-300 dark:text-stone-700" />
            <p className="text-sm font-semibold text-stone-600 dark:text-stone-300">
              No appointments scheduled for today.
            </p>
            <p className="text-xs text-stone-400 mt-1">
              Click &quot;Book Appointment&quot; above to schedule a treatment.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-stone-50 dark:bg-stone-800/60 text-stone-500 dark:text-stone-400 text-[11px] uppercase tracking-wider border-b border-stone-200 dark:border-stone-800">
                <tr>
                  <th className="py-2.5 px-3.5">Time</th>
                  <th className="py-2.5 px-3.5">Booking Ref</th>
                  <th className="py-2.5 px-3.5">Customer</th>
                  <th className="py-2.5 px-3.5">Therapist</th>
                  <th className="py-2.5 px-3.5">Services</th>
                  <th className="py-2.5 px-3.5">Est. Total</th>
                  <th className="py-2.5 px-3.5">Status</th>
                  <th className="py-2.5 px-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800 text-stone-700 dark:text-stone-200">
                {schedule.map((b) => (
                  <tr
                    key={b.id}
                    className="hover:bg-stone-50/60 dark:hover:bg-stone-800/40 transition cursor-pointer"
                    onClick={() => navigate(`/spa/bookings?id=${b.id}`)}
                  >
                    <td className="py-2.5 px-3.5 font-bold text-stone-900 dark:text-stone-100 whitespace-nowrap">
                      {formatTimeRange12Hour(b.start_time, b.end_time)}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono font-medium text-xs text-stone-600 dark:text-stone-300">
                      {b.booking_number}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <div className="font-semibold text-stone-900 dark:text-stone-100">{b.customer_name}</div>
                      <div className="text-xs text-stone-400">{b.customer_phone}</div>
                    </td>
                    <td className="py-2.5 px-3.5 font-medium text-stone-800 dark:text-stone-200">
                      {b.therapist_name}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <div className="max-w-[200px] truncate text-xs text-stone-600 dark:text-stone-300">
                        {b.booking_services.map((s) => s.service_name).join(", ")}
                      </div>
                    </td>
                    <td className="py-2.5 px-3.5 font-bold text-stone-900 dark:text-stone-100">
                      {formatCurrency(b.estimated_total)}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <BookingStatusBadge status={b.status} />
                    </td>
                    <td className="py-2.5 px-3.5 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/spa/bookings?id=${b.id}`);
                        }}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 transition cursor-pointer"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
