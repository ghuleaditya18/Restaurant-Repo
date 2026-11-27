import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Menu,
  Bell,
  Search,
  Calendar,
  AlertTriangle,
  Info,
  ArrowRight,
  CheckCircle2,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import GlobalSearch from "./GlobalSearch";

function Header({ onOpenMobileMenu }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [activityNotifications, setActivityNotifications] = useState([]);
  const [packageNotifications, setPackageNotifications] = useState([]);
  const [clearedPackageKeys, setClearedPackageKeys] = useState(() => {
    try {
      const saved = localStorage.getItem("newaraai_pkg_cleared_notifications_v1");
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const notificationRef = useRef(null);
  const bizContext = String(user?.business_context || "").toUpperCase();
  const isActivityContext = bizContext === "ACTIVITY";
  const isPackageContext = bizContext === "PACKAGE" || bizContext === "PACKAGES";

  const persistClearedPackageKeys = useCallback((nextKeys) => {
    setClearedPackageKeys(nextKeys);
    try {
      localStorage.setItem("newaraai_pkg_cleared_notifications_v1", JSON.stringify(nextKeys));
    } catch {
      // ignore storage failure
    }
  }, []);

  const fetchActivityNotifications = useCallback(async () => {
    if (!isActivityContext) {
      setActivityNotifications([]);
      return;
    }
    try {
      const res = await api.get("/api/activities/notifications");
      setActivityNotifications(Array.isArray(res.data?.items) ? res.data.items : []);
    } catch {
      // Keep previous list on transient network error
    }
  }, [isActivityContext]);

  const fetchPackageNotifications = useCallback(async () => {
    if (!isPackageContext) {
      setPackageNotifications([]);
      return;
    }
    try {
      const res = await api.get("/api/packages/notifications");
      const items = Array.isArray(res.data?.items) ? res.data.items : [];
      setPackageNotifications(items);
      const activeKeys = new Set(items.map((it) => `${it.id}:${it.message}`));
      setClearedPackageKeys((prev) => {
        const pruned = prev.filter((k) => activeKeys.has(k));
        if (pruned.length !== prev.length) {
          try {
            localStorage.setItem("newaraai_pkg_cleared_notifications_v1", JSON.stringify(pruned));
          } catch {
            // ignore
          }
        }
        return pruned;
      });
    } catch {
      // Keep previous list on transient network error
    }
  }, [isPackageContext]);

  useEffect(() => {
    if (!isActivityContext) {
      setActivityNotifications([]);
      return undefined;
    }
    fetchActivityNotifications();
    const handleRefresh = () => fetchActivityNotifications();
    window.addEventListener("newaraai:activity-notifications-refresh", handleRefresh);
    const interval = window.setInterval(fetchActivityNotifications, 45000);
    return () => {
      window.removeEventListener("newaraai:activity-notifications-refresh", handleRefresh);
      window.clearInterval(interval);
    };
  }, [isActivityContext, fetchActivityNotifications]);

  useEffect(() => {
    if (!isPackageContext) {
      setPackageNotifications([]);
      return undefined;
    }
    fetchPackageNotifications();
    const handleRefresh = () => fetchPackageNotifications();
    window.addEventListener("newaraai:package-notifications-refresh", handleRefresh);
    const interval = window.setInterval(fetchPackageNotifications, 45000);
    return () => {
      window.removeEventListener("newaraai:package-notifications-refresh", handleRefresh);
      window.clearInterval(interval);
    };
  }, [isPackageContext, fetchPackageNotifications]);

  // Dynamic date in configured Asia/Kolkata timezone (e.g. "Sat, 21 Nov, 2026")
  const today = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date());

  const visiblePackageNotifications = isPackageContext
    ? packageNotifications.filter((item) => !clearedPackageKeys.includes(`${item.id}:${item.message}`))
    : [];
  const activeAlertItems = isActivityContext
    ? activityNotifications
    : isPackageContext
      ? visiblePackageNotifications
      : [];
  const hasOperationalAlerts = isActivityContext || isPackageContext;

  // Real unread notification count
  const unreadCount = activeAlertItems.length;

  // Close notifications dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
    }

    if (notificationsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [notificationsOpen]);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[#1E293B] bg-[#0D1420] text-white px-4 sm:px-5 transition-colors duration-200">
      {/* Left: Mobile Navigation Drawer Toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-[#8A9AB2] hover:bg-[#151D29] hover:text-white transition lg:hidden cursor-pointer"
          aria-label="Open navigation menu"
          title="Open menu"
        >
          <Menu size={19} />
        </button>
      </div>

      {/* Middle: Global Search (Desktop Flexible Width) */}
      <div className="hidden md:flex flex-1 items-center justify-center max-w-md lg:max-w-lg mx-4">
        <GlobalSearch className="w-full" />
      </div>

      {/* Right: Date, Notifications & Mobile Search */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Mobile Search Button (>=36px touch target) */}
        <button
          type="button"
          onClick={() => setMobileSearchOpen(true)}
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-xl bg-[#151D29] text-[#8A9AB2] hover:bg-[#1E293B] hover:text-white border border-[#1E293B] transition cursor-pointer"
          aria-label="Open global search"
          title="Search records"
        >
          <Search size={17} />
        </button>

        {/* Dynamic Date Badge */}
        <div className="hidden sm:flex h-9 items-center gap-2 text-xs font-semibold text-stone-200 px-3 rounded-xl bg-[#151D29] border border-[#1E293B] tabular-nums shadow-xs">
          <Calendar size={13} className="text-[#F59E0B]" />
          <span>{today}</span>
        </div>

        {/* Global Notifications Bell */}
        <div className="relative" ref={notificationRef}>
          <button
            type="button"
            onClick={() => {
              const next = !notificationsOpen;
              setNotificationsOpen(next);
              if (next && isActivityContext) fetchActivityNotifications();
              if (next && isPackageContext) fetchPackageNotifications();
            }}
            className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[#151D29] text-[#8A9AB2] hover:bg-[#1E293B] hover:text-white border border-[#1E293B] transition cursor-pointer shadow-xs"
            aria-label="View notifications"
            aria-expanded={notificationsOpen}
            title="Notifications"
          >
            <Bell size={17} />
            {/* Show badge/indicator ONLY when actual pending notifications exist */}
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#F59E0B] px-1 text-[10px] font-extrabold text-[#0D1420] ring-2 ring-[#0D1420]">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notification Dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-[#1E293B] bg-[#101722] p-4 shadow-2xl z-30 animate-in fade-in zoom-in-95 duration-100 text-white">
              <div className="flex items-center justify-between border-b border-[#1E293B] pb-3 gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#8A9AB2]">
                  {hasOperationalAlerts ? "Pending Operational Alerts" : "Notifications"}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#F59E0B]">
                    {unreadCount} {hasOperationalAlerts ? "Pending" : "Unread"}
                  </span>
                  {isPackageContext && unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        persistClearedPackageKeys(
                          packageNotifications.map((it) => `${it.id}:${it.message}`)
                        )
                      }
                      className="rounded-md border border-[#1E293B] bg-[#151D29] px-2 py-0.5 text-[10px] font-semibold text-stone-300 hover:border-[#F59E0B]/60 hover:text-white cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>
              </div>

              {unreadCount === 0 ? (
                <div className="py-6 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-[#30251C] text-[#F59E0B] mb-2.5">
                    {hasOperationalAlerts ? <CheckCircle2 size={20} /> : <Bell size={20} />}
                  </div>
                  <p className="text-xs font-semibold text-white">
                    You&apos;re all caught up
                  </p>
                  <p className="text-[11px] text-[#8A9AB2] mt-0.5">
                    {isActivityContext
                      ? "No pending assignments, waivers, or operational tasks remaining."
                      : isPackageContext
                        ? "No pending package alerts, expiries, or outstanding balances."
                        : "No unread alerts or messages at this time."}
                  </p>
                </div>
              ) : (
                <div className="mt-2.5 max-h-80 overflow-y-auto space-y-2 pr-0.5">
                  {activeAlertItems.map((item) => {
                    const isWarn = item.severity === "warning" || item.severity === "error";
                    const itemKey = `${item.id}:${item.message}`;
                    return (
                      <div
                        key={item.id}
                        className="w-full rounded-xl border border-[#1E293B] bg-[#151D29] hover:border-[#F59E0B]/60 hover:bg-[#192334] p-2.5 transition flex items-start gap-2.5"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setNotificationsOpen(false);
                            if (item.route) navigate(item.route);
                          }}
                          className="flex items-start gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                        >
                          <div
                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                              item.severity === "error"
                                ? "bg-rose-500/15 text-rose-400"
                                : isWarn
                                  ? "bg-amber-500/15 text-amber-400"
                                  : "bg-sky-500/15 text-sky-400"
                            }`}
                          >
                            {isWarn ? <AlertTriangle size={14} /> : <Info size={14} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-white leading-snug">
                              {item.title}
                            </p>
                            <p className="text-[11px] text-[#8A9AB2] mt-0.5 leading-snug">
                              {item.message}
                            </p>
                            {item.route && (
                              <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-[#F59E0B]">
                                <span>Resolve</span>
                                <ArrowRight size={10} />
                              </span>
                            )}
                          </div>
                        </button>
                        {isPackageContext && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              persistClearedPackageKeys([...clearedPackageKeys, itemKey]);
                            }}
                            title="Clear notification"
                            aria-label={`Clear ${item.title}`}
                            className="mt-0.5 rounded-md p-1 text-[#8A9AB2] hover:bg-[#1E293B] hover:text-white cursor-pointer shrink-0"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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
