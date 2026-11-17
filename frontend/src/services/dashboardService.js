import api from "./api";

// ==========================================
// DASHBOARD SERVICES
// ==========================================

export const getDashboardSummary = async () => {
  const response = await api.get("/api/dashboard/summary");
  return response.data;
};
