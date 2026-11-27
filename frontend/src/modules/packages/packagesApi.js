import api from "../../services/api";

const base = "/api/packages";

export function notifyPackagesRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("newaraai:package-notifications-refresh"));
  }
}

export const packagesApi = {
  dashboard: () => api.get(`${base}/dashboard`),
  notifications: () => api.get(`${base}/notifications`),
  categories: () => api.get(`${base}/categories`),
  settings: () => api.get(`${base}/settings`),

  // Packages CRUD
  list: (params) => api.get(`${base}/packages`, { params }),
  detail: (id) => api.get(`${base}/packages/${id}`),
  create: (data) => api.post(`${base}/packages`, data),
  update: (id, data) => api.patch(`${base}/packages/${id}`, data),
  updateStatus: (id, status) => api.post(`${base}/packages/${id}/status`, { status }),
  remove: (id) => api.delete(`${base}/packages/${id}`),
  availability: (id, params) => api.get(`${base}/packages/${id}/availability`, { params }),

  // Inclusions
  inclusionReferences: () => api.get(`${base}/inclusions/references`),
  listItems: (packageId) => api.get(`${base}/packages/${packageId}/items`),
  addItem: (packageId, data) => api.post(`${base}/packages/${packageId}/items`, data),
  updateItem: (itemId, data) => api.patch(`${base}/items/${itemId}`, data),
  deleteItem: (itemId) => api.delete(`${base}/items/${itemId}`),

  // Media
  listMedia: (packageId) => api.get(`${base}/packages/${packageId}/media`),
  uploadMedia: (packageId, file, mediaType = "gallery", caption = "") => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("media_type", mediaType);
    if (caption) fd.append("caption", caption);
    return api.post(`${base}/packages/${packageId}/media`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  updateMedia: (mediaId, data) => api.patch(`${base}/media/${mediaId}`, data),
  deleteMedia: (mediaId) => api.delete(`${base}/media/${mediaId}`),

  // Blackouts
  listBlackouts: (params) => api.get(`${base}/blackouts`, { params }),
  createBlackout: (data) => api.post(`${base}/blackouts`, data),
  updateBlackout: (id, data) => api.patch(`${base}/blackouts/${id}`, data),
  deleteBlackout: (id) => api.delete(`${base}/blackouts/${id}`),

  // Bookings
  bookings: (params) => api.get(`${base}/bookings`, { params }),
  bookingDetail: (id) => api.get(`${base}/bookings/${id}`),
  createBooking: (data) => api.post(`${base}/bookings`, data),
  bookingStatus: (id, status, reason = null) =>
    api.patch(`${base}/bookings/${id}/status`, reason ? { status, reason } : { status }),
  bookingHistory: (id) => api.get(`${base}/bookings/${id}/history`),

  // Customers (reuses master customers)
  customers: (params) => api.get(`${base}/customers`, { params }),
  createCustomer: (data) => api.post(`${base}/customers`, data),
  customerDetail: (id) => api.get(`${base}/customers/${id}`),
  updateCustomer: (id, data) => api.patch(`${base}/customers/${id}`, data),
  deleteCustomer: (id) => api.delete(`${base}/customers/${id}`),

  // Invoices & Payments
  invoices: (params) => api.get(`${base}/invoices`, { params }),
  invoiceDetail: (id) => api.get(`${base}/invoices/${id}`),
  createInvoice: (data) => api.post(`${base}/invoices`, data),
  deleteInvoice: (id) => api.delete(`${base}/invoices/${id}`),
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

export function pkgError(error) {
  const detail = error?.response?.data?.detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d?.msg || JSON.stringify(d)).join(", ");
  }
  return detail || error?.message || "The request could not be completed.";
}

export function pkgMoney(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function pkgDate(value) {
  if (!value) return "—";
  const str = String(value).slice(0, 10);
  const parts = str.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return String(value);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function pkgDateRange(start, end) {
  if (!start || !end) return "—";
  return `${pkgDate(start)} – ${pkgDate(end)}`;
}

export function pkgDateTime(value) {
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

export function getDefaultPackageCover({ category = "", name = "" } = {}) {
  const hay = `${category} ${name}`.toLowerCase();
  if (hay.includes("couple") || hay.includes("romantic") || hay.includes("honeymoon")) {
    return "/assets/packages/couple-retreat.jpg";
  }
  if (hay.includes("wellness") || hay.includes("spa") || hay.includes("ayurveda") || hay.includes("yoga")) {
    return "/assets/packages/wellness-escape.jpg";
  }
  if (hay.includes("seasonal") || hay.includes("event") || hay.includes("festive") || hay.includes("celebration")) {
    return "/assets/packages/seasonal-celebration.jpg";
  }
  return "/assets/packages/family-getaway.jpg";
}
