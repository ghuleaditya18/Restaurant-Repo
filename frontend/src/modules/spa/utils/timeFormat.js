/**
 * Time formatting utilities for the Spa module.
 * Formats time values into standardized 12-hour AM/PM format (e.g. "09:00 AM", "10:00 AM", "02:30 PM").
 */

/**
 * Formats a time string ("HH:MM" or "HH:MM:SS") into a standardized 12-hour AM/PM string.
 *
 * @param {string|null|undefined} timeStr - Time string in 24-hour format (e.g., "14:30")
 * @returns {string} Formatted 12-hour string (e.g., "02:30 PM") or "--:--" if invalid
 */
export function formatTime12Hour(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return "--:--";
  const trimmed = timeStr.trim();
  if (!trimmed || trimmed === "--:--") return "--:--";

  // If already in 12-hour format (e.g., contains AM/PM)
  if (/(am|pm)$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  const parts = trimmed.split(":");
  if (parts.length < 2) return timeStr;

  const hours24 = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  if (isNaN(hours24) || isNaN(minutes)) return timeStr;

  const ampm = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;

  const hh = String(hours12).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");

  return `${hh}:${mm} ${ampm}`;
}

/**
 * Formats a start and end time into a clean 12-hour AM/PM range string.
 * Example: ("10:00", "11:00") -> "10:00 AM - 11:00 AM".
 *
 * @param {string|null|undefined} startStr - Start time in 24h format
 * @param {string|null|undefined} endStr - End time in 24h format
 * @returns {string} Formatted time range string
 */
export function formatTimeRange12Hour(startStr, endStr) {
  if (!startStr && !endStr) return "--:--";
  if (!startStr) return formatTime12Hour(endStr);
  if (!endStr) return formatTime12Hour(startStr);
  return `${formatTime12Hour(startStr)} - ${formatTime12Hour(endStr)}`;
}
