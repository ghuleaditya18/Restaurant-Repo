import api from "./api";

// ==========================================
// 1. INVENTORY CATEGORIES
// ==========================================

export const getCategories = async (params = {}) => {
  const response = await api.get("/api/inventory/categories", { params });
  return response.data;
};

export const createCategory = async (data) => {
  const response = await api.post("/api/inventory/categories", data);
  return response.data;
};

export const updateCategory = async (id, data) => {
  const response = await api.patch(`/api/inventory/categories/${id}`, data);
  return response.data;
};

export const deleteCategory = async (id) => {
  const response = await api.delete(`/api/inventory/categories/${id}`);
  return response.data;
};

// ==========================================
// 2. INVENTORY ITEMS (MASTER)
// ==========================================

export const getInventoryItems = async (params = {}) => {
  const response = await api.get("/api/inventory/items", { params });
  return response.data;
};

export const createInventoryItem = async (data) => {
  const response = await api.post("/api/inventory/items", data);
  return response.data;
};

export const getInventoryItem = async (id) => {
  const response = await api.get(`/api/inventory/items/${id}`);
  return response.data;
};

export const updateInventoryItem = async (id, data) => {
  const response = await api.patch(`/api/inventory/items/${id}`, data);
  return response.data;
};

export const updateItemStatus = async (id, isActive) => {
  const response = await api.patch(`/api/inventory/items/${id}/status`, { is_active: isActive });
  return response.data;
};

export const addOpeningStock = async (id, data) => {
  const response = await api.post(`/api/inventory/items/${id}/opening-stock`, data);
  return response.data;
};

export const getItemMovements = async (id, params = {}) => {
  const response = await api.get(`/api/inventory/items/${id}/movements`, { params });
  return response.data;
};

// ==========================================
// 3. SUPPLIERS & SUPPLIER ITEMS
// ==========================================

export const getSuppliers = async (params = {}) => {
  const response = await api.get("/api/inventory/suppliers", { params });
  return response.data;
};

export const createSupplier = async (data) => {
  const response = await api.post("/api/inventory/suppliers", data);
  return response.data;
};

export const getSupplier = async (id) => {
  const response = await api.get(`/api/inventory/suppliers/${id}`);
  return response.data;
};

export const updateSupplier = async (id, data) => {
  const response = await api.patch(`/api/inventory/suppliers/${id}`, data);
  return response.data;
};

export const getSupplierItems = async (supplierId) => {
  const response = await api.get(`/api/inventory/suppliers/${supplierId}/items`);
  return response.data;
};

export const addSupplierItem = async (supplierId, data) => {
  const response = await api.post(`/api/inventory/suppliers/${supplierId}/items`, data);
  return response.data;
};

export const removeSupplierItem = async (supplierId, supplierItemId) => {
  const response = await api.delete(`/api/inventory/suppliers/${supplierId}/items/${supplierItemId}`);
  return response.data;
};

// ==========================================
// 4. RECIPES (BILL OF MATERIALS)
// ==========================================

export const getRecipes = async () => {
  const response = await api.get("/api/inventory/recipes");
  return response.data;
};

export const getRecipeByMenuItem = async (menuItemId) => {
  const response = await api.get(`/api/inventory/recipes/menu/${menuItemId}`);
  return response.data;
};

export const createOrUpdateRecipe = async (menuItemId, data) => {
  const response = await api.put(`/api/inventory/recipes/menu/${menuItemId}`, data);
  return response.data;
};

export const deleteRecipe = async (menuItemId) => {
  const response = await api.delete(`/api/inventory/recipes/menu/${menuItemId}`);
  return response.data;
};

// ==========================================
// 5. PURCHASES & GOODS RECEIPTS (GRN)
// ==========================================

export const getPurchaseOrders = async (params = {}) => {
  const response = await api.get("/api/inventory/purchase-orders", { params });
  return response.data;
};

export const createPurchaseOrder = async (data) => {
  const response = await api.post("/api/inventory/purchase-orders", data);
  return response.data;
};

export const getPurchaseOrder = async (id) => {
  const response = await api.get(`/api/inventory/purchase-orders/${id}`);
  return response.data;
};

export const updatePurchaseOrder = async (id, data) => {
  const response = await api.put(`/api/inventory/purchase-orders/${id}`, data);
  return response.data;
};

export const deletePurchaseOrder = async (id) => {
  const response = await api.delete(`/api/inventory/purchase-orders/${id}`);
  return response.data;
};

export const updatePOStatus = async (id, status, notes = null) => {
  const response = await api.patch(`/api/inventory/purchase-orders/${id}/status`, { status, notes });
  return response.data;
};

export const receiveGoods = async (poId, data) => {
  const response = await api.post(`/api/inventory/purchase-orders/${poId}/receive`, data);
  return response.data;
};

export const getGoodsReceipts = async () => {
  const response = await api.get("/api/inventory/goods-receipts");
  return response.data;
};

export const getGoodsReceipt = async (id) => {
  const response = await api.get(`/api/inventory/goods-receipts/${id}`);
  return response.data;
};

export const uploadGrnBill = async (grnId, file) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post(`/api/inventory/goods-receipts/${grnId}/bill`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

// ==========================================
// 6. WASTAGE & ADJUSTMENTS
// ==========================================

export const recordWastage = async (data) => {
  const response = await api.post("/api/inventory/wastage", data);
  return response.data;
};

export const recordAdjustment = async (data) => {
  const response = await api.post("/api/inventory/adjustments", data);
  return response.data;
};

export const getAllMovements = async (params = {}) => {
  const response = await api.get("/api/inventory/movements", { params });
  return response.data;
};

export const reverseStockMovement = async (movementId, reason) => {
  const response = await api.post(`/api/inventory/movements/${movementId}/reverse`, { reason });
  return response.data;
};

// ==========================================
// 7. PHYSICAL STOCK COUNT AUDITS
// ==========================================

export const getStockCounts = async () => {
  const response = await api.get("/api/inventory/stock-counts");
  return response.data;
};

export const startStockCount = async (data) => {
  const response = await api.post("/api/inventory/stock-counts", data);
  return response.data;
};

export const getStockCount = async (id) => {
  const response = await api.get(`/api/inventory/stock-counts/${id}`);
  return response.data;
};

export const submitStockCount = async (id, counts) => {
  const response = await api.post(`/api/inventory/stock-counts/${id}/submit`, { counts });
  return response.data;
};

export const approveStockCount = async (id) => {
  const response = await api.post(`/api/inventory/stock-counts/${id}/approve`);
  return response.data;
};

export const cancelStockCount = async (id) => {
  const response = await api.post(`/api/inventory/stock-counts/${id}/cancel`);
  return response.data;
};

// ==========================================
// 8. REPORTS
// ==========================================

export const getStockValuationReport = async () => {
  const response = await api.get("/api/inventory/reports/stock-valuation");
  return response.data;
};

export const getConsumptionReport = async (params = {}) => {
  const response = await api.get("/api/inventory/reports/consumption", { params });
  return response.data;
};

export const getWastageReport = async (params = {}) => {
  const response = await api.get("/api/inventory/reports/wastage", { params });
  return response.data;
};

export const getFoodCostReport = async () => {
  const response = await api.get("/api/inventory/reports/food-cost");
  return response.data;
};

export const getReconciliationReport = async () => {
  const response = await api.get("/api/inventory/reports/reconciliation");
  return response.data;
};

// ==========================================
// 9. MENU DISH AVAILABILITY
// ==========================================

export const checkDishAvailability = async (menuItemId) => {
  const response = await api.get(`/api/inventory/menu/${menuItemId}/availability`);
  return response.data;
};
