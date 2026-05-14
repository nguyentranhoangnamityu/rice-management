import {
  Banknote,
  Factory,
  FileArchive,
  FileDown,
  Flag,
  Home,
  Landmark,
  Map,
  PackageCheck,
  ReceiptText,
  Sprout,
  Truck,
  Users,
  Wheat,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

const navigation = [
  { to: "/dashboard", label: "Tổng quan", icon: Home },
  { to: "/rice-types", label: "Loại lúa", icon: Wheat },
  { to: "/seasons", label: "Mùa vụ", icon: Flag },
  { to: "/farmers", label: "Nông dân", icon: Sprout },
  { to: "/brokers", label: "Cò lúa", icon: Users },
  { to: "/purchase-batches", label: "Đợt mua", icon: PackageCheck },
  { to: "/purchase-items", label: "Phiếu mua", icon: ReceiptText },
  { to: "/transport-trips", label: "Chuyến ghe", icon: Truck },
  { to: "/transport-routes", label: "Tuyến vận chuyển", icon: Map },
  { to: "/factories", label: "Nhà máy", icon: Factory },
  { to: "/processing-records", label: "Sấy xay xát", icon: Landmark },
  { to: "/debts", label: "Công nợ", icon: Banknote },
  { to: "/attachments", label: "Chứng từ", icon: FileArchive },
  { to: "/exports", label: "Xuất file", icon: FileDown },
];

export function AppLayout() {
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
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
