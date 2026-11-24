import { useEffect, useState, useCallback } from "react";
import {
  Sparkles,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  CheckCircle2,
  XCircle,
  Layers,
  Trash2,
  Eye,
  Power,
} from "lucide-react";
import spaApi from "../services/spaApi";
import { useNotification } from "../../../context/NotificationContext";
import PageHeader from "../../../components/PageHeader";
import Modal from "../../../components/Modal";
import Pagination from "../../../components/Pagination";
import BulkSelectionBar from "../../../components/BulkSelectionBar";
import useBulkSelection from "../../../hooks/useBulkSelection";

function formatCurrency(val) {
  const num = Number(val || 0);
  return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SpaServices() {
  const { showSuccess, showUpdate, showDelete, showError, confirm } = useNotification();
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const { selectedIds, toggle, toggleMany, clear } = useBulkSelection();
  const [viewingService, setViewingService] = useState(null);
  const [availabilityUpdatingId, setAvailabilityUpdatingId] = useState(null);
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
    setAvailabilityUpdatingId(svc.id);
    try {
      const newStatus = !svc.is_available;
      await spaApi.updateService(svc.id, { is_available: newStatus });
      showUpdate(
        `Service "${svc.name}" is now ${newStatus ? "Available" : "Unavailable"}.`,
        "Availability Updated"
      );
      await fetchData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to update availability.", "Update Error");
    } finally {
      setAvailabilityUpdatingId(null);
    }
  };

  const openEditService = (svc) => {
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
  };

  const handleDeleteService = async (svc) => {
    const ok = await confirm({
      title: "Delete Spa Service",
      message: `Remove "${svc.name}" from available treatments? The service will be deactivated so historical booking records remain intact.`,
      confirmText: "Delete Service",
      variant: "danger",
    });
    if (!ok) return;

    try {
      const res = await spaApi.deleteService(svc.id);
      showDelete(res.data?.message || `"${svc.name}" deleted successfully.`, "Service Deleted");
      await fetchData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to delete service.", "Delete Failed");
    }
  };

  const handleDeleteCategory = async (category) => {
    const ok = await confirm({
      title: "Delete Treatment Category",
      message: `Delete "${category.name}"? Categories with services cannot be deleted.`,
      confirmText: "Delete Category",
      variant: "danger",
    });
    if (!ok) return;

    try {
      const res = await spaApi.deleteServiceCategory(category.id);
      showDelete(res.data?.message || `"${category.name}" deleted successfully.`, "Category Deleted");
      if (selectedCatId === category.id) setSelectedCatId(null);
      await fetchData();
    } catch (err) {
      showError(err?.response?.data?.detail || "Failed to delete category.", "Delete Failed");
    }
  };

  const handleDeleteSelectedServices = async () => {
    const targets = services.filter((service) => selectedIds.has(service.id));
    if (!targets.length) return;
    const ok = await confirm({
      title: "Delete Selected Services",
      message: `Remove ${targets.length} selected service(s) from new bookings? Services will be deactivated so booking history remains intact.`,
      confirmText: "Delete Selected",
      variant: "danger",
    });
    if (!ok) return;
    const results = await Promise.allSettled(targets.map((service) => spaApi.deleteService(service.id)));
    clear();
    const succeeded = results.filter((result) => result.status === "fulfilled").length;
    const failed = results.length - succeeded;
    if (succeeded) showDelete(`${succeeded} service(s) deactivated.`, "Services Removed");
    if (failed) showError(`${failed} service(s) could not be removed.`, "Some Deletions Failed");
    await fetchData();
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
  const selectedCategory = categories.find((category) => category.id === selectedCatId);

  return (
    <div className="space-y-4">
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

      {/* Compact search and category filters */}
      <div className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-[#101722] sm:flex-row sm:items-center sm:justify-start sm:gap-2">
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-none">
          <select
            value={selectedCatId ?? ""}
            onChange={(e) => {
              setSelectedCatId(e.target.value ? Number(e.target.value) : null);
              setCurrentPage(1);
            }}
            aria-label="Filter services by category"
            className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#F59E0B] dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 sm:w-96"
          >
            <option value="">All Categories ({services.length})</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} ({category.service_count})
              </option>
            ))}
          </select>
          {selectedCategory && (
            <button
              type="button"
              onClick={() => handleDeleteCategory(selectedCategory)}
              className="shrink-0 rounded-lg border border-stone-200 bg-white p-2 text-stone-400 transition hover:bg-rose-50 hover:text-rose-600 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-rose-950/30"
              title={`Delete ${selectedCategory.name} category`}
              aria-label={`Delete ${selectedCategory.name} category`}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search"
            className="w-full rounded-lg border border-stone-200 bg-white py-2 pl-9 pr-3 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#F59E0B] dark:border-stone-700 dark:bg-[#151D29] dark:text-stone-100"
          />
        </div>
      </div>

      <BulkSelectionBar count={selectedIds.size} onDelete={handleDeleteSelectedServices} onClear={clear} />

      {/* Services Table */}
      {loading ? (
        <div className="rounded-xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-400 dark:border-stone-800 dark:bg-[#101722]">Loading spa services...</div>
      ) : filteredServices.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-white p-10 text-center dark:border-stone-800 dark:bg-[#101722]">
          <Sparkles size={30} className="mx-auto mb-2 text-stone-300 dark:text-stone-700" />
          <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">No services found</p>
          <p className="mt-1 text-xs text-stone-400">Add a treatment or adjust your search and category filters.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-[#101722]">
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-800">
            <div>
              <h2 className="text-sm font-bold text-stone-900 dark:text-white">Spa Service Catalogue</h2>
              <p className="mt-0.5 text-xs text-stone-500">{filteredServices.length} services</p>
            </div>
            <button type="button" onClick={fetchData} disabled={loading} aria-label="Refresh services" className="rounded-lg border border-stone-200 p-2 text-stone-500 hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800 disabled:opacity-50">
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500 dark:bg-stone-800/60 dark:text-stone-400">
                <tr>
                  <th className="px-4 py-3"><input type="checkbox" aria-label="Select all services on this page" checked={filteredServices.slice((currentPage - 1) * pageSize, currentPage * pageSize).length > 0 && filteredServices.slice((currentPage - 1) * pageSize, currentPage * pageSize).every((service) => selectedIds.has(service.id))} onChange={() => toggleMany(filteredServices.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((service) => service.id))} className="h-4 w-4 accent-amber-500" /></th>
                  <th className="px-4 py-3 font-semibold">Service</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Duration</th>
                  <th className="px-4 py-3 font-semibold">Price</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {filteredServices.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((svc) => (
                  <tr key={svc.id} className="transition hover:bg-stone-50/70 dark:hover:bg-stone-800/40">
                    <td className="px-4 py-3"><input type="checkbox" aria-label={`Select service ${svc.name}`} checked={selectedIds.has(svc.id)} onChange={() => toggle(svc.id)} className="h-4 w-4 accent-amber-500" /></td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-stone-900 dark:text-white">{svc.name}</p>
                      {svc.description && <p className="mt-0.5 max-w-sm truncate text-xs text-stone-500">{svc.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-stone-600 dark:text-stone-300">{svc.category_name || "General"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-stone-600 dark:text-stone-300">{svc.duration_minutes} min</td>
                    <td className="px-4 py-3 whitespace-nowrap font-semibold text-stone-900 dark:text-white">{formatCurrency(svc.price)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${svc.is_available ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"}`}>
                        {svc.is_available ? <CheckCircle2 size={12} /> : <XCircle size={12} />}{svc.is_available ? "Available" : "Unavailable"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => setViewingService(svc)} title="View service details" aria-label={`View ${svc.name}`} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-700 dark:hover:text-white"><Eye size={15} /></button>
                        <button type="button" onClick={() => openEditService(svc)} title="Edit service" aria-label={`Edit ${svc.name}`} className="rounded-lg p-2 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40"><Edit2 size={15} /></button>
                        <button type="button" onClick={() => handleToggleAvailability(svc)} disabled={availabilityUpdatingId === svc.id} title={svc.is_available ? "Deactivate service" : "Activate service"} aria-label={`${svc.is_available ? "Deactivate" : "Activate"} ${svc.name}`} className={`rounded-lg p-2 disabled:opacity-50 ${svc.is_available ? "text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-700" : "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"}`}><Power size={15} /></button>
                        <button type="button" onClick={() => handleDeleteService(svc)} title="Delete / deactivate service" aria-label={`Delete ${svc.name}`} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

      <Modal isOpen={Boolean(viewingService)} onClose={() => setViewingService(null)} title="Service Details" size="sm">
        {viewingService && (
          <div className="space-y-3 text-sm">
            <div><h3 className="font-bold text-stone-900 dark:text-white">{viewingService.name}</h3><p className="text-xs text-stone-500">{viewingService.category_name || "General"}</p></div>
            <p className="border-t border-stone-100 pt-3 text-xs leading-relaxed text-stone-600 dark:border-stone-800 dark:text-stone-300">{viewingService.description || "No description provided."}</p>
            <div className="grid grid-cols-2 gap-3 text-xs"><div><span className="block text-stone-500">Duration</span>{viewingService.duration_minutes} minutes</div><div><span className="block text-stone-500">Price</span>{formatCurrency(viewingService.price)}</div><div><span className="block text-stone-500">Status</span>{viewingService.is_available ? "Available" : "Unavailable"}</div></div>
          </div>
        )}
      </Modal>

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
