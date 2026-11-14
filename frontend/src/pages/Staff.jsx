import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Users,
  UserCheck,
  UserX,
  Plus,
  Search,
  Pencil,
  Power,
  X,
  RefreshCw,
  Mail,
  Phone,
  Briefcase,
  CalendarDays,
  Hash,
} from "lucide-react";

import {
  getAllStaff,
  createStaff,
  updateStaff,
  updateStaffStatus,
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


const formatDate = (date) => {
  if (!date) return "—";

  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};


export default function Staff() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);

  const [form, setForm] = useState(EMPTY_FORM);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [pageError, setPageError] = useState("");
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");


  // Fetch staff records
  const loadStaff = useCallback(async () => {
    setLoading(true);
    setPageError("");

    try {
      const data = await getAllStaff();
      setStaff(data);
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    loadStaff();
  }, [loadStaff]);


  // Calculate staff statistics
  const activeCount = staff.filter((member) => member.is_active).length;

  const inactiveCount = staff.filter(
    (member) => !member.is_active
  ).length;


  // Search and filter
  const filteredStaff = useMemo(() => {
    return staff.filter((member) => {
      const searchValue = search.toLowerCase();

      const matchesSearch =
        member.full_name.toLowerCase().includes(searchValue) ||
        member.email.toLowerCase().includes(searchValue) ||
        member.employee_code.toLowerCase().includes(searchValue) ||
        member.designation.toLowerCase().includes(searchValue);

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && member.is_active) ||
        (statusFilter === "INACTIVE" && !member.is_active);

      return matchesSearch && matchesStatus;
    });
  }, [staff, search, statusFilter]);


  // Open Add Staff modal
  const openAddModal = () => {
    setEditingStaff(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setShowModal(true);
  };


  // Open Edit Staff modal
  const openEditModal = (member) => {
    setEditingStaff(member);

    setForm({
      full_name: member.full_name,
      email: member.email,
      password: "",
      employee_code: member.employee_code,
      phone: member.phone,
      designation: member.designation,
      joining_date: member.joining_date || "",
    });

    setFormError("");
    setShowModal(true);
  };


  // Handle input changes
  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };


  // Create or update staff
  const handleSubmit = async (event) => {
    event.preventDefault();

    setSaving(true);
    setFormError("");

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
        await createStaff({
          ...staffData,
          password: form.password,
        });

        setSuccessMessage("Staff member created successfully.");
      }

      setShowModal(false);
      setForm(EMPTY_FORM);
      setEditingStaff(null);

      await loadStaff();
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };


  // Activate or deactivate staff
  const handleStatusChange = async (member) => {
    const action = member.is_active ? "deactivate" : "activate";

    const confirmed = window.confirm(
      `Are you sure you want to ${action} ${member.full_name}?`
    );

    if (!confirmed) return;

    setPageError("");
    setSuccessMessage("");

    try {
      const updatedMember = await updateStaffStatus(
        member.id,
        !member.is_active
      );

      setStaff((previous) =>
        previous.map((item) =>
          item.id === member.id ? updatedMember : item
        )
      );

      setSuccessMessage(
        `${member.full_name} has been ${action}d successfully.`
      );
    } catch (error) {
      setPageError(getErrorMessage(error));
    }
  };


  return (
    <div className="min-h-screen bg-[#F7F5F0] p-4 md:p-8">

      {/* Page Heading */}
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="mb-1 text-sm font-medium text-[#C65D35]">
            Restaurant Administration
          </p>

          <h1 className="text-2xl font-semibold text-[#29231F] md:text-3xl">
            Staff Management
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            Manage restaurant employees and their account status.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="flex items-center justify-center gap-2 rounded-lg bg-[#C65D35] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#A94B2B]"
        >
          <Plus size={18} />
          Add New Staff
        </button>
      </div>


      {/* Success Message */}
      {successMessage && (
        <div className="mb-5 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMessage}

          <button onClick={() => setSuccessMessage("")}>
            <X size={16} />
          </button>
        </div>
      )}


      {/* Error Message */}
      {pageError && (
        <div className="mb-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {pageError}

          <button onClick={() => setPageError("")}>
            <X size={16} />
          </button>
        </div>
      )}


      {/* Statistics Cards */}
      <div className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-3">

        <StatCard
          title="Total Staff"
          value={staff.length}
          icon={<Users size={21} />}
        />

        <StatCard
          title="Active Staff"
          value={activeCount}
          icon={<UserCheck size={21} />}
        />

        <StatCard
          title="Inactive Staff"
          value={inactiveCount}
          icon={<UserX size={21} />}
        />

      </div>


      {/* Staff Table Section */}
      <div className="overflow-hidden rounded-xl border border-[#E9E3DA] bg-white">

        {/* Search and Filter */}
        <div className="flex flex-col gap-4 border-b border-[#EEE9E2] p-5 md:flex-row md:items-center md:justify-between">

          <div>
            <h2 className="text-lg font-semibold text-[#29231F]">
              Restaurant Staff
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {filteredStaff.length} staff members found
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">

            <div className="relative">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />

              <input
                type="text"
                placeholder="Search staff..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-lg border border-[#E9E3DA] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#C65D35] sm:w-64"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-lg border border-[#E9E3DA] px-3 py-2.5 text-sm text-[#29231F] outline-none focus:border-[#C65D35]"
            >
              <option value="ALL">All Staff</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>

            <button
              onClick={loadStaff}
              disabled={loading}
              title="Refresh staff list"
              className="flex items-center justify-center rounded-lg border border-[#E9E3DA] px-3 py-2.5 text-gray-600 hover:bg-[#F7F5F0]"
            >
              <RefreshCw
                size={17}
                className={loading ? "animate-spin" : ""}
              />
            </button>

          </div>
        </div>


        {/* Staff Table */}
        <div className="overflow-x-auto">

          <table className="w-full min-w-[850px] text-left">

            <thead className="bg-[#FAF9F6] text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-4">Employee</th>
                <th className="px-5 py-4">Employee Code</th>
                <th className="px-5 py-4">Designation</th>
                <th className="px-5 py-4">Joining Date</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-center">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F0ECE6]">

              {loading ? (
                <tr>
                  <td colSpan="6" className="px-5 py-12 text-center text-sm text-gray-500">
                    Loading staff records...
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-5 py-12 text-center text-sm text-gray-500">
                    No staff members found.
                  </td>
                </tr>
              ) : (
                filteredStaff.map((member) => (

                  <tr
                    key={member.id}
                    className="transition hover:bg-[#FAF9F6]"
                  >

                    {/* Employee Details */}
                    <td className="px-5 py-4">

                      <div className="flex items-center gap-3">

                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F5E5DC] font-semibold text-[#C65D35]">
                          {member.full_name.charAt(0).toUpperCase()}
                        </div>

                        <div>
                          <p className="font-medium text-[#29231F]">
                            {member.full_name}
                          </p>

                          <p className="mt-1 text-xs text-gray-500">
                            {member.email}
                          </p>
                        </div>

                      </div>

                    </td>


                    {/* Employee Code */}
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {member.employee_code}
                    </td>


                    {/* Designation */}
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {member.designation}
                    </td>


                    {/* Joining Date */}
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {formatDate(member.joining_date)}
                    </td>


                    {/* Status */}
                    <td className="px-5 py-4">

                      <span
                        className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                          member.is_active
                            ? "bg-green-50 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {member.is_active ? "Active" : "Inactive"}
                      </span>

                    </td>


                    {/* Actions */}
                    <td className="px-5 py-4">

                      <div className="flex items-center justify-center gap-2">

                        <button
                          onClick={() => openEditModal(member)}
                          title="Edit staff"
                          className="rounded-lg p-2 text-gray-500 transition hover:bg-[#F5E5DC] hover:text-[#C65D35]"
                        >
                          <Pencil size={17} />
                        </button>

                        <button
                          onClick={() => handleStatusChange(member)}
                          title={member.is_active ? "Deactivate staff" : "Activate staff"}
                          className={`rounded-lg p-2 transition ${
                            member.is_active
                              ? "text-gray-500 hover:bg-red-50 hover:text-red-600"
                              : "text-gray-500 hover:bg-green-50 hover:text-green-600"
                          }`}
                        >
                          <Power size={17} />
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

        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">

          <div className="my-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">

            {/* Modal Header */}
            <div className="sticky top-0 flex items-center justify-between border-b border-[#EEE9E2] bg-white px-6 py-5">

              <div>
                <h2 className="text-lg font-semibold text-[#29231F]">
                  {editingStaff ? "Edit Staff Details" : "Add New Staff"}
                </h2>

                <p className="mt-1 text-xs text-gray-500">
                  {editingStaff
                    ? "Update employee information."
                    : "Create a new restaurant staff account."}
                </p>
              </div>

              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <X size={19} />
              </button>

            </div>


            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="space-y-5 p-6">

              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {formError}
                </div>
              )}


              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">

                <FormField
                  label="Full Name"
                  icon={<Users size={16} />}
                  name="full_name"
                  value={form.full_name}
                  onChange={handleChange}
                  placeholder="Enter full name"
                  required
                  minLength={2}
                  maxLength={100}
                />

                <FormField
                  label="Email Address"
                  icon={<Mail size={16} />}
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="employee@example.com"
                  required
                />

                {!editingStaff && (
                  <FormField
                    label="Password"
                    icon={<Power size={16} />}
                    name="password"
                    type="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="Minimum 12 characters"
                    required
                    minLength={12}
                  />
                )}

                <FormField
                  label="Employee Code"
                  icon={<Hash size={16} />}
                  name="employee_code"
                  value={form.employee_code}
                  onChange={handleChange}
                  placeholder="Enter employee code"
                  required
                  minLength={2}
                />

                <FormField
                  label="Phone Number"
                  icon={<Phone size={16} />}
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="Enter phone number"
                  required
                />

                <FormField
                  label="Designation"
                  icon={<Briefcase size={16} />}
                  name="designation"
                  value={form.designation}
                  onChange={handleChange}
                  placeholder="e.g. Waiter, Chef"
                  required
                  minLength={2}
                />

                <FormField
                  label="Joining Date"
                  icon={<CalendarDays size={16} />}
                  name="joining_date"
                  type="date"
                  value={form.joining_date}
                  onChange={handleChange}
                />

              </div>


              <div className="flex flex-col-reverse justify-end gap-3 border-t border-[#EEE9E2] pt-5 sm:flex-row">

                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-[#E9E3DA] px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center justify-center gap-2 rounded-lg bg-[#C65D35] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#A94B2B] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : editingStaff ? "Save Changes" : "Create Staff"}
                </button>

              </div>

            </form>

          </div>

        </div>

      )}

    </div>
  );
}


// Reusable statistics card
function StatCard({ title, value, icon }) {
  return (
    <div className="rounded-xl border border-[#E9E3DA] bg-white p-5">

      <div className="mb-4 flex items-center justify-between">

        <p className="text-sm text-gray-500">
          {title}
        </p>

        <div className="rounded-lg bg-[#F5E5DC] p-2 text-[#C65D35]">
          {icon}
        </div>

      </div>

      <h3 className="text-2xl font-semibold text-[#29231F]">
        {value}
      </h3>

    </div>
  );
}


// Reusable form input
function FormField({
  label,
  icon,
  name,
  type = "text",
  value,
  onChange,
  placeholder,
  required = false,
  minLength,
  maxLength,
}) {
  return (
    <div>

      <label className="mb-2 block text-sm font-medium text-[#29231F]">
        {label}
      </label>

      <div className="relative">

        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          {icon}
        </span>

        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          className="w-full rounded-lg border border-[#E9E3DA] py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-[#C65D35] focus:ring-2 focus:ring-[#C65D35]/10"
        />

      </div>

    </div>
  );
}