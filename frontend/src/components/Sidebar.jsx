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
  Settings,
  LogOut,
} from "lucide-react";


const menuItems = [
  { name: "Dashboard", path: "/", icon: LayoutDashboard, end: true },
  { name: "Orders", path: "/orders", icon: ClipboardList },
  { name: "Tables", path: "/tables", icon: Grid3X3 },
  { name: "Menu Management", path: "/menu", icon: Utensils },
  { name: "Customers", path: "/customers", icon: Users },
  { name: "Staff Management", path: "/staff", icon: UserCog },
  { name: "Invoices", path: "/invoices", icon: FileText },
];


function Sidebar() {

  const { logout } = useAuth();

  const navigate = useNavigate();


  // Handle logout
  const handleLogout = () => {

    logout();

    navigate("/login", { replace: true });

  };


  return (
    <aside className="sticky top-0 hidden h-screen w-[250px] shrink-0 flex-col bg-[#29231F] text-white lg:flex">

      {/* Branding */}
      <div className="border-b border-white/10 px-6 py-7">

        <div className="flex items-center gap-3">

          <div className="rounded-xl bg-[#C65D35] p-3">
            <Utensils size={23} />
          </div>

          <div>

            <h1 className="text-xl font-bold tracking-wide">
              DineFlow
            </h1>

            <p className="text-xs text-[#D6C7BC]">
              Restaurant Management
            </p>

          </div>

        </div>

      </div>


      {/* Navigation */}
      <div className="flex-1 px-4 py-7">

        <p className="mb-5 px-3 text-[11px] font-bold uppercase tracking-[2px] text-[#A99B90]">
          Main Menu
        </p>

        <nav className="space-y-2">

          {menuItems.map((item) => {

            const Icon = item.icon;

            return (

              <NavLink
                key={item.name}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-[#C65D35] text-white shadow-lg shadow-black/10"
                      : "text-[#D6C7BC] hover:bg-white/10 hover:text-white"
                  }`
                }
              >

                <Icon size={19} />

                {item.name}

              </NavLink>

            );

          })}

        </nav>

      </div>


      {/* Bottom Navigation */}
      <div className="border-t border-white/10 p-4">

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
              isActive
                ? "bg-white/10 text-white"
                : "text-[#D6C7BC] hover:bg-white/10"
            }`
          }
        >

          <Settings size={19} />

          Settings

        </NavLink>


        {/* Logout Button */}
        <button
          type="button"
          onClick={handleLogout}
          className="mt-2 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-[#D6C7BC] hover:bg-white/10 hover:text-white transition"
        >

          <LogOut size={19} />

          Logout

        </button>

      </div>

    </aside>
  );

}

export default Sidebar;