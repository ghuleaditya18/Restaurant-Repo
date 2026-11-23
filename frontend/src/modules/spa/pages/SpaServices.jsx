import { useEffect, useState, useCallback } from "react";
import {
  Sparkles,
  Plus,
  Search,
  Clock,
  Edit2,
  CheckCircle2,
  XCircle,
  Layers,
} from "lucide-react";
import spaApi from "../services/spaApi";
import { useNotification } from "../../../context/NotificationContext";
import PageHeader from "../../../components/PageHeader";
import Modal from "../../../components/Modal";
import Pagination from "../../../components/Pagination";

function formatCurrency(val) {
  const num = Number(val || 0);
  return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SpaServices() {
  const { showSuccess, showUpdate, showError } = useNotification();
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCatId, setSelectedCatId] = useState(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Modals
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [serviceForm, setServiceForm] = useState({
    category_id: "",
    name: "",
    description: "",
    price: "",
    duration_minutes: 60,
    is_available: true,
  });

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catForm, setCatForm] = useState({ name: "", description: "", is_active: true });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [catsRes, svcsRes] = await Promise.all([
        spaApi.getServiceCategories(),
        spaApi.getServices(),
      ]);
      setCategories(catsRes.data);
      setServices(svcsRes.data);
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to load Spa services.");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Service Form Submit
  const handleSaveService = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        category_id: Number(serviceForm.category_id),
        name: serviceForm.name.trim(),
        description: serviceForm.description?.trim() || null,
        price: Number(serviceForm.price),
        duration_minutes: Number(serviceForm.duration_minutes),
        is_available: Boolean(serviceForm.is_available),
      };

      if (editingService) {
        await spaApi.updateService(editingService.id, payload);
      } else {
        await spaApi.createService(payload);
      }

      setServiceModalOpen(false);
      setEditingService(null);
      if (editingService) {
        showUpdate("Treatment service updated successfully.", "Service Updated");
      } else {
        showSuccess("Treatment service created successfully.", "Service Saved");
      }
      fetchData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to save service.", "Service Error");
    }
  };

  // Handle Category Form Submit
  const handleSaveCategory = async (e) => {
    e.preventDefault();
    try {
      await spaApi.createServiceCategory({
        name: catForm.name.trim(),
        description: catForm.description?.trim() || null,
        is_active: Boolean(catForm.is_active),
      });
      setCatModalOpen(false);
      setCatForm({ name: "", description: "", is_active: true });
      showSuccess("Treatment category created successfully.", "Category Created");
      fetchData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to create category.", "Category Error");
    }
  };

  const handleToggleAvailability = async (svc) => {
    try {
      const newStatus = !svc.is_available;
      await spaApi.updateService(svc.id, { is_available: newStatus });
      showUpdate(
        `Service "${svc.name}" is now ${newStatus ? "Available" : "Unavailable"}.`,
        "Availability Updated"
      );
      fetchData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to update availability.", "Update Error");
    }
  };

  // Filtered Services
  const filteredServices = services.filter((s) => {
    const matchesCat = selectedCatId ? s.category_id === selectedCatId : true;
    const matchesSearch = search
      ? s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.category_name?.toLowerCase().includes(search.toLowerCase())
      : true;
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* A1 Standard PageHeader */}
      <PageHeader
        title="Spa Services"
        description="Configure spa treatments, therapies, durations, and pricing."
        actions={
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setCatModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 transition cursor-pointer shadow-xs"
            >
              <Layers size={14} />
              <span>Add Category</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingService(null);
                setServiceForm({
                  category_id: categories[0]?.id || "",
                  name: "",
                  description: "",
                  price: "",
                  duration_minutes: 60,
                  is_available: true,
                });
                setServiceModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-bold rounded-xl bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold hover:opacity-95 transition shadow-xs cursor-pointer"
            >
              <Plus size={16} />
              <span>Add Service</span>
            </button>
          </div>
        }
      />

      {/* Categories Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        <button
          type="button"
          onClick={() => {
            setSelectedCatId(null);
            setCurrentPage(1);
          }}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer border ${
            selectedCatId === null
              ? "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold border-[#F59E0B]"
              : "bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800"
          }`}
        >
          All Categories ({services.length})
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setSelectedCatId(c.id);
              setCurrentPage(1);
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer border ${
              selectedCatId === c.id
                ? "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold border-[#F59E0B]"
                : "bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800"
            }`}
          >
            {c.name} ({c.service_count})
          </button>
        ))}
      </div>

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
          placeholder="Search treatments or categories..."
          className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#F59E0B] transition"
        />
      </div>

      {/* Services Grid */}
      {loading ? (
        <div className="p-16 text-center text-sm text-stone-400">Loading spa services...</div>
      ) : filteredServices.length === 0 ? (
        <div className="p-16 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-center">
          <Sparkles size={36} className="mx-auto mb-2 text-stone-300 dark:text-stone-700" />
          <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">No services found</p>
          <p className="text-xs text-stone-400 mt-1">Add a new treatment or clear active filters.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredServices.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((svc) => (
              <div
                key={svc.id}
                className="p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 shadow-xs flex flex-col justify-between hover:border-[#F59E0B]/60 transition"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                      {svc.category_name || "General"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleAvailability(svc)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition ${
                        svc.is_available
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"
                      }`}
                      title="Click to toggle availability"
                    >
                      {svc.is_available ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                      <span>{svc.is_available ? "Available" : "Unavailable"}</span>
                    </button>
                  </div>

                  <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 mt-2.5">
                    {svc.name}
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 line-clamp-2">
                    {svc.description || "No description provided."}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-xs text-stone-600 dark:text-stone-300">
                      <Clock size={14} className="text-[#F59E0B]" />
                      <span>{svc.duration_minutes} mins</span>
                    </div>
                    <div className="text-base font-extrabold text-stone-900 dark:text-stone-100">
                      {formatCurrency(svc.price)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingService(svc);
                        setServiceForm({
                          category_id: svc.category_id,
                          name: svc.name,
                          description: svc.description || "",
                          price: svc.price,
                          duration_minutes: svc.duration_minutes,
                          is_available: svc.is_available,
                        });
                        setServiceModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition cursor-pointer"
                      title="Edit Service"
                    >
                      <Edit2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={Math.ceil(filteredServices.length / pageSize) || 1}
            onPageChange={setCurrentPage}
            totalRecords={filteredServices.length}
            limit={pageSize}
          />
        </div>
      )}

      {/* Add / Edit Service Modal */}
      <Modal
        isOpen={serviceModalOpen}
        onClose={() => setServiceModalOpen(false)}
        title={editingService ? "Edit Spa Service" : "Add New Spa Service"}
        size="md"
      >
        <form onSubmit={handleSaveService} className="space-y-4 text-xs sm:text-sm">
          <div>
            <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
              Category *
            </label>
            <select
              required
              value={serviceForm.category_id}
              onChange={(e) => setServiceForm({ ...serviceForm, category_id: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#151D29] text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F59E0B] focus:outline-none"
            >
              <option value="">Select Category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
              Service Name *
            </label>
            <input
              type="text"
              required
              value={serviceForm.name}
              onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
              placeholder="e.g. Aromatherapy Swedish Massage"
              className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#151D29] text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F59E0B] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                Price (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={serviceForm.price}
                onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })}
                placeholder="2500.00"
                className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#151D29] text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F59E0B] focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                Duration (Minutes) *
              </label>
              <input
                type="number"
                min="5"
                step="5"
                required
                value={serviceForm.duration_minutes}
                onChange={(e) => setServiceForm({ ...serviceForm, duration_minutes: e.target.value })}
                placeholder="60"
                className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#151D29] text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F59E0B] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
              Description
            </label>
            <textarea
              rows="3"
              value={serviceForm.description}
              onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
              placeholder="Therapeutic benefits, herbal oils used, technique details..."
              className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#151D29] text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F59E0B] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="is_available_chk"
              checked={serviceForm.is_available}
              onChange={(e) => setServiceForm({ ...serviceForm, is_available: e.target.checked })}
              className="w-4 h-4 rounded text-[#F59E0B] focus:ring-[#F59E0B]"
            />
            <label htmlFor="is_available_chk" className="font-medium text-stone-700 dark:text-stone-300 cursor-pointer">
              Available for customer booking
            </label>
          </div>

          <div className="pt-4 flex items-center justify-end gap-2 border-t border-stone-100 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setServiceModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 font-bold rounded-xl bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold hover:opacity-95 cursor-pointer transition shadow-xs"
            >
              Save Service
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Category Modal */}
      <Modal
        isOpen={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        title="Add Service Category"
        size="sm"
      >
        <form onSubmit={handleSaveCategory} className="space-y-4 text-xs sm:text-sm">
          <div>
            <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
              Category Name *
            </label>
            <input
              type="text"
              required
              value={catForm.name}
              onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
              placeholder="e.g. Skin Care & Facials"
              className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#151D29] text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F59E0B] focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
              Description
            </label>
            <textarea
              rows="2"
              value={catForm.description}
              onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
              placeholder="Holistic skin rejuvenation and body polishing..."
              className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#151D29] text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#F59E0B] focus:outline-none"
            />
          </div>

          <div className="pt-4 flex items-center justify-end gap-2 border-t border-stone-100 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setCatModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 font-bold rounded-xl bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold hover:opacity-95 cursor-pointer transition shadow-xs"
            >
              Create Category
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
