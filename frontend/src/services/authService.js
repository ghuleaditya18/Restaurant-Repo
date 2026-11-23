import api from "./api";

export const getProfile = async () => {
  const response = await api.get("/api/auth/me");
  return response.data;
};

export const updateProfile = async (profileData) => {
  const response = await api.patch("/api/auth/profile", profileData);
  return response.data;
};

export const uploadProfileImage = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post("/api/auth/profile/image", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const deleteProfileImage = async () => {
  const response = await api.delete("/api/auth/profile/image");
  return response.data;
};
