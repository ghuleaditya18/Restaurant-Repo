import { useState, useEffect, useCallback } from "react";
import {
  Users,
  UserPlus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Edit2,
  Calendar,
  X,
  Phone,
  Mail,
  Award,
  AlertCircle,
  Save,
} from "lucide-react";
import spaApi from "../services/spaApi";
import { useNotification } from "../../../context/NotificationContext";
import { formatTimeRange12Hour } from "../utils/timeFormat";

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default function SpaStaff() {
  const { showSuccess, showError } = useNotification();
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filterTherapist, setFilterTherapist] = useState("all");

  // Add / Edit Modal state
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [staffForm, setStaffForm] = useState({
    full_name: "",
    employee_code: "",
    designation: "Spa Therapist",
    email: "",
    phone: "",
    specialization: "",
    is_therapist: true,
    is_active: true,
  });
  const [formError, setFormError] = useState("");
  const [savingStaff, setSavingStaff] = useState(false);

  // Availability Modal state
  const [isAvailModalOpen, setIsAvailModalOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [availabilityList, setAvailabilityList] = useState([]);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [savingAvail, setSavingAvail] = useState(false);
  const [availSuccess, setAvailSuccess] = useState("");

  const fetchStaff = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (filterTherapist === "therapists") params.therapists_only = true;
      const res = await spaApi.getStaff(params);
      const data = Array.isArray(res?.data) ? res.data : [];
      setStaffList(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load staff list");
      setStaffList([]);
    } finally {
      setLoading(false);
    }
  }, [filterTherapist]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const openAddStaff = () => {
    setEditingStaff(null);
    setStaffForm({
      full_name: "",
      employee_code: `TH-${Math.floor(100 + Math.random() * 900)}`,
      designation: "Spa Therapist",
      email: "",
      phone: "",
      specialization: "",
      is_therapist: true,
      is_active: true,
    });
    setFormError("");
    setIsStaffModalOpen(true);
  };

  const openEditStaff = (staff) => {
    setEditingStaff(staff);
    setStaffForm({
      full_name: staff.full_name || staff.name || "",
      employee_code: staff.employee_code || "",
      designation: staff.designation || "Spa Therapist",
      email: staff.email || "",
      phone: staff.phone || "",
      specialization: staff.specialization || "",
      is_therapist: staff.is_therapist ?? true,
      is_active: staff.is_active ?? true,
    });
    setFormError("");
    setIsStaffModalOpen(true);
  };

  const handleSaveStaff = async (e) => {
    e.preventDefault();
    if (!staffForm.full_name.trim()) {
      setFormError("Staff full name is required.");
      return;
    }
    if (!staffForm.phone.trim()) {
      setFormError("Contact phone number is required.");
      return;
    }
    setSavingStaff(true);
    setFormError("");
    try {
      const payload = {
        full_name: staffForm.full_name.trim(),
        employee_code: staffForm.employee_code.trim(),
        designation: staffForm.designation.trim() || (staffForm.is_therapist ? "Therapist" : "Attendant"),
        phone: staffForm.phone.trim(),
        email: staffForm.email.trim() || null,
        specialization: staffForm.specialization.trim() || null,
        is_therapist: Boolean(staffForm.is_therapist),
        is_active: Boolean(staffForm.is_active),
      };

      if (editingStaff) {
        await spaApi.updateStaff(editingStaff.id, payload);
      } else {
        await spaApi.createStaff(payload);
      }
      setIsStaffModalOpen(false);
      showSuccess(
        editingStaff
          ? "Staff member updated successfully."
          : "Staff member created successfully.",
        "Staff Saved"
      );
      fetchStaff();
    } catch (err) {
      setFormError(err.response?.data?.detail || "Failed to save staff member");
    } finally {
      setSavingStaff(false);
    }
  };

  const openAvailability = async (staff) => {
    setSelectedStaff(staff);
    setIsAvailModalOpen(true);
    setAvailSuccess("");
    setLoadingAvail(true);
    try {
      const res = await spaApi.getStaffDetail(staff.id);
      const availabilities = res.data?.availabilities || [];
      // Map 0..6 days (0=Mon .. 6=Sun)
      const mapped = DAYS_OF_WEEK.map((dayName, idx) => {
        const existing = availabilities.find((a) => a.day_of_week === idx);
        return {
          day_of_week: idx,
          day_name: dayName,
          is_working: existing ? existing.is_available : idx !== 6, // default off on Sunday (day 6)
          start_time: existing?.start_time ? existing.start_time.slice(0, 5) : "09:00",
          end_time: existing?.end_time ? existing.end_time.slice(0, 5) : "18:00",
        };
      });
      setAvailabilityList(mapped);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAvail(false);
    }
  };

  const handleSaveAvailability = async () => {
    if (!selectedStaff) return;
    setSavingAvail(true);
    setAvailSuccess("");
    try {
      const payload = availabilityList.map((a) => ({
        day_of_week: a.day_of_week,
        start_time: a.start_time.length === 5 ? `${a.start_time}:00` : a.start_time,
        end_time: a.end_time.length === 5 ? `${a.end_time}:00` : a.end_time,
        is_available: Boolean(a.is_working),
      }));
      await spaApi.updateStaffAvailability(selectedStaff.id, payload);
      const okMsg = "Operating schedule saved successfully!";
      setAvailSuccess(okMsg);
      showSuccess(okMsg, "Schedule Saved");
      setTimeout(() => {
        setAvailSuccess("");
      }, 2500);
    } catch (err) {
      const errMsg = err.response?.data?.detail || "Failed to save schedule";
      showError(errMsg, "Schedule Error");
    } finally {
      setSavingAvail(false);
    }
  };

  const safeList = Array.isArray(staffList) ? staffList : [];
  const therapistsCount = safeList.filter((s) => s.is_therapist).length;
  const otherStaffCount = safeList.filter((s) => !s.is_therapist).length;

  const filteredStaff = safeList.filter((s) => {
    if (filterTherapist === "therapists" && !s.is_therapist) return false;
    if (filterTherapist === "other" && s.is_therapist) return false;
    const q = search.toLowerCase();
    const name = (s.full_name || s.name || "").toLowerCase();
    const code = (s.employee_code || "").toLowerCase();
    const spec = (s.specialization || "").toLowerCase();
    const phone = s.phone || "";
    return name.includes(q) || code.includes(q) || spec.includes(q) || phone.includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-white tracking-tight">
            Therapist Management
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400">
            Manage therapist roster, support staff, specializations, employee codes, and weekly availability schedules
          </p>
        </div>

        <button
          onClick={openAddStaff}
          className="inline-flex items-center gap-2 rounded-xl bg-[#F5B716] px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#1C1917] shadow-sm hover:bg-[#E5A910] transition-colors cursor-pointer self-start sm:self-auto"
        >
          <UserPlus size={16} />
          <span>Add Staff Member</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <input
            type="text"
            placeholder="Search by name, employee code, specialization, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1C1917] pl-10 pr-4 py-2 text-xs sm:text-sm text-stone-900 dark:text-white placeholder-stone-400 focus:border-[#F5B716] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterTherapist("all")}
            className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer ${
              filterTherapist === "all"
                ? "bg-[#1C1917] dark:bg-white text-white dark:text-[#1C1917]"
                : "border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1C1917] text-stone-700 dark:text-stone-300 hover:bg-stone-50"
            }`}
          >
            All Staff ({safeList.length})
          </button>
          <button
            onClick={() => setFilterTherapist("therapists")}
            className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
              filterTherapist === "therapists"
                ? "bg-[#1C1917] dark:bg-white text-white dark:text-[#1C1917]"
                : "border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1C1917] text-stone-700 dark:text-stone-300 hover:bg-stone-50"
            }`}
          >
            <Sparkles size={13} className="text-[#F5B716]" />
            Therapists Only ({therapistsCount})
          </button>
          <button
            onClick={() => setFilterTherapist("other")}
            className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
              filterTherapist === "other"
                ? "bg-[#1C1917] dark:bg-white text-white dark:text-[#1C1917]"
                : "border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1C1917] text-stone-700 dark:text-stone-300 hover:bg-stone-50"
            }`}
          >
            Other Staff ({otherStaffCount})
          </button>
        </div>
      </div>

      {/* Staff Grid / Cards */}
      {loading ? (
        <div className="p-12 text-center text-stone-400 text-sm">
          Loading staff directory...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs sm:text-sm text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300">
          {error}
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 dark:border-stone-800 p-12 text-center">
          <Users size={40} className="mx-auto text-stone-300 dark:text-stone-600 mb-3" />
          <h3 className="text-base font-semibold text-stone-800 dark:text-stone-200">
            No staff members found
          </h3>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
            {search ? "Try adjusting your search criteria" : "Get started by adding your first spa therapist or attendant"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredStaff.map((staff) => {
            const displayName = staff.full_name || staff.name || "Staff Member";
            return (
              <div
                key={staff.id}
                className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#1C1917] p-5 shadow-xs hover:border-[#F5B716]/40 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-[#D99A06] dark:text-[#F5B716] flex items-center justify-center font-bold text-sm">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-sm sm:text-base font-bold text-stone-900 dark:text-white">
                          {displayName}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {staff.employee_code && (
                            <span className="font-mono text-[10px] font-semibold bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded text-stone-600 dark:text-stone-400">
                              {staff.employee_code}
                            </span>
                          )}
                          {staff.is_therapist ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                              <Sparkles size={10} />
                              Therapist
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded-full">
                              {staff.designation || "Support Staff"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        staff.is_active
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                          : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"
                      }`}
                    >
                      {staff.is_active ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                      {staff.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-stone-600 dark:text-stone-400 mb-4 pt-2 border-t border-stone-100 dark:border-stone-800/80">
                    {staff.specialization && (
                      <div className="flex items-center gap-2">
                        <Award size={13} className="text-amber-500 shrink-0" />
                        <span className="truncate">
                          Specialization: <strong className="text-stone-800 dark:text-stone-200">{staff.specialization}</strong>
                        </span>
                      </div>
                    )}
                    {staff.phone && (
                      <div className="flex items-center gap-2">
                        <Phone size={13} className="text-stone-400 shrink-0" />
                        <span>{staff.phone}</span>
                      </div>
                    )}
                    {staff.email && (
                      <div className="flex items-center gap-2">
                        <Mail size={13} className="text-stone-400 shrink-0" />
                        <span className="truncate">{staff.email}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-stone-100 dark:border-stone-800/80">
                  <button
                    onClick={() => openEditStaff(staff)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 dark:border-stone-700 py-2 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition cursor-pointer"
                  >
                    <Edit2 size={13} />
                    <span>Edit Profile</span>
                  </button>

                  {staff.is_therapist && (
                    <button
                      onClick={() => openAvailability(staff)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 py-2 text-xs font-semibold text-amber-700 dark:text-[#F5B716] hover:bg-amber-500/20 transition cursor-pointer"
                    >
                      <Calendar size={13} />
                      <span>Schedule</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Staff Modal */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1C1917] border border-stone-200 dark:border-stone-800 shadow-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-stone-100 dark:border-stone-800">
              <h2 className="text-base font-bold text-stone-900 dark:text-white">
                {editingStaff ? "Edit Staff Member" : "Add Staff Member"}
              </h2>
              <button
                onClick={() => setIsStaffModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-1"
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveStaff} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Maya Patel"
                  value={staffForm.full_name}
                  onChange={(e) => setStaffForm({ ...staffForm, full_name: e.target.value })}
                  className="w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#29231F] px-3.5 py-2 text-xs sm:text-sm text-stone-900 dark:text-white focus:border-[#F5B716] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    Employee Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. TH-01"
                    value={staffForm.employee_code}
                    onChange={(e) => setStaffForm({ ...staffForm, employee_code: e.target.value })}
                    className="w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#29231F] px-3.5 py-2 text-xs sm:text-sm text-stone-900 dark:text-white focus:border-[#F5B716] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    Designation
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Senior Therapist"
                    value={staffForm.designation}
                    onChange={(e) => setStaffForm({ ...staffForm, designation: e.target.value })}
                    className="w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#29231F] px-3.5 py-2 text-xs sm:text-sm text-stone-900 dark:text-white focus:border-[#F5B716] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Specialization
                </label>
                <input
                  type="text"
                  placeholder="e.g. Deep Tissue, Swedish, Facial"
                  value={staffForm.specialization}
                  onChange={(e) => setStaffForm({ ...staffForm, specialization: e.target.value })}
                  className="w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#29231F] px-3.5 py-2 text-xs sm:text-sm text-stone-900 dark:text-white focus:border-[#F5B716] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="9876543210"
                    value={staffForm.phone}
                    onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                    className="w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#29231F] px-3.5 py-2 text-xs sm:text-sm text-stone-900 dark:text-white focus:border-[#F5B716] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="staff@spa.com"
                    value={staffForm.email}
                    onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                    className="w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#29231F] px-3.5 py-2 text-xs sm:text-sm text-stone-900 dark:text-white focus:border-[#F5B716] focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={staffForm.is_therapist}
                    onChange={(e) => setStaffForm({ ...staffForm, is_therapist: e.target.checked })}
                    className="rounded border-stone-300 text-[#F5B716] focus:ring-[#F5B716]"
                  />
                  <span className="text-xs font-medium text-stone-800 dark:text-stone-200">
                    Is a Service Therapist (can be assigned to bookings)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={staffForm.is_active}
                    onChange={(e) => setStaffForm({ ...staffForm, is_active: e.target.checked })}
                    className="rounded border-stone-300 text-[#F5B716] focus:ring-[#F5B716]"
                  />
                  <span className="text-xs font-medium text-stone-800 dark:text-stone-200">
                    Active Employee
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setIsStaffModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingStaff}
                  className="rounded-xl bg-[#F5B716] px-5 py-2 text-xs font-semibold text-[#1C1917] hover:bg-[#E5A910] disabled:opacity-50 cursor-pointer"
                >
                  {savingStaff ? "Saving..." : "Save Staff"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Therapist Weekly Schedule / Availability Modal */}
      {isAvailModalOpen && selectedStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#1C1917] border border-stone-200 dark:border-stone-800 shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-stone-100 dark:border-stone-800">
              <div>
                <h2 className="text-base font-bold text-stone-900 dark:text-white flex items-center gap-2">
                  <Calendar size={18} className="text-[#F5B716]" />
                  <span>Therapist Schedule – {selectedStaff.full_name || selectedStaff.name}</span>
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Set weekly operating hours (0=Mon .. 6=Sun) for appointment conflict checks
                </p>
              </div>
              <button
                onClick={() => setIsAvailModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-1"
              >
                <X size={18} />
              </button>
            </div>

            {availSuccess && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 size={14} className="shrink-0" />
                <span>{availSuccess}</span>
              </div>
            )}

            {loadingAvail ? (
              <div className="py-12 text-center text-xs text-stone-400">
                Loading schedule...
              </div>
            ) : (
              <div className="mt-4 space-y-2.5">
                {availabilityList.map((item, idx) => (
                  <div
                    key={item.day_of_week}
                    className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors ${
                      item.is_working
                        ? "border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/40"
                        : "border-dashed border-stone-200 dark:border-stone-800/60 opacity-60 bg-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3 w-32">
                      <input
                        type="checkbox"
                        checked={item.is_working}
                        onChange={(e) => {
                          const updated = [...availabilityList];
                          updated[idx].is_working = e.target.checked;
                          setAvailabilityList(updated);
                        }}
                        className="rounded border-stone-300 text-[#F5B716] focus:ring-[#F5B716]"
                      />
                      <span className="text-xs font-bold text-stone-800 dark:text-stone-200">
                        {item.day_name}
                      </span>
                    </div>

                    {item.is_working ? (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <Clock size={12} className="text-stone-400" />
                          <input
                            type="time"
                            value={item.start_time}
                            onChange={(e) => {
                              const updated = [...availabilityList];
                              updated[idx].start_time = e.target.value;
                              setAvailabilityList(updated);
                            }}
                            className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#29231F] px-2 py-1 text-xs text-stone-900 dark:text-white"
                          />
                        </div>
                        <span className="text-stone-400 text-xs">to</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="time"
                            value={item.end_time}
                            onChange={(e) => {
                              const updated = [...availabilityList];
                              updated[idx].end_time = e.target.value;
                              setAvailabilityList(updated);
                            }}
                            className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#29231F] px-2 py-1 text-xs text-stone-900 dark:text-white"
                          />
                        </div>
                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 ml-1">
                          ({formatTimeRange12Hour(item.start_time, item.end_time)})
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs italic text-stone-400">Day Off</span>
                    )}
                  </div>
                ))}

                <div className="flex items-center justify-between pt-4 border-t border-stone-100 dark:border-stone-800">
                  <button
                    type="button"
                    onClick={() => {
                      const preset = availabilityList.map((a) => ({
                        ...a,
                        is_working: a.day_of_week !== 6, // Mon-Sat working, Sun off
                        start_time: "09:00",
                        end_time: "18:00",
                      }));
                      setAvailabilityList(preset);
                    }}
                    className="text-xs text-amber-600 dark:text-amber-400 font-semibold hover:underline cursor-pointer"
                  >
                    Reset (Mon–Sat 09:00–18:00)
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAvailModalOpen(false)}
                      className="rounded-xl px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      disabled={savingAvail}
                      onClick={handleSaveAvailability}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#F5B716] px-5 py-2 text-xs font-semibold text-[#1C1917] hover:bg-[#E5A910] disabled:opacity-50 cursor-pointer"
                    >
                      <Save size={14} />
                      <span>{savingAvail ? "Saving..." : "Save Schedule"}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
