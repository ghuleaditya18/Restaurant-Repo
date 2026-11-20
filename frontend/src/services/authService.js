import api from "./api";

export const getProfile = async () => {
  const response = await api.get("/api/auth/me");
  return response.data;
};

export const updateProfile = async (profileData) => {
  const response = await api.patch("/api/auth/profile", profileData);
  return response.data;
};
