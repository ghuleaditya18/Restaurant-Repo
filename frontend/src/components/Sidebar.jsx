import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
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
} from "lucide-react";

const menuItems = [
  { name: "Dashboard", path: "/", icon: LayoutDashboard, end: true },
  { name: "Orders", path: "/orders", icon: ClipboardList },
  { name: "Tables", path: "/tables", icon: Grid3X3 },
  { name: "Menu Management", path: "/menu", icon: Utensils },
  { name: "Customers", path: "/customers", icon: Users },
  { name: "Staff Management", path: "/staff", icon: UserCog },
  { name: "Invoices", path: "/invoices", icon: FileText },
  { name: "Settings", path: "/settings", icon: Settings },
];

function SidebarNav({ items, onClose, collapsed = false }) {
  return (
    <nav className="space-y-1.5" aria-label="Main Navigation">
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
              `group relative flex items-center rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 cursor-pointer ${
                collapsed
                  ? "justify-center p-2.5"
                  : "gap-3 px-3.5 py-2.5"
              } ${
                isActive
                  ? "bg-[#F5B716] text-[#1C1917] font-semibold shadow-xs"
                  : "text-stone-300 hover:bg-white/10 hover:text-white"
              }`
            }
          >
            <Icon
              size={collapsed ? 20 : 18}
              className="shrink-0 transition-transform group-hover:scale-105"
            />
            {!collapsed && <span className="truncate">{item.name}</span>}

            {/* Accessible tooltip when collapsed */}
            {collapsed && (
              <span className="pointer-events-none absolute left-full ml-2 hidden rounded-md bg-[#29231F] px-2.5 py-1 text-xs font-semibold text-white shadow-lg group-hover:block z-50 whitespace-nowrap border border-white/10">
                {item.name}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

function Sidebar({
  mobileOpen = false,
  onClose,
  collapsed = false,
  onToggleCollapse,
}) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    onClose?.();
    navigate("/login", { replace: true });
  };

  const visibleMenuItems = menuItems;

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
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-[#1C1917] text-white shadow-2xl transition-transform duration-300 ease-in-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Branding & Close Button */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
          <Link
            to="/"
            onClick={onClose}
            className="group flex items-center gap-2.5 transition-opacity hover:opacity-95 min-w-0 cursor-pointer"
            title="DineFlow - Dashboard"
          >
            <div className="rounded-lg bg-[#F5B716] p-2 text-[#1C1917] shadow-xs group-hover:bg-[#E5A910] transition-colors shrink-0 font-bold">
              <ChefHat size={19} />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold tracking-wide text-white truncate">DineFlow</h1>
            </div>
          </Link>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            aria-label="Close sidebar"
            title="Close navigation drawer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-3.5 py-4">
          <p className="mb-2.5 px-3 text-[10px] font-bold uppercase tracking-[1.5px] text-stone-400">
            Main Navigation
          </p>
          <SidebarNav items={visibleMenuItems} onClose={onClose} collapsed={false} />
        </div>

        {/* Bottom Actions */}
        <div className="border-t border-white/10 p-3.5">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-stone-300 transition hover:bg-white/10 hover:text-white cursor-pointer"
            title="Logout"
          >
            <LogOut size={18} className="shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Desktop Sidebar (Collapsible) */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-[#1C1917] text-white transition-all duration-300 ease-in-out lg:flex overflow-x-hidden ${
          collapsed ? "w-[72px]" : "w-[240px]"
        }`}
      >
        {/* Branding & Hamburger Header */}
        {collapsed ? (
          <div className="flex flex-col items-center justify-center gap-2.5 border-b border-white/10 py-3.5 px-2">
            <button
              type="button"
              onClick={onToggleCollapse}
              className="rounded-lg p-2 text-stone-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              title="Expand Sidebar"
              aria-label="Expand Sidebar"
            >
              <Menu size={20} />
            </button>

            <Link
              to="/"
              className="group flex items-center justify-center rounded-lg bg-[#F5B716] p-2 text-[#1C1917] shadow-xs group-hover:bg-[#E5A910] transition-colors cursor-pointer font-bold"
              title="DineFlow - Dashboard"
              aria-label="DineFlow - Dashboard"
            >
              <ChefHat size={20} />
            </Link>
          </div>
        ) : (
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
            <Link
              to="/"
              className="group flex items-center gap-2.5 transition-opacity hover:opacity-95 min-w-0 cursor-pointer"
              title="DineFlow - Dashboard"
            >
              <div className="rounded-lg bg-[#F5B716] p-2 text-[#1C1917] shrink-0 shadow-xs group-hover:bg-[#E5A910] transition-colors font-bold">
                <ChefHat size={20} />
              </div>
              <div className="min-w-0 overflow-hidden">
                <h1 className="text-base font-bold tracking-wide text-white truncate">DineFlow</h1>
              </div>
            </Link>

            <button
              type="button"
              onClick={onToggleCollapse}
              className="rounded-lg p-1.5 text-stone-300 hover:bg-white/10 hover:text-white transition-colors shrink-0 cursor-pointer"
              title="Collapse Sidebar"
              aria-label="Collapse Sidebar"
            >
              <Menu size={20} />
            </button>
          </div>
        )}

        {/* Navigation */}
        <div className={`flex-1 overflow-y-auto overflow-x-hidden py-4 ${collapsed ? "px-2" : "px-3.5"}`}>
          {!collapsed && (
            <p className="mb-2.5 px-3 text-[10px] font-bold uppercase tracking-[1.5px] text-stone-400">
              Main Navigation
            </p>
          )}

          <SidebarNav items={visibleMenuItems} collapsed={collapsed} />
        </div>

        {/* Bottom Actions */}
        <div className={`border-t border-white/10 ${collapsed ? "p-2.5 flex justify-center" : "p-3.5"}`}>
          <button
            type="button"
            onClick={handleLogout}
            className={`flex items-center rounded-xl text-xs sm:text-sm text-stone-300 transition hover:bg-white/10 hover:text-white cursor-pointer ${
              collapsed
                ? "justify-center p-2.5"
                : "w-full gap-2.5 px-3.5 py-2.5"
            }`}
            title="Logout"
            aria-label="Logout"
          >
            <LogOut size={collapsed ? 20 : 18} className="shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
