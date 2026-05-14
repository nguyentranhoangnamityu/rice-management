import {
  Banknote,
  Factory,
  FileArchive,
  FileDown,
  Flag,
  Home,
  Landmark,
  LogOut,
  Map,
  PackageCheck,
  ReceiptText,
  Sprout,
  Truck,
  Users,
  Wheat,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";

const navigation = [
  { to: "/dashboard", label: "Tổng quan", icon: Home },
  { to: "/rice-types", label: "Loại lúa", icon: Wheat },
  { to: "/seasons", label: "Mùa vụ", icon: Flag },
  { to: "/farmers", label: "Nông dân", icon: Sprout },
  { to: "/brokers", label: "Cò lúa", icon: Users },
  { to: "/purchase-slips", label: "Phiếu mua", icon: ReceiptText },
  { to: "/purchase-batches", label: "Đợt mua", icon: PackageCheck },
  { to: "/purchase-items", label: "Mục mua cũ", icon: ReceiptText },
  { to: "/transporter-boats", label: "Ghe vận chuyển", icon: Truck },
  { to: "/transport-trips", label: "Chuyến ghe", icon: Truck },
  { to: "/transport-routes", label: "Tuyến vận chuyển", icon: Map },
  { to: "/factories", label: "Nhà máy", icon: Factory },
  { to: "/processing-records", label: "Sấy xay xát", icon: Landmark },
  { to: "/debts", label: "Công nợ", icon: Banknote },
  { to: "/attachments", label: "Chứng từ", icon: FileArchive },
  { to: "/exports", label: "Xuất file", icon: FileDown },
];

export function AppLayout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Điều hướng chính">
        <div className="brand">
          <div className="brand-mark">RM</div>
          <div>
            <strong>Quản lý lúa</strong>
            <span>Rice Management</span>
          </div>
        </div>

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

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
