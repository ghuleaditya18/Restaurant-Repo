const env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};

export const DEFAULT_API_BASE_URL = env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
export const VILLAS_API_BASE_URL = env.VITE_VILLAS_API_BASE_URL || "http://127.0.0.1:8001";

const CONTEXT_ALIASES = Object.freeze({
  RESTAURANT: "RESTAURANT",
  SPA: "SPA",
  VILLA: "VILLA",
  VILLAS: "VILLA",
  NIWARAAI: "VILLA",
});

export function normalizeModuleContext(context) {
  const key = String(context || "").trim().toUpperCase();
  return CONTEXT_ALIASES[key] || null;
}

export function getModuleApiBaseUrl(
  context,
  { mainBaseUrl = DEFAULT_API_BASE_URL, villasBaseUrl = VILLAS_API_BASE_URL } = {},
) {
  const normalized = normalizeModuleContext(context);
  if (normalized === "VILLA") {
    return villasBaseUrl;
  }
  if (normalized === "RESTAURANT" || normalized === "SPA") {
    return mainBaseUrl;
  }
  throw new Error("Please select a valid business module before signing in.");
}

export function getModuleHomeRoute(context) {
  const normalized = normalizeModuleContext(context);
  if (normalized === "SPA") return "/spa/dashboard";
  if (normalized === "VILLA") return "/villas/dashboard";
  if (normalized === "RESTAURANT") return "/";
  return "/login";
}

export function clearSessionAuthStorage(storage) {
  if (!storage) return;
  storage.removeItem("access_token");
  storage.removeItem("api_base_url");
  storage.removeItem("auth_context");
}
