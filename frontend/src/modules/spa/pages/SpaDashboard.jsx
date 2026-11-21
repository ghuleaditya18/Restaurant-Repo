import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Calendar,
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
    <div className="space-y-6">
      {/* A1 Standard PageHeader */}
      <PageHeader
        title="Spa Dashboard"
        description="Real-time appointment schedule, therapist capacity, and service revenues."
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
              className="flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-bold rounded-xl bg-[#F5B716] hover:bg-[#E5A910] text-[#1C1917] transition shadow-xs cursor-pointer"
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

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Today's Bookings */}
        <div className="p-2.5 sm:p-3.5 md:p-4 rounded-xl bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 shadow-xs flex flex-col justify-between min-h-[82px] sm:min-h-[88px]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400 truncate">
              Today's Bookings
            </span>
            <span className="p-1.5 sm:p-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-[#F5B716] shrink-0">
              <Calendar size={16} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-1">
            <span className="text-lg sm:text-xl md:text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-100">
              {loading ? "--" : String(data?.total_bookings_today || 0).padStart(2, "0")}
            </span>
            <span className="text-[10px] sm:text-xs font-semibold text-emerald-600 dark:text-emerald-400 truncate">
              {data?.completed_appointments_today || 0} done
            </span>
          </div>
        </div>

        {/* In Progress Appointments */}
        <div className="p-2.5 sm:p-3.5 md:p-4 rounded-xl bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 shadow-xs flex flex-col justify-between min-h-[82px] sm:min-h-[88px]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400 truncate">
              In-Progress
            </span>
            <span className="p-1.5 sm:p-2 rounded-lg bg-orange-50 dark:bg-orange-950/50 text-[#F97316] shrink-0">
              <Clock size={16} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-1">
            <span className="text-lg sm:text-xl md:text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-100">
              {loading ? "--" : String(data?.in_progress_appointments || 0).padStart(2, "0")}
            </span>
            <span className="text-[10px] sm:text-xs text-stone-500 dark:text-stone-400 truncate">
              {data?.upcoming_bookings || 0} upcoming
            </span>
          </div>
        </div>

        {/* Available Therapists */}
        <div className="p-2.5 sm:p-3.5 md:p-4 rounded-xl bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 shadow-xs flex flex-col justify-between min-h-[82px] sm:min-h-[88px]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400 truncate">
              Available Therapists
            </span>
            <span className="p-1.5 sm:p-2 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 shrink-0">
              <UserCheck size={16} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-1">
            <span className="text-lg sm:text-xl md:text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-100">
              {loading ? "--" : `${data?.available_therapists || 0}/${data?.total_therapists || 0}`}
            </span>
            <span className="text-[10px] sm:text-xs text-stone-500 dark:text-stone-400 truncate">on duty</span>
          </div>
        </div>

        {/* Today's Revenue */}
        <div className="p-2.5 sm:p-3.5 md:p-4 rounded-xl bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 shadow-xs flex flex-col justify-between min-h-[82px] sm:min-h-[88px]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400 truncate">
              Today's Revenue
            </span>
            <span className="p-1.5 sm:p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 shrink-0">
              <TrendingUp size={16} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-1">
            <span className="text-base sm:text-lg md:text-xl font-semibold tabular-nums text-stone-900 dark:text-stone-100 truncate">
              {loading ? "--" : formatCurrency(data?.today_revenue)}
            </span>
            <span className="text-[10px] sm:text-xs text-orange-600 dark:text-orange-400 font-medium truncate">
              {data?.pending_payments_count || 0} pending
            </span>
          </div>
        </div>
      </div>

      {/* Secondary Resource Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200/70 dark:border-stone-700/60 text-xs">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-stone-400 shrink-0" />
          <span className="text-stone-500 dark:text-stone-400">Total Spa Customers:</span>
          <span className="font-bold text-stone-900 dark:text-stone-100">{data?.total_customers || 0}</span>
        </div>
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-stone-400 shrink-0" />
          <span className="text-stone-500 dark:text-stone-400">Active Services:</span>
          <span className="font-bold text-stone-900 dark:text-stone-100">{data?.active_services || 0}</span>
        </div>
        <div className="flex items-center gap-2">
          <Receipt size={16} className="text-stone-400 shrink-0" />
          <span className="text-stone-500 dark:text-stone-400">Pending Invoices:</span>
          <span className="font-bold text-amber-600 dark:text-amber-400">{data?.pending_payments_count || 0}</span>
        </div>
        <div className="flex items-center gap-2">
          <CreditCard size={16} className="text-stone-400 shrink-0" />
          <span className="text-stone-500 dark:text-stone-400">Outstanding Due:</span>
          <span className="font-bold text-orange-600 dark:text-orange-400">{formatCurrency(data?.outstanding_balance)}</span>
        </div>
      </div>

      {/* Today's Schedule Table */}
      <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-[#F5B716]" />
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
              Today's Appointment Schedule
            </h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
              {schedule.length}
            </span>
          </div>

          <Link
            to="/spa/bookings"
            className="text-xs font-semibold text-[#F5B716] hover:text-[#E5A910] flex items-center gap-1 transition"
          >
            <span>View All Bookings</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-stone-400">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-[#F5B716]" />
            Loading today's schedule...
          </div>
        ) : schedule.length === 0 ? (
          <div className="p-12 text-center text-stone-400">
            <Calendar size={32} className="mx-auto mb-2 text-stone-300 dark:text-stone-700" />
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
              <thead className="bg-stone-50 dark:bg-stone-800/60 text-stone-500 dark:text-stone-400 text-xs uppercase tracking-wider border-b border-stone-200 dark:border-stone-800">
                <tr>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Booking Ref</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Therapist</th>
                  <th className="py-3 px-4">Services</th>
                  <th className="py-3 px-4">Est. Total</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800 text-stone-700 dark:text-stone-200">
                {schedule.map((b) => (
                  <tr
                    key={b.id}
                    className="hover:bg-stone-50/60 dark:hover:bg-stone-800/40 transition cursor-pointer"
                    onClick={() => navigate(`/spa/bookings?id=${b.id}`)}
                  >
                    <td className="py-3.5 px-4 font-bold text-stone-900 dark:text-stone-100 whitespace-nowrap">
                      {formatTimeRange12Hour(b.start_time, b.end_time)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-xs text-stone-600 dark:text-stone-300">
                      {b.booking_number}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-stone-900 dark:text-stone-100">{b.customer_name}</div>
                      <div className="text-xs text-stone-400">{b.customer_phone}</div>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-stone-800 dark:text-stone-200">
                      {b.therapist_name}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="max-w-[200px] truncate text-xs text-stone-600 dark:text-stone-300">
                        {b.booking_services.map((s) => s.service_name).join(", ")}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-stone-900 dark:text-stone-100">
                      {formatCurrency(b.estimated_total)}
                    </td>
                    <td className="py-3.5 px-4">
                      <BookingStatusBadge status={b.status} />
                    </td>
                    <td className="py-3.5 px-4 text-right">
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
