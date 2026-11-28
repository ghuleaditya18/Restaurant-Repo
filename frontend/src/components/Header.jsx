import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { normalizeModuleContext } from "../config/moduleRouting";
import api from "../services/api";
import GlobalSearch from "./GlobalSearch";

const CLEARED_STORAGE_KEY = "newaraai_cleared_notifications_v2";

function loadClearedKeys(contextKey) {
  if (!contextKey) return [];
  try {
    const raw = localStorage.getItem(CLEARED_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const list = map && typeof map === "object" ? map[contextKey] : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveClearedKeys(contextKey, keys) {
  if (!contextKey) return;
  try {
    const raw = localStorage.getItem(CLEARED_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const nextMap = map && typeof map === "object" && !Array.isArray(map) ? { ...map } : {};
    nextMap[contextKey] = keys;
    localStorage.setItem(CLEARED_STORAGE_KEY, JSON.stringify(nextMap));
  } catch {
    // ignore storage failure
  }
}

const formatInr = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function buildModuleNotifications(context, data) {
  if (!data) return [];

  if (context === "ACTIVITY" || context === "PACKAGE") {
    return Array.isArray(data?.items) ? data.items : [];
  }

  if (context === "VILLA") {
    const items = [];
    const ooo = Number(data?.out_of_order_units || 0);
    const needsHk = Number(data?.needs_housekeeping_units || 0);
    const outstanding = Number(data?.outstanding_balance || 0);
    const arrivals = Number(data?.arrivals_today || 0);
    const departures = Number(data?.departures_today || 0);

    if (ooo > 0) {
      items.push({
        id: "villa-out-of-order",
        severity: "error",
        title: `${ooo} Unit(s) Out of Order`,
        message: "Blocked from guest reservations until maintenance is resolved.",
        route: "/villas/inventory?tab=housekeeping",
        actionLabel: "Open Housekeeping",
      });
    }
    if (needsHk > 0) {
      items.push({
        id: "villa-housekeeping",
        severity: "warning",
        title: `${needsHk} Unit(s) Require Cleaning / Turnover`,
        message: "Housekeeping turnover or inspection needed before next check-in.",
        route: "/villas/inventory?tab=housekeeping",
        actionLabel: "Open Housekeeping",
      });
    }
    if (outstanding > 0) {
      items.push({
        id: "villa-outstanding-balance",
        severity: "warning",
        title: "Outstanding Villa Folio Balances",
        message: `${formatInr(outstanding)} pending invoice collection across stays.`,
        route: "/villas/invoices",
        actionLabel: "Review Invoices",
      });
    }
    if (arrivals > 0) {
      items.push({
        id: "villa-arrivals-today",
        severity: "info",
        title: `${arrivals} Arrival(s) Scheduled Today`,
        message: `${departures} departure(s) and ${arrivals} check-in(s) scheduled today.`,
        route: "/villas/bookings",
        actionLabel: "View Stays",
      });
    }
    return items;
  }

  if (context === "TRANSPORT") {
    const items = Array.isArray(data?.alerts)
      ? data.alerts.map((al) => ({ ...al, actionLabel: al.actionLabel || "Review" }))
      : [];
    const pendingReqs = Number(data?.statistics?.pending_requests || 0);
    if (pendingReqs > 0) {
      items.push({
        id: "trn-pending-requests",
        severity: "warning",
        title: `${pendingReqs} Pending Trip Request(s)`,
        message: "Assign vehicles and drivers to confirm upcoming trips.",
        route: "/transport/bookings",
        actionLabel: "Review Bookings",
      });
    }
    return items;
  }

  if (context === "RESTAURANT") {
    const stats = data?.statistics || {};
    const items = [];
    const outOfStock = Number(stats.out_of_stock_items_count || 0);
    const lowStock = Number(stats.low_stock_items_count || 0);
    const pendingPayments = Number(stats.pending_payments || 0);
    const pendingOrders = Number(stats.pending_orders || 0);

    if (outOfStock > 0) {
      items.push({
        id: "rest-out-of-stock",
        severity: "error",
        title: `${outOfStock} Inventory Item(s) Out of Stock`,
        message: "Replenish depleted stock items to prevent menu shortages.",
        route: "/inventory",
        actionLabel: "Open Inventory",
      });
    }
    if (lowStock > 0) {
      items.push({
        id: "rest-low-stock",
        severity: "warning",
        title: `${lowStock} Inventory Item(s) Running Low`,
        message: "Stock levels are below reorder threshold.",
        route: "/inventory",
        actionLabel: "Check Stock",
      });
    }
    if (pendingPayments > 0) {
      items.push({
        id: "rest-pending-bills",
        severity: "warning",
        title: `${pendingPayments} Pending Customer Bill(s)`,
        message: "Unsettled restaurant invoices awaiting payment.",
        route: "/invoices",
        actionLabel: "Settle Bills",
      });
    }
    if (pendingOrders > 0) {
      items.push({
        id: "rest-pending-orders",
        severity: "info",
        title: `${pendingOrders} Order(s) Awaiting Confirmation`,
        message: "Review incoming dining orders in the active queue.",
        route: "/orders",
        actionLabel: "View Orders",
      });
    }
    return items;
  }

  if (context === "SPA") {
    const items = [];
    const pendingPay = Number(data?.pending_payments_count || 0);
    const outstanding = Number(data?.outstanding_balance || 0);
    const upcoming = Number(data?.upcoming_bookings || 0);
    const inProgress = Number(data?.in_progress_appointments || 0);

    if (pendingPay > 0) {
      items.push({
        id: "spa-pending-invoices",
        severity: "warning",
        title: `${pendingPay} Pending Spa Invoice(s)`,
        message: `${formatInr(outstanding)} awaiting guest settlement.`,
        route: "/spa/invoices",
        actionLabel: "Settle Invoices",
      });
    }
    if (upcoming > 0) {
      items.push({
        id: "spa-upcoming-bookings",
        severity: "info",
        title: `${upcoming} Upcoming Appointment(s)`,
        message: `${inProgress} session(s) currently in progress.`,
        route: "/spa/bookings",
        actionLabel: "Open Bookings",
      });
    }
    return items;
  }

  return [];
}

function Header({ onOpenMobileMenu }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("all");

  const moduleContext = normalizeModuleContext(user?.business_context) || "";
  const [clearedKeys, setClearedKeys] = useState(() => loadClearedKeys(moduleContext));
  const notificationRef = useRef(null);

  useEffect(() => {
    setClearedKeys(loadClearedKeys(moduleContext));
    setSeverityFilter("all");
  }, [moduleContext]);

  const persistClearedKeys = useCallback(
    (nextKeys) => {
      setClearedKeys(nextKeys);
      saveClearedKeys(moduleContext, nextKeys);
    },
    [moduleContext]
  );

  const fetchNotifications = useCallback(async () => {
    if (!moduleContext) {
      setNotifications([]);
      return;
    }

    const endpointByContext = {
      ACTIVITY: "/api/activities/notifications",
      PACKAGE: "/api/packages/notifications",
      VILLA: "/api/villas/dashboard",
      TRANSPORT: "/api/transport/dashboard",
      RESTAURANT: "/api/dashboard/summary",
      SPA: "/api/spa/dashboard/summary",
    };
    const endpoint = endpointByContext[moduleContext];
    if (!endpoint) {
      setNotifications([]);
      return;
    }

    setLoadingNotifications(true);
    try {
      const res = await api.get(endpoint);
      const items = buildModuleNotifications(moduleContext, res.data);
      setNotifications(items);

      const activeKeys = new Set(items.map((it) => `${it.id}:${it.message}`));
      setClearedKeys((prev) => {
        const pruned = prev.filter((k) => activeKeys.has(k));
        if (pruned.length !== prev.length) {
          saveClearedKeys(moduleContext, pruned);
        }
        return pruned;
      });
    } catch {
      // Keep previous list on transient network error
    } finally {
      setLoadingNotifications(false);
    }
  }, [moduleContext]);

  useEffect(() => {
    if (!moduleContext) {
      setNotifications([]);
      return undefined;
    }
    fetchNotifications();
    const handleRefresh = () => fetchNotifications();
    window.addEventListener("newaraai:notifications-refresh", handleRefresh);
    window.addEventListener("newaraai:activity-notifications-refresh", handleRefresh);
    window.addEventListener("newaraai:package-notifications-refresh", handleRefresh);
    window.addEventListener("focus", handleRefresh);
    const interval = window.setInterval(fetchNotifications, 45000);
    return () => {
      window.removeEventListener("newaraai:notifications-refresh", handleRefresh);
      window.removeEventListener("newaraai:activity-notifications-refresh", handleRefresh);
      window.removeEventListener("newaraai:package-notifications-refresh", handleRefresh);
      window.removeEventListener("focus", handleRefresh);
      window.clearInterval(interval);
    };
  }, [moduleContext, fetchNotifications]);

  // Dynamic date in configured Asia/Kolkata timezone (e.g. "Sat, 21 Nov, 2026")
  const today = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date());

  const activeAlertItems = useMemo(
    () => notifications.filter((item) => !clearedKeys.includes(`${item.id}:${item.message}`)),
    [notifications, clearedKeys]
  );

  const urgentCount = useMemo(
    () => activeAlertItems.filter((item) => item.severity === "error" || item.severity === "warning").length,
    [activeAlertItems]
  );

  const displayedAlertItems = useMemo(
    () =>
      severityFilter === "attention"
        ? activeAlertItems.filter((item) => item.severity === "error" || item.severity === "warning")
        : activeAlertItems,
    [activeAlertItems, severityFilter]
  );

  const dismissedCount = notifications.length - activeAlertItems.length;
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
              if (next) fetchNotifications();
            }}
            className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[#151D29] text-[#8A9AB2] hover:bg-[#1E293B] hover:text-white border border-[#1E293B] transition cursor-pointer shadow-xs"
            aria-label="View notifications"
            aria-expanded={notificationsOpen}
            title="Notifications"
          >
            <Bell size={17} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#F59E0B] px-1 text-[10px] font-extrabold text-[#0D1420] ring-2 ring-[#0D1420]">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Interactive Notification Dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-[#1E293B] bg-[#101722] p-3.5 shadow-2xl z-30 animate-in fade-in zoom-in-95 duration-100 text-white">
              <div className="flex items-center justify-between border-b border-[#1E293B] pb-2.5 gap-2">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#8A9AB2]">
                    Operational Notifications
                  </h3>
                  <p className="text-[11px] font-semibold text-[#F59E0B] mt-0.5">
                    {unreadCount} Pending Alert{unreadCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={fetchNotifications}
                    disabled={loadingNotifications}
                    title="Refresh notifications"
                    aria-label="Refresh notifications"
                    className="rounded-lg border border-[#1E293B] bg-[#151D29] p-1.5 text-[#8A9AB2] hover:border-[#F59E0B]/60 hover:text-white transition cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={loadingNotifications ? "animate-spin" : ""} />
                  </button>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        persistClearedKeys(notifications.map((it) => `${it.id}:${it.message}`))
                      }
                      className="rounded-lg border border-[#1E293B] bg-[#151D29] px-2 py-1 text-[10px] font-semibold text-stone-300 hover:border-[#F59E0B]/60 hover:text-white transition cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>
              </div>

              {/* Filter Tabs when alerts exist */}
              {unreadCount > 0 && urgentCount > 0 && urgentCount < unreadCount && (
                <div className="flex items-center gap-1.5 mt-2.5">
                  <button
                    type="button"
                    onClick={() => setSeverityFilter("all")}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                      severityFilter === "all"
                        ? "bg-[#F59E0B] text-[#0D1420]"
                        : "bg-[#151D29] text-[#8A9AB2] hover:text-white"
                    }`}
                  >
                    All ({unreadCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeverityFilter("attention")}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                      severityFilter === "attention"
                        ? "bg-[#F59E0B] text-[#0D1420]"
                        : "bg-[#151D29] text-[#8A9AB2] hover:text-white"
                    }`}
                  >
                    Needs Attention ({urgentCount})
                  </button>
                </div>
              )}

              {displayedAlertItems.length === 0 ? (
                <div className="py-6 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-[#30251C] text-[#F59E0B] mb-2">
                    <CheckCircle2 size={18} />
                  </div>
                  <p className="text-xs font-semibold text-white">
                    You&apos;re all caught up
                  </p>
                  <p className="text-[11px] text-[#8A9AB2] mt-0.5">
                    {dismissedCount > 0
                      ? `${dismissedCount} alert(s) dismissed for this session.`
                      : "No pending operational items require your attention."}
                  </p>
                  {dismissedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => persistClearedKeys([])}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#151D29] px-3 py-1.5 text-[11px] font-semibold text-[#F59E0B] hover:border-[#F59E0B]/60 transition cursor-pointer"
                    >
                      <RotateCcw size={12} />
                      <span>Restore Dismissed ({dismissedCount})</span>
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="mt-2.5 max-h-80 overflow-y-auto space-y-2 pr-0.5">
                    {displayedAlertItems.map((item) => {
                      const isError = item.severity === "error";
                      const isWarn = item.severity === "warning" || isError;
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
                                isError
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
                                  <span>{item.actionLabel || "Resolve"}</span>
                                  <ArrowRight size={10} />
                                </span>
                              )}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              persistClearedKeys([...clearedKeys, itemKey]);
                            }}
                            title="Dismiss notification"
                            aria-label={`Dismiss ${item.title}`}
                            className="mt-0.5 rounded-md p-1 text-[#8A9AB2] hover:bg-[#1E293B] hover:text-white cursor-pointer shrink-0"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {dismissedCount > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-[#1E293B] flex items-center justify-between">
                      <span className="text-[10px] text-[#8A9AB2]">
                        {dismissedCount} dismissed
                      </span>
                      <button
                        type="button"
                        onClick={() => persistClearedKeys([])}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#F59E0B] hover:underline cursor-pointer"
                      >
                        <RotateCcw size={10} />
                        <span>Restore All</span>
                      </button>
                    </div>
                  )}
                </>
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
