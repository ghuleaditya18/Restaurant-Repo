import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  RefreshCw,
  TrendingDown,
  PieChart,
  Scale,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  getStockValuationReport,
  getConsumptionReport,
  getWastageReport,
  getFoodCostReport,
  getReconciliationReport,
} from "../../../services/inventoryService";
import { useNotification } from "../../../context/NotificationContext";
import { CARD_STYLES, INPUT_STYLES, TABLE_STYLES } from "../../../utils/themeTokens";
import Pagination from "../../../components/Pagination";

export default function InventoryReports() {
  const [reportTab, setReportTab] = useState("valuation"); // 'valuation' | 'consumption' | 'wastage' | 'foodcost' | 'reconciliation'
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Report Data States
  const [valuationData, setValuationData] = useState(null);
  const [consumptionData, setConsumptionData] = useState(null);
  const [wastageData, setWastageData] = useState(null);
  const [foodCostData, setFoodCostData] = useState([]);
  const [reconciliationData, setReconciliationData] = useState(null);

  // Date Presets for consumption and wastage
  const [datePreset, setDatePreset] = useState("this_month");

  const { showError } = useNotification();

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      if (reportTab === "valuation") {
        const data = await getStockValuationReport();
        setValuationData(data);
      } else if (reportTab === "consumption") {
        const data = await getConsumptionReport({ preset: datePreset });
        setConsumptionData(data);
      } else if (reportTab === "wastage") {
        const data = await getWastageReport({ preset: datePreset });
        setWastageData(data);
      } else if (reportTab === "foodcost") {
        const data = await getFoodCostReport();
        setFoodCostData(data);
      } else if (reportTab === "reconciliation") {
        const data = await getReconciliationReport();
        setReconciliationData(data);
      }
    } catch {
      showError("Failed to fetch report data");
    } finally {
      setLoading(false);
    }
  }, [reportTab, datePreset, showError]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  return (
    <div className="space-y-4">
      {/* Sub-tab Navigation */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 dark:bg-stone-900 rounded-xl overflow-x-auto">
          {[
            { key: "valuation", label: "Stock Valuation", icon: DollarSign },
            { key: "consumption", label: "Consumption", icon: BarChart3 },
            { key: "wastage", label: "Wastage & Loss", icon: TrendingDown },
            { key: "foodcost", label: "Food Cost & Margins", icon: PieChart },
            { key: "reconciliation", label: "Ledger Audit", icon: Scale },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = reportTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setReportTab(tab.key);
                  setPage(1);
                }}
                className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  active
                    ? "bg-white dark:bg-[#101722] text-stone-900 dark:text-stone-100 shadow-xs"
                    : "text-stone-500 hover:text-stone-900 dark:hover:text-stone-200"
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {(reportTab === "consumption" || reportTab === "wastage") && (
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
              className={`${INPUT_STYLES.select} w-36`}
            >
              <option value="today">Today</option>
              <option value="last_7_days">Last 7 Days</option>
              <option value="this_month">This Month</option>
              <option value="all">All Dates</option>
            </select>
          )}

          <button
            type="button"
            onClick={loadReport}
            disabled={loading}
            className="p-2 border border-stone-300 dark:border-stone-700 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition text-stone-600 dark:text-stone-300"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* 1. STOCK VALUATION REPORT */}
      {reportTab === "valuation" && (
        <div className="space-y-4">
          {valuationData && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className={`${CARD_STYLES.base} !px-3 !py-2.5`}>
                <div className="text-[11px] font-bold uppercase text-stone-500 truncate">Total Asset Value</div>
                <div className="text-base sm:text-lg font-bold tabular-nums text-stone-900 dark:text-stone-100 mt-0.5">
                  ₹{Number(valuationData.total_valuation).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className={`${CARD_STYLES.base} !px-3 !py-2.5`}>
                <div className="text-[11px] font-bold uppercase text-stone-500 truncate">Tracked Items</div>
                <div className="text-base sm:text-lg font-bold tabular-nums text-stone-900 dark:text-stone-100 mt-0.5">
                  {valuationData.total_items}
                </div>
              </div>
              <div className={`${CARD_STYLES.base} !px-3 !py-2.5`}>
                <div className="text-[11px] font-bold uppercase text-amber-600 truncate">Low Stock Items</div>
                <div className="text-base sm:text-lg font-bold tabular-nums text-amber-600 mt-0.5">
                  {valuationData.low_stock_count}
                </div>
              </div>
              <div className={`${CARD_STYLES.base} !px-3 !py-2.5`}>
                <div className="text-[11px] font-bold uppercase text-rose-600 truncate">Out of Stock</div>
                <div className="text-base sm:text-lg font-bold tabular-nums text-rose-600 mt-0.5">
                  {valuationData.out_of_stock_count}
                </div>
              </div>
            </div>
          )}

          <div className={TABLE_STYLES.container}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
                    <th className={TABLE_STYLES.th}>Item Name</th>
                    <th className={TABLE_STYLES.th}>Category</th>
                    <th className={TABLE_STYLES.th}>Stock Balance</th>
                    <th className={TABLE_STYLES.th}>Avg Unit Cost</th>
                    <th className={TABLE_STYLES.th}>Total Valuation</th>
                    <th className={TABLE_STYLES.th}>Health Status</th>
                  </tr>
                </thead>
                <tbody>
                  {valuationData?.items?.slice((page - 1) * pageSize, page * pageSize).map((it) => (
                    <tr key={it.item_id} className={TABLE_STYLES.tr}>
                      <td className={TABLE_STYLES.td}>
                        <span className="font-bold text-stone-900 dark:text-stone-100">{it.item_name}</span>
                      </td>
                      <td className={TABLE_STYLES.td}>{it.category_name}</td>
                      <td className={TABLE_STYLES.td}>
                        {Number(it.current_stock).toLocaleString()} {it.base_unit}
                      </td>
                      <td className={TABLE_STYLES.td}>₹{Number(it.average_cost).toFixed(2)}</td>
                      <td className={TABLE_STYLES.td}>
                        <span className="font-bold text-stone-900 dark:text-stone-100">
                          ₹{Number(it.total_valuation).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className={TABLE_STYLES.td}>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            it.stock_status === "OUT_OF_STOCK"
                              ? "bg-rose-100 text-rose-800"
                              : it.stock_status === "LOW_STOCK"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {it.stock_status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {valuationData?.items && (
              <Pagination
                currentPage={page}
                totalPages={Math.ceil(valuationData.items.length / pageSize) || 1}
                onPageChange={setPage}
                totalRecords={valuationData.items.length}
                limit={pageSize}
              />
            )}
          </div>
        </div>
      )}

      {/* 2. CONSUMPTION REPORT */}
      {reportTab === "consumption" && (
        <div className="space-y-4">
          {consumptionData && (
            <div className="p-4 bg-stone-50 dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase text-stone-500">Period Total Consumption Cost</span>
                <div className="text-xl font-extrabold text-stone-900 dark:text-stone-100">
                  ₹{Number(consumptionData.total_consumption_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
              <span className="text-xs text-stone-400">Filter: {datePreset.replace("_", " ")}</span>
            </div>
          )}

          <div className={TABLE_STYLES.container}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
                    <th className={TABLE_STYLES.th}>Ingredient</th>
                    <th className={TABLE_STYLES.th}>Category</th>
                    <th className={TABLE_STYLES.th}>Total Quantity Consumed</th>
                    <th className={TABLE_STYLES.th}>Cost of Consumption</th>
                    <th className={TABLE_STYLES.th}>Distinct Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {consumptionData?.items?.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-sm text-stone-400">
                        No ingredient consumption recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    consumptionData?.items?.slice((page - 1) * pageSize, page * pageSize).map((it) => (
                      <tr key={it.item_id} className={TABLE_STYLES.tr}>
                        <td className={TABLE_STYLES.td}>
                          <span className="font-bold text-stone-900 dark:text-stone-100">{it.item_name}</span>
                        </td>
                        <td className={TABLE_STYLES.td}>{it.category_name}</td>
                        <td className={TABLE_STYLES.td}>
                          <span className="font-semibold">{Number(it.total_consumed_quantity).toLocaleString()}</span>{" "}
                          <span className="text-xs text-stone-500">{it.base_unit}</span>
                        </td>
                        <td className={TABLE_STYLES.td}>
                          <span className="font-bold">₹{Number(it.total_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </td>
                        <td className={TABLE_STYLES.td}>{it.order_count} orders</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {consumptionData?.items && (
              <Pagination
                currentPage={page}
                totalPages={Math.ceil(consumptionData.items.length / pageSize) || 1}
                onPageChange={setPage}
                totalRecords={consumptionData.items.length}
                limit={pageSize}
              />
            )}
          </div>
        </div>
      )}

      {/* 3. WASTAGE REPORT */}
      {reportTab === "wastage" && (
        <div className="space-y-4">
          {wastageData && (
            <div className="p-4 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase text-rose-600">Total Financial Loss from Wastage</span>
                <div className="text-xl font-extrabold text-rose-700 dark:text-rose-300">
                  ₹{Number(wastageData.total_wastage_loss).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
              <span className="text-xs text-stone-400">Filter: {datePreset.replace("_", " ")}</span>
            </div>
          )}

          <div className={TABLE_STYLES.container}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
                    <th className={TABLE_STYLES.th}>Ingredient</th>
                    <th className={TABLE_STYLES.th}>Category</th>
                    <th className={TABLE_STYLES.th}>Total Discarded Quantity</th>
                    <th className={TABLE_STYLES.th}>Loss Value</th>
                    <th className={TABLE_STYLES.th}>Incident Count</th>
                  </tr>
                </thead>
                <tbody>
                  {wastageData?.items?.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-sm text-stone-400">
                        Zero wastage recorded for this period. Excellent control!
                      </td>
                    </tr>
                  ) : (
                    wastageData?.items?.slice((page - 1) * pageSize, page * pageSize).map((it) => (
                      <tr key={it.item_id} className={TABLE_STYLES.tr}>
                        <td className={TABLE_STYLES.td}>
                          <span className="font-bold text-stone-900 dark:text-stone-100">{it.item_name}</span>
                        </td>
                        <td className={TABLE_STYLES.td}>{it.category_name}</td>
                        <td className={TABLE_STYLES.td}>
                          <span className="font-semibold text-rose-600">{Number(it.total_wasted_quantity).toLocaleString()}</span>{" "}
                          <span className="text-xs text-stone-500">{it.base_unit}</span>
                        </td>
                        <td className={TABLE_STYLES.td}>
                          <span className="font-bold text-rose-600">₹{Number(it.total_loss_value).toFixed(2)}</span>
                        </td>
                        <td className={TABLE_STYLES.td}>{it.incidents_count} incidents</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {wastageData?.items && (
              <Pagination
                currentPage={page}
                totalPages={Math.ceil(wastageData.items.length / pageSize) || 1}
                onPageChange={setPage}
                totalRecords={wastageData.items.length}
                limit={pageSize}
              />
            )}
          </div>
        </div>
      )}

      {/* 4. FOOD COST & MARGINS REPORT */}
      {reportTab === "foodcost" && (
        <div className={TABLE_STYLES.container}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
                  <th className={TABLE_STYLES.th}>Menu Dish</th>
                  <th className={TABLE_STYLES.th}>Category</th>
                  <th className={TABLE_STYLES.th}>Selling Price</th>
                  <th className={TABLE_STYLES.th}>Recipe BOM Cost</th>
                  <th className={TABLE_STYLES.th}>Gross Margin (₹)</th>
                  <th className={TABLE_STYLES.th}>Food Cost %</th>
                  <th className={TABLE_STYLES.th}>Gross Margin %</th>
                </tr>
              </thead>
              <tbody>
                {foodCostData.slice((page - 1) * pageSize, page * pageSize).map((d) => (
                  <tr key={d.menu_item_id} className={TABLE_STYLES.tr}>
                    <td className={TABLE_STYLES.td}>
                      <span className="font-bold text-stone-900 dark:text-stone-100">{d.menu_item_name}</span>
                    </td>
                    <td className={TABLE_STYLES.td}>{d.category_name}</td>
                    <td className={TABLE_STYLES.td}>₹{Number(d.selling_price).toFixed(2)}</td>
                    <td className={TABLE_STYLES.td}>
                      {d.has_active_recipe ? `₹${Number(d.recipe_cost).toFixed(2)}` : "No Recipe"}
                    </td>
                    <td className={TABLE_STYLES.td}>
                      {d.has_active_recipe ? (
                        <span className="font-bold text-emerald-600">₹{Number(d.gross_margin_amount).toFixed(2)}</span>
                      ) : "—"}
                    </td>
                    <td className={TABLE_STYLES.td}>
                      {d.has_active_recipe ? (
                        <span className={`font-semibold ${Number(d.food_cost_percentage) > 35 ? "text-rose-600" : "text-emerald-600"}`}>
                          {Number(d.food_cost_percentage).toFixed(1)}%
                        </span>
                      ) : "—"}
                    </td>
                    <td className={TABLE_STYLES.td}>
                      {d.has_active_recipe ? (
                        <span className="font-bold">{Number(d.gross_margin_percentage).toFixed(1)}%</span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {foodCostData.length > 0 && (
            <Pagination
              currentPage={page}
              totalPages={Math.ceil(foodCostData.length / pageSize) || 1}
              onPageChange={setPage}
              totalRecords={foodCostData.length}
              limit={pageSize}
            />
          )}
        </div>
      )}

      {/* 5. LEDGER RECONCILIATION REPORT */}
      {reportTab === "reconciliation" && (
        <div className="space-y-4">
          {reconciliationData && (
            <div className={`p-4 rounded-xl border flex items-center justify-between ${
              reconciliationData.discrepancy_count === 0
                ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-200"
                : "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-200"
            }`}>
              <div className="flex items-center gap-3">
                {reconciliationData.discrepancy_count === 0 ? (
                  <CheckCircle2 size={24} className="text-emerald-600" />
                ) : (
                  <AlertTriangle size={24} className="text-rose-600" />
                )}
                <div>
                  <div className="font-bold text-sm">
                    {reconciliationData.discrepancy_count === 0
                      ? "Ledger Audit Perfect: 100% Balanced"
                      : `${reconciliationData.discrepancy_count} Discrepancies Detected!`}
                  </div>
                  <div className="text-xs opacity-90">
                    Checked {reconciliationData.total_items_checked} inventory items against their historical posted movement logs.
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className={TABLE_STYLES.container}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
                    <th className={TABLE_STYLES.th}>Item</th>
                    <th className={TABLE_STYLES.th}>Cached Current Stock</th>
                    <th className={TABLE_STYLES.th}>Sum of Movements</th>
                    <th className={TABLE_STYLES.th}>Variance</th>
                    <th className={TABLE_STYLES.th}>Audit Integrity</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliationData?.items?.slice((page - 1) * pageSize, page * pageSize).map((it) => (
                    <tr key={it.item_id} className={TABLE_STYLES.tr}>
                      <td className={TABLE_STYLES.td}>
                        <span className="font-bold text-stone-900 dark:text-stone-100">{it.item_name}</span>
                      </td>
                      <td className={TABLE_STYLES.td}>
                        {Number(it.cached_current_stock).toLocaleString()} {it.base_unit}
                      </td>
                      <td className={TABLE_STYLES.td}>
                        {Number(it.ledger_sum).toLocaleString()} {it.base_unit}
                      </td>
                      <td className={TABLE_STYLES.td}>
                        <span className={it.is_balanced ? "text-stone-400" : "font-bold text-rose-600"}>
                          {Number(it.difference).toFixed(4)}
                        </span>
                      </td>
                      <td className={TABLE_STYLES.td}>
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            it.is_balanced
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {it.is_balanced ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                          <span>{it.is_balanced ? "Matched" : "Out of Sync"}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {reconciliationData?.items && (
              <Pagination
                currentPage={page}
                totalPages={Math.ceil(reconciliationData.items.length / pageSize) || 1}
                onPageChange={setPage}
                totalRecords={reconciliationData.items.length}
                limit={pageSize}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
