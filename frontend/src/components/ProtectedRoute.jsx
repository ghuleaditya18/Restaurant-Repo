import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

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

  const userContext = (user.business_context || "RESTAURANT").toUpperCase();

  if (allowedContext) {
    const requiredContext = allowedContext.toUpperCase();
    if (requiredContext !== userContext) {
      // Cross-business redirection: Spa user attempting restaurant route -> /spa/dashboard; Restaurant user -> /
      return <Navigate to={userContext === "SPA" ? "/spa/dashboard" : "/"} replace />;
    }
  }

  return children;
}

export default ProtectedRoute;