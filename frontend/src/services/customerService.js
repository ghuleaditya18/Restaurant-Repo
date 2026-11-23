import api from "./api";

// ==========================================
// CUSTOMER MANAGEMENT SERVICES
// ==========================================

// Get all customers
export const getAllCustomers = async () => {
  const response = await api.get("/api/customers/");
  return response.data;
};

// Get a single customer
export const getCustomerById = async (customerId) => {
  const response = await api.get(`/api/customers/${customerId}`);

  return response.data;
};

// Create a new customer
export const createCustomer = async (customerData) => {
  const response = await api.post("/api/customers/", customerData);

  return response.data;
};

// Update customer details
export const updateCustomer = async (customerId, customerData) => {
  const response = await api.patch(
    `/api/customers/${customerId}`,
    customerData,
  );

  return response.data;
};

// Delete customer
export const deleteCustomer = async (customerId) => {
  const response = await api.delete(`/api/customers/${customerId}`);

  return response.data;
};

// Upload customer profile image
export const uploadCustomerImage = async (customerId, file) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post(`/api/customers/${customerId}/image`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

// Delete customer profile image
export const deleteCustomerImage = async (customerId) => {
  const response = await api.delete(`/api/customers/${customerId}/image`);
  return response.data;
};
