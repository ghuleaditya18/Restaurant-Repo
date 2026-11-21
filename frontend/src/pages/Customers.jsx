import { useCallback, useEffect, useMemo, useState } from "react";

import { Plus, Search, Pencil, Eye, Trash2, RefreshCw, Mail, Phone, MapPin } from "lucide-react";

import {
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "../services/customerService";
import { useNotification } from "../context/NotificationContext";
import PageHeader from "../components/PageHeader";
import AlertBanner from "../components/AlertBanner";
import Modal from "../components/Modal";

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
  const { showSuccess, showError, confirm } = useNotification();
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

  // Search
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

    const trimmedEmail = form.email.trim().toLowerCase();
    if (!trimmedEmail) {
      setFormError("Email address is mandatory for all customer records.");
      setSaving(false);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setFormError("Please enter a valid email address (e.g. name@domain.com).");
      setSaving(false);
      return;
    }

    const customerData = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      email: trimmedEmail,
      address: form.address.trim() || null,
    };

    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, customerData);
        const msg = "Customer details updated successfully.";
        setSuccessMessage(msg);
        showSuccess(msg, "Customer Updated");
      } else {
        await createCustomer(customerData);
        const msg = "Customer registered successfully.";
        setSuccessMessage(msg);
        showSuccess(msg, "Customer Created");
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

  const closeViewModal = () => {
    setShowViewModal(false);
    setViewingCustomer(null);
    setViewError("");
  };

  // ==========================================
  // DELETE CUSTOMER
  // ==========================================

  const handleDelete = async (customer) => {
    const confirmed = await confirm({
      title: "Delete Customer",
      message: `Are you sure you want to delete ${customer.full_name}? This action cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger",
    });

    if (!confirmed) return;

    setPageError("");
    setSuccessMessage("");

    try {
      await deleteCustomer(customer.id);

      setCustomers((previous) =>
        previous.filter((item) => item.id !== customer.id),
      );

      const msg = `${customer.full_name} deleted successfully.`;
      setSuccessMessage(msg);
      showError(msg, "Customer Deleted");
    } catch (error) {
      const msg = getErrorMessage(error);
      setPageError(msg);
      showError(msg, "Delete Failed");
    }
  };

  return (
    <div className="space-y-6">
      {/* A1 Standard PageHeader */}
      <PageHeader
        title="Customers"
        actions={
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#F5B716] px-4 py-2.5 text-sm font-bold text-[#1C1917] shadow-xs transition hover:bg-[#E5A910] cursor-pointer"
          >
            <Plus size={18} />
            <span>Add Customer</span>
          </button>
        }
      />

      {/* SUCCESS MESSAGE */}
      {successMessage && (
        <AlertBanner
          type="success"
          message={successMessage}
          onDismiss={() => setSuccessMessage("")}
        />
      )}

      {/* ERROR MESSAGE */}
      {pageError && (
        <AlertBanner
          type="error"
          message={pageError}
          onDismiss={() => setPageError("")}
        />
      )}

      {/* METRIC OVERVIEW */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <div className="rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-[#1C1917] p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Registered Guests</p>
          <p className="mt-1 text-2xl font-bold text-[#1C1917] dark:text-stone-100 tabular-nums">{customers.length}</p>
        </div>

        <div className="rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-[#1C1917] p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">With Email On File</p>
          <p className="mt-1 text-2xl font-bold text-stone-800 dark:text-stone-200 tabular-nums">
            {customers.filter((c) => Boolean(c.email)).length}
          </p>
        </div>

        <div className="rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-[#1C1917] p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">With Address Records</p>
          <p className="mt-1 text-2xl font-bold text-stone-800 dark:text-stone-200 tabular-nums">
            {customers.filter((c) => Boolean(c.address)).length}
          </p>
        </div>
      </div>

      {/* TABLE CONTAINER */}
      <div className="overflow-hidden rounded-xl border border-stone-200/90 bg-white shadow-xs">
        {/* SEARCH AND REFRESH */}
        <div className="flex flex-col gap-4 border-b border-stone-200/80 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-bold text-[#1C1917]">Registered Customers</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {filteredCustomers.length} {filteredCustomers.length === 1 ? "record" : "records"} found
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <input
                type="text"
                placeholder="Search name, phone, email..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-lg border border-stone-300 bg-white py-2 pl-9 pr-3 text-sm text-stone-900 outline-none transition focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30 sm:w-72"
              />
            </div>

            <button
              type="button"
              onClick={loadCustomers}
              disabled={loading}
              title="Refresh customers"
              className="flex items-center justify-center rounded-lg border border-stone-200 bg-white p-2 text-stone-600 hover:bg-stone-50 transition cursor-pointer"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Phone Number</th>
                <th className="px-4 py-3">Email Address</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-stone-100 text-sm">
              {loading ? (
                <tr>
                  <td
                    colSpan="5"
                    className="px-4 py-12 text-center text-sm text-stone-500"
                  >
                    Loading customer records...
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td
                    colSpan="5"
                    className="px-4 py-12 text-center text-sm text-stone-500"
                  >
                    No customers found.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="transition hover:bg-stone-50/70"
                  >
                    {/* CUSTOMER */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FEF08A] border border-[#FDE047] font-bold text-[#854D0E] shadow-2xs">
                          {customer.full_name.charAt(0).toUpperCase()}
                        </div>

                        <div className="min-w-0">
                          <p className="font-semibold text-stone-900">
                            {customer.full_name}
                          </p>
                          <p className="text-xs text-stone-400">
                            ID: #{customer.id}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* PHONE */}
                    <td className="px-4 py-3 text-sm font-medium text-stone-700">
                      {customer.phone}
                    </td>

                    {/* EMAIL */}
                    <td className="max-w-[200px] truncate px-4 py-3 text-sm text-stone-600">
                      {customer.email || "—"}
                    </td>

                    {/* ADDRESS */}
                    <td className="max-w-[220px] truncate px-4 py-3 text-sm text-stone-600">
                      {customer.address || "—"}
                    </td>

                    {/* ACTIONS */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openViewModal(customer)}
                          title="View customer"
                          className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition cursor-pointer"
                        >
                          <Eye size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditModal(customer)}
                          title="Edit customer"
                          className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition cursor-pointer"
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(customer)}
                          title="Delete customer"
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

      {/* ADD / EDIT CUSTOMER MODAL */}
      {showModal && (
        <ModalShell
          title={editingCustomer ? "Edit Customer Record" : "Add New Customer"}
          subtitle="Enter contact details and customer profile information."
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && <ErrorBox message={formError} />}

            <FormField
              label="Full Name"
              name="full_name"
              value={form.full_name}
              onChange={handleChange}
              placeholder="e.g. Rahul Sharma"
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
              placeholder="e.g. 9876543210"
              required
              maxLength={16}
            />

            <FormField
              label="Email Address"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="e.g. rahul@example.com"
              required
              maxLength={150}
            />

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-700">
                Billing / Delivery Address (Optional)
              </label>
              <textarea
                name="address"
                value={form.address}
                onChange={handleChange}
                rows={3}
                placeholder="Enter postal address or landmark..."
                className="w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30"
              />
            </div>

            <div className="flex justify-end gap-3 border-t border-stone-100 pt-4">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#F5B716] px-5 py-2 text-sm font-bold text-[#1C1917] hover:bg-[#E5A910] disabled:opacity-60 transition cursor-pointer shadow-xs"
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

      {/* VIEW CUSTOMER MODAL */}
      {showViewModal && (
        <ModalShell
          title="Customer Profile"
          subtitle="Detailed contact and account history."
          onClose={closeViewModal}
        >
          {viewLoading ? (
            <p className="py-10 text-center text-sm text-stone-500">
              Loading customer details...
            </p>
          ) : viewError ? (
            <ErrorBox message={viewError} />
          ) : (
            viewingCustomer && (
              <div className="space-y-5">
                <div className="flex items-center gap-4 rounded-xl border border-stone-200 bg-stone-50/70 p-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FEF08A] border border-[#FDE047] text-xl font-bold text-[#854D0E] shadow-2xs">
                    {viewingCustomer.full_name.charAt(0).toUpperCase()}
                  </div>

                  <div>
                    <h3 className="font-bold text-[#1C1917]">
                      {viewingCustomer.full_name}
                    </h3>
                    <p className="text-xs text-stone-500">
                      Customer ID: #{viewingCustomer.id}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <DetailItem
                    label="Phone Number"
                    value={viewingCustomer.phone}
                    icon={<Phone size={14} className="text-stone-400" />}
                  />

                  <DetailItem
                    label="Email Address"
                    value={viewingCustomer.email}
                    icon={<Mail size={14} className="text-stone-400" />}
                  />

                  <div className="sm:col-span-2">
                    <DetailItem
                      label="Address"
                      value={viewingCustomer.address}
                      icon={<MapPin size={14} className="text-stone-400" />}
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

function ModalShell({ title, subtitle, onClose, children }) {
  return (
    <Modal
      isOpen={true}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      size="sm"
    >
      {children}
    </Modal>
  );
}

function ErrorBox({ message }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
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
      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-700">
        {label} {required && <span className="text-red-500">*</span>}
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
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30"
      />
    </div>
  );
}

function DetailItem({ label, value, icon }) {
  return (
    <div className="rounded-lg border border-stone-100 bg-stone-50/70 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500">
        {icon}
        <span>{label}</span>
      </div>

      <p className="break-words text-sm font-semibold text-[#1C1917]">
        {value || "—"}
      </p>
    </div>
  );
}
