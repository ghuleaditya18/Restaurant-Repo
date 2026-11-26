import { useState, useRef, useEffect } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { resolveImageUrl } from "../utils/mediaUtils";
import { APP_NAME } from "../config/branding";
import { normalizeModuleContext } from "../config/moduleRouting";
import {
  LayoutDashboard,
  ClipboardList,
  Grid3X3,
  Utensils,
  Users,
  UserCog,
  FileText,
  Settings,
  LogOut,
  X,
  Menu,
  ChefHat,
  Sparkles,
  Package,
  ChevronUp,
  User,
  BedDouble,
  CalendarDays,
  Wrench,
  BarChart3,
  Tag,
  Compass,
  UserCheck,
} from "lucide-react";

const restaurantMenuItems = [
  { name: "Dashboard", path: "/", icon: LayoutDashboard, end: true },
  { name: "Orders", path: "/orders", icon: ClipboardList },
  { name: "Tables", path: "/tables", icon: Grid3X3 },
  { name: "Menu Management", path: "/menu", icon: Utensils },
  { name: "Inventory", path: "/inventory", icon: Package },
  { name: "Customers", path: "/customers", icon: Users },
  { name: "Staff Management", path: "/staff", icon: UserCog },
  { name: "Invoices", path: "/invoices", icon: FileText },
  { name: "Settings", path: "/settings", icon: Settings },
];

const spaMenuItems = [
  { name: "Dashboard", path: "/spa/dashboard", icon: LayoutDashboard, end: true },
  { name: "Bookings", path: "/spa/bookings", icon: ClipboardList },
  { name: "Services", path: "/spa/services", icon: Sparkles },
  { name: "Customers", path: "/spa/customers", icon: Users },
  { name: "Therapist Management", path: "/spa/staff", icon: UserCog },
  { name: "Invoices", path: "/spa/invoices", icon: FileText },
  { name: "Settings", path: "/settings", icon: Settings },
];

const villasMenuItems = [
  { name: "Dashboard", path: "/villas/dashboard", icon: LayoutDashboard, end: true },
  { name: "Villas & Units", path: "/villas/inventory", icon: BedDouble },
  { name: "Stays & Bookings", path: "/villas/bookings", icon: CalendarDays },
  { name: "Guests", path: "/villas/guests", icon: Users },
  { name: "Guest Services", path: "/villas/services", icon: Wrench },
  { name: "Invoices", path: "/villas/invoices", icon: FileText },
  { name: "Reports", path: "/villas/reports", icon: BarChart3 },
  { name: "Settings", path: "/villas/settings", icon: Settings },
];

const packagesMenuItems = [
  { name: "Dashboard", path: "/packages/dashboard", icon: LayoutDashboard, end: true },
  { name: "Packages", path: "/packages/catalog", icon: Package },
  { name: "Package Bookings", path: "/packages/bookings", icon: CalendarDays },
  { name: "Seasonal Offers", path: "/packages/offers", icon: Tag },
  { name: "Customers", path: "/packages/customers", icon: Users },
  { name: "Invoices", path: "/packages/invoices", icon: FileText },
  { name: "Reports", path: "/packages/reports", icon: BarChart3 },
  { name: "Settings", path: "/packages/settings", icon: Settings },
];

const activitiesMenuItems = [
  { name: "Dashboard", path: "/activities/dashboard", icon: LayoutDashboard, end: true },
  { name: "Activities", path: "/activities/catalog", icon: Compass },
  { name: "Schedule", path: "/activities/schedule", icon: CalendarDays },
  { name: "Bookings", path: "/activities/bookings", icon: ClipboardList },
  { name: "Session Roster", path: "/activities/roster", icon: UserCheck },
  { name: "Customers", path: "/activities/customers", icon: Users },
  { name: "Invoices", path: "/activities/invoices", icon: FileText },
  { name: "Reports", path: "/activities/reports", icon: BarChart3 },
  { name: "Settings", path: "/activities/settings", icon: Settings },
];

function formatRole(role, context) {
  if (!role) {
    return context === "SPA" ? "Spa Staff" : "Staff";
  }
  const r = String(role).trim().toLowerCase();
  if (r === "manager") return "Manager";
  if (r === "staff") return "Staff";
  if (r === "receptionist") return "Receptionist";
  if (r === "admin") return "Admin";
  return r.replace(/\b\w/g, (c) => c.toUpperCase());
}

function SidebarNav({ items, onClose, collapsed = false }) {
  return (
    <nav className="space-y-1" aria-label="Main Navigation">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.name}
            to={item.path}
            end={item.end}
            onClick={onClose}
            title={collapsed ? item.name : undefined}
            className={({ isActive }) =>
              `group relative flex items-center rounded-xl text-xs sm:text-[13px] font-medium transition-all duration-200 cursor-pointer ${
                collapsed
                  ? "justify-center p-2"
                  : "gap-2.5 px-3 py-2"
              } ${
                isActive
                  ? "bg-[#30251C] text-[#FFB02E] font-semibold border-l-3 border-[#F59E0B] shadow-xs"
                  : "text-[#8A9AB2] hover:bg-[#151D29] hover:text-white"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={collapsed ? 19 : 17}
                  className={`shrink-0 transition-transform group-hover:scale-105 ${
                    isActive ? "text-[#F59E0B]" : "text-[#8A9AB2] group-hover:text-white"
                  }`}
                />
                {!collapsed && <span className="truncate">{item.name}</span>}

                {/* Accessible tooltip when collapsed */}
                {collapsed && (
                  <span className="pointer-events-none absolute left-full ml-2 hidden rounded-md bg-[#101722] px-2.5 py-1 text-xs font-semibold text-white shadow-lg group-hover:block z-50 whitespace-nowrap border border-[#1E293B]">
                    {item.name}
                  </span>
                )}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

function SidebarProfile({ user, collapsed = false, onNavigate, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const userName =
    user?.full_name?.trim() ||
    user?.name?.trim() ||
    (user?.email ? user.email.split("@")[0] : "User");

  const userInitial = (
    user?.full_name?.trim()?.charAt(0) ||
    user?.name?.trim()?.charAt(0) ||
    user?.email?.charAt(0) ||
    "U"
  ).toUpperCase();

  const userRole = formatRole(user?.role || user?.designation, user?.business_context);
  const avatarUrl = resolveImageUrl(user?.avatar_url);

  const Avatar = (
    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full overflow-hidden bg-gradient-to-br from-[#FFB02E] to-[#D97706] border border-[#F59E0B]/50 text-xs font-bold text-[#0D1420] shadow-2xs">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={userName}
          className="h-full w-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <span>{userInitial}</span>
      )}
    </div>
  );

  return (
    <div className="relative" ref={ref}>
      {/* Profile Popover / Dropdown Menu */}
      {open && (
        <div
          role="menu"
          aria-label="User Account Menu"
          className={`absolute z-50 rounded-2xl border border-[#1E293B] bg-[#101722] p-2 shadow-2xl animate-in fade-in-50 duration-150 text-white ${
            collapsed
              ? "left-full bottom-0 ml-2 w-64"
              : "bottom-full left-0 right-0 mb-2 w-full min-w-[210px]"
          }`}
        >
          {/* User Details Header with Avatar, Name, Email and Badge */}
          <div className="border-b border-[#1E293B] px-2.5 py-2.5">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full overflow-hidden bg-gradient-to-br from-[#FFB02E] to-[#D97706] border border-[#F59E0B]/50 text-xs font-bold text-[#0D1420] shadow-xs">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={userName}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <span>{userInitial}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs sm:text-sm font-bold text-white">{userName}</p>
                <p className="truncate text-[11px] text-[#8A9AB2] mt-0.5">{user?.email || "No email"}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block rounded-full bg-[#30251C] border border-[#F59E0B]/40 px-2 py-0.5 text-[9px] font-bold text-[#FFB02E] uppercase tracking-wider">
                {userRole}
              </span>
            </div>
          </div>

          {/* View Profile Action */}
          <div className="pt-1.5 pb-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                const ctx = normalizeModuleContext(user?.business_context);
                onNavigate(
                  ctx === "VILLA"
                    ? "/villas/settings?tab=profile"
                    : ctx === "PACKAGE"
                      ? "/packages/settings?tab=profile"
                      : ctx === "ACTIVITY"
                        ? "/activities/settings?tab=profile"
                        : "/settings?tab=profile"
                );
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-[#8A9AB2] transition hover:bg-[#151D29] hover:text-white cursor-pointer min-h-[36px]"
            >
              <User size={15} className="text-[#F59E0B] shrink-0" />
              <span>View Profile</span>
            </button>
          </div>

          {/* Logout Action */}
          <div className="border-t border-[#1E293B] pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout?.();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-rose-400 hover:text-rose-300 transition hover:bg-rose-950/30 cursor-pointer min-h-[36px]"
            >
              <LogOut size={15} className="shrink-0" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}

      {/* Trigger Row */}
      {collapsed ? (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="group relative flex items-center justify-center rounded-xl p-1.5 hover:bg-[#151D29] transition cursor-pointer"
          title={`${userName} (${userRole})`}
          aria-label="User Profile"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {Avatar}
          <span className="pointer-events-none absolute left-full ml-2 hidden rounded-md bg-[#101722] px-2.5 py-1 text-xs font-semibold text-white shadow-lg group-hover:block z-50 whitespace-nowrap border border-[#1E293B]">
            {userName} ({userRole})
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-[#151D29] transition cursor-pointer min-h-[38px] text-left"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {Avatar}
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-semibold leading-tight text-white truncate">
                {userName}
              </p>
              <p className="text-[10px] sm:text-[11px] text-[#8A9AB2] font-medium truncate">
                {userRole}
              </p>
            </div>
          </div>
          <ChevronUp
            size={16}
            className={`text-[#8A9AB2] shrink-0 transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      )}
    </div>
  );
}

function Sidebar({
  mobileOpen = false,
  onClose,
  collapsed = false,
  onToggleCollapse,
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    onClose?.();
    navigate("/login", { replace: true });
  };

  const handleNavigate = (path) => {
    onClose?.();
    navigate(path);
  };

  const normalizedContext = normalizeModuleContext(user?.business_context);
  const isSpa = normalizedContext === "SPA";
  const isVilla = normalizedContext === "VILLA";
  const isPackage = normalizedContext === "PACKAGE";
  const isActivity = normalizedContext === "ACTIVITY";
  const visibleMenuItems = isSpa
    ? spaMenuItems
    : isVilla
      ? villasMenuItems
      : isPackage
        ? packagesMenuItems
        : isActivity
          ? activitiesMenuItems
          : restaurantMenuItems;
  const brandTitle = APP_NAME;
  const brandLink = isSpa
    ? "/spa/dashboard"
    : isVilla
      ? "/villas/dashboard"
      : isPackage
        ? "/packages/dashboard"
        : isActivity
          ? "/activities/dashboard"
          : "/";
  const BrandIcon = isSpa
    ? Sparkles
    : isVilla
      ? BedDouble
      : isPackage
        ? Package
        : isActivity
          ? Compass
          : ChefHat;
  const navHeading = isSpa
    ? "Spa Navigation"
    : isVilla
      ? "Villas Navigation"
      : isPackage
        ? "Packages Navigation"
        : isActivity
          ? "Activities Navigation"
          : "Restaurant Navigation";

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-[#101722] text-white shadow-2xl transition-transform duration-300 ease-in-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Branding & Close Button */}
        <div className="flex h-14 items-center justify-between border-b border-[#1E293B]/70 px-4">
          <Link
            to={brandLink}
            onClick={onClose}
            className="group flex items-center gap-2.5 transition-opacity hover:opacity-95 min-w-0 cursor-pointer"
            title={`${brandTitle} - Dashboard`}
          >
            <div className="rounded-xl bg-gradient-to-br from-[#FFB02E] via-[#F59E0B] to-[#D97706] p-1.5 text-[#0D1420] shadow-xs transition-opacity shrink-0 font-bold">
              <BrandIcon size={18} />
            </div>
            <div className="min-w-0">
              <span className="block text-sm font-bold tracking-wide text-white truncate">{brandTitle}</span>
            </div>
          </Link>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#8A9AB2] hover:bg-[#151D29] hover:text-white transition-colors cursor-pointer"
            aria-label="Close sidebar"
            title="Close navigation drawer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-2.5">
          <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[1.5px] text-[#8A9AB2]">
            {navHeading}
          </p>
          <SidebarNav items={visibleMenuItems} onClose={onClose} collapsed={false} />
        </div>

        {/* Bottom Profile & Actions */}
        <div className="border-t border-[#1E293B]/70 p-2">
          <SidebarProfile
            user={user}
            collapsed={false}
            onNavigate={handleNavigate}
            onLogout={handleLogout}
          />
        </div>
      </aside>

      {/* Desktop Sidebar (Collapsible) */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-[#101722] text-white transition-all duration-300 ease-in-out lg:flex overflow-x-hidden border-r border-[#1E293B]/50 ${
          collapsed ? "w-[72px]" : "w-[240px]"
        }`}
      >
        {/* Branding & Hamburger Header */}
        {collapsed ? (
          <div className="flex flex-col items-center justify-center gap-2 border-b border-[#1E293B]/70 py-2.5 px-2">
            <Link
              to={brandLink}
              className="group flex items-center justify-center rounded-xl bg-gradient-to-br from-[#FFB02E] via-[#F59E0B] to-[#D97706] p-1.5 text-[#0D1420] shadow-xs transition-opacity cursor-pointer font-bold"
              title={`${brandTitle} - Dashboard`}
              aria-label={`${brandTitle} - Dashboard`}
            >
              <BrandIcon size={18} />
            </Link>

            <button
              type="button"
              onClick={onToggleCollapse}
              className="rounded-lg p-1.5 text-[#8A9AB2] hover:bg-[#151D29] hover:text-white transition-colors cursor-pointer"
              title="Expand Sidebar"
              aria-label="Expand Sidebar"
            >
              <Menu size={19} />
            </button>
          </div>
        ) : (
          <div className="flex h-14 items-center justify-between border-b border-[#1E293B]/70 px-4">
            <Link
              to={brandLink}
              className="group flex items-center gap-2.5 transition-opacity hover:opacity-95 min-w-0 cursor-pointer"
              title={`${brandTitle} - Dashboard`}
            >
              <div className="rounded-xl bg-gradient-to-br from-[#FFB02E] via-[#F59E0B] to-[#D97706] p-1.5 text-[#0D1420] shrink-0 shadow-xs font-bold">
                <BrandIcon size={18} />
              </div>
              <div className="min-w-0 overflow-hidden">
                <span className="block text-sm font-bold tracking-wide text-white truncate">{brandTitle}</span>
              </div>
            </Link>

            <button
              type="button"
              onClick={onToggleCollapse}
              className="rounded-lg p-1.5 text-[#8A9AB2] hover:bg-[#151D29] hover:text-white transition-colors shrink-0 cursor-pointer"
              title="Collapse Sidebar"
              aria-label="Collapse Sidebar"
            >
              <Menu size={18} />
            </button>
          </div>
        )}

        {/* Navigation */}
        <div className={`flex-1 overflow-y-auto overflow-x-hidden py-2.5 ${collapsed ? "px-2" : "px-3"}`}>
          {!collapsed && (
            <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[1.5px] text-[#8A9AB2]">
              {navHeading}
            </p>
          )}

          <SidebarNav items={visibleMenuItems} collapsed={collapsed} />
        </div>

        {/* Bottom Profile & Actions */}
        <div className={`border-t border-[#1E293B]/70 ${collapsed ? "p-2 flex flex-col items-center" : "p-2"}`}>
          <SidebarProfile
            user={user}
            collapsed={collapsed}
            onNavigate={handleNavigate}
            onLogout={handleLogout}
          />
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
