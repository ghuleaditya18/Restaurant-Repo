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
import BulkSelectionBar from "../components/BulkSelectionBar";
import useBulkSelection from "../hooks/useBulkSelection";
import { validateEmailAddress, validateMobileNumber } from "../utils/validation";

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
  const { selectedIds, toggle, toggleMany, clear } = useBulkSelection();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add / Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
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
    setFieldErrors({});
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
    setFieldErrors({});
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
    setFieldErrors((previous) => ({ ...previous, [name]: "" }));
  };

  // ==========================================
  // CREATE / UPDATE CUSTOMER
  // ==========================================

  const handleSubmit = async (event) => {
    event.preventDefault();

    setFormError("");
    const nextFieldErrors = {};
    if (form.full_name.trim().length < 2) {
      nextFieldErrors.full_name = "Full name must contain at least 2 characters.";
    }
    const phoneCheck = validateMobileNumber(form.phone, { required: true });
    if (!phoneCheck.valid) nextFieldErrors.phone = phoneCheck.error;

    const emailCheck = validateEmailAddress(form.email, { required: true });
    if (!emailCheck.valid) nextFieldErrors.email = emailCheck.error;
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }
    setSaving(true);

    const customerData = {
      full_name: form.full_name.trim(),
      phone: phoneCheck.normalized,
      email: emailCheck.normalized,
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

  const handleDeleteSelected = async () => {
    const targets = customers.filter((customer) => selectedIds.has(customer.id));
    const confirmed = await confirm({
      title: "Delete Selected Customers",
      message: `Permanently delete ${targets.length} selected customer(s)? Customers linked to orders may be protected by the server.`,
      confirmText: "Delete Selected",
      variant: "danger",
    });
    if (!confirmed) return;
    const results = await Promise.allSettled(targets.map((customer) => deleteCustomer(customer.id)));
    const deletedIds = targets.filter((_, index) => results[index].status === "fulfilled").map((customer) => customer.id);
    setCustomers((previous) => previous.filter((customer) => !deletedIds.includes(customer.id)));
    clear();
    if (deletedIds.length) showDelete(`${deletedIds.length} customer(s) deleted successfully.`, "Customers Deleted");
    if (deletedIds.length < targets.length) showError(`${targets.length - deletedIds.length} customer(s) could not be deleted because of linked records or another server rule.`, "Some Deletions Failed");
  };

  return (
    <div className="space-y-4">
      {/* A1 Standard PageHeader */}
      <PageHeader
        title="Customers"
        actions={
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] px-4 py-2 text-sm font-bold text-[#0D1420] shadow-xs transition hover:opacity-95 cursor-pointer"
          >
            <Plus size={17} />
            <span>Add Customer</span>
          </button>
        }
      />

      {/* METRIC OVERVIEW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3 w-full">
        <StatCard
          compact
          title="Registered Guests"
          value={customers.length}
          icon={<Users size={18} />}
        />

        <StatCard
          compact
          title="With Email"
          value={customers.filter((c) => Boolean(c.email)).length}
          icon={<Mail size={18} />}
          color="sky"
        />

        <StatCard
          compact
          title="With Address"
          value={customers.filter((c) => Boolean(c.address)).length}
          icon={<MapPin size={18} />}
          color="emerald"
        />
      </div>

      {/* TABLE CONTAINER */}
      <BulkSelectionBar count={selectedIds.size} onDelete={handleDeleteSelected} onClear={clear} />
      <div className="overflow-hidden rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] shadow-xs">
        {/* SEARCH AND REFRESH */}
        <div className="flex flex-col gap-3 border-b border-[#E5E9F0] dark:border-[#1E293B] px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-stone-900 dark:text-white">Registered Customers</h2>
            <p className="mt-0.5 text-xs text-stone-500 dark:text-[#8A9AB2]">
              {filteredCustomers.length} {filteredCustomers.length === 1 ? "record" : "records"} found
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 dark:text-[#8A9AB2]"
              />
              <input
                type="text"
                placeholder="Search name, phone, email..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-lg border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#151D29] py-1.5 pl-8 pr-3 text-xs text-stone-900 dark:text-white outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/30 sm:w-56"
              />
            </div>

            <button
              type="button"
              onClick={loadCustomers}
              disabled={loading}
              title="Refresh customers"
              className="flex items-center justify-center rounded-lg border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#151D29] p-1.5 text-stone-600 dark:text-[#8A9AB2] hover:bg-stone-50 dark:hover:bg-[#101722] transition cursor-pointer"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left">
            <colgroup>
              <col className="w-10" />
            </colgroup>
            <thead className="bg-stone-50/80 dark:bg-stone-900/60 text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              <tr>
                <th className="w-10 px-3 py-2.5 text-center"><input type="checkbox" aria-label="Select all customers on this page" checked={paginatedCustomers.length > 0 && paginatedCustomers.every((customer) => selectedIds.has(customer.id))} onChange={() => toggleMany(paginatedCustomers.map((customer) => customer.id))} className="h-4 w-4 accent-amber-500" /></th>
                <th className="px-3.5 py-2.5">Customer</th>
                <th className="px-3.5 py-2.5">Phone Number</th>
                <th className="px-3.5 py-2.5">Email Address</th>
                <th className="px-3.5 py-2.5">Address</th>
                <th className="px-3.5 py-2.5 text-center">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-stone-100 dark:divide-stone-800 text-sm">
              {loading ? (
                <tr>
                  <td
                    colSpan="6"
                    className="px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400"
                  >
                    Loading customer records...
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td
                    colSpan="6"
                    className="px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400"
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
                    <td className="w-10 px-3 py-2.5 text-center"><input type="checkbox" aria-label={`Select customer ${customer.full_name}`} checked={selectedIds.has(customer.id)} onChange={() => toggle(customer.id)} className="h-4 w-4 accent-amber-500" /></td>
                    {/* CUSTOMER */}
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#FFB02E] to-[#D97706] text-[#0D1420] text-xs font-bold border border-[#F59E0B]/50 shadow-2xs">
                          <AuthenticatedImage
                            src={customer.image_url}
                            alt={customer.full_name}
                            fallback={customer.full_name.charAt(0).toUpperCase()}
                          />
                        </div>

                        <div className="min-w-0">
                          <p className="font-semibold text-stone-900 dark:text-white leading-tight">
                            {customer.full_name}
                          </p>
                          <p className="text-[11px] text-stone-400">
                            ID: #{customer.id}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* PHONE */}
                    <td className="px-3.5 py-2.5 text-sm font-medium text-stone-700 dark:text-stone-300 whitespace-nowrap">
                      {customer.phone}
                    </td>

                    {/* EMAIL */}
                    <td className="max-w-[200px] truncate px-3.5 py-2.5 text-sm text-stone-600 dark:text-stone-400">
                      {customer.email || "—"}
                    </td>

                    {/* ADDRESS */}
                    <td className="max-w-[220px] truncate px-3.5 py-2.5 text-sm text-stone-600 dark:text-stone-400">
                      {customer.address || "—"}
                    </td>

                    {/* ACTIONS */}
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openViewModal(customer)}
                          title="View customer"
                          className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-white transition cursor-pointer"
                        >
                          <Eye size={15} />
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditModal(customer)}
                          title="Edit customer"
                          className="rounded-lg p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-white transition cursor-pointer"
                        >
                          <Pencil size={15} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(customer)}
                          title="Delete customer"
                          className="rounded-lg p-1.5 text-stone-400 dark:text-stone-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-400 transition cursor-pointer"
                        >
                          <Trash2 size={15} />
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
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={filteredCustomers.length}
          pageSize={pageSize}
          onPageChange={(p) => setCurrentPage(p)}
          className="px-4 pb-3"
        />
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
              error={fieldErrors.full_name}
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
              error={fieldErrors.phone}
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
              error={fieldErrors.email}
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
                className="w-full resize-none rounded-lg border border-stone-300 dark:border-[#1E293B] bg-white dark:bg-[#151D29] px-3 py-2 text-sm text-stone-900 dark:text-[#F8FAFC] outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/30"
              />
            </div>

            <div className="flex justify-end gap-3 border-t border-stone-100 dark:border-[#1E293B] pt-4">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-stone-300 dark:border-[#1E293B] bg-white dark:bg-[#151D29] px-4 py-2 text-sm font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-[#1E293B] transition cursor-pointer"
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
  error,
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
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
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        className={`w-full rounded-lg border bg-white dark:bg-[#151D29] px-3 py-2 text-sm text-stone-900 dark:text-[#F8FAFC] outline-none transition focus:ring-2 focus:ring-[#F59E0B]/30 ${error ? "border-red-500 focus:border-red-500" : "border-stone-300 dark:border-[#1E293B] focus:border-[#F59E0B]"}`}
      />
      {error && <p id={`${name}-error`} className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

function DetailItem({ label, value, icon }) {
  return (
    <div className="rounded-lg border border-stone-100 dark:border-[#1E293B] bg-stone-50/70 dark:bg-[#151D29] p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-[#8A9AB2]">
        {icon}
        <span>{label}</span>
      </div>

      <p className="break-words text-sm font-semibold text-stone-900 dark:text-[#F8FAFC]">
        {value || "—"}
      </p>
    </div>
  );
}
