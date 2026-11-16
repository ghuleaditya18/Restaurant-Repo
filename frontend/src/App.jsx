import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./context/AuthContext";

import DashboardLayout from "./layouts/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import ModulePage from "./pages/ModulePage";
import Staff from "./pages/Staff";
import Menu from "./pages/Menu";
import Customers from "./pages/Customers";

import ProtectedRoute from "./components/ProtectedRoute";

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <Login />}
      />

      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />

        <Route
          path="/orders"
          element={
            <ModulePage
              title="Orders"
              description="Manage restaurant orders."
              emptyMessage="Orders will appear here."
            />
          }
        />

        <Route
          path="/tables"
          element={
            <ModulePage
              title="Tables"
              description="Manage restaurant tables."
              emptyMessage="Tables will appear here."
            />
          }
        />

        <Route
          path="/menu"
          element={<Menu />}
        />

        <Route path="customers" element={<Customers />} />

        <Route
          path="/staff"
          element={
            <ProtectedRoute allowedRoles={["MANAGER"]}>
              <Staff />
            </ProtectedRoute>
          }
        />

        <Route
          path="/invoices"
          element={
            <ModulePage
              title="Invoices"
              description="Manage customer invoices and payment records."
              emptyMessage="Invoices will appear here."
            />
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
