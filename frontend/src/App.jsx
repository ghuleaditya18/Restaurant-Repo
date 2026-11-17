import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./context/AuthContext";

import DashboardLayout from "./layouts/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Staff from "./pages/Staff";
import Menu from "./pages/Menu";
import Customers from "./pages/Customers";
import Tables from "./pages/Tables";
import Orders from "./pages/Orders";
import Invoices from "./pages/Invoices";

import ProtectedRoute from "./components/ProtectedRoute";

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#C65D35]">
        Verifying your session...
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

        <Route path="orders" element={<Orders />} />

        <Route
          path="tables"
          element={
            <ProtectedRoute allowedRoles={["MANAGER"]}>
              <Tables />
            </ProtectedRoute>
          }
        />

        <Route
          path="menu"
          element={
            <ProtectedRoute allowedRoles={["MANAGER"]}>
              <Menu />
            </ProtectedRoute>
          }
        />

        <Route
          path="customers"
          element={
            <ProtectedRoute allowedRoles={["MANAGER"]}>
              <Customers />
            </ProtectedRoute>
          }
        />

        <Route
          path="staff"
          element={
            <ProtectedRoute allowedRoles={["MANAGER"]}>
              <Staff />
            </ProtectedRoute>
          }
        />

        <Route path="invoices" element={<Invoices />} />
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
