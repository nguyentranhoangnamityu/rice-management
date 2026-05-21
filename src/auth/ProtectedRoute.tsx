import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export function ProtectedRoute() {
  const { loading, session, profile } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-shell">
        <div className="state-box">Đang kiểm tra đăng nhập...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (profile?.status === "inactive") {
    return (
      <div className="auth-shell">
        <div className="state-box">Tài khoản đã ngưng hoạt động. Vui lòng liên hệ chủ hệ thống.</div>
      </div>
    );
  }

  return <Outlet />;
}
