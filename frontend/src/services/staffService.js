import api from "./api";

// Get all staff members
export const getAllStaff = async () => {
  const response = await api.get("/api/staff/");
  return response.data;
};

// Get a single staff member
export const getStaffById = async (staffId) => {
  const response = await api.get(`/api/staff/${staffId}`);
  return response.data;
};

// Create a new staff member
export const createStaff = async (staffData) => {
  const response = await api.post("/api/staff/", staffData);
  return response.data;
};

// Update staff details
export const updateStaff = async (staffId, staffData) => {
  const response = await api.patch(
    `/api/staff/${staffId}`,
    staffData
  );

  return response.data;
};

// Activate or deactivate a staff member
export const updateStaffStatus = async (staffId, isActive) => {
  const response = await api.patch(
    `/api/staff/${staffId}/status`,
    { is_active: isActive }
  );

  return response.data;
};

// Delete a staff member
export const deleteStaff = async (staffId) => {
  const response = await api.delete(`/api/staff/${staffId}`);
  return response.data;
};
