import api from "../../services/api";

const base = "/api/transport";

export const transportApi = {
  dashboard: () => api.get(`${base}/dashboard`),

  // Categories & Vehicles
  categories: () => api.get(`${base}/categories`),
  createCategory: (data) => api.post(`${base}/categories`, data),
  updateCategory: (id, data) => api.patch(`${base}/categories/${id}`, data),
  deleteCategory: (id) => api.delete(`${base}/categories/${id}`),

  vehicles: (params) => api.get(`${base}/vehicles`, { params }),
  vehicleDetail: (id) => api.get(`${base}/vehicles/${id}`),
  createVehicle: (data) => api.post(`${base}/vehicles`, data),
  updateVehicle: (id, data) => api.patch(`${base}/vehicles/${id}`, data),
  toggleVehicleStatus: (id, data) => api.patch(`${base}/vehicles/${id}/status`, data),
  deleteVehicle: (id) => api.delete(`${base}/vehicles/${id}`),
  uploadVehicleImage: (id, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post(`${base}/vehicles/${id}/image`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  deleteVehicleImage: (id) => api.delete(`${base}/vehicles/${id}/image`),

  // Drivers
  staffLookup: () => api.get(`${base}/staff-lookup`),
  drivers: (params) => api.get(`${base}/drivers`, { params }),
  createDriver: (data) => api.post(`${base}/drivers`, data),
  updateDriver: (id, data) => api.patch(`${base}/drivers/${id}`, data),
  deleteDriver: (id) => api.delete(`${base}/drivers/${id}`),
  uploadDriverImage: (id, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post(`${base}/drivers/${id}/image`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  deleteDriverImage: (id) => api.delete(`${base}/drivers/${id}/image`),

  // Routes & Services
  routes: (params) => api.get(`${base}/routes`, { params }),
  nextRouteCode: (params) => api.get(`${base}/routes/next-code`, { params }),
  createRoute: (data) => api.post(`${base}/routes`, data),
  updateRoute: (id, data) => api.patch(`${base}/routes/${id}`, data),
  deleteRoute: (id) => api.delete(`${base}/routes/${id}`),

  services: (params) => api.get(`${base}/services`, { params }),
  createService: (data) => api.post(`${base}/services`, data),
  updateService: (id, data) => api.patch(`${base}/services/${id}`, data),
  deleteService: (id) => api.delete(`${base}/services/${id}`),

  // Availability & Integration References
  availability: (params) => api.get(`${base}/availability`, { params }),
  integrationReferences: () => api.get(`${base}/integration-references`),

  // Customers (shared)
  customers: (params) => api.get(`${base}/customers`, { params }),
  createCustomer: (data) => api.post(`${base}/customers`, data),
  updateCustomer: (id, data) => api.patch(`${base}/customers/${id}`, data),

  // Bookings & Trip Execution
  bookings: (params) => api.get(`${base}/bookings`, { params }),
  bookingDetail: (id) => api.get(`${base}/bookings/${id}`),
  createBooking: (data) => api.post(`${base}/bookings`, data),
  updateBooking: (id, data) => api.patch(`${base}/bookings/${id}`, data),
  assignBooking: (id, data) => api.post(`${base}/bookings/${id}/assign`, data),
  updateTripStatus: (id, data) => api.patch(`${base}/bookings/${id}/status`, data),

  // Schedules
  schedules: (params) => api.get(`${base}/schedules`, { params }),

  // Maintenance
  maintenance: (params) => api.get(`${base}/maintenance`, { params }),
  createMaintenance: (data) => api.post(`${base}/maintenance`, data),
  updateMaintenance: (id, data) => api.patch(`${base}/maintenance/${id}`, data),
  deleteMaintenance: (id) => api.delete(`${base}/maintenance/${id}`),

  // Fuel & Operating Expenses
  expenses: (params) => api.get(`${base}/expenses`, { params }),
  createExpense: (data) => api.post(`${base}/expenses`, data),
  updateExpense: (id, data) => api.patch(`${base}/expenses/${id}`, data),
  deleteExpense: (id) => api.delete(`${base}/expenses/${id}`),

  // Invoices & Payments
  invoices: (params) => api.get(`${base}/invoices`, { params }),
  createInvoice: (data) => api.post(`${base}/invoices`, data),
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

export function trnError(error) {
  const detail = error?.response?.data?.detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d?.msg || JSON.stringify(d)).join(", ");
  }
  return detail || error?.message || "The request could not be completed.";
}

export function trnMoney(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function trnDate(value) {
  if (!value) return "—";
  const str = String(value).slice(0, 10);
  const parts = str.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return String(value);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function trnTime(value) {
  if (!value) return "—";
  const parts = String(value).slice(0, 5).split(":").map(Number);
  if (parts.length < 2 || parts.some(Number.isNaN)) return String(value);
  const [h, m] = parts;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function trnDateTime(value) {
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

export function kolkataCurrentTimeHHMM() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hh = parts.find((p) => p.type === "hour")?.value || "00";
  const mm = parts.find((p) => p.type === "minute")?.value || "00";
  return `${hh === "24" ? "00" : hh}:${mm}`;
}

export function kolkataUpcomingDefaults(leadMinutes = 15) {
  const now = new Date();
  const future = new Date(now.getTime() + leadMinutes * 60 * 1000);
  const fmt = (d, opts) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", ...opts }).format(d);
  const dateStr = fmt(future, { year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(future);
  let hh = Number(parts.find((p) => p.type === "hour")?.value || 0);
  if (hh === 24) hh = 0;
  let mm = Number(parts.find((p) => p.type === "minute")?.value || 0);
  mm = Math.ceil(mm / 5) * 5;
  if (mm >= 60) {
    mm = 0;
    hh += 1;
  }
  if (hh >= 24) {
    return {
      pickup_date: kolkataTodayIso(1),
      pickup_time: "00:05",
    };
  }
  return {
    pickup_date: dateStr,
    pickup_time: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
  };
}

export function getDefaultVehicleCover({ categoryName = "", vehicleType = "", fuelType = "" } = {}) {
  const hay = `${categoryName} ${vehicleType} ${fuelType}`.toLowerCase();
  if (hay.includes("electric") || hay.includes("ev")) return "/assets/transport/electric-vehicle.svg";
  if (hay.includes("luxury") || hay.includes("executive")) return "/assets/transport/luxury-car.svg";
  if (hay.includes("tempo")) return "/assets/transport/tempo-traveller.svg";
  if (hay.includes("mini bus") || hay.includes("minibus")) return "/assets/transport/mini-bus.svg";
  if (hay.includes("bus") || hay.includes("coach")) return "/assets/transport/bus.svg";
  if (hay.includes("muv") || hay.includes("mpv")) return "/assets/transport/muv.svg";
  if (hay.includes("suv")) return "/assets/transport/suv.svg";
  return "/assets/transport/sedan.svg";
}
