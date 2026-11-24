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
  uploadStaffImage,
  deleteStaffImage,
} from "../services/staffService";
import ProfilePhotoUpload from "../components/ProfilePhotoUpload";
import AuthenticatedImage from "../components/AuthenticatedImage";
import { useNotification } from "../context/NotificationContext";
import PageHeader from "../components/PageHeader";
import Modal from "../components/Modal";
import StatCard from "../components/StatCard";
import Pagination from "../components/Pagination";
import BulkSelectionBar from "../components/BulkSelectionBar";
import useBulkSelection from "../hooks/useBulkSelection";

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
  const { showSuccess, showUpdate, showDelete, showError, confirm } = useNotification();
  const [staff, setStaff] = useState([]);
  const { selectedIds, toggle, toggleMany, clear } = useBulkSelection();
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
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [isImageRemoved, setIsImageRemoved] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Pagination (10 per page)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [formError, setFormError] = useState("");

  const loadStaff = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);

    try {
      const data = await getAllStaff();
      setStaff(Array.isArray(data) ? data : []);
    } catch (error) {
      showError(getErrorMessage(error), "Failed to Load Staff");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const closeModal = useCallback(() => {
    if (saving) return;
    setShowModal(false);
    setEditingStaff(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError("");
    setSelectedImageFile(null);
    setIsImageRemoved(false);
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

  const totalPages = Math.max(1, Math.ceil(filteredStaff.length / pageSize));
  const paginatedStaff = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStaff.slice(start, start + pageSize);
  }, [filteredStaff, currentPage, pageSize]);

  const hasActiveFilters = Boolean(search.trim()) || statusFilter !== "ALL";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("ALL");
    setCurrentPage(1);
  };

  const openAddModal = () => {
    setEditingStaff(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError("");
    setSelectedImageFile(null);
    setIsImageRemoved(false);
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
    setSelectedImageFile(null);
    setIsImageRemoved(false);
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
      let staffId;
      if (editingStaff) {
        await updateStaff(editingStaff.id, staffData);
        staffId = editingStaff.id;

        if (selectedImageFile) {
          await uploadStaffImage(staffId, selectedImageFile);
        } else if (isImageRemoved) {
          await deleteStaffImage(staffId);
        }

        showUpdate(`${staffData.full_name}'s details updated successfully.`, "Staff Updated");
      } else {
        const created = await createStaff(staffData);
        staffId = created?.id;

        if (selectedImageFile && staffId) {
          await uploadStaffImage(staffId, selectedImageFile);
        }

        showSuccess(`Staff member ${staffData.full_name} registered successfully.`, "Staff Created");
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

      showUpdate(`${member.full_name} has been ${action}d successfully.`, "Staff Status Updated");
    } catch (error) {
      showError(getErrorMessage(error), "Status Update Failed");
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

    setDeletingId(member.id);

    try {
      const result = await deleteStaff(member.id);
      setStaff((previous) => previous.filter((item) => item.id !== member.id));
      const msg = result?.message || `${member.full_name} was deleted successfully.`;
      showDelete(msg, "Staff Member Deleted");
    } catch (error) {
      showError(getErrorMessage(error), "Delete Failed");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteSelectedStaff = async () => {
    const targets = staff.filter((member) => selectedIds.has(member.id));
    const confirmed = await confirm({
      title: "Delete Selected Staff",
      message: `Delete ${targets.length} selected staff record(s)? Accounts referenced by business records may be deactivated or protected.`,
      confirmText: "Delete Selected",
      variant: "danger",
    });
    if (!confirmed) return;
    const results = await Promise.allSettled(targets.map((member) => deleteStaff(member.id)));
    const deletedIds = targets.filter((_, index) => results[index].status === "fulfilled").map((member) => member.id);
    setStaff((previous) => previous.filter((member) => !deletedIds.includes(member.id)));
    clear();
    if (deletedIds.length) showDelete(`${deletedIds.length} staff record(s) processed.`, "Staff Updated");
    if (deletedIds.length < targets.length) showError(`${targets.length - deletedIds.length} staff record(s) could not be deleted.`, "Some Deletions Failed");
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
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] px-4 py-2.5 text-sm font-bold text-[#0D1420] shadow-xs transition hover:opacity-95 cursor-pointer"
          >
            <Plus size={17} />
            <span>Add New Staff</span>
          </button>
        }
      />

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 min-[380px]:grid-cols-3 gap-2 sm:gap-3.5">
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
      <BulkSelectionBar count={selectedIds.size} onDelete={handleDeleteSelectedStaff} onClear={clear} />
      <div className="overflow-hidden rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] shadow-xs">
        <div className="flex flex-col gap-3 border-b border-[#E5E9F0] dark:border-[#1E293B] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-stone-900 dark:text-white">Staff Directory</h2>
            <p className="mt-0.5 text-xs text-stone-500 dark:text-[#8A9AB2]">
              {filteredStaff.length} {filteredStaff.length === 1 ? "employee" : "employees"} listed
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-[#8A9AB2]"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search name, code, designation..."
                aria-label="Search staff"
                className="w-full rounded-lg border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#151D29] py-2 pl-9 pr-3 text-sm text-stone-900 dark:text-white outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/30 sm:w-64"
              />
            </div>

            <button
              type="button"
              onClick={() => loadStaff()}
              disabled={loading}
              title="Refresh staff list"
              aria-label="Refresh staff list"
              className="flex items-center justify-center rounded-lg border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#151D29] p-2 text-stone-600 dark:text-[#8A9AB2] transition hover:bg-stone-50 dark:hover:bg-[#101722] disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Staff Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-stone-50/80 dark:bg-stone-900/60 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              <tr>
                <th className="px-4 py-3 text-center"><input type="checkbox" aria-label="Select all staff on this page" checked={paginatedStaff.length > 0 && paginatedStaff.every((member) => selectedIds.has(member.id))} onChange={() => toggleMany(paginatedStaff.map((member) => member.id))} className="h-4 w-4 accent-amber-500" /></th>
                <th className="px-4 py-3">Employee</th>
                <th className="hidden whitespace-nowrap px-4 py-3 md:table-cell">Code</th>
                <th className="hidden whitespace-nowrap px-4 py-3 md:table-cell">Designation</th>
                <th className="hidden whitespace-nowrap px-4 py-3 lg:table-cell">Joining Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-stone-100 dark:divide-stone-800 text-sm">
              {loading ? (
                <tr>
                  <td
                    colSpan="7"
                    className="px-4 py-12 text-center text-sm text-stone-500 dark:text-stone-400"
                  >
                    Loading staff records...
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td
                    colSpan="7"
                    className="px-4 py-12 text-center text-sm text-stone-500 dark:text-stone-400"
                  >
                    <p>No staff members found.</p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="mt-2 font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                      >
                        Clear search and filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedStaff.map((member) => (
                  <tr key={member.id} className="transition hover:bg-stone-50/70 dark:hover:bg-stone-800/40">
                    <td className="px-4 py-3 text-center"><input type="checkbox" aria-label={`Select staff ${member.full_name}`} checked={selectedIds.has(member.id)} onChange={() => toggle(member.id)} className="h-4 w-4 accent-amber-500" /></td>
                    {/* Employee Details */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#FFB02E] to-[#D97706] text-[#0D1420] font-bold border border-[#F59E0B]/50 text-sm shadow-2xs">
                          <AuthenticatedImage
                            src={member.image_url}
                            alt={member.full_name}
                            fallback={(member.full_name || "?").charAt(0).toUpperCase()}
                          />
                        </div>

                        <div className="min-w-0">
                          <p className="truncate font-semibold text-stone-900 dark:text-white">
                            {member.full_name}
                          </p>
                          <p className="truncate text-xs text-stone-500 dark:text-stone-400">
                            {member.email}
                          </p>
                          <p className="truncate text-xs text-stone-400 dark:text-stone-500 md:hidden">
                            {[member.employee_code, member.designation]
                              .filter(Boolean)
                              .join(" • ")}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Employee Code */}
                    <td className="hidden whitespace-nowrap px-4 py-3 font-mono text-xs text-stone-700 dark:text-stone-300 md:table-cell">
                      {member.employee_code || "—"}
                    </td>

                    {/* Designation */}
                    <td className="hidden whitespace-nowrap px-4 py-3 text-sm font-medium text-stone-700 dark:text-stone-300 md:table-cell">
                      {member.designation || "—"}
                    </td>

                    {/* Joining Date */}
                    <td className="hidden whitespace-nowrap px-4 py-3 text-xs text-stone-500 dark:text-stone-400 lg:table-cell">
                      {formatDate(member.joining_date)}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          member.is_active
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
                            : "bg-stone-100 text-stone-500 border border-stone-200 dark:bg-stone-800 dark:border-stone-700 dark:text-stone-400"
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
                          className="rounded-lg p-2 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-white transition cursor-pointer"
                        >
                          <Eye size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditModal(member)}
                          title="Edit staff"
                          aria-label={`Edit ${member.full_name}`}
                          className="rounded-lg p-2 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-white transition cursor-pointer"
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

        {/* PAGINATION (10 per page) */}
        <div className="p-4 border-t border-[#E5E9F0] dark:border-[#1E293B]">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={filteredStaff.length}
            pageSize={pageSize}
            onPageChange={(p) => setCurrentPage(p)}
          />
        </div>
      </div>

      {/* Add / Edit Staff Modal */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingStaff ? "Edit Staff Details" : "Add New Staff"}
        subtitle={
          editingStaff
            ? "Update employee information."
            : "Register a new restaurant staff account."
        }
        size="md"
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300"
            >
              {formError}
            </div>
          )}

          <div className="flex justify-center pb-2">
            <ProfilePhotoUpload
              currentImageUrl={editingStaff?.image_url}
              name={form.full_name}
              selectedFile={selectedImageFile}
              onImageSelected={(file) => {
                setSelectedImageFile(file);
                setIsImageRemoved(false);
              }}
              onImageRemoved={() => {
                setSelectedImageFile(null);
                setIsImageRemoved(true);
              }}
              isRemoved={isImageRemoved}
              disabled={saving}
              onError={(msg) => showError(msg, "Invalid Photo")}
            />
          </div>

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

          <div className="flex flex-col-reverse justify-end gap-3 border-t border-stone-100 dark:border-stone-800 pt-4 sm:flex-row">
            <button
              type="button"
              onClick={closeModal}
              disabled={saving}
              className="rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#29231F] px-5 py-2 text-sm font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] px-5 py-2 text-sm font-bold text-[#0D1420] hover:opacity-95 disabled:opacity-60 transition cursor-pointer shadow-xs"
            >
              {saving
                ? "Saving..."
                : editingStaff
                  ? "Save Changes"
                  : "Create Staff"}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Staff Modal */}
      <Modal
        isOpen={showViewModal}
        onClose={closeViewModal}
        title="Staff Member Details"
        subtitle="Profile information and employment credentials"
        size="md"
      >
        <div>
          {viewLoading ? (
            <p className="py-10 text-center text-sm text-stone-500 dark:text-stone-400">
              Loading staff details...
            </p>
          ) : viewError ? (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300"
            >
              {viewError}
            </p>
          ) : viewingStaff ? (
            <div className="space-y-5">
              {/* Employee Profile Header */}
              <div className="flex items-center gap-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/40 p-4">
                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#FFB02E] to-[#D97706] text-[#0D1420] font-bold border border-[#F59E0B]/50 text-xl shadow-2xs">
                  <AuthenticatedImage
                    src={viewingStaff.image_url}
                    alt={viewingStaff.full_name}
                    fallback={viewingStaff.full_name?.charAt(0)?.toUpperCase() || "—"}
                  />
                </div>

                <div>
                  <h3 className="font-bold text-stone-900 dark:text-white">
                    {viewingStaff.full_name}
                  </h3>
                  <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                    {viewingStaff.designation || "Staff"}
                  </p>

                  <span
                    className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      viewingStaff.is_active
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
                        : "bg-stone-100 text-stone-600 border border-stone-200 dark:bg-stone-800 dark:border-stone-700 dark:text-stone-400"
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

          <div className="mt-6 flex justify-end border-t border-stone-100 dark:border-stone-800 pt-3">
            <button
              type="button"
              onClick={closeViewModal}
              className="rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#29231F] px-4 py-2 text-sm font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
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
        className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300"
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
          className={`w-full rounded-lg border bg-white dark:bg-[#29231F] py-2 pl-9 pr-3 text-sm text-stone-900 dark:text-white outline-none transition focus:ring-2 ${
            error
              ? "border-red-400 focus:border-red-400 focus:ring-red-100 dark:focus:ring-red-950/40"
              : "border-stone-300 dark:border-stone-700 focus:border-[#F59E0B] focus:ring-[#F59E0B]/30"
          }`}
        />
      </div>

      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

// Reusable staff detail item
function DetailItem({ label, value }) {
  return (
    <div className="rounded-lg border border-stone-100 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/40 p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
        {label}
      </p>
      <p className="break-words text-sm font-semibold text-stone-900 dark:text-white">
        {value || "—"}
      </p>
    </div>
  );
}
