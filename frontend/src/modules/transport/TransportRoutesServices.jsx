import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Edit3, Plus, Power, Route, Search, Settings2, Trash2 } from "lucide-react";

import AlertBanner from "../../components/AlertBanner";
import DeleteConfirm from "../../components/DeleteConfirm";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import StatusBadge from "../../components/StatusBadge";
import { useNotification } from "../../context/NotificationContext";
import { BUTTON_VARIANTS, CARD_STYLES, INPUT_STYLES } from "../../utils/themeTokens";
import VillaDataTable from "../villas/VillaDataTable";
import { transportApi, trnError, trnMoney } from "./transportApi";

const ROUTE_TYPES = [
  "Airport Transfer",
  "Railway Station Transfer",
  "Local Sightseeing",
  "Resort Pickup/Drop",
  "Intercity Transfer",
  "Custom Route",
];
const PRICING_MODELS = ["Flat", "Per Km", "Per Hour", "Hybrid"];

const PRESET_LOCATIONS = [
  { name: "The Grand Niwara Resort", lat: 18.5204, lon: 73.8567 },
  { name: "Pune Airport (PNQ)", lat: 18.5822, lon: 73.9197 },
  { name: "Pune Railway Station", lat: 18.5289, lon: 73.8744 },
  { name: "Shivajinagar Bus Stand", lat: 18.5314, lon: 73.8446 },
  { name: "Koregaon Park", lat: 18.5362, lon: 73.8940 },
  { name: "Hinjawadi IT Park", lat: 18.5913, lon: 73.7389 },
  { name: "Lonavala", lat: 18.7557, lon: 73.4091 },
  { name: "Mahabaleshwar", lat: 17.9307, lon: 73.6477 },
  { name: "Mumbai Airport (BOM)", lat: 19.0896, lon: 72.8656 },
  { name: "Manohar International Airport (GOX)", lat: 15.7362, lon: 73.8617 },
  { name: "Dabolim Airport (GOI)", lat: 15.3808, lon: 73.8314 },
  { name: "NewaraAI Resort Lobby (Goa)", lat: 15.4909, lon: 73.8278 },
  { name: "Madgaon Railway Station", lat: 15.2683, lon: 73.9721 },
];

const CATEGORY_RATES = {
  sedan: { base: 300, perKm: 18 },
  "electric vehicle": { base: 350, perKm: 16 },
  suv: { base: 450, perKm: 24 },
  muv: { base: 450, perKm: 24 },
  "luxury car": { base: 800, perKm: 38 },
  "tempo traveller": { base: 700, perKm: 32 },
  "mini bus": { base: 1000, perKm: 42 },
  bus: { base: 1500, perKm: 55 },
};

function getVehicleRate(vehicle) {
  if (!vehicle) return null;
  const key = String(vehicle.category_name || vehicle.vehicle_type || "").trim().toLowerCase();
  if (CATEGORY_RATES[key]) return CATEGORY_RATES[key];
  const seats = Number(vehicle.seating_capacity || 4);
  return { base: 250 + seats * 30, perKm: 14 + seats * 1.5 };
}

function calculateVehicleRoutePrice(distanceKm, vehicle) {
  const rate = getVehicleRate(vehicle);
  if (!rate) return null;
  const km = Math.max(0, Number(distanceKm || 0));
  return (rate.base + km * rate.perKm).toFixed(2);
}

function estimateRouteMetrics(startName, destName) {
  const a = PRESET_LOCATIONS.find((l) => l.name === startName);
  const b = PRESET_LOCATIONS.find((l) => l.name === destName);
  if (!a || !b || a.name === b.name) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  const straightKm = 2 * R * Math.asin(Math.sqrt(h));
  const roadKm = Math.max(2, straightKm * 1.32);
  const durationMin = Math.max(10, Math.round((roadKm / 38) * 60 + 10));
  return {
    km: roadKm.toFixed(2),
    minutes: durationMin,
  };
}

const INITIAL_ROUTE = {
  route_name: "",
  route_code: "",
  starting_location: "",
  destination: "",
  intermediate_stops: "",
  approximate_distance_km: "10.00",
  estimated_duration_minutes: 30,
  route_type: "Airport Transfer",
  selected_vehicle_id: "",
  standard_price: "0.00",
  description: "",
  is_active: true,
};

const INITIAL_SERVICE = {
  service_name: "",
  service_code: "",
  description: "",
  pricing_model: "Flat",
  base_price: "1000.00",
  price_per_km: "",
  price_per_hour: "",
  applicable_category_ids: [],
  is_available: true,
  is_active: true,
};

export default function TransportRoutesServices() {
  const [searchParams] = useSearchParams();
  const { showSuccess, showError } = useNotification();

  const [tab, setTab] = useState("routes"); // routes | services
  const [routes, setRoutes] = useState([]);
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [routeTypeFilter, setRouteTypeFilter] = useState("");

  // Route Modal
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);
  const [routeForm, setRouteForm] = useState(INITIAL_ROUTE);
  const [customStartMode, setCustomStartMode] = useState(false);
  const [customDestMode, setCustomDestMode] = useState(false);
  const [routeNameEdited, setRouteNameEdited] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [savingRoute, setSavingRoute] = useState(false);

  // Service Modal
  const [svcModalOpen, setSvcModalOpen] = useState(false);
  const [editingSvc, setEditingSvc] = useState(null);
  const [svcForm, setSvcForm] = useState(INITIAL_SERVICE);
  const [svcError, setSvcError] = useState("");
  const [savingSvc, setSavingSvc] = useState(false);

  // Delete Confirm
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const [rtRes, svRes, catRes, vehRes] = await Promise.all([
        transportApi.routes({ search: searchQuery.trim() || undefined, route_type: routeTypeFilter || undefined }),
        transportApi.services({ search: searchQuery.trim() || undefined }),
        transportApi.categories(),
        transportApi.vehicles({ page: 1, page_size: 100 }),
      ]);
      setRoutes(rtRes.data || []);
      setServices(svRes.data || []);
      setCategories(catRes.data || []);
      setVehicles((vehRes.data?.items || []).filter((v) => v.is_active && v.status !== "Inactive" && v.status !== "Maintenance"));
    } catch (err) {
      setPageError(trnError(err));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, routeTypeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const fetchAutoRouteCode = useCallback(async (routeType) => {
    try {
      const res = await transportApi.nextRouteCode({ route_type: routeType });
      return res.data?.route_code || "";
    } catch {
      return "";
    }
  }, []);

  const openCreateRoute = async () => {
    const defaultType = "Airport Transfer";
    setEditingRoute(null);
    setCustomStartMode(false);
    setCustomDestMode(false);
    setRouteNameEdited(false);
    setRouteError("");
    setRouteForm({ ...INITIAL_ROUTE, route_type: defaultType, route_code: "Generating..." });
    setRouteModalOpen(true);
    const code = await fetchAutoRouteCode(defaultType);
    setRouteForm((prev) => ({ ...prev, route_code: code }));
  };

  const applyLocationAndVehicleRecalc = (next, { recalcMetrics = false, forcePrice = false } = {}) => {
    if (!routeNameEdited && next.starting_location && next.destination) {
      next.route_name = `${next.starting_location} to ${next.destination}`;
    }
    if (recalcMetrics && next.starting_location && next.destination) {
      const est = estimateRouteMetrics(next.starting_location, next.destination);
      if (est) {
        next.approximate_distance_km = est.km;
        next.estimated_duration_minutes = est.minutes;
      }
    }
    const veh = vehicles.find((v) => String(v.id) === String(next.selected_vehicle_id));
    if (veh && (forcePrice || recalcMetrics)) {
      const calc = calculateVehicleRoutePrice(next.approximate_distance_km, veh);
      if (calc !== null) next.standard_price = calc;
    }
    return next;
  };

  const handleSaveRoute = async (e) => {
    e.preventDefault();
    setRouteError("");
    setSavingRoute(true);
    try {
      const payload = {
        route_name: routeForm.route_name.trim(),
        route_code: editingRoute ? routeForm.route_code : (routeForm.route_code && routeForm.route_code !== "Generating..." ? routeForm.route_code : undefined),
        starting_location: routeForm.starting_location.trim(),
        destination: routeForm.destination.trim(),
        route_type: routeForm.route_type,
        approximate_distance_km: Number(routeForm.approximate_distance_km || 0),
        estimated_duration_minutes: Number(routeForm.estimated_duration_minutes || 30),
        standard_price: Number(routeForm.standard_price || 0),
        intermediate_stops: routeForm.intermediate_stops.trim() || null,
        description: routeForm.description.trim() || null,
        is_active: Boolean(routeForm.is_active),
      };
      if (editingRoute) {
        await transportApi.updateRoute(editingRoute.id, payload);
        showSuccess("Route updated.");
      } else {
        await transportApi.createRoute(payload);
        showSuccess("Route created.");
      }
      setRouteModalOpen(false);
      await loadData();
    } catch (err) {
      setRouteError(trnError(err));
    } finally {
      setSavingRoute(false);
    }
  };

  const handleSaveService = async (e) => {
    e.preventDefault();
    setSvcError("");
    setSavingSvc(true);
    try {
      const payload = {
        ...svcForm,
        base_price: Number(svcForm.base_price || 0),
        price_per_km: svcForm.price_per_km !== "" ? Number(svcForm.price_per_km) : null,
        price_per_hour: svcForm.price_per_hour !== "" ? Number(svcForm.price_per_hour) : null,
        description: svcForm.description.trim() || null,
      };
      if (editingSvc) {
        await transportApi.updateService(editingSvc.id, payload);
        showSuccess("Transport service updated.");
      } else {
        await transportApi.createService(payload);
        showSuccess("Transport service created.");
      }
      setSvcModalOpen(false);
      await loadData();
    } catch (err) {
      setSvcError(trnError(err));
    } finally {
      setSavingSvc(false);
    }
  };

  const handleToggleRoute = async (r) => {
    try {
      await transportApi.updateRoute(r.id, { is_active: !r.is_active });
      showSuccess(`Route '${r.route_name}' ${!r.is_active ? "activated" : "deactivated"}.`);
      await loadData();
    } catch (err) {
      showError(trnError(err));
    }
  };

  const handleToggleService = async (s) => {
    try {
      await transportApi.updateService(s.id, { is_active: !s.is_active });
      showSuccess(`Service '${s.service_name}' ${!s.is_active ? "activated" : "deactivated"}.`);
      await loadData();
    } catch (err) {
      showError(trnError(err));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      if (deleteTarget.type === "route") {
        await transportApi.deleteRoute(deleteTarget.item.id);
        showSuccess("Route deleted.");
      } else {
        await transportApi.deleteService(deleteTarget.item.id);
        showSuccess("Transport service deleted.");
      }
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setDeleteError(trnError(err));
    } finally {
      setDeleting(false);
    }
  };

  const routeColumns = [
    {
      key: "route_name",
      label: "Route",
      render: (r) => (
        <div>
          <div className="font-semibold">{r.route_name}</div>
          <div className="text-xs font-mono text-[#8A9AB2]">{r.route_code}</div>
        </div>
      ),
    },
    { key: "path", label: "From → To", render: (r) => `${r.starting_location} → ${r.destination}` },
    { key: "route_type", label: "Type" },
    { key: "approximate_distance_km", label: "Distance / Time", render: (r) => `${r.approximate_distance_km} km · ${r.estimated_duration_minutes} min` },
    { key: "standard_price", label: "Std. Price", align: "right", cellClassName: "font-semibold tabular-nums", render: (r) => trnMoney(r.standard_price) },
    { key: "is_active", label: "Status", align: "center", render: (r) => <StatusBadge status={r.is_active ? "Active" : "Inactive"} size="sm" /> },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (r) => (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setEditingRoute(r);
              setCustomStartMode(!PRESET_LOCATIONS.some((l) => l.name === r.starting_location));
              setCustomDestMode(!PRESET_LOCATIONS.some((l) => l.name === r.destination));
              setRouteNameEdited(true);
              setRouteForm({
                route_name: r.route_name,
                route_code: r.route_code,
                starting_location: r.starting_location,
                destination: r.destination,
                intermediate_stops: r.intermediate_stops || "",
                approximate_distance_km: r.approximate_distance_km,
                estimated_duration_minutes: r.estimated_duration_minutes,
                route_type: r.route_type,
                selected_vehicle_id: "",
                standard_price: r.standard_price,
                description: r.description || "",
                is_active: r.is_active,
              });
              setRouteError("");
              setRouteModalOpen(true);
            }}
            className="p-1.5 rounded-lg text-stone-500 hover:text-amber-600 cursor-pointer"
          >
            <Edit3 size={15} />
          </button>
          <button type="button" onClick={() => handleToggleRoute(r)} className="p-1.5 rounded-lg text-stone-500 hover:text-emerald-600 cursor-pointer"><Power size={15} /></button>
          <button type="button" onClick={() => { setDeleteError(""); setDeleteTarget({ type: "route", item: r }); }} className="p-1.5 rounded-lg text-stone-500 hover:text-rose-600 cursor-pointer"><Trash2 size={15} /></button>
        </div>
      ),
    },
  ];

  const serviceColumns = [
    {
      key: "service_name",
      label: "Service",
      render: (s) => (
        <div>
          <div className="font-semibold">{s.service_name}</div>
          <div className="text-xs font-mono text-[#8A9AB2]">{s.service_code}</div>
        </div>
      ),
    },
    { key: "pricing_model", label: "Pricing Model" },
    { key: "base_price", label: "Base Price", align: "right", cellClassName: "font-semibold tabular-nums", render: (s) => trnMoney(s.base_price) },
    {
      key: "rates",
      label: "Km / Hour Rates",
      render: (s) => {
        const parts = [];
        if (s.price_per_km != null) parts.push(`${trnMoney(s.price_per_km)}/km`);
        if (s.price_per_hour != null) parts.push(`${trnMoney(s.price_per_hour)}/hr`);
        return parts.length ? parts.join(" · ") : "Flat rate";
      },
    },
    {
      key: "categories",
      label: "Eligible Categories",
      render: (s) => {
        if (!s.applicable_category_ids?.length) return "All Categories";
        return s.applicable_category_ids
          .map((id) => categories.find((c) => c.id === id)?.name || `#${id}`)
          .join(", ");
      },
    },
    { key: "is_active", label: "Status", align: "center", render: (s) => <StatusBadge status={s.is_active && s.is_available ? "Active" : "Inactive"} size="sm" /> },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (s) => (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setEditingSvc(s);
              setSvcForm({
                service_name: s.service_name,
                service_code: s.service_code,
                description: s.description || "",
                pricing_model: s.pricing_model,
                base_price: s.base_price,
                price_per_km: s.price_per_km ?? "",
                price_per_hour: s.price_per_hour ?? "",
                applicable_category_ids: s.applicable_category_ids || [],
                is_available: s.is_available,
                is_active: s.is_active,
              });
              setSvcError("");
              setSvcModalOpen(true);
            }}
            className="p-1.5 rounded-lg text-stone-500 hover:text-amber-600 cursor-pointer"
          >
            <Edit3 size={15} />
          </button>
          <button type="button" onClick={() => handleToggleService(s)} className="p-1.5 rounded-lg text-stone-500 hover:text-emerald-600 cursor-pointer"><Power size={15} /></button>
          <button type="button" onClick={() => { setDeleteError(""); setDeleteTarget({ type: "service", item: s }); }} className="p-1.5 rounded-lg text-stone-500 hover:text-rose-600 cursor-pointer"><Trash2 size={15} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Routes"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-1">
              <button
                type="button"
                onClick={() => setTab("routes")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                  tab === "routes" ? "bg-[#30251C] text-[#FFB02E]" : "text-stone-600 dark:text-[#8A9AB2]"
                }`}
              >
                <Route size={14} /> Routes
              </button>
              <button
                type="button"
                onClick={() => setTab("services")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                  tab === "services" ? "bg-[#30251C] text-[#FFB02E]" : "text-stone-600 dark:text-[#8A9AB2]"
                }`}
              >
                <Settings2 size={14} /> Service Catalogue
              </button>
            </div>

            {tab === "routes" ? (
              <button
                type="button"
                onClick={openCreateRoute}
                className={BUTTON_VARIANTS.primary}
              >
                <Plus size={15} /> Add Route
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingSvc(null);
                  setSvcForm(INITIAL_SERVICE);
                  setSvcError("");
                  setSvcModalOpen(true);
                }}
                className={BUTTON_VARIANTS.primary}
              >
                <Plus size={15} /> Add Service
              </button>
            )}
          </div>
        }
      />

      {pageError && <AlertBanner variant="error" title="Error" message={pageError} onDismiss={() => setPageError("")} />}

      <div className={`${CARD_STYLES.base} w-fit max-w-full !p-2`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tab === "routes" ? "Search route name, code..." : "Search service name or code..."}
              className={`${INPUT_STYLES.base} pl-9 !py-1.5 text-xs`}
            />
          </div>
          {tab === "routes" && (
            <select value={routeTypeFilter} onChange={(e) => setRouteTypeFilter(e.target.value)} className={`${INPUT_STYLES.select} !w-auto min-w-[150px] !py-1.5 text-xs`}>
              <option value="">All Route Types</option>
              {ROUTE_TYPES.map((rt) => <option key={rt} value={rt}>{rt}</option>)}
            </select>
          )}
          {(searchQuery || routeTypeFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setRouteTypeFilter("");
              }}
              className={`${BUTTON_VARIANTS.secondary} !py-1.5 !px-3 text-xs`}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {tab === "routes" ? (
        <VillaDataTable
          columns={routeColumns}
          rows={routes}
          loading={loading}
          emptyIcon={Route}
          emptyTitle="No routes configured"
          emptyDescription="Create airport, station, sightseeing, or intercity transfer routes."
          tableMinWidth="min-w-[840px]"
        />
      ) : (
        <VillaDataTable
          columns={serviceColumns}
          rows={services}
          loading={loading}
          emptyIcon={Settings2}
          emptyTitle="No transport services configured"
          emptyDescription="Add configurable transport services with Flat, Per Km, Per Hour, or Hybrid rates."
          tableMinWidth="min-w-[840px]"
        />
      )}

      {/* ROUTE MODAL */}
      <Modal
        isOpen={routeModalOpen}
        onClose={() => setRouteModalOpen(false)}
        title={editingRoute ? `Edit Route: ${editingRoute.route_name}` : "Add Transport Route"}
        size="lg"
      >
        <form onSubmit={handleSaveRoute} className="space-y-3">
          {routeError && <AlertBanner variant="error" title="Error" message={routeError} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Route Name *</label>
              <input
                type="text"
                required
                value={routeForm.route_name}
                onChange={(e) => {
                  setRouteNameEdited(true);
                  setRouteForm({ ...routeForm, route_name: e.target.value });
                }}
                className={INPUT_STYLES.base}
                placeholder="Auto-filled from locations"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Route Code (Auto-generated)</label>
              <input
                type="text"
                readOnly
                value={routeForm.route_code}
                className={`${INPUT_STYLES.base} bg-stone-50 dark:bg-[#151D29] font-mono text-xs cursor-not-allowed`}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Route Type *</label>
              <select
                value={routeForm.route_type}
                onChange={async (e) => {
                  const newType = e.target.value;
                  setRouteForm((prev) => ({ ...prev, route_type: newType }));
                  if (!editingRoute) {
                    const nextCode = await fetchAutoRouteCode(newType);
                    if (nextCode) setRouteForm((prev) => ({ ...prev, route_code: nextCode }));
                  }
                }}
                className={INPUT_STYLES.select}
              >
                {ROUTE_TYPES.map((rt) => <option key={rt} value={rt}>{rt}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Starting Location *</label>
              <select
                value={customStartMode ? "__custom__" : routeForm.starting_location}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setCustomStartMode(true);
                    setRouteForm((prev) => ({ ...prev, starting_location: "" }));
                  } else {
                    setCustomStartMode(false);
                    setRouteForm((prev) =>
                      applyLocationAndVehicleRecalc({ ...prev, starting_location: e.target.value }, { recalcMetrics: true })
                    );
                  }
                }}
                className={INPUT_STYLES.select}
              >
                <option value="">Select starting location...</option>
                {PRESET_LOCATIONS.map((l) => (
                  <option key={l.name} value={l.name}>{l.name}</option>
                ))}
                <option value="__custom__">Other (Custom Location)</option>
              </select>
              {customStartMode && (
                <input
                  type="text"
                  required
                  value={routeForm.starting_location}
                  onChange={(e) =>
                    setRouteForm((prev) =>
                      applyLocationAndVehicleRecalc({ ...prev, starting_location: e.target.value }, { recalcMetrics: false })
                    )
                  }
                  placeholder="Enter starting location"
                  className={`${INPUT_STYLES.base} mt-1.5`}
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Destination *</label>
              <select
                value={customDestMode ? "__custom__" : routeForm.destination}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setCustomDestMode(true);
                    setRouteForm((prev) => ({ ...prev, destination: "" }));
                  } else {
                    setCustomDestMode(false);
                    setRouteForm((prev) =>
                      applyLocationAndVehicleRecalc({ ...prev, destination: e.target.value }, { recalcMetrics: true })
                    );
                  }
                }}
                className={INPUT_STYLES.select}
              >
                <option value="">Select destination...</option>
                {PRESET_LOCATIONS.map((l) => (
                  <option key={l.name} value={l.name}>{l.name}</option>
                ))}
                <option value="__custom__">Other (Custom Location)</option>
              </select>
              {customDestMode && (
                <input
                  type="text"
                  required
                  value={routeForm.destination}
                  onChange={(e) =>
                    setRouteForm((prev) =>
                      applyLocationAndVehicleRecalc({ ...prev, destination: e.target.value }, { recalcMetrics: false })
                    )
                  }
                  placeholder="Enter destination"
                  className={`${INPUT_STYLES.base} mt-1.5`}
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Select Available Vehicle</label>
              <select
                value={routeForm.selected_vehicle_id}
                onChange={(e) =>
                  setRouteForm((prev) =>
                    applyLocationAndVehicleRecalc({ ...prev, selected_vehicle_id: e.target.value }, { forcePrice: true })
                  )
                }
                className={INPUT_STYLES.select}
              >
                <option value="">Select vehicle to calculate fare...</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.vehicle_name} ({v.category_name || v.vehicle_type} · {v.seating_capacity} seats · {v.status})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Approx. Distance (km)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={routeForm.approximate_distance_km}
                onChange={(e) =>
                  setRouteForm((prev) =>
                    applyLocationAndVehicleRecalc({ ...prev, approximate_distance_km: e.target.value }, { forcePrice: Boolean(prev.selected_vehicle_id) })
                  )
                }
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Est. Duration (minutes)</label>
              <input
                type="number"
                min={1}
                value={routeForm.estimated_duration_minutes}
                onChange={(e) => setRouteForm({ ...routeForm, estimated_duration_minutes: e.target.value })}
                className={INPUT_STYLES.base}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Standard Price (INR) *</label>
              <input
                type="number"
                step="0.01"
                min={0}
                required
                value={routeForm.standard_price}
                onChange={(e) => setRouteForm({ ...routeForm, standard_price: e.target.value })}
                className={INPUT_STYLES.base}
              />
              {routeForm.selected_vehicle_id && (
                <p className="text-[11px] text-emerald-600 mt-0.5">Calculated from distance & vehicle category (editable)</p>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Intermediate Stops</label>
            <input type="text" value={routeForm.intermediate_stops} onChange={(e) => setRouteForm({ ...routeForm, intermediate_stops: e.target.value })} className={INPUT_STYLES.base} placeholder="Comma-separated stops" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Description</label>
            <textarea rows={2} value={routeForm.description} onChange={(e) => setRouteForm({ ...routeForm, description: e.target.value })} className={INPUT_STYLES.base} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setRouteModalOpen(false)} className={BUTTON_VARIANTS.secondary}>Cancel</button>
            <button type="submit" disabled={savingRoute} className={BUTTON_VARIANTS.primary}>{savingRoute ? "Saving..." : "Save Route"}</button>
          </div>
        </form>
      </Modal>

      {/* SERVICE MODAL */}
      <Modal
        isOpen={svcModalOpen}
        onClose={() => setSvcModalOpen(false)}
        title={editingSvc ? `Edit Service: ${editingSvc.service_name}` : "Add Transport Service"}
        size="lg"
      >
        <form onSubmit={handleSaveService} className="space-y-3">
          {svcError && <AlertBanner variant="error" title="Error" message={svcError} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Service Name *</label>
              <input type="text" required value={svcForm.service_name} onChange={(e) => setSvcForm({ ...svcForm, service_name: e.target.value })} className={INPUT_STYLES.base} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Service Code *</label>
              <input type="text" required value={svcForm.service_code} onChange={(e) => setSvcForm({ ...svcForm, service_code: e.target.value })} className={INPUT_STYLES.base} placeholder="e.g. SVC-AIR-DROP" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Pricing Model *</label>
              <select value={svcForm.pricing_model} onChange={(e) => setSvcForm({ ...svcForm, pricing_model: e.target.value })} className={INPUT_STYLES.select}>
                {PRICING_MODELS.map((pm) => <option key={pm} value={pm}>{pm}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Base Price (INR) *</label>
              <input type="number" step="0.01" min={0} required value={svcForm.base_price} onChange={(e) => setSvcForm({ ...svcForm, base_price: e.target.value })} className={INPUT_STYLES.base} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Rate per Km (INR)</label>
              <input type="number" step="0.01" min={0} value={svcForm.price_per_km} onChange={(e) => setSvcForm({ ...svcForm, price_per_km: e.target.value })} className={INPUT_STYLES.base} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Rate per Hour (INR)</label>
              <input type="number" step="0.01" min={0} value={svcForm.price_per_hour} onChange={(e) => setSvcForm({ ...svcForm, price_per_hour: e.target.value })} className={INPUT_STYLES.base} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5">Applicable Vehicle Categories (leave empty for all)</label>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const checked = svcForm.applicable_category_ids.includes(c.id);
                return (
                  <label key={c.id} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E9F0] dark:border-[#1E293B] px-2.5 py-1 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked
                          ? svcForm.applicable_category_ids.filter((id) => id !== c.id)
                          : [...svcForm.applicable_category_ids, c.id];
                        setSvcForm({ ...svcForm, applicable_category_ids: next });
                      }}
                      className="accent-amber-500"
                    />
                    <span>{c.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Description</label>
            <textarea rows={2} value={svcForm.description} onChange={(e) => setSvcForm({ ...svcForm, description: e.target.value })} className={INPUT_STYLES.base} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setSvcModalOpen(false)} className={BUTTON_VARIANTS.secondary}>Cancel</button>
            <button type="submit" disabled={savingSvc} className={BUTTON_VARIANTS.primary}>{savingSvc ? "Saving..." : "Save Service"}</button>
          </div>
        </form>
      </Modal>

      <DeleteConfirm
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        recordName={deleteTarget?.type === "route" ? deleteTarget.item?.route_name : deleteTarget?.item?.service_name}
        message="Items referenced by existing transport bookings cannot be deleted."
        loading={deleting}
        error={deleteError}
      />
    </div>
  );
}
