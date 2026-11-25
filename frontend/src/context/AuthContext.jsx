import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import api from "../services/api";
import {
  clearSessionAuthStorage,
  getModuleApiBaseUrl,
  normalizeModuleContext,
} from "../config/moduleRouting";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Verify existing session
  useEffect(() => {
    const verifySession = async () => {
      const token = sessionStorage.getItem("access_token");
      const storedContext = normalizeModuleContext(sessionStorage.getItem("auth_context"));

      if (!token) {
        clearSessionAuthStorage(sessionStorage);
        setLoading(false);
        return;
      }

      if (storedContext) {
        sessionStorage.setItem("api_base_url", getModuleApiBaseUrl(storedContext));
      }

      try {
        const response = await api.get("/api/auth/me");
        const serverContext = normalizeModuleContext(response.data.business_context);
        if (
          response.data.role?.toUpperCase() === "STAFF" ||
          !serverContext ||
          (storedContext && serverContext !== storedContext)
        ) {
          clearSessionAuthStorage(sessionStorage);
          setUser(null);
        } else {
          sessionStorage.setItem("auth_context", serverContext);
          sessionStorage.setItem("api_base_url", getModuleApiBaseUrl(serverContext));
          setUser({ ...response.data, business_context: serverContext });
        }
      } catch {
        clearSessionAuthStorage(sessionStorage);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    verifySession();
  }, []);

  // Login (requires explicit module selection)
  const login = async (email, password, businessContext) => {
    const requestedContext = normalizeModuleContext(businessContext);
    if (!requestedContext) {
      clearSessionAuthStorage(sessionStorage);
      throw new Error("Please select a business module before signing in.");
    }

    const targetBaseUrl = getModuleApiBaseUrl(requestedContext);
    clearSessionAuthStorage(sessionStorage);
    sessionStorage.setItem("api_base_url", targetBaseUrl);
    sessionStorage.setItem("auth_context", requestedContext);

    const payload = {
      email,
      password,
      business_context: requestedContext,
    };

    try {
      const response = await api.post("/api/auth/login", payload, { baseURL: targetBaseUrl });
      const returnedContext = normalizeModuleContext(response.data?.business_context);
      if (returnedContext && returnedContext !== requestedContext) {
        throw new Error("Account context does not match the selected module.");
      }

      sessionStorage.setItem("access_token", response.data.access_token);

      const userResponse = await api.get("/api/auth/me", { baseURL: targetBaseUrl });
      const serverContext = normalizeModuleContext(userResponse.data.business_context);

      if (userResponse.data.role?.toUpperCase() === "STAFF") {
        clearSessionAuthStorage(sessionStorage);
        setUser(null);
        throw new Error("Staff accounts are not permitted to log in.");
      }

      if (!serverContext || serverContext !== requestedContext) {
        clearSessionAuthStorage(sessionStorage);
        setUser(null);
        throw new Error("Account does not belong to the selected module.");
      }

      const normalizedUser = { ...userResponse.data, business_context: serverContext };
      setUser(normalizedUser);

      return normalizedUser;
    } catch (error) {
      clearSessionAuthStorage(sessionStorage);
      throw error;
    }
  };

  // Logout
  const logout = () => {
    clearSessionAuthStorage(sessionStorage);
    setUser(null);
  };

  // Immediate local update for user profile changes
  const updateUser = (updatedData) => {
    setUser((prev) => (prev ? { ...prev, ...updatedData } : prev));
  };

  // Fetch freshest profile from backend
  const refreshUser = async () => {
    try {
      const response = await api.get("/api/auth/me");
      setUser(response.data);
      return response.data;
    } catch {
      // Keep existing user if refresh fails
      return user;
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, updateUser, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
