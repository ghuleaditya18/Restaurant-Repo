import { useLocation } from "react-router-dom";
import { Bell, ChevronDown } from "lucide-react";

const pageTitles = {
  "/": "Dashboard",
  "/orders": "Orders",
  "/tables": "Tables",
  "/menu": "Menu Management",
  "/customers": "Customers",
  "/staff": "Staff Management",
  "/invoices": "Invoices",
  "/settings": "Settings",
};

function Header() {
  const location = useLocation();

  const title = pageTitles[location.pathname] || "Dashboard";

  const today = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#EAE4DD] bg-white px-6 py-5 lg:px-9">

      <div>
        <h2 className="text-xl font-bold text-[#29231F]">
          {title}
        </h2>

        <p className="mt-1 text-sm text-[#8A817B]">
          {today}
        </p>
      </div>

      <div className="flex items-center gap-5">

        <button className="relative rounded-full p-2.5 text-[#625B55] transition hover:bg-[#F7F5F0]">
          <Bell size={21} />

          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#C65D35]" />
        </button>

        <div className="flex items-center gap-3 border-l border-[#EAE4DD] pl-5">

          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F5E4D8] font-bold text-[#C65D35]">
            M
          </div>

          <div className="hidden sm:block">
            <p className="text-sm font-semibold text-[#29231F]">
              Manager
            </p>

            <p className="text-xs text-[#8A817B]">
              Administrator
            </p>
          </div>

          <ChevronDown size={17} className="text-[#8A817B]" />

        </div>

      </div>

    </header>
  );
}

export default Header;