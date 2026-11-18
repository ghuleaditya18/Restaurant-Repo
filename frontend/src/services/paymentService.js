import api from "./api";

// ==========================================
// PAYMENT SERVICES
// ==========================================

export const getAllPayments = async (params = {}) => {
  const response = await api.get("/api/payments/", { params });
  return response.data;
};

export const getPaymentById = async (paymentId) => {
  const response = await api.get(`/api/payments/${paymentId}`);
  return response.data;
};

export const createPayment = async (invoiceId, paymentData) => {
  const response = await api.post(
    `/api/payments/invoice/${invoiceId}`,
    paymentData,
  );

  return response.data;
};

export const updatePaymentStatus = async (paymentId, statusData) => {
  const response = await api.patch(
    `/api/payments/${paymentId}/status`,
    statusData,
  );

  return response.data;
};
