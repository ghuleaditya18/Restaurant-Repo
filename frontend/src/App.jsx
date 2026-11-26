import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { NotificationProvider } from "./context/NotificationContext";

import DashboardLayout from "./layouts/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Staff from "./pages/Staff";
import Menu from "./pages/Menu";
import Customers from "./pages/Customers";
import Tables from "./pages/Tables";
import Orders from "./pages/Orders";
import Invoices from "./pages/Invoices";
import Settings from "./pages/Settings";
import Inventory from "./pages/Inventory";

// Spa Module Pages
import SpaDashboard from "./modules/spa/pages/SpaDashboard";
import SpaBookings from "./modules/spa/pages/SpaBookings";
import SpaServices from "./modules/spa/pages/SpaServices";
import SpaCustomers from "./modules/spa/pages/SpaCustomers";
import SpaStaff from "./modules/spa/pages/SpaStaff";
import SpaInvoices from "./modules/spa/pages/SpaInvoices";
import VillasDashboard from "./modules/villas/VillasDashboard";
import VillasInventory from "./modules/villas/VillasInventory";
import VillaBookings from "./modules/villas/VillaBookings";
import VillaGuests from "./modules/villas/VillaGuests";
import VillaOperations from "./modules/villas/VillaOperations";
import PackagesDashboard from "./modules/packages/PackagesDashboard";
import PackagesCatalog from "./modules/packages/PackagesCatalog";
import PackageBookings from "./modules/packages/PackageBookings";
import PackageCustomers from "./modules/packages/PackageCustomers";
import PackageInvoices from "./modules/packages/PackageInvoices";
import PackageReports from "./modules/packages/PackageReports";
import ActivitiesDashboard from "./modules/activities/ActivitiesDashboard";
import ActivitiesCatalog from "./modules/activities/ActivitiesCatalog";
import ActivitiesSchedule from "./modules/activities/ActivitiesSchedule";
import ActivityBookings from "./modules/activities/ActivityBookings";
import ActivityRoster from "./modules/activities/ActivityRoster";
import ActivityCustomers from "./modules/activities/ActivityCustomers";
import ActivityInvoices from "./modules/activities/ActivityInvoices";
import ActivityReports from "./modules/activities/ActivityReports";

import ProtectedRoute from "./components/ProtectedRoute";
import { getModuleHomeRoute } from "./config/moduleRouting";

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-page)] text-[var(--text-main)] font-semibold text-sm">
        Verifying your session...
      </div>
    );
  }

  const defaultHome = user ? getModuleHomeRoute(user.business_context) : "/login";

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to={defaultHome} replace /> : <Login />}
      />
      {[
        ["restaurant", "RESTAURANT"],
        ["spa", "SPA"],
        ["villas", "VILLA"],
        ["packages", "PACKAGE"],
        ["activities", "ACTIVITY"],
      ].map(([path, context]) => (
        <Route
          key={path}
          path={`/login/${path}`}
          element={user ? <Navigate to={defaultHome} replace /> : <Login moduleContext={context} />}
        />
      ))}

      {/* Restaurant Protected Routes */}
      <Route
        element={
          <ProtectedRoute allowedRoles={["MANAGER", "RECEPTIONIST"]} allowedContext="RESTAURANT">
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="orders" element={<Orders />} />
        <Route path="tables" element={<Tables />} />
        <Route path="menu" element={<Menu />} />
        <Route path="customers" element={<Customers />} />
        <Route path="staff" element={<Staff />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="inventory" element={<Inventory />} />
      </Route>

      {/* Spa Protected Routes */}
      <Route
        path="/spa"
        element={
          <ProtectedRoute allowedRoles={["MANAGER", "RECEPTIONIST"]} allowedContext="SPA">
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<SpaDashboard />} />
        <Route path="bookings" element={<SpaBookings />} />
        <Route path="services" element={<SpaServices />} />
        <Route path="customers" element={<SpaCustomers />} />
        <Route path="staff" element={<SpaStaff />} />
        <Route path="therapists" element={<Navigate to="/spa/staff" replace />} />
        <Route path="invoices" element={<SpaInvoices />} />
        <Route path="payments" element={<Navigate to="/spa/invoices?tab=transactions" replace />} />
      </Route>

      <Route path="/villas" element={
        <ProtectedRoute allowedRoles={["MANAGER", "RECEPTIONIST"]} allowedContext="VILLA">
          <DashboardLayout />
        </ProtectedRoute>
      }>
        <Route path="dashboard" element={<VillasDashboard />} />
        <Route path="inventory" element={<VillasInventory />} />
        <Route path="bookings" element={<VillaBookings />} />
        <Route path="guests" element={<VillaGuests />} />
        <Route path="services" element={<VillaOperations />} />
        <Route path="invoices" element={<VillaOperations view="invoices" />} />
        <Route path="reports" element={<VillaOperations view="reports" />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Packages Protected Routes */}
      <Route
        path="/packages"
        element={
          <ProtectedRoute allowedRoles={["MANAGER", "RECEPTIONIST"]} allowedContext="PACKAGE">
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<PackagesDashboard />} />
        <Route path="catalog" element={<PackagesCatalog />} />
        <Route path="bookings" element={<PackageBookings />} />
        <Route path="offers" element={<PackagesCatalog seasonalOnly={true} />} />
        <Route path="customers" element={<PackageCustomers />} />
        <Route path="invoices" element={<PackageInvoices />} />
        <Route path="reports" element={<PackageReports />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Activities Protected Routes */}
      <Route
        path="/activities"
        element={
          <ProtectedRoute allowedRoles={["MANAGER", "RECEPTIONIST"]} allowedContext="ACTIVITY">
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<ActivitiesDashboard />} />
        <Route path="catalog" element={<ActivitiesCatalog />} />
        <Route path="schedule" element={<ActivitiesSchedule />} />
        <Route path="bookings" element={<ActivityBookings />} />
        <Route path="roster" element={<ActivityRoster />} />
        <Route path="customers" element={<ActivityCustomers />} />
        <Route path="invoices" element={<ActivityInvoices />} />
        <Route path="reports" element={<ActivityReports />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Shared Protected Settings Route */}
      <Route
        element={
          <ProtectedRoute allowedRoles={["MANAGER", "RECEPTIONIST"]}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to={defaultHome} replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <NotificationProvider>
            <AppRoutes />
          </NotificationProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
