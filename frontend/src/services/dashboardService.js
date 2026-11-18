import api from "./api";

// ==========================================
// DASHBOARD SERVICES
// ==========================================

export const getDashboardSummary = async (params = {}) => {
  const response = await api.get("/api/dashboard/summary", { params });
  return response.data;
};
