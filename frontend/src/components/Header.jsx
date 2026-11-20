import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Menu,
  ChevronDown,
  LogOut,
  User,
  Settings,
  Phone,
  Sun,
  Moon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

const pageTitles = {
  "/": "Dashboard",
  "/orders": "Orders",
  "/tables": "Tables",
  "/menu": "Menu Management",
  "/customers": "Customers",
  "/staff": "Staff Management",
  "/invoices": "Invoices",
  "/settings": "Settings",
  "/spa/dashboard": "Spa Dashboard",
  "/spa/bookings": "Spa Bookings",
  "/spa/services": "Spa Services",
  "/spa/customers": "Spa Customers",
  "/spa/staff": "Therapist Management",
  "/spa/therapists": "Therapist Management",
  "/spa/invoices": "Spa Invoice Management",
  "/spa/payments": "Spa Invoice Management",
};

function Header({ onOpenMobileMenu }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const title = pageTitles[location.pathname] || (user?.business_context === "SPA" ? "Spa Dashboard" : "Dashboard");

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const userInitial = user?.full_name
    ? user.full_name.trim().charAt(0).toUpperCase()
    : "R";

  const isSpa = user?.business_context === "SPA";
  const userName = user?.full_name || (isSpa ? "Spa Receptionist" : "Receptionist User");
  const userEmail = user?.email || "";
  const userPhone = user?.phone || "";
  const userRole = isSpa ? "Spa Receptionist" : "Receptionist";

  const handleLogout = () => {
    setDropdownOpen(false);
    logout();
    navigate("/login", { replace: true });
  };

  const handleNavigate = (path) => {
    setDropdownOpen(false);
    navigate(path);
  };

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        setDropdownOpen(false);
      }
    }

    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen]);

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#1C1917] px-4 py-3 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="rounded-lg p-2 text-stone-700 dark:text-stone-300 transition hover:bg-stone-100 dark:hover:bg-stone-800 lg:hidden cursor-pointer"
          aria-label="Open navigation menu"
        >
          <Menu size={20} />
        </button>

        <div>
          <h2 className="text-lg font-bold leading-tight text-stone-900 dark:text-stone-100 md:text-xl tracking-tight">
            {title}
          </h2>

          <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400 font-medium">{today}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Quick Theme Toggle Button in Header */}
        <button
          type="button"
          onClick={toggleTheme}
          title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
          className="rounded-lg p-2 text-stone-600 dark:text-stone-300 transition hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          aria-label="Toggle Theme Mode"
        >
          {theme === "dark" ? (
            <Sun size={18} className="text-amber-400 hover:rotate-45 transition-transform" />
          ) : (
            <Moon size={18} className="text-stone-600 hover:-rotate-12 transition-transform" />
          )}
        </button>

        {/* Profile Dropdown Trigger */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2.5 rounded-lg p-1.5 transition hover:bg-stone-100/80 dark:hover:bg-stone-800/60 cursor-pointer"
            aria-expanded={dropdownOpen}
            aria-haspopup="true"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FEF08A] dark:bg-[#713F12]/50 border border-[#FDE047] dark:border-[#EAB308]/60 text-sm font-bold text-[#854D0E] dark:text-[#FEF08A] shadow-2xs">
              {userInitial}
            </div>

            <div className="hidden text-left sm:block">
              <p className="text-sm font-semibold leading-tight text-stone-900 dark:text-stone-100">
                {userName}
              </p>
              <p className="text-[11px] text-stone-500 dark:text-stone-400 font-medium">
                {userRole}
              </p>
            </div>

            <ChevronDown
              size={15}
              className={`text-stone-500 dark:text-stone-400 transition-transform duration-200 ${
                dropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* User Profile Dropdown Menu */}
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-[#1C1917] p-1.5 shadow-xl z-30 animate-in fade-in-50 duration-150 text-stone-900 dark:text-stone-100">
              {/* Profile Details Header */}
              <div className="border-b border-stone-100 dark:border-stone-800 px-3.5 py-3">
                <p className="truncate text-sm font-bold text-stone-900 dark:text-stone-100">
                  {userName}
                </p>
                <p className="truncate text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  {userEmail}
                </p>
                {userPhone && (
                  <p className="flex items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400 mt-1">
                    <Phone size={11} />
                    <span>{userPhone}</span>
                  </p>
                )}
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="inline-block rounded-full bg-amber-100 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-900/60 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider">
                    Role: {userRole}
                  </span>
                </div>
              </div>

              {/* Navigation Actions */}
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => handleNavigate("/settings?tab=profile")}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-stone-700 dark:text-stone-300 transition hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                >
                  <User size={14} className="text-[#F5B716]" />
                  <span>View Profile</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleNavigate("/settings")}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-stone-700 dark:text-stone-300 transition hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                >
                  <Settings size={14} className="text-stone-400" />
                  <span>Settings</span>
                </button>
              </div>

              {/* Logout Action */}
              <div className="border-t border-stone-100 dark:border-stone-800 pt-1">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                >
                  <LogOut size={14} />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
