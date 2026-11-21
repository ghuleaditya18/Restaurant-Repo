import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Users,
  UserCheck,
  UserX,
  Plus,
  Search,
  Pencil,
  Power,
  Trash2,
  X,
  RefreshCw,
  Mail,
  Phone,
  Briefcase,
  CalendarDays,
  Hash,
  Eye,
} from "lucide-react";

import {
  getAllStaff,
  getStaffById,
  createStaff,
  updateStaff,
  updateStaffStatus,
  deleteStaff,
} from "../services/staffService";
import { useNotification } from "../context/NotificationContext";
import PageHeader from "../components/PageHeader";
import AlertBanner from "../components/AlertBanner";

// Initial state for add/edit form
const EMPTY_FORM = {
  full_name: "",
  email: "",
  password: "",
  employee_code: "",
  phone: "",
  designation: "",
  joining_date: "",
};

// Form validation rules
const validateStaffForm = (form) => {
  const errors = {};

  if (!form.full_name?.trim()) {
    errors.full_name = "Full name is required.";
  } else if (form.full_name.trim().length < 2) {
    errors.full_name = "Full name must be at least 2 characters.";
  }

  if (!form.email?.trim()) {
    errors.email = "Email address is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = "Please enter a valid email address.";
  }

  if (!form.employee_code?.trim()) {
    errors.employee_code = "Employee code is required.";
  }

  if (!form.phone?.trim()) {
    errors.phone = "Phone number is required.";
  } else if (!/^\d{10}$/.test(form.phone.trim().replace(/\D/g, ""))) {
    errors.phone = "Phone number must be exactly 10 digits.";
  }

  if (!form.designation?.trim()) {
    errors.designation = "Designation is required.";
  }

  return errors;
};

const getErrorMessage = (error) => {
  const detail = error?.response?.data?.detail;

  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).join(", ");
  }

  if (typeof detail === "string") {
    return detail;
  }

  return "Something went wrong. Please try again.";
};

const formatDate = (isoString) => {
  if (!isoString) return "—";
  try {
    return new Date(isoString).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
};

const toDateInputValue = (isoString) => {
  if (!isoString) return "";
  try {
    return new Date(isoString).toISOString().split("T")[0];
  } catch {
    return "";
  }
};

export default function Staff() {
  const { showError, showInfo, confirm } = useNotification();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);

  // View staff modal state
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingStaff, setViewingStaff] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState("");
  const viewRequestId = useRef(0);

  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [pageError, setPageError] = useState("");
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadStaff = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setPageError("");

    try {
      const data = await getAllStaff();
      setStaff(Array.isArray(data) ? data : []);
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timer = setTimeout(() => setSuccessMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const closeModal = useCallback(() => {
    if (saving) return;
    setShowModal(false);
    setEditingStaff(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError("");
  }, [saving]);

  const modalOpen = showModal || showViewModal;

  useEffect(() => {
    if (!modalOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (showViewModal) closeViewModal();
      else if (!saving) closeModal();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalOpen, saving, showViewModal, closeModal]);

  const { activeCount, inactiveCount } = useMemo(() => {
    const active = staff.filter((member) => member.is_active).length;
    return { activeCount: active, inactiveCount: staff.length - active };
  }, [staff]);

  const filteredStaff = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return staff.filter((member) => {
      const matchesSearch =
        !searchValue ||
        [
          member.full_name,
          member.email,
          member.employee_code,
          member.designation,
          member.phone,
        ].some((field) =>
          String(field ?? "")
            .toLowerCase()
            .includes(searchValue),
        );

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && member.is_active) ||
        (statusFilter === "INACTIVE" && !member.is_active);

      return matchesSearch && matchesStatus;
    });
  }, [staff, search, statusFilter]);

  const hasActiveFilters = Boolean(search.trim()) || statusFilter !== "ALL";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("ALL");
  };

  const openAddModal = () => {
    setEditingStaff(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError("");
    setSuccessMessage("");
    setShowModal(true);
  };

  const openEditModal = (member) => {
    setEditingStaff(member);

    setForm({
      full_name: member.full_name ?? "",
      email: member.email ?? "",
      password: "",
      employee_code: member.employee_code ?? "",
      phone: String(member.phone ?? "").replace(/\D/g, "").slice(-10),
      designation: member.designation ?? "",
      joining_date: toDateInputValue(member.joining_date),
    });

    setFieldErrors({});
    setFormError("");
    setSuccessMessage("");
    setShowModal(true);
  };

  const openViewModal = async (member) => {
    const requestId = ++viewRequestId.current;

    setShowViewModal(true);
    setViewingStaff(null);
    setViewError("");
    setViewLoading(true);

    try {
      const data = await getStaffById(member.id);
      if (requestId === viewRequestId.current) setViewingStaff(data);
    } catch (error) {
      if (requestId === viewRequestId.current)
        setViewError(getErrorMessage(error));
    } finally {
      if (requestId === viewRequestId.current) setViewLoading(false);
    }
  };

  function closeViewModal() {
    viewRequestId.current += 1;
    setShowViewModal(false);
    setViewingStaff(null);
    setViewError("");
    setViewLoading(false);
  }

  const handleChange = (event) => {
    const { name, value } = event.target;
    const nextValue =
      name === "phone" ? value.replace(/\D/g, "").slice(0, 10) : value;

    setForm((previous) => ({ ...previous, [name]: nextValue }));
    setFieldErrors((previous) =>
      previous[name] ? { ...previous, [name]: "" } : previous,
    );
    setFormError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;

    setFormError("");
    const errors = validateStaffForm(form);
    setFieldErrors(errors);

    if (Object.values(errors).some(Boolean)) {
      const firstInvalid = Object.keys(errors).find((key) => errors[key]);
      document.getElementById(`staff-${firstInvalid}`)?.focus();
      return;
    }

    setSaving(true);

    const staffData = {
      full_name: form.full_name.trim(),
      email: form.email.trim().toLowerCase(),
      employee_code: form.employee_code.trim(),
      phone: form.phone.trim(),
      designation: form.designation.trim(),
      joining_date: form.joining_date || null,
    };

    try {
      if (editingStaff) {
        await updateStaff(editingStaff.id, staffData);
        setSuccessMessage(`${staffData.full_name}'s details updated successfully.`);
      } else {
        await createStaff(staffData);
        setSuccessMessage(`Staff member ${staffData.full_name} registered successfully.`);
      }

      closeModal();
      await loadStaff({ silent: true });
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (member) => {
    if (statusUpdatingId) return;

    const action = member.is_active ? "deactivate" : "activate";

    const confirmed = await confirm({
      title: `${member.is_active ? "Deactivate" : "Activate"} Staff Member`,
      message: `Are you sure you want to ${action} ${member.full_name}?`,
      confirmText: action === "deactivate" ? "Deactivate" : "Activate",
      cancelText: "Cancel",
      variant: member.is_active ? "warning" : "primary",
    });

    if (!confirmed) return;

    setPageError("");
    setSuccessMessage("");
    setStatusUpdatingId(member.id);

    try {
      const result = await updateStaffStatus(member.id, !member.is_active);

      const updatedMember =
        result && typeof result === "object" && result.id
          ? result
          : { ...member, is_active: !member.is_active };

      setStaff((previous) =>
        previous.map((item) => (item.id === member.id ? updatedMember : item)),
      );

      const msg = `${member.full_name} has been ${action}d successfully.`;
      setSuccessMessage(msg);
      showInfo(msg, "Staff Status Updated");
    } catch (error) {
      const msg = getErrorMessage(error);
      setPageError(msg);
      showError(msg, "Status Update Failed");
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleDeleteStaff = async (member) => {
    if (deletingId || statusUpdatingId) return;

    const confirmed = await confirm({
      title: "Delete Staff Member",
      message: `Delete ${member.full_name} from staff records? This action cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger",
    });

    if (!confirmed) return;

    setPageError("");
    setSuccessMessage("");
    setDeletingId(member.id);

    try {
      const result = await deleteStaff(member.id);
      setStaff((previous) => previous.filter((item) => item.id !== member.id));
      const msg = result?.message || `${member.full_name} was deleted successfully.`;
      setSuccessMessage(msg);
      showError(msg, "Staff Member Deleted");
    } catch (error) {
      const msg = getErrorMessage(error);
      setPageError(msg);
      showError(msg, "Delete Failed");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* A1 Standard PageHeader */}
      <PageHeader
        title="Staff"
        actions={
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#F5B716] px-4 py-2.5 text-sm font-bold text-[#1C1917] shadow-xs transition hover:bg-[#E5A910] cursor-pointer"
          >
            <Plus size={17} />
            <span>Add New Staff</span>
          </button>
        }
      />

      {/* Success Message */}
      {successMessage && (
        <AlertBanner
          type="success"
          message={successMessage}
          onDismiss={() => setSuccessMessage("")}
        />
      )}

      {/* Error Message */}
      {pageError && (
        <AlertBanner
          type="error"
          message={pageError}
          onDismiss={() => setPageError("")}
        />
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          title="Total Staff"
          value={staff.length}
          icon={<Users size={18} />}
          active={statusFilter === "ALL"}
          onClick={() => setStatusFilter("ALL")}
        />

        <StatCard
          title="Active Personnel"
          value={activeCount}
          icon={<UserCheck size={18} />}
          badgeColor="bg-emerald-50 text-emerald-800 border-emerald-200"
          active={statusFilter === "ACTIVE"}
          onClick={() => setStatusFilter("ACTIVE")}
        />

        <StatCard
          title="Inactive Accounts"
          value={inactiveCount}
          icon={<UserX size={18} />}
          badgeColor="bg-stone-100 text-stone-600 border-stone-200"
          active={statusFilter === "INACTIVE"}
          onClick={() => setStatusFilter("INACTIVE")}
        />
      </div>

      {/* Staff Table Container */}
      <div className="overflow-hidden rounded-xl border border-stone-200/90 bg-white shadow-xs">
        <div className="flex flex-col gap-3 border-b border-stone-200/80 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-[#1C1917]">Staff Directory</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {filteredStaff.length} {filteredStaff.length === 1 ? "employee" : "employees"} listed
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, code, designation..."
                aria-label="Search staff"
                className="w-full rounded-lg border border-stone-300 bg-white py-2 pl-9 pr-3 text-sm text-stone-900 outline-none transition focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30 sm:w-64"
              />
            </div>

            <button
              type="button"
              onClick={() => loadStaff()}
              disabled={loading}
              title="Refresh staff list"
              aria-label="Refresh staff list"
              className="flex items-center justify-center rounded-lg border border-stone-200 bg-white p-2 text-stone-600 transition hover:bg-stone-50 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Staff Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="hidden whitespace-nowrap px-4 py-3 md:table-cell">Code</th>
                <th className="hidden whitespace-nowrap px-4 py-3 md:table-cell">Designation</th>
                <th className="hidden whitespace-nowrap px-4 py-3 lg:table-cell">Joining Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-stone-100 text-sm">
              {loading ? (
                <tr>
                  <td
                    colSpan="6"
                    className="px-4 py-12 text-center text-sm text-stone-500"
                  >
                    Loading staff records...
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td
                    colSpan="6"
                    className="px-4 py-12 text-center text-sm text-stone-500"
                  >
                    <p>No staff members found.</p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="mt-2 font-semibold text-amber-800 hover:underline cursor-pointer"
                      >
                        Clear search and filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredStaff.map((member) => (
                  <tr key={member.id} className="transition hover:bg-stone-50/70">
                    {/* Employee Details */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FEF08A] border border-[#FDE047] text-sm font-bold text-[#854D0E] shadow-2xs">
                          {(member.full_name || "?").charAt(0).toUpperCase()}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate font-semibold text-stone-900">
                            {member.full_name}
                          </p>
                          <p className="truncate text-xs text-stone-500">
                            {member.email}
                          </p>
                          <p className="truncate text-xs text-stone-400 md:hidden">
                            {[member.employee_code, member.designation]
                              .filter(Boolean)
                              .join(" • ")}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Employee Code */}
                    <td className="hidden whitespace-nowrap px-4 py-3 font-mono text-xs text-stone-700 md:table-cell">
                      {member.employee_code || "—"}
                    </td>

                    {/* Designation */}
                    <td className="hidden whitespace-nowrap px-4 py-3 text-sm font-medium text-stone-700 md:table-cell">
                      {member.designation || "—"}
                    </td>

                    {/* Joining Date */}
                    <td className="hidden whitespace-nowrap px-4 py-3 text-xs text-stone-500 lg:table-cell">
                      {formatDate(member.joining_date)}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          member.is_active
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : "bg-stone-100 text-stone-500 border border-stone-200"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${member.is_active ? "bg-emerald-600" : "bg-stone-400"}`} />
                        <span>{member.is_active ? "Active" : "Inactive"}</span>
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openViewModal(member)}
                          title="View staff details"
                          aria-label={`View ${member.full_name}`}
                          className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition cursor-pointer"
                        >
                          <Eye size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditModal(member)}
                          title="Edit staff"
                          aria-label={`Edit ${member.full_name}`}
                          className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition cursor-pointer"
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStatusChange(member)}
                          disabled={statusUpdatingId === member.id}
                          title={member.is_active ? "Deactivate staff" : "Activate staff"}
                          className={`rounded-lg p-2 transition cursor-pointer ${
                            member.is_active
                              ? "text-amber-700 hover:bg-amber-50"
                              : "text-emerald-700 hover:bg-emerald-50"
                          }`}
                        >
                          <Power size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteStaff(member)}
                          disabled={deletingId === member.id}
                          title="Delete staff"
                          className="rounded-lg p-2 text-stone-400 hover:bg-red-50 hover:text-red-700 transition cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Staff Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-2xs"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) closeModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-modal-title"
            className="my-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Modal Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-100 bg-white px-6 py-4">
              <div>
                <h2
                  id="staff-modal-title"
                  className="text-lg font-bold text-[#1C1917]"
                >
                  {editingStaff ? "Edit Staff Details" : "Add New Staff"}
                </h2>

                <p className="mt-0.5 text-xs text-stone-500">
                  {editingStaff
                    ? "Update employee information."
                    : "Register a new restaurant staff account."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                aria-label="Close"
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} noValidate className="space-y-4 p-6">
              {formError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700"
                >
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  label="Full Name"
                  icon={<Users size={16} />}
                  name="full_name"
                  value={form.full_name}
                  onChange={handleChange}
                  placeholder="e.g. Amit Kumar"
                  error={fieldErrors.full_name}
                  maxLength={100}
                  autoComplete="name"
                />

                <FormField
                  label="Email Address"
                  icon={<Mail size={16} />}
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="employee@dineflow.com"
                  error={fieldErrors.email}
                  autoComplete="off"
                />

                <FormField
                  label="Employee Code"
                  icon={<Hash size={16} />}
                  name="employee_code"
                  value={form.employee_code}
                  onChange={handleChange}
                  placeholder="e.g. EMP-101"
                  error={fieldErrors.employee_code}
                  autoComplete="off"
                />

                <FormField
                  label="Phone Number"
                  icon={<Phone size={16} />}
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="e.g. 9876543210"
                  error={fieldErrors.phone}
                  autoComplete="tel"
                  maxLength={10}
                  inputMode="numeric"
                />

                <FormField
                  label="Designation"
                  icon={<Briefcase size={16} />}
                  name="designation"
                  value={form.designation}
                  onChange={handleChange}
                  placeholder="e.g. Server, Chef, Bartender"
                  error={fieldErrors.designation}
                  autoComplete="off"
                />

                <FormField
                  label="Joining Date"
                  icon={<CalendarDays size={16} />}
                  name="joining_date"
                  type="date"
                  value={form.joining_date}
                  onChange={handleChange}
                  error={fieldErrors.joining_date}
                  optional
                />
              </div>

              <div className="flex flex-col-reverse justify-end gap-3 border-t border-stone-100 pt-4 sm:flex-row">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-lg border border-stone-300 bg-white px-5 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center justify-center gap-2 rounded-lg bg-[#F5B716] px-5 py-2 text-sm font-bold text-[#1C1917] hover:bg-[#E5A910] disabled:opacity-60 transition cursor-pointer shadow-xs"
                >
                  {saving
                    ? "Saving..."
                    : editingStaff
                      ? "Save Changes"
                      : "Create Staff"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Staff Modal */}
      {showViewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-2xs"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeViewModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="view-modal-title"
            className="my-auto w-full max-w-lg rounded-2xl border border-stone-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
              <div>
                <h2
                  id="view-modal-title"
                  className="text-lg font-bold text-[#1C1917]"
                >
                  Staff Member Details
                </h2>
                <p className="mt-0.5 text-xs text-stone-500">
                  Profile information and employment credentials
                </p>
              </div>

              <button
                type="button"
                onClick={closeViewModal}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition cursor-pointer"
                aria-label="Close staff details"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {viewLoading ? (
                <p className="py-10 text-center text-sm text-stone-500">
                  Loading staff details...
                </p>
              ) : viewError ? (
                <p
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700"
                >
                  {viewError}
                </p>
              ) : viewingStaff ? (
                <div className="space-y-5">
                  {/* Employee Profile Header */}
                  <div className="flex items-center gap-4 rounded-xl border border-stone-200 bg-stone-50/70 p-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#FEF08A] border border-[#FDE047] text-lg font-bold text-[#854D0E] shadow-2xs">
                      {viewingStaff.full_name?.charAt(0)?.toUpperCase() || "—"}
                    </div>

                    <div>
                      <h3 className="font-bold text-[#1C1917]">
                        {viewingStaff.full_name}
                      </h3>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {viewingStaff.designation || "Staff"}
                      </p>

                      <span
                        className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          viewingStaff.is_active
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : "bg-stone-100 text-stone-600 border border-stone-200"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${viewingStaff.is_active ? "bg-emerald-600" : "bg-stone-400"}`} />
                        <span>{viewingStaff.is_active ? "Active" : "Inactive"}</span>
                      </span>
                    </div>
                  </div>

                  {/* Employee Information */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <DetailItem label="Employee ID" value={viewingStaff.id} />
                    <DetailItem label="Employee Code" value={viewingStaff.employee_code} />
                    <DetailItem label="Email Address" value={viewingStaff.email} />
                    <DetailItem label="Phone Number" value={viewingStaff.phone} />
                    <DetailItem label="Designation" value={viewingStaff.designation} />
                    <DetailItem label="Joining Date" value={formatDate(viewingStaff.joining_date)} />
                  </div>
                </div>
              ) : null}
            </div>

            {/* Footer */}
            <div className="flex justify-end border-t border-stone-100 px-6 py-3">
              <button
                type="button"
                onClick={closeViewModal}
                className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact statistics card, also used as a status filter
function StatCard({ title, value, icon, active, onClick, badgeColor }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`Show ${title.toLowerCase()}`}
      className={`flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-left transition-all duration-200 cursor-pointer shadow-xs ${
        active
          ? "border-[#F5B716] bg-[#FEF9C3]/40 ring-1 ring-[#F5B716]"
          : "border-stone-200/90 bg-white hover:border-stone-300"
      }`}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">{title}</p>
        <p className="mt-1 text-2xl font-bold text-[#1C1917]">{value}</p>
      </div>

      <div className={`rounded-xl p-2.5 ${badgeColor || "bg-[#FEF9C3] text-amber-900 border border-yellow-200"}`}>
        {icon}
      </div>
    </button>
  );
}

// Reusable form input with inline error support
function FormField({
  label,
  icon,
  name,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  maxLength,
  autoComplete,
  inputMode,
  optional = false,
}) {
  const inputId = `staff-${name}`;
  const errorId = `${inputId}-error`;

  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-700"
      >
        {label}
        {optional ? (
          <span className="ml-1 text-[11px] font-normal text-stone-400">
            (optional)
          </span>
        ) : (
          <span className="text-red-500 ml-0.5">*</span>
        )}
      </label>

      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
          {icon}
        </span>

        <input
          id={inputId}
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete={autoComplete}
          inputMode={inputMode}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={`w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-sm text-stone-900 outline-none transition focus:ring-2 ${
            error
              ? "border-red-400 focus:border-red-400 focus:ring-red-100"
              : "border-stone-300 focus:border-[#F5B716] focus:ring-[#F5B716]/30"
          }`}
        />
      </div>

      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

// Reusable staff detail item
function DetailItem({ label, value }) {
  return (
    <div className="rounded-lg border border-stone-100 bg-stone-50/70 p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-500">
        {label}
      </p>
      <p className="break-words text-sm font-semibold text-[#1C1917]">
        {value || "—"}
      </p>
    </div>
  );
}
