import axios from "axios";
import {
  DEFAULT_API_BASE_URL,
  getModuleApiBaseUrl,
  normalizeModuleContext,
} from "../config/moduleRouting";

const api = axios.create({
  baseURL: DEFAULT_API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach JWT token and active module backend URL to authenticated requests
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("access_token");
  const authContext = normalizeModuleContext(sessionStorage.getItem("auth_context"));
  const sessionApiBase =
    (authContext ? getModuleApiBaseUrl(authContext) : null) ||
    sessionStorage.getItem("api_base_url");

  config.baseURL = config.baseURL || sessionApiBase || DEFAULT_API_BASE_URL;
  if (sessionApiBase && config.baseURL === DEFAULT_API_BASE_URL) {
    config.baseURL = sessionApiBase;
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default api;
