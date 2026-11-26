const MOBILE_REGEX = /^[6-9][0-9]{9}$/;
const STRICT_EMAIL_REGEX =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

/**
 * Normalize and validate an Indian 10-digit mobile number (starting with 6, 7, 8, or 9).
 * Accepts optional leading +91 / 91 with spaces or hyphens and normalizes to 10 digits.
 */
export function validateMobileNumber(rawValue, { required = true, label = "Phone number" } = {}) {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) {
    if (required) {
      return { valid: false, normalized: "", error: `${label} is required.` };
    }
    return { valid: true, normalized: "", error: "" };
  }

  let digits = trimmed.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }

  if (!MOBILE_REGEX.test(digits)) {
    return {
      valid: false,
      normalized: trimmed,
      error: `${label} must be a valid 10-digit mobile number starting with 6, 7, 8, or 9.`,
    };
  }

  return { valid: true, normalized: digits, error: "" };
}

/**
 * Normalize and strictly validate an email address.
 */
export function validateEmailAddress(rawValue, { required = false, label = "Email address" } = {}) {
  const trimmed = String(rawValue || "").trim().toLowerCase();
  if (!trimmed) {
    if (required) {
      return { valid: false, normalized: "", error: `${label} is required.` };
    }
    return { valid: true, normalized: "", error: "" };
  }

  if (trimmed.length > 150 || trimmed.includes("..") || !STRICT_EMAIL_REGEX.test(trimmed)) {
    return {
      valid: false,
      normalized: trimmed,
      error: `Enter a valid ${label.toLowerCase()} (e.g. name@example.com).`,
    };
  }

  return { valid: true, normalized: trimmed, error: "" };
}
