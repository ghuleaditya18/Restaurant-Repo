import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  CalendarPlus,
  Clock,
  Edit3,
  Layers,
  List,
  Plus,
  Power,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import BulkSelectionBar from "../../components/BulkSelectionBar";
import DeleteConfirm from "../../components/DeleteConfirm";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import StatCard from "../../components/StatCard";
import StatusBadge from "../../components/StatusBadge";
import { useNotification } from "../../context/NotificationContext";
import { BUTTON_VARIANTS, CARD_STYLES, INPUT_STYLES } from "../../utils/themeTokens";
import { validateEmailAddress, validateMobileNumber } from "../../utils/validation";
import VillaDataTable from "../villas/VillaDataTable";
import {
  actDate,
  actError,
  activitiesApi,
  actTime,
  kolkataTodayIso,
} from "./activitiesApi";

const SESSION_STATUSES = ["Scheduled", "In Progress", "Completed", "Cancelled"];
const WEEKDAYS = [
  { id: 0, label: "Mon" },
  { id: 1, label: "Tue" },
  { id: 2, label: "Wed" },
  { id: 3, label: "Thu" },
  { id: 4, label: "Fri" },
  { id: 5, label: "Sat" },
  { id: 6, label: "Sun" },
];

export default function ActivitiesSchedule() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showSuccess, showError } = useNotification();

  const initialTab = ["sessions", "templates", "instructors"].includes(searchParams.get("tab"))
    ? searchParams.get("tab")
    : "sessions";
  const [tab, setTab] = useState(initialTab); // sessions | templates | instructors
  const [viewMode, setViewMode] = useState("table"); // table | agenda
  const [sessions, setSessions] = useState([]);
  const [activitiesList, setActivitiesList] = useState([]);
  const [allActivitiesList, setAllActivitiesList] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [allStaffList, setAllStaffList] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [tplPage, setTplPage] = useState(1);
  const [staffPage, setStaffPage] = useState(1);
  const [staffSearch, setStaffSearch] = useState("");
  const [staffIncludeInactive, setStaffIncludeInactive] = useState(false);

  // Filters
  const [activityFilter, setActivityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(kolkataTodayIso(-1));
  const [dateTo, setDateTo] = useState(kolkataTodayIso(14));
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 24;

  // Create / Edit Session Modal
  const [sessModalOpen, setSessModalOpen] = useState(Boolean(searchParams.get("new")));
  const [editingSession, setEditingSession] = useState(null);
  const [sessForm, setSessForm] = useState({
    activity_id: "",
    session_date: kolkataTodayIso(0),
    start_time: "07:00",
    end_time: "08:00",
    capacity: 10,
    assigned_staff_id: "",
    notes: "",
  });
  const [sessError, setSessError] = useState("");
  const [sessFieldError, setSessFieldError] = useState("");
  const [savingSess, setSavingSess] = useState(false);

  // Cancel Session Modal
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Weekly Schedule Template Modal
  const [tplOpen, setTplOpen] = useState(false);
  const [tplForm, setTplForm] = useState({
    activity_id: "",
    operating_weekdays: [0, 1, 2, 3, 4],
    start_time: "07:00",
    end_time: "08:00",
    valid_from: kolkataTodayIso(0),
    valid_to: kolkataTodayIso(60),
    default_capacity: 10,
    default_staff_id: "",
    notes: "",
  });
  const [tplError, setTplError] = useState("");
  const [tplFieldErrors, setTplFieldErrors] = useState({});
  const [savingTpl, setSavingTpl] = useState(false);

  // Generate Sessions from Schedule Modal
  const [genTarget, setGenTarget] = useState(null);
  const [genDates, setGenDates] = useState({
    from_date: kolkataTodayIso(0),
    to_date: kolkataTodayIso(14),
  });
  const [generating, setGenerating] = useState(false);

  // Selection & Delete Modals
  const [selectedSessionIds, setSelectedSessionIds] = useState(() => new Set());
  const [selectedScheduleIds, setSelectedScheduleIds] = useState(() => new Set());
  const [selectedStaffIds, setSelectedStaffIds] = useState(() => new Set());
  const [deleteSessionTarget, setDeleteSessionTarget] = useState(null);
  const [deletingSession, setDeletingSession] = useState(false);
  const [deleteScheduleTarget, setDeleteScheduleTarget] = useState(null);
  const [deletingSchedule, setDeletingSchedule] = useState(false);
  const [deleteStaffTarget, setDeleteStaffTarget] = useState(null);
  const [deletingStaff, setDeletingStaff] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkFailures, setBulkFailures] = useState([]);

  // Instructor Create / Edit Modal
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [staffForm, setStaffForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    employee_code: "",
    designation: "Activity Instructor",
    activity_ids: [],
    is_active: true,
  });
  const [staffFormError, setStaffFormError] = useState("");
  const [staffFieldErrors, setStaffFieldErrors] = useState({});
  const [savingStaff, setSavingStaff] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const [sessRes, actRes, staffRes] = await Promise.all([
        activitiesApi.sessions({
          activity_id: activityFilter || undefined,
          status: statusFilter || undefined,
          assigned_staff_id: staffFilter || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          page,
          page_size: pageSize,
        }),
        activitiesApi.list({ status: "Active", page: 1, page_size: 100 }),
        activitiesApi.staff({ include_inactive: true }).catch(() => ({ data: [] })),
      ]);

      setSessions(sessRes.data?.items || []);
      setTotalRecords(sessRes.data?.total ?? 0);
      setTotalPages(sessRes.data?.total_pages ?? 1);

      const acts = actRes.data?.items || [];
      setActivitiesList(acts);
      setAllActivitiesList(acts);
      const rawStaff = staffRes.data || [];
      setAllStaffList(rawStaff);
      setStaffList(rawStaff.filter((s) => s.is_active));

      // Load schedules for session-type activities
      const sessionActs = acts.filter((a) => a.booking_type === "session");
      const schedResults = await Promise.all(
        sessionActs.map((a) =>
          activitiesApi
            .listSchedules(a.id)
            .then((r) => (r.data || []).map((sc) => ({ ...sc, activity_name: a.name })))
            .catch(() => [])
        )
      );
      setSchedules(schedResults.flat());
    } catch (err) {
      setPageError(actError(err));
    } finally {
      setLoading(false);
    }
  }, [activityFilter, statusFilter, staffFilter, dateFrom, dateTo, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (searchParams.get("new")) {
      setSessFieldError("");
      setSessModalOpen(true);
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const sessionActivities = activitiesList.filter((a) => a.booking_type === "session");

  const openCreateSession = () => {
    const firstAct = sessionActivities[0];
    setEditingSession(null);
    setSessForm({
      activity_id: firstAct ? String(firstAct.id) : "",
      session_date: kolkataTodayIso(0),
      start_time: "08:00",
      end_time: "09:00",
      capacity: firstAct?.max_participants || 10,
      assigned_staff_id: firstAct?.default_staff_id ? String(firstAct.default_staff_id) : "",
      notes: "",
    });
    setSessError("");
    setSessFieldError("");
    setSessModalOpen(true);
  };

  const openEditSession = (s) => {
    setEditingSession(s);
    setSessForm({
      activity_id: String(s.activity_id),
      session_date: String(s.session_date).slice(0, 10),
      start_time: String(s.start_time || "08:00").slice(0, 5),
      end_time: String(s.end_time || "09:00").slice(0, 5),
      capacity: s.capacity,
      assigned_staff_id: s.assigned_staff_id ? String(s.assigned_staff_id) : "",
      notes: s.notes || "",
    });
    setSessError("");
    setSessFieldError("");
    setSessModalOpen(true);
  };

  const handleSaveSession = async (e) => {
    e.preventDefault();
    setSessError("");
    setSessFieldError("");
    if (!sessForm.activity_id) {
      setSessFieldError("Select a session activity.");
      return;
    }
    setSavingSess(true);
    try {
      if (editingSession) {
        await activitiesApi.updateSession(editingSession.id, {
          session_date: sessForm.session_date,
          start_time: sessForm.start_time,
          end_time: sessForm.end_time,
          capacity: Number(sessForm.capacity),
          assigned_staff_id: sessForm.assigned_staff_id ? Number(sessForm.assigned_staff_id) : null,
          notes: sessForm.notes.trim() || null,
        });
        showSuccess("Session updated.");
      } else {
        await activitiesApi.createSession({
          activity_id: Number(sessForm.activity_id),
          session_date: sessForm.session_date,
          start_time: sessForm.start_time,
          end_time: sessForm.end_time,
          capacity: Number(sessForm.capacity),
          assigned_staff_id: sessForm.assigned_staff_id ? Number(sessForm.assigned_staff_id) : null,
          notes: sessForm.notes.trim() || null,
        });
        showSuccess("Session created.");
      }
      setSessModalOpen(false);
      await loadData();
    } catch (err) {
      setSessError(actError(err));
    } finally {
      setSavingSess(false);
    }
  };

  const handleQuickStatus = async (s, nextStatus) => {
    try {
      await activitiesApi.updateSession(s.id, { status: nextStatus });
      showSuccess(`Session marked ${nextStatus}.`);
      await loadData();
    } catch (err) {
      showError(actError(err));
    }
  };

  const handleCancelSession = async (e) => {
    e.preventDefault();
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await activitiesApi.updateSession(cancelTarget.id, {
        status: "Cancelled",
        cancelled_reason: cancelReason.trim() || "Cancelled by coordinator",
      });
      showSuccess("Session cancelled.");
      setCancelTarget(null);
      setCancelReason("");
      await loadData();
    } catch (err) {
      showError(actError(err));
    } finally {
      setCancelling(false);
    }
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    setTplError("");
    const errors = {};
    if (!tplForm.activity_id) {
      errors.activity_id = "Select an activity.";
    }
    if (tplForm.operating_weekdays.length === 0) {
      errors.operating_weekdays = "Select at least one operating weekday.";
    }
    setTplFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setSavingTpl(true);
    try {
      await activitiesApi.createSchedule(Number(tplForm.activity_id), {
        activity_id: Number(tplForm.activity_id),
        operating_weekdays: tplForm.operating_weekdays,
        start_time: tplForm.start_time,
        end_time: tplForm.end_time,
        valid_from: tplForm.valid_from,
        valid_to: tplForm.valid_to,
        default_capacity: Number(tplForm.default_capacity),
        default_staff_id: tplForm.default_staff_id ? Number(tplForm.default_staff_id) : null,
        is_active: true,
        notes: tplForm.notes.trim() || null,
      });
      showSuccess("Weekly schedule template created.");
      setTplOpen(false);
      await loadData();
    } catch (err) {
      setTplError(actError(err));
    } finally {
      setSavingTpl(false);
    }
  };

  const handleGenerateSessions = async (e) => {
    e.preventDefault();
    if (!genTarget) return;
    setGenerating(true);
    try {
      const res = await activitiesApi.generateSessions(genTarget.id, genDates);
      showSuccess(res.data?.message || "Sessions generated.");
      setGenTarget(null);
      setTab("sessions");
      await loadData();
    } catch (err) {
      showError(actError(err));
    } finally {
      setGenerating(false);
    }
  };

  const toggleInSet = (setter, id) => {
    setBulkFailures([]);
    setter((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllInSet = (setter, ids) => {
    setBulkFailures([]);
    setter((prev) => {
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

  const handleConfirmDeleteSession = async () => {
    if (!deleteSessionTarget) return;
    setDeletingSession(true);
    try {
      const res = await activitiesApi.deleteSession(deleteSessionTarget.id);
      showSuccess(res.data?.message || "Session deleted.");
      setSelectedSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteSessionTarget.id);
        return next;
      });
      setDeleteSessionTarget(null);
      await loadData();
    } catch (err) {
      showError(actError(err));
    } finally {
      setDeletingSession(false);
    }
  };

  const handleConfirmDeleteSchedule = async () => {
    if (!deleteScheduleTarget) return;
    setDeletingSchedule(true);
    try {
      const res = await activitiesApi.deleteSchedule(deleteScheduleTarget.id);
      showSuccess(res.data?.message || "Weekly schedule template deleted.");
      setSelectedScheduleIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteScheduleTarget.id);
        return next;
      });
      setDeleteScheduleTarget(null);
      await loadData();
    } catch (err) {
      showError(actError(err));
    } finally {
      setDeletingSchedule(false);
    }
  };

  const handleConfirmBulkDelete = async () => {
    const isTemplates = tab === "templates";
    const isInstructors = tab === "instructors";
    const ids = Array.from(
      isInstructors ? selectedStaffIds : isTemplates ? selectedScheduleIds : selectedSessionIds
    );
    if (!ids.length) return;
    setBulkDeleting(true);
    setBulkFailures([]);
    try {
      const res = isInstructors
        ? await activitiesApi.bulkDeleteStaff(ids)
        : isTemplates
          ? await activitiesApi.bulkDeleteSchedules(ids)
          : await activitiesApi.bulkDeleteSessions(ids);
      const { deleted = 0, failed = [], message } = res.data || {};
      setBulkFailures(failed);
      if (isInstructors) {
        setSelectedStaffIds(new Set(failed.map((f) => f.id)));
      } else if (isTemplates) {
        setSelectedScheduleIds(new Set(failed.map((f) => f.id)));
      } else {
        setSelectedSessionIds(new Set(failed.map((f) => f.id)));
      }
      setBulkDeleteOpen(false);
      await loadData();
      if (deleted > 0) showSuccess(message || `Deleted ${deleted} record(s).`);
      if (failed.length > 0) showError(`${failed.length} record(s) could not be deleted.`);
    } catch (err) {
      showError(actError(err));
    } finally {
      setBulkDeleting(false);
    }
  };

  const openCreateInstructor = (presetActivityId = "") => {
    setEditingStaff(null);
    setStaffForm({
      full_name: "",
      email: "",
      phone: "",
      employee_code: "",
      designation: "Activity Instructor",
      activity_ids: presetActivityId ? [Number(presetActivityId)] : [],
      is_active: true,
    });
    setStaffFormError("");
    setStaffFieldErrors({});
    setStaffModalOpen(true);
  };

  const openEditInstructor = (u) => {
    setEditingStaff(u);
    setStaffForm({
      full_name: u.full_name || "",
      email: u.email || "",
      phone: u.phone || "",
      employee_code: u.employee_code || "",
      designation: u.designation || "Activity Instructor",
      activity_ids: Array.isArray(u.assigned_activity_ids) ? u.assigned_activity_ids : [],
      is_active: Boolean(u.is_active),
    });
    setStaffFormError("");
    setStaffFieldErrors({});
    setStaffModalOpen(true);
  };

  const handleSaveInstructor = async (e) => {
    e.preventDefault();
    setStaffFormError("");
    const errors = {};
    if (staffForm.full_name.trim().length < 2) {
      errors.full_name = "Instructor name must be at least 2 characters.";
    }
    const emailCheck = validateEmailAddress(staffForm.email, { required: true });
    if (!emailCheck.valid) {
      errors.email = emailCheck.error;
    }
    const phoneCheck = validateMobileNumber(staffForm.phone, { required: true });
    if (!phoneCheck.valid) {
      errors.phone = phoneCheck.error;
    }
    setStaffFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setSavingStaff(true);
    try {
      const payload = {
        full_name: staffForm.full_name.trim(),
        email: emailCheck.normalized,
        phone: phoneCheck.normalized,
        employee_code: staffForm.employee_code.trim().toUpperCase() || null,
        designation: staffForm.designation.trim() || "Activity Instructor",
        activity_ids: (staffForm.activity_ids || []).map(Number),
        is_active: Boolean(staffForm.is_active),
      };
      if (editingStaff) {
        await activitiesApi.updateStaff(editingStaff.id, payload);
        showSuccess(`Instructor "${payload.full_name}" updated.`);
      } else {
        const res = await activitiesApi.createStaff(payload);
        showSuccess(`Instructor "${payload.full_name}" created.`);
        if (sessModalOpen && res.data?.id) {
          setSessForm((prev) => ({ ...prev, assigned_staff_id: String(res.data.id) }));
        }
        if (tplOpen && res.data?.id) {
          setTplForm((prev) => ({ ...prev, default_staff_id: String(res.data.id) }));
        }
      }
      setStaffModalOpen(false);
      await loadData();
    } catch (err) {
      setStaffFormError(actError(err));
    } finally {
      setSavingStaff(false);
    }
  };

  const handleToggleStaffStatus = async (u) => {
    try {
      await activitiesApi.updateStaff(u.id, { is_active: !u.is_active });
      showSuccess(`${u.full_name} marked ${!u.is_active ? "Active" : "Inactive"}.`);
      await loadData();
    } catch (err) {
      showError(actError(err));
    }
  };

  const handleConfirmDeleteStaff = async () => {
    if (!deleteStaffTarget) return;
    setDeletingStaff(true);
    try {
      const res = await activitiesApi.deleteStaff(deleteStaffTarget.id);
      showSuccess(res.data?.message || `Instructor "${deleteStaffTarget.full_name}" removed.`);
      setSelectedStaffIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteStaffTarget.id);
        return next;
      });
      setDeleteStaffTarget(null);
      await loadData();
    } catch (err) {
      showError(actError(err));
    } finally {
      setDeletingStaff(false);
    }
  };

  const renderActivityInstructorOptions = (activityIdValue) => {
    const targetId = Number(activityIdValue || 0);
    const qualified = targetId
      ? staffList.filter((u) => (u.assigned_activity_ids || []).includes(targetId))
      : [];
    const others = targetId
      ? staffList.filter((u) => !(u.assigned_activity_ids || []).includes(targetId))
      : staffList;
    if (!qualified.length) {
      return staffList.map((u) => (
        <option key={u.id} value={u.id}>
          {u.full_name} ({u.designation || u.email})
        </option>
      ));
    }
    return (
      <>
        <optgroup label="Assigned to This Activity">
          {qualified.map((u) => (
            <option key={u.id} value={u.id}>
              ★ {u.full_name} ({u.designation || "Instructor"})
            </option>
          ))}
        </optgroup>
        {others.length > 0 && (
          <optgroup label="Other Active Staff">
            {others.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.designation || "Staff"})
              </option>
            ))}
          </optgroup>
        )}
      </>
    );
  };

  // Group sessions by date for Agenda view
  const groupedByDate = sessions.reduce((acc, s) => {
    const key = String(s.session_date).slice(0, 10);
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const belowMinCount = sessions.filter((s) => s.below_minimum).length;
  const unassignedCount = sessions.filter(
    (s) => !s.assigned_staff_id && s.status === "Scheduled"
  ).length;
  const fullCount = sessions.filter((s) => s.is_full && s.status !== "Cancelled").length;

  const sessionColumns = [
    {
      key: "session_date",
      label: "Date & Time",
      cellClassName: "whitespace-nowrap",
      render: (s) => (
        <div>
          <div className="font-semibold">{actDate(s.session_date)}</div>
          <div className="text-xs text-stone-500 tabular-nums">
            {actTime(s.start_time)} – {actTime(s.end_time)}
          </div>
        </div>
      ),
    },
    {
      key: "activity_name",
      label: "Activity",
      render: (s) => (
        <div>
          <div className="font-semibold">{s.activity_name}</div>
          <div className="text-xs text-stone-500">{s.activity_category}</div>
        </div>
      ),
    },
    {
      key: "assigned_staff_name",
      label: "Instructor",
      render: (s) =>
        s.assigned_staff_name ? (
          <span>{s.assigned_staff_name}</span>
        ) : (
          <span className="text-xs font-semibold text-amber-600">Unassigned</span>
        ),
    },
    {
      key: "capacity",
      label: "Seats",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (s) => (
        <div className="inline-flex items-center gap-1.5">
          <span className="font-semibold">
            {s.seats_booked} / {s.capacity}
          </span>
          <span className="text-xs text-stone-500">({s.seats_remaining} left)</span>
          {s.below_minimum && (
            <span className="rounded bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
              Below Min ({s.min_participants})
            </span>
          )}
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      align: "center",
      render: (s) => (
        <div className="inline-flex items-center gap-1">
          <StatusBadge status={s.status} size="sm" />
          {s.is_full && s.status !== "Cancelled" && <StatusBadge status="Full" size="sm" />}
        </div>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      cellClassName: "whitespace-nowrap",
      render: (s) => (
        <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => navigate(`/activities/roster?sessionId=${s.id}`)}
            title="Session Roster"
            className="rounded-lg p-1.5 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/30 cursor-pointer"
          >
            <UserCheck size={15} />
          </button>
          <button
            type="button"
            onClick={() => openEditSession(s)}
            title="Edit / Assign Instructor"
            className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <Edit3 size={15} />
          </button>
          {s.status === "Scheduled" && (
            <button
              type="button"
              onClick={() => {
                setCancelTarget(s);
                setCancelReason("");
              }}
              title="Cancel Session"
              className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer"
            >
              <XCircle size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setDeleteSessionTarget(s)}
            title="Delete / Clear Session"
            className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Schedule & Sessions"
        description="Manage group sessions, weekly recurring templates, activity instructors, and calculated seat availability."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openCreateInstructor(activityFilter || "")}
              className={BUTTON_VARIANTS.secondary}
            >
              <UserPlus size={15} />
              <span>Add Instructor</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const firstAct = sessionActivities[0];
                setTplForm((prev) => ({
                  ...prev,
                  activity_id: firstAct ? String(firstAct.id) : "",
                  default_capacity: firstAct?.max_participants || 10,
                }));
                setTplError("");
                setTplFieldErrors({});
                setTplOpen(true);
              }}
              className={BUTTON_VARIANTS.secondary}
            >
              <Layers size={15} />
              <span>Add Weekly Template</span>
            </button>
            <button type="button" onClick={openCreateSession} className={BUTTON_VARIANTS.primary}>
              <Plus size={15} />
              <span>Add Session</span>
            </button>
          </div>
        }
      />

      {pageError && (
        <AlertBanner variant="error" message={pageError} onDismiss={() => setPageError("")} />
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-fit max-w-full">
        <StatCard compact className="!p-2.5" title="Matching Sessions" value={loading ? "—" : totalRecords} icon={CalendarDays} color="amber" />
        <StatCard compact className="!p-2.5" title="Unassigned Staff" value={loading ? "—" : unassignedCount} icon={Users} color={unassignedCount > 0 ? "rose" : "emerald"} />
        <StatCard compact className="!p-2.5" title="Below Min Advisory" value={loading ? "—" : belowMinCount} icon={AlertTriangle} color={belowMinCount > 0 ? "amber" : "emerald"} />
        <StatCard compact className="!p-2.5" title="Fully Booked" value={loading ? "—" : fullCount} icon={Sparkles} color="indigo" />
      </div>

      {/* MODE TABS + FILTERS */}
      <div className={`${CARD_STYLES.base} !p-2.5 space-y-2.5`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#151D29] p-0.5">
            <button
              type="button"
              onClick={() => {
                setTab("sessions");
                setBulkFailures([]);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                tab === "sessions" ? "bg-amber-500 text-[#0D1420] font-bold" : "text-stone-600 dark:text-[#8A9AB2]"
              }`}
            >
              Scheduled Sessions
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("templates");
                setBulkFailures([]);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                tab === "templates" ? "bg-amber-500 text-[#0D1420] font-bold" : "text-stone-600 dark:text-[#8A9AB2]"
              }`}
            >
              Weekly Templates ({schedules.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("instructors");
                setBulkFailures([]);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                tab === "instructors" ? "bg-amber-500 text-[#0D1420] font-bold" : "text-stone-600 dark:text-[#8A9AB2]"
              }`}
            >
              Instructors &amp; Staff ({allStaffList.length})
            </button>
          </div>

          {tab === "sessions" && (
            <div className="inline-flex rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#151D29] p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                  viewMode === "table" ? "bg-white dark:bg-[#101722] shadow-2xs" : "text-stone-500"
                }`}
              >
                <List size={13} />
                <span>Table</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("agenda")}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                  viewMode === "agenda" ? "bg-white dark:bg-[#101722] shadow-2xs" : "text-stone-500"
                }`}
              >
                <CalendarDays size={13} />
                <span>Agenda</span>
              </button>
            </div>
          )}
        </div>

        {tab === "sessions" && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value)}
              className={`${INPUT_STYLES.select} w-full sm:!w-auto min-w-[160px] !py-1.5 text-xs`}
            >
              <option value="">All Session Activities</option>
              {sessionActivities.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={`${INPUT_STYLES.base} w-full sm:!w-auto !py-1.5 text-xs`}
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={`${INPUT_STYLES.base} w-full sm:!w-auto !py-1.5 text-xs`}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`${INPUT_STYLES.select} w-full sm:!w-auto min-w-[130px] !py-1.5 text-xs`}
            >
              <option value="">All Statuses</option>
              {SESSION_STATUSES.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
            <select
              value={staffFilter}
              onChange={(e) => setStaffFilter(e.target.value)}
              className={`${INPUT_STYLES.select} w-full sm:!w-auto min-w-[140px] !py-1.5 text-xs`}
            >
              <option value="">All Instructors</option>
              {staffList.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
          </div>
        )}

        {tab === "instructors" && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={staffSearch}
                  onChange={(e) => {
                    setStaffSearch(e.target.value);
                    setStaffPage(1);
                  }}
                  placeholder="Search instructor, code, email, activity..."
                  className={`${INPUT_STYLES.base} w-full pl-9 !py-1.5 text-xs`}
                />
              </div>
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 dark:text-stone-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={staffIncludeInactive}
                  onChange={(e) => {
                    setStaffIncludeInactive(e.target.checked);
                    setStaffPage(1);
                  }}
                  className="h-4 w-4 accent-amber-500"
                />
                <span>Show Inactive</span>
              </label>
            </div>
            <button
              type="button"
              onClick={() => openCreateInstructor("")}
              className={BUTTON_VARIANTS.primary}
            >
              <UserPlus size={15} />
              <span>Add Instructor / Staff</span>
            </button>
          </div>
        )}
      </div>

      <BulkSelectionBar
        count={
          tab === "instructors"
            ? selectedStaffIds.size
            : tab === "templates"
              ? selectedScheduleIds.size
              : selectedSessionIds.size
        }
        onClear={() =>
          tab === "instructors"
            ? setSelectedStaffIds(new Set())
            : tab === "templates"
              ? setSelectedScheduleIds(new Set())
              : setSelectedSessionIds(new Set())
        }
        onDelete={() => setBulkDeleteOpen(true)}
        deleting={bulkDeleting}
      />

      {bulkFailures.length > 0 && (
        <AlertBanner
          variant="warning"
          title="Some items could not be deleted"
          message={bulkFailures.map((f) => `${f.name}: ${f.reason}`).join(" | ")}
          onDismiss={() => setBulkFailures([])}
        />
      )}

      {/* SESSIONS CONTENT */}
      {tab === "sessions" ? (
        viewMode === "table" ? (
          <VillaDataTable
            title="Scheduled Sessions"
            columns={sessionColumns}
            rows={sessions}
            loading={loading}
            emptyTitle="No sessions in this date range"
            tableMinWidth="min-w-[880px]"
            selectedIds={selectedSessionIds}
            onSelectRow={(id) => toggleInSet(setSelectedSessionIds, id)}
            onSelectAll={(ids) => toggleAllInSet(setSelectedSessionIds, ids)}
            pagination={{
              currentPage: page,
              totalPages,
              totalRecords,
              pageSize,
              onPageChange: setPage,
            }}
          />
        ) : loading ? (
          <div className={`${CARD_STYLES.base} py-12 text-center text-sm text-stone-500`}>
            Loading scheduled sessions...
          </div>
        ) : Object.keys(groupedByDate).length === 0 ? (
          <div className={`${CARD_STYLES.base} py-12 text-center`}>
            <CalendarDays size={32} className="mx-auto text-stone-400 mb-2" />
            <p className="text-sm font-semibold">No scheduled sessions in this date window</p>
            <p className="text-xs text-stone-500 mt-1">
              Add an individual session or generate sessions from a Weekly Template.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedByDate).map(([dateKey, daySessions]) => (
              <div key={dateKey} className="space-y-2.5">
                <div className="flex items-center gap-2 px-1">
                  <CalendarDays size={15} className="text-amber-500" />
                  <h3 className="text-sm font-bold text-[#172033] dark:text-[#F8FAFC]">
                    {actDate(dateKey)}
                  </h3>
                  <span className="text-xs text-stone-500">({daySessions.length} session(s))</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                  {daySessions.map((s) => (
                    <div
                      key={s.id}
                      className={`${CARD_STYLES.base} !p-3 flex flex-col justify-between gap-2`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={selectedSessionIds.has(s.id)}
                              onChange={() => toggleInSet(setSelectedSessionIds, s.id)}
                              aria-label={`Select session ${s.activity_name}`}
                              className="mt-0.5 h-4 w-4 accent-amber-500 cursor-pointer shrink-0"
                            />
                            <div className="min-w-0">
                              <h4 className="text-sm font-bold text-[#172033] dark:text-[#F8FAFC] truncate">
                                {s.activity_name}
                              </h4>
                              <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5 tabular-nums">
                                <Clock size={12} className="text-amber-500 shrink-0" />
                                {actTime(s.start_time)} – {actTime(s.end_time)}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <StatusBadge status={s.status} size="sm" />
                            {s.is_full && s.status !== "Cancelled" && (
                              <StatusBadge status="Full" size="sm" />
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
                          <span>
                            Instructor:{" "}
                            <strong className={s.assigned_staff_name ? "" : "text-amber-600"}>
                              {s.assigned_staff_name || "Unassigned"}
                            </strong>
                          </span>
                          <span className="font-semibold tabular-nums">
                            {s.seats_booked} / {s.capacity} booked ({s.seats_remaining} left)
                          </span>
                        </div>

                        {s.below_minimum && (
                          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                            <AlertTriangle size={13} className="shrink-0" />
                            <span>
                              Advisory: below minimum ({s.seats_booked}/{s.min_participants}). Coordinator decides whether to proceed or cancel.
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="border-t border-[#E5E9F0] dark:border-[#1E293B] pt-2.5 flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => navigate(`/activities/roster?sessionId=${s.id}`)}
                            className="rounded-lg px-2 py-1 text-[11px] font-semibold bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 hover:brightness-95 cursor-pointer"
                          >
                            Roster
                          </button>
                          {s.status === "Scheduled" && !s.is_full && (
                            <button
                              type="button"
                              onClick={() =>
                                navigate(
                                  `/activities/bookings?new=1&activityId=${s.activity_id}&sessionId=${s.id}`
                                )
                              }
                              className="rounded-lg px-2 py-1 text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:brightness-95 cursor-pointer"
                            >
                              Book Seats
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditSession(s)}
                            title="Edit Session"
                            className="rounded-lg p-1 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                          >
                            <Edit3 size={14} />
                          </button>
                          {s.status === "Scheduled" && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleQuickStatus(s, "In Progress")}
                                className="rounded-lg px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer"
                              >
                                Start
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setCancelTarget(s);
                                  setCancelReason("");
                                }}
                                title="Cancel Session"
                                className="rounded-lg p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                              >
                                <XCircle size={14} />
                              </button>
                            </>
                          )}
                          {s.status === "In Progress" && (
                            <button
                              type="button"
                              onClick={() => handleQuickStatus(s, "Completed")}
                              className="rounded-lg px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer"
                            >
                              Complete
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleteSessionTarget(s)}
                            title="Delete Session"
                            className="rounded-lg p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === "templates" ? (
        /* WEEKLY TEMPLATES TAB */
        (() => {
          const tplPageSize = 10;
          const tplTotalPages = Math.max(1, Math.ceil(schedules.length / tplPageSize));
          const pagedSchedules = schedules.slice((tplPage - 1) * tplPageSize, tplPage * tplPageSize);
          return (
            <VillaDataTable
              title="Weekly Schedule Templates"
              subtitle="Generate upcoming scheduled sessions in bulk from recurring weekly templates"
              columns={[
                { key: "activity_name", label: "Activity", cellClassName: "font-semibold" },
                {
                  key: "operating_weekdays",
                  label: "Weekdays",
                  render: (sc) => {
                    const days = String(sc.operating_weekdays || "")
                      .split(",")
                      .filter(Boolean)
                      .map((d) => WEEKDAYS.find((w) => w.id === Number(d))?.label || d);
                    return days.join(", ") || "—";
                  },
                },
                {
                  key: "time",
                  label: "Time Window",
                  cellClassName: "whitespace-nowrap tabular-nums",
                  render: (sc) => `${actTime(sc.start_time)} – ${actTime(sc.end_time)}`,
                },
                {
                  key: "validity",
                  label: "Valid Dates",
                  cellClassName: "whitespace-nowrap",
                  render: (sc) => `${actDate(sc.valid_from)} – ${actDate(sc.valid_to)}`,
                },
                { key: "default_capacity", label: "Capacity", align: "right" },
                {
                  key: "actions",
                  label: "Actions",
                  align: "right",
                  cellClassName: "whitespace-nowrap",
                  render: (sc) => (
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setGenTarget(sc);
                          setGenDates({
                            from_date: String(sc.valid_from).slice(0, 10),
                            to_date: String(sc.valid_to).slice(0, 10),
                          });
                        }}
                        className={BUTTON_VARIANTS.outline}
                      >
                        <CalendarPlus size={13} />
                        <span>Generate Sessions</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteScheduleTarget(sc)}
                        title="Delete Weekly Template"
                        className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ),
                },
              ]}
              rows={pagedSchedules}
              loading={loading}
              emptyTitle="No weekly templates configured"
              emptyDescription="Create a weekly template to batch-generate recurring sessions."
              selectedIds={selectedScheduleIds}
              onSelectRow={(id) => toggleInSet(setSelectedScheduleIds, id)}
              onSelectAll={(ids) => toggleAllInSet(setSelectedScheduleIds, ids)}
              pagination={{
                currentPage: tplPage,
                totalPages: tplTotalPages,
                totalRecords: schedules.length,
                pageSize: tplPageSize,
                onPageChange: setTplPage,
              }}
            />
          );
        })()
      ) : (
        /* INSTRUCTORS & STAFF TAB */
        (() => {
          const term = staffSearch.trim().toLowerCase();
          const filteredStaff = allStaffList.filter((u) => {
            if (!staffIncludeInactive && !u.is_active) return false;
            if (!term) return true;
            const actNames = (u.assigned_activities || []).map((a) => a.name.toLowerCase()).join(" ");
            return (
              (u.full_name || "").toLowerCase().includes(term) ||
              (u.email || "").toLowerCase().includes(term) ||
              (u.employee_code || "").toLowerCase().includes(term) ||
              (u.designation || "").toLowerCase().includes(term) ||
              actNames.includes(term)
            );
          });
          const staffPageSize = 10;
          const staffTotalPages = Math.max(1, Math.ceil(filteredStaff.length / staffPageSize));
          const pagedStaff = filteredStaff.slice(
            (staffPage - 1) * staffPageSize,
            staffPage * staffPageSize
          );
          const staffColumns = [
            {
              key: "full_name",
              label: "Instructor / Staff",
              render: (u) => (
                <div>
                  <div className="font-semibold text-[#172033] dark:text-[#F8FAFC]">
                    {u.full_name}
                  </div>
                  <div className="text-xs text-stone-500 font-mono">
                    {u.employee_code || (u.role === "manager" ? "MANAGER" : "—")}
                  </div>
                </div>
              ),
            },
            {
              key: "contact",
              label: "Contact",
              render: (u) => (
                <div className="text-xs space-y-0.5">
                  <div>{u.email}</div>
                  {u.phone && <div className="text-stone-500">{u.phone}</div>}
                </div>
              ),
            },
            {
              key: "designation",
              label: "Designation",
              render: (u) => (
                <span className="text-xs font-medium">{u.designation || "Activity Instructor"}</span>
              ),
            },
            {
              key: "assigned_activities",
              label: "Assigned Activities",
              render: (u) =>
                (u.assigned_activities || []).length === 0 ? (
                  <span className="text-xs text-stone-400">Any / General</span>
                ) : (
                  <div className="flex flex-wrap gap-1 max-w-[260px]">
                    {u.assigned_activities.map((a) => (
                      <span
                        key={a.id}
                        className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300"
                      >
                        {a.name}
                      </span>
                    ))}
                  </div>
                ),
            },
            {
              key: "upcoming_session_count",
              label: "Upcoming",
              align: "right",
              cellClassName: "tabular-nums font-semibold",
              render: (u) => u.upcoming_session_count ?? 0,
            },
            {
              key: "is_active",
              label: "Status",
              align: "center",
              render: (u) => (
                <StatusBadge status={u.is_active ? "Active" : "Inactive"} size="sm" />
              ),
            },
            {
              key: "actions",
              label: "Actions",
              align: "right",
              cellClassName: "whitespace-nowrap",
              render: (u) => (
                <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => openEditInstructor(u)}
                    title="Edit Instructor & Activities"
                    className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                  >
                    <Edit3 size={15} />
                  </button>
                  {u.role !== "manager" && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleToggleStaffStatus(u)}
                        title={u.is_active ? "Deactivate" : "Activate"}
                        className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer"
                      >
                        <Power size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteStaffTarget(u)}
                        title="Delete Instructor"
                        className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              ),
            },
          ];

          return (
            <VillaDataTable
              title="Activity Instructors & Staff"
              subtitle="Create instructors and assign the specific activities they are qualified to lead"
              columns={staffColumns}
              rows={pagedStaff}
              loading={loading}
              emptyTitle="No instructors or staff found"
              emptyDescription="Click 'Add Instructor / Staff' to register activity instructors and assign them to specific activities."
              tableMinWidth="min-w-[880px]"
              selectedIds={selectedStaffIds}
              onSelectRow={(id) => toggleInSet(setSelectedStaffIds, id)}
              onSelectAll={(ids) => toggleAllInSet(setSelectedStaffIds, ids)}
              isRowSelectable={(u) => u.role !== "manager"}
              pagination={{
                currentPage: staffPage,
                totalPages: staffTotalPages,
                totalRecords: filteredStaff.length,
                pageSize: staffPageSize,
                onPageChange: setStaffPage,
              }}
            />
          );
        })()
      )}

      {/* ADD / EDIT SESSION MODAL */}
      <Modal
        isOpen={sessModalOpen}
        onClose={() => setSessModalOpen(false)}
        title={editingSession ? `Edit Session — ${editingSession.activity_name}` : "Add Scheduled Session"}
        size="md"
      >
        <form onSubmit={handleSaveSession} className="space-y-4">
          {sessError && <AlertBanner variant="error" message={sessError} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Session Activity *
              </label>
              <select
                required
                disabled={Boolean(editingSession)}
                value={sessForm.activity_id}
                onChange={(e) => {
                  setSessFieldError("");
                  const act = sessionActivities.find((a) => String(a.id) === e.target.value);
                  setSessForm({
                    ...sessForm,
                    activity_id: e.target.value,
                    capacity: act?.max_participants || sessForm.capacity,
                    assigned_staff_id: act?.default_staff_id ? String(act.default_staff_id) : "",
                  });
                }}
                aria-invalid={Boolean(sessFieldError)}
                className={`${INPUT_STYLES.select} ${sessFieldError ? "border-red-500" : ""}`}
              >
                <option value="">Select session activity...</option>
                {sessionActivities.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.duration_minutes} min)</option>
                ))}
              </select>
              {sessFieldError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{sessFieldError}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Session Date *
              </label>
              <input
                type="date"
                required
                value={sessForm.session_date}
                onChange={(e) => setSessForm({ ...sessForm, session_date: e.target.value })}
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Capacity *
              </label>
              <input
                type="number"
                min={1}
                required
                value={sessForm.capacity}
                onChange={(e) => setSessForm({ ...sessForm, capacity: e.target.value })}
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Start Time *
              </label>
              <input
                type="time"
                required
                value={sessForm.start_time}
                onChange={(e) => setSessForm({ ...sessForm, start_time: e.target.value })}
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                End Time *
              </label>
              <input
                type="time"
                required
                value={sessForm.end_time}
                onChange={(e) => setSessForm({ ...sessForm, end_time: e.target.value })}
                className={INPUT_STYLES.base}
              />
            </div>
            <div className="sm:col-span-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="text-xs font-bold text-stone-700 dark:text-stone-300">
                  Assigned Instructor (conflict-protected)
                </label>
                <button
                  type="button"
                  onClick={() => openCreateInstructor(sessForm.activity_id)}
                  className="text-[11px] font-semibold text-amber-600 hover:underline cursor-pointer"
                >
                  + Create Instructor
                </button>
              </div>
              <select
                value={sessForm.assigned_staff_id}
                onChange={(e) => setSessForm({ ...sessForm, assigned_staff_id: e.target.value })}
                className={INPUT_STYLES.select}
              >
                <option value="">Unassigned</option>
                {renderActivityInstructorOptions(sessForm.activity_id)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Notes
              </label>
              <input
                type="text"
                value={sessForm.notes}
                onChange={(e) => setSessForm({ ...sessForm, notes: e.target.value })}
                placeholder="Session notes..."
                className={INPUT_STYLES.base}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E9F0] dark:border-[#1E293B]">
            <button type="button" onClick={() => setSessModalOpen(false)} className={BUTTON_VARIANTS.secondary}>
              Cancel
            </button>
            <button type="submit" disabled={savingSess} className={BUTTON_VARIANTS.primary}>
              {savingSess ? "Saving..." : editingSession ? "Update Session" : "Create Session"}
            </button>
          </div>
        </form>
      </Modal>

      {/* CANCEL SESSION MODAL */}
      <Modal
        isOpen={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Cancel Session"
        size="sm"
      >
        <form onSubmit={handleCancelSession} className="space-y-4">
          <p className="text-xs text-stone-600 dark:text-stone-300">
            Cancel <strong>{cancelTarget?.activity_name}</strong> on{" "}
            <strong>{actDate(cancelTarget?.session_date)}</strong>?
          </p>
          <textarea
            rows={2}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason for cancellation..."
            className={INPUT_STYLES.base}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCancelTarget(null)} className={BUTTON_VARIANTS.secondary}>
              Keep Session
            </button>
            <button type="submit" disabled={cancelling} className={BUTTON_VARIANTS.danger}>
              {cancelling ? "Cancelling..." : "Confirm Cancel"}
            </button>
          </div>
        </form>
      </Modal>

      {/* WEEKLY TEMPLATE MODAL */}
      <Modal
        isOpen={tplOpen}
        onClose={() => setTplOpen(false)}
        title="Create Weekly Schedule Template"
        size="md"
      >
        <form onSubmit={handleSaveTemplate} className="space-y-4">
          {tplError && <AlertBanner variant="error" message={tplError} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Session Activity *
              </label>
              <select
                required
                value={tplForm.activity_id}
                onChange={(e) => { setTplForm({ ...tplForm, activity_id: e.target.value }); setTplFieldErrors((p) => ({ ...p, activity_id: "" })); }}
                aria-invalid={Boolean(tplFieldErrors.activity_id)}
                className={`${INPUT_STYLES.select} ${tplFieldErrors.activity_id ? "border-red-500" : ""}`}
              >
                <option value="">Select activity...</option>
                {sessionActivities.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              {tplFieldErrors.activity_id && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{tplFieldErrors.activity_id}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Operating Weekdays *
              </label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((wd) => {
                  const selected = tplForm.operating_weekdays.includes(wd.id);
                  return (
                    <button
                      key={wd.id}
                      type="button"
                      onClick={() => {
                        setTplForm((f) => ({
                          ...f,
                          operating_weekdays: selected
                            ? f.operating_weekdays.filter((x) => x !== wd.id)
                            : [...f.operating_weekdays, wd.id].sort(),
                        }));
                        setTplFieldErrors((p) => ({ ...p, operating_weekdays: "" }));
                      }}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold border cursor-pointer ${
                        selected
                          ? "bg-amber-500 text-[#0D1420] border-amber-500 font-bold"
                          : "border-[#E5E9F0] dark:border-[#1E293B] text-stone-600 dark:text-stone-300"
                      }`}
                    >
                      {wd.label}
                    </button>
                  );
                })}
              </div>
              {tplFieldErrors.operating_weekdays && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{tplFieldErrors.operating_weekdays}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">Valid From *</label>
              <input
                type="date"
                required
                value={tplForm.valid_from}
                onChange={(e) => setTplForm({ ...tplForm, valid_from: e.target.value })}
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">Valid To *</label>
              <input
                type="date"
                required
                value={tplForm.valid_to}
                onChange={(e) => setTplForm({ ...tplForm, valid_to: e.target.value })}
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">Start Time *</label>
              <input
                type="time"
                required
                value={tplForm.start_time}
                onChange={(e) => setTplForm({ ...tplForm, start_time: e.target.value })}
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">End Time *</label>
              <input
                type="time"
                required
                value={tplForm.end_time}
                onChange={(e) => setTplForm({ ...tplForm, end_time: e.target.value })}
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">Default Capacity *</label>
              <input
                type="number"
                min={1}
                required
                value={tplForm.default_capacity}
                onChange={(e) => setTplForm({ ...tplForm, default_capacity: e.target.value })}
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="text-xs font-bold text-stone-700 dark:text-stone-300">Default Instructor</label>
                <button
                  type="button"
                  onClick={() => openCreateInstructor(tplForm.activity_id)}
                  className="text-[11px] font-semibold text-amber-600 hover:underline cursor-pointer"
                >
                  + Create
                </button>
              </div>
              <select
                value={tplForm.default_staff_id}
                onChange={(e) => setTplForm({ ...tplForm, default_staff_id: e.target.value })}
                className={INPUT_STYLES.select}
              >
                <option value="">Unassigned</option>
                {renderActivityInstructorOptions(tplForm.activity_id)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E9F0] dark:border-[#1E293B]">
            <button type="button" onClick={() => setTplOpen(false)} className={BUTTON_VARIANTS.secondary}>Cancel</button>
            <button type="submit" disabled={savingTpl} className={BUTTON_VARIANTS.primary}>
              {savingTpl ? "Saving..." : "Create Template"}
            </button>
          </div>
        </form>
      </Modal>

      {/* GENERATE SESSIONS MODAL */}
      <Modal
        isOpen={Boolean(genTarget)}
        onClose={() => setGenTarget(null)}
        title={`Generate Sessions — ${genTarget?.activity_name || ""}`}
        size="sm"
      >
        <form onSubmit={handleGenerateSessions} className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">From Date *</label>
              <input
                type="date"
                required
                value={genDates.from_date}
                onChange={(e) => setGenDates({ ...genDates, from_date: e.target.value })}
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">To Date *</label>
              <input
                type="date"
                required
                value={genDates.to_date}
                onChange={(e) => setGenDates({ ...genDates, to_date: e.target.value })}
                className={INPUT_STYLES.base}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setGenTarget(null)} className={BUTTON_VARIANTS.secondary}>Cancel</button>
            <button type="submit" disabled={generating} className={BUTTON_VARIANTS.primary}>
              {generating ? "Generating..." : "Generate Sessions"}
            </button>
          </div>
        </form>
      </Modal>

      <DeleteConfirm
        isOpen={Boolean(deleteSessionTarget)}
        onClose={() => setDeleteSessionTarget(null)}
        onConfirm={handleConfirmDeleteSession}
        title="Delete Scheduled Session?"
        message={`Delete "${deleteSessionTarget?.activity_name || "Session"}" on ${actDate(deleteSessionTarget?.session_date)}? Sessions with existing bookings must have their bookings cleared first.`}
        confirmText="Delete Session"
        loading={deletingSession}
      />

      <DeleteConfirm
        isOpen={Boolean(deleteScheduleTarget)}
        onClose={() => setDeleteScheduleTarget(null)}
        onConfirm={handleConfirmDeleteSchedule}
        title="Delete Weekly Template?"
        message={`Remove the recurring schedule template for "${deleteScheduleTarget?.activity_name || "Activity"}"? Already-generated sessions will remain intact.`}
        confirmText="Delete Template"
        loading={deletingSchedule}
      />

      <DeleteConfirm
        isOpen={Boolean(deleteStaffTarget)}
        onClose={() => setDeleteStaffTarget(null)}
        onConfirm={handleConfirmDeleteStaff}
        title="Delete Instructor?"
        message={`Remove "${deleteStaffTarget?.full_name || "Instructor"}"? Instructors assigned to upcoming sessions must be unassigned first.`}
        confirmText="Delete Instructor"
        loading={deletingStaff}
      />

      <DeleteConfirm
        isOpen={bulkDeleteOpen}
        onClose={() => !bulkDeleting && setBulkDeleteOpen(false)}
        onConfirm={handleConfirmBulkDelete}
        title={
          tab === "instructors"
            ? `Delete ${selectedStaffIds.size} Selected Instructor(s)?`
            : tab === "templates"
              ? `Delete ${selectedScheduleIds.size} Weekly Template(s)?`
              : `Delete ${selectedSessionIds.size} Selected Session(s)?`
        }
        message={
          tab === "instructors"
            ? "Selected instructors with no active upcoming sessions will be removed."
            : tab === "templates"
              ? "Selected weekly schedule templates will be removed permanently."
              : "Selected sessions without linked bookings will be deleted permanently."
        }
        confirmText="Delete Selected"
        loading={bulkDeleting}
      />

      {/* CREATE / EDIT INSTRUCTOR MODAL */}
      <Modal
        isOpen={staffModalOpen}
        onClose={() => setStaffModalOpen(false)}
        title={editingStaff ? `Edit Instructor — ${editingStaff.full_name}` : "Add Activity Instructor / Staff"}
        size="md"
      >
        <form onSubmit={handleSaveInstructor} className="space-y-3.5">
          {staffFormError && <AlertBanner variant="error" message={staffFormError} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={staffForm.full_name}
                onChange={(e) => { setStaffForm({ ...staffForm, full_name: e.target.value }); setStaffFieldErrors((p) => ({ ...p, full_name: "" })); }}
                placeholder="e.g. Ananya Rao"
                aria-invalid={Boolean(staffFieldErrors.full_name)}
                className={`${INPUT_STYLES.base} ${staffFieldErrors.full_name ? "border-red-500" : ""}`}
              />
              {staffFieldErrors.full_name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{staffFieldErrors.full_name}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Employee Code
              </label>
              <input
                type="text"
                value={staffForm.employee_code}
                onChange={(e) => setStaffForm({ ...staffForm, employee_code: e.target.value })}
                placeholder="Auto-generated if blank"
                className={`${INPUT_STYLES.base} font-mono uppercase`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Email *
              </label>
              <input
                type="email"
                required
                value={staffForm.email}
                onChange={(e) => { setStaffForm({ ...staffForm, email: e.target.value }); setStaffFieldErrors((p) => ({ ...p, email: "" })); }}
                placeholder="instructor@newaraai.dev"
                aria-invalid={Boolean(staffFieldErrors.email)}
                className={`${INPUT_STYLES.base} ${staffFieldErrors.email ? "border-red-500" : ""}`}
              />
              {staffFieldErrors.email && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{staffFieldErrors.email}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Phone *
              </label>
              <input
                type="tel"
                required
                value={staffForm.phone}
                onChange={(e) => { setStaffForm({ ...staffForm, phone: e.target.value }); setStaffFieldErrors((p) => ({ ...p, phone: "" })); }}
                placeholder="10-digit mobile number"
                aria-invalid={Boolean(staffFieldErrors.phone)}
                className={`${INPUT_STYLES.base} ${staffFieldErrors.phone ? "border-red-500" : ""}`}
              />
              {staffFieldErrors.phone && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{staffFieldErrors.phone}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-300">
                Designation / Role Title
              </label>
              <input
                type="text"
                value={staffForm.designation}
                onChange={(e) => setStaffForm({ ...staffForm, designation: e.target.value })}
                placeholder="e.g. Yoga Instructor, Trekking Guide, Water Sports Coach"
                className={INPUT_STYLES.base}
              />
            </div>
          </div>

          <div className="rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] p-3 space-y-2">
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
              Assigned Activities (Select activities this instructor leads)
            </label>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
              {allActivitiesList.map((a) => {
                const selected = (staffForm.activity_ids || []).includes(a.id);
                return (
                  <label
                    key={a.id}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                      selected
                        ? "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                        : "border-[#E5E9F0] dark:border-[#1E293B] text-stone-600 dark:text-stone-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() =>
                        setStaffForm((prev) => {
                          const cur = prev.activity_ids || [];
                          return {
                            ...prev,
                            activity_ids: cur.includes(a.id)
                              ? cur.filter((id) => id !== a.id)
                              : [...cur, a.id],
                          };
                        })
                      }
                      className="h-3.5 w-3.5 accent-amber-500"
                    />
                    <span>{a.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E9F0] dark:border-[#1E293B]">
            <button type="button" onClick={() => setStaffModalOpen(false)} className={BUTTON_VARIANTS.secondary}>
              Cancel
            </button>
            <button type="submit" disabled={savingStaff} className={BUTTON_VARIANTS.primary}>
              {savingStaff ? "Saving..." : editingStaff ? "Update Instructor" : "Create Instructor"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
