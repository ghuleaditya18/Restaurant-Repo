import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ShoppingCart,
  ClipboardList,
  Plus,
  Search,
  Eye,
  X,
  Pencil,
  RefreshCw,
  Minus,
  Trash2,
  Utensils,
  Users,
  Armchair,
  Clock,
  CheckCircle2,
  ChefHat,
  Receipt,
  ArrowRight,
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

// ==========================================
// CONSTANTS
// ==========================================

const ORDER_STATUSES = [
  "Pending",
  "Confirmed",
  "Preparing",
  "Ready",
  "Served",
  "Completed",
  "Cancelled",
];

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
    Pending: "bg-[#FFF3DB] text-[#956719]",
    Confirmed: "bg-[#F5E5DC] text-[#A94B2B]",
    Preparing: "bg-[#F3EBDD] text-[#846C37]",
    Ready: "bg-[#E8EDE5] text-[#52684A]",
    Served: "bg-[#E8EDE5] text-[#52684A]",
    Completed: "bg-[#EEEAE4] text-[#5E554D]",
    Cancelled: "bg-[#F4E6E2] text-[#A14E3C]",
  };

  return styles[status] || "bg-gray-100 text-gray-600";
};

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [tables, setTables] = useState([]);
  const [menuItems, setMenuItems] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");

  // Order modification
  const [instructionText, setInstructionText] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [statusTarget, setStatusTarget] = useState("");

  const [additionalItem, setAdditionalItem] = useState("");
  const [additionalQuantity, setAdditionalQuantity] = useState(1);

  // Search and filter
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Notifications
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // ==========================================
  // LOAD ALL DATA
  // ==========================================

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError("");

    try {
      const [orderData, customerData, tableData, menuData] = await Promise.all([
        getAllOrders(),
        getOrderCustomers(),
        getOrderTables(),
        getOrderMenuItems(),
      ]);

      setOrders(orderData);
      setCustomers(customerData);
      setTables(tableData);
      setMenuItems(menuData);
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ==========================================
  // STATISTICS
  // ==========================================

  const pendingCount = orders.filter(
    (order) => order.status === "Pending",
  ).length;

  const preparingCount = orders.filter(
    (order) => order.status === "Preparing",
  ).length;

  const completedCount = orders.filter(
    (order) => order.status === "Completed",
  ).length;

  const activeCount = orders.filter(
    (order) => !["Completed", "Cancelled"].includes(order.status),
  ).length;

  // ==========================================
  // SEARCH AND FILTER
  // ==========================================

  const filteredOrders = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesSearch =
        order.order_number.toLowerCase().includes(searchValue) ||
        order.customer_name.toLowerCase().includes(searchValue) ||
        String(order.table_number).toLowerCase().includes(searchValue);

      const matchesStatus =
        statusFilter === "ALL" || order.status.toUpperCase() === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  // ==========================================
  // CREATE ORDER FORM
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

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // ==========================================
  // CART MANAGEMENT
  // ==========================================

  const handleAddToCart = () => {
    const menuItem = menuItems.find(
      (item) => item.id === Number(selectedMenuItem),
    );

    if (!menuItem) {
      setFormError("Please select a menu item.");
      return;
    }

    if (!Number.isInteger(Number(itemQuantity)) || Number(itemQuantity) < 1) {
      setFormError("Quantity must be at least 1.");
      return;
    }

    setFormError("");

    setCart((previous) => {
      const existing = previous.find(
        (item) => item.menu_item_id === menuItem.id,
      );

      if (existing) {
        return previous.map((item) =>
          item.menu_item_id === menuItem.id
            ? {
                ...item,
                quantity: item.quantity + Number(itemQuantity),
              }
            : item,
        );
      }

      return [
        ...previous,
        {
          menu_item_id: menuItem.id,
          name: menuItem.name,
          price: Number(menuItem.price),
          quantity: Number(itemQuantity),
        },
      ];
    });

    setSelectedMenuItem("");
    setItemQuantity(1);
  };

  const changeCartQuantity = (menuItemId, change) => {
    setCart((previous) =>
      previous
        .map((item) =>
          item.menu_item_id === menuItemId
            ? {
                ...item,
                quantity: item.quantity + change,
              }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const removeCartItem = (menuItemId) => {
    setCart((previous) =>
      previous.filter((item) => item.menu_item_id !== menuItemId),
    );
  };

  const cartSubtotal = cart.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  );

  // ==========================================
  // CREATE ORDER
  // ==========================================

  const handleCreateOrder = async (event) => {
    event.preventDefault();

    if (cart.length === 0) {
      setFormError("Please add at least one menu item.");
      return;
    }

    if (!form.customer_id || !form.table_id) {
      setFormError("Please select a customer and restaurant table.");
      return;
    }

    setSaving(true);
    setFormError("");

    const orderData = {
      customer_id: Number(form.customer_id),
      table_id: Number(form.table_id),

      special_instructions: form.special_instructions.trim() || null,

      items: cart.map((item) => ({
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
      })),
    };

    try {
      await createOrder(orderData);

      closeCreateModal();

      setSuccessMessage("New restaurant order created successfully.");

      await loadData();
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // OPEN ORDER DETAILS
  // ==========================================

  const openOrderDetails = async (order) => {
    setShowDetailsModal(true);
    setSelectedOrder(null);
    setDetailsError("");
    setDetailsLoading(true);

    setStatusNote("");
    setStatusTarget("");

    try {
      const data = await getOrderById(order.id);

      setSelectedOrder(data);
      setInstructionText(data.special_instructions || "");
    } catch (error) {
      setDetailsError(getErrorMessage(error));
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeDetailsModal = () => {
    setShowDetailsModal(false);
    setSelectedOrder(null);
    setDetailsError("");
    setStatusTarget("");
  };

  const refreshSelectedOrder = async () => {
    if (!selectedOrder) return;

    const data = await getOrderById(selectedOrder.id);

    setSelectedOrder(data);
    setOrders((previous) =>
      previous.map((order) => (order.id === data.id ? data : order)),
    );
  };

  // ==========================================
  // UPDATE ORDER INSTRUCTIONS
  // ==========================================

  const handleUpdateInstructions = async () => {
    if (!selectedOrder) return;

    setSaving(true);
    setDetailsError("");

    try {
      await updateOrder(selectedOrder.id, {
        special_instructions: instructionText.trim() || null,
      });

      await refreshSelectedOrder();

      setSuccessMessage("Order instructions updated successfully.");
    } catch (error) {
      setDetailsError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // CHANGE ORDER STATUS
  // ==========================================

  const handleStatusUpdate = async () => {
    if (!selectedOrder || !statusTarget) {
      return;
    }

    setSaving(true);
    setDetailsError("");

    try {
      await updateOrderStatus(selectedOrder.id, {
        status: statusTarget,
        note: statusNote.trim() || null,
      });

      await refreshSelectedOrder();

      setStatusTarget("");
      setStatusNote("");

      setSuccessMessage(
        `Order ${selectedOrder.order_number} updated successfully.`,
      );

      await loadData();
    } catch (error) {
      setDetailsError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // ADD ITEM TO EXISTING ORDER
  // ==========================================

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

      setSuccessMessage("Item added to order successfully.");
    } catch (error) {
      setDetailsError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // UPDATE ORDER ITEM QUANTITY
  // ==========================================

  const handleUpdateItemQuantity = async (item) => {
    const newQuantity = Number(
      window.prompt("Enter new quantity:", item.quantity),
    );

    if (!Number.isInteger(newQuantity) || newQuantity < 1) {
      return;
    }

    setSaving(true);

    try {
      await updateOrderItem(selectedOrder.id, item.id, {
        quantity: newQuantity,
      });

      await refreshSelectedOrder();

      setSuccessMessage("Item quantity updated successfully.");
    } catch (error) {
      setDetailsError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // REMOVE ITEM FROM ORDER
  // ==========================================

  const handleRemoveOrderItem = async (item) => {
    const confirmed = window.confirm(
      `Remove ${item.item_name} from this order?`,
    );

    if (!confirmed) return;

    setSaving(true);

    try {
      await removeOrderItem(selectedOrder.id, item.id);

      await refreshSelectedOrder();

      setSuccessMessage("Order item removed successfully.");
    } catch (error) {
      setDetailsError(getErrorMessage(error));
    } finally {
      setSaving(false);
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
            Restaurant Operations
          </p>

          <h1 className="text-2xl font-semibold text-[#29231F] md:text-3xl">
            Order Management
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Manage restaurant orders and preparation status.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 rounded-lg bg-[#C65D35] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#A94B2B]"
        >
          <Plus size={18} />
          Create New Order
        </button>
      </div>

      {/* NOTIFICATIONS */}

      {successMessage && (
        <Notification
          message={successMessage}
          onClose={() => setSuccessMessage("")}
        />
      )}

      {pageError && <ErrorBox message={pageError} />}

      {/* SUMMARY CARDS */}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Total Orders"
          value={orders.length}
          icon={<ClipboardList size={19} />}
          active={statusFilter === "ALL"}
          onClick={() => setStatusFilter("ALL")}
        />

        <SummaryCard
          title="Pending Orders"
          value={pendingCount}
          icon={<Clock size={19} />}
          active={statusFilter === "PENDING"}
          onClick={() => setStatusFilter("PENDING")}
        />

        <SummaryCard
          title="Preparing"
          value={preparingCount}
          icon={<ChefHat size={19} />}
          active={statusFilter === "PREPARING"}
          onClick={() => setStatusFilter("PREPARING")}
        />

        <SummaryCard
          title="Active Orders"
          value={activeCount}
          icon={<ShoppingCart size={19} />}
          active={false}
          onClick={() => {
            setStatusFilter("ACTIVE");
          }}
        />
      </div>

      {/* ORDER TABLE */}

      <div className="overflow-hidden rounded-xl border border-[#E9E3DA] bg-white">
        <div className="flex flex-col gap-4 border-b border-[#EEE9E2] p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-[#29231F]">Restaurant Orders</h2>

            <p className="mt-1 text-xs text-gray-500">
              {filteredOrders.length} orders found
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search order or customer..."
                className="w-full rounded-lg border border-[#E9E3DA] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#C65D35] sm:w-64"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-lg border border-[#E9E3DA] px-3 py-2.5 text-sm outline-none focus:border-[#C65D35]"
            >
              <option value="ALL">All Orders</option>
              <option value="PENDING">Pending</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="PREPARING">Preparing</option>
              <option value="READY">Ready</option>
              <option value="SERVED">Served</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="ACTIVE">All Active</option>
            </select>

            <button
              onClick={loadData}
              disabled={loading}
              title="Refresh orders"
              className="flex items-center justify-center rounded-lg border border-[#E9E3DA] px-3 py-2.5 text-gray-600 hover:bg-[#F7F5F0]"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left">
            <thead className="bg-[#FAF9F6] text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Order Number</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Table</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Subtotal</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F0ECE6]">
              {loading ? (
                <tr>
                  <td
                    colSpan="7"
                    className="px-4 py-12 text-center text-sm text-gray-500"
                  >
                    Loading orders...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan="7"
                    className="px-4 py-12 text-center text-sm text-gray-500"
                  >
                    No orders found.
                  </td>
                </tr>
              ) : (
                filteredOrders
                  .filter((order) => {
                    return (
                      statusFilter !== "ACTIVE" ||
                      !["Completed", "Cancelled"].includes(order.status)
                    );
                  })
                  .map((order) => (
                    <tr
                      key={order.id}
                      className="transition hover:bg-[#FAF9F6]"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#29231F]">
                          {order.order_number}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          Order ID: {order.id}
                        </p>
                      </td>

                      <td className="px-4 py-3 text-sm text-gray-600">
                        {order.customer_name}
                      </td>

                      <td className="px-4 py-3 text-sm text-gray-600">
                        Table {order.table_number}
                      </td>

                      <td className="px-4 py-3 text-sm text-gray-600">
                        {order.items.length} items
                      </td>

                      <td className="px-4 py-3 text-sm font-semibold text-[#29231F]">
                        {formatCurrency(order.subtotal)}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusStyle(order.status)}`}
                        >
                          {order.status}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openOrderDetails(order)}
                          title="View order details"
                          className="rounded-lg p-2 text-[#29231F] hover:bg-[#F5E5DC] hover:text-[#C65D35]"
                        >
                          <Eye size={17} />
                        </button>
                      </td>
                    </tr>
                  ))
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
            {formError && <ErrorBox message={formError} />}

            {/* CUSTOMER AND TABLE */}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#29231F]">
                  Customer
                </label>

                <select
                  name="customer_id"
                  value={form.customer_id}
                  onChange={handleFormChange}
                  required
                  className="w-full rounded-lg border border-[#E9E3DA] px-3 py-2.5 text-sm outline-none focus:border-[#C65D35]"
                >
                  <option value="">Select customer</option>

                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.full_name} – {customer.phone}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#29231F]">
                  Restaurant Table
                </label>

                <select
                  name="table_id"
                  value={form.table_id}
                  onChange={handleFormChange}
                  required
                  className="w-full rounded-lg border border-[#E9E3DA] px-3 py-2.5 text-sm outline-none focus:border-[#C65D35]"
                >
                  <option value="">Select table</option>

                  {tables.map((table) => (
                    <option key={table.id} value={table.id}>
                      Table {table.table_number} – {table.capacity} seats (
                      {table.status})
                    </option>
                  ))}
                </select>

                <p className="mt-1 text-xs text-gray-500">
                  Occupied tables can also receive additional independent
                  orders.
                </p>
              </div>
            </div>

            {/* ADD MENU ITEMS */}

            <div className="rounded-lg border border-[#E9E3DA] bg-[#FAF9F6] p-4">
              <h3 className="mb-3 font-semibold text-[#29231F]">
                Add Menu Items
              </h3>

              <div className="flex flex-col gap-3 sm:flex-row">
                <select
                  value={selectedMenuItem}
                  onChange={(event) => setSelectedMenuItem(event.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-[#E9E3DA] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#C65D35]"
                >
                  <option value="">Select food item</option>

                  {menuItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} – {formatCurrency(item.price)}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  min="1"
                  value={itemQuantity}
                  onChange={(event) => setItemQuantity(event.target.value)}
                  className="w-full rounded-lg border border-[#E9E3DA] bg-white px-3 py-2.5 text-sm sm:w-24"
                />

                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="flex items-center justify-center gap-2 rounded-lg bg-[#C65D35] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#A94B2B]"
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>

              {/* CART */}

              <div className="mt-4 space-y-2">
                {cart.length === 0 ? (
                  <p className="py-5 text-center text-sm text-gray-500">
                    No items added yet.
                  </p>
                ) : (
                  cart.map((item) => (
                    <div
                      key={item.menu_item_id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#29231F]">
                          {item.name}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {formatCurrency(item.price)} each
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            changeCartQuantity(item.menu_item_id, -1)
                          }
                          className="rounded-md border border-[#E9E3DA] p-1.5"
                        >
                          <Minus size={14} />
                        </button>

                        <span className="w-5 text-center text-sm font-medium">
                          {item.quantity}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            changeCartQuantity(item.menu_item_id, 1)
                          }
                          className="rounded-md border border-[#E9E3DA] p-1.5"
                        >
                          <Plus size={14} />
                        </button>

                        <button
                          type="button"
                          onClick={() => removeCartItem(item.menu_item_id)}
                          className="rounded-md p-1.5 text-[#A94B2B] hover:bg-[#F5E5DC]"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      <p className="w-full text-right text-sm font-semibold text-[#29231F] sm:w-auto">
                        {formatCurrency(item.price * item.quantity)}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 flex justify-between border-t border-[#E9E3DA] pt-4">
                <span className="font-medium text-[#29231F]">
                  Order Subtotal
                </span>

                <span className="text-lg font-semibold text-[#C65D35]">
                  {formatCurrency(cartSubtotal)}
                </span>
              </div>
            </div>

            {/* SPECIAL INSTRUCTIONS */}

            <div>
              <label className="mb-2 block text-sm font-medium text-[#29231F]">
                Special Instructions
              </label>

              <textarea
                name="special_instructions"
                value={form.special_instructions}
                onChange={handleFormChange}
                rows={2}
                placeholder="Any special preparation instructions..."
                className="w-full resize-none rounded-lg border border-[#E9E3DA] px-3 py-2.5 text-sm outline-none focus:border-[#C65D35]"
              />
            </div>

            {/* BUTTONS */}

            <div className="flex justify-end gap-3 border-t border-[#EEE9E2] pt-4">
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-lg border border-[#E9E3DA] px-4 py-2.5 text-sm text-gray-600"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving || cart.length === 0}
                className="rounded-lg bg-[#C65D35] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#A94B2B] disabled:opacity-60"
              >
                {saving ? "Creating..." : "Create Order"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* =====================================
          ORDER DETAILS MODAL
      ===================================== */}

      {showDetailsModal && (
        <ModalShell
          title="Order Details"
          subtitle="View and manage individual restaurant orders."
          onClose={closeDetailsModal}
          size="max-w-3xl"
        >
          {detailsLoading ? (
            <p className="py-10 text-center text-sm text-gray-500">
              Loading order details...
            </p>
          ) : detailsError ? (
            <ErrorBox message={detailsError} />
          ) : (
            selectedOrder && (
              <div className="space-y-5">
                {/* ORDER HEADER */}

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#F7F5F0] p-4">
                  <div>
                    <h3 className="font-semibold text-[#29231F]">
                      {selectedOrder.order_number}
                    </h3>

                    <p className="mt-1 text-xs text-gray-500">
                      Order ID: {selectedOrder.id}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${getStatusStyle(selectedOrder.status)}`}
                  >
                    {selectedOrder.status}
                  </span>
                </div>

                {/* CUSTOMER AND TABLE */}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <DetailItem
                    label="Customer"
                    value={selectedOrder.customer_name}
                  />

                  <DetailItem
                    label="Restaurant Table"
                    value={`Table ${selectedOrder.table_number}`}
                  />
                </div>

                {/* ORDER ITEMS */}

                <div>
                  <h3 className="mb-3 font-semibold text-[#29231F]">
                    Ordered Items
                  </h3>

                  <div className="overflow-x-auto rounded-lg border border-[#E9E3DA]">
                    <table className="w-full min-w-[500px] text-left">
                      <thead className="bg-[#FAF9F6] text-xs uppercase text-gray-500">
                        <tr>
                          <th className="px-3 py-3">Item</th>
                          <th className="px-3 py-3">Qty</th>
                          <th className="px-3 py-3">Unit Price</th>
                          <th className="px-3 py-3">Total</th>
                          <th className="px-3 py-3">Action</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-[#F0ECE6]">
                        {selectedOrder.items.map((item) => (
                          <tr key={item.id}>
                            <td className="px-3 py-3 text-sm font-medium text-[#29231F]">
                              {item.item_name}
                            </td>

                            <td className="px-3 py-3 text-sm">
                              {item.quantity}
                            </td>

                            <td className="px-3 py-3 text-sm">
                              {formatCurrency(item.unit_price)}
                            </td>

                            <td className="px-3 py-3 text-sm font-semibold">
                              {formatCurrency(item.line_total)}
                            </td>

                            <td className="px-3 py-3">
                              {["Pending", "Confirmed"].includes(
                                selectedOrder.status,
                              ) && (
                                <div className="flex gap-1">
                                  <button
                                    disabled={saving}
                                    onClick={() =>
                                      handleUpdateItemQuantity(item)
                                    }
                                    title="Update quantity"
                                    className="rounded-md p-1.5 hover:bg-[#F5E5DC]"
                                  >
                                    <Pencil size={14} />
                                  </button>

                                  <button
                                    disabled={
                                      saving || selectedOrder.items.length <= 1
                                    }
                                    onClick={() => handleRemoveOrderItem(item)}
                                    title="Remove item"
                                    className="rounded-md p-1.5 text-[#A94B2B] hover:bg-[#F5E5DC] disabled:opacity-30"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 flex justify-between rounded-lg bg-[#F7F5F0] p-4">
                    <span className="font-semibold text-[#29231F]">
                      Subtotal
                    </span>

                    <span className="text-lg font-semibold text-[#C65D35]">
                      {formatCurrency(selectedOrder.subtotal)}
                    </span>
                  </div>
                </div>

                {/* ADD ITEM TO EXISTING ORDER */}

                {["Pending", "Confirmed"].includes(selectedOrder.status) && (
                  <div className="rounded-lg border border-[#E9E3DA] p-4">
                    <h3 className="mb-3 font-semibold text-[#29231F]">
                      Add More Items
                    </h3>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <select
                        value={additionalItem}
                        onChange={(event) =>
                          setAdditionalItem(event.target.value)
                        }
                        className="min-w-0 flex-1 rounded-lg border border-[#E9E3DA] px-3 py-2.5 text-sm"
                      >
                        <option value="">Select menu item</option>

                        {menuItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} – {formatCurrency(item.price)}
                          </option>
                        ))}
                      </select>

                      <input
                        type="number"
                        min="1"
                        value={additionalQuantity}
                        onChange={(event) =>
                          setAdditionalQuantity(event.target.value)
                        }
                        className="w-full rounded-lg border border-[#E9E3DA] px-3 py-2.5 text-sm sm:w-24"
                      />

                      <button
                        onClick={handleAddExistingItem}
                        disabled={saving}
                        className="rounded-lg bg-[#C65D35] px-4 py-2.5 text-sm text-white hover:bg-[#A94B2B] disabled:opacity-60"
                      >
                        Add Item
                      </button>
                    </div>
                  </div>
                )}

                {/* SPECIAL INSTRUCTIONS */}

                <div>
                  <label className="mb-2 block text-sm font-medium text-[#29231F]">
                    Special Instructions
                  </label>

                  <textarea
                    value={instructionText}
                    onChange={(event) => setInstructionText(event.target.value)}
                    rows={2}
                    disabled={
                      !["Pending", "Confirmed"].includes(selectedOrder.status)
                    }
                    className="w-full resize-none rounded-lg border border-[#E9E3DA] px-3 py-2.5 text-sm outline-none focus:border-[#C65D35] disabled:bg-gray-50"
                  />

                  {["Pending", "Confirmed"].includes(selectedOrder.status) && (
                    <button
                      onClick={handleUpdateInstructions}
                      disabled={saving}
                      className="mt-2 rounded-lg border border-[#C65D35] px-4 py-2 text-sm font-medium text-[#C65D35]"
                    >
                      Save Instructions
                    </button>
                  )}
                </div>

                {/* STATUS MANAGEMENT */}

                <div className="rounded-lg border border-[#E9E3DA] p-4">
                  <h3 className="mb-3 font-semibold text-[#29231F]">
                    Update Order Status
                  </h3>

                  {STATUS_TRANSITIONS[selectedOrder.status].length === 0 ? (
                    <p className="text-sm text-gray-500">
                      This order has reached its final status.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <select
                        value={statusTarget}
                        onChange={(event) =>
                          setStatusTarget(event.target.value)
                        }
                        className="w-full rounded-lg border border-[#E9E3DA] px-3 py-2.5 text-sm"
                      >
                        <option value="">Select next status</option>

                        {STATUS_TRANSITIONS[selectedOrder.status].map(
                          (status) => (
                            <option key={status} value={status}>
                              {status}
                              {status === "Completed"
                                ? " (Invoice required)"
                                : ""}
                            </option>
                          ),
                        )}
                      </select>

                      <input
                        value={statusNote}
                        onChange={(event) => setStatusNote(event.target.value)}
                        placeholder="Status update note (optional)"
                        className="w-full rounded-lg border border-[#E9E3DA] px-3 py-2.5 text-sm"
                      />

                      <button
                        onClick={handleStatusUpdate}
                        disabled={!statusTarget || saving}
                        className="flex items-center justify-center gap-2 rounded-lg bg-[#C65D35] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#A94B2B] disabled:opacity-50"
                      >
                        Update Status
                        <ArrowRight size={16} />
                      </button>

                      {selectedOrder.status === "Served" && (
                        <p className="text-xs text-gray-500">
                          An invoice must be generated before this order can be
                          completed.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* STATUS HISTORY */}

                <div>
                  <h3 className="mb-3 font-semibold text-[#29231F]">
                    Order Status History
                  </h3>

                  <div className="space-y-3">
                    {selectedOrder.status_history.map((history) => (
                      <div
                        key={history.id}
                        className="flex gap-3 rounded-lg bg-[#FAF9F6] p-3"
                      >
                        <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#C65D35]" />

                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#29231F]">
                            {history.previous_status
                              ? `${history.previous_status} → ${history.new_status}`
                              : history.new_status}
                          </p>

                          <p className="mt-1 text-xs text-gray-500">
                            {history.note || "Status updated"}
                          </p>

                          <p className="mt-1 text-xs text-gray-400">
                            {new Date(history.changed_at).toLocaleString(
                              "en-IN",
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
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

function ModalShell({ title, subtitle, onClose, children, size = "max-w-xl" }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div
        className={`my-auto max-h-[92vh] w-full ${size} overflow-y-auto rounded-xl bg-white shadow-xl`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#EEE9E2] bg-white px-5 py-4">
          <div>
            <h2 className="font-semibold text-[#29231F]">{title}</h2>
            <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">{children}</div>
      </div>
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

function ErrorBox({ message }) {
  return (
    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

function Notification({ message, onClose }) {
  return (
    <div className="mb-4 flex items-center justify-between rounded-lg border border-[#E9D6C8] bg-[#FFF9F5] px-4 py-3 text-sm text-[#A94B2B]">
      {message}

      <button onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}
