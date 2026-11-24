import api from "./api";

// ==========================================
// INVOICE SERVICES
// ==========================================

export const getAllInvoices = async (params = {}) => {
  const response = await api.get("/api/invoices/", { params });
  return response.data;
};

export const getInvoiceById = async (invoiceId) => {
  const response = await api.get(`/api/invoices/${invoiceId}`);
  return response.data;
};

export const getInvoiceByOrder = async (orderId) => {
  const response = await api.get(`/api/invoices/order/${orderId}`);
  return response.data;
};

export const createInvoice = async (invoiceData) => {
  const response = await api.post("/api/invoices/", invoiceData);
  return response.data;
};

export const deleteInvoice = async (invoiceId) => {
  const response = await api.delete(`/api/invoices/${invoiceId}`);
  return response.data;
};

// Download generated invoice PDF
export const downloadInvoicePdf = async (invoiceId) => {
  const response = await api.get(
    `/api/invoices/${invoiceId}/pdf`,
    {
      responseType: "blob",
    }
  );

  return response.data;
};
