import api from "./api";

// ================================
// MENU CATEGORY SERVICES
// ================================

export const getMenuCategories = async () => {
  const response = await api.get("/api/menu/categories/");
  return response.data;
};

export const createMenuCategory = async (categoryData) => {
  const response = await api.post("/api/menu/categories/", categoryData);

  return response.data;
};

export const updateMenuCategory = async (categoryId, categoryData) => {
  const response = await api.patch(
    `/api/menu/categories/${categoryId}`,
    categoryData,
  );

  return response.data;
};

export const deleteMenuCategory = async (categoryId) => {
  const response = await api.delete(`/api/menu/categories/${categoryId}`);

  return response.data;
};

// ================================
// MENU ITEM SERVICES
// ================================

export const getMenuItems = async (params = {}) => {
  const response = await api.get("/api/menu/items/", {
    params,
  });

  return response.data;
};

export const getMenuItemById = async (itemId) => {
  const response = await api.get(`/api/menu/items/${itemId}`);
  return response.data;
};

export const createMenuItem = async (itemData) => {
  const response = await api.post("/api/menu/items/", itemData);

  return response.data;
};

export const updateMenuItem = async (itemId, itemData) => {
  const response = await api.patch(`/api/menu/items/${itemId}`, itemData);

  return response.data;
};

export const updateMenuItemAvailability = async (itemId, isAvailable) => {
  const response = await api.patch(`/api/menu/items/${itemId}/availability`, {
    is_available: isAvailable,
  });

  return response.data;
};

export const deleteMenuItem = async (itemId) => {
  const response = await api.delete(`/api/menu/items/${itemId}`);
  return response.data;
};

// ================================
// MENU ITEM IMAGE SERVICES
// ================================

// Uploads (or replaces) the photo of a menu item.
// The field name "file" must match the parameter name in the backend endpoint.
export const uploadMenuItemImage = async (itemId, file) => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post(`/api/menu/items/${itemId}/image`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return response.data;
};

// Removes the photo of a menu item.
export const deleteMenuItemImage = async (itemId) => {
  const response = await api.delete(`/api/menu/items/${itemId}/image`);
  return response.data;
};
