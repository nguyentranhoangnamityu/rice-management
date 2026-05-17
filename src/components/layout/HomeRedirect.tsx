import { Navigate } from "react-router-dom";
import { useIsMobile } from "../../hooks/useIsMobile";

export function HomeRedirect() {
  const isMobile = useIsMobile();
  return <Navigate to={isMobile ? "/menu" : "/dashboard"} replace />;
}
