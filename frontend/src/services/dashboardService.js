import api from "./api";

// ==========================================
// DASHBOARD SERVICES
// ==========================================

/**
 * Fetch aggregated dashboard metrics, recent orders, and live table occupancy.
 * Supports passing either an object of parameters or positional arguments.
 *
 * @param {string|object} presetOrParams - Preset filter name ('today', 'yesterday', 'last_7_days', 'this_month', 'all', 'custom') OR an object with query params.
 * @param {string|null} startDate - Optional YYYY-MM-DD start date for custom range.
 * @param {string|null} endDate - Optional YYYY-MM-DD end date for custom range.
 * @returns {Promise<object>} DashboardSummaryResponse
 */
export const getDashboardSummary = async (
  presetOrParams = "today",
  startDate = null,
  endDate = null
) => {
  let params = {};

  if (typeof presetOrParams === "object" && presetOrParams !== null) {
    params = { ...presetOrParams };
  } else {
    if (presetOrParams) {
      params.preset = String(presetOrParams);
    }
    if (startDate) {
      params.start_date = startDate;
    }
    if (endDate) {
      params.end_date = endDate;
    }
  }

  const response = await api.get("/api/dashboard/summary", { params });
  return response.data;
};
