import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  ChefHat,
  Sparkles,
  BedDouble,
  Package,
  Compass,
  Mail,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  ArrowLeft,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { APP_NAME, MODULE_NAMES } from "../config/branding";
import {
  clearSessionAuthStorage,
  getModuleHomeRoute,
  normalizeModuleContext,
} from "../config/moduleRouting";

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


const MODULE_CHOICES = [
  {
    context: "RESTAURANT",
    to: "/login/restaurant",
    title: MODULE_NAMES.RESTAURANT || "Restaurant Management",
    description: "Dining orders, tables, menu, inventory & invoices",
    icon: ChefHat,
  },
  {
    context: "SPA",
    to: "/login/spa",
    title: MODULE_NAMES.SPA || "Spa & Wellness",
    description: "Therapist schedules, appointments & wellness billing",
    icon: Sparkles,
  },
  {
    context: "VILLA",
    to: "/login/villas",
    title: MODULE_NAMES.VILLA || "Villas & Units",
    description: "Villas, guest units, stays, services & billing",
    icon: BedDouble,
  },
  {
    context: "PACKAGE",
    to: "/login/packages",
    title: MODULE_NAMES.PACKAGE || "Packages",
    description: "Curated resort packages, seasonal offers & bookings",
    icon: Package,
  },
  {
    context: "ACTIVITY",
    to: "/login/activities",
    title: MODULE_NAMES.ACTIVITY || "Activities Management",
    description: "Activities catalogue, schedules, sessions & roster",
    icon: Compass,
  },
];


function Login({ moduleContext = null }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const activeContext = normalizeModuleContext(moduleContext);

  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [errors, setErrors] = useState({ email: "", password: "" });

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");

  useEffect(() => {
    if (!sessionStorage.getItem("access_token")) {
      clearSessionAuthStorage(sessionStorage);
    }
    setErrors({ email: "", password: "" });
    setServerError("");
  }, [activeContext]);


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
      const loggedUser = await login(email.trim().toLowerCase(), password, activeContext);
      navigate(getModuleHomeRoute(loggedUser?.business_context), { replace: true });
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
    `w-full outline-none text-sm text-[#172033] dark:text-[#F8FAFC] bg-transparent ${
      hasError
        ? "placeholder:text-red-300 dark:placeholder:text-rose-400"
        : "placeholder:text-stone-400 dark:placeholder:text-stone-500"
    }`;

  const getWrapperClass = (hasError) =>
    `flex items-center gap-3 mt-2 border rounded-xl px-4 py-3 bg-white dark:bg-[#151D29] transition ${
      hasError
        ? "border-red-400 dark:border-rose-500 focus-within:ring-2 focus-within:ring-red-100 dark:focus-within:ring-rose-900/40"
        : "border-[#E5E9F0] dark:border-[#1E293B] focus-within:border-[#F59E0B] focus-within:ring-2 focus-within:ring-[#F59E0B]/30"
    }`;


  const ActiveIcon =
    activeContext === "SPA"
      ? Sparkles
      : activeContext === "VILLA"
        ? BedDouble
        : activeContext === "PACKAGE"
          ? Package
          : activeContext === "ACTIVITY"
            ? Compass
            : ChefHat;

  return (
    <div className="min-h-screen bg-[#F0F2F7] dark:bg-[#0B111A] flex items-center justify-center p-5 transition-colors">
      <div className="relative w-full max-w-md bg-white dark:bg-[#101722] rounded-3xl shadow-xl border border-[#E5E9F0] dark:border-[#1E293B] p-8 sm:p-10">
        {activeContext && (
          <Link
            to="/login"
            className="mb-5 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-stone-600 dark:text-stone-300 transition hover:bg-stone-100 dark:hover:bg-[#151D29] hover:text-stone-900 dark:hover:text-white"
          >
            <ArrowLeft size={15} />
            Back to Module Selection
          </Link>
        )}

        {/* Branding */}
        <div className="flex justify-center mb-6">
          <div className="bg-gradient-to-br from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold p-4 rounded-2xl shadow-xs">
            <ActiveIcon size={30} />
          </div>
        </div>

        {/* Application Name */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-[#172033] dark:text-[#F8FAFC]">{APP_NAME}</h1>
          <p className="text-xs text-stone-500 dark:text-[#8A9AB2] mt-1 font-medium">
            {activeContext ? MODULE_NAMES[activeContext] : "Unified Resort Management"}
          </p>
        </div>

        {!activeContext ? (
          <div>
            <div className="mb-5 text-center">
              <h2 className="text-xl font-bold text-[#172033] dark:text-[#F8FAFC]">Select Business Module</h2>
              <p className="text-xs text-stone-500 dark:text-[#8A9AB2] mt-1 font-medium">
                Choose the operational module you want to sign in to.
              </p>
            </div>

            <nav aria-label="Choose a business module" className="space-y-3">
              {MODULE_CHOICES.map((mod) => {
                const ModIcon = mod.icon;
                return (
                  <Link
                    key={mod.context}
                    to={mod.to}
                    className="group flex items-center justify-between gap-3 rounded-2xl border border-[#E5E9F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#151D29] p-4 transition hover:border-[#F59E0B] hover:bg-[#FFF7E8] dark:hover:bg-[#30251C]/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="rounded-xl bg-white dark:bg-[#101722] border border-[#E5E9F0] dark:border-[#1E293B] p-2.5 text-[#D97706] dark:text-[#FFB02E] shrink-0 group-hover:border-[#F59E0B]/50">
                        <ModIcon size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#172033] dark:text-[#F8FAFC] truncate">{mod.title}</p>
                        <p className="text-xs text-stone-500 dark:text-[#8A9AB2] truncate">{mod.description}</p>
                      </div>
                    </div>
                    <ArrowRight size={16} className="text-stone-400 dark:text-stone-500 group-hover:text-[#D97706] dark:group-hover:text-[#FFB02E] shrink-0" />
                  </Link>
                );
              })}
            </nav>

            <p className="text-center text-xs text-stone-400 dark:text-stone-500 mt-8">
              Authorized personnel only.
            </p>
          </div>
        ) : (
          <>
            {/* Welcome Message */}
            <div className="mb-7">
              <h2 className="text-xl font-bold text-[#172033] dark:text-[#F8FAFC]">Welcome Back</h2>
              <p className="text-xs text-stone-500 dark:text-[#8A9AB2] mt-1 font-medium">
                {`Sign in to access ${MODULE_NAMES[activeContext]}.`}
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} noValidate className="space-y-5">

          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300"
            >
              Email Address
            </label>

            <div className={getWrapperClass(errors.email)}>
              <Mail size={18} className="text-stone-400 dark:text-stone-500 shrink-0" />

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
                className="text-red-600 dark:text-rose-400 text-xs mt-1.5"
              >
                {errors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300"
            >
              Password
            </label>

            <div className={getWrapperClass(errors.password)}>
              <Lock size={18} className="text-stone-400 dark:text-stone-500 shrink-0" />

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
                className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition shrink-0 cursor-pointer"
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {errors.password && (
              <p
                id="password-error"
                role="alert"
                className="text-red-600 dark:text-rose-400 text-xs mt-1.5"
              >
                {errors.password}
              </p>
            )}
          </div>

          {/* Server Error */}
          {serverError && (
            <div
              role="alert"
              className="bg-red-50 dark:bg-rose-950/40 border border-red-200 dark:border-rose-800/60 text-red-700 dark:text-rose-300 text-xs font-medium p-3 rounded-xl"
            >
              {serverError}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] hover:brightness-105 disabled:opacity-60 text-[#0D1420] font-bold py-3.5 rounded-xl transition shadow-xs cursor-pointer"
          >
            {submitting ? "Signing in..." : "Sign In"}
            {!submitting && <ArrowRight size={18} />}
          </button>
        </form>

            {/* Footer */}
            <p className="text-center text-xs text-stone-400 dark:text-stone-500 mt-8">
              Authorized personnel only.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default Login;
