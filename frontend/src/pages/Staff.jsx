import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Users,
  UserCheck,
  UserX,
  Plus,
  Search,
  Pencil,
  Eye,
  Power,
  Trash2,
  X,
  RefreshCw,
  Mail,
  Phone,
  Briefcase,
  CalendarDays,
  Hash,
  Lock,
  KeyRound,
} from "lucide-react";

import {
  getAllStaff,
  getStaffById,
  createStaff,
  updateStaff,
  updateStaffStatus,
  deleteStaff,
  resetStaffPassword,
} from "../services/staffService";

const EMPTY_FORM = {
  full_name: "",
  email: "",
  password: "",
  employee_code: "",
  phone: "",
  designation: "",
  joining_date: "",
};

const MIN_PASSWORD_LENGTH = 12;

// ---------- Helpers ----------

const getErrorMessage = (error) => {
  // Request never reached the server
  if (error && !error.response) {
    return "Unable to connect to the server. Please try again.";
  }

  const detail = error?.response?.data?.detail;

  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).join(", ");
  }

  if (typeof detail === "string") {
    return detail;
  }

  if (error?.response?.status === 403) {
    return "You do not have permission to perform this action.";
  }

  return "Something went wrong. Please try again.";
};

// Accepts "YYYY-MM-DD" or a full ISO datetime string
const toDateInputValue = (date) => (date ? String(date).slice(0, 10) : "");

const formatDate = (date) => {
  if (!date) return "—";

  const parsed = new Date(`${toDateInputValue(date)}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Validates the staff form and returns an object of field errors.
const validateStaffForm = (form, isEditing) => {
  const errors = {};

  const fullName = form.full_name.trim();
  if (!fullName) errors.full_name = "Full name is required.";
  else if (fullName.length < 2)
    errors.full_name = "Full name must be at least 2 characters.";
  else if (fullName.length > 100)
    errors.full_name = "Full name must be 100 characters or less.";

  const email = form.email.trim();
  if (!email) errors.email = "Email is required.";
  else if (!EMAIL_REGEX.test(email))
    errors.email = "Please enter a valid email address.";

  if (!isEditing) {
    if (!form.password) errors.password = "Password is required.";
    else if (form.password.length < MIN_PASSWORD_LENGTH)
      errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  const code = form.employee_code.trim();
  if (!code) errors.employee_code = "Employee code is required.";
  else if (code.length < 2)
    errors.employee_code = "Employee code must be at least 2 characters.";

  const phone = form.phone.trim();
  if (!phone) errors.phone = "Phone number is required.";
  else if (!/^[6-9]\d{9}$/.test(phone))
    errors.phone = "Enter a valid 10-digit mobile number starting with 6–9.";

  const designation = form.designation.trim();
  if (!designation) errors.designation = "Designation is required.";
  else if (designation.length < 2)
    errors.designation = "Designation must be at least 2 characters.";

  if (form.joining_date && Number.isNaN(new Date(form.joining_date).getTime()))
    errors.joining_date = "Enter a valid date.";

  return errors;
};

export default function Staff() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);

  // View staff modal state
  const [showViewModal, setShowViewModal] = useState(false);

  // Reset password modal state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resettingStaff, setResettingStaff] = useState(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSaving, setResetSaving] = useState(false);
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

  // Fetch staff records. "silent" refreshes data without the loading state,
  // so the table does not flash after create / update.
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

  // Auto-dismiss the success message
  useEffect(() => {
    if (!successMessage) return undefined;

    const timer = setTimeout(() => setSuccessMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  // Escape key closes modals, and background scroll is locked while open
  const modalOpen = showModal || showViewModal || showResetModal;

  useEffect(() => {
    if (!modalOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;

      if (showResetModal && !resetSaving) closeResetModal();
      else if (showViewModal) closeViewModal();
      else if (!saving) closeModal();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, showViewModal, saving]);

  // Staff statistics
  const { activeCount, inactiveCount } = useMemo(() => {
    const active = staff.filter((member) => member.is_active).length;
    return { activeCount: active, inactiveCount: staff.length - active };
  }, [staff]);

  // Search and filter
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

  // ---------- Add / Edit modal ----------

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

  function closeModal() {
    if (saving) return;

    setShowModal(false);
    setEditingStaff(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError("");
  }

  // ---------- Reset password modal ----------
  const openResetModal = (member) => {
    setResettingStaff(member);
    setResetPassword("");
    setResetConfirmPassword("");
    setResetError("");
    setShowResetModal(true);
  };

  const closeResetModal = () => {
    setShowResetModal(false);
    setResettingStaff(null);
    setResetPassword("");
    setResetConfirmPassword("");
    setResetError("");
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!resettingStaff) return;
    if (!resetPassword) {
      setResetError("Please enter a new password.");
      return;
    }
    if (resetPassword.length < 12) {
      setResetError("Password must be at least 12 characters.");
      return;
    }
    if (resetPassword !== resetConfirmPassword) {
      setResetError("Passwords do not match.");
      return;
    }
    setResetSaving(true);
    setResetError("");
    try {
      await resetStaffPassword(resettingStaff.id, resetPassword);
      setSuccessMessage(`Password for ${resettingStaff.full_name} was reset successfully.`);
      closeResetModal();
    } catch (err) {
      setResetError(getErrorMessage(err));
    } finally {
      setResetSaving(false);
    }
  };

  // ---------- View modal ----------

  const openViewModal = async (member) => {
    const requestId = ++viewRequestId.current;

    setShowViewModal(true);
    setViewingStaff(null);
    setViewError("");
    setViewLoading(true);

    try {
      const data = await getStaffById(member.id);

      // Ignore the response if the modal was closed or reopened meanwhile
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

  // ---------- Form handling ----------

  const handleChange = (event) => {
    const { name, value } = event.target;
    const nextValue =
      name === "phone" ? value.replace(/\D/g, "").slice(0, 10) : value;

    setForm((previous) => ({ ...previous, [name]: nextValue }));

    // Clear only the error of the field being edited
    setFieldErrors((previous) =>
      previous[name] ? { ...previous, [name]: "" } : previous,
    );
    setFormError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;

    setFormError("");

    const errors = validateStaffForm(form, Boolean(editingStaff));
    setFieldErrors(errors);

    if (Object.values(errors).some(Boolean)) {
      // Focus the first invalid field
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
        setSuccessMessage("Staff details updated successfully.");
      } else {
        await createStaff({ ...staffData, password: form.password });
        setSuccessMessage("Staff member created successfully.");
      }

      setShowModal(false);
      setForm(EMPTY_FORM);
      setEditingStaff(null);
      setFieldErrors({});

      await loadStaff({ silent: true });
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  // ---------- Activate / deactivate ----------

  const handleStatusChange = async (member) => {
    if (statusUpdatingId) return;

    const action = member.is_active ? "deactivate" : "activate";

    const confirmed = window.confirm(
      `Are you sure you want to ${action} ${member.full_name}?`,
    );

    if (!confirmed) return;

    setPageError("");
    setSuccessMessage("");
    setStatusUpdatingId(member.id);

    try {
      const result = await updateStaffStatus(member.id, !member.is_active);

      // Use the API response when it returns the staff record,
      // otherwise fall back to toggling the status locally.
      const updatedMember =
        result && typeof result === "object" && result.id
          ? result
          : { ...member, is_active: !member.is_active };

      setStaff((previous) =>
        previous.map((item) => (item.id === member.id ? updatedMember : item)),
      );

      setSuccessMessage(
        `${member.full_name} has been ${action}d successfully.`,
      );
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleDeleteStaff = async (member) => {
    if (deletingId || statusUpdatingId) return;

    const confirmed = window.confirm(
      `Delete ${member.full_name} from staff management? This cannot be undone.`,
    );

    if (!confirmed) return;

    setPageError("");
    setSuccessMessage("");
    setDeletingId(member.id);

    try {
      const result = await deleteStaff(member.id);
      setStaff((previous) => previous.filter((item) => item.id !== member.id));
      setSuccessMessage(
        result?.message || `${member.full_name} was deleted successfully.`,
      );
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="w-full bg-[#F7F5F0] p-4 md:p-6">
      {/* Page Heading */}
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-[#C65D35]">
            Restaurant Administration
          </p>

          <h1 className="text-xl font-semibold text-[#29231F] md:text-2xl">
            Staff Management
          </h1>

          <p className="mt-1 text-sm text-[#8A817B]">
            Manage restaurant employees and their account status.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#C65D35] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#A94B2B]"
        >
          <Plus size={17} />
          Add New Staff
        </button>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div
          role="status"
          className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[#E9E3DA] border-l-4 border-l-[#C65D35] bg-white px-4 py-2.5 text-sm text-[#29231F]"
        >
          <span>{successMessage}</span>

          <button
            type="button"
            onClick={() => setSuccessMessage("")}
            aria-label="Dismiss message"
            className="text-[#8A817B] hover:text-[#29231F]"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Error Message */}
      {pageError && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700"
        >
          <span>{pageError}</span>

          <button
            type="button"
            onClick={() => setPageError("")}
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Statistics Cards (compact, also act as filters) */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          title="Total Staff"
          value={staff.length}
          icon={<Users size={16} />}
          active={statusFilter === "ALL"}
          onClick={() => setStatusFilter("ALL")}
        />

        <StatCard
          title="Active Staff"
          value={activeCount}
          icon={<UserCheck size={16} />}
          active={statusFilter === "ACTIVE"}
          onClick={() => setStatusFilter("ACTIVE")}
        />

        <StatCard
          title="Inactive Staff"
          value={inactiveCount}
          icon={<UserX size={16} />}
          active={statusFilter === "INACTIVE"}
          onClick={() => setStatusFilter("INACTIVE")}
        />
      </div>

      {/* Staff Table Section */}
      <div className="overflow-hidden rounded-xl border border-[#E9E3DA] bg-white">
        {/* Search and Filter */}
        <div className="flex flex-col gap-3 border-b border-[#EEE9E2] px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#29231F]">
              Restaurant Staff
            </h2>

            <p className="mt-0.5 text-xs text-[#8A817B]">
              {filteredStaff.length} staff{" "}
              {filteredStaff.length === 1 ? "member" : "members"} found
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A817B]"
              />

              <input
                type="text"
                placeholder="Search staff..."
                aria-label="Search staff"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-lg border border-[#E9E3DA] bg-white py-2 pl-9 pr-8 text-sm text-[#29231F] outline-none focus:border-[#C65D35] sm:w-60"
              />

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A817B] hover:text-[#29231F]"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <select
              value={statusFilter}
              aria-label="Filter by status"
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-lg border border-[#E9E3DA] bg-white px-3 py-2 text-sm text-[#29231F] outline-none focus:border-[#C65D35]"
            >
              <option value="ALL">All Staff</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>

            <button
              type="button"
              onClick={() => loadStaff()}
              disabled={loading}
              title="Refresh staff list"
              aria-label="Refresh staff list"
              className="flex items-center justify-center rounded-lg border border-[#E9E3DA] px-3 py-2 text-[#29231F] transition hover:bg-[#F7F5F0] disabled:opacity-60"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Staff Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#FAF9F6] text-xs uppercase tracking-wide text-[#8A817B]">
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="hidden whitespace-nowrap px-4 py-3 font-medium md:table-cell">
                  Code
                </th>
                <th className="hidden whitespace-nowrap px-4 py-3 font-medium md:table-cell">
                  Designation
                </th>
                <th className="hidden whitespace-nowrap px-4 py-3 font-medium lg:table-cell">
                  Joining Date
                </th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-center font-medium">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F0ECE6]">
              {loading ? (
                <tr>
                  <td
                    colSpan="6"
                    className="px-4 py-10 text-center text-sm text-[#8A817B]"
                  >
                    Loading staff records...
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td
                    colSpan="6"
                    className="px-4 py-10 text-center text-sm text-[#8A817B]"
                  >
                    <p>No staff members found.</p>

                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="mt-2 font-medium text-[#C65D35] hover:underline"
                      >
                        Clear search and filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredStaff.map((member) => (
                  <tr key={member.id} className="transition hover:bg-[#FAF9F6]">
                    {/* Employee Details */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F5E5DC] text-sm font-semibold text-[#C65D35]">
                          {(member.full_name || "?").charAt(0).toUpperCase()}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[#29231F]">
                            {member.full_name}
                          </p>

                          <p className="truncate text-xs text-[#8A817B]">
                            {member.email}
                          </p>

                          {/* Shown only when the Code / Designation columns are hidden */}
                          <p className="truncate text-xs text-[#8A817B] md:hidden">
                            {[member.employee_code, member.designation]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Employee Code */}
                    <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-[#29231F] md:table-cell">
                      {member.employee_code || "—"}
                    </td>

                    {/* Designation */}
                    <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-[#29231F] md:table-cell">
                      {member.designation || "—"}
                    </td>

                    {/* Joining Date */}
                    <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-[#29231F] lg:table-cell">
                      {formatDate(member.joining_date)}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
                          member.is_active
                            ? "bg-[#F5E5DC] text-[#A94B2B]"
                            : "bg-[#EEEAE4] text-[#6B625B]"
                        }`}
                      >
                        {member.is_active ? "Active" : "Inactive"}
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
                          className="rounded-lg p-2 text-[#29231F] transition hover:bg-[#F5E5DC] hover:text-[#C65D35]"
                        >
                          <Eye size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() => openResetModal(member)}
                          title="Reset password"
                          aria-label={`Reset password for ${member.full_name}`}
                          className="rounded-lg p-2 text-[#29231F] transition hover:bg-[#F5E5DC] hover:text-[#C65D35]"
                        >
                          <KeyRound size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditModal(member)}
                          title="Edit staff"
                          aria-label={`Edit ${member.full_name}`}
                          className="rounded-lg p-2 text-[#29231F] transition hover:bg-[#F5E5DC] hover:text-[#C65D35]"
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStatusChange(member)}
                          disabled={statusUpdatingId === member.id}
                          title={
                            member.is_active
                              ? "Deactivate staff"
                              : "Activate staff"
                          }
                          aria-label={`${
                            member.is_active ? "Deactivate" : "Activate"
                          } ${member.full_name}`}
                          className={`rounded-lg p-2 transition hover:bg-[#F5E5DC] hover:text-[#C65D35] disabled:cursor-not-allowed disabled:opacity-50 ${
                            member.is_active
                              ? "text-[#29231F]"
                              : "text-[#8A817B]"
                          }`}
                        >
                          <Power
                            size={16}
                            className={
                              statusUpdatingId === member.id
                                ? "animate-pulse"
                                : ""
                            }
                          />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteStaff(member)}
                          disabled={deletingId === member.id || statusUpdatingId === member.id}
                          title="Delete staff"
                          aria-label={`Delete ${member.full_name}`}
                          className="rounded-lg p-2 text-red-600 transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2
                            size={16}
                            className={deletingId === member.id ? "animate-pulse" : ""}
                          />
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
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#29231F]/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-modal-title"
            className="my-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl"
          >
            {/* Modal Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#EEE9E2] bg-white px-6 py-4">
              <div>
                <h2
                  id="staff-modal-title"
                  className="text-lg font-semibold text-[#29231F]"
                >
                  {editingStaff ? "Edit Staff Details" : "Add New Staff"}
                </h2>

                <p className="mt-0.5 text-xs text-[#8A817B]">
                  {editingStaff
                    ? "Update employee information."
                    : "Create a new restaurant staff account."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                aria-label="Close"
                className="rounded-lg p-2 text-[#8A817B] hover:bg-[#F7F5F0] disabled:opacity-50"
              >
                <X size={19} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} noValidate className="space-y-5 p-6">
              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
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
                  placeholder="Enter full name"
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
                  placeholder="employee@example.com"
                  error={fieldErrors.email}
                  autoComplete="off"
                />

                {!editingStaff && (
                  <FormField
                    label="Password"
                    icon={<Lock size={16} />}
                    name="password"
                    type="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder={`Minimum ${MIN_PASSWORD_LENGTH} characters`}
                    error={fieldErrors.password}
                    autoComplete="new-password"
                  />
                )}

                <FormField
                  label="Employee Code"
                  icon={<Hash size={16} />}
                  name="employee_code"
                  value={form.employee_code}
                  onChange={handleChange}
                  placeholder="Enter employee code"
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
                  placeholder="Enter phone number"
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
                  placeholder="e.g. Waiter, Chef"
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

              <div className="flex flex-col-reverse justify-end gap-3 border-t border-[#EEE9E2] pt-4 sm:flex-row">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-lg border border-[#E9E3DA] px-5 py-2.5 text-sm font-medium text-[#29231F] hover:bg-[#F7F5F0] disabled:opacity-60"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center justify-center gap-2 rounded-lg bg-[#C65D35] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#A94B2B] disabled:cursor-not-allowed disabled:opacity-60"
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

      {/* Reset Password Modal */}
      {showResetModal && resettingStaff && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget && !resetSaving) closeResetModal();
          }}
        >
          <div
            className="my-auto w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between border-b border-[#EEE9E2] px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-[#29231F]">
                  Reset Staff Password
                </h2>
                <p className="text-xs text-[#8A817B]">
                  Set a new password for {resettingStaff.full_name} ({resettingStaff.email})
                </p>
              </div>

              <button
                type="button"
                onClick={closeResetModal}
                disabled={resetSaving}
                className="rounded-lg p-1 text-[#8A817B] transition hover:bg-[#F7F5F0] hover:text-[#29231F]"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-4 p-6">
              {resetError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {resetError}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-[#8A817B]">
                  New Password <span className="text-[#C65D35]">*</span>
                </label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="Minimum 12 characters"
                  className="w-full rounded-lg border border-[#E9E3DA] px-3.5 py-2.5 text-sm outline-none focus:border-[#C65D35]"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-[#8A817B]">
                  Confirm New Password <span className="text-[#C65D35]">*</span>
                </label>
                <input
                  type="password"
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full rounded-lg border border-[#E9E3DA] px-3.5 py-2.5 text-sm outline-none focus:border-[#C65D35]"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-[#EEE9E2] pt-4">
                <button
                  type="button"
                  onClick={closeResetModal}
                  disabled={resetSaving}
                  className="rounded-lg border border-[#E9E3DA] px-4 py-2.5 text-sm font-medium text-[#29231F] hover:bg-[#F7F5F0]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetSaving}
                  className="rounded-lg bg-[#C65D35] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#A94B2B] disabled:opacity-60"
                >
                  {resetSaving ? "Resetting..." : "Reset Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Staff Modal */}
      {showViewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#29231F]/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeViewModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="view-modal-title"
            className="my-auto w-full max-w-xl rounded-xl bg-white shadow-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#EEE9E2] px-6 py-4">
              <div>
                <h2
                  id="view-modal-title"
                  className="text-lg font-semibold text-[#29231F]"
                >
                  Staff Details
                </h2>
                <p className="mt-0.5 text-xs text-[#8A817B]">
                  Complete employee information
                </p>
              </div>

              <button
                type="button"
                onClick={closeViewModal}
                className="rounded-lg p-2 text-[#8A817B] hover:bg-[#F7F5F0]"
                aria-label="Close staff details"
              >
                <X size={19} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {viewLoading ? (
                <p className="py-10 text-center text-sm text-[#8A817B]">
                  Loading staff details...
                </p>
              ) : viewError ? (
                <p
                  role="alert"
                  className="rounded-lg bg-red-50 p-4 text-sm text-red-600"
                >
                  {viewError}
                </p>
              ) : viewingStaff ? (
                <div>
                  {/* Employee Profile */}
                  <div className="mb-5 flex items-center gap-4 rounded-lg bg-[#F7F5F0] p-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F5E5DC] text-lg font-semibold text-[#C65D35]">
                      {viewingStaff.full_name?.charAt(0)?.toUpperCase() || "—"}
                    </div>

                    <div>
                      <h3 className="font-semibold text-[#29231F]">
                        {viewingStaff.full_name}
                      </h3>
                      <p className="mt-0.5 text-sm text-[#8A817B]">
                        {viewingStaff.designation || "—"}
                      </p>

                      <span
                        className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
                          viewingStaff.is_active
                            ? "bg-[#F5E5DC] text-[#A94B2B]"
                            : "bg-[#EEEAE4] text-[#6B625B]"
                        }`}
                      >
                        {viewingStaff.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>

                  {/* Employee Information */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <DetailItem label="Employee ID" value={viewingStaff.id} />
                    <DetailItem
                      label="Employee Code"
                      value={viewingStaff.employee_code}
                    />
                    <DetailItem
                      label="Email Address"
                      value={viewingStaff.email}
                    />
                    <DetailItem
                      label="Phone Number"
                      value={viewingStaff.phone}
                    />
                    <DetailItem
                      label="Designation"
                      value={viewingStaff.designation}
                    />
                    <DetailItem
                      label="Joining Date"
                      value={formatDate(viewingStaff.joining_date)}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            {/* Footer */}
            <div className="flex justify-end border-t border-[#EEE9E2] px-6 py-3">
              <button
                type="button"
                onClick={closeViewModal}
                className="rounded-lg bg-[#C65D35] px-5 py-2 text-sm font-medium text-white hover:bg-[#A94B2B]"
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
function StatCard({ title, value, icon, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`Show ${title.toLowerCase()}`}
      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
        active
          ? "border-[#C65D35] bg-[#FFF9F5]"
          : "border-[#E9E3DA] bg-white hover:border-[#C65D35]/50 hover:bg-[#FAF9F6]"
      }`}
    >
      <div>
        <p className="text-xs font-medium text-[#8A817B]">{title}</p>
        <p className="mt-0.5 text-xl font-semibold leading-tight text-[#29231F]">
          {value}
        </p>
      </div>

      <div className="rounded-lg bg-[#F5E5DC] p-2 text-[#C65D35]">{icon}</div>
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
        className="mb-1.5 block text-sm font-medium text-[#29231F]"
      >
        {label}
        {optional && (
          <span className="ml-1 text-xs font-normal text-[#8A817B]">
            (optional)
          </span>
        )}
      </label>

      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8A817B]">
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
          className={`w-full rounded-lg border bg-white py-2.5 pl-10 pr-3 text-sm text-[#29231F] outline-none transition focus:ring-2 ${
            error
              ? "border-red-400 focus:border-red-400 focus:ring-red-100"
              : "border-[#E9E3DA] focus:border-[#C65D35] focus:ring-[#C65D35]/10"
          }`}
        />
      </div>

      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

// Reusable staff detail item
function DetailItem({ label, value }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[#8A817B]">
        {label}
      </p>
      <p className="break-words text-sm font-medium text-[#29231F]">
        {value || "—"}
      </p>
    </div>
  );
}
