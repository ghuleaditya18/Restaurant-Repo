import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import PageHeader from "../../components/PageHeader";
import { useNotification } from "../../context/NotificationContext";
import { BUTTON_VARIANTS, CARD_STYLES, INPUT_STYLES } from "../../utils/themeTokens";
import VillaDataTable from "../villas/VillaDataTable";
import { kolkataTodayIso, transportApi, trnError } from "./transportApi";

const REPORT_TYPES = [
  { key: "vehicle_utilization", label: "Vehicle Utilization" },
  { key: "driver_utilization", label: "Driver Utilization" },
  { key: "daily_trips", label: "Daily Trip Report" },
  { key: "monthly_trips", label: "Monthly Trip Report" },
  { key: "revenue", label: "Revenue Report" },
  { key: "maintenance", label: "Vehicle Maintenance" },
  { key: "fuel_expenses", label: "Fuel & Expenses" },
  { key: "pending_bookings", label: "Pending Bookings" },
  { key: "cancelled_trips", label: "Cancelled / No-Show Trips" },
];

export default function TransportReports() {
  const { showSuccess, showError } = useNotification();
  const [reportType, setReportType] = useState("vehicle_utilization");
  const [dateFrom, setDateFrom] = useState(kolkataTodayIso(-30));
  const [dateTo, setDateTo] = useState(kolkataTodayIso(30));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await transportApi.reports({
        report_type: reportType,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setReport(res.data);
    } catch (err) {
      setError(trnError(err));
    } finally {
      setLoading(false);
    }
  }, [reportType, dateFrom, dateTo]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleExportCsv = async () => {
    try {
      const blob = await transportApi.exportReportCsv({
        report_type: reportType,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      const url = URL.createObjectURL(new Blob([blob], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `transport-${reportType}-report.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showSuccess("Report exported to CSV.");
    } catch (err) {
      showError(trnError(err));
    }
  };

  const items = report?.items || [];
  const summary = report?.summary || {};
  const columns =
    items.length > 0
      ? Object.keys(items[0]).map((key) => ({
          key,
          label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          render: (row) => String(row[key] ?? "—"),
        }))
      : [{ key: "empty", label: "Report Data", render: () => "—" }];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transport Operational Reports"
        description="Analyze fleet utilization, driver activity, trip completions, maintenance costs, fuel expenses, and revenue."
        actions={
          <button type="button" onClick={handleExportCsv} className={BUTTON_VARIANTS.primary}>
            <Download size={15} /> Export CSV
          </button>
        }
      />

      {error && <AlertBanner variant="error" title="Error" message={error} onDismiss={() => setError("")} />}

      <div className={`${CARD_STYLES.base} w-fit max-w-full !p-2 flex flex-wrap gap-1.5`}>
        {REPORT_TYPES.map((rt) => (
          <button
            key={rt.key}
            type="button"
            onClick={() => setReportType(rt.key)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              reportType === rt.key
                ? "bg-[#30251C] text-[#FFB02E] border border-[#F59E0B]/40"
                : "border border-[#E5E9F0] dark:border-[#1E293B] text-stone-600 dark:text-[#8A9AB2]"
            }`}
          >
            {rt.label}
          </button>
        ))}
      </div>

      <div className={`${CARD_STYLES.base} w-fit max-w-full !p-2.5 flex flex-wrap items-end gap-2.5`}>
        <div>
          <label className="block text-[11px] font-semibold mb-1">From Date</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={`${INPUT_STYLES.base} !w-auto !py-1.5 text-xs`} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold mb-1">To Date</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={`${INPUT_STYLES.base} !w-auto !py-1.5 text-xs`} />
        </div>
        {Object.entries(summary).map(([k, val]) => (
          <div key={k} className="rounded-xl bg-[#F8FAFC] dark:bg-[#151D29] border border-[#E5E9F0] dark:border-[#1E293B] px-3 py-1.5">
            <p className="text-[10px] font-bold uppercase text-[#8A9AB2]">{k.replace(/_/g, " ")}</p>
            <p className="text-sm font-bold tabular-nums">{String(val)}</p>
          </div>
        ))}
      </div>

      <VillaDataTable
        columns={columns}
        rows={items}
        rowKey={(_, idx) => idx}
        loading={loading}
        emptyTitle="No report records for selected filters"
        tableMinWidth="min-w-[780px]"
      />
    </div>
  );
}
