import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import api from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Verify existing session
  useEffect(() => {
    const verifySession = async () => {
      const token = sessionStorage.getItem("access_token");

      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.get("/api/auth/me");
        if (response.data.role?.toUpperCase() === "STAFF") {
          sessionStorage.removeItem("access_token");
          setUser(null);
        } else {
          setUser(response.data);
        }
      } catch {
        sessionStorage.removeItem("access_token");
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    verifySession();
  }, []);

  // Login
  const login = async (email, password) => {
    const response = await api.post("/api/auth/login", {
      email,
      password,
    });

    sessionStorage.setItem(
      "access_token",
      response.data.access_token
    );

    try {
      const userResponse = await api.get("/api/auth/me");

      if (userResponse.data.role?.toUpperCase() === "STAFF") {
        sessionStorage.removeItem("access_token");
        setUser(null);
        throw new Error("Staff accounts are not permitted to log in.");
      }

      setUser(userResponse.data);

      return userResponse.data;
    } catch (error) {
      sessionStorage.removeItem("access_token");
      throw error;
    }
  };

  // Logout
  const logout = () => {
    sessionStorage.removeItem("access_token");
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