import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  Printer,
  ShieldCheck,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import PageHeader from "../../components/PageHeader";
import StatCard from "../../components/StatCard";
import StatusBadge from "../../components/StatusBadge";
import { useNotification } from "../../context/NotificationContext";
import { BUTTON_VARIANTS, CARD_STYLES, INPUT_STYLES } from "../../utils/themeTokens";
import VillaDataTable from "../villas/VillaDataTable";
import {
  actDate,
  actError,
  activitiesApi,
  actTime,
  kolkataTodayIso,
} from "./activitiesApi";

export default function ActivityRoster() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showSuccess, showError } = useNotification();

  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(
    searchParams.get("sessionId") || ""
  );
  const [rosterData, setRosterData] = useState(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [rosterPage, setRosterPage] = useState(1);
  const rosterPageSize = 10;

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await activitiesApi.sessions({
        date_from: kolkataTodayIso(-7),
        date_to: kolkataTodayIso(30),
        page: 1,
        page_size: 100,
      });
      const items = res.data?.items || [];
      setSessions(items);
      if (!selectedSessionId && items.length > 0) {
        const firstId = String(items[0].id);
        setSelectedSessionId(firstId);
      }
    } catch (err) {
      setError(actError(err));
    } finally {
      setLoadingSessions(false);
    }
  }, [selectedSessionId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const loadRoster = useCallback(async (sid) => {
    if (!sid) {
      setRosterData(null);
      return;
    }
    setLoadingRoster(true);
    setError("");
    try {
      const res = await activitiesApi.sessionRoster(sid);
      setRosterData(res.data);
    } catch (err) {
      setError(actError(err));
    } finally {
      setLoadingRoster(false);
    }
  }, []);

  useEffect(() => {
    loadRoster(selectedSessionId);
  }, [selectedSessionId, loadRoster]);

  const handleSessionChange = (sid) => {
    setSelectedSessionId(sid);
    setRosterPage(1);
    setSelectedIds(new Set());
    if (sid) {
      setSearchParams({ sessionId: sid }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const handleUpdateParticipant = async (participantId, payload, msg) => {
    try {
      await activitiesApi.updateParticipant(participantId, payload);
      showSuccess(msg);
      await loadRoster(selectedSessionId);
    } catch (err) {
      showError(actError(err));
    }
  };

  const handleSelectRow = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSelectAll = (ids) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleBulkRosterAction = async (payload, msg) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setBulkUpdating(true);
    try {
      await activitiesApi.bulkUpdateParticipants({ ids, ...payload });
      showSuccess(msg);
      setSelectedIds(new Set());
      await loadRoster(selectedSessionId);
    } catch (err) {
      showError(actError(err));
    } finally {
      setBulkUpdating(false);
    }
  };

  const session = rosterData?.session;
  const roster = rosterData?.roster || [];
  const rosterTotalPages = Math.max(1, Math.ceil(roster.length / rosterPageSize));
  const pagedRoster = roster.slice(
    (rosterPage - 1) * rosterPageSize,
    rosterPage * rosterPageSize
  );
  const presentCount = roster.filter((r) => r.attendance_status === "Present").length;
  const unsignedCount = roster.filter((r) => !r.waiver_signed).length;

  const columns = [
    {
      key: "participant_name",
      label: "Participant",
      render: (r) => (
        <div>
          <div className="font-semibold text-[#172033] dark:text-[#F8FAFC]">
            {r.participant_name}
          </div>
          {r.age != null && <div className="text-xs text-stone-500">Age: {r.age}</div>}
        </div>
      ),
    },
    {
      key: "customer_name",
      label: "Customer",
      render: (r) => (
        <div>
          <div className="font-medium">{r.customer_name}</div>
          <div className="text-xs text-stone-500">{r.customer_phone || "—"}</div>
        </div>
      ),
    },
    {
      key: "booking_number",
      label: "Booking #",
      cellClassName: "font-mono font-bold whitespace-nowrap",
    },
    {
      key: "participant_count",
      label: "Party",
      align: "right",
      cellClassName: "tabular-nums",
    },
    {
      key: "waiver_signed",
      label: "Waiver",
      align: "center",
      render: (r) => (
        <button
          type="button"
          onClick={() =>
            handleUpdateParticipant(
              r.participant_id,
              { waiver_signed: !r.waiver_signed },
              r.waiver_signed ? "Waiver marked unsigned." : "Waiver marked signed."
            )
          }
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold cursor-pointer ${
            r.waiver_signed
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60"
              : "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60"
          }`}
        >
          <ShieldCheck size={12} />
          <span>{r.waiver_signed ? "Signed" : "Pending"}</span>
        </button>
      ),
    },
    {
      key: "payment_status",
      label: "Payment",
      align: "center",
      render: (r) => <StatusBadge status={r.payment_status || "Pending"} size="sm" />,
    },
    {
      key: "attendance_status",
      label: "Attendance",
      align: "center",
      render: (r) => <StatusBadge status={r.attendance_status} size="sm" />,
    },
    {
      key: "actions",
      label: "Check-In Actions",
      align: "right",
      cellClassName: "whitespace-nowrap print:hidden",
      render: (r) => (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              handleUpdateParticipant(
                r.participant_id,
                { attendance_status: "Present" },
                `${r.participant_name} marked Present.`
              )
            }
            title="Mark Present"
            className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer"
          >
            <CheckCircle2 size={15} />
          </button>
          <button
            type="button"
            onClick={() =>
              handleUpdateParticipant(
                r.participant_id,
                { attendance_status: "No Show" },
                `${r.participant_name} marked No Show.`
              )
            }
            title="Mark No Show"
            className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
          >
            <XCircle size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Session Roster & Attendance"
        description="Track live session participants, verify signed waivers, record check-in attendance, and print daily rosters."
        actions={
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!session}
            className={BUTTON_VARIANTS.secondary}
          >
            <Printer size={15} />
            <span>Print Roster</span>
          </button>
        }
      />

      {error && <AlertBanner variant="error" message={error} onDismiss={() => setError("")} />}

      {/* SESSION SELECTOR */}
      <div className={`${CARD_STYLES.base} !p-3 print:hidden`}>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold text-stone-700 dark:text-stone-300 shrink-0">
            Select Session:
          </label>
          <select
            value={selectedSessionId}
            onChange={(e) => handleSessionChange(e.target.value)}
            disabled={loadingSessions}
            className={`${INPUT_STYLES.select} flex-1 min-w-[260px]`}
          >
            <option value="">Choose a scheduled session...</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {actDate(s.session_date)} · {actTime(s.start_time)}–{actTime(s.end_time)} ·{" "}
                {s.activity_name} ({s.seats_booked}/{s.capacity}) [{s.status}]
              </option>
            ))}
          </select>
        </div>
      </div>

      {session && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-fit max-w-full">
            <StatCard
              compact
              className="!p-2.5"
              title="Seats Booked / Capacity"
              value={`${session.seats_booked} / ${session.capacity}`}
              description={`${session.seats_remaining} remaining`}
              icon={Users}
              color="amber"
            />
            <StatCard
              compact
              className="!p-2.5"
              title="Instructor"
              value={session.assigned_staff_name || "Unassigned"}
              description={actTime(session.start_time) + " – " + actTime(session.end_time)}
              icon={UserCheck}
              color={session.assigned_staff_name ? "sky" : "rose"}
            />
            <StatCard
              compact
              className="!p-2.5"
              title="Checked In (Present)"
              value={presentCount}
              description={`Of ${roster.length} roster entries`}
              icon={CheckCircle2}
              color="emerald"
            />
            <StatCard
              compact
              className="!p-2.5"
              title="Unsigned Waivers"
              value={unsignedCount}
              description={unsignedCount > 0 ? "Signatures needed" : "All waivers clear"}
              icon={ShieldCheck}
              color={unsignedCount > 0 ? "rose" : "emerald"}
            />
          </div>

          {session.below_minimum && (
            <AlertBanner
              variant="warning"
              title={`Below Minimum Participant Count (${session.seats_booked}/${session.min_participants})`}
              message="Advisory notice only — sessions are never automatically cancelled below minimum."
            />
          )}
        </>
      )}

      {selectedIds.size > 0 && (
        <div className="print:hidden flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs dark:border-amber-900/60 dark:bg-amber-950/30">
          <span className="font-semibold text-stone-800 dark:text-stone-100">
            {selectedIds.size} participant(s) selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={bulkUpdating}
              onClick={() => handleBulkRosterAction({ waiver_signed: true }, "Selected waivers marked signed.")}
              className={BUTTON_VARIANTS.outline}
            >
              <ShieldCheck size={13} />
              <span>Sign Waivers</span>
            </button>
            <button
              type="button"
              disabled={bulkUpdating}
              onClick={() => handleBulkRosterAction({ attendance_status: "Present" }, "Selected participants marked Present.")}
              className={BUTTON_VARIANTS.success}
            >
              <CheckCircle2 size={13} />
              <span>Mark Present</span>
            </button>
            <button
              type="button"
              disabled={bulkUpdating}
              onClick={() => handleBulkRosterAction({ attendance_status: "No Show" }, "Selected participants marked No Show.")}
              className={BUTTON_VARIANTS.danger}
            >
              <XCircle size={13} />
              <span>Mark No Show</span>
            </button>
            <button
              type="button"
              disabled={bulkUpdating}
              onClick={() => setSelectedIds(new Set())}
              className={BUTTON_VARIANTS.secondary}
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      <VillaDataTable
        title={session ? `${session.activity_name} — ${actDate(session.session_date)}` : "Session Roster"}
        subtitle={
          session
            ? `${actTime(session.start_time)} – ${actTime(session.end_time)} · Instructor: ${
                session.assigned_staff_name || "Unassigned"
              }`
            : "Select a session above to inspect participant check-in and waivers"
        }
        columns={columns}
        rows={pagedRoster}
        rowKey={(r) => r.participant_id}
        loading={loadingRoster}
        emptyTitle="No participants booked in this session"
        emptyDescription="Bookings assigned to this session will appear here automatically."
        tableMinWidth="min-w-[860px]"
        selectedIds={selectedIds}
        onSelectRow={handleSelectRow}
        onSelectAll={handleSelectAll}
        pagination={{
          currentPage: rosterPage,
          totalPages: rosterTotalPages,
          totalRecords: roster.length,
          pageSize: rosterPageSize,
          onPageChange: setRosterPage,
        }}
      />
    </div>
  );
}
