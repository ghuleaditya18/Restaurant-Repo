import { useEffect, useState, useCallback } from "react";
import {
  Users,
  Plus,
  Search,
  Phone,
  Mail,
  Edit2,
  Calendar,
  AlertCircle,
  X,
} from "lucide-react";
import spaApi from "../services/spaApi";
import { BookingStatusBadge } from "../components/StatusBadges";
import { useNotification } from "../../../context/NotificationContext";
import { formatTimeRange12Hour } from "../utils/timeFormat";

function formatCurrency(val) {
  const num = Number(val || 0);
  return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SpaCustomers() {
  const { showSuccess, showError } = useNotification();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", notes: "", is_active: true });

  // History Modal
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState(null);
  const [customerBookings, setCustomerBookings] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await spaApi.getCustomers({ search });
      setCustomers(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to load Spa customers.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: form.email?.trim() || null,
        notes: form.notes?.trim() || null,
        is_active: Boolean(form.is_active),
      };

      if (editingCustomer) {
        await spaApi.updateCustomer(editingCustomer.id, payload);
      } else {
        await spaApi.createCustomer(payload);
      }

      setModalOpen(false);
      setEditingCustomer(null);
      showSuccess(
        editingCustomer
          ? "Customer profile updated successfully."
          : "Customer registered successfully.",
        "Customer Saved"
      );
      fetchCustomers();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to save customer.", "Save Error");
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#F5B716]/10 text-[#F5B716] dark:bg-[#F5B716]/20">
              <Users size={20} />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100">
              Customer Management
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
            Registered spa guests, treatment preferences, and appointment records.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingCustomer(null);
            setForm({ full_name: "", phone: "", email: "", notes: "", is_active: true });
            setModalOpen(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-bold rounded-xl bg-[#F5B716] hover:bg-[#E5A910] text-[#1C1917] transition shadow-xs cursor-pointer"
        >
          <Plus size={16} />
          <span>Register Customer</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm flex items-center gap-2">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Search Input */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, or email..."
          className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#F5B716] transition"
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
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-stone-50/60 dark:hover:bg-stone-800/40 transition">
                    <td className="py-3.5 px-4 font-bold text-stone-900 dark:text-stone-100">
                      {c.full_name}
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
                            setModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition cursor-pointer"
                          title="Edit Customer"
                        >
                          <Edit2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-stone-100 dark:border-stone-800">
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                {editingCustomer ? "Edit Spa Customer" : "Register Spa Customer"}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="mt-4 space-y-3.5 text-xs sm:text-sm">
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
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F5B716] focus:outline-none"
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
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F5B716] focus:outline-none"
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
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F5B716] focus:outline-none"
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
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F5B716] focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="cust_active_chk"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4 rounded text-[#F5B716] focus:ring-[#F5B716]"
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
                  className="px-5 py-2 font-bold rounded-xl bg-[#F5B716] hover:bg-[#E5A910] text-[#1C1917] cursor-pointer transition shadow-xs"
                >
                  Save Guest
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Booking History Modal */}
      {historyModalOpen && historyCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
              <div>
                <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                  Appointment History — {historyCustomer.full_name}
                </h2>
                <p className="text-xs text-stone-400">{historyCustomer.phone}</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4">
              {historyLoading ? (
                <div className="p-8 text-center text-xs text-stone-400">Loading visit history...</div>
              ) : customerBookings.length === 0 ? (
                <div className="p-8 text-center text-xs text-stone-400">No appointments recorded for this guest.</div>
              ) : (
                <div className="space-y-2.5">
                  {customerBookings.map((b) => (
                    <div
                      key={b.id}
                      className="p-3 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/40 text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-stone-900 dark:text-stone-100">
                            {b.booking_number}
                          </span>
                          <BookingStatusBadge status={b.status} />
                        </div>
                        <div className="text-stone-500 mt-1">
                          {b.booking_date} • {formatTimeRange12Hour(b.start_time, b.end_time)} • Therapist: {b.therapist_name}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-extrabold text-stone-900 dark:text-stone-100">
                          {formatCurrency(b.estimated_total)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
