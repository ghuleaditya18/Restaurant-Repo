import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Armchair,
  Plus,
  Search,
  Pencil,
  Eye,
  Trash2,
  Power,
  X,
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
  const [tables, setTables] = useState([]);

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

  // Notifications
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // ==========================================
  // LOAD TABLES
  // ==========================================

  const loadTables = useCallback(async () => {
    setLoading(true);
    setPageError("");

    try {
      const data = await getAllTables();
      setTables(data);
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

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

        setSuccessMessage("Table details updated successfully.");
      } else {
        await createTable(tableData);

        setSuccessMessage("New table created successfully.");
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

    const confirmed = window.confirm(
      `Are you sure you want to ${action} Table ${table.table_number}?`,
    );

    if (!confirmed) return;

    setPageError("");
    setSuccessMessage("");

    try {
      const updatedTable = await updateTable(table.id, {
        is_active: !table.is_active,
      });

      setTables((previous) =>
        previous.map((item) => (item.id === table.id ? updatedTable : item)),
      );

      setSuccessMessage(`Table ${table.table_number} ${action}d successfully.`);
    } catch (error) {
      setPageError(getErrorMessage(error));
    }
  };

  // ==========================================
  // DELETE TABLE
  // ==========================================

  const handleDelete = async (table) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete Table ${table.table_number}?`,
    );

    if (!confirmed) return;

    setPageError("");
    setSuccessMessage("");

    try {
      await deleteTable(table.id);

      setTables((previous) => previous.filter((item) => item.id !== table.id));

      setSuccessMessage(`Table ${table.table_number} deleted successfully.`);
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
            Table Management
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Manage restaurant seating and table availability.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="flex items-center justify-center gap-2 rounded-lg bg-[#C65D35] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#A94B2B]"
        >
          <Plus size={18} />
          Add New Table
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

      {/* SUMMARY CARDS */}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Total Tables"
          value={tables.length}
          icon={<Armchair size={19} />}
          active={statusFilter === "ALL"}
          onClick={() => setStatusFilter("ALL")}
        />

        <SummaryCard
          title="Available"
          value={availableCount}
          icon={<CheckCircle2 size={19} />}
          active={statusFilter === "AVAILABLE"}
          onClick={() => setStatusFilter("AVAILABLE")}
        />

        <SummaryCard
          title="Occupied"
          value={occupiedCount}
          icon={<Clock size={19} />}
          active={statusFilter === "OCCUPIED"}
          onClick={() => setStatusFilter("OCCUPIED")}
        />

        <SummaryCard
          title="Inactive"
          value={inactiveCount}
          icon={<Ban size={19} />}
          active={statusFilter === "INACTIVE"}
          onClick={() => setStatusFilter("INACTIVE")}
        />
      </div>

      {/* TABLE LIST CONTAINER */}

      <div className="overflow-hidden rounded-xl border border-[#E9E3DA] bg-white">
        {/* SEARCH AND FILTER */}

        <div className="flex flex-col gap-4 border-b border-[#EEE9E2] p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-[#29231F]">Restaurant Tables</h2>

            <p className="mt-1 text-xs text-gray-500">
              {filteredTables.length} tables found
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
                placeholder="Search table number..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-lg border border-[#E9E3DA] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#C65D35] sm:w-60"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-lg border border-[#E9E3DA] px-3 py-2.5 text-sm text-[#29231F] outline-none focus:border-[#C65D35]"
            >
              <option value="ALL">All Tables</option>
              <option value="AVAILABLE">Available</option>
              <option value="OCCUPIED">Occupied</option>
              <option value="INACTIVE">Inactive</option>
            </select>

            <button
              onClick={loadTables}
              disabled={loading}
              title="Refresh tables"
              className="flex items-center justify-center rounded-lg border border-[#E9E3DA] px-3 py-2.5 text-gray-600 hover:bg-[#F7F5F0]"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* TABLE RECORDS */}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left">
            <thead className="bg-[#FAF9F6] text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Table Number</th>
                <th className="px-4 py-3">Capacity</th>
                <th className="px-4 py-3">Occupancy Status</th>
                <th className="px-4 py-3">Account Status</th>
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
                    Loading restaurant tables...
                  </td>
                </tr>
              ) : filteredTables.length === 0 ? (
                <tr>
                  <td
                    colSpan="5"
                    className="px-4 py-12 text-center text-sm text-gray-500"
                  >
                    No restaurant tables found.
                  </td>
                </tr>
              ) : (
                filteredTables.map((table) => (
                  <tr key={table.id} className="transition hover:bg-[#FAF9F6]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F5E5DC] text-[#C65D35]">
                          <Armchair size={18} />
                        </div>

                        <div>
                          <p className="font-medium text-[#29231F]">
                            Table {table.table_number}
                          </p>

                          <p className="text-xs text-gray-500">
                            ID: {table.id}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-600">
                      <span className="inline-flex items-center gap-1">
                        <Users size={15} />
                        {table.capacity} seats
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          table.status?.toLowerCase() === "occupied"
                            ? "bg-[#F5E5DC] text-[#A94B2B]"
                            : "bg-[#EEEAE4] text-[#6B625B]"
                        }`}
                      >
                        {table.status}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          table.is_active
                            ? "bg-[#F5E5DC] text-[#A94B2B]"
                            : "bg-[#EEEAE4] text-[#6B625B]"
                        }`}
                      >
                        {table.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openViewModal(table)}
                          title="View table"
                          className="rounded-lg p-2 text-[#29231F] hover:bg-[#F5E5DC] hover:text-[#C65D35]"
                        >
                          <Eye size={16} />
                        </button>

                        <button
                          onClick={() => openEditModal(table)}
                          title="Edit table"
                          className="rounded-lg p-2 text-[#29231F] hover:bg-[#F5E5DC] hover:text-[#C65D35]"
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          onClick={() => handleStatusChange(table)}
                          title={
                            table.is_active
                              ? "Deactivate table"
                              : "Activate table"
                          }
                          className="rounded-lg p-2 text-[#29231F] hover:bg-[#F5E5DC] hover:text-[#C65D35]"
                        >
                          <Power size={16} />
                        </button>

                        <button
                          onClick={() => handleDelete(table)}
                          title="Delete table"
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

      {/* ADD / EDIT MODAL */}

      {showModal && (
        <ModalShell
          title={editingTable ? "Edit Table" : "Add New Table"}
          subtitle="Enter restaurant table information."
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
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Occupancy Status
                </label>
                <select
                  name="status"
                  value={form.status || "Available"}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-[#E9E3DA] px-3 py-2.5 text-sm text-[#29231F] outline-none focus:border-[#C65D35]"
                >
                  <option value="Available">Available</option>
                  <option value="Occupied">Occupied</option>
                </select>
                <p className="mt-1 text-xs text-gray-400">
                  Tables with active orders cannot be manually marked Available.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 border-t border-[#EEE9E2] pt-4">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-[#E9E3DA] px-4 py-2.5 text-sm text-gray-600"
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
          subtitle="Restaurant seating information."
          onClose={closeViewModal}
        >
          {viewLoading ? (
            <p className="py-10 text-center text-sm text-gray-500">
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
                  value={viewingTable.table_number}
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
          <p className="text-sm text-gray-500">{title}</p>
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
  maxLength,
  min,
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
        maxLength={maxLength}
        min={min}
        step={type === "number" ? "1" : undefined}
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
