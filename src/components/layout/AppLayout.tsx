import { LogOut } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { navigation } from "../../config/navigation";
import { useIsMobile } from "../../hooks/useIsMobile";
import { AppBrand } from "./AppBrand";
import { MobileTopBar } from "./MobileTopBar";

export function AppLayout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const isMenuRoute = location.pathname === "/menu";

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className={`app-shell${isMobile ? " app-shell-mobile" : ""}`}>
      {!isMobile ? (
        <aside className="sidebar" aria-label="Điều hướng chính">
          <AppBrand variant="sidebar" />

          <nav className="nav-list">
            {navigation.map((item) => (
              <NavLink key={item.to} to={item.to} className="nav-link">
                <item.icon aria-hidden="true" size={19} strokeWidth={2} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="sidebar-footer">
            <button className="logout-button" type="button" onClick={() => void handleLogout()}>
              <LogOut aria-hidden="true" size={19} strokeWidth={2} />
              <span>Đăng xuất</span>
            </button>
          </div>
        </aside>
      ) : null}

      <div className="app-main-column">
        {isMobile && !isMenuRoute ? <MobileTopBar /> : null}

        <main
          className={`main-content${isMobile && isMenuRoute ? " main-content-menu" : ""}${isMobile && !isMenuRoute ? " main-content-mobile-page" : ""}`}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
