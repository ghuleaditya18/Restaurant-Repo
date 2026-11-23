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


// Reset a staff member password
export const resetStaffPassword = async (staffId, password) => {
  const response = await api.patch(`/api/staff/${staffId}/password`, {
    password,
  });
  return response.data;
};

// Upload staff profile image
export const uploadStaffImage = async (staffId, file) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post(`/api/staff/${staffId}/image`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

// Delete staff profile image
export const deleteStaffImage = async (staffId) => {
  const response = await api.delete(`/api/staff/${staffId}/image`);
  return response.data;
};
