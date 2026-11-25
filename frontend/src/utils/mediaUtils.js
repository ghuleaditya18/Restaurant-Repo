/**
 * Media and uploaded file URL resolver for DineFlow.
 * Prepends backend API origin to relative paths (e.g. /uploads/profiles/...).
 */
const API_ORIGIN =
  import.meta.env.VITE_API_ORIGIN ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8000";

export function resolveImageUrl(raw) {
  if (!raw) return null;
  if (/^(blob:|data:)/i.test(raw)) return raw;
  // Local frontend public assets (e.g. /assets/villas/...) must stay relative to Vite origin
  if (raw.startsWith("/assets/")) return raw;

  const activeOrigin =
    (typeof sessionStorage !== "undefined" && sessionStorage.getItem("api_base_url")) ||
    API_ORIGIN;

  if (!/^(https?:)/i.test(raw)) {
    return `${activeOrigin.replace(/\/+$/, "")}/${raw.replace(/^\/+/, "")}`;
  }

  return raw;
}
