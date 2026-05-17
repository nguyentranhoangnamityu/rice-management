import { LogOut } from "lucide-react";
import type { CSSProperties } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { branding } from "../../config/branding";
import { navigation } from "../../config/navigation";
import { AppBrand } from "./AppBrand";

export function MobileMenuPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="mobile-menu" role="main">
      <header className="mobile-menu-header">
        <AppBrand variant="mobile" />
      </header>

      <nav className="mobile-menu-grid" aria-label="Menu chức năng">
        {navigation.map((item, index) => (
          <NavLink
            key={item.to}
            to={item.to}
            className="mobile-menu-tile"
            style={
              {
                "--tile-accent": item.accent,
                "--tile-pastel": item.pastel,
                "--tile-delay": `${index * 35}ms`,
              } as CSSProperties
            }
          >
            <span className="mobile-menu-tile-icon" aria-hidden="true">
              <item.icon size={26} strokeWidth={2} />
            </span>
            <span className="mobile-menu-tile-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <footer className="mobile-menu-footer">
        <p className="mobile-menu-company">{branding.companyName}</p>
        <button className="mobile-menu-logout" type="button" onClick={() => void handleLogout()}>
          <LogOut aria-hidden="true" size={20} strokeWidth={2} />
          <span>Đăng xuất</span>
        </button>
      </footer>
    </div>
  );
}
