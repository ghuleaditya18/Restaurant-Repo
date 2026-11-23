import { useCallback, useEffect, useMemo, useState } from "react";

import { Plus, Search, Pencil, Eye, Trash2, RefreshCw, Mail, Phone, MapPin, Users } from "lucide-react";

import {
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  uploadCustomerImage,
  deleteCustomerImage,
} from "../services/customerService";
import ProfilePhotoUpload from "../components/ProfilePhotoUpload";
import AuthenticatedImage from "../components/AuthenticatedImage";
import { useNotification } from "../context/NotificationContext";
import PageHeader from "../components/PageHeader";
import Modal from "../components/Modal";
import StatCard from "../components/StatCard";
import Pagination from "../components/Pagination";

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
  const { showSuccess, showUpdate, showDelete, showError, confirm } = useNotification();
  const [customers, setCustomers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add / Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [isImageRemoved, setIsImageRemoved] = useState(false);

  // View modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState("");

  // Search
  const [search, setSearch] = useState("");

  // Pagination (10 per page)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // ==========================================
  // LOAD CUSTOMER RECORDS
  // ==========================================

  const loadCustomers = useCallback(async () => {
    setLoading(true);

    try {
      const data = await getAllCustomers();
      setCustomers(data);
    } catch (error) {
      showError(getErrorMessage(error), "Failed to Load Customers");
    } finally {
      setLoading(false);
    }
  }, [showError]);

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

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, currentPage, pageSize]);

  // ==========================================
  // OPEN ADD CUSTOMER MODAL
  // ==========================================

  const openAddModal = () => {
    setEditingCustomer(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setSelectedImageFile(null);
    setIsImageRemoved(false);
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
    setSelectedImageFile(null);
    setIsImageRemoved(false);
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
      let customerId;
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, customerData);
        customerId = editingCustomer.id;

        if (selectedImageFile) {
          await uploadCustomerImage(customerId, selectedImageFile);
        } else if (isImageRemoved) {
          await deleteCustomerImage(customerId);
        }

        showUpdate("Customer details updated successfully.", "Customer Updated");
      } else {
        const created = await createCustomer(customerData);
        customerId = created?.id;

        if (selectedImageFile && customerId) {
          await uploadCustomerImage(customerId, selectedImageFile);
        }

        showSuccess("Customer registered successfully.", "Customer Created");
      }

      setShowModal(false);
      setEditingCustomer(null);
      setForm(EMPTY_FORM);
      setSelectedImageFile(null);
      setIsImageRemoved(false);

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

    try {
      await deleteCustomer(customer.id);

      setCustomers((previous) =>
        previous.filter((item) => item.id !== customer.id),
      );

      showDelete(`${customer.full_name} deleted successfully.`, "Customer Deleted");
    } catch (error) {
      showError(getErrorMessage(error), "Delete Failed");
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
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] px-4 py-2.5 text-sm font-bold text-[#0D1420] shadow-xs transition hover:opacity-95 cursor-pointer"
          >
            <Plus size={18} />
            <span>Add Customer</span>
          </button>
        }
      />

      {/* METRIC OVERVIEW */}
      <div className="grid grid-cols-1 min-[380px]:grid-cols-3 gap-2 sm:gap-3.5">
        <StatCard
          title="Registered Guests"
          value={customers.length}
          icon={<Users size={18} />}
        />

        <StatCard
          title="With Email"
          value={customers.filter((c) => Boolean(c.email)).length}
          icon={<Mail size={18} />}
          badgeColor="bg-blue-50 text-blue-700 border-blue-200"
        />

        <StatCard
          title="With Address"
          value={customers.filter((c) => Boolean(c.address)).length}
          icon={<MapPin size={18} />}
          badgeColor="bg-emerald-50 text-emerald-800 border-emerald-200"
        />
      </div>

      {/* TABLE CONTAINER */}
      <div className="overflow-hidden rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] shadow-xs">
        {/* SEARCH AND REFRESH */}
        <div className="flex flex-col gap-4 border-b border-[#E5E9F0] dark:border-[#1E293B] p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-bold text-stone-900 dark:text-white">Registered Customers</h2>
            <p className="mt-0.5 text-xs text-stone-500 dark:text-[#8A9AB2]">
              {filteredCustomers.length} {filteredCustomers.length === 1 ? "record" : "records"} found
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-[#8A9AB2]"
              />
              <input
                type="text"
                placeholder="Search name, phone, email..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-lg border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#151D29] py-2 pl-9 pr-3 text-sm text-stone-900 dark:text-white outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/30 sm:w-72"
              />
            </div>

            <button
              type="button"
              onClick={loadCustomers}
              disabled={loading}
              title="Refresh customers"
              className="flex items-center justify-center rounded-lg border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#151D29] p-2 text-stone-600 dark:text-[#8A9AB2] hover:bg-stone-50 dark:hover:bg-[#101722] transition cursor-pointer"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-stone-50/80 dark:bg-stone-900/60 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Phone Number</th>
                <th className="px-4 py-3">Email Address</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-stone-100 dark:divide-stone-800 text-sm">
              {loading ? (
                <tr>
                  <td
                    colSpan="5"
                    className="px-4 py-12 text-center text-sm text-stone-500 dark:text-stone-400"
                  >
                    Loading customer records...
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td
                    colSpan="5"
                    className="px-4 py-12 text-center text-sm text-stone-500 dark:text-stone-400"
                  >
                    No customers found.
                  </td>
                </tr>
              ) : (
                paginatedCustomers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="transition hover:bg-stone-50/70 dark:hover:bg-stone-800/40"
                  >
                    {/* CUSTOMER */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#FFB02E] to-[#D97706] text-[#0D1420] font-bold border border-[#F59E0B]/50 shadow-2xs">
                          <AuthenticatedImage
                            src={customer.image_url}
                            alt={customer.full_name}
                            fallback={customer.full_name.charAt(0).toUpperCase()}
                          />
                        </div>

                        <div className="min-w-0">
                          <p className="font-semibold text-stone-900 dark:text-white">
                            {customer.full_name}
                          </p>
                          <p className="text-xs text-stone-400">
                            ID: #{customer.id}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* PHONE */}
                    <td className="px-4 py-3 text-sm font-medium text-stone-700 dark:text-stone-300">
                      {customer.phone}
                    </td>

                    {/* EMAIL */}
                    <td className="max-w-[200px] truncate px-4 py-3 text-sm text-stone-600 dark:text-stone-400">
                      {customer.email || "—"}
                    </td>

                    {/* ADDRESS */}
                    <td className="max-w-[220px] truncate px-4 py-3 text-sm text-stone-600 dark:text-stone-400">
                      {customer.address || "—"}
                    </td>

                    {/* ACTIONS */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openViewModal(customer)}
                          title="View customer"
                          className="rounded-lg p-2 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-white transition cursor-pointer"
                        >
                          <Eye size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditModal(customer)}
                          title="Edit customer"
                          className="rounded-lg p-2 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-white transition cursor-pointer"
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(customer)}
                          title="Delete customer"
                          className="rounded-lg p-2 text-stone-400 dark:text-stone-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-400 transition cursor-pointer"
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
            totalRecords={filteredCustomers.length}
            pageSize={pageSize}
            onPageChange={(p) => setCurrentPage(p)}
          />
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

            <div className="flex justify-center pb-2">
              <ProfilePhotoUpload
                currentImageUrl={editingCustomer?.image_url}
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
                className="w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/30"
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
                className="rounded-lg bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] px-5 py-2 text-sm font-bold text-[#0D1420] hover:opacity-95 disabled:opacity-60 transition cursor-pointer shadow-xs"
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
                  <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#FFB02E] to-[#D97706] text-[#0D1420] font-bold border border-[#F59E0B]/50 text-xl shadow-2xs">
                    <AuthenticatedImage
                      src={viewingCustomer.image_url}
                      alt={viewingCustomer.full_name}
                      fallback={viewingCustomer.full_name.charAt(0).toUpperCase()}
                    />
                  </div>

                  <div>
                    <h3 className="font-bold text-stone-900">
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
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/30"
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

      <p className="break-words text-sm font-semibold text-stone-900">
        {value || "—"}
      </p>
    </div>
  );
}
