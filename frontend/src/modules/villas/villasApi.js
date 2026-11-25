import api from "../../services/api";

const base = "/api/villas";
export const villasApi = {
  dashboard: () => api.get(`${base}/dashboard`),
  villas: () => api.get(`${base}/villas`),
  createVilla: (data) => api.post(`${base}/villas`, data),
  updateVilla: (id, data) => api.patch(`${base}/villas/${id}`, data),
  deleteVilla: (id) => api.delete(`${base}/villas/${id}`),
  uploadVillaImage: (id, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post(`${base}/villas/${id}/image`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  deleteVillaImage: (id) => api.delete(`${base}/villas/${id}/image`),
  categories: () => api.get(`${base}/categories`),
  createCategory: (data) => api.post(`${base}/categories`, data),
  updateCategory: (id, data) => api.patch(`${base}/categories/${id}`, data),
  deleteCategory: (id) => api.delete(`${base}/categories/${id}`),
  units: () => api.get(`${base}/units`),
  createUnit: (data) => api.post(`${base}/units`, data),
  updateUnit: (id, data) => api.patch(`${base}/units/${id}`, data),
  housekeeping: (id, status) => api.patch(`${base}/units/${id}/housekeeping`, { status }),
  deleteUnit: (id) => api.delete(`${base}/units/${id}`),
  uploadUnitImage: (id, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post(`${base}/units/${id}/image`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  deleteUnitImage: (id) => api.delete(`${base}/units/${id}/image`),
  rates: () => api.get(`${base}/rates`),
  createRate: (data) => api.post(`${base}/rates`, data),
  updateRate: (id, data) => api.patch(`${base}/rates/${id}`, data),
  deleteRate: (id) => api.delete(`${base}/rates/${id}`),
  blocks: () => api.get(`${base}/blocks`),
  createBlock: (data) => api.post(`${base}/blocks`, data),
  updateBlock: (id, data) => api.patch(`${base}/blocks/${id}`, data),
  deleteBlock: (id) => api.delete(`${base}/blocks/${id}`),
  availability: (params) => api.get(`${base}/availability`, { params }),
  bookings: (params) => api.get(`${base}/bookings`, { params }),
  createBooking: (data) => api.post(`${base}/bookings`, data),
  updateBooking: (id, data) => api.patch(`${base}/bookings/${id}`, data),
  checkoutSummary: (id) => api.get(`${base}/bookings/${id}/checkout-summary`),
  bookingStatus: (id, status, reason = null) =>
    api.patch(`${base}/bookings/${id}/status`, reason ? { status, reason } : { status }),
  bookingHistory: (id) => api.get(`${base}/bookings/${id}/history`),
  settings: () => api.get(`${base}/settings`),
  updateSettings: (data) => api.put(`${base}/settings`, data),
  guests: (params) => api.get(`${base}/guests`, { params }),
  createGuest: (data) => api.post(`${base}/guests`, data),
  guestDetail: (id) => api.get(`${base}/guests/${id}`),
  updateGuest: (id, data) => api.patch(`${base}/guests/${id}`, data),
  deleteGuest: (id) => api.delete(`${base}/guests/${id}`),
  customers: (search = "") => api.get(`${base}/customers`, { params: { search } }),
  staff: () => api.get(`${base}/staff`),
  services: () => api.get(`${base}/services`),
  createService: (data) => api.post(`${base}/services`, data),
  updateService: (id, data) => api.patch(`${base}/services/${id}`, data),
  deleteService: (id) => api.delete(`${base}/services/${id}`),
  serviceRequests: (id) => api.get(`${base}/bookings/${id}/services`),
  allServiceRequests: () => api.get(`${base}/service-requests`),
  addServiceRequest: (id, data) => api.post(`${base}/bookings/${id}/services`, data),
  requestStatus: (id, status) => api.patch(`${base}/service-requests/${id}/status`, null, { params: { status } }),
  deleteServiceRequest: (id) => api.delete(`${base}/service-requests/${id}`),
  invoices: () => api.get(`${base}/invoices`),
  invoiceDetail: (id) => api.get(`${base}/invoices/${id}`),
  invoicePayments: (id) => api.get(`${base}/invoices/${id}/payments`),
  receivePayment: (id, params) => api.post(`${base}/invoices/${id}/payments`, null, { params }),
  issueRefund: (id, data) => api.post(`${base}/invoices/${id}/refunds`, data),
  downloadInvoicePdf: async (id) => {
    const response = await api.get(`${base}/invoices/${id}/pdf`, { responseType: "blob" });
    return response.data;
  },
  reports: (params) => api.get(`${base}/reports`, { params }),
};

export function villaError(error) {
  return error?.response?.data?.detail || error?.message || "The request could not be completed.";
}

export function villaMoney(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function villaDate(value) {
  if (!value) return "—";
  const str = String(value).slice(0, 10);
  const parts = str.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return String(value);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function villaDateRange(start, end) {
  if (!start || !end) return "—";
  return `${villaDate(start)} – ${villaDate(end)}`;
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

export function addDaysIso(isoDate, days = 1) {
  if (!isoDate) return "";
  const [y, m, d] = String(isoDate).slice(0, 10).split("-").map(Number);
  if ([y, m, d].some(Number.isNaN)) return "";
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function formatTime12h(hhmm) {
  if (!hhmm || !String(hhmm).includes(":")) return "";
  const [hStr, mStr] = String(hhmm).trim().split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return String(hhmm);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function villaDateLong(value) {
  if (!value) return "—";
  const str = String(value).slice(0, 10);
  const parts = str.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return String(value);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function villaDateWithTime(dateStr, timeStr) {
  if (!dateStr) return "—";
  const dateLabel = villaDateLong(dateStr);
  const timeLabel = formatTime12h(timeStr);
  return timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel;
}

export function villaDateTime(value) {
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

export function getDefaultVillaCover({ name = "", categoryName = "", villaName = "" } = {}) {
  const haystack = `${name} ${categoryName} ${villaName}`.toLowerCase();
  if (haystack.includes("canopy") || haystack.includes("mist") || haystack.includes("forest") || haystack.includes("treehouse")) {
    return "/assets/villas/forest-canopy.jpg";
  }
  if (haystack.includes("plunge") || haystack.includes("pool") || haystack.includes("ridge") || haystack.includes("sahyadri") || haystack.includes("infinity")) {
    return "/assets/villas/plunge-pool.jpg";
  }
  if (haystack.includes("lagoon") || haystack.includes("konkan") || haystack.includes("coastal") || haystack.includes("backwater")) {
    return "/assets/villas/coastal-lagoon.jpg";
  }
  return "/assets/villas/garden-pavilion.jpg";
}
