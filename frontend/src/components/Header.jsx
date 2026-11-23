import { useEffect, useRef, useState } from "react";
import {
  Menu,
  Bell,
  Search,
  Calendar,
} from "lucide-react";
import GlobalSearch from "./GlobalSearch";

function Header({ onOpenMobileMenu }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const notificationRef = useRef(null);

  // Dynamic date in configured Asia/Kolkata timezone (e.g. "Sat, 21 Nov, 2026")
  const today = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date());

  // Real unread notification count
  const unreadCount = 0;

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
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#1E293B] bg-[#0D1420] text-white px-3 sm:px-6 lg:px-8 transition-colors duration-200">
      {/* Left: Mobile Navigation Drawer Toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-[#8A9AB2] hover:bg-[#151D29] hover:text-white transition lg:hidden cursor-pointer"
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

      {/* Right: Date, Notifications & Mobile Search */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Mobile Search Button (>=44px touch target) */}
        <button
          type="button"
          onClick={() => setMobileSearchOpen(true)}
          className="md:hidden flex h-11 w-11 items-center justify-center rounded-xl text-[#8A9AB2] hover:bg-[#151D29] hover:text-white transition cursor-pointer"
          aria-label="Open global search"
          title="Search records"
        >
          <Search size={19} />
        </button>

        {/* Dynamic Date Badge */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-[#8A9AB2] px-3 py-2 rounded-xl bg-[#151D29] border border-[#1E293B]/60 tabular-nums">
          <Calendar size={13} className="text-[#F59E0B]" />
          <span>{today}</span>
        </div>

        {/* Global Notifications Bell */}
        <div className="relative" ref={notificationRef}>
          <button
            type="button"
            onClick={() => setNotificationsOpen((prev) => !prev)}
            className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-[#151D29] text-[#8A9AB2] hover:bg-[#1E293B] hover:text-white border border-[#1E293B]/60 transition cursor-pointer"
            aria-label="View notifications"
            aria-expanded={notificationsOpen}
            title="Notifications"
          >
            <Bell size={19} />
            {/* Show indicator ONLY when actual unread notifications exist */}
            {unreadCount > 0 && (
              <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-[#F59E0B] ring-2 ring-[#0D1420]" />
            )}
          </button>

          {/* Empty State Notification Dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl border border-[#1E293B] bg-[#101722] p-4 shadow-2xl z-30 animate-in fade-in zoom-in-95 duration-100 text-white">
              <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#8A9AB2]">
                  Notifications
                </h3>
                <span className="text-[11px] font-semibold text-[#8A9AB2]">
                  {unreadCount} Unread
                </span>
              </div>

              <div className="py-6 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-[#30251C] text-[#F59E0B] mb-2.5">
                  <Bell size={20} />
                </div>
                <p className="text-xs font-semibold text-white">
                  You&apos;re all caught up
                </p>
                <p className="text-[11px] text-[#8A9AB2] mt-0.5">
                  No unread alerts or messages at this time.
                </p>
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
