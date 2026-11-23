import { useEffect, useState, useCallback } from "react";
import {
  Users,
  Plus,
  Search,
  Phone,
  Mail,
  Edit2,
  Calendar,
  Trash2,
} from "lucide-react";
import spaApi from "../services/spaApi";
import { BookingStatusBadge } from "../components/StatusBadges";
import { useNotification } from "../../../context/NotificationContext";
import { formatTimeRange12Hour } from "../utils/timeFormat";
import PageHeader from "../../../components/PageHeader";
import Modal from "../../../components/Modal";
import Pagination from "../../../components/Pagination";
import ProfilePhotoUpload from "../../../components/ProfilePhotoUpload";
import AuthenticatedImage from "../../../components/AuthenticatedImage";

function formatCurrency(val) {
  const num = Number(val || 0);
  return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SpaCustomers() {
  const { showSuccess, showUpdate, showDelete, showError, confirm } = useNotification();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", notes: "", is_active: true });
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [isImageRemoved, setIsImageRemoved] = useState(false);
  const [saving, setSaving] = useState(false);

  // History Modal
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState(null);
  const [customerBookings, setCustomerBookings] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await spaApi.getCustomers({ search });
      setCustomers(res.data);
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to load Spa customers.");
    } finally {
      setLoading(false);
    }
  }, [search, showError]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: form.email?.trim() || null,
        notes: form.notes?.trim() || null,
        is_active: Boolean(form.is_active),
      };

      let customerId;
      if (editingCustomer) {
        await spaApi.updateCustomer(editingCustomer.id, payload);
        customerId = editingCustomer.id;

        if (selectedImageFile) {
          await spaApi.uploadCustomerImage(customerId, selectedImageFile);
        } else if (isImageRemoved) {
          await spaApi.deleteCustomerImage(customerId);
        }

        showUpdate("Customer profile updated successfully.", "Customer Updated");
      } else {
        const res = await spaApi.createCustomer(payload);
        customerId = res.data?.id;

        if (selectedImageFile && customerId) {
          await spaApi.uploadCustomerImage(customerId, selectedImageFile);
        }

        showSuccess("Customer registered successfully.", "Customer Saved");
      }

      setModalOpen(false);
      setEditingCustomer(null);
      setSelectedImageFile(null);
      setIsImageRemoved(false);
      fetchCustomers();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to save customer.", "Save Error");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenHistory = async (cust) => {
    setHistoryCustomer(cust);
    setHistoryModalOpen(true);
    setHistoryLoading(true);
    try {
      const res = await spaApi.getCustomerBookingHistory(cust.id);
      setCustomerBookings(res.data);
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to load customer history.", "Load Error");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDeleteCustomer = async (cust) => {
    const confirmed = await confirm({
      title: "Delete Customer",
      message: `Are you sure you want to delete ${cust.full_name}? This action cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger",
    });

    if (!confirmed) return;

    try {
      const res = await spaApi.deleteCustomer(cust.id);
      showDelete(res.data?.message || `${cust.full_name} deleted successfully.`, "Customer Deleted");
      setCustomers((prev) => prev.filter((c) => c.id !== cust.id));
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to delete customer.", "Delete Failed");
    }
  };

  return (
    <div className="space-y-6">
      {/* A1 Standard PageHeader */}
      <PageHeader
        title="Spa Customers"
        description="Registered spa guests, treatment preferences, and appointment records."
        actions={
          <button
            type="button"
            onClick={() => {
              setEditingCustomer(null);
              setForm({ full_name: "", phone: "", email: "", notes: "", is_active: true });
              setSelectedImageFile(null);
              setIsImageRemoved(false);
              setModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-bold rounded-xl bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold hover:opacity-95 transition shadow-xs cursor-pointer"
          >
            <Plus size={16} />
            <span>Register Customer</span>
          </button>
        }
      />

      {/* Search Input */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
          placeholder="Search by name, phone, or email..."
          className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#F59E0B] transition"
        />
      </div>

      {/* Customers Table */}
      <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-sm text-stone-400">Loading guests...</div>
        ) : customers.length === 0 ? (
          <div className="p-16 text-center text-stone-400">
            <Users size={36} className="mx-auto mb-2 text-stone-300 dark:text-stone-700" />
            <p className="text-sm font-semibold text-stone-600 dark:text-stone-300">No customers found</p>
            <p className="text-xs text-stone-400 mt-1">Register a new guest or adjust your search.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-stone-50 dark:bg-stone-800/60 text-stone-500 dark:text-stone-400 text-xs uppercase tracking-wider border-b border-stone-200 dark:border-stone-800">
                <tr>
                  <th className="py-3 px-4">Customer Name</th>
                  <th className="py-3 px-4">Contact Phone</th>
                  <th className="py-3 px-4">Email Address</th>
                  <th className="py-3 px-4">Total Visits</th>
                  <th className="py-3 px-4">Notes / Preferences</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800 text-stone-700 dark:text-stone-200">
                {customers.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((c) => (
                  <tr key={c.id} className="hover:bg-stone-50/60 dark:hover:bg-stone-800/40 transition">
                    <td className="py-3.5 px-4 font-bold text-stone-900 dark:text-stone-100">
                      <div className="flex items-center gap-3">
                        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#FFB02E] to-[#D97706] text-[#0D1420] font-bold border border-[#F59E0B]/50 text-xs shadow-2xs">
                          <AuthenticatedImage
                            src={c.image_url}
                            alt={c.full_name}
                            fallback={(c.full_name || "?").charAt(0).toUpperCase()}
                          />
                        </div>
                        <span>{c.full_name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-stone-700 dark:text-stone-300">
                      <span className="flex items-center gap-1.5">
                        <Phone size={13} className="text-stone-400" />
                        <span>{c.phone}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-stone-600 dark:text-stone-300">
                      {c.email ? (
                        <span className="flex items-center gap-1.5">
                          <Mail size={13} className="text-stone-400" />
                          <span>{c.email}</span>
                        </span>
                      ) : (
                        <span className="text-stone-400">N/A</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-stone-900 dark:text-stone-100">
                      {c.booking_count} bookings
                    </td>
                    <td className="py-3.5 px-4 max-w-[200px] truncate text-stone-500 dark:text-stone-400 text-xs">
                      {c.notes || "—"}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                          c.is_active
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"
                        }`}
                      >
                        {c.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenHistory(c)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 transition cursor-pointer flex items-center gap-1"
                          title="View booking history"
                        >
                          <Calendar size={12} />
                          <span>History</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCustomer(c);
                            setForm({
                              full_name: c.full_name,
                              phone: c.phone,
                              email: c.email || "",
                              notes: c.notes || "",
                              is_active: c.is_active,
                            });
                            setSelectedImageFile(null);
                            setIsImageRemoved(false);
                            setModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition cursor-pointer"
                          title="Edit Customer"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomer(c)}
                          className="p-1.5 rounded-lg border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 transition cursor-pointer"
                          title="Delete Customer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          currentPage={currentPage}
          totalPages={Math.ceil(customers.length / pageSize) || 1}
          onPageChange={setCurrentPage}
          totalRecords={customers.length}
          limit={pageSize}
        />
      </div>

      {/* Customer Add/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCustomer ? "Edit Spa Customer" : "Register Spa Customer"}
        size="sm"
      >
        <form onSubmit={handleSaveCustomer} className="space-y-4 text-xs sm:text-sm">
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

          <div>
            <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="e.g. Radhika Apte"
              className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#292524] text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F59E0B] focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
              Contact Mobile Number *
            </label>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="e.g. 9876543210"
              className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#292524] text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F59E0B] focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
              Email Address (Optional)
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="e.g. guest@example.com"
              className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#292524] text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F59E0B] focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
              Notes / Essential Oil Allergies / Preferences
            </label>
            <textarea
              rows="3"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="e.g. Sensitive to eucalyptus oil; prefers firm pressure..."
              className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#292524] text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F59E0B] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="cust_active_chk"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="w-4 h-4 rounded text-[#F59E0B] focus:ring-[#F59E0B]"
            />
            <label htmlFor="cust_active_chk" className="font-medium text-stone-700 dark:text-stone-300 cursor-pointer">
              Active Guest
            </label>
          </div>

          <div className="pt-4 flex items-center justify-end gap-2 border-t border-stone-100 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 font-bold rounded-xl bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold hover:opacity-95 cursor-pointer transition shadow-xs"
            >
              Save Guest
            </button>
          </div>
        </form>
      </Modal>

      {/* Booking History Modal */}
      <Modal
        isOpen={historyModalOpen && Boolean(historyCustomer)}
        onClose={() => setHistoryModalOpen(false)}
        title={`Appointment History — ${historyCustomer?.full_name || ""}`}
        subtitle={historyCustomer?.phone}
        size="md"
      >
        <div>
          {historyLoading ? (
            <div className="p-8 text-center text-xs text-stone-400">Loading visit history...</div>
          ) : customerBookings.length === 0 ? (
            <div className="p-8 text-center text-xs text-stone-400">No appointments recorded for this guest.</div>
          ) : (
            <div className="space-y-2.5">
              {customerBookings.map((b) => (
                <div
                  key={b.id}
                  className="p-3 rounded-xl border border-stone-200/90 dark:border-stone-800 bg-stone-50/50 dark:bg-[#292524]/60 text-xs flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-stone-900 dark:text-stone-100">
                        {b.booking_number}
                      </span>
                      <BookingStatusBadge status={b.status} />
                    </div>
                    <div className="text-stone-500 dark:text-stone-400 mt-1">
                      {b.booking_date} • {formatTimeRange12Hour(b.start_time, b.end_time)} • Therapist: {b.therapist_name}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-stone-900 dark:text-stone-100 tabular-nums">
                      {formatCurrency(b.estimated_total)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
