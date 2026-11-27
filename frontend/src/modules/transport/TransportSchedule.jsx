import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Clock } from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import PageHeader from "../../components/PageHeader";
import StatusBadge from "../../components/StatusBadge";
import { BUTTON_VARIANTS, CARD_STYLES, INPUT_STYLES } from "../../utils/themeTokens";
import VillaDataTable from "../villas/VillaDataTable";
import { kolkataTodayIso, transportApi, trnDate, trnError, trnTime } from "./transportApi";

export default function TransportSchedule() {
  const navigate = useNavigate();
  const [rangeMode, setRangeMode] = useState("weekly"); // daily | weekly
  const [viewMode] = useState("agenda"); // agenda | table
  const [anchorDate, setAnchorDate] = useState(kolkataTodayIso(0));
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [driverFilter, setDriverFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [schedules, setSchedules] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const dateRange = useMemo(() => {
    if (rangeMode === "daily") return { from: anchorDate, to: anchorDate };
    const [y, m, d] = anchorDate.split("-").map(Number);
    const endDt = new Date(Date.UTC(y, m - 1, d + 6));
    return { from: anchorDate, to: endDt.toISOString().slice(0, 10) };
  }, [rangeMode, anchorDate]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [schRes, vehRes, drvRes] = await Promise.all([
        transportApi.schedules({
          date_from: dateRange.from,
          date_to: dateRange.to,
          vehicle_id: vehicleFilter || undefined,
          driver_id: driverFilter || undefined,
          status: statusFilter || undefined,
        }),
        transportApi.vehicles({ page: 1, page_size: 100 }),
        transportApi.drivers({ page: 1, page_size: 100 }),
      ]);
      setSchedules(schRes.data || []);
      setVehicles(vehRes.data?.items || []);
      setDrivers(drvRes.data?.items || []);
    } catch (err) {
      setError(trnError(err));
    } finally {
      setLoading(false);
    }
  }, [dateRange, vehicleFilter, driverFilter, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const groupedByDate = useMemo(() => {
    const map = {};
    for (const item of schedules) {
      map[item.scheduled_date] = map[item.scheduled_date] || [];
      map[item.scheduled_date].push(item);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [schedules]);

  const columns = [
    { key: "scheduled_date", label: "Date", render: (s) => trnDate(s.scheduled_date), cellClassName: "whitespace-nowrap" },
    { key: "time", label: "Time Window", render: (s) => `${trnTime(s.start_time)} – ${trnTime(s.end_time)}`, cellClassName: "whitespace-nowrap tabular-nums" },
    { key: "booking_number", label: "Booking #", cellClassName: "font-mono font-bold whitespace-nowrap" },
    { key: "customer_name", label: "Guest", render: (s) => `${s.customer_name} (${s.passenger_count} pax)` },
    { key: "route", label: "Route", render: (s) => `${s.pickup_location} → ${s.drop_location}` },
    { key: "vehicle_name", label: "Vehicle", render: (s) => (s.vehicle_name ? `${s.vehicle_name} (${s.vehicle_reg})` : "Unassigned") },
    { key: "driver_name", label: "Driver", render: (s) => s.driver_name || "Unassigned" },
    { key: "status", label: "Trip Status", align: "center", render: (s) => <StatusBadge status={s.status} size="sm" /> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Trip Schedule"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-1">
              <button
                type="button"
                onClick={() => setRangeMode("daily")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                  rangeMode === "daily" ? "bg-[#30251C] text-[#FFB02E]" : "text-stone-600 dark:text-[#8A9AB2]"
                }`}
              >
                Daily
              </button>
              <button
                type="button"
                onClick={() => setRangeMode("weekly")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                  rangeMode === "weekly" ? "bg-[#30251C] text-[#FFB02E]" : "text-stone-600 dark:text-[#8A9AB2]"
                }`}
              >
                7-Day Weekly
              </button>
            </div>
            {/* <div className="inline-flex rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-1">
              <button
                type="button"
                onClick={() => setViewMode("agenda")}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${
                  viewMode === "agenda" ? "bg-[#30251C] text-[#FFB02E]" : "text-stone-500"
                }`}
              >
                <CalendarDays size={14} /> Agenda
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${
                  viewMode === "table" ? "bg-[#30251C] text-[#FFB02E]" : "text-stone-500"
                }`}
              >
                <List size={14} /> Table
              </button>
            </div> */}
          </div>
        }
      />

      {error && <AlertBanner variant="error" title="Error" message={error} onDismiss={() => setError("")} />}

      <div className={`${CARD_STYLES.base} w-fit max-w-full !p-2`}>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} className={`${INPUT_STYLES.base} !w-auto !py-1.5 text-xs`} />
          <select value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)} className={`${INPUT_STYLES.select} !w-auto min-w-[140px] !py-1.5 text-xs`}>
            <option value="">All Vehicles</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.vehicle_name} ({v.registration_number})</option>)}
          </select>
          <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} className={`${INPUT_STYLES.select} !w-auto min-w-[130px] !py-1.5 text-xs`}>
            <option value="">All Drivers</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.driver_name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${INPUT_STYLES.select} !w-auto min-w-[130px] !py-1.5 text-xs`}>
            <option value="">All Statuses</option>
            {["Pending", "Confirmed", "Assigned", "Driver En Route", "In Progress", "Completed", "Cancelled", "No Show"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {(vehicleFilter || driverFilter || statusFilter) && (
            <button
              type="button"
              onClick={() => {
                setVehicleFilter("");
                setDriverFilter("");
                setStatusFilter("");
              }}
              className={`${BUTTON_VARIANTS.secondary} !py-1.5 !px-3 text-xs`}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {viewMode === "table" ? (
        <VillaDataTable
          columns={columns}
          rows={schedules}
          loading={loading}
          emptyTitle="No trips scheduled in this range"
          tableMinWidth="min-w-[880px]"
          onRowClick={(s) => navigate(`/transport/bookings?search=${s.booking_number}`)}
        />
      ) : loading ? (
        <div className={`${CARD_STYLES.base} py-12 text-center text-sm text-[#8A9AB2]`}>Loading schedule...</div>
      ) : groupedByDate.length === 0 ? (
        <div className={`${CARD_STYLES.base} py-12 text-center`}>
          <CalendarDays size={28} className="mx-auto text-stone-400 mb-2" />
          <p className="text-sm font-semibold">No trips scheduled for {trnDate(dateRange.from)} – {trnDate(dateRange.to)}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByDate.map(([dt, items]) => (
            <div key={dt} className={CARD_STYLES.base}>
              <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-[#E5E9F0] dark:border-[#1E293B]">
                <h3 className="text-sm font-bold">{trnDate(dt)}</h3>
                <span className="text-xs font-semibold text-[#8A9AB2]">{items.length} trip{items.length > 1 ? "s" : ""}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => navigate(`/transport/bookings?search=${item.booking_number}`)}
                    className="rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#151D29] p-3 hover:border-amber-400 transition cursor-pointer space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                        <Clock size={12} /> {trnTime(item.start_time)} – {trnTime(item.end_time)}
                      </span>
                      <StatusBadge status={item.status} size="sm" />
                    </div>
                    <p className="text-xs font-bold truncate">{item.pickup_location} → {item.drop_location}</p>
                    <p className="text-[11px] text-[#64748B] dark:text-[#8A9AB2]">
                      {item.booking_number} · {item.customer_name} ({item.passenger_count} pax)
                    </p>
                    <div className="flex items-center justify-between pt-1.5 text-[11px] border-t border-[#E5E9F0] dark:border-[#1E293B]">
                      <span className="font-semibold">{item.vehicle_name ? `${item.vehicle_name} (${item.vehicle_reg})` : "Vehicle Unassigned"}</span>
                      <span className="text-[#8A9AB2]">{item.driver_name || "No Driver"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
