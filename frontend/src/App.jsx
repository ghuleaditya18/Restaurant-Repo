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

import ProtectedRoute from "./components/ProtectedRoute";

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-page)] text-[var(--text-main)] font-semibold text-sm">
        Verifying your session...
      </div>
    );
  }

  const isSpa = user?.business_context === "SPA";
  const defaultHome = isSpa ? "/spa/dashboard" : "/";

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to={defaultHome} replace /> : <Login />}
      />

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
