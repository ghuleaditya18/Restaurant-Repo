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

  if (!/^(https?:)/i.test(raw)) {
    return `${API_ORIGIN.replace(/\/+$/, "")}/${raw.replace(/^\/+/, "")}`;
  }

  return raw;
}
