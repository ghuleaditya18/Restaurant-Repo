import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Armchair,
  Plus,
  Search,
  Pencil,
  Eye,
  Trash2,
  Power,
  RefreshCw,
  Users,
  CheckCircle2,
  Clock,
  Ban,
} from "lucide-react";

import {
  getAllTables,
  getTableById,
  createTable,
  updateTable,
  deleteTable,
} from "../services/tableService";
import { useNotification } from "../context/NotificationContext";
import PageHeader from "../components/PageHeader";
import Modal from "../components/Modal";
import StatCard from "../components/StatCard";
import Pagination from "../components/Pagination";
import BulkSelectionBar from "../components/BulkSelectionBar";
import useBulkSelection from "../hooks/useBulkSelection";

const EMPTY_FORM = {
  table_number: "",
  capacity: "",
  status: "Available",
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

export default function Tables() {
  const { showSuccess, showUpdate, showDelete, showError, confirm } = useNotification();
  const [tables, setTables] = useState([]);
  const { selectedIds, toggle, toggleMany, clear } = useBulkSelection();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add / Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  // View modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingTable, setViewingTable] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState("");

  // Search and filter
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Pagination (10 records per page)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // ==========================================
  // LOAD TABLES
  // ==========================================

  const loadTables = useCallback(async () => {
    setLoading(true);

    try {
      const data = await getAllTables();
      setTables(data);
    } catch (error) {
      showError(getErrorMessage(error), "Failed to Load Tables");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  // ==========================================
  // TABLE STATISTICS
  // ==========================================

  const availableCount = tables.filter(
    (table) => table.is_active && table.status?.toLowerCase() === "available",
  ).length;

  const occupiedCount = tables.filter(
    (table) => table.is_active && table.status?.toLowerCase() === "occupied",
  ).length;

  const inactiveCount = tables.filter((table) => !table.is_active).length;

  // ==========================================
  // SEARCH AND FILTER
  // ==========================================

  const filteredTables = useMemo(() => {
    return tables.filter((table) => {
      const matchesSearch = table.table_number
        .toLowerCase()
        .includes(search.trim().toLowerCase());

      const normalizedStatus = table.status?.toLowerCase();

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "AVAILABLE" &&
          table.is_active &&
          normalizedStatus === "available") ||
        (statusFilter === "OCCUPIED" &&
          table.is_active &&
          normalizedStatus === "occupied") ||
        (statusFilter === "INACTIVE" && !table.is_active);

      return matchesSearch && matchesStatus;
    });
  }, [tables, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTables.length / pageSize));
  const paginatedTables = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTables.slice(start, start + pageSize);
  }, [filteredTables, currentPage, pageSize]);

  // ==========================================
  // ADD TABLE
  // ==========================================

  const openAddModal = () => {
    setEditingTable(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setShowModal(true);
  };

  // ==========================================
  // EDIT TABLE
  // ==========================================

  const openEditModal = (table) => {
    setEditingTable(table);

    setForm({
      table_number: table.table_number,
      capacity: String(table.capacity),
      status: table.status || "Available",
    });

    setFormError("");
    setShowModal(true);
  };

  // ==========================================
  // FORM INPUT
  // ==========================================

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // ==========================================
  // CREATE / UPDATE TABLE
  // ==========================================

  const handleSubmit = async (event) => {
    event.preventDefault();

    setSaving(true);
    setFormError("");

    const tableData = {
      table_number: form.table_number.trim(),
      capacity: Number(form.capacity),
    };

    if (editingTable && form.status) {
      tableData.status = form.status;
    }

    try {
      if (editingTable) {
        await updateTable(editingTable.id, tableData);
        showUpdate("Table details updated successfully.", "Table Updated");
      } else {
        await createTable(tableData);
        showSuccess("New table created successfully.", "Table Created");
      }

      setShowModal(false);
      setEditingTable(null);
      setForm(EMPTY_FORM);

      await loadTables();
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // VIEW TABLE
  // ==========================================

  const openViewModal = async (table) => {
    setShowViewModal(true);
    setViewingTable(null);
    setViewError("");
    setViewLoading(true);

    try {
      const data = await getTableById(table.id);
      setViewingTable(data);
    } catch (error) {
      setViewError(getErrorMessage(error));
    } finally {
      setViewLoading(false);
    }
  };

  const closeViewModal = () => {
    setShowViewModal(false);
    setViewingTable(null);
    setViewError("");
  };

  // ==========================================
  // ACTIVATE / DEACTIVATE TABLE
  // ==========================================

  const handleStatusChange = async (table) => {
    const action = table.is_active ? "deactivate" : "activate";

    const confirmed = await confirm({
      title: `${table.is_active ? "Deactivate" : "Activate"} Table`,
      message: `Are you sure you want to ${action} Table ${table.table_number}?`,
      confirmText: action === "deactivate" ? "Deactivate" : "Activate",
      cancelText: "Cancel",
      variant: table.is_active ? "warning" : "primary",
    });

    if (!confirmed) return;

    try {
      const updatedTable = await updateTable(table.id, {
        is_active: !table.is_active,
      });

      setTables((previous) =>
        previous.map((item) => (item.id === table.id ? updatedTable : item)),
      );

      showUpdate(`Table ${table.table_number} ${action}d successfully.`, "Table Status Updated");
    } catch (error) {
      showError(getErrorMessage(error), "Update Failed");
    }
  };

  // ==========================================
  // DELETE TABLE
  // ==========================================

  const handleDelete = async (table) => {
    const confirmed = await confirm({
      title: "Delete Table",
      message: `Are you sure you want to delete Table ${table.table_number}? This action cannot be undone.`,
      confirmText: "Delete Table",
      cancelText: "Cancel",
      variant: "danger",
    });

    if (!confirmed) return;

    try {
      await deleteTable(table.id);

      setTables((previous) => previous.filter((item) => item.id !== table.id));
      showDelete(`Table ${table.table_number} deleted successfully.`, "Table Deleted");
    } catch (error) {
      showError(getErrorMessage(error), "Delete Failed");
    }
  };

  const handleDeleteSelected = async () => {
    const targets = tables.filter((table) => selectedIds.has(table.id));
    const confirmed = await confirm({
      title: "Delete Selected Tables",
      message: `Permanently delete ${targets.length} selected table(s)? This action cannot be undone.`,
      confirmText: "Delete Selected",
      variant: "danger",
    });
    if (!confirmed) return;
    const results = await Promise.allSettled(targets.map((table) => deleteTable(table.id)));
    const deletedIds = targets.filter((_, index) => results[index].status === "fulfilled").map((table) => table.id);
    setTables((previous) => previous.filter((table) => !deletedIds.includes(table.id)));
    clear();
    const failed = results.length - deletedIds.length;
    if (deletedIds.length) showDelete(`${deletedIds.length} table(s) deleted successfully.`, "Tables Deleted");
    if (failed) showError(`${failed} table(s) could not be deleted. Refresh and review those records.`, "Some Deletions Failed");
  };

  // ==========================================
  // PAGE UI
  // ==========================================

  return (
    <div className="space-y-6">
      {/* A1 Standard PageHeader */}
      <PageHeader
        title="Tables"
        actions={
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] px-4 py-2.5 text-sm font-bold text-[#0D1420] shadow-xs transition hover:opacity-95 cursor-pointer"
          >
            <Plus size={18} />
            <span>Add New Table</span>
          </button>
        }
      />

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard
          title="Total Tables"
          value={tables.length}
          icon={<Armchair size={19} />}
          active={statusFilter === "ALL"}
          onClick={() => {
            setStatusFilter("ALL");
            setCurrentPage(1);
          }}
        />

        <StatCard
          title="Available"
          value={availableCount}
          icon={<CheckCircle2 size={19} />}
          badgeColor="bg-emerald-50 text-emerald-800 border-emerald-200"
          active={statusFilter === "AVAILABLE"}
          onClick={() => {
            setStatusFilter("AVAILABLE");
            setCurrentPage(1);
          }}
        />

        <StatCard
          title="Occupied"
          value={occupiedCount}
          icon={<Clock size={19} />}
          badgeColor="bg-amber-50 text-amber-800 border-amber-200"
          active={statusFilter === "OCCUPIED"}
          onClick={() => {
            setStatusFilter("OCCUPIED");
            setCurrentPage(1);
          }}
        />

        <StatCard
          title="Inactive"
          value={inactiveCount}
          icon={<Ban size={19} />}
          badgeColor="bg-stone-100 text-stone-600 border-stone-200"
          active={statusFilter === "INACTIVE"}
          onClick={() => {
            setStatusFilter("INACTIVE");
            setCurrentPage(1);
          }}
        />
      </div>

      {/* TABLE LIST CONTAINER */}
      <BulkSelectionBar count={selectedIds.size} onDelete={handleDeleteSelected} onClear={clear} />
      <div className="overflow-hidden rounded-xl border border-stone-200/90 bg-white shadow-xs">
        {/* SEARCH AND FILTER */}
        <div className="flex flex-col gap-4 border-b border-stone-200/80 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-bold text-stone-900 dark:text-stone-100">Restaurant Tables</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {filteredTables.length} {filteredTables.length === 1 ? "table" : "tables"} found
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <input
                type="text"
                placeholder="Search table number..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-lg border border-stone-300 bg-white py-2 pl-9 pr-3 text-sm text-stone-900 outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/30 sm:w-60"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setCurrentPage(1);
              }}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/30"
            >
              <option value="ALL">All Tables</option>
              <option value="AVAILABLE">Available</option>
              <option value="OCCUPIED">Occupied</option>
              <option value="INACTIVE">Inactive</option>
            </select>

            <button
              type="button"
              onClick={loadTables}
              disabled={loading}
              title="Refresh tables"
              className="flex items-center justify-center rounded-lg border border-stone-200 bg-white px-3 py-2 text-stone-600 hover:bg-stone-50 transition cursor-pointer"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* TABLE RECORDS */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left">
            <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-4 py-3 text-center"><input type="checkbox" aria-label="Select all tables on this page" checked={paginatedTables.length > 0 && paginatedTables.every((table) => selectedIds.has(table.id))} onChange={() => toggleMany(paginatedTables.map((table) => table.id))} className="h-4 w-4 accent-amber-500" /></th>
                <th className="px-4 py-3">Table Number</th>
                <th className="px-4 py-3">Capacity</th>
                <th className="px-4 py-3">Occupancy Status</th>
                <th className="px-4 py-3">Account Status</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-stone-100 text-sm">
              {loading ? (
                <tr>
                  <td
                    colSpan="6"
                    className="px-4 py-12 text-center text-sm text-stone-500"
                  >
                    Loading restaurant tables...
                  </td>
                </tr>
              ) : filteredTables.length === 0 ? (
                <tr>
                  <td
                    colSpan="6"
                    className="px-4 py-12 text-center text-sm text-stone-500"
                  >
                    No restaurant tables found.
                  </td>
                </tr>
              ) : (
                paginatedTables.map((table) => {
                  const isOccupied = table.status?.toLowerCase() === "occupied";
                  return (
                    <tr key={table.id} className="transition hover:bg-stone-50/70">
                      <td className="px-4 py-3 text-center"><input type="checkbox" aria-label={`Select table ${table.table_number}`} checked={selectedIds.has(table.id)} onChange={() => toggle(table.id)} className="h-4 w-4 accent-amber-500" /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
                            isOccupied
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-[#FFF7E8] text-[#9A3412] border-[#FFEDD5] dark:bg-[#30251C] dark:text-[#FFB02E] dark:border-[#9A3412]/40"
                          }`}>
                            <Armchair size={18} />
                          </div>

                          <div>
                            <p className="font-semibold text-stone-900">
                              Table {table.table_number}
                            </p>
                            <p className="text-xs text-stone-400">
                              ID: {table.id}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-sm text-stone-600">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <Users size={15} className="text-stone-400" />
                          {table.capacity} seats
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            isOccupied
                              ? "bg-amber-50 text-amber-800 border border-amber-200"
                              : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${isOccupied ? "bg-amber-500" : "bg-emerald-500"}`} />
                          <span>{table.status}</span>
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            table.is_active
                              ? "bg-stone-100 text-stone-800 border border-stone-200"
                              : "bg-stone-100 text-stone-400 border border-stone-200"
                          }`}
                        >
                          {table.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openViewModal(table)}
                            title="View table details"
                            className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition cursor-pointer"
                          >
                            <Eye size={16} />
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditModal(table)}
                            title="Edit table"
                            className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition cursor-pointer"
                          >
                            <Pencil size={16} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStatusChange(table)}
                            title={
                              table.is_active
                                ? "Deactivate table"
                                : "Activate table"
                            }
                            className={`rounded-lg p-2 transition cursor-pointer ${
                              table.is_active
                                ? "text-amber-700 hover:bg-amber-50"
                                : "text-emerald-700 hover:bg-emerald-50"
                            }`}
                          >
                            <Power size={16} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(table)}
                            title="Delete table"
                            className="rounded-lg p-2 text-stone-400 hover:bg-red-50 hover:text-red-700 transition cursor-pointer"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION (10 per page) */}
        <div className="p-4 border-t border-stone-200/80 dark:border-stone-800">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={filteredTables.length}
            pageSize={pageSize}
            onPageChange={(p) => setCurrentPage(p)}
          />
        </div>
      </div>

      {/* ADD / EDIT MODAL */}
      {showModal && (
        <ModalShell
          title={editingTable ? "Edit Dining Table" : "Add New Dining Table"}
          subtitle="Enter seating and table identification information."
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && <ErrorBox message={formError} />}

            <FormField
              label="Table Number"
              name="table_number"
              value={form.table_number}
              onChange={handleChange}
              placeholder="e.g. 1, T-02, VIP-1"
              required
              maxLength={20}
            />

            <FormField
              label="Seating Capacity"
              name="capacity"
              type="number"
              value={form.capacity}
              onChange={handleChange}
              placeholder="Enter seating capacity"
              required
              min={1}
            />

            {editingTable && (
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-700">
                  Occupancy Status
                </label>
                <select
                  name="status"
                  value={form.status || "Available"}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-[#F59E0B]"
                >
                  <option value="Available">Available</option>
                  <option value="Occupied">Occupied</option>
                </select>
                <p className="mt-1 text-xs text-stone-500">
                  Tables with active dining orders cannot be manually marked Available.
                </p>
              </div>
            )}

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
                  : editingTable
                    ? "Save Changes"
                    : "Create Table"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* VIEW TABLE MODAL */}
      {showViewModal && (
        <ModalShell
          title="Table Details"
          subtitle="Dining seating specifications and live state."
          onClose={closeViewModal}
        >
          {viewLoading ? (
            <p className="py-10 text-center text-sm text-stone-500">
              Loading table details...
            </p>
          ) : viewError ? (
            <ErrorBox message={viewError} />
          ) : (
            viewingTable && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <DetailItem label="Table ID" value={viewingTable.id} />

                <DetailItem
                  label="Table Number"
                  value={`Table ${viewingTable.table_number}`}
                />

                <DetailItem
                  label="Seating Capacity"
                  value={`${viewingTable.capacity} seats`}
                />

                <DetailItem
                  label="Occupancy Status"
                  value={viewingTable.status}
                />

                <DetailItem
                  label="Account Status"
                  value={viewingTable.is_active ? "Active" : "Inactive"}
                />
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
  maxLength,
  min,
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
        maxLength={maxLength}
        min={min}
        step={type === "number" ? "1" : undefined}
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/30"
      />
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="rounded-lg border border-stone-100 bg-stone-50/70 p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-500">
        {label}
      </p>

      <p className="break-words text-sm font-bold text-stone-900 dark:text-stone-100">
        {value ?? "—"}
      </p>
    </div>
  );
}
