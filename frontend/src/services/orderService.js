import api from "./api";

// ==========================================
// ORDER LOOKUP SERVICES
// ==========================================

export const getOrderCustomers = async () => {
  const response = await api.get("/api/orders/lookups/customers");
  return response.data;
};

export const getOrderTables = async () => {
  const response = await api.get("/api/orders/lookups/tables");
  return response.data;
};

export const getOrderMenuItems = async () => {
  const response = await api.get("/api/orders/lookups/menu-items");
  return response.data;
};

// ==========================================
// ORDER SERVICES
// ==========================================

export const getAllOrders = async (params = {}) => {
  const response = await api.get("/api/orders/", { params });
  return response.data;
};

export const getOrderById = async (orderId) => {
  const response = await api.get(`/api/orders/${orderId}`);
  return response.data;
};

export const createOrder = async (orderData) => {
  const response = await api.post("/api/orders/", orderData);
  return response.data;
};

export const updateOrder = async (orderId, orderData) => {
  const response = await api.patch(`/api/orders/${orderId}`, orderData);

  return response.data;
};

// ==========================================
// ORDER ITEM SERVICES
// ==========================================

export const addOrderItem = async (orderId, itemData) => {
  const response = await api.post(`/api/orders/${orderId}/items/`, itemData);

  return response.data;
};

export const updateOrderItem = async (orderId, orderItemId, itemData) => {
  const response = await api.patch(
    `/api/orders/${orderId}/items/${orderItemId}`,
    itemData,
  );

  return response.data;
};

export const removeOrderItem = async (orderId, orderItemId) => {
  const response = await api.delete(
    `/api/orders/${orderId}/items/${orderItemId}`,
  );

  return response.data;
};

// ==========================================
// ORDER STATUS SERVICE
// ==========================================

export const updateOrderStatus = async (orderId, statusData) => {
  const response = await api.patch(`/api/orders/${orderId}/status`, statusData);

  return response.data;
};

// ==========================================
// ORDER PAYMENT & ARCHIVE SERVICES
// ==========================================

export const recordOrderPayment = async (orderId, paymentData) => {
  const response = await api.post(`/api/orders/${orderId}/payments`, paymentData);
  return response.data;
};

export const bulkArchiveOrders = async (archiveData) => {
  const response = await api.post("/api/orders/bulk-archive", archiveData);
  return response.data;
};

export const restoreOrder = async (orderId) => {
  const response = await api.post(`/api/orders/${orderId}/restore`);
  return response.data;
};
