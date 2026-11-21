import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShoppingCart,
  Plus,
  Search,
  Eye,
  Pencil,
  RefreshCw,
  Trash2,
  History,
  Check,
  AlertTriangle,
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
import PageHeader from "../components/PageHeader";
import Modal from "../components/Modal";
import { useNotification } from "../context/NotificationContext";
import {
  ORDER_WORKFLOW_STAGES,
  getWorkflowStageLabel,
  getDetailedStatusLabel,
  getOrderStatusBadgeStyle,
  getWorkflowStepNumber,
  STATUS_ACTION_LABELS,
} from "../utils/orderWorkflow";

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

const getPaymentBadge = (paymentStatus) => {
  const norm = String(paymentStatus || "").trim().toUpperCase();
  if (norm === "PAID") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
        Paid
      </span>
    );
  }
  if (norm === "PENDING") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
        Payment Pending
      </span>
    );
  }
  return <span className="text-xs text-stone-400">Uninvoiced</span>;
};

// ==========================================
// WORKFLOW PROGRESSION STEPPER COMPONENT
// ==========================================

function OrderWorkflowStepper({ status }) {
  const currentStep = getWorkflowStepNumber(status);
  const isCancelled = status === "Cancelled";

  if (isCancelled) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50/70 p-3 text-xs text-red-800">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-600 shrink-0" />
          <span className="font-bold">Order Cancelled</span>
          <span className="text-red-600 text-[11px]">— This order was halted before completion.</span>
        </div>
        <span className="rounded-md bg-red-100 px-2 py-0.5 font-bold uppercase text-[10px]">
          Terminated
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
          Workflow Progression
        </span>
        <span className="text-xs font-semibold text-stone-700">
          Stage {currentStep} of 4: <span className="font-bold text-[#1C1917]">{getWorkflowStageLabel(status)}</span>
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 pt-2">
        {ORDER_WORKFLOW_STAGES.map((st) => {
          const isDone = currentStep > st.step;
          const isCurrent = currentStep === st.step;

          return (
            <div key={st.key} className="flex flex-col items-center text-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                  isDone
                    ? "bg-emerald-600 text-white shadow-xs"
                    : isCurrent
                    ? "bg-[#F5B716] text-[#1C1917] ring-4 ring-[#FEF9C3] shadow-xs font-extrabold"
                    : "bg-stone-200 text-stone-500"
                }`}
              >
                {isDone ? <Check size={14} className="stroke-[3]" /> : st.step}
              </div>

              <p
                className={`mt-1.5 text-xs font-semibold ${
                  isCurrent
                    ? "text-[#1C1917] font-bold"
                    : isDone
                    ? "text-emerald-800"
                    : "text-stone-400"
                }`}
              >
                {st.label}
              </p>
              <p className="hidden text-[10px] text-stone-500 md:block mt-0.5 truncate max-w-full">
                {st.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function Orders() {
  const { showSuccess, showError, showWarning, confirm } = useNotification();

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

  // Search and workflow status filter
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // ==========================================
  // LOAD ORDERS DATA
  // ==========================================

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
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
        getOrderCustomers(),
        getOrderTables(),
        getOrderMenuItems(),
      ]);

      setOrders(orderData);
      setCustomers(customerData);
      setTables(tableData);
      setMenuItems(menuData);
    } catch (error) {
      showError(getErrorMessage(error), "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [activeTab, historyDateFilter, showError]);

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

      const workflowStage = getWorkflowStageLabel(order.status).toUpperCase();
      const rawStatus = String(order.status || "").toUpperCase();

      let matchStatus;
      if (statusFilter === "ALL") {
        matchStatus = true;
      } else if (statusFilter === "STAGE_ORDERED") {
        matchStatus = ["PENDING", "CONFIRMED"].includes(rawStatus);
      } else if (statusFilter === "STAGE_IN_PROGRESS") {
        matchStatus = ["PREPARING", "READY"].includes(rawStatus);
      } else if (statusFilter === "STAGE_SERVED") {
        matchStatus = rawStatus === "SERVED";
      } else if (statusFilter === "STAGE_COMPLETED") {
        matchStatus = rawStatus === "COMPLETED";
      } else if (statusFilter === "STAGE_CANCELLED") {
        matchStatus = rawStatus === "CANCELLED";
      } else {
        matchStatus = rawStatus === statusFilter.toUpperCase() || workflowStage === statusFilter.toUpperCase();
      }

      return matchSearch && matchStatus;
    });
  }, [orders, search, statusFilter]);

  // 4-Stage workflow metrics for Active tab
  const workflowMetrics = useMemo(() => {
    if (activeTab !== "active") return null;

    const ordered = orders.filter((o) => ["Pending", "Confirmed"].includes(o.status)).length;
    const inProgress = orders.filter((o) => ["Preparing", "Ready"].includes(o.status)).length;
    const served = orders.filter((o) => o.status === "Served").length;

    return {
      total: orders.length,
      ordered,
      inProgress,
      served,
    };
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
    setSelectedMenuItem("");
    setItemQuantity(1);
    setFormError("");
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddItemToCart = () => {
    if (!selectedMenuItem) return;

    const menuItem = menuItems.find((m) => String(m.id) === String(selectedMenuItem));
    if (!menuItem) return;

    const qty = parseInt(itemQuantity, 10);
    if (!qty || qty < 1) return;

    setCart((prevCart) => {
      const existingIndex = prevCart.findIndex(
        (item) => String(item.menu_item_id) === String(selectedMenuItem)
      );

      if (existingIndex > -1) {
        const next = [...prevCart];
        next[existingIndex].quantity += qty;
        return next;
      }

      return [
        ...prevCart,
        {
          menu_item_id: menuItem.id,
          name: menuItem.name,
          price: menuItem.price,
          quantity: qty,
        },
      ];
    });

    setSelectedMenuItem("");
    setItemQuantity(1);
  };

  const handleRemoveFromCart = (menuItemId) => {
    setCart((prev) => prev.filter((item) => item.menu_item_id !== menuItemId));
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  }, [cart]);

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!form.customer_id) {
      setFormError("Please select a customer.");
      return;
    }

    if (!form.table_id) {
      setFormError("Please select a dining table.");
      return;
    }

    if (cart.length === 0) {
      setFormError("Please add at least one menu item to the order.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        customer_id: parseInt(form.customer_id, 10),
        table_id: parseInt(form.table_id, 10),
        special_instructions: form.special_instructions.trim() || null,
        items: cart.map((item) => ({
          menu_item_id: item.menu_item_id,
          quantity: item.quantity,
        })),
      };

      const newOrder = await createOrder(payload);
      showSuccess(
        `Order ${newOrder.order_number} created successfully.`,
        "Order Created"
      );
      closeCreateModal();
      await loadOrders();
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // ORDER DETAILS HANDLERS
  // ==========================================

  const openOrderDetails = async (order) => {
    setSelectedOrder(order);
    setShowDetailsModal(true);
    setDetailsLoading(true);
    setDetailsError("");
    setStatusTarget("");
    setStatusNote("");
    setInstructionText(order.special_instructions || "");

    try {
      const fullOrder = await getOrderById(order.id);
      setSelectedOrder(fullOrder);
      setInstructionText(fullOrder.special_instructions || "");
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
    setStatusTarget("");
    setStatusNote("");
    setQuantityModal(null);
  };

  const refreshSelectedOrder = async () => {
    if (!selectedOrder) return;
    try {
      const refreshed = await getOrderById(selectedOrder.id);
      setSelectedOrder(refreshed);
      setInstructionText(refreshed.special_instructions || "");
    } catch (error) {
      setDetailsError(getErrorMessage(error));
    }
  };

  const handleSaveInstructions = async () => {
    if (!selectedOrder) return;
    setSaving(true);
    try {
      await updateOrder(selectedOrder.id, {
        special_instructions: instructionText.trim() || null,
      });
      await refreshSelectedOrder();
      showSuccess("Special instructions updated.", "Order Updated");
      await loadOrders();
    } catch (error) {
      setDetailsError(getErrorMessage(error));
      showError(getErrorMessage(error), "Update Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!selectedOrder || !statusTarget) return;

    if (statusTarget === "Completed" && selectedOrder.status === "Served") {
      if (!selectedOrder.invoice_id) {
        showWarning(
          "An invoice must be generated before this order can be completed. Please navigate to Invoices.",
          "Invoice Required"
        );
        return;
      }
      if (selectedOrder.payment_status !== "Paid") {
        showWarning(
          "Invoice must be paid before completing the order. Please record payment in Invoices / Payments.",
          "Payment Pending"
        );
        return;
      }
    }
    setDetailsError("");

    try {
      await updateOrderStatus(selectedOrder.id, {
        status: statusTarget,
        note: statusNote.trim() || null,
      });

      const nextStage = getWorkflowStageLabel(statusTarget);

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
          `Order ${selectedOrder.order_number} advanced to ${nextStage} (${statusTarget}).`,
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
    try {
      await addOrderItem(selectedOrder.id, {
        menu_item_id: parseInt(additionalItem, 10),
        quantity: parseInt(additionalQuantity, 10) || 1,
      });
      await refreshSelectedOrder();
      showSuccess("Item added to order successfully.", "Item Added");
      setAdditionalItem("");
      setAdditionalQuantity(1);
      await loadOrders();
    } catch (error) {
      setDetailsError(getErrorMessage(error));
      showError(getErrorMessage(error), "Failed to Add Item");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenQuantityModal = (item) => {
    setQuantityModal({
      item,
      quantity: item.quantity,
    });
  };

  const handleSaveQuantity = async () => {
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
    <div className="space-y-6">
      {/* A1 Standard PageHeader */}
      <PageHeader
        title="Orders"
        actions={
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#F5B716] px-4 py-2.5 text-sm font-bold text-[#1C1917] shadow-xs transition hover:bg-[#E5A910] cursor-pointer"
          >
            <Plus size={17} />
            <span>Create New Order</span>
          </button>
        }
      />

      {/* VIEW TABS: ACTIVE ORDERS vs ORDER HISTORY */}
      <div className="flex flex-col gap-4 border-b border-stone-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleTabSwitch("active")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition cursor-pointer ${
              activeTab === "active"
                ? "bg-[#F5B716] text-[#1C1917] shadow-xs"
                : "bg-white text-stone-600 hover:bg-stone-100 border border-stone-200"
            }`}
          >
            <ShoppingCart size={17} />
            <span>Active Orders</span>
            {workflowMetrics && (
              <span
                className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                  activeTab === "active" ? "bg-[#1C1917] text-[#F5B716]" : "bg-stone-100 text-stone-700"
                }`}
              >
                {workflowMetrics.total}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabSwitch("history")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition cursor-pointer ${
              activeTab === "history"
                ? "bg-[#F5B716] text-[#1C1917] shadow-xs"
                : "bg-white text-stone-600 hover:bg-stone-100 border border-stone-200"
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

      {/* ACTIVE WORKFLOW METRICS ROW */}
      {activeTab === "active" && workflowMetrics && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div
            onClick={() => setStatusFilter("ALL")}
            className={`cursor-pointer rounded-xl border p-3.5 transition-all shadow-xs ${
              statusFilter === "ALL"
                ? "border-[#F5B716] bg-[#FEF9C3]/40 ring-1 ring-[#F5B716]"
                : "border-stone-200 bg-white hover:border-stone-300"
            }`}
          >
            <p className="text-xs text-stone-500 font-semibold uppercase tracking-wider">All Active</p>
            <p className="mt-1 text-2xl font-bold text-[#1C1917]">{workflowMetrics.total}</p>
            <p className="mt-1 text-[11px] text-stone-400">Total dining orders</p>
          </div>

          <div
            onClick={() => setStatusFilter("STAGE_ORDERED")}
            className={`cursor-pointer rounded-xl border p-3.5 transition-all shadow-xs ${
              statusFilter === "STAGE_ORDERED"
                ? "border-yellow-400 bg-yellow-50 ring-1 ring-yellow-400"
                : "border-stone-200 bg-white hover:border-stone-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-yellow-800 font-semibold uppercase tracking-wider">1. Ordered</p>
              <span className="h-2 w-2 rounded-full bg-yellow-500" />
            </div>
            <p className="mt-1 text-2xl font-bold text-yellow-950">{workflowMetrics.ordered}</p>
            <p className="mt-1 text-[11px] text-stone-500">Pending & Confirmed</p>
          </div>

          <div
            onClick={() => setStatusFilter("STAGE_IN_PROGRESS")}
            className={`cursor-pointer rounded-xl border p-3.5 transition-all shadow-xs ${
              statusFilter === "STAGE_IN_PROGRESS"
                ? "border-amber-400 bg-amber-50 ring-1 ring-amber-400"
                : "border-stone-200 bg-white hover:border-stone-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-amber-800 font-semibold uppercase tracking-wider">2. In Progress</p>
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            </div>
            <p className="mt-1 text-2xl font-bold text-amber-950">{workflowMetrics.inProgress}</p>
            <p className="mt-1 text-[11px] text-stone-500">In Kitchen & Ready</p>
          </div>

          <div
            onClick={() => setStatusFilter("STAGE_SERVED")}
            className={`cursor-pointer rounded-xl border p-3.5 transition-all shadow-xs ${
              statusFilter === "STAGE_SERVED"
                ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-400"
                : "border-stone-200 bg-white hover:border-stone-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-emerald-800 font-semibold uppercase tracking-wider">3. Served</p>
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
            </div>
            <p className="mt-1 text-2xl font-bold text-emerald-950">{workflowMetrics.served}</p>
            <p className="mt-1 text-[11px] text-stone-500">Delivered / Dining</p>
          </div>
        </div>
      )}

      {/* ORDERS TABLE CONTAINER */}
      <div className="overflow-hidden rounded-xl border border-stone-200/90 bg-white shadow-xs">
        {/* TABLE FILTER BAR */}
        <div className="flex flex-col gap-4 border-b border-stone-200/80 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-bold text-[#1C1917]">
              {activeTab === "active" ? "Live Active Dining Orders" : "Order History Archive"}
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {filteredOrders.length} {filteredOrders.length === 1 ? "order" : "orders"} found
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search order #, customer, table..."
                className="w-full rounded-lg border border-stone-300 bg-white py-2 pl-9 pr-3 text-sm text-stone-900 outline-none transition focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30 sm:w-64"
              />
            </div>

            {/* Filter by workflow stage */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none transition focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30"
            >
              {activeTab === "active" ? (
                <>
                  <option value="ALL">All Active Stages</option>
                  <option value="STAGE_ORDERED">Stage 1: Ordered (Pending/Confirmed)</option>
                  <option value="STAGE_IN_PROGRESS">Stage 2: In Progress (Kitchen/Ready)</option>
                  <option value="STAGE_SERVED">Stage 3: Served (Delivered)</option>
                </>
              ) : (
                <>
                  <option value="ALL">All Historical Records</option>
                  <option value="STAGE_COMPLETED">Stage 4: Completed</option>
                  <option value="STAGE_CANCELLED">Cancelled</option>
                </>
              )}
            </select>

            <button
              type="button"
              onClick={loadOrders}
              disabled={loading}
              title="Refresh orders"
              className="flex items-center justify-center rounded-lg border border-stone-200 bg-white p-2 text-stone-600 hover:bg-stone-100 transition cursor-pointer"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* DATA TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-4 py-3">Order Number</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Table</th>
                <th className="px-4 py-3">Summary</th>
                <th className="px-4 py-3">Subtotal</th>
                <th className="px-4 py-3">Workflow Status</th>
                {activeTab === "history" && <th className="px-4 py-3">Invoice</th>}
                {activeTab === "history" && <th className="px-4 py-3">Payment</th>}
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-stone-100 text-sm">
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

                  const badgeInfo = getOrderStatusBadgeStyle(order.status);
                  const workflowLabel = getWorkflowStageLabel(order.status);
                  const detailedLabel = getDetailedStatusLabel(order.status);

                  return (
                    <tr
                      key={order.id}
                      className="transition hover:bg-stone-50/70 dark:hover:bg-stone-850/60"
                    >
                      <td className="px-4 py-3 font-semibold text-stone-900 dark:text-stone-100">
                        {order.order_number}
                      </td>

                      <td className="px-4 py-3 text-stone-800 dark:text-stone-200">
                        <p className="font-medium">{order.customer_name || "—"}</p>
                        <p className="text-xs text-stone-500 dark:text-stone-400">{order.customer_phone || ""}</p>
                      </td>

                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-md bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-xs font-semibold text-stone-700 dark:text-stone-300">
                          {order.table_number ? `Table ${order.table_number}` : "Takeaway"}
                        </span>
                      </td>

                      <td className="px-4 py-3 max-w-[220px]">
                        <p className="truncate text-xs text-stone-600 dark:text-stone-300" title={itemsSummary}>
                          {itemsSummary || "No items"}
                        </p>
                        {order.special_instructions && (
                          <p
                            className="mt-0.5 truncate text-[11px] font-medium text-amber-800 dark:text-amber-300"
                            title={order.special_instructions}
                          >
                            Note: {order.special_instructions}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3 font-semibold text-stone-900 dark:text-stone-100">
                        {formatCurrency(order.subtotal)}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs ${badgeInfo.badge}`}
                          title={`Backend state: ${order.status}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${badgeInfo.dot}`} />
                          <span className="font-semibold">{workflowLabel}</span>
                          {detailedLabel !== workflowLabel && (
                            <span className="text-[10px] opacity-75 font-normal">
                              ({order.status})
                            </span>
                          )}
                        </span>
                      </td>

                      {activeTab === "history" && (
                        <td className="px-4 py-3 font-mono text-xs text-stone-700 dark:text-stone-300">
                          {order.invoice_number ? (
                            <span className="rounded-md bg-stone-100 dark:bg-stone-800 px-2 py-1 font-semibold text-stone-800 dark:text-stone-200">
                              {order.invoice_number}
                            </span>
                          ) : (
                            <span className="text-stone-400 dark:text-stone-500">—</span>
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
                          type="button"
                          onClick={() => openOrderDetails(order)}
                          title="View order details"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-100 hover:text-stone-900 transition cursor-pointer shadow-2xs"
                        >
                          <Eye size={14} />
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
          title="Create New Dining Order"
          subtitle="Select customer, table and add dishes to the order."
          onClose={closeCreateModal}
          size="max-w-3xl"
        >
          <form onSubmit={handleCreateOrder} className="space-y-5">
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
                {formError}
              </div>
            )}

            {/* CUSTOMER AND TABLE */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-700">
                  Customer <span className="text-red-500">*</span>
                </label>
                <select
                  name="customer_id"
                  value={form.customer_id}
                  onChange={handleFormChange}
                  required
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30"
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
                  Dining Table <span className="text-red-500">*</span>
                </label>
                <select
                  name="table_id"
                  value={form.table_id}
                  onChange={handleFormChange}
                  required
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30"
                >
                  <option value="">Select dining table</option>
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
                Kitchen Instructions (Optional)
              </label>
              <input
                type="text"
                name="special_instructions"
                value={form.special_instructions}
                onChange={handleFormChange}
                placeholder="e.g., Less spicy, Jain preparation, allergic to peanuts..."
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30"
              />
            </div>

            {/* ADD ITEM ROW */}
            <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-700">
                Add Menu Items
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedMenuItem}
                  onChange={(e) => setSelectedMenuItem(e.target.value)}
                  className="flex-1 min-w-[200px] rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-[#F5B716]"
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
                    onChange={(e) => setItemQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-16 rounded-lg border border-stone-300 bg-white px-2 py-2 text-center text-sm outline-none focus:border-[#F5B716]"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleAddItemToCart}
                  disabled={!selectedMenuItem}
                  className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-40 transition cursor-pointer"
                >
                  Add to Order
                </button>
              </div>
            </div>

            {/* CART PREVIEW */}
            {cart.length > 0 && (
              <div className="rounded-xl border border-stone-200 p-4">
                <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-700">
                  Selected Dishes ({cart.length})
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
                          className="text-red-600 hover:text-red-800 p-1 cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-stone-200 pt-3">
                  <span className="font-bold text-stone-900 text-sm">Total Estimate:</span>
                  <span className="text-base font-bold text-amber-800">
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
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || cart.length === 0}
                className="rounded-lg bg-[#F5B716] px-5 py-2 text-sm font-bold text-[#1C1917] hover:bg-[#E5A910] disabled:opacity-50 transition cursor-pointer shadow-xs"
              >
                {saving ? "Creating Order..." : "Place Order (Ordered Stage)"}
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
          subtitle={`Customer: ${selectedOrder.customer_name || "Guest"} • Table ${selectedOrder.table_number || "Takeaway"}`}
          onClose={closeOrderDetails}
          size="max-w-3xl"
        >
          {detailsLoading ? (
            <div className="py-12 text-center text-sm text-stone-500">Loading order details...</div>
          ) : (
            <div className="space-y-6">
              {detailsError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
                  {detailsError}
                </div>
              )}

              {/* WORKFLOW STEPPER */}
              <OrderWorkflowStepper status={selectedOrder.status} />

              {/* OVERVIEW CARDS */}
              <div className="grid grid-cols-2 gap-3.5 rounded-xl border border-stone-200 bg-stone-50/70 p-4 sm:grid-cols-4 text-sm">
                <div>
                  <p className="text-xs text-stone-500 font-semibold uppercase tracking-wider">Workflow Stage</p>
                  <div className="mt-1">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs ${getOrderStatusBadgeStyle(selectedOrder.status).badge}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${getOrderStatusBadgeStyle(selectedOrder.status).dot}`} />
                      <span>{getWorkflowStageLabel(selectedOrder.status)}</span>
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-stone-500 font-semibold uppercase tracking-wider">Subtotal</p>
                  <p className="mt-1 font-bold text-stone-900 text-base">
                    {formatCurrency(selectedOrder.subtotal)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-stone-500 font-semibold uppercase tracking-wider">Invoice</p>
                  <p className="mt-1 font-semibold text-stone-800 text-xs font-mono">
                    {selectedOrder.invoice_number || "Not Invoiced"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-stone-500 font-semibold uppercase tracking-wider">Payment</p>
                  <div className="mt-1">{getPaymentBadge(selectedOrder.payment_status)}</div>
                </div>
              </div>

              {/* SPECIAL INSTRUCTIONS */}
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-700">
                  Special Kitchen Instructions
                </label>
                {isOrderEditable ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={instructionText}
                      onChange={(e) => setInstructionText(e.target.value)}
                      placeholder="Add instructions..."
                      className="flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-sm outline-none focus:border-[#F5B716]"
                    />
                    <button
                      type="button"
                      onClick={handleSaveInstructions}
                      disabled={saving}
                      className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-800 transition cursor-pointer"
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
                      Dishes can be added or adjusted while in Ordered stage
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto rounded-lg border border-stone-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 text-stone-600 font-semibold">
                      <tr>
                        <th className="px-3 py-2">Dish</th>
                        <th className="px-3 py-2">Unit Price</th>
                        <th className="px-3 py-2">Quantity</th>
                        <th className="px-3 py-2">Item Total</th>
                        {isOrderEditable && <th className="px-3 py-2 text-center">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {selectedOrder.items?.map((item) => (
                        <tr key={item.id} className="hover:bg-stone-50/50">
                          <td className="px-3 py-2 font-medium text-stone-900">
                            {item.item_name}
                          </td>
                          <td className="px-3 py-2 text-stone-600">
                            ₹{item.price_at_order}
                          </td>
                          <td className="px-3 py-2 font-semibold text-stone-900">
                            {item.quantity}
                          </td>
                          <td className="px-3 py-2 font-semibold text-stone-900">
                            ₹{(Number(item.price_at_order) * item.quantity).toFixed(2)}
                          </td>
                          {isOrderEditable && (
                            <td className="px-3 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleOpenQuantityModal(item)}
                                title="Edit quantity"
                                className="mr-2 text-stone-600 hover:text-stone-900 p-1 cursor-pointer"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveOrderItem(item)}
                                title="Remove item"
                                className="text-red-600 hover:text-red-800 p-1 cursor-pointer"
                              >
                                <Trash2 size={14} />
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
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-stone-50/70 p-2.5">
                    <select
                      value={additionalItem}
                      onChange={(e) => setAdditionalItem(e.target.value)}
                      className="flex-1 min-w-[180px] rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#F5B716]"
                    >
                      <option value="">Add another dish...</option>
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
                      onChange={(e) => setAdditionalQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-16 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-center text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleAddExistingItem}
                      disabled={!additionalItem || saving}
                      className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-800 transition cursor-pointer"
                    >
                      Add Dish
                    </button>
                  </div>
                )}
              </div>

              {/* STATUS TRANSITION PANEL */}
              <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-4">
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-700">
                  Advance Workflow Stage
                </h4>

                {STATUS_TRANSITIONS[selectedOrder.status]?.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={statusTarget}
                        onChange={(e) => setStatusTarget(e.target.value)}
                        className="flex-1 min-w-[220px] rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-[#F5B716]"
                      >
                        <option value="">Select next workflow transition...</option>
                        {STATUS_ACTION_LABELS[selectedOrder.status]?.map((action) => (
                          <option key={action.target} value={action.target}>
                            {action.label}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={handleStatusUpdate}
                        disabled={!statusTarget || saving}
                        className="rounded-lg bg-[#F5B716] px-4 py-2 text-sm font-bold text-[#1C1917] hover:bg-[#E5A910] disabled:opacity-40 transition cursor-pointer shadow-xs"
                      >
                        {saving ? "Updating..." : "Advance Stage"}
                      </button>
                    </div>

                    <input
                      type="text"
                      value={statusNote}
                      onChange={(e) => setStatusNote(e.target.value)}
                      placeholder="Optional stage transition note..."
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-[#F5B716]"
                    />

                    {selectedOrder.status === "Served" && (
                      <p className="text-xs text-amber-800 font-semibold bg-amber-50 p-2 rounded-md border border-amber-200">
                        ⚠️ Requirement: An invoice must be generated in Invoice Management before completing this order.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-stone-500">
                    This order is at terminal status ({selectedOrder.status}) and cannot be transitioned further.
                  </p>
                )}
              </div>

              {/* STATUS AUDIT TRAIL */}
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-700">
                  Workflow History Trail
                </h4>
                <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50/50 p-3 max-h-48 overflow-y-auto">
                  {selectedOrder.status_history && selectedOrder.status_history.length > 0 ? (
                    selectedOrder.status_history.map((hist, idx) => (
                      <div
                        key={hist.id || idx}
                        className="flex items-start justify-between border-b border-stone-100 pb-2 text-xs last:border-b-0 last:pb-0"
                      >
                        <div>
                          <span className="font-semibold text-stone-800">
                            {hist.previous_status ? `${getWorkflowStageLabel(hist.previous_status)} → ` : ""}
                            {getWorkflowStageLabel(hist.new_status)}
                          </span>
                          <span className="text-[11px] text-stone-500 ml-1">
                            ({hist.new_status})
                          </span>
                          {hist.notes && (
                            <p className="text-stone-600 mt-0.5 italic">{hist.notes}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-stone-400">
                          {new Date(hist.changed_at).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-stone-500">No previous transitions recorded.</p>
                  )}
                </div>
              </div>

              {/* CLOSE BUTTON */}
              <div className="flex justify-end pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={closeOrderDetails}
                  className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </ModalShell>
      )}

      {/* EDIT QUANTITY MODAL */}
      {quantityModal && (
        <ModalShell
          title="Update Dish Quantity"
          subtitle={`Adjust quantity for "${quantityModal.item?.item_name}".`}
          onClose={() => setQuantityModal(null)}
          size="max-w-sm"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                value={quantityModal.quantity}
                onChange={(e) =>
                  setQuantityModal((prev) => ({
                    ...prev,
                    quantity: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-[#F5B716]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuantityModal(null)}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveQuantity}
                disabled={saving}
                className="rounded-lg bg-[#F5B716] px-4 py-1.5 text-xs font-bold text-[#1C1917] hover:bg-[#E5A910]"
              >
                {saving ? "Saving..." : "Save Quantity"}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

// ==========================================
// MODAL SHELL HELPER
// ==========================================

function ModalShell({ title, subtitle, onClose, size = "max-w-2xl", children }) {
  const modalSize = size.includes("4xl") || size.includes("3xl") ? "lg" : size.includes("lg") || size.includes("2xl") ? "md" : "sm";
  return (
    <Modal
      isOpen={true}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      size={modalSize}
    >
      {children}
    </Modal>
  );
}
