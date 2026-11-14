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
        setUser(response.data);
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

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}