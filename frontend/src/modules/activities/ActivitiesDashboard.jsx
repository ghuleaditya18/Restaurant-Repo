import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity as ActivityIcon,
  ArrowRight,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Compass,
  IndianRupee,
  Plus,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import PageHeader from "../../components/PageHeader";
import StatCard from "../../components/StatCard";
import StatusBadge from "../../components/StatusBadge";
import { BUTTON_VARIANTS, CARD_STYLES } from "../../utils/themeTokens";
import VillaDataTable from "../villas/VillaDataTable";
import {
  actDate,
  actError,
  activitiesApi,
  actMoney,
  actTime,
  bookingTypeLabel,
} from "./activitiesApi";

export default function ActivitiesDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessPage, setSessPage] = useState(1);
  const [bkPage, setBkPage] = useState(1);
  const tablePageSize = 8;

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await activitiesApi.dashboard();
      setData(res.data);
      setSessPage(1);
      setBkPage(1);
    } catch (err) {
      setError(actError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const stats = data?.statistics || {};
  const todaysSessionsAll = data?.todays_sessions || [];
  const upcomingBookingsAll = data?.upcoming_bookings || [];
  const sessTotalPages = Math.max(1, Math.ceil(todaysSessionsAll.length / tablePageSize));
  const bkTotalPages = Math.max(1, Math.ceil(upcomingBookingsAll.length / tablePageSize));
  const pagedTodaysSessions = todaysSessionsAll.slice(
    (sessPage - 1) * tablePageSize,
    sessPage * tablePageSize
  );
  const pagedUpcomingBookings = upcomingBookingsAll.slice(
    (bkPage - 1) * tablePageSize,
    bkPage * tablePageSize
  );

  const todaysSessionColumns = [
    {
      key: "activity_name",
      label: "Activity",
      render: (s) => (
        <div className="min-w-[150px]">
          <div className="font-semibold text-[#172033] dark:text-[#F8FAFC]">
            {s.activity_name}
          </div>
          {s.location_name && (
            <div className="text-xs text-[#64748B] dark:text-[#8A9AB2]">
              {s.location_name}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "booking_type",
      label: "Booking Type",
      render: (s) => (
        <StatusBadge
          status={s.booking_type}
          label={bookingTypeLabel(s.booking_type)}
          size="sm"
        />
      ),
    },
    {
      key: "start_time",
      label: "Start Time",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (s) => actTime(s.start_time),
    },
    {
      key: "end_time",
      label: "End Time",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (s) => actTime(s.end_time),
    },
    {
      key: "assigned_staff_name",
      label: "Instructor",
      render: (s) =>
        s.assigned_staff_name ? (
          <span className="font-medium text-[#172033] dark:text-[#F8FAFC]">
            {s.assigned_staff_name}
          </span>
        ) : (
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
            Unassigned
          </span>
        ),
    },
    {
      key: "seats_booked",
      label: "Seats Booked",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums font-semibold",
      render: (s) => (
        <div className="inline-flex items-center gap-1.5">
          <span>{s.seats_booked}</span>
          {s.below_minimum && (
            <span
              title={`Below minimum (${s.min_participants})`}
              className="rounded-full bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300"
            >
              Min {s.min_participants}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "capacity",
      label: "Capacity",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (s) => `${s.capacity}`,
    },
    {
      key: "status",
      label: "Session Status",
      align: "center",
      render: (s) => (
        <div className="inline-flex items-center gap-1.5">
          <StatusBadge status={s.status} label={s.status} size="sm" />
          {s.is_full && s.status !== "Cancelled" && (
            <StatusBadge status="Full" label="Full" size="sm" />
          )}
        </div>
      ),
    },
  ];

  const upcomingBookingColumns = [
    {
      key: "booking_number",
      label: "Booking #",
      cellClassName: "whitespace-nowrap font-mono font-bold",
      render: (b) => b.booking_number,
    },
    {
      key: "customer_name",
      label: "Customer",
      render: (b) => (
        <div className="min-w-[140px]">
          <div className="font-semibold text-[#172033] dark:text-[#F8FAFC]">
            {b.customer_name}
          </div>
          <div className="text-xs text-[#64748B] dark:text-[#8A9AB2]">
            {b.customer_phone || "—"}
          </div>
        </div>
      ),
    },
    {
      key: "activity_name",
      label: "Activity",
      render: (b) => (
        <div className="min-w-[150px]">
          <div className="font-medium text-[#172033] dark:text-[#F8FAFC]">
            {b.activity_name}
          </div>
          <div className="text-xs text-[#64748B] dark:text-[#8A9AB2]">
            {bookingTypeLabel(b.booking_type)}
          </div>
        </div>
      ),
    },
    {
      key: "booking_date",
      label: "Booking Date",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (b) => actDate(b.slot_date || b.session_date || b.booking_date),
    },
    {
      key: "participant_count",
      label: "Participants",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums font-semibold",
      render: (b) => `${b.participant_count}`,
    },
    {
      key: "total_amount",
      label: "Amount",
      align: "right",
      cellClassName: "whitespace-nowrap font-semibold tabular-nums",
      render: (b) => actMoney(b.total_amount),
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
        title="Dashboard"
        description="Real-time activities catalogue, today's sessions, operational alerts, bookings, and daily revenue."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/activities/catalog?new=1")}
              className={BUTTON_VARIANTS.secondary}
            >
              <Plus size={15} />
              <span>Create Activity</span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/activities/bookings?new=1")}
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
          title="Unable to load dashboard"
          message={error}
          onDismiss={() => setError("")}
        />
      )}

      {/* 8 COMPACT KPI CARDS */}
      <div className="flex flex-wrap items-stretch gap-2.5 w-full">
        <StatCard
          compact
          className="!p-2.5 !w-auto flex-1 min-w-[180px] max-w-[245px]"
          title="Total Activities"
          value={loading ? "—" : stats.total_activities ?? 0}
          description="Configured activity catalog"
          icon={Compass}
          color="amber"
          onClick={() => navigate("/activities/catalog")}
        />
        <StatCard
          compact
          className="!p-2.5 !w-auto flex-1 min-w-[180px] max-w-[245px]"
          title="Active Activities"
          value={loading ? "—" : stats.active_activities ?? 0}
          description="Open for guests"
          icon={CheckCircle2}
          color="emerald"
          onClick={() => navigate("/activities/catalog?status=Active")}
        />
        <StatCard
          compact
          className="!p-2.5 !w-auto flex-1 min-w-[180px] max-w-[245px]"
          title="Sessions Today"
          value={loading ? "—" : stats.sessions_today ?? 0}
          description="Scheduled for today"
          icon={CalendarDays}
          color="sky"
          onClick={() => navigate("/activities/schedule")}
        />
        <StatCard
          compact
          className="!p-2.5 !w-auto flex-1 min-w-[180px] max-w-[245px]"
          title="Bookings Today"
          value={loading ? "—" : stats.bookings_today ?? 0}
          description="Active reservations today"
          icon={CalendarCheck2}
          color="indigo"
          onClick={() => navigate("/activities/bookings")}
        />
        <StatCard
          compact
          className="!p-2.5 !w-auto flex-1 min-w-[180px] max-w-[245px]"
          title="Upcoming Bookings"
          value={loading ? "—" : stats.upcoming_bookings ?? 0}
          description="Pending & confirmed ahead"
          icon={CalendarClock}
          color="sky"
          onClick={() => navigate("/activities/bookings")}
        />
        <StatCard
          compact
          className="!p-2.5 !w-auto flex-1 min-w-[180px] max-w-[245px]"
          title="Cancelled Today"
          value={loading ? "—" : stats.cancelled_today ?? 0}
          description="Cancelled reservations today"
          icon={XCircle}
          color="rose"
          onClick={() => navigate("/activities/bookings?status=Cancelled")}
        />
        <StatCard
          compact
          className="!p-2.5 !w-auto flex-1 min-w-[180px] max-w-[245px]"
          title="Participants Today"
          value={loading ? "—" : stats.total_participants_today ?? 0}
          description="Booked & walk-in guests"
          icon={Users}
          color="amber"
          onClick={() => navigate("/activities/roster")}
        />
        <StatCard
          compact
          className="!p-2.5 !w-auto flex-1 min-w-[180px] max-w-[245px]"
          title="Revenue Received Today"
          value={loading ? "—" : actMoney(stats.revenue_today)}
          description="Payments & walk-in fees"
          icon={IndianRupee}
          color="emerald"
          onClick={() => navigate("/activities/invoices")}
        />
      </div>

      {/* QUICK ACTIONS */}
      <div className={`${CARD_STYLES.base} !p-3 w-fit max-w-full`}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#64748B] dark:text-[#8A9AB2]">
            Quick Actions
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Create Activity", path: "/activities/catalog?new=1", icon: ActivityIcon },
            { label: "Add Session", path: "/activities/schedule?new=1", icon: Plus },
            { label: "New Booking", path: "/activities/bookings?new=1", icon: CalendarPlus },
            { label: "View Schedule", path: "/activities/schedule", icon: CalendarDays },
            { label: "View Session Roster", path: "/activities/roster", icon: UserCheck },
          ].map(({ label, path, icon: Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => navigate(path)}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#151D29] px-3 py-2 text-xs font-semibold text-[#172033] dark:text-[#F8FAFC] hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition cursor-pointer"
            >
              <Icon size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
              <span>{label}</span>
              <ArrowRight size={12} className="text-stone-400 shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* TODAY'S SESSIONS */}
      <VillaDataTable
        title="Today's Sessions"
        subtitle="Scheduled activity sessions operating today (Full is calculated from available capacity)"
        headerActions={
          <button
            type="button"
            onClick={() => navigate("/activities/schedule")}
            className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
          >
            View Full Schedule →
          </button>
        }
        columns={todaysSessionColumns}
        rows={pagedTodaysSessions}
        loading={loading}
        loadingMessage="Loading today's sessions..."
        emptyTitle="No sessions scheduled for today"
        emptyDescription="Create a session or generate sessions from a weekly schedule template."
        tableMinWidth="min-w-[860px]"
        onRowClick={(s) => navigate(`/activities/roster?sessionId=${s.id}`)}
        pagination={{
          currentPage: sessPage,
          totalPages: sessTotalPages,
          totalRecords: todaysSessionsAll.length,
          pageSize: tablePageSize,
          onPageChange: setSessPage,
        }}
      />

      {/* UPCOMING BOOKINGS */}
      <VillaDataTable
        title="Upcoming Bookings"
        subtitle="Pending and confirmed activity bookings across Time Slot and Session workflows"
        headerActions={
          <button
            type="button"
            onClick={() => navigate("/activities/bookings")}
            className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
          >
            View All Bookings →
          </button>
        }
        columns={upcomingBookingColumns}
        rows={pagedUpcomingBookings}
        loading={loading}
        loadingMessage="Loading upcoming bookings..."
        emptyTitle="No upcoming bookings"
        emptyDescription="Create a booking for a Time Slot resource or Scheduled Session."
        tableMinWidth="min-w-[840px]"
        onRowClick={(b) => navigate(`/activities/bookings?search=${b.booking_number}`)}
        pagination={{
          currentPage: bkPage,
          totalPages: bkTotalPages,
          totalRecords: upcomingBookingsAll.length,
          pageSize: tablePageSize,
          onPageChange: setBkPage,
        }}
      />
    </div>
  );
}
