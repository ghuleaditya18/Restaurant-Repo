import api from "./api";

/**
 * Execute global search across entities in the active business context.
 * @param {string} query
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ query: string, total_matches: number, groups: Array }>}
 */
export async function executeGlobalSearch(query, signal) {
  const trimmed = (query || "").trim();
  if (!trimmed) {
    return { query: "", total_matches: 0, groups: [] };
  }

  const response = await api.get("/api/search", {
    params: { q: trimmed },
    signal,
  });
  return response.data;
}
