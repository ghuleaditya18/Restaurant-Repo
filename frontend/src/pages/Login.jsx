import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ChefHat,
  Mail,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

// Keep this in sync with the password rules used at registration / backend.
const MIN_PASSWORD_LENGTH = 6;
const MAX_EMAIL_LENGTH = 254;

// Error codes the backend is expected to send in response.data.detail
// (or response.data.code) with an HTTP 401.
const AUTH_ERROR = {
  EMAIL_NOT_FOUND: "EMAIL_NOT_FOUND",
  INVALID_PASSWORD: "INVALID_PASSWORD",
};

// Reads the error code from several common response shapes:
//   { detail: "EMAIL_NOT_FOUND" }
//   { detail: { code: "EMAIL_NOT_FOUND" } }
//   { code: "EMAIL_NOT_FOUND" }
const extractErrorCode = (data) => {
  if (!data) return "";

  const raw =
    (typeof data.detail === "string" && data.detail) ||
    data.detail?.code ||
    data.code ||
    "";

  return String(raw).trim().toUpperCase();
};

// Reads a human-readable message if the backend sent one.
const extractErrorMessage = (data) => {
  if (!data) return "";
  if (typeof data.detail === "string") return data.detail;
  if (typeof data.detail?.message === "string") return data.detail.message;
  if (typeof data.message === "string") return data.message;
  return "";
};


// ---------- Validators (pure functions) ----------

const validateEmail = (value) => {
  const email = value.trim();

  if (!email) {
    return "Email is required.";
  }

  if (email.length > MAX_EMAIL_LENGTH) {
    return "Email address is too long.";
  }

  // Practical format check: local@domain.tld, no spaces, no consecutive dots.
  const emailRegex =
    /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

  if (!emailRegex.test(email) || email.includes("..")) {
    return "Invalid email address. Please enter a valid email.";
  }

  return "";
};

const validatePassword = (value) => {
  if (!value) {
    return "Password is required.";
  }

  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Invalid password. It must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  return "";
};


function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [errors, setErrors] = useState({ email: "", password: "" });

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");


  // ---------- Input handlers ----------

  // Typing only clears the error of the field being edited.
  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    setErrors((prev) => ({ ...prev, email: "" }));
    setServerError("");
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    setErrors((prev) => ({ ...prev, password: "" }));
    setServerError("");
  };

  // Validate a field when the user leaves it.
  const handleEmailBlur = () => {
    if (email) {
      setErrors((prev) => ({ ...prev, email: validateEmail(email) }));
    }
  };

  const handlePasswordBlur = () => {
    if (password) {
      setErrors((prev) => ({ ...prev, password: validatePassword(password) }));
    }
  };


  // ---------- Submit ----------

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError("");

    // STEP 1: email format must be valid before anything else.
    const emailError = validateEmail(email);
    if (emailError) {
      setErrors({ email: emailError, password: "" });
      emailRef.current?.focus();
      return;
    }

    // STEP 2: password rules must pass before calling the server.
    const passwordError = validatePassword(password);
    if (passwordError) {
      setErrors({ email: "", password: passwordError });
      passwordRef.current?.focus();
      return;
    }

    setErrors({ email: "", password: "" });
    setSubmitting(true);

    try {
      await login(email.trim().toLowerCase(), password);
      navigate("/", { replace: true });
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      const code = extractErrorCode(data);
      const message = extractErrorMessage(data);

      if (!err.response) {
        // Network / server unreachable
        setServerError("Unable to connect to the server. Please try again.");
      } else if (status === 404 || code === AUTH_ERROR.EMAIL_NOT_FOUND) {
        // STEP 3: email is well-formed but not registered.
        setErrors({
          email: "No account found with this email address.",
          password: "",
        });
        emailRef.current?.focus();
      } else if (
        (status === 401 || status === 403) &&
        code === AUTH_ERROR.INVALID_PASSWORD
      ) {
        // STEP 4: email exists, password is wrong.
        setErrors({
          email: "",
          password: "Incorrect password. Please try again.",
        });
        setPassword("");
        passwordRef.current?.focus();
      } else if (status === 401) {
        // Backend did not send a specific code, so we cannot tell which
        // field is wrong. Show one general message, don't blame a field.
        setServerError(
          message || "Invalid email or password. Please try again."
        );
      } else if (status === 403) {
        setServerError(
          message || "Staff accounts are not permitted to log in."
        );
      } else if (status === 422) {
        setServerError("Invalid login information. Please check your entries.");
      } else if (status === 429) {
        setServerError("Too many attempts. Please wait a moment and retry.");
      } else if (status >= 500) {
        setServerError("Server error. Please try again later.");
      } else {
        setServerError(message || "Unable to sign in. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };


  // ---------- Styling helpers ----------

  const getInputClass = (hasError) =>
    `w-full outline-none text-sm text-[#29231F] bg-transparent ${
      hasError ? "placeholder:text-red-300" : ""
    }`;

  const getWrapperClass = (hasError) =>
    `flex items-center gap-3 mt-2 border rounded-xl px-4 py-3 transition ${
      hasError
        ? "border-red-400"
        : "border-[#EAE4DD] focus-within:border-[#C65D35]"
    }`;


  return (
    <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center p-5">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-[#EAE4DD] p-8 sm:p-10">

        {/* Branding */}
        <div className="flex justify-center mb-7">
          <div className="bg-[#C65D35] text-white p-4 rounded-2xl shadow-xs">
            <ChefHat size={30} />
          </div>
        </div>

        {/* Application Name */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#29231F]">DineFlow</h1>
          <p className="text-sm text-[#8A817B] mt-2">
            Restaurant Management System
          </p>
        </div>

        {/* Welcome Message */}
        <div className="mb-7">
          <h2 className="text-xl font-bold text-[#29231F]">Welcome Back</h2>
          <p className="text-sm text-[#8A817B] mt-2">
            Sign in to access your account.
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-5">

          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="text-sm font-semibold text-[#29231F]"
            >
              Email Address
            </label>

            <div className={getWrapperClass(errors.email)}>
              <Mail size={19} className="text-[#8A817B] shrink-0" />

              <input
                id="email"
                ref={emailRef}
                type="email"
                value={email}
                onChange={handleEmailChange}
                onBlur={handleEmailBlur}
                placeholder="Enter your email"
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "email-error" : undefined}
                className={getInputClass(errors.email)}
              />
            </div>

            {errors.email && (
              <p
                id="email-error"
                role="alert"
                className="text-red-600 text-xs mt-2"
              >
                {errors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="text-sm font-semibold text-[#29231F]"
            >
              Password
            </label>

            <div className={getWrapperClass(errors.password)}>
              <Lock size={19} className="text-[#8A817B] shrink-0" />

              <input
                id="password"
                ref={passwordRef}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={handlePasswordChange}
                onBlur={handlePasswordBlur}
                placeholder="Enter your password"
                autoComplete="current-password"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password ? "password-error" : undefined
                }
                className={getInputClass(errors.password)}
              />

              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-[#8A817B] hover:text-[#29231F] transition shrink-0"
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>

            {errors.password && (
              <p
                id="password-error"
                role="alert"
                className="text-red-600 text-xs mt-2"
              >
                {errors.password}
              </p>
            )}
          </div>

          {/* Server Error */}
          {serverError && (
            <div
              role="alert"
              className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl"
            >
              {serverError}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-[#C65D35] hover:bg-[#A94C2B] disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl transition"
          >
            {submitting ? "Signing in..." : "Sign In"}
            {!submitting && <ArrowRight size={18} />}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-xs text-[#A39A93] mt-8">
          Authorized restaurant personnel only.
        </p>
      </div>
    </div>
  );
}

export default Login;