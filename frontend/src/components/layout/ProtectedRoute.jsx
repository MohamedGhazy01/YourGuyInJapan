import { Navigate, useLocation } from "react-router-dom";
import { useApp } from "../../context/AppProvider";

export const ProtectedRoute = ({ children, admin = false }) => {
  const { auth } = useApp();
  const location = useLocation();

  if (!auth.user) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }
  if (admin && auth.user.role !== "admin") return <Navigate to="/" replace />;
  return children;
};

