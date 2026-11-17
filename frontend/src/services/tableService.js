import api from "./api";

// Get all restaurant tables
export const getAllTables = async () => {
  const response = await api.get("/api/tables/");
  return response.data;
};

// Get individual table
export const getTableById = async (tableId) => {
  const response = await api.get(`/api/tables/${tableId}`);
  return response.data;
};

// Create new table
export const createTable = async (tableData) => {
  const response = await api.post("/api/tables/", tableData);
  return response.data;
};

// Update table details
export const updateTable = async (tableId, tableData) => {
  const response = await api.patch(`/api/tables/${tableId}`, tableData);
  return response.data;
};

// Delete table
export const deleteTable = async (tableId) => {
  const response = await api.delete(`/api/tables/${tableId}`);
  return response.data;
};
