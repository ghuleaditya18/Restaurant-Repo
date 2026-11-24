import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  Archive,
  RotateCcw,
  CreditCard,
  Receipt,
  ArrowRight,
  X,
  CheckCircle2,
  Clock,
  Ban,
  FileText,
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
  recordOrderPayment,
  bulkArchiveOrders,
  restoreOrder,
  deleteArchivedOrder,
  checkArchiveDeletionEligibility,
  bulkDeleteArchivedOrders,
  bulkRestoreOrders,
} from "../services/orderService";
import DateFilter from "../components/DateFilter";
import PageHeader from "../components/PageHeader";
import Modal from "../components/Modal";
import Pagination from "../components/Pagination";
import { useNotification } from "../context/NotificationContext";
import {
  ORDER_WORKFLOW_STAGES,
  getWorkflowStageLabel,
  getOrderStatusBadgeStyle,
  getWorkflowStepNumber,
  getContextualOrderAction,
} from "../utils/orderWorkflow";

// ==========================================
// CONSTANTS
// ==========================================

const EMPTY_FORM = {
  customer_id: "",
  table_id: "",
  special_instructions: "",
};

const PAYMENT_METHODS = ["Cash", "UPI", "Card", "Net Banking"];

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
  const num = Number(amount);
  if (Number.isNaN(num) || amount === null || amount === undefined) {
    return "₹0.00";
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(num);
};

const formatOrderTime = (dateStr) => {
  if (!dateStr) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
};

const formatOrderDateTime = (dateStr) => {
  if (!dateStr) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
};

const getPaymentBadge = (paymentStatus, outstandingBalance) => {
  const norm = String(paymentStatus || "").trim().toUpperCase();
  const outstanding = Number(outstandingBalance ?? 0);

  if (norm === "PAID" || (norm !== "PENDING" && outstanding <= 0 && paymentStatus)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/80">
        <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400" />
        <span>Paid</span>
      </span>
    );
  }

  if (norm === "PARTIALLY_PAID" || norm === "PARTIALLY PAID" || norm === "PARTIAL") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/60 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/80">
        <Clock size={12} className="text-amber-600 dark:text-amber-400" />
        <span>Partially Paid</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 dark:bg-stone-800 px-2.5 py-0.5 text-xs font-medium text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700">
      <Clock size={12} className="text-stone-400" />
      <span>Payment Pending</span>
    </span>
  );
};

// ==========================================
// WORKFLOW PROGRESSION STEPPER COMPONENT
// ==========================================

function OrderWorkflowStepper({ status }) {
  const currentStep = getWorkflowStepNumber(status);
  const isCancelled = status === "Cancelled";

  if (isCancelled) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/30 p-3.5 text-xs text-red-800 dark:text-red-200">
        <div className="flex items-center gap-2.5">
          <AlertTriangle size={18} className="text-red-600 dark:text-red-400 shrink-0" />
          <div>
            <span className="font-bold">Order Cancelled</span>
            <p className="text-red-600 dark:text-red-300 text-[11px] mt-0.5">
              This order was terminated prematurely before completion. Reserved inventory has been restored.
            </p>
          </div>
        </div>
        <span className="rounded-md bg-red-100 dark:bg-red-900/60 px-2.5 py-1 font-bold uppercase text-[10px] text-red-700 dark:text-red-300">
          Cancelled
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-[#101722] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Order Lifecycle
        </span>
        <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
          Stage {currentStep > 0 ? currentStep : 1} of 5:{" "}
          <strong className="text-stone-900 dark:text-white font-bold">
            {getWorkflowStageLabel(status)}
          </strong>
        </span>
      </div>

      <div className="grid grid-cols-5 gap-1.5 sm:gap-2 pt-1">
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
                    ? "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-extrabold ring-4 ring-[#F59E0B]/25 shadow-xs"
                    : "bg-stone-200 dark:bg-stone-800 text-stone-500 dark:text-stone-400"
                }`}
              >
                {isDone ? <Check size={14} className="stroke-[3]" /> : st.step}
              </div>

              <p
                className={`mt-1.5 text-xs font-semibold ${
                  isCurrent
                    ? "text-stone-900 dark:text-white font-bold"
                    : isDone
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-stone-400 dark:text-stone-500"
                }`}
              >
                {st.label}
              </p>
              <p className="hidden text-[10px] text-stone-500 dark:text-stone-400 md:block mt-0.5 truncate max-w-full">
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
// MAIN ORDERS PAGE COMPONENT
// ==========================================

export default function Orders() {
  const navigate = useNavigate();
  const { showSuccess, showDelete, showError, showWarning, confirm } = useNotification();

  // Active view tab: 'active' | 'today' | 'history' | 'archived'
  const [activeTab, setActiveTab] = useState("active");

  // Orders data and pagination
  const [orders, setOrders] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [summaryCounts, setSummaryCounts] = useState({
    active: 0,
    all_active: 0,
    recent_today: 0,
    history: 0,
    ordered: 0,
    confirmed: 0,
    ready: 0,
    served: 0,
    completed: 0,
    cancelled: 0,
    archived: 0,
  });

  // Recent Orders – Today state (for dedicated section on active tab)
  const [recentTodayOrders, setRecentTodayOrders] = useState([]);
  const [recentTodayTotal, setRecentTodayTotal] = useState(0);
  const [recentTodayPage, setRecentTodayPage] = useState(1);
  const [recentTodayTotalPages, setRecentTodayTotalPages] = useState(1);
  const [recentTodayLoading, setRecentTodayLoading] = useState(false);

  // Reference data
  const [customers, setCustomers] = useState([]);
  const [tables, setTables] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Filters and sorting
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("ALL");
  const [tableFilter, setTableFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("newest");
  const [dateFilter, setDateFilter] = useState({
    preset: "all_time",
    startDate: "",
    endDate: "",
  });

  // Selection & Bulk Clearing
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkClearModal, setShowBulkClearModal] = useState(false);
  const [bulkArchiving, setBulkArchiving] = useState(false);

  // Permanent Deletion of Archived Orders modal
  const [showDeleteArchivedModal, setShowDeleteArchivedModal] = useState(false);
  const [deletingArchivedOrder, setDeletingArchivedOrder] = useState(null);
  const [deleteCheckLoading, setDeleteCheckLoading] = useState(false);
  const [deletionEligibilityData, setDeletionEligibilityData] = useState(null);
  const [deletingArchived, setDeletingArchived] = useState(false);

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
  const [additionalItem, setAdditionalItem] = useState("");
  const [additionalQuantity, setAdditionalQuantity] = useState(1);

  // Direct Payment Form inside Order Details
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  // ==========================================
  // LOAD ORDERS DATA
  // ==========================================

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: currentPage,
        page_size: pageSize,
        paginate: true,
        tab: activeTab,
        sort_by: sortBy,
      };

      if (search.trim()) {
        params.search = search.trim();
      }

      if (statusFilter !== "ALL") {
        params.status = statusFilter;
      }

      if (paymentStatusFilter !== "ALL") {
        params.payment_status = paymentStatusFilter;
      }

      if (tableFilter !== "ALL") {
        params.table_id = parseInt(tableFilter, 10);
      }

      if (dateFilter.preset && dateFilter.preset !== "all_time") {
        params.preset = dateFilter.preset;
        if (dateFilter.preset === "custom") {
          if (dateFilter.startDate) params.start_date = dateFilter.startDate;
          if (dateFilter.endDate) params.end_date = dateFilter.endDate;
        }
      }

      const [orderRes, customerData, tableData, menuData] = await Promise.all([
        getAllOrders(params),
        getOrderCustomers(),
        getOrderTables(),
        getOrderMenuItems(),
      ]);

      if (orderRes && typeof orderRes === "object" && Array.isArray(orderRes.items)) {
        setOrders(orderRes.items);
        setTotalRecords(orderRes.total ?? 0);
        setTotalPages(orderRes.total_pages ?? 1);
        if (orderRes.summary_counts) {
          setSummaryCounts(orderRes.summary_counts);
        }
      } else if (Array.isArray(orderRes)) {
        setOrders(orderRes);
        setTotalRecords(orderRes.length);
        setTotalPages(1);
      }

      setCustomers(customerData || []);
      setTables(tableData || []);
      setMenuItems(menuData || []);
    } catch (error) {
      showError(getErrorMessage(error), "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [
    activeTab,
    currentPage,
    pageSize,
    search,
    statusFilter,
    paymentStatusFilter,
    tableFilter,
    sortBy,
    dateFilter,
    showError,
  ]);

  const loadRecentTodayOrders = useCallback(async () => {
    setRecentTodayLoading(true);
    try {
      const res = await getAllOrders({
        page: recentTodayPage,
        page_size: 10,
        paginate: true,
        tab: "today",
        sort_by: "newest",
      });
      if (res && typeof res === "object" && Array.isArray(res.items)) {
        setRecentTodayOrders(res.items);
        setRecentTodayTotal(res.total ?? 0);
        setRecentTodayTotalPages(res.total_pages ?? 1);
        if (res.summary_counts) {
          setSummaryCounts(res.summary_counts);
        }
      } else if (Array.isArray(res)) {
        setRecentTodayOrders(res);
        setRecentTodayTotal(res.length);
        setRecentTodayTotalPages(1);
      }
    } catch {
      // Ignore
    } finally {
      setRecentTodayLoading(false);
    }
  }, [recentTodayPage]);

  useEffect(() => {
    loadOrders();
    if (activeTab === "active") {
      loadRecentTodayOrders();
    }
  }, [loadOrders, loadRecentTodayOrders, activeTab]);

  const refreshAllOrderData = useCallback(async () => {
    await loadOrders();
    if (activeTab === "active") {
      await loadRecentTodayOrders();
    }
  }, [loadOrders, loadRecentTodayOrders, activeTab]);

  // Handle Tab Switch
  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setStatusFilter("ALL");
    setPaymentStatusFilter("ALL");
    setTableFilter("ALL");
    setSearch("");
    setSelectedIds(new Set());
    if (tab === "active" || tab === "today") {
      setDateFilter({ preset: "all_time", startDate: "", endDate: "" });
    } else {
      setDateFilter({ preset: "all_time", startDate: "", endDate: "" });
    }
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSearch("");
    setStatusFilter("ALL");
    setPaymentStatusFilter("ALL");
    setTableFilter("ALL");
    setSortBy("newest");
    setDateFilter({
      preset: "all_time",
      startDate: "",
      endDate: "",
    });
    setCurrentPage(1);
  };

  const isAnyFilterActive = useMemo(() => {
    return (
      Boolean(search.trim()) ||
      statusFilter !== "ALL" ||
      paymentStatusFilter !== "ALL" ||
      tableFilter !== "ALL" ||
      sortBy !== "newest" ||
      (dateFilter.preset && dateFilter.preset !== "all_time")
    );
  }, [search, statusFilter, paymentStatusFilter, tableFilter, sortBy, dateFilter]);

  // ==========================================
  // SELECTION & BULK ARCHIVING HANDLERS
  // ==========================================

  const handleToggleSelectAll = () => {
    if (selectedIds.size === orders.length && orders.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orders.map((o) => o.id)));
    }
  };

  const handleToggleSelectRow = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleOpenBulkClear = () => {
    setShowBulkClearModal(true);
  };

  const handleConfirmBulkArchive = async () => {
    setBulkArchiving(true);
    try {
      const orderIdsToArchive = selectedIds.size > 0 ? Array.from(selectedIds) : null;
      const res = await bulkArchiveOrders({
        order_ids: orderIdsToArchive,
        older_than_days: 3,
      });

      showSuccess(
        `Archived ${res.archived_count} order(s). ${res.excluded_count} order(s) excluded (active or pending payment).`,
        "Orders Archived"
      );
      setSelectedIds(new Set());
      setShowBulkClearModal(false);
      await refreshAllOrderData();
    } catch (error) {
      showError(getErrorMessage(error), "Bulk Archiving Failed");
    } finally {
      setBulkArchiving(false);
    }
  };

  const handleRestoreOrder = async (orderId) => {
    setActionLoadingId(orderId);
    try {
      await restoreOrder(orderId);
      showSuccess("Order restored to active records successfully.", "Order Restored");
      await refreshAllOrderData();
    } catch (error) {
      showError(getErrorMessage(error), "Failed to Restore Order");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenSingleDeleteArchived = async (order) => {
    setDeletingArchivedOrder(order);
    setDeleteCheckLoading(true);
    setShowDeleteArchivedModal(true);
    setDeletionEligibilityData(null);
    try {
      const res = await checkArchiveDeletionEligibility([order.id]);
      setDeletionEligibilityData(res);
    } catch (error) {
      showError(getErrorMessage(error), "Failed to check deletion eligibility");
      setShowDeleteArchivedModal(false);
    } finally {
      setDeleteCheckLoading(false);
    }
  };

  const handleOpenBulkDeleteArchived = async () => {
    if (selectedIds.size === 0) return;
    setDeletingArchivedOrder(null);
    setDeleteCheckLoading(true);
    setShowDeleteArchivedModal(true);
    setDeletionEligibilityData(null);
    try {
      const ids = Array.from(selectedIds);
      const res = await checkArchiveDeletionEligibility(ids);
      setDeletionEligibilityData(res);
    } catch (error) {
      showError(getErrorMessage(error), "Failed to check deletion eligibility");
      setShowDeleteArchivedModal(false);
    } finally {
      setDeleteCheckLoading(false);
    }
  };

  const handleBulkRestoreArchived = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    try {
      const res = await bulkRestoreOrders(ids);
      showSuccess(res.message, "Orders Restored");
      setSelectedIds(new Set());
      await refreshAllOrderData();
    } catch (error) {
      showError(getErrorMessage(error), "Failed to Restore Orders");
    }
  };

  const handleConfirmDeleteArchived = async () => {
    if (!deletionEligibilityData || deletionEligibilityData.eligible_ids.length === 0) {
      showWarning("No eligible orders to delete.", "Deletion Blocked");
      return;
    }
    setDeletingArchived(true);
    try {
      if (deletingArchivedOrder) {
        await deleteArchivedOrder(deletingArchivedOrder.id);
        showDelete(
          `Archived order #${deletingArchivedOrder.order_number} has been permanently deleted.`,
          "Order Deleted"
        );
      } else {
        const res = await bulkDeleteArchivedOrders(deletionEligibilityData.eligible_ids);
        showDelete(res.message, "Orders Deleted");
      }
      setShowDeleteArchivedModal(false);
      setSelectedIds(new Set());
      await refreshAllOrderData();
    } catch (error) {
      showError(getErrorMessage(error), "Deletion Failed");
    } finally {
      setDeletingArchived(false);
    }
  };

  // ==========================================
  // DIRECT CONTEXTUAL ACTION HANDLER
  // ==========================================

  const handleDirectAction = async (order, actionOverride = null) => {
    const action = actionOverride || getContextualOrderAction(order);
    if (!action) return;

    if (action.type === "view_invoice") {
      navigate("/invoices");
      return;
    }

    if (action.type === "open_payment") {
      openOrderDetails(order, true);
      return;
    }

    if (action.type === "status_transition") {
      setActionLoadingId(order.id);
      try {
        await updateOrderStatus(order.id, {
          status: action.targetStatus,
          note: null,
        });

        const targetLabel = getWorkflowStageLabel(action.targetStatus);
        showSuccess(
          `Order ${order.order_number} advanced to ${targetLabel}.`,
          "Status Updated"
        );

        // If inside details modal, refresh it
        if (selectedOrder && selectedOrder.id === order.id) {
          if (["Completed", "Cancelled"].includes(action.targetStatus) && activeTab === "active") {
            closeOrderDetails();
          } else {
            await refreshSelectedOrder();
          }
        }
        await refreshAllOrderData();
      } catch (error) {
        showError(getErrorMessage(error), "Action Failed");
      } finally {
        setActionLoadingId(null);
      }
    }
  };

  const handleCancelOrder = async (order) => {
    const ok = await confirm({
      title: "Cancel Order",
      message: `Are you sure you want to cancel Order ${order.order_number}? Any deducted inventory ingredients will be restored to stock.`,
      confirmText: "Cancel Order",
      cancelText: "Keep Order",
      variant: "danger",
    });

    if (!ok) return;

    setActionLoadingId(order.id);
    try {
      await updateOrderStatus(order.id, {
        status: "Cancelled",
        note: "Cancelled by staff/manager",
      });

      showWarning(`Order ${order.order_number} has been cancelled.`, "Order Cancelled");
      if (selectedOrder && selectedOrder.id === order.id) {
        closeOrderDetails();
      }
      await refreshAllOrderData();
    } catch (error) {
      showError(getErrorMessage(error), "Failed to Cancel Order");
    } finally {
      setActionLoadingId(null);
    }
  };

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
      await refreshAllOrderData();
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // ORDER DETAILS & PAYMENT HANDLERS
  // ==========================================

  const openOrderDetails = async (order) => {
    setSelectedOrder(order);
    setShowDetailsModal(true);
    setDetailsLoading(true);
    setDetailsError("");
    setInstructionText(order.special_instructions || "");
    setPaymentAmount("");
    setPaymentReference("");
    setPaymentNotes("");

    try {
      const fullOrder = await getOrderById(order.id);
      setSelectedOrder(fullOrder);
      setInstructionText(fullOrder.special_instructions || "");
      const outstanding = Number(
        fullOrder.outstanding_balance ?? fullOrder.total_amount ?? fullOrder.subtotal ?? 0
      );
      setPaymentAmount(outstanding > 0 ? String(outstanding) : "");
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
    setQuantityModal(null);
    setPaymentAmount("");
    setPaymentReference("");
    setPaymentNotes("");
  };

  const refreshSelectedOrder = async () => {
    if (!selectedOrder) return;
    try {
      const refreshed = await getOrderById(selectedOrder.id);
      setSelectedOrder(refreshed);
      setInstructionText(refreshed.special_instructions || "");
      const outstanding = Number(
        refreshed.outstanding_balance ?? refreshed.total_amount ?? refreshed.subtotal ?? 0
      );
      setPaymentAmount(outstanding > 0 ? String(outstanding) : "");
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
      await refreshAllOrderData();
    } catch (error) {
      setDetailsError(getErrorMessage(error));
      showError(getErrorMessage(error), "Update Failed");
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
      showSuccess("Dish added to order.", "Item Added");
      setAdditionalItem("");
      setAdditionalQuantity(1);
      await refreshAllOrderData();
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
      showSuccess("Dish quantity updated.", "Quantity Updated");
      setQuantityModal(null);
      await refreshAllOrderData();
    } catch (error) {
      setDetailsError(getErrorMessage(error));
      showError(getErrorMessage(error), "Failed to Update Quantity");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveOrderItem = async (item) => {
    const ok = await confirm({
      title: "Remove Dish",
      message: `Are you sure you want to remove "${item.item_name}" from this order?`,
      confirmText: "Remove Dish",
      cancelText: "Keep Dish",
      variant: "danger",
    });

    if (!ok) return;

    setSaving(true);
    try {
      await removeOrderItem(selectedOrder.id, item.id);
      await refreshSelectedOrder();
      showSuccess(`Removed "${item.item_name}" from order.`, "Item Removed");
      await refreshAllOrderData();
    } catch (error) {
      setDetailsError(getErrorMessage(error));
      showError(getErrorMessage(error), "Failed to Remove Item");
    } finally {
      setSaving(false);
    }
  };

  // Submit Payment directly inside Order Details
  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!selectedOrder) return;

    const amt = parseFloat(paymentAmount);
    if (Number.isNaN(amt) || amt <= 0) {
      showError("Please enter a valid payment amount greater than zero.", "Invalid Amount");
      return;
    }

    const outstanding = Number(
      selectedOrder.outstanding_balance ?? selectedOrder.total_amount ?? selectedOrder.subtotal ?? 0
    );

    if (amt > outstanding + 0.01) {
      showError(
        `Payment amount (₹${amt}) cannot exceed the outstanding balance (₹${outstanding.toFixed(2)}).`,
        "Overpayment Blocked"
      );
      return;
    }

    setPaymentSubmitting(true);
    try {
      const payload = {
        amount: amt,
        payment_method: paymentMethod,
        reference_number: paymentReference.trim() || null,
        notes: paymentNotes.trim() || null,
      };

      const updated = await recordOrderPayment(selectedOrder.id, payload);
      showSuccess(
        amt >= outstanding - 0.01
          ? `Full payment of ${formatCurrency(amt)} received. Order settled and completed!`
          : `Partial payment of ${formatCurrency(amt)} recorded. Outstanding balance: ${formatCurrency(updated.outstanding_balance)}.`,
        "Payment Processed"
      );

      setSelectedOrder(updated);
      setPaymentReference("");
      setPaymentNotes("");
      const newOutstanding = Number(updated.outstanding_balance ?? 0);
      setPaymentAmount(newOutstanding > 0 ? String(newOutstanding) : "");

      // If fully settled and completed in active tab, auto-refresh and leave active list
      if (updated.status === "Completed" && activeTab === "active") {
        closeOrderDetails();
      }
      await refreshAllOrderData();
    } catch (error) {
      showError(getErrorMessage(error), "Payment Failed");
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const isOrderEditable =
    selectedOrder && ["Pending", "Confirmed", "Ordered"].includes(selectedOrder.status);

  return (
    <div className="space-y-6">
      {/* A1 Standard PageHeader */}
      <PageHeader
        title="Orders"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#F59E0B] px-4 py-2.5 text-sm font-bold text-stone-900 shadow-xs transition hover:bg-[#E5A910] cursor-pointer"
            >
              <Plus size={17} />
              <span>Create New Order</span>
            </button>
          </div>
        }
      />

      {/* VIEW TABS: LIVE ACTIVE vs RECENT TODAY vs ORDER HISTORY vs ARCHIVED */}
      <div className="flex flex-col gap-4 border-b border-stone-200 dark:border-stone-800 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Active Orders Tab */}
          <button
            type="button"
            onClick={() => handleTabSwitch("active")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition cursor-pointer ${
              activeTab === "active"
                ? "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] shadow-xs font-bold"
                : "bg-white dark:bg-[#101722] text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-800"
            }`}
          >
            <ShoppingCart size={17} />
            <span>Active Orders</span>
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                activeTab === "active"
                  ? "bg-[#0D1420]/15 text-[#0D1420]"
                  : "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300"
              }`}
            >
              {summaryCounts.all_active ?? summaryCounts.active ?? 0}
            </span>
          </button>

          {/* Recent Orders – Today Tab */}
          <button
            type="button"
            onClick={() => handleTabSwitch("today")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition cursor-pointer ${
              activeTab === "today"
                ? "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] shadow-xs font-bold"
                : "bg-white dark:bg-[#101722] text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-800"
            }`}
          >
            <Clock size={17} />
            <span>Recent Orders – Today</span>
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                activeTab === "today"
                  ? "bg-[#0D1420]/15 text-[#0D1420]"
                  : "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300"
              }`}
            >
              {summaryCounts.recent_today ?? 0}
            </span>
          </button>

          {/* Order History Tab */}
          <button
            type="button"
            onClick={() => handleTabSwitch("history")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition cursor-pointer ${
              activeTab === "history"
                ? "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] shadow-xs font-bold"
                : "bg-white dark:bg-[#101722] text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-800"
            }`}
          >
            <History size={17} />
            <span>Order History</span>
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                activeTab === "history"
                  ? "bg-[#0D1420]/15 text-[#0D1420]"
                  : "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300"
              }`}
            >
              {summaryCounts.history ?? ((summaryCounts.completed ?? 0) + (summaryCounts.cancelled ?? 0))}
            </span>
          </button>

          {/* Archived Orders Tab */}
          <button
            type="button"
            onClick={() => handleTabSwitch("archived")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition cursor-pointer ${
              activeTab === "archived"
                ? "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] shadow-xs font-bold"
                : "bg-white dark:bg-[#101722] text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-800"
            }`}
          >
            <Archive size={17} />
            <span>Archived</span>
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                activeTab === "archived"
                  ? "bg-[#0D1420]/15 text-[#0D1420]"
                  : "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300"
              }`}
            >
              {summaryCounts.archived ?? 0}
            </span>
          </button>
        </div>

        {/* Date Filter (Available on History and Archived tabs) */}
        {["history", "archived"].includes(activeTab) && (
          <DateFilter
            selectedPreset={dateFilter.preset}
            startDate={dateFilter.startDate}
            endDate={dateFilter.endDate}
            onChange={(newFilter) => {
              setDateFilter(newFilter);
              setCurrentPage(1);
            }}
          />
        )}
      </div>

      {/* 5 LIFECYCLE SUMMARY KPI CARDS (ACTIVE TAB) */}
      {activeTab === "active" && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          {/* 1. All Active */}
          <div
            onClick={() => {
              setStatusFilter("ALL");
              setCurrentPage(1);
            }}
            className={`cursor-pointer rounded-xl border p-3.5 transition-all shadow-xs ${
              statusFilter === "ALL"
                ? "border-[#F59E0B] bg-[#FFF7E8]/50 dark:bg-amber-950/20 ring-1 ring-[#F59E0B]"
                : "border-stone-200 dark:border-stone-800 bg-white dark:bg-[#101722] hover:border-stone-300 dark:hover:border-stone-700"
            }`}
          >
            <p className="text-xs text-stone-500 dark:text-stone-400 font-semibold uppercase tracking-wider">
              All Active
            </p>
            <p className="mt-1 text-2xl font-bold text-stone-900 dark:text-white tabular-nums">
              {summaryCounts.active ?? 0}
            </p>
            <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">Live dining orders</p>
          </div>

          {/* 2. Ordered */}
          <div
            onClick={() => {
              setStatusFilter(statusFilter === "Pending" ? "ALL" : "Pending");
              setCurrentPage(1);
            }}
            className={`cursor-pointer rounded-xl border p-3.5 transition-all shadow-xs ${
              statusFilter === "Pending"
                ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-400"
                : "border-stone-200 dark:border-stone-800 bg-white dark:bg-[#101722] hover:border-stone-300 dark:hover:border-stone-700"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-amber-800 dark:text-amber-400 font-semibold uppercase tracking-wider">
                1. Ordered
              </p>
              <span className="h-2 w-2 rounded-full bg-amber-500" />
            </div>
            <p className="mt-1 text-2xl font-bold text-amber-950 dark:text-amber-200 tabular-nums">
              {summaryCounts.ordered ?? 0}
            </p>
            <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">Awaiting confirmation</p>
          </div>

          {/* 3. Confirmed */}
          <div
            onClick={() => {
              setStatusFilter(statusFilter === "Confirmed" ? "ALL" : "Confirmed");
              setCurrentPage(1);
            }}
            className={`cursor-pointer rounded-xl border p-3.5 transition-all shadow-xs ${
              statusFilter === "Confirmed"
                ? "border-blue-400 bg-blue-50 dark:bg-blue-950/30 ring-1 ring-blue-400"
                : "border-stone-200 dark:border-stone-800 bg-white dark:bg-[#101722] hover:border-stone-300 dark:hover:border-stone-700"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-blue-800 dark:text-blue-400 font-semibold uppercase tracking-wider">
                2. Confirmed
              </p>
              <span className="h-2 w-2 rounded-full bg-blue-500" />
            </div>
            <p className="mt-1 text-2xl font-bold text-blue-950 dark:text-blue-200 tabular-nums">
              {summaryCounts.confirmed ?? 0}
            </p>
            <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">Accepted by staff</p>
          </div>

          {/* 4. Ready */}
          <div
            onClick={() => {
              setStatusFilter(statusFilter === "Ready" ? "ALL" : "Ready");
              setCurrentPage(1);
            }}
            className={`cursor-pointer rounded-xl border p-3.5 transition-all shadow-xs ${
              statusFilter === "Ready"
                ? "border-purple-400 bg-purple-50 dark:bg-purple-950/30 ring-1 ring-purple-400"
                : "border-stone-200 dark:border-stone-800 bg-white dark:bg-[#101722] hover:border-stone-300 dark:hover:border-stone-700"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-purple-800 dark:text-purple-400 font-semibold uppercase tracking-wider">
                3. Ready
              </p>
              <span className="h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
            </div>
            <p className="mt-1 text-2xl font-bold text-purple-950 dark:text-purple-200 tabular-nums">
              {summaryCounts.ready ?? 0}
            </p>
            <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">Prepared in kitchen</p>
          </div>

          {/* 5. Served */}
          <div
            onClick={() => {
              setStatusFilter(statusFilter === "Served" ? "ALL" : "Served");
              setCurrentPage(1);
            }}
            className={`cursor-pointer rounded-xl border p-3.5 transition-all shadow-xs ${
              statusFilter === "Served"
                ? "border-teal-400 bg-teal-50 dark:bg-teal-950/30 ring-1 ring-teal-400"
                : "border-stone-200 dark:border-stone-800 bg-white dark:bg-[#101722] hover:border-stone-300 dark:hover:border-stone-700"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-teal-800 dark:text-teal-400 font-semibold uppercase tracking-wider">
                4. Served
              </p>
              <span className="h-2 w-2 rounded-full bg-teal-600" />
            </div>
            <p className="mt-1 text-2xl font-bold text-teal-950 dark:text-teal-200 tabular-nums">
              {summaryCounts.served ?? 0}
            </p>
            <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">Delivered / Dining</p>
          </div>
        </div>
      )}

      {/* BULK ACTION FLOATING TOOLBAR */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 dark:border-amber-700/80 bg-amber-50/90 dark:bg-amber-950/40 p-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-[#F59E0B] px-2.5 py-1 text-xs font-bold text-[#0D1420]">
              {selectedIds.size} selected
            </span>
            <span className="text-xs font-medium text-amber-900 dark:text-amber-200">
              Orders chosen for batch processing
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#101722] px-3 py-1.5 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-100 transition cursor-pointer"
            >
              Deselect All
            </button>
            {activeTab === "archived" ? (
              <>
                <button
                  type="button"
                  onClick={handleBulkRestoreArchived}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition cursor-pointer shadow-xs"
                >
                  <RotateCcw size={14} />
                  <span>Restore Selected</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenBulkDeleteArchived}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 transition cursor-pointer shadow-xs"
                >
                  <Trash2 size={14} />
                  <span>Delete Selected</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleOpenBulkClear}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 transition cursor-pointer shadow-xs"
              >
                <Archive size={14} />
                <span>Clear Old Orders (&gt;3 Days)</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ORDERS TABLE CONTAINER */}
      <div className="overflow-hidden rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-[#101722] shadow-xs">
        {/* TABLE FILTER & SEARCH TOOLBAR */}
        <div className="flex flex-col gap-3 border-b border-stone-200/80 dark:border-stone-800 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-bold text-stone-900 dark:text-white">
                {activeTab === "active"
                  ? "Live Active Dining Orders"
                  : activeTab === "today"
                  ? "Recent Orders – Today"
                  : activeTab === "history"
                  ? "Order History (Previous Dates)"
                  : "Archived Orders"}
              </h2>
              <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                {totalRecords} {totalRecords === 1 ? "order" : "orders"} found
                {selectedIds.size > 0 && ` • ${selectedIds.size} selected`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Search Input */}
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search orders"
                  className="w-full rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151D29] py-2 pl-9 pr-3 text-sm text-stone-900 dark:text-white outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/30 sm:w-64"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151D29] px-3 py-2 text-sm text-stone-800 dark:text-stone-200 outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/30"
              >
                {activeTab === "active" ? (
                  <>
                    <option value="ALL">All Active Stages</option>
                    <option value="Pending">Ordered</option>
                    <option value="Confirmed">Confirmed</option>
                    <option value="Ready">Ready</option>
                    <option value="Served">Served</option>
                  </>
                ) : activeTab === "today" ? (
                  <>
                    <option value="ALL">All Stages (Today)</option>
                    <option value="Pending">Ordered</option>
                    <option value="Confirmed">Confirmed</option>
                    <option value="Ready">Ready</option>
                    <option value="Served">Served</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </>
                ) : activeTab === "history" ? (
                  <>
                    <option value="ALL">All History</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </>
                ) : (
                  <>
                    <option value="ALL">All Archived</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </>
                )}
              </select>

              {/* Payment Status Filter */}
              <select
                value={paymentStatusFilter}
                onChange={(e) => {
                  setPaymentStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151D29] px-3 py-2 text-sm text-stone-800 dark:text-stone-200 outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/30"
              >
                <option value="ALL">All Payments</option>
                <option value="PAID">Paid</option>
                <option value="PARTIALLY_PAID">Partially Paid</option>
                <option value="PENDING">Payment Pending</option>
              </select>

              {/* Dining Table Selector */}
              <select
                value={tableFilter}
                onChange={(e) => {
                  setTableFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151D29] px-3 py-2 text-sm text-stone-800 dark:text-stone-200 outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/30"
              >
                <option value="ALL">All Tables</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    Table {t.table_number}
                  </option>
                ))}
              </select>

              {/* Sort By */}
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151D29] px-3 py-2 text-sm text-stone-800 dark:text-stone-200 outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/30"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="highest_amount">Highest Amount</option>
                <option value="lowest_amount">Lowest Amount</option>
              </select>

              {/* Reset Filters Button */}
              {isAnyFilterActive && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  title="Reset all filters"
                  className="flex items-center gap-1 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#151D29] px-2.5 py-2 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-100 transition cursor-pointer"
                >
                  <X size={14} />
                  <span>Clear</span>
                </button>
              )}

              {/* Refresh Button */}
              <button
                type="button"
                onClick={loadOrders}
                disabled={loading}
                title="Refresh orders"
                className="flex items-center justify-center rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#151D29] p-2 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>
        </div>

        {/* DATA TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-left">
            <thead className="bg-stone-50/80 dark:bg-stone-900/60 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              <tr>
                <th className="w-10 px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    aria-label="Select all orders"
                    checked={orders.length > 0 && selectedIds.size === orders.length}
                    onChange={handleToggleSelectAll}
                    className="h-4 w-4 rounded border-stone-300 text-[#F59E0B] focus:ring-[#F59E0B] cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3">Order Number</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Table</th>
                <th className="px-4 py-3">Summary</th>
                <th className="px-4 py-3">Financials</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Workflow Status</th>
                <th className="px-4 py-3 text-center">Quick Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-stone-100 dark:divide-stone-800 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-stone-500">
                    <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-[#F59E0B]" />
                    Loading orders...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-stone-500">
                    {activeTab === "active"
                      ? "No active orders found matching your criteria. New orders will appear here."
                      : activeTab === "today"
                      ? "No orders placed today yet. New orders created today will appear here."
                      : activeTab === "history"
                      ? "No historical orders found from previous business dates."
                      : "No archived orders found."}
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const isSelected = selectedIds.has(order.id);
                  const itemsSummary = (order.items || [])
                    .map((item) => `${item.quantity}x ${item.item_name}`)
                    .join(", ");

                  const badgeInfo = getOrderStatusBadgeStyle(order.status);
                  const workflowLabel = getWorkflowStageLabel(order.status);
                  const contextualAction = getContextualOrderAction(order);
                  const isActionLoading = actionLoadingId === order.id;

                  const totalVal = Number(order.total_amount ?? order.subtotal ?? 0);
                  const outstandingVal = Number(order.outstanding_balance ?? 0);

                  return (
                    <tr
                      key={order.id}
                      className={`transition ${
                        isSelected
                          ? "bg-amber-50/60 dark:bg-amber-950/20"
                          : "hover:bg-stone-50/70 dark:hover:bg-stone-850/60"
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Select order ${order.order_number}`}
                          checked={isSelected}
                          onChange={() => handleToggleSelectRow(order.id)}
                          className="h-4 w-4 rounded border-stone-300 text-[#F59E0B] focus:ring-[#F59E0B] cursor-pointer"
                        />
                      </td>

                      {/* Order Number */}
                      <td className="px-4 py-3 font-semibold text-stone-900 dark:text-stone-100">
                        <div className="flex items-center gap-1.5">
                          <span>{order.order_number}</span>
                        </div>
                        <span className="text-[11px] text-stone-400 dark:text-stone-500 block">
                          {activeTab === "history" || activeTab === "archived"
                            ? formatOrderDateTime(order.created_at)
                            : formatOrderTime(order.created_at)}
                        </span>
                      </td>

                      {/* Customer */}
                      <td className="px-4 py-3 text-stone-800 dark:text-stone-200">
                        <p className="font-medium">{order.customer_name || "Guest Customer"}</p>
                        <p className="text-xs text-stone-500 dark:text-stone-400">
                          {order.customer_phone || "—"}
                        </p>
                      </td>

                      {/* Table */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-md bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-xs font-semibold text-stone-700 dark:text-stone-300">
                          {order.table_number ? `Table ${order.table_number}` : "Takeaway"}
                        </span>
                      </td>

                      {/* Summary */}
                      <td className="px-4 py-3 max-w-[200px]">
                        <p
                          className="truncate text-xs text-stone-600 dark:text-stone-300"
                          title={itemsSummary}
                        >
                          {itemsSummary || "No dishes"}
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

                      {/* Financials */}
                      <td className="px-4 py-3 font-semibold text-stone-900 dark:text-stone-100">
                        <div>{formatCurrency(totalVal)}</div>
                        {outstandingVal > 0 && order.status === "Served" && (
                          <span className="text-[11px] text-amber-700 dark:text-amber-300 block font-normal">
                            Due: {formatCurrency(outstandingVal)}
                          </span>
                        )}
                      </td>

                      {/* Payment Status */}
                      <td className="px-4 py-3">
                        {getPaymentBadge(order.payment_status, order.outstanding_balance)}
                      </td>

                      {/* Workflow Status Badge (Clean, No Duplicate Labels) */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs ${badgeInfo.badge}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${badgeInfo.dot}`} />
                          <span className="font-semibold">{workflowLabel}</span>
                        </span>
                      </td>

                      {/* Quick Actions & Details */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Direct Contextual Primary Action Button */}
                          {activeTab === "archived" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleRestoreOrder(order.id)}
                                disabled={isActionLoading}
                                title="Restore order"
                                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#151D29] px-2.5 py-1 text-xs font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-50 transition cursor-pointer shadow-2xs"
                              >
                                <RotateCcw size={13} className={isActionLoading ? "animate-spin" : ""} />
                                <span>Restore</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenSingleDeleteArchived(order)}
                                disabled={isActionLoading}
                                title="Permanently Delete Archived Order"
                                className="inline-flex items-center gap-1 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-2 py-1 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 transition cursor-pointer shadow-2xs"
                              >
                                <Trash2 size={13} />
                                <span>Delete</span>
                              </button>
                            </>
                          ) : contextualAction ? (
                            <button
                              type="button"
                              onClick={() => handleDirectAction(order, contextualAction)}
                              disabled={isActionLoading}
                              title={contextualAction.label}
                              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                                contextualAction.actionKey === "view_invoice"
                                  ? "border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#151D29] text-stone-700 dark:text-stone-200 hover:bg-stone-50"
                                  : contextualAction.actionKey === "complete"
                                  ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                                  : "bg-[#F59E0B] hover:bg-[#E5A910] text-stone-900 shadow-xs"
                              }`}
                            >
                              {isActionLoading ? (
                                <RefreshCw size={13} className="animate-spin" />
                              ) : contextualAction.actionKey === "view_invoice" ? (
                                <FileText size={13} />
                              ) : contextualAction.actionKey === "collect_payment" ? (
                                <CreditCard size={13} />
                              ) : (
                                <ArrowRight size={13} />
                              )}
                              <span>{contextualAction.label}</span>
                            </button>
                          ) : null}

                          {/* Order Details Button */}
                          <button
                            type="button"
                            onClick={() => openOrderDetails(order)}
                            title="View order details"
                            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#151D29] px-2 py-1 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-100 transition cursor-pointer shadow-2xs"
                          >
                            <Eye size={13} />
                            <span>Details</span>
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

        {/* PAGINATION (10 RECORDS / PAGE) */}
        <div className="p-4 border-t border-stone-200/80 dark:border-stone-800">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={totalRecords}
            pageSize={pageSize}
            onPageChange={(p) => setCurrentPage(p)}
          />
        </div>
      </div>

      {/* RECENT ORDERS – TODAY SECTION (SHOWN ON ACTIVE TAB DIRECTLY BELOW LIVE ACTIVE ORDERS) */}
      {activeTab === "active" && (
        <div className="overflow-hidden rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-[#101722] shadow-xs">
          {/* HEADER TOOLBAR */}
          <div className="flex flex-col gap-3 border-b border-stone-200/80 dark:border-stone-800 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 dark:bg-amber-500/20">
                <Clock size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-stone-900 dark:text-white">
                    Recent Orders – Today
                  </h2>
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                    {recentTodayTotal} {recentTodayTotal === 1 ? "order" : "orders"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                  Orders created today in Asia/Kolkata timezone (newest first)
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={loadRecentTodayOrders}
              disabled={recentTodayLoading}
              className="inline-flex items-center gap-1.5 self-start rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151D29] px-3 py-1.5 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition cursor-pointer disabled:opacity-50 sm:self-auto"
              title="Refresh today's orders"
            >
              <RefreshCw size={13} className={recentTodayLoading ? "animate-spin text-[#F59E0B]" : ""} />
              <span>Refresh Today</span>
            </button>
          </div>

          {/* TABLE */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-stone-600 dark:text-stone-300">
              <thead className="border-b border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-[#151D29] text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                <tr>
                  <th className="px-4 py-3">Order Number</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Dining Table</th>
                  <th className="px-4 py-3">Summary</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Workflow Status</th>
                  <th className="px-4 py-3">Order Time</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200/80 dark:divide-stone-800/80">
                {recentTodayLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-xs text-stone-400">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw size={16} className="animate-spin text-[#F59E0B]" />
                        <span>Loading today's orders...</span>
                      </div>
                    </td>
                  </tr>
                ) : recentTodayOrders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sm text-stone-500">
                      No orders placed today yet. New orders created today will appear here.
                    </td>
                  </tr>
                ) : (
                  recentTodayOrders.map((order) => {
                    const contextualAction = getContextualOrderAction(order);
                    const isActionLoading = actionLoadingId === order.id;
                    const itemsSummary = (order.items || [])
                      .map((item) => `${item.quantity}x ${item.item_name}`)
                      .join(", ");
                    const totalVal = Number(order.total_amount ?? order.subtotal ?? 0);

                    return (
                      <tr
                        key={order.id}
                        className="transition hover:bg-stone-50/60 dark:hover:bg-[#151D29]/50"
                      >
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => openOrderDetails(order)}
                            className="font-bold text-[#D97706] hover:text-[#B45309] dark:text-[#F59E0B] dark:hover:text-[#FBBF24] hover:underline"
                          >
                            {order.order_number}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-stone-900 dark:text-white">
                            {order.customer_name || order.customer?.full_name || "Guest Customer"}
                          </div>
                          {(order.customer_phone || order.customer?.phone) && (
                            <div className="text-xs text-stone-500">
                              {order.customer_phone || order.customer?.phone}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-md bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-xs font-semibold text-stone-700 dark:text-stone-300">
                            {order.table_number || order.table?.table_number
                              ? `Table ${order.table_number || order.table?.table_number}`
                              : "Takeaway"}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <div className="truncate text-xs text-stone-700 dark:text-stone-300" title={itemsSummary}>
                            {itemsSummary || "No dishes"}
                          </div>
                          <div className="text-[11px] text-stone-400">
                            {order.items?.length || 0} {order.items?.length === 1 ? "item" : "items"}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-stone-900 dark:text-white tabular-nums">
                          {formatCurrency(totalVal)}
                        </td>
                        <td className="px-4 py-3">
                          {getPaymentBadge(order.payment_status, order.outstanding_balance)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${getOrderStatusBadgeStyle(
                              order.status
                            )}`}
                          >
                            {getWorkflowStageLabel(order.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-stone-500 tabular-nums">
                          {formatOrderTime(order.created_at)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {contextualAction && (
                              <button
                                type="button"
                                onClick={() => handleDirectAction(order, contextualAction)}
                                disabled={isActionLoading}
                                title={contextualAction.label}
                                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                                  contextualAction.actionKey === "view_invoice"
                                    ? "border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#151D29] text-stone-700 dark:text-stone-200 hover:bg-stone-50"
                                    : contextualAction.actionKey === "complete"
                                    ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                                    : "bg-[#F59E0B] hover:bg-[#E5A910] text-stone-900 shadow-xs"
                                }`}
                              >
                                {isActionLoading ? (
                                  <RefreshCw size={11} className="animate-spin" />
                                ) : contextualAction.actionKey === "view_invoice" ? (
                                  <FileText size={11} />
                                ) : contextualAction.actionKey === "collect_payment" ? (
                                  <CreditCard size={11} />
                                ) : (
                                  <ArrowRight size={11} />
                                )}
                                <span>{contextualAction.label}</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => openOrderDetails(order)}
                              title="View details"
                              className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200 transition cursor-pointer"
                            >
                              <Eye size={16} />
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

          {/* PAGINATION */}
          {recentTodayTotalPages > 1 && (
            <div className="border-t border-stone-200 dark:border-stone-800 p-3">
              <Pagination
                currentPage={recentTodayPage}
                totalPages={recentTodayTotalPages}
                totalRecords={recentTodayTotal}
                pageSize={10}
                onPageChange={(p) => setRecentTodayPage(p)}
              />
            </div>
          )}
        </div>
      )}

      {/* =====================================
          BULK CLEAR / ARCHIVE CONFIRMATION MODAL
      ===================================== */}
      {showBulkClearModal && (
        <ModalShell
          title="Clear Old Orders (Archiving)"
          subtitle="Safely archive completed and cancelled orders older than 3 days."
          onClose={() => setShowBulkClearModal(false)}
          size="max-w-lg"
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-3.5 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Manager-Authorized Order Cleanup</p>
                  <p className="mt-1 text-amber-800 dark:text-amber-300">
                    This operation archives historical records that are at least 3 days old and fully settled.
                  </p>
                  <ul className="mt-2 list-disc list-inside space-y-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                    <li>Active dining orders (Ordered, Confirmed, Ready, Served) are never cleared.</li>
                    <li>Orders with an outstanding payment balance are protected and excluded.</li>
                    <li>Archived records can be inspected and restored anytime from the Archived tab.</li>
                  </ul>
                </div>
              </div>
            </div>

            <p className="text-sm text-stone-600 dark:text-stone-400">
              {selectedIds.size > 0
                ? `You have explicitly selected ${selectedIds.size} order(s). Any eligible orders among them will be archived.`
                : "All Completed and Cancelled orders created more than 3 days ago will be archived."}
            </p>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-stone-200 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setShowBulkClearModal(false)}
                className="rounded-lg border border-stone-300 dark:border-stone-700 px-4 py-2 text-sm font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkArchive}
                disabled={bulkArchiving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 transition cursor-pointer shadow-xs"
              >
                <Archive size={15} className={bulkArchiving ? "animate-spin" : ""} />
                <span>{bulkArchiving ? "Archiving..." : "Confirm & Archive"}</span>
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* =====================================
          PERMANENT DELETE ARCHIVED ORDERS MODAL
      ===================================== */}
      {showDeleteArchivedModal && (
        <ModalShell
          title="Permanent Deletion – Archived Orders"
          subtitle="Verify financial, inventory, and audit dependencies before removing records."
          onClose={() => {
            if (!deletingArchived) setShowDeleteArchivedModal(false);
          }}
          size="max-w-xl"
        >
          <div className="space-y-4">
            {deleteCheckLoading ? (
              <div className="flex flex-col items-center justify-center p-8 space-y-3">
                <RefreshCw size={28} className="animate-spin text-amber-500" />
                <p className="text-sm font-medium text-stone-600 dark:text-stone-400">
                  Auditing dependencies (invoices, payments, stock movements)...
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/30 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={20} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <p className="font-bold text-red-800 dark:text-red-200 text-sm">
                        Permanent Deletion Warning
                      </p>
                      <p className="text-red-700 dark:text-red-300">
                        Are you sure you want to permanently delete {deletingArchivedOrder ? `archived order #${deletingArchivedOrder.order_number}` : `${deletionEligibilityData?.eligible_count || 0} eligible archived order(s)`}? This action cannot be undone.
                      </p>
                    </div>
                  </div>
                </div>

                {deletionEligibilityData && (
                  <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-900/40 p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 p-2.5">
                        <span className="text-[11px] font-semibold uppercase text-emerald-800 dark:text-emerald-300">
                          Eligible for Deletion
                        </span>
                        <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400">
                          {deletionEligibilityData.eligible_count}
                        </p>
                      </div>
                      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 p-2.5">
                        <span className="text-[11px] font-semibold uppercase text-amber-800 dark:text-amber-300">
                          Protected Records
                        </span>
                        <p className="text-xl font-extrabold text-amber-700 dark:text-amber-400">
                          {deletionEligibilityData.protected_count}
                        </p>
                      </div>
                    </div>

                    {deletionEligibilityData.protected_orders.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-stone-200 dark:border-stone-800">
                        <p className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                          Protected records contain linked financial or inventory history:
                        </p>
                        <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                          {deletionEligibilityData.protected_orders.map((prot) => (
                            <div
                              key={prot.id}
                              className="text-xs rounded-md bg-white dark:bg-stone-800/80 p-2 border border-stone-200 dark:border-stone-700"
                            >
                              <span className="font-mono font-bold text-stone-900 dark:text-stone-100">
                                #{prot.order_number}:
                              </span>{" "}
                              <span className="text-stone-600 dark:text-stone-400">
                                {prot.reason}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-200 dark:border-stone-800">
                  <button
                    type="button"
                    onClick={() => setShowDeleteArchivedModal(false)}
                    disabled={deletingArchived}
                    className="rounded-lg border border-stone-300 dark:border-stone-700 px-4 py-2 text-sm font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-50 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteArchived}
                    disabled={
                      deletingArchived ||
                      !deletionEligibilityData ||
                      deletionEligibilityData.eligible_count === 0
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer shadow-xs"
                  >
                    {deletingArchived ? (
                      <RefreshCw size={15} className="animate-spin" />
                    ) : (
                      <Trash2 size={15} />
                    )}
                    <span>
                      {deletingArchived
                        ? "Deleting..."
                        : deletionEligibilityData?.eligible_count > 0
                        ? `Delete ${deletionEligibilityData.eligible_count} Eligible Order${
                            deletionEligibilityData.eligible_count > 1 ? "s" : ""
                          }`
                        : "Cannot Delete Protected Orders"}
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </ModalShell>
      )}

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
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                  Customer <span className="text-red-500">*</span>
                </label>
                <select
                  name="customer_id"
                  value={form.customer_id}
                  onChange={handleFormChange}
                  required
                  className="w-full rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151D29] px-3 py-2 text-sm text-stone-900 dark:text-white outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/30"
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
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                  Dining Table <span className="text-red-500">*</span>
                </label>
                <select
                  name="table_id"
                  value={form.table_id}
                  onChange={handleFormChange}
                  required
                  className="w-full rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151D29] px-3 py-2 text-sm text-stone-900 dark:text-white outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/30"
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
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                Kitchen Instructions (Optional)
              </label>
              <input
                type="text"
                name="special_instructions"
                value={form.special_instructions}
                onChange={handleFormChange}
                placeholder="e.g., Less spicy, Jain preparation, allergic to peanuts..."
                className="w-full rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151D29] px-3 py-2 text-sm text-stone-900 dark:text-white outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/30"
              />
            </div>

            {/* ADD ITEM ROW */}
            <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-[#101722] p-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                Add Menu Items
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedMenuItem}
                  onChange={(e) => setSelectedMenuItem(e.target.value)}
                  className="flex-1 min-w-[200px] rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151D29] px-3 py-2 text-sm text-stone-900 dark:text-white outline-none transition focus:border-[#F59E0B]"
                >
                  <option value="">Select dish from menu</option>
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
                    onChange={(e) =>
                      setItemQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))
                    }
                    className="w-16 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151D29] px-2 py-2 text-center text-sm outline-none focus:border-[#F59E0B]"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleAddItemToCart}
                  disabled={!selectedMenuItem}
                  className="rounded-lg bg-stone-900 dark:bg-stone-800 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-40 transition cursor-pointer"
                >
                  Add to Order
                </button>
              </div>
            </div>

            {/* CART PREVIEW */}
            {cart.length > 0 && (
              <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-4">
                <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                  Selected Dishes ({cart.length})
                </h4>
                <div className="divide-y divide-stone-100 dark:divide-stone-800 max-h-48 overflow-y-auto">
                  {cart.map((item) => (
                    <div
                      key={item.menu_item_id}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <div>
                        <span className="font-semibold text-stone-900 dark:text-white">
                          {item.name}
                        </span>
                        <span className="ml-2 text-xs text-stone-500">
                          ₹{item.price} × {item.quantity}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-stone-900 dark:text-white">
                          {formatCurrency(Number(item.price) * item.quantity)}
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
                <div className="mt-3 flex items-center justify-between border-t border-stone-200 dark:border-stone-800 pt-3">
                  <span className="font-bold text-stone-900 dark:text-white text-sm">
                    Total Estimate:
                  </span>
                  <span className="text-base font-bold text-amber-800 dark:text-amber-300">
                    {formatCurrency(cartTotal)}
                  </span>
                </div>
              </div>
            )}

            {/* BUTTONS */}
            <div className="flex justify-end gap-3 pt-3 border-t border-stone-200 dark:border-stone-800">
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-lg border border-stone-300 dark:border-stone-700 px-4 py-2 text-sm font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || cart.length === 0}
                className="rounded-lg bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] px-5 py-2 text-sm font-bold text-[#0D1420] hover:opacity-95 disabled:opacity-50 transition cursor-pointer shadow-xs"
              >
                {saving ? "Creating Order..." : "Place Order"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* =====================================
          ORDER DETAILS & PAYMENT MODAL
      ===================================== */}
      {showDetailsModal && selectedOrder && (
        <ModalShell
          title={`Order ${selectedOrder.order_number}`}
          subtitle={`Customer: ${selectedOrder.customer_name || "Guest"} • Table ${
            selectedOrder.table_number || "Takeaway"
          }`}
          onClose={closeOrderDetails}
          size="max-w-3xl"
        >
          {detailsLoading ? (
            <div className="py-12 text-center text-sm text-stone-500">
              <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-[#F59E0B]" />
              Loading order details...
            </div>
          ) : (
            <div className="space-y-6">
              {detailsError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
                  {detailsError}
                </div>
              )}

              {/* 5-STAGE WORKFLOW STEPPER */}
              <OrderWorkflowStepper status={selectedOrder.status} />

              {/* CONTEXTUAL ACTION BANNER (NO DROPDOWN REQUIRED) */}
              <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#151D29] p-4 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                      Next Workflow Action
                    </span>
                    <h3 className="text-base font-bold text-stone-900 dark:text-white mt-0.5">
                      Current Stage: {getWorkflowStageLabel(selectedOrder.status)}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Primary Direct Action */}
                    {getContextualOrderAction(selectedOrder) ? (
                      <button
                        type="button"
                        onClick={() => handleDirectAction(selectedOrder)}
                        disabled={saving}
                        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition cursor-pointer ${
                          getContextualOrderAction(selectedOrder).actionKey === "view_invoice"
                            ? "border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#101722] text-stone-800 dark:text-stone-200 hover:bg-stone-50"
                            : getContextualOrderAction(selectedOrder).actionKey === "complete"
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                            : "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] shadow-xs"
                        }`}
                      >
                        {saving ? (
                          <RefreshCw size={16} className="animate-spin" />
                        ) : getContextualOrderAction(selectedOrder).actionKey === "view_invoice" ? (
                          <FileText size={16} />
                        ) : getContextualOrderAction(selectedOrder).actionKey === "collect_payment" ? (
                          <CreditCard size={16} />
                        ) : (
                          <ArrowRight size={16} />
                        )}
                        <span>{getContextualOrderAction(selectedOrder).label}</span>
                      </button>
                    ) : null}

                    {/* Secondary Cancel Action for Active Non-Served orders */}
                    {["Pending", "Confirmed", "Ready"].includes(selectedOrder.status) && (
                      <button
                        type="button"
                        onClick={() => handleCancelOrder(selectedOrder)}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800/80 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 transition cursor-pointer"
                      >
                        <Ban size={14} />
                        <span>Cancel Order</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* FINANCIAL OVERVIEW & DIRECT PAYMENT COLLECTION */}
              <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-[#101722] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    Financial Summary & Settlement
                  </span>
                  <div>{getPaymentBadge(selectedOrder.payment_status, selectedOrder.outstanding_balance)}</div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 text-sm border-b border-stone-200 dark:border-stone-800 pb-3">
                  <div>
                    <p className="text-xs text-stone-500 dark:text-stone-400">Subtotal</p>
                    <p className="font-semibold text-stone-900 dark:text-white mt-0.5">
                      {formatCurrency(selectedOrder.subtotal)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-stone-500 dark:text-stone-400">GST (5%)</p>
                    <p className="font-semibold text-stone-900 dark:text-white mt-0.5">
                      {formatCurrency(selectedOrder.tax_amount ?? Number(selectedOrder.subtotal || 0) * 0.05)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-stone-500 dark:text-stone-400">Grand Total</p>
                    <p className="font-bold text-stone-900 dark:text-white mt-0.5">
                      {formatCurrency(selectedOrder.total_amount ?? selectedOrder.subtotal)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-stone-500 dark:text-stone-400">Amount Paid</p>
                    <p className="font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                      {formatCurrency(selectedOrder.amount_paid ?? 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-stone-500 dark:text-stone-400">Balance Due</p>
                    <p
                      className={`font-bold mt-0.5 ${
                        Number(selectedOrder.outstanding_balance ?? 0) > 0
                          ? "text-amber-800 dark:text-amber-300"
                          : "text-emerald-700 dark:text-emerald-400"
                      }`}
                    >
                      {formatCurrency(selectedOrder.outstanding_balance ?? 0)}
                    </p>
                  </div>
                </div>

                {/* DIRECT PAYMENT FORM (Visible when order is Served and has outstanding balance) */}
                {selectedOrder.status === "Served" &&
                  Number(selectedOrder.outstanding_balance ?? selectedOrder.total_amount ?? 1) > 0 && (
                    <form onSubmit={handleRecordPayment} className="mt-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <CreditCard size={16} className="text-[#F59E0B]" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-stone-800 dark:text-stone-200">
                          Collect Payment
                        </h4>
                      </div>

                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
                        {/* Payment Method */}
                        <div>
                          <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">
                            Method
                          </label>
                          <select
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            className="w-full rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151D29] px-2.5 py-1.5 text-xs text-stone-900 dark:text-white outline-none focus:border-[#F59E0B]"
                          >
                            {PAYMENT_METHODS.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Amount */}
                        <div>
                          <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">
                            Amount (₹)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="1"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            placeholder="Amount"
                            required
                            className="w-full rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151D29] px-2.5 py-1.5 text-xs font-semibold text-stone-900 dark:text-white outline-none focus:border-[#F59E0B]"
                          />
                        </div>

                        {/* Reference Number */}
                        <div>
                          <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">
                            Reference / UTR #
                          </label>
                          <input
                            type="text"
                            value={paymentReference}
                            onChange={(e) => setPaymentReference(e.target.value)}
                            placeholder="UPI / Auth code"
                            className="w-full rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151D29] px-2.5 py-1.5 text-xs text-stone-900 dark:text-white outline-none focus:border-[#F59E0B]"
                          />
                        </div>

                        {/* Submit Button */}
                        <div className="flex items-end">
                          <button
                            type="submit"
                            disabled={paymentSubmitting}
                            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] px-3 py-1.5 text-xs font-bold text-[#0D1420] hover:opacity-95 disabled:opacity-50 transition cursor-pointer shadow-xs min-h-[34px]"
                          >
                            {paymentSubmitting ? (
                              <RefreshCw size={13} className="animate-spin" />
                            ) : (
                              <CheckCircle2 size={13} />
                            )}
                            <span>{paymentSubmitting ? "Processing..." : "Record Payment"}</span>
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                {/* RECORDED PAYMENTS AUDIT LIST */}
                {selectedOrder.payments && selectedOrder.payments.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-stone-200 dark:border-stone-800">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
                      Recorded Payment Transactions ({selectedOrder.payments.length})
                    </p>
                    <div className="space-y-1.5">
                      {selectedOrder.payments.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between rounded-lg bg-white dark:bg-[#151D29] p-2 text-xs border border-stone-200/80 dark:border-stone-800"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-stone-900 dark:text-white">
                              {p.payment_method}
                            </span>
                            {p.reference_number && (
                              <span className="font-mono text-[11px] text-stone-500">
                                Ref: {p.reference_number}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-emerald-700 dark:text-emerald-400">
                              {formatCurrency(p.amount)}
                            </span>
                            <span className="text-[10px] text-stone-400">
                              {new Date(p.created_at || p.payment_date).toLocaleTimeString("en-IN", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* SPECIAL INSTRUCTIONS */}
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                  Kitchen Notes / Special Requests
                </label>
                {isOrderEditable ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={instructionText}
                      onChange={(e) => setInstructionText(e.target.value)}
                      placeholder="Add instructions..."
                      className="flex-1 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151D29] px-3 py-1.5 text-sm outline-none focus:border-[#F59E0B]"
                    />
                    <button
                      type="button"
                      onClick={handleSaveInstructions}
                      disabled={saving}
                      className="rounded-lg bg-stone-900 dark:bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-800 transition cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-stone-600 dark:text-stone-400 italic">
                    {selectedOrder.special_instructions || "No special instructions provided."}
                  </p>
                )}
              </div>

              {/* ORDERED ITEMS LIST (With Fixed ₹NaN fallback) */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-bold text-stone-900 dark:text-white text-sm">Ordered Dishes</h3>
                  {isOrderEditable && (
                    <span className="text-xs text-stone-500">
                      Dishes can be added or adjusted while in Ordered stage
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto rounded-lg border border-stone-200 dark:border-stone-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 dark:bg-stone-900/60 text-stone-600 dark:text-stone-400 font-semibold">
                      <tr>
                        <th className="px-3 py-2">Dish</th>
                        <th className="px-3 py-2">Unit Price</th>
                        <th className="px-3 py-2">Quantity</th>
                        <th className="px-3 py-2">Line Total</th>
                        {isOrderEditable && <th className="px-3 py-2 text-center">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                      {(selectedOrder.items || []).map((item) => {
                        const unitPrice = Number(item.unit_price ?? item.price_at_order ?? item.price ?? 0);
                        const lineTotal = Number(
                          item.line_total ?? unitPrice * (item.quantity || 1)
                        );

                        return (
                          <tr key={item.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/40">
                            <td className="px-3 py-2 font-medium text-stone-900 dark:text-white">
                              {item.item_name}
                            </td>
                            <td className="px-3 py-2 text-stone-600 dark:text-stone-300">
                              {formatCurrency(unitPrice)}
                            </td>
                            <td className="px-3 py-2 font-semibold text-stone-900 dark:text-white">
                              {item.quantity}
                            </td>
                            <td className="px-3 py-2 font-semibold text-stone-900 dark:text-white">
                              {formatCurrency(lineTotal)}
                            </td>
                            {isOrderEditable && (
                              <td className="px-3 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleOpenQuantityModal(item)}
                                  title="Edit quantity"
                                  className="mr-2 text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white p-1 cursor-pointer"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveOrderItem(item)}
                                  title="Remove dish"
                                  className="text-red-600 hover:text-red-800 p-1 cursor-pointer"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ADD ITEM TO EXISTING ORDER */}
                {isOrderEditable && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-[#101722] p-2.5">
                    <select
                      value={additionalItem}
                      onChange={(e) => setAdditionalItem(e.target.value)}
                      className="flex-1 min-w-[180px] rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151D29] px-2.5 py-1.5 text-xs text-stone-900 dark:text-white outline-none focus:border-[#F59E0B]"
                    >
                      <option value="">Add another dish to order...</option>
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
                      onChange={(e) =>
                        setAdditionalQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))
                      }
                      className="w-16 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151D29] px-2 py-1.5 text-center text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleAddExistingItem}
                      disabled={!additionalItem || saving}
                      className="rounded-lg bg-stone-900 dark:bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-800 transition cursor-pointer"
                    >
                      Add Dish
                    </button>
                  </div>
                )}
              </div>

              {/* WORKFLOW AUDIT TRAIL */}
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                  Lifecycle Audit Trail
                </h4>
                <div className="space-y-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-[#101722] p-3 max-h-40 overflow-y-auto">
                  {selectedOrder.status_history && selectedOrder.status_history.length > 0 ? (
                    selectedOrder.status_history.map((hist, idx) => (
                      <div
                        key={hist.id || idx}
                        className="flex items-start justify-between border-b border-stone-100 dark:border-stone-800 pb-2 text-xs last:border-b-0 last:pb-0"
                      >
                        <div>
                          <span className="font-semibold text-stone-800 dark:text-stone-200">
                            {hist.previous_status
                              ? `${getWorkflowStageLabel(hist.previous_status)} → `
                              : ""}
                            {getWorkflowStageLabel(hist.new_status)}
                          </span>
                          {hist.notes && (
                            <p className="text-stone-600 dark:text-stone-400 mt-0.5 italic">
                              {hist.notes}
                            </p>
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
                    <p className="text-xs text-stone-500">No transitions recorded.</p>
                  )}
                </div>
              </div>

              {/* MODAL FOOTER */}
              <div className="flex justify-between items-center pt-3 border-t border-stone-200 dark:border-stone-800">
                {selectedOrder.status === "Completed" && (
                  <button
                    type="button"
                    onClick={() => {
                      closeOrderDetails();
                      navigate("/invoices");
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F59E0B] hover:underline cursor-pointer"
                  >
                    <Receipt size={14} />
                    <span>View / Share Invoice in Invoices</span>
                  </button>
                )}
                <div className="ml-auto">
                  <button
                    type="button"
                    onClick={closeOrderDetails}
                    className="rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151D29] px-4 py-2 text-sm font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-50 transition cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </ModalShell>
      )}

      {/* =====================================
          EDIT DISH QUANTITY MODAL
      ===================================== */}
      {quantityModal && (
        <ModalShell
          title="Update Dish Quantity"
          subtitle={`Adjust quantity for "${quantityModal.item?.item_name}".`}
          onClose={() => setQuantityModal(null)}
          size="max-w-sm"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
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
                className="w-full rounded-lg border border-stone-300 dark:border-stone-700 px-3 py-2 text-sm outline-none focus:border-[#F59E0B]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuantityModal(null)}
                className="rounded-lg border border-stone-300 dark:border-stone-700 px-3 py-1.5 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveQuantity}
                disabled={saving}
                className="rounded-lg bg-[#F59E0B] px-4 py-1.5 text-xs font-bold text-stone-900 hover:bg-[#E5A910]"
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
  const modalSize =
    size.includes("4xl") || size.includes("3xl")
      ? "lg"
      : size.includes("lg") || size.includes("2xl")
      ? "md"
      : "sm";

  return (
    <Modal isOpen={true} title={title} subtitle={subtitle} onClose={onClose} size={modalSize}>
      {children}
    </Modal>
  );
}
