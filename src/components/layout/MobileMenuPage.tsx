import { LogOut } from "lucide-react";
import type { CSSProperties } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { navigation } from "../../config/navigation";

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
        <div className="brand-mark mobile-menu-mark">RM</div>
        <div>
          <h1>Quản lý lúa</h1>
          <p>Chọn chức năng để bắt đầu</p>
        </div>
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
        <button className="mobile-menu-logout" type="button" onClick={() => void handleLogout()}>
          <LogOut aria-hidden="true" size={20} strokeWidth={2} />
          <span>Đăng xuất</span>
        </button>
      </footer>
    </div>
  );
}
