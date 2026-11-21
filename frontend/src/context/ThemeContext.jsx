import { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";

const ThemeContext = createContext(null);

const GLOBAL_STORAGE_KEY = "dineflow_theme_mode";

function getSystemTheme() {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

function getStoredTheme(userId = null) {
  try {
    if (userId) {
      const userKey = `dineflow_theme_${userId}`;
      const userTheme = localStorage.getItem(userKey);
      if (userTheme === "dark" || userTheme === "light" || userTheme === "system") {
        return userTheme;
      }
    }
    const globalTheme = localStorage.getItem(GLOBAL_STORAGE_KEY);
    if (globalTheme === "dark" || globalTheme === "light" || globalTheme === "system") {
      return globalTheme;
    }
  } catch {
    // Ignore localStorage errors
  }
  return "system";
}

export function ThemeProvider({ children }) {
  const [themeMode, setThemeModeState] = useState(() => getStoredTheme());
  const [systemIsDark, setSystemIsDark] = useState(() => getSystemTheme() === "dark");
  const [activeUserId, setActiveUserId] = useState(null);

  // Listen to OS system theme changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e) => {
      setSystemIsDark(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Compute resolved active theme: 'light' or 'dark'
  const resolvedTheme = useMemo(() => {
    if (themeMode === "dark") return "dark";
    if (themeMode === "light") return "light";
    return systemIsDark ? "dark" : "light";
  }, [themeMode, systemIsDark]);

  // Apply to HTML element and localStorage
  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === "dark") {
      root.classList.add("dark");
      root.setAttribute("data-theme", "dark");
    } else {
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
    }

    try {
      localStorage.setItem(GLOBAL_STORAGE_KEY, themeMode);
      if (activeUserId) {
        localStorage.setItem(`dineflow_theme_${activeUserId}`, themeMode);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [resolvedTheme, themeMode, activeUserId]);

  const setThemeMode = useCallback((mode, userId = null) => {
    if (mode === "dark" || mode === "light" || mode === "system") {
      setThemeModeState(mode);
      const uid = userId || activeUserId;
      try {
        localStorage.setItem(GLOBAL_STORAGE_KEY, mode);
        if (uid) {
          localStorage.setItem(`dineflow_theme_${uid}`, mode);
        }
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [activeUserId]);

  const syncUserTheme = useCallback((userId) => {
    if (!userId) return;
    setActiveUserId(userId);
    const userTheme = getStoredTheme(userId);
    setThemeModeState(userTheme);
  }, []);

  const value = useMemo(
    () => ({
      theme: resolvedTheme,
      themeMode,
      isDark: resolvedTheme === "dark",
      setThemeMode,
      syncUserTheme,
      // Backward compatibility
      setTheme: (t) => setThemeMode(t),
    }),
    [resolvedTheme, themeMode, setThemeMode, syncUserTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
