import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard,
  ClipboardList,
  Grid3X3,
  Utensils,
  Users,
  UserCog,
  FileText,
  LogOut,
  X,
} from "lucide-react";

const menuItems = [
  { name: "Dashboard", path: "/", icon: LayoutDashboard, end: true },
  { name: "Orders", path: "/orders", icon: ClipboardList },
  { name: "Tables", path: "/tables", icon: Grid3X3, managerOnly: true },
  { name: "Menu Management", path: "/menu", icon: Utensils, managerOnly: true },
  { name: "Customers", path: "/customers", icon: Users, managerOnly: true },
  { name: "Staff Management", path: "/staff", icon: UserCog, managerOnly: true },
  { name: "Invoices", path: "/invoices", icon: FileText },
];

function SidebarNav({ items, onClose }) {
  return (
    <nav className="space-y-1">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.name}
            to={item.path}
            end={item.end}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-xs sm:text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-[#C65D35] text-white shadow-xs"
                  : "text-[#D6C7BC] hover:bg-white/10 hover:text-white"
              }`
            }
          >
            <Icon size={18} />
            <span>{item.name}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

function Sidebar({ mobileOpen = false, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    onClose?.();
    navigate("/login", { replace: true });
  };

  const isManager = user?.role?.toUpperCase() === "MANAGER";
  const visibleMenuItems = menuItems.filter(
    (item) => !item.managerOnly || isManager,
  );

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
        className={`fixed inset-y-0 left-0 z-50 flex w-[250px] flex-col bg-[#29231F] text-white shadow-2xl transition-transform duration-300 ease-in-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Branding & Close Button */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-[#C65D35] p-2">
              <Utensils size={18} />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-wide">DineFlow</h1>
              <p className="text-[11px] text-[#D6C7BC]">Restaurant Management</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#D6C7BC] hover:bg-white/10 hover:text-white"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-3.5 py-4">
          <p className="mb-2.5 px-3 text-[10px] font-bold uppercase tracking-[1.5px] text-[#A99B90]">
            Main Menu
          </p>
          <SidebarNav items={visibleMenuItems} onClose={onClose} />
        </div>

        {/* Bottom Actions */}
        <div className="border-t border-white/10 p-3.5">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-xs sm:text-sm text-[#D6C7BC] transition hover:bg-white/10 hover:text-white"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Desktop Sidebar (preserved exactly) */}
      <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col bg-[#29231F] text-white lg:flex">
        {/* Branding */}
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[#C65D35] p-2.5">
              <Utensils size={20} />
            </div>

            <div>
              <h1 className="text-lg font-bold tracking-wide">DineFlow</h1>
              <p className="text-xs text-[#D6C7BC]">Restaurant Management</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-3.5 py-5">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[1.5px] text-[#A99B90]">
            Main Menu
          </p>

          <SidebarNav items={visibleMenuItems} />
        </div>

        {/* Bottom Navigation */}
        <div className="border-t border-white/10 p-3.5">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-xs sm:text-sm text-[#D6C7BC] transition hover:bg-white/10 hover:text-white"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
