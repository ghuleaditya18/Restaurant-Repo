import { useState } from "react";
import {
  Package,
  Truck,
  Users,
  UtensilsCrossed,
  Flame,
  ClipboardCheck,
  BarChart3,
} from "lucide-react";
import InventoryStock from "../modules/inventory/pages/InventoryStock";
import InventoryPurchases from "../modules/inventory/pages/InventoryPurchases";
import InventorySuppliers from "../modules/inventory/pages/InventorySuppliers";
import InventoryRecipes from "../modules/inventory/pages/InventoryRecipes";
import InventoryWastage from "../modules/inventory/pages/InventoryWastage";
import InventoryStockCount from "../modules/inventory/pages/InventoryStockCount";
import InventoryReports from "../modules/inventory/pages/InventoryReports";
import PageHeader from "../components/PageHeader";

const TABS = [
  { id: "stock", label: "Stock Items", icon: Package },
  { id: "purchases", label: "Purchases & GRN", icon: Truck },
  { id: "suppliers", label: "Suppliers", icon: Users },
  { id: "recipes", label: "Recipes (BOM)", icon: UtensilsCrossed },
  { id: "wastage", label: "Wastage & Ledger", icon: Flame },
  { id: "stockcount", label: "Stock Count", icon: ClipboardCheck },
  { id: "reports", label: "Reports & Valuation", icon: BarChart3 },
];

export default function Inventory() {
  const [activeTab, setActiveTab] = useState("stock");

  return (
    <div className="space-y-6">
      {/* A1 Standard PageHeader */}
      <PageHeader
        title="Inventory"
      />

      {/* Primary Tab Navigation */}
      <div className="border-b border-stone-200 dark:border-stone-800">
        <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto pb-px" aria-label="Inventory Tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`group inline-flex items-center gap-2 border-b-2 py-3 px-3.5 text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "border-[#F5B716] text-[#F5B716] dark:text-[#F5B716]"
                    : "border-transparent text-stone-500 hover:border-stone-300 dark:hover:border-stone-700 hover:text-stone-700 dark:hover:text-stone-300"
                }`}
              >
                <Icon
                  size={16}
                  className={isActive ? "text-[#F5B716]" : "text-stone-400 group-hover:text-stone-600 dark:group-hover:text-stone-300"}
                />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Active Tab Screen */}
      <div className="pt-2">
        {activeTab === "stock" && <InventoryStock />}
        {activeTab === "purchases" && <InventoryPurchases />}
        {activeTab === "suppliers" && <InventorySuppliers />}
        {activeTab === "recipes" && <InventoryRecipes />}
        {activeTab === "wastage" && <InventoryWastage />}
        {activeTab === "stockcount" && <InventoryStockCount />}
        {activeTab === "reports" && <InventoryReports />}
      </div>
    </div>
  );
}
