import { useCallback, useEffect, useMemo, useState } from "react";

import { Plus, Search, Pencil, Eye, Trash2, X, RefreshCw } from "lucide-react";

import {
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "../services/customerService";

const EMPTY_FORM = {
  full_name: "",
  phone: "",
  email: "",
  address: "",
};

// ==========================================
// ERROR HANDLING
// ==========================================

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

// ==========================================
// MAIN CUSTOMER COMPONENT
// ==========================================

export default function Customers() {
  const [customers, setCustomers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add / Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  // View modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState("");

  // Search and filters
  const [search, setSearch] = useState("");

  // Notifications
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // ==========================================
  // LOAD CUSTOMER RECORDS
  // ==========================================

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setPageError("");

    try {
      const data = await getAllCustomers();

      setCustomers(data);
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // ==========================================
  // SEARCH AND FILTER
  // ==========================================

  const filteredCustomers = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return customers.filter((customer) => {
      return (
        customer.full_name.toLowerCase().includes(searchValue) ||
        customer.phone.includes(searchValue) ||
        (customer.email || "").toLowerCase().includes(searchValue) ||
        (customer.address || "").toLowerCase().includes(searchValue)
      );
    });
  }, [customers, search]);

  // ==========================================
  // OPEN ADD CUSTOMER MODAL
  // ==========================================

  const openAddModal = () => {
    setEditingCustomer(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setShowModal(true);
  };

  // ==========================================
  // OPEN EDIT CUSTOMER MODAL
  // ==========================================

  const openEditModal = (customer) => {
    setEditingCustomer(customer);

    setForm({
      full_name: customer.full_name,
      phone: customer.phone,
      email: customer.email || "",
      address: customer.address || "",
    });

    setFormError("");
    setShowModal(true);
  };

  // ==========================================
  // FORM INPUT HANDLING
  // ==========================================

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // ==========================================
  // CREATE / UPDATE CUSTOMER
  // ==========================================

  const handleSubmit = async (event) => {
    event.preventDefault();

    setSaving(true);
    setFormError("");

    const customerData = {
      full_name: form.full_name.trim(),

      phone: form.phone.trim(),

      email: form.email.trim().toLowerCase() || null,

      address: form.address.trim() || null,
    };

    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, customerData);

        setSuccessMessage("Customer details updated successfully.");
      } else {
        await createCustomer(customerData);

        setSuccessMessage("Customer registered successfully.");
      }

      setShowModal(false);
      setEditingCustomer(null);
      setForm(EMPTY_FORM);

      await loadCustomers();
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // VIEW CUSTOMER DETAILS
  // ==========================================

  const openViewModal = async (customer) => {
    setShowViewModal(true);
    setViewingCustomer(null);
    setViewError("");
    setViewLoading(true);

    try {
      const data = await getCustomerById(customer.id);

      setViewingCustomer(data);
    } catch (error) {
      setViewError(getErrorMessage(error));
    } finally {
      setViewLoading(false);
    }
  };

  // ==========================================
  // CLOSE VIEW MODAL
  // ==========================================

  const closeViewModal = () => {
    setShowViewModal(false);
    setViewingCustomer(null);
    setViewError("");
  };

  // ==========================================
  // DELETE CUSTOMER
  // ==========================================

  const handleDelete = async (customer) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${customer.full_name}?`,
    );

    if (!confirmed) return;

    setPageError("");
    setSuccessMessage("");

    try {
      await deleteCustomer(customer.id);

      setCustomers((previous) =>
        previous.filter((item) => item.id !== customer.id),
      );

      setSuccessMessage(`${customer.full_name} deleted successfully.`);
    } catch (error) {
      setPageError(getErrorMessage(error));
    }
  };

  // ==========================================
  // PAGE UI
  // ==========================================

  return (
    <div className="min-h-screen bg-[#F7F5F0] p-4 md:p-6">
      {/* PAGE HEADER */}

      <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="mb-1 text-sm font-medium text-[#C65D35]">
            Restaurant Administration
          </p>

          <h1 className="text-2xl font-semibold text-[#29231F] md:text-3xl">
            Customer Management
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Manage restaurant customer records and information.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="flex items-center justify-center gap-2 rounded-lg bg-[#C65D35] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#A94B2B]"
        >
          <Plus size={18} />
          Add Customer
        </button>
      </div>

      {/* SUCCESS MESSAGE */}

      {successMessage && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-[#E9D6C8] bg-[#FFF9F5] px-4 py-3 text-sm text-[#A94B2B]">
          {successMessage}

          <button onClick={() => setSuccessMessage("")}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* ERROR MESSAGE */}

      {pageError && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {pageError}

          <button onClick={() => setPageError("")}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* CUSTOMER TABLE */}

      <div className="overflow-hidden rounded-xl border border-[#E9E3DA] bg-white">
        {/* SEARCH AND FILTER */}

        <div className="flex flex-col gap-4 border-b border-[#EEE9E2] p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-[#29231F]">
              Restaurant Customers
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              {search.trim()
                ? `Showing ${filteredCustomers.length} of ${customers.length} customers`
                : `${customers.length} registered customers`}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />

              <input
                type="text"
                placeholder="Search customers..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-lg border border-[#E9E3DA] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#C65D35] sm:w-64"
              />
            </div>

            <button
              onClick={loadCustomers}
              disabled={loading}
              title="Refresh customers"
              className="flex items-center justify-center rounded-lg border border-[#E9E3DA] px-3 py-2.5 text-gray-600 hover:bg-[#F7F5F0]"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* TABLE */}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-[#FAF9F6] text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Customer</th>

                <th className="px-4 py-3">Phone Number</th>

                <th className="px-4 py-3">Email Address</th>

                <th className="px-4 py-3">Address</th>

                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F0ECE6]">
              {loading ? (
                <tr>
                  <td
                    colSpan="5"
                    className="px-4 py-12 text-center text-sm text-gray-500"
                  >
                    Loading customer records...
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td
                    colSpan="5"
                    className="px-4 py-12 text-center text-sm text-gray-500"
                  >
                    No customers found.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="transition hover:bg-[#FAF9F6]"
                  >
                    {/* CUSTOMER */}

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F5E5DC] font-semibold text-[#C65D35]">
                          {customer.full_name.charAt(0).toUpperCase()}
                        </div>

                        <div className="min-w-0">
                          <p className="font-medium text-[#29231F]">
                            {customer.full_name}
                          </p>

                          <p className="text-xs text-gray-500">
                            Customer #{customer.id}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* PHONE */}

                    <td className="px-4 py-3 text-sm text-gray-600">
                      {customer.phone}
                    </td>

                    {/* EMAIL */}

                    <td className="max-w-[200px] truncate px-4 py-3 text-sm text-gray-600">
                      {customer.email || "—"}
                    </td>

                    {/* ADDRESS */}

                    <td className="max-w-[200px] truncate px-4 py-3 text-sm text-gray-600">
                      {customer.address || "—"}
                    </td>

                    {/* ACTIONS */}

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openViewModal(customer)}
                          title="View customer"
                          className="rounded-lg p-2 text-[#29231F] hover:bg-[#F5E5DC] hover:text-[#C65D35]"
                        >
                          <Eye size={16} />
                        </button>

                        <button
                          onClick={() => openEditModal(customer)}
                          title="Edit customer"
                          className="rounded-lg p-2 text-[#29231F] hover:bg-[#F5E5DC] hover:text-[#C65D35]"
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          onClick={() => handleDelete(customer)}
                          title="Delete customer"
                          className="rounded-lg p-2 text-[#6B625B] hover:bg-[#EEEAE4] hover:text-[#A94B2B]"
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

      {/* ==================================
          ADD / EDIT CUSTOMER MODAL
      ================================== */}

      {showModal && (
        <ModalShell
          title={editingCustomer ? "Edit Customer" : "Add New Customer"}
          subtitle="Enter customer information."
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && <ErrorBox message={formError} />}

            <FormField
              label="Customer Name"
              name="full_name"
              value={form.full_name}
              onChange={handleChange}
              placeholder="Enter customer name"
              required
              minLength={2}
              maxLength={100}
            />

            <FormField
              label="Phone Number"
              name="phone"
              type="tel"
              value={form.phone}
              onChange={handleChange}
              placeholder="Enter phone number"
              required
              maxLength={16}
            />

            <FormField
              label="Email Address"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="Enter email address (optional)"
              maxLength={150}
            />

            <div>
              <label className="mb-2 block text-sm font-medium text-[#29231F]">
                Address
              </label>

              <textarea
                name="address"
                value={form.address}
                onChange={handleChange}
                rows={3}
                placeholder="Enter customer address (optional)"
                className="w-full resize-none rounded-lg border border-[#E9E3DA] px-3 py-2.5 text-sm outline-none focus:border-[#C65D35]"
              />
            </div>

            <div className="flex justify-end gap-3 border-t border-[#EEE9E2] pt-4">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-[#E9E3DA] px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#C65D35] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#A94B2B] disabled:opacity-60"
              >
                {saving
                  ? "Saving..."
                  : editingCustomer
                    ? "Save Changes"
                    : "Create Customer"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* ==================================
          VIEW CUSTOMER MODAL
      ================================== */}

      {showViewModal && (
        <ModalShell
          title="Customer Details"
          subtitle="Complete customer information."
          onClose={closeViewModal}
        >
          {viewLoading ? (
            <p className="py-10 text-center text-sm text-gray-500">
              Loading customer details...
            </p>
          ) : viewError ? (
            <ErrorBox message={viewError} />
          ) : (
            viewingCustomer && (
              <div>
                {/* PROFILE */}

                <div className="mb-6 flex items-center gap-4 rounded-lg bg-[#F7F5F0] p-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F5E5DC] text-xl font-semibold text-[#C65D35]">
                    {viewingCustomer.full_name.charAt(0).toUpperCase()}
                  </div>

                  <div>
                    <h3 className="font-semibold text-[#29231F]">
                      {viewingCustomer.full_name}
                    </h3>

                    <p className="mt-1 text-xs text-gray-500">
                      Customer ID: #{viewingCustomer.id}
                    </p>
                  </div>
                </div>

                {/* INFORMATION */}

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <DetailItem
                    label="Phone Number"
                    value={viewingCustomer.phone}
                  />

                  <DetailItem
                    label="Email Address"
                    value={viewingCustomer.email || "Not provided"}
                  />

                  <div className="sm:col-span-2">
                    <DetailItem
                      label="Address"
                      value={viewingCustomer.address || "Not provided"}
                    />
                  </div>
                </div>
              </div>
            )
          )}
        </ModalShell>
      )}
    </div>
  );
}

// ==========================================
// REUSABLE COMPONENTS
// ==========================================

function SummaryCard({ title, value, icon, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full rounded-xl border p-4 text-left transition ${
        active
          ? "border-[#C65D35] bg-[#FFF9F5] shadow-sm"
          : "border-[#E9E3DA] bg-white hover:border-[#C65D35]/50"
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>

          <h3 className="mt-1 text-xl font-semibold text-[#29231F]">{value}</h3>
        </div>

        <div className="rounded-lg bg-[#F5E5DC] p-2.5 text-[#C65D35]">
          {icon}
        </div>
      </div>
    </button>
  );
}

function ModalShell({ title, subtitle, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-auto max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-[#EEE9E2] bg-white px-5 py-4">
          <div>
            <h2 className="font-semibold text-[#29231F]">{title}</h2>

            <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ErrorBox({ message }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

function FormField({
  label,
  name,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
  minLength,
  maxLength,
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-[#29231F]">
        {label}
      </label>

      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        className="w-full rounded-lg border border-[#E9E3DA] px-3 py-2.5 text-sm outline-none focus:border-[#C65D35]"
      />
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>

      <p className="break-words text-sm font-medium text-[#29231F]">
        {value ?? "—"}
      </p>
    </div>
  );
}
