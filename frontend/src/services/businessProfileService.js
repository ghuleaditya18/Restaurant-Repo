import api from "./api";

export const getBusinessProfile = async () => {
  const response = await api.get("/api/business-profile");
  return response.data;
};

export const updateBusinessProfile = async (profileData) => {
  const response = await api.put("/api/business-profile", profileData);
  return response.data;
};

export const uploadFounderImage = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post("/api/business-profile/founder-image", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const deleteFounderImage = async () => {
  const response = await api.delete("/api/business-profile/founder-image");
  return response.data;
};
