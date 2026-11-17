import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Menu, ChevronDown, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const pageTitles = {
  "/": "Dashboard",
  "/orders": "Orders",
  "/tables": "Tables",
  "/menu": "Menu Management",
  "/customers": "Customers",
  "/staff": "Staff Management",
  "/invoices": "Invoices",
};

function Header({ onOpenMobileMenu }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const title = pageTitles[location.pathname] || "Dashboard";

  const today = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const userInitial = user?.full_name
    ? user.full_name.trim().charAt(0).toUpperCase()
    : "U";

  const userName = user?.full_name || "User";
  const userRole =
    user?.role?.toUpperCase() === "MANAGER" ? "Manager" : "Staff";
  const roleSubtitle =
    user?.role?.toUpperCase() === "MANAGER"
      ? "Administrator"
      : "Staff Member";

  const handleLogout = () => {
    setDropdownOpen(false);
    logout();
    navigate("/login", { replace: true });
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
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#EAE4DD] bg-white px-5 py-3 lg:px-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="rounded-lg p-2 text-[#29231F] transition hover:bg-[#F7F5F0] lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu size={20} />
        </button>

        <div>
          <h2 className="text-lg font-bold leading-tight text-[#29231F] md:text-xl">
            {title}
          </h2>

          <p className="mt-0.5 text-xs text-[#8A817B]">{today}</p>
        </div>
      </div>

      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen((prev) => !prev)}
          className="flex items-center gap-2.5 rounded-lg p-1.5 transition hover:bg-[#F7F5F0]"
          aria-expanded={dropdownOpen}
          aria-haspopup="true"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F5E4D8] text-sm font-bold text-[#C65D35]">
            {userInitial}
          </div>

          <div className="hidden text-left sm:block">
            <p className="text-xs font-semibold leading-tight text-[#29231F]">
              {userName}
            </p>

            <p className="text-[11px] text-[#8A817B]">{roleSubtitle}</p>
          </div>

          <ChevronDown
            size={15}
            className={`text-[#8A817B] transition-transform duration-200 ${
              dropdownOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {/* User Profile Dropdown Menu */}
        {dropdownOpen && (
          <div className="absolute right-0 mt-2 w-56 rounded-xl border border-[#E9E3DA] bg-white py-1.5 shadow-lg z-30">
            <div className="border-b border-[#EEE9E2] px-4 py-2.5">
              <p className="truncate text-xs font-semibold text-[#29231F]">
                {userName}
              </p>
              <p className="truncate text-[11px] text-[#8A817B]">
                {user?.email || ""}
              </p>
              <span className="mt-1.5 inline-block rounded-full bg-[#F5E5DC] px-2 py-0.5 text-[10px] font-semibold text-[#C65D35]">
                {userRole}
              </span>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-red-600 transition hover:bg-red-50"
              >
                <LogOut size={14} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
