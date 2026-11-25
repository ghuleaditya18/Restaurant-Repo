import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getModuleHomeRoute, normalizeModuleContext } from "../config/moduleRouting";

function ProtectedRoute({
  children,
  allowedRoles = ["MANAGER", "RECEPTIONIST"],
  allowedContext = null,
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F0F2F7] dark:bg-[#0B111A] text-stone-900 dark:text-stone-100 font-semibold text-sm">
        Verifying your session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const role = user.role ? user.role.toUpperCase() : "";

  // Staff members cannot access any protected frontend page
  if (role === "STAFF") {
    return <Navigate to="/login" replace />;
  }

  if (
    allowedRoles &&
    !allowedRoles.map((r) => r.toUpperCase()).includes(role)
  ) {
    return <Navigate to="/login" replace />;
  }

  const userContext = normalizeModuleContext(user.business_context);
  if (!userContext) {
    return <Navigate to="/login" replace />;
  }

  if (allowedContext) {
    const requiredContext = normalizeModuleContext(allowedContext);
    if (!requiredContext || requiredContext !== userContext) {
      return <Navigate to={getModuleHomeRoute(userContext)} replace />;
    }
  }

  return children;
}

export default ProtectedRoute;
