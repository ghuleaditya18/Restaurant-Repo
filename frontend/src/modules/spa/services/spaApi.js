import api from "../../../services/api";

export const spaApi = {
  // Dashboard
  getDashboardSummary: () => api.get("/api/spa/dashboard/summary"),

  // Service Categories
  getServiceCategories: (activeOnly = false) =>
    api.get(`/api/spa/service-categories?active_only=${activeOnly}`),
  createServiceCategory: (data) => api.post("/api/spa/service-categories", data),
  updateServiceCategory: (id, data) => api.put(`/api/spa/service-categories/${id}`, data),
  deleteServiceCategory: (id) => api.delete(`/api/spa/service-categories/${id}`),

  // Services
  getServices: (params = {}) => api.get("/api/spa/services", { params }),
  createService: (data) => api.post("/api/spa/services", data),
  getService: (id) => api.get(`/api/spa/services/${id}`),
  updateService: (id, data) => api.put(`/api/spa/services/${id}`, data),
  deleteService: (id) => api.delete(`/api/spa/services/${id}`),

  // Customers
  getCustomers: (params = {}) => api.get("/api/spa/customers", { params }),
  createCustomer: (data) => api.post("/api/spa/customers", data),
  getCustomer: (id) => api.get(`/api/spa/customers/${id}`),
  updateCustomer: (id, data) => api.put(`/api/spa/customers/${id}`, data),
  getCustomerBookingHistory: (id) => api.get(`/api/spa/customers/${id}/bookings`),

  // Staff & Therapists
  getStaff: (params = {}) => api.get("/api/spa/staff", { params }),
  createStaff: (data) => api.post("/api/spa/staff", data),
  getStaffDetail: (id) => api.get(`/api/spa/staff/${id}`),
  updateStaff: (id, data) => api.put(`/api/spa/staff/${id}`, data),
  updateStaffAvailability: (id, availabilities) =>
    api.put(`/api/spa/staff/${id}/availability`, availabilities),

  // Bookings
  getBookings: (params = {}) => api.get("/api/spa/bookings", { params }),
  createBooking: (data) => api.post("/api/spa/bookings", data),
  getBooking: (id) => api.get(`/api/spa/bookings/${id}`),
  updateBookingStatus: (id, data) => api.patch(`/api/spa/bookings/${id}/status`, data),
  rescheduleBooking: (id, data) => api.post(`/api/spa/bookings/${id}/reschedule`, data),
  getAvailableSlots: (params) => api.get("/api/spa/bookings/available-slots", { params }),
  checkTherapistConflict: (params) => api.get("/api/spa/bookings/check-conflict", { params }),

  // Invoices
  getInvoices: (params = {}) => api.get("/api/spa/invoices", { params }),
  createInvoice: (data) => api.post("/api/spa/invoices", data),
  getInvoice: (id) => api.get(`/api/spa/invoices/${id}`),
  getInvoiceDownloadUrl: (id) => `/api/spa/invoices/${id}/download`,
  downloadInvoicePdfBlob: async (invoiceId) => {
    const res = await api.get(`/api/spa/invoices/${invoiceId}/download`, {
      responseType: "blob",
    });
    return res.data;
  },
  downloadInvoicePdf: async (invoiceId, invoiceNumber) => {
    const res = await api.get(`/api/spa/invoices/${invoiceId}/download`, {
      responseType: "blob",
    });
    const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${invoiceNumber || "spa-invoice"}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // Payments
  getPayments: (params = {}) => api.get("/api/spa/payments", { params }),
  recordPayment: (invoiceId, data) => api.post(`/api/spa/payments/${invoiceId}`, data),
};

export default spaApi;
