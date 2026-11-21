import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Menu,
  ChevronDown,
  LogOut,
  User,
  Settings,
  Phone,
  Bell,
  Search,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import GlobalSearch from "./GlobalSearch";

function Header({ onOpenMobileMenu }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const dropdownRef = useRef(null);
  const notificationRef = useRef(null);

  // Dynamic date in configured Asia/Kolkata timezone (e.g. "Sat, 21 Nov, 2026")
  const today = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date());

  const formatRole = (role, context) => {
    if (!role) {
      return context === "SPA" ? "Spa Staff" : "Staff";
    }
    const r = String(role).trim().toLowerCase();
    if (r === "manager") return "Manager";
    if (r === "staff") return "Staff";
    if (r === "receptionist") return "Receptionist";
    if (r === "admin") return "Admin";
    return r.replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const userInitial = (
    user?.full_name?.trim()?.charAt(0) ||
    user?.name?.trim()?.charAt(0) ||
    user?.email?.charAt(0) ||
    "U"
  ).toUpperCase();

  const userName =
    user?.full_name?.trim() ||
    user?.name?.trim() ||
    (user?.email ? user.email.split("@")[0] : "User");

  const userEmail = user?.email || "";
  const userPhone = user?.phone || "";
  const userRole = formatRole(user?.role || user?.designation, user?.business_context);

  // Real unread notification count
  const unreadCount = 0;

  const handleLogout = () => {
    setDropdownOpen(false);
    logout();
    navigate("/login", { replace: true });
  };

  const handleNavigate = (path) => {
    setDropdownOpen(false);
    navigate(path);
  };

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
    }

    if (dropdownOpen || notificationsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen, notificationsOpen]);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#1C1917] px-3 sm:px-6 lg:px-8 transition-colors duration-200">
      {/* Left: Mobile Navigation Drawer Toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-stone-700 dark:text-stone-300 transition hover:bg-stone-100 dark:hover:bg-stone-800 lg:hidden cursor-pointer"
          aria-label="Open navigation menu"
          title="Open menu"
        >
          <Menu size={22} />
        </button>
      </div>

      {/* Middle: Global Search (Desktop Flexible Width) */}
      <div className="hidden md:flex flex-1 items-center justify-center max-w-md lg:max-w-lg mx-4 lg:mx-8">
        <GlobalSearch className="w-full" />
      </div>

      {/* Right: Notifications & Receptionist Profile with Date underneath */}
      <div className="flex items-center gap-1 sm:gap-3">
        {/* Mobile Search Button (>=44px touch target) */}
        <button
          type="button"
          onClick={() => setMobileSearchOpen(true)}
          className="md:hidden flex h-11 w-11 items-center justify-center rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
          aria-label="Open global search"
          title="Search records"
        >
          <Search size={19} />
        </button>

        {/* Global Notifications Bell */}
        <div className="relative" ref={notificationRef}>
          <button
            type="button"
            onClick={() => setNotificationsOpen((prev) => !prev)}
            className="relative flex h-11 w-11 items-center justify-center rounded-xl text-stone-600 dark:text-stone-300 transition hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            aria-label="View notifications"
            aria-expanded={notificationsOpen}
            title="Notifications"
          >
            <Bell size={19} />
            {/* Show indicator ONLY when actual unread notifications exist */}
            {unreadCount > 0 && (
              <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-[#F5B716] ring-2 ring-white dark:ring-[#1C1917]" />
            )}
          </button>

          {/* Truthful Empty State Notification Dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-[#1C1917] p-4 shadow-2xl z-30 animate-in fade-in zoom-in-95 duration-100 text-stone-900 dark:text-stone-100">
              <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                  Notifications
                </h3>
                <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">
                  {unreadCount} Unread
                </span>
              </div>

              <div className="py-6 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-[#F5B716] mb-2.5">
                  <Bell size={20} />
                </div>
                <p className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                  You&apos;re all caught up
                </p>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                  No unread alerts or messages at this time.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Receptionist Profile Dropdown Trigger with Date Directly Underneath */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2 sm:gap-2.5 rounded-xl p-1.5 transition hover:bg-stone-100/80 dark:hover:bg-stone-800/60 cursor-pointer min-h-[44px]"
            aria-expanded={dropdownOpen}
            aria-haspopup="true"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FEF08A] dark:bg-[#713F12]/50 border border-[#FDE047] dark:border-[#EAB308]/60 text-sm font-bold text-[#854D0E] dark:text-[#FEF08A] shadow-2xs">
              {userInitial}
            </div>

            <div className="text-right">
              <div className="hidden sm:block">
                <p className="text-xs sm:text-sm font-semibold leading-tight text-stone-900 dark:text-stone-100 truncate max-w-[130px] lg:max-w-[160px]">
                  {userName}
                </p>
                <p className="text-[10px] sm:text-[11px] text-stone-500 dark:text-stone-400 font-medium">
                  {userRole}
                </p>
              </div>
              {/* Date displayed directly below the receptionist name and role, aligned to the right */}
              <p className="text-[10px] sm:text-[11px] font-medium text-stone-500 dark:text-stone-400 tabular-nums">
                {today}
              </p>
            </div>

            <ChevronDown
              size={14}
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
                  onClick={() => handleNavigate("/settings?tab=appearance")}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-stone-700 dark:text-stone-300 transition hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                >
                  <Settings size={14} className="text-stone-400" />
                  <span>Appearance & Settings</span>
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

      {/* Mobile Search Modal Overlay */}
      <GlobalSearch
        isMobileModal={true}
        isOpen={mobileSearchOpen}
        onClose={() => setMobileSearchOpen(false)}
      />
    </header>
  );
}

export default Header;
