import api from "../../services/api";

const base = "/api/activities";

export const activitiesApi = {
  dashboard: () => api.get(`${base}/dashboard`),
  settings: () => api.get(`${base}/settings`),
  staff: (params) => api.get(`${base}/staff`, { params }),

  // Activities CRUD
  list: (params) => api.get(`${base}/activities`, { params }),
  detail: (id) => api.get(`${base}/activities/${id}`),
  create: (data) => api.post(`${base}/activities`, data),
  update: (id, data) => api.patch(`${base}/activities/${id}`, data),
  updateStatus: (id, status) => api.post(`${base}/activities/${id}/status`, { status }),
  remove: (id) => api.delete(`${base}/activities/${id}`),

  // Resources (for time_slot activities)
  listResources: (activityId) => api.get(`${base}/activities/${activityId}/resources`),
  createResource: (activityId, data) => api.post(`${base}/activities/${activityId}/resources`, data),
  updateResource: (resourceId, data) => api.patch(`${base}/resources/${resourceId}`, data),
  deleteResource: (resourceId) => api.delete(`${base}/resources/${resourceId}`),
  resourceAvailability: (resourceId, params) =>
    api.get(`${base}/resources/${resourceId}/availability`, { params }),

  // Media
  listMedia: (activityId) => api.get(`${base}/activities/${activityId}/media`),
  uploadMedia: (activityId, file, mediaType = "gallery", caption = "") => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("media_type", mediaType);
    if (caption) fd.append("caption", caption);
    return api.post(`${base}/activities/${activityId}/media`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  deleteMedia: (mediaId) => api.delete(`${base}/media/${mediaId}`),

  // Weekly Schedules & Session Generation
  listSchedules: (activityId) => api.get(`${base}/activities/${activityId}/schedules`),
  createSchedule: (activityId, data) => api.post(`${base}/activities/${activityId}/schedules`, data),
  generateSessions: (scheduleId, data) => api.post(`${base}/schedules/${scheduleId}/generate-sessions`, data),

  // Sessions
  sessions: (params) => api.get(`${base}/sessions`, { params }),
  sessionDetail: (id) => api.get(`${base}/sessions/${id}`),
  createSession: (data) => api.post(`${base}/sessions`, data),
  updateSession: (id, data) => api.patch(`${base}/sessions/${id}`, data),
  sessionRoster: (sessionId) => api.get(`${base}/sessions/${sessionId}/roster`),

  // Bookings & Participants
  bookings: (params) => api.get(`${base}/bookings`, { params }),
  bookingDetail: (id) => api.get(`${base}/bookings/${id}`),
  createBooking: (data) => api.post(`${base}/bookings`, data),
  bookingStatus: (id, status, reason = null) =>
    api.patch(`${base}/bookings/${id}/status`, reason ? { status, reason } : { status }),
  bookingHistory: (id) => api.get(`${base}/bookings/${id}/history`),
  listParticipants: (bookingId) => api.get(`${base}/bookings/${bookingId}/participants`),
  updateParticipant: (participantId, data) => api.patch(`${base}/participants/${participantId}`, data),

  // Walk-in Usage Logs
  usageLogs: (params) => api.get(`${base}/usage-logs`, { params }),
  createUsageLog: (data) => api.post(`${base}/usage-logs`, data),

  // Customers (shared master customers table)
  customers: (params) => api.get(`${base}/customers`, { params }),
  customerDetail: (id) => api.get(`${base}/customers/${id}`),
  createCustomer: (data) => api.post(`${base}/customers`, data),
  updateCustomer: (id, data) => api.patch(`${base}/customers/${id}`, data),

  // Invoices & Payments
  invoices: (params) => api.get(`${base}/invoices`, { params }),
  invoiceDetail: (id) => api.get(`${base}/invoices/${id}`),
  createInvoice: (data) => api.post(`${base}/invoices`, data),
  invoicePayments: (id) => api.get(`${base}/invoices/${id}/payments`),
  recordPayment: (invoiceId, data) => api.post(`${base}/invoices/${invoiceId}/payments`, data),
  downloadInvoicePdf: async (id) => {
    const res = await api.get(`${base}/invoices/${id}/pdf`, { responseType: "blob" });
    return res.data;
  },

  // Reports
  reports: (params) => api.get(`${base}/reports`, { params }),
  exportReportCsv: async (params) => {
    const res = await api.get(`${base}/reports/export`, { params, responseType: "blob" });
    return res.data;
  },
};

export function actError(error) {
  const detail = error?.response?.data?.detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d?.msg || JSON.stringify(d)).join(", ");
  }
  return detail || error?.message || "The request could not be completed.";
}

export function actMoney(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function actDate(value) {
  if (!value) return "—";
  const str = String(value).slice(0, 10);
  const parts = str.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return String(value);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function actTime(value) {
  if (!value) return "—";
  const parts = String(value).slice(0, 5).split(":").map(Number);
  if (parts.length < 2 || parts.some(Number.isNaN)) return String(value);
  const [h, m] = parts;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function actDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function kolkataTodayIso(offsetDays = 0) {
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (!offsetDays) return todayStr;
  const [y, m, d] = todayStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return dt.toISOString().slice(0, 10);
}

export function bookingTypeLabel(type) {
  if (type === "time_slot") return "Time Slot";
  if (type === "session") return "Session";
  if (type === "walk_in") return "Walk-In";
  return type || "—";
}
