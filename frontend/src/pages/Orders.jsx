import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShoppingCart,
  Plus,
  Search,
  Eye,
  X,
  Pencil,
  RefreshCw,
  Trash2,
  History,
} from "lucide-react";

import {
  getAllOrders,
  getOrderById,
  getOrderCustomers,
  getOrderTables,
  getOrderMenuItems,
  createOrder,
  updateOrder,
  addOrderItem,
  updateOrderItem,
  removeOrderItem,
  updateOrderStatus,
} from "../services/orderService";
import DateFilter from "../components/DateFilter";
import { useNotification } from "../context/NotificationContext";

// ==========================================
// CONSTANTS
// ==========================================

const STATUS_TRANSITIONS = {
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["Preparing", "Cancelled"],
  Preparing: ["Ready", "Cancelled"],
  Ready: ["Served", "Cancelled"],
  Served: ["Completed"],
  Completed: [],
  Cancelled: [],
};

const EMPTY_FORM = {
  customer_id: "",
  table_id: "",
  special_instructions: "",
};

// ==========================================
// HELPERS
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

const formatCurrency = (amount) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(Number(amount || 0));
};

const getStatusStyle = (status) => {
  const styles = {
    Pending: "bg-[#FFF3DB] text-[#956719] border border-[#F5E2B8]",
    Confirmed: "bg-[#F5E5DC] text-[#A94B2B] border border-[#ECCDC1]",
    Preparing: "bg-[#F3EBDD] text-[#846C37] border border-[#E3D6BF]",
    Ready: "bg-[#E8EDE5] text-[#52684A] border border-[#CDD8C8]",
    Served: "bg-[#E0F2FE] text-[#0369A1] border border-[#BAE6FD]",
    Completed: "bg-[#E2E8F0] text-[#334155] border border-[#CBD5E1]",
    Cancelled: "bg-[#FEE2E2] text-[#991B1B] border border-[#FECACA]",
  };

  return styles[status] || "bg-gray-100 text-gray-700 border border-gray-200";
};

const getPaymentBadge = (paymentStatus) => {
  const norm = String(paymentStatus || "").trim().toUpperCase();
  if (norm === "PAID") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
        Paid
      </span>
    );
  }
  if (norm === "PENDING") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
        Payment Pending
      </span>
    );
  }
  return <span className="text-xs text-stone-400">Uninvoiced</span>;
};

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function Orders() {
  const { showSuccess, showError, showWarning, showInfo, confirm } = useNotification();

  // Active view tab: 'active' | 'history'
  const [activeTab, setActiveTab] = useState("active");

  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [tables, setTables] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // History tab date filter
  const [historyDateFilter, setHistoryDateFilter] = useState({
    preset: "today",
    startDate: "",
    endDate: "",
  });

  // Create order modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [cart, setCart] = useState([]);
  const [selectedMenuItem, setSelectedMenuItem] = useState("");
  const [itemQuantity, setItemQuantity] = useState(1);
  const [formError, setFormError] = useState("");

  // Order details modal
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [quantityModal, setQuantityModal] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");

  // Order modification
  const [instructionText, setInstructionText] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [statusTarget, setStatusTarget] = useState("");
  const [additionalItem, setAdditionalItem] = useState("");
  const [additionalQuantity, setAdditionalQuantity] = useState(1);

  // Search and status filter
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // ==========================================
  // LOAD ORDERS DATA
  // ==========================================

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      let params = {};
      if (activeTab === "active") {
        params.view = "active";
      } else {
        params.view = "history";
        params.preset = historyDateFilter.preset;
        if (historyDateFilter.preset === "custom") {
          if (historyDateFilter.startDate) params.start_date = historyDateFilter.startDate;
          if (historyDateFilter.endDate) params.end_date = historyDateFilter.endDate;
        }
      }

      const [orderData, customerData, tableData, menuData] = await Promise.all([
        getAllOrders(params),
        customers.length ? Promise.resolve(customers) : getOrderCustomers(),
        getOrderTables(), // Always refresh table status
        menuItems.length ? Promise.resolve(menuItems) : getOrderMenuItems(),
      ]);

      setOrders(orderData);
      if (!customers.length) setCustomers(customerData);
      setTables(tableData);
      if (!menuItems.length) setMenuItems(menuData);
    } catch (error) {
      showError(getErrorMessage(error), "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [activeTab, historyDateFilter, customers.length, menuItems.length, showError]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Reset status filter when switching tabs
  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    setStatusFilter("ALL");
    setSearch("");
  };

  // ==========================================
  // FILTERED ORDERS
  // ==========================================

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();

    return orders.filter((order) => {
      const matchSearch =
        !query ||
        order.order_number?.toLowerCase().includes(query) ||
        order.customer_name?.toLowerCase().includes(query) ||
        String(order.table_number || "").toLowerCase().includes(query);

      const matchStatus =
        statusFilter === "ALL" ||
        order.status?.toUpperCase() === statusFilter.toUpperCase();

      return matchSearch && matchStatus;
    });
  }, [orders, search, statusFilter]);

  // Active orders metrics
  const activeMetrics = useMemo(() => {
    if (activeTab !== "active") return null;
    const pending = orders.filter((o) => o.status === "Pending").length;
    const confirmed = orders.filter((o) => o.status === "Confirmed").length;
    const preparing = orders.filter((o) => o.status === "Preparing").length;
    const ready = orders.filter((o) => o.status === "Ready").length;
    const served = orders.filter((o) => o.status === "Served").length;
    return { pending, confirmed, preparing, ready, served, total: orders.length };
  }, [orders, activeTab]);

  // ==========================================
  // CREATE ORDER HANDLERS
  // ==========================================

  const openCreateModal = () => {
    setForm(EMPTY_FORM);
    setCart([]);
    setSelectedMenuItem("");
    setItemQuantity(1);
    setFormError("");
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setForm(EMPTY_FORM);
    setCart([]);
    setFormError("");
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleAddItemToCart = () => {
    if (!selectedMenuItem) return;

    const menuItem = menuItems.find((item) => item.id === Number(selectedMenuItem));
    if (!menuItem) return;

    const quantity = Number(itemQuantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      setFormError("Item quantity must be at least 1.");
      return;
    }

    setCart((previous) => {
      const existing = previous.find((item) => item.menu_item_id === menuItem.id);
      if (existing) {
        return previous.map((item) =>
          item.menu_item_id === menuItem.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [
        ...previous,
        {
          menu_item_id: menuItem.id,
          name: menuItem.name,
          price: menuItem.price,
          quantity,
        },
      ];
    });

    setSelectedMenuItem("");
    setItemQuantity(1);
    setFormError("");
  };

  const handleRemoveFromCart = (menuItemId) => {
    setCart((prev) => prev.filter((item) => item.menu_item_id !== menuItemId));
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  }, [cart]);

  const handleCreateOrder = async (event) => {
    event.preventDefault();
    setFormError("");

    if (!form.customer_id) {
      setFormError("Please select a dining customer.");
      return;
    }
    if (!form.table_id) {
      setFormError("Please select a restaurant table.");
      return;
    }
    if (cart.length === 0) {
      setFormError("Add at least one menu item to the order.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        customer_id: Number(form.customer_id),
        table_id: Number(form.table_id),
        special_instructions: form.special_instructions?.trim() || null,
        items: cart.map((item) => ({
          menu_item_id: item.menu_item_id,
          quantity: item.quantity,
        })),
      };

      const newOrder = await createOrder(payload);
      showSuccess(`Order ${newOrder.order_number} placed successfully.`, "Order Created");
      closeCreateModal();
      await loadOrders();
    } catch (error) {
      setFormError(getErrorMessage(error));
      showError(getErrorMessage(error), "Failed to Create Order");
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // VIEW / MODIFY ORDER DETAILS
  // ==========================================

  const openOrderDetails = async (order) => {
    setShowDetailsModal(true);
    setDetailsLoading(true);
    setDetailsError("");
    setStatusTarget("");
    setStatusNote("");
    setInstructionText(order.special_instructions || "");

    try {
      const fullOrder = await getOrderById(order.id);
      setSelectedOrder(fullOrder);
    } catch (error) {
      setDetailsError(getErrorMessage(error));
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeOrderDetails = () => {
    setShowDetailsModal(false);
    setSelectedOrder(null);
    setDetailsError("");
  };

  const refreshSelectedOrder = async () => {
    if (!selectedOrder) return;
    try {
      const fresh = await getOrderById(selectedOrder.id);
      setSelectedOrder(fresh);
      loadOrders();
    } catch (error) {
      setDetailsError(getErrorMessage(error));
    }
  };

  const handleSaveInstructions = async () => {
    if (!selectedOrder) return;
    setSaving(true);
    setDetailsError("");
    try {
      await updateOrder(selectedOrder.id, {
        special_instructions: instructionText.trim() || null,
      });
      await refreshSelectedOrder();
      showInfo("Special instructions updated.", "Order Updated");
    } catch (error) {
      setDetailsError(getErrorMessage(error));
      showError(getErrorMessage(error), "Update Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!selectedOrder || !statusTarget) return;

    if (statusTarget === "Completed" && selectedOrder.status === "Served" && !selectedOrder.invoice_id) {
      showWarning(
        "An invoice must be generated before this order can be completed. Please navigate to Invoice Management.",
        "Invoice Required"
      );
    }

    setSaving(true);
    setDetailsError("");

    try {
      await updateOrderStatus(selectedOrder.id, {
        status: statusTarget,
        note: statusNote.trim() || null,
      });

      if (statusTarget === "Completed") {
        showSuccess(
          `Order ${selectedOrder.order_number} marked Completed. Table status updated.`,
          "Order Completed"
        );
      } else if (statusTarget === "Cancelled") {
        showError(
          `Order ${selectedOrder.order_number} was cancelled.`,
          "Order Cancelled"
        );
      } else {
        showSuccess(
          `Order ${selectedOrder.order_number} transitioned to ${statusTarget}.`,
          "Status Updated"
        );
      }

      setStatusTarget("");
      setStatusNote("");

      // If status is terminal (Completed / Cancelled), it leaves Active Orders automatically
      if (["Completed", "Cancelled"].includes(statusTarget) && activeTab === "active") {
        closeOrderDetails();
      } else {
        await refreshSelectedOrder();
      }
      await loadOrders();
    } catch (error) {
      const msg = getErrorMessage(error);
      setDetailsError(msg);
      if (msg.toLowerCase().includes("invoice")) {
        showWarning(msg, "Invoice Required");
      } else {
        showError(msg, "Status Update Failed");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAddExistingItem = async () => {
    if (!additionalItem || !selectedOrder) {
      setDetailsError("Select a menu item first.");
      return;
    }

    setSaving(true);
    setDetailsError("");

    try {
      await addOrderItem(selectedOrder.id, {
        menu_item_id: Number(additionalItem),
        quantity: Number(additionalQuantity),
      });

      setAdditionalItem("");
      setAdditionalQuantity(1);
      await refreshSelectedOrder();
      showSuccess("Item added to order successfully.", "Item Added");
    } catch (error) {
      setDetailsError(getErrorMessage(error));
      showError(getErrorMessage(error), "Failed to Add Item");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateItemQuantity = (item) => {
    setQuantityModal({ item, quantity: item.quantity });
  };

  const handleSaveQuantityModal = async (e) => {
    if (e) e.preventDefault();
    if (!quantityModal || !selectedOrder) return;

    const newQuantity = Number(quantityModal.quantity);
    if (!Number.isInteger(newQuantity) || newQuantity < 1) {
      setDetailsError("Quantity must be a positive integer.");
      return;
    }

    setSaving(true);
    try {
      await updateOrderItem(selectedOrder.id, quantityModal.item.id, {
        quantity: newQuantity,
      });
      await refreshSelectedOrder();
      showSuccess("Item quantity updated successfully.", "Quantity Updated");
      setQuantityModal(null);
    } catch (error) {
      setDetailsError(getErrorMessage(error));
      showError(getErrorMessage(error), "Failed to Update Quantity");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveOrderItem = async (item) => {
    const ok = await confirm({
      title: "Remove Item",
      message: `Are you sure you want to remove "${item.item_name}" from this order?`,
      confirmText: "Remove Item",
      cancelText: "Keep Item",
      variant: "danger",
    });

    if (!ok) return;

    setSaving(true);
    try {
      await removeOrderItem(selectedOrder.id, item.id);
      await refreshSelectedOrder();
      showError(`Removed "${item.item_name}" from order.`, "Item Removed");
    } catch (error) {
      setDetailsError(getErrorMessage(error));
      showError(getErrorMessage(error), "Failed to Remove Item");
    } finally {
      setSaving(false);
    }
  };

  const isOrderEditable = selectedOrder && ["Pending", "Confirmed"].includes(selectedOrder.status);

  return (
    <div>
      {/* PAGE HEADER */}
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-[#29231F] md:text-[26px]">
            Order Management
          </h1>
          <p className="mt-1 text-xs text-stone-500 sm:text-sm">
            Coordinate live dining orders and review historical records.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={openCreateModal}
            className="flex items-center justify-center gap-2 rounded-lg bg-[#C65D35] px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#A94B2B]"
          >
            <Plus size={17} />
            Create New Order
          </button>
        </div>
      </div>

      {/* VIEW TABS: ACTIVE ORDERS vs ORDER HISTORY */}
      <div className="mb-6 flex flex-col gap-4 border-b border-[#E9E3DA] pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleTabSwitch("active")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
              activeTab === "active"
                ? "bg-[#C65D35] text-white shadow-xs"
                : "bg-white text-stone-600 hover:bg-stone-50 border border-stone-200"
            }`}
          >
            <ShoppingCart size={17} />
            <span>Active Orders</span>
            {activeMetrics && (
              <span
                className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                  activeTab === "active" ? "bg-white/20 text-white" : "bg-stone-100 text-stone-700"
                }`}
              >
                {activeMetrics.total}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabSwitch("history")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
              activeTab === "history"
                ? "bg-[#C65D35] text-white shadow-xs"
                : "bg-white text-stone-600 hover:bg-stone-50 border border-stone-200"
            }`}
          >
            <History size={17} />
            <span>Order History</span>
          </button>
        </div>

        {/* History Tab Date Filter */}
        {activeTab === "history" && (
          <DateFilter
            selectedPreset={historyDateFilter.preset}
            startDate={historyDateFilter.startDate}
            endDate={historyDateFilter.endDate}
            onChange={(newFilter) => setHistoryDateFilter(newFilter)}
          />
        )}
      </div>

      {/* ACTIVE METRICS ROW (Visible only in Active Orders) */}
      {activeTab === "active" && activeMetrics && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div
            onClick={() => setStatusFilter("ALL")}
            className={`cursor-pointer rounded-xl border p-3 transition ${
              statusFilter === "ALL"
                ? "border-[#C65D35] bg-[#FFF9F5]"
                : "border-stone-200 bg-white hover:border-stone-300"
            }`}
          >
            <p className="text-xs text-stone-500 font-medium">All Active</p>
            <p className="text-xl font-bold text-stone-900">{activeMetrics.total}</p>
          </div>

          <div
            onClick={() => setStatusFilter("PENDING")}
            className={`cursor-pointer rounded-xl border p-3 transition ${
              statusFilter === "PENDING"
                ? "border-amber-500 bg-amber-50"
                : "border-stone-200 bg-white hover:border-stone-300"
            }`}
          >
            <p className="text-xs text-amber-700 font-medium">Pending</p>
            <p className="text-xl font-bold text-amber-900">{activeMetrics.pending}</p>
          </div>

          <div
            onClick={() => setStatusFilter("CONFIRMED")}
            className={`cursor-pointer rounded-xl border p-3 transition ${
              statusFilter === "CONFIRMED"
                ? "border-[#C65D35] bg-[#FCF4EF]"
                : "border-stone-200 bg-white hover:border-stone-300"
            }`}
          >
            <p className="text-xs text-[#A94B2B] font-medium">Confirmed</p>
            <p className="text-xl font-bold text-[#A94B2B]">{activeMetrics.confirmed}</p>
          </div>

          <div
            onClick={() => setStatusFilter("PREPARING")}
            className={`cursor-pointer rounded-xl border p-3 transition ${
              statusFilter === "PREPARING"
                ? "border-yellow-600 bg-yellow-50"
                : "border-stone-200 bg-white hover:border-stone-300"
            }`}
          >
            <p className="text-xs text-yellow-800 font-medium">In Kitchen</p>
            <p className="text-xl font-bold text-yellow-900">{activeMetrics.preparing}</p>
          </div>

          <div
            onClick={() => setStatusFilter("READY")}
            className={`cursor-pointer rounded-xl border p-3 transition ${
              statusFilter === "READY"
                ? "border-emerald-500 bg-emerald-50"
                : "border-stone-200 bg-white hover:border-stone-300"
            }`}
          >
            <p className="text-xs text-emerald-800 font-medium">Food Ready</p>
            <p className="text-xl font-bold text-emerald-900">{activeMetrics.ready}</p>
          </div>

          <div
            onClick={() => setStatusFilter("SERVED")}
            className={`cursor-pointer rounded-xl border p-3 transition ${
              statusFilter === "SERVED"
                ? "border-sky-500 bg-sky-50"
                : "border-stone-200 bg-white hover:border-stone-300"
            }`}
          >
            <p className="text-xs text-sky-800 font-medium">Served / Dining</p>
            <p className="text-xl font-bold text-sky-900">{activeMetrics.served}</p>
          </div>
        </div>
      )}

      {/* ORDERS TABLE CONTAINER */}
      <div className="overflow-hidden rounded-xl border border-[#E9E3DA] bg-white shadow-xs">
        <div className="flex flex-col gap-4 border-b border-[#EEE9E2] p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-bold text-[#29231F]">
              {activeTab === "active" ? "Ongoing Active Orders" : "Historical Order Records"}
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {filteredOrders.length} {filteredOrders.length === 1 ? "order" : "orders"} found
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search order #, customer, table..."
                className="w-full rounded-lg border border-[#E9E3DA] py-2 pl-9 pr-3 text-sm outline-none focus:border-[#C65D35] sm:w-60"
              />
            </div>

            {/* Filter by status */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-[#E9E3DA] px-3 py-2 text-sm outline-none focus:border-[#C65D35]"
            >
              {activeTab === "active" ? (
                <>
                  <option value="ALL">All Active Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="PREPARING">Preparing</option>
                  <option value="READY">Ready</option>
                  <option value="SERVED">Served</option>
                </>
              ) : (
                <>
                  <option value="ALL">All History Statuses</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </>
              )}
            </select>

            <button
              onClick={loadOrders}
              disabled={loading}
              title="Refresh orders"
              className="flex items-center justify-center rounded-lg border border-[#E9E3DA] p-2 text-gray-600 hover:bg-[#F7F5F0]"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead className="bg-[#FAF9F6] text-xs uppercase tracking-wider text-stone-500 font-semibold">
              <tr>
                <th className="px-4 py-3">Order #</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Table</th>
                <th className="px-4 py-3">Ordered Items</th>
                <th className="px-4 py-3">Subtotal</th>
                <th className="px-4 py-3">Status</th>
                {activeTab === "history" && <th className="px-4 py-3">Invoice Ref</th>}
                {activeTab === "history" && <th className="px-4 py-3">Payment</th>}
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F0ECE6]">
              {loading ? (
                <tr>
                  <td
                    colSpan={activeTab === "history" ? 9 : 7}
                    className="px-4 py-12 text-center text-sm text-stone-500"
                  >
                    Loading orders...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={activeTab === "history" ? 9 : 7}
                    className="px-4 py-12 text-center text-sm text-stone-500"
                  >
                    {activeTab === "active"
                      ? "No active orders found. New dining orders will appear here."
                      : "No historical orders found for the selected date filter."}
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const itemsSummary = order.items
                    .map((item) => `${item.quantity}x ${item.item_name}`)
                    .join(", ");

                  const orderDate = order.created_at
                    ? new Date(order.created_at).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "—";

                  return (
                    <tr
                      key={order.id}
                      className="transition hover:bg-[#FAF9F6] text-sm"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-stone-900">
                          {order.order_number}
                        </p>
                        <p className="text-[11px] text-stone-400 mt-0.5">
                          {orderDate}
                        </p>
                      </td>

                      <td className="px-4 py-3 text-stone-700">
                        {order.customer_name}
                      </td>

                      <td className="px-4 py-3">
                        <span className="font-medium text-stone-800">
                          Table {order.table_number}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-stone-600 max-w-xs truncate" title={itemsSummary}>
                        <span className="font-medium text-stone-800">{order.items.length} items:</span>{" "}
                        {itemsSummary}
                      </td>

                      <td className="px-4 py-3 font-semibold text-stone-900">
                        {formatCurrency(order.subtotal)}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${getStatusStyle(
                            order.status
                          )}`}
                        >
                          {order.status}
                        </span>
                      </td>

                      {activeTab === "history" && (
                        <td className="px-4 py-3 font-mono text-xs text-stone-700">
                          {order.invoice_number ? (
                            <span className="rounded-md bg-stone-100 px-2 py-1 font-semibold text-[#C65D35]">
                              {order.invoice_number}
                            </span>
                          ) : (
                            <span className="text-stone-400">—</span>
                          )}
                        </td>
                      )}

                      {activeTab === "history" && (
                        <td className="px-4 py-3">
                          {getPaymentBadge(order.payment_status)}
                        </td>
                      )}

                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openOrderDetails(order)}
                          title="View order details"
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-[#29231F] hover:bg-[#F5E5DC] hover:text-[#C65D35] transition"
                        >
                          <Eye size={15} />
                          <span>Details</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =====================================
          CREATE ORDER MODAL
      ===================================== */}
      {showCreateModal && (
        <ModalShell
          title="Create New Order"
          subtitle="Select customer, table and menu items."
          onClose={closeCreateModal}
          size="max-w-3xl"
        >
          <form onSubmit={handleCreateOrder} className="space-y-5">
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {formError}
              </div>
            )}

            {/* CUSTOMER AND TABLE */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-700">
                  Customer
                </label>
                <select
                  name="customer_id"
                  value={form.customer_id}
                  onChange={handleFormChange}
                  required
                  className="w-full rounded-lg border border-[#E9E3DA] px-3 py-2 text-sm outline-none focus:border-[#C65D35]"
                >
                  <option value="">Select customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} ({c.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-700">
                  Dining Table
                </label>
                <select
                  name="table_id"
                  value={form.table_id}
                  onChange={handleFormChange}
                  required
                  className="w-full rounded-lg border border-[#E9E3DA] px-3 py-2 text-sm outline-none focus:border-[#C65D35]"
                >
                  <option value="">Select table</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      Table {t.table_number} ({t.seating_capacity} seats) — {t.status}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* SPECIAL INSTRUCTIONS */}
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-700">
                Special Instructions (Optional)
              </label>
              <input
                type="text"
                name="special_instructions"
                value={form.special_instructions}
                onChange={handleFormChange}
                placeholder="e.g. Less spicy, Jain preparation, allergies..."
                className="w-full rounded-lg border border-[#E9E3DA] px-3 py-2 text-sm outline-none focus:border-[#C65D35]"
              />
            </div>

            {/* ADD ITEM ROW */}
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-700">
                Add Menu Items
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedMenuItem}
                  onChange={(e) => setSelectedMenuItem(e.target.value)}
                  className="flex-1 min-w-[200px] rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#C65D35]"
                >
                  <option value="">Select item from menu</option>
                  {menuItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} — ₹{item.price} ({item.category_name || "General"})
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-500 font-medium">Qty:</span>
                  <input
                    type="number"
                    min="1"
                    value={itemQuantity}
                    onChange={(e) => setItemQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 rounded-lg border border-stone-300 bg-white px-2 py-2 text-center text-sm outline-none focus:border-[#C65D35]"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleAddItemToCart}
                  disabled={!selectedMenuItem}
                  className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-40 transition"
                >
                  Add to Order
                </button>
              </div>
            </div>

            {/* CART PREVIEW */}
            {cart.length > 0 && (
              <div className="rounded-xl border border-stone-200 p-4">
                <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-700">
                  Selected Items ({cart.length})
                </h4>
                <div className="divide-y divide-stone-100 max-h-48 overflow-y-auto">
                  {cart.map((item) => (
                    <div key={item.menu_item_id} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <span className="font-semibold text-stone-900">{item.name}</span>
                        <span className="ml-2 text-xs text-stone-500">
                          ₹{item.price} × {item.quantity}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-stone-900">
                          ₹{(Number(item.price) * item.quantity).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveFromCart(item.menu_item_id)}
                          className="text-rose-600 hover:text-rose-800 p-1"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-stone-200 pt-3">
                  <span className="font-bold text-stone-900 text-sm">Total Estimate:</span>
                  <span className="text-base font-bold text-[#C65D35]">
                    ₹{cartTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* BUTTONS */}
            <div className="flex justify-end gap-3 pt-3 border-t border-stone-200">
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || cart.length === 0}
                className="rounded-lg bg-[#C65D35] px-5 py-2 text-sm font-semibold text-white hover:bg-[#A94B2B] disabled:opacity-50 transition"
              >
                {saving ? "Creating Order..." : "Place Order"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* =====================================
          ORDER DETAILS MODAL
      ===================================== */}
      {showDetailsModal && selectedOrder && (
        <ModalShell
          title={`Order ${selectedOrder.order_number}`}
          subtitle={`Customer: ${selectedOrder.customer_name} • Table ${selectedOrder.table_number}`}
          onClose={closeOrderDetails}
          size="max-w-3xl"
        >
          {detailsLoading ? (
            <div className="py-12 text-center text-sm text-stone-500">Loading order details...</div>
          ) : (
            <div className="space-y-6">
              {detailsError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {detailsError}
                </div>
              )}

              {/* OVERVIEW ROW */}
              <div className="grid grid-cols-2 gap-4 rounded-xl border border-stone-200 bg-stone-50 p-4 sm:grid-cols-4 text-sm">
                <div>
                  <p className="text-xs text-stone-500 font-medium">Status</p>
                  <p className="mt-1 font-bold">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${getStatusStyle(selectedOrder.status)}`}>
                      {selectedOrder.status}
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-stone-500 font-medium">Subtotal</p>
                  <p className="mt-1 font-bold text-stone-900">
                    {formatCurrency(selectedOrder.subtotal)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-stone-500 font-medium">Invoice</p>
                  <p className="mt-1 font-semibold text-stone-800 text-xs">
                    {selectedOrder.invoice_number || "Not Generated"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-stone-500 font-medium">Payment</p>
                  <div className="mt-1">{getPaymentBadge(selectedOrder.payment_status)}</div>
                </div>
              </div>

              {/* SPECIAL INSTRUCTIONS */}
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-700">
                  Special Instructions
                </label>
                {isOrderEditable ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={instructionText}
                      onChange={(e) => setInstructionText(e.target.value)}
                      placeholder="Add instructions..."
                      className="flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-sm outline-none focus:border-[#C65D35]"
                    />
                    <button
                      type="button"
                      onClick={handleSaveInstructions}
                      disabled={saving}
                      className="rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black transition"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-stone-600 italic">
                    {selectedOrder.special_instructions || "No special instructions provided."}
                  </p>
                )}
              </div>

              {/* ORDER ITEMS LIST */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-bold text-stone-900 text-sm">Ordered Items</h3>
                  {isOrderEditable && (
                    <span className="text-xs text-stone-500">
                      Items can be modified while Pending or Confirmed
                    </span>
                  )}
                </div>

                <div className="overflow-hidden rounded-xl border border-stone-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-stone-50 text-xs font-semibold text-stone-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-2.5">Item</th>
                        <th className="px-4 py-2.5 text-center">Qty</th>
                        <th className="px-4 py-2.5 text-right">Price</th>
                        <th className="px-4 py-2.5 text-right">Total</th>
                        {isOrderEditable && <th className="px-4 py-2.5 text-center">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {selectedOrder.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-2.5 font-medium text-stone-900">{item.item_name}</td>
                          <td className="px-4 py-2.5 text-center">
                            {isOrderEditable ? (
                              <button
                                type="button"
                                onClick={() => handleUpdateItemQuantity(item)}
                                className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-800 hover:bg-stone-200"
                                title="Edit quantity"
                              >
                                {item.quantity}
                                <Pencil size={11} className="text-stone-500" />
                              </button>
                            ) : (
                              item.quantity
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right text-stone-600">
                            ₹{Number(item.unit_price).toFixed(2)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-stone-900">
                            ₹{Number(item.line_total).toFixed(2)}
                          </td>
                          {isOrderEditable && (
                            <td className="px-4 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveOrderItem(item)}
                                className="text-rose-600 hover:text-rose-800 p-1"
                                title="Remove item"
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ADD ITEM TO EXISTING ORDER */}
                {isOrderEditable && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 p-2.5">
                    <select
                      value={additionalItem}
                      onChange={(e) => setAdditionalItem(e.target.value)}
                      className="flex-1 min-w-[180px] rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs outline-none"
                    >
                      <option value="">Add another item...</option>
                      {menuItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} (₹{item.price})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      value={additionalQuantity}
                      onChange={(e) => setAdditionalQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-center text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleAddExistingItem}
                      disabled={!additionalItem || saving}
                      className="rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black transition"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>

              {/* STATUS TRANSITION PANEL */}
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-700">
                  Update Operational Status
                </h4>

                {STATUS_TRANSITIONS[selectedOrder.status]?.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={statusTarget}
                        onChange={(e) => setStatusTarget(e.target.value)}
                        className="flex-1 min-w-[200px] rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#C65D35]"
                      >
                        <option value="">Select next status transition</option>
                        {STATUS_TRANSITIONS[selectedOrder.status].map((st) => (
                          <option key={st} value={st}>
                            {st} {st === "Completed" ? "(Requires generated invoice)" : ""}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={handleStatusUpdate}
                        disabled={!statusTarget || saving}
                        className="rounded-lg bg-[#C65D35] px-4 py-2 text-sm font-semibold text-white hover:bg-[#A94B2B] disabled:opacity-40 transition"
                      >
                        {saving ? "Updating..." : "Transition Status"}
                      </button>
                    </div>

                    <input
                      type="text"
                      value={statusNote}
                      onChange={(e) => setStatusNote(e.target.value)}
                      placeholder="Optional transition note..."
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs outline-none"
                    />

                    {selectedOrder.status === "Served" && (
                      <p className="text-xs text-amber-700 font-medium">
                        ⚠️ Reminder: An invoice must be created under Invoice Management before completing this order.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-stone-500">
                    This order is at a terminal status ({selectedOrder.status}) and cannot be transitioned further.
                  </p>
                )}
              </div>

              {/* STATUS AUDIT TRAIL */}
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-700">
                  Status Audit History
                </h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {selectedOrder.status_history?.map((h) => (
                    <div key={h.id} className="flex items-center justify-between rounded-lg border border-stone-200 bg-white p-2 text-xs">
                      <div>
                        <span className="font-semibold text-stone-800">
                          {h.previous_status ? `${h.previous_status} → ${h.new_status}` : h.new_status}
                        </span>
                        {h.note && <span className="ml-2 text-stone-500 italic">"{h.note}"</span>}
                      </div>
                      <span className="text-stone-400">
                        {new Date(h.changed_at).toLocaleString("en-IN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </ModalShell>
      )}

      {/* QUANTITY MODAL */}
      {quantityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="font-bold text-stone-900 text-sm">Update Item Quantity</h3>
            <p className="text-xs text-stone-500 mt-1">{quantityModal.item.item_name}</p>
            <form onSubmit={handleSaveQuantityModal} className="mt-4 space-y-4">
              <input
                type="number"
                min="1"
                value={quantityModal.quantity}
                onChange={(e) =>
                  setQuantityModal((prev) => ({
                    ...prev,
                    quantity: Math.max(1, parseInt(e.target.value) || 1),
                  }))
                }
                className="w-full rounded-lg border border-stone-300 p-2 text-center text-base font-bold outline-none focus:border-[#C65D35]"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setQuantityModal(null)}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#C65D35] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Modal Container Shell
function ModalShell({ title, subtitle, onClose, children, size = "max-w-2xl" }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`w-full ${size} overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150`}>
        <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-stone-900">{title}</h3>
            {subtitle && <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
