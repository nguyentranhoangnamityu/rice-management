import type { LucideIcon } from "lucide-react";
import { branding } from "./branding";
import {
  Banknote,
  Factory,
  FileArchive,
  FileDown,
  FileText,
  Flag,
  Home,
  Landmark,
  Map,
  ReceiptText,
  Sprout,
  Truck,
  Users,
  Wheat,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Màu icon & chữ — tông pastel đậm vừa đủ đọc */
  accent: string;
  /** Nền ô vuông */
  pastel: string;
};

export const navigation: NavItem[] = [
  { to: "/dashboard", label: "Tổng quan", icon: Home, accent: "#4d8f72", pastel: "#dff5ea" },
  { to: "/rice-types", label: "Loại lúa", icon: Wheat, accent: "#b8924a", pastel: "#faf0d9" },
  { to: "/seasons", label: "Mùa vụ", icon: Flag, accent: "#5a8fad", pastel: "#dceef8" },
  { to: "/farmers", label: "Nông dân", icon: Sprout, accent: "#4d9b6a", pastel: "#ddf3e4" },
  { to: "/brokers", label: "Cò lúa", icon: Users, accent: "#7a72a8", pastel: "#e8e4f5" },
  { to: "/purchase-slips", label: "Phiếu mua", icon: ReceiptText, accent: "#5a8f6e", pastel: "#e4f0e6" },
  { to: "/authorization-letters", label: "Giấy ủy quyền", icon: FileText, accent: "#8a72a0", pastel: "#efe4f5" },
  { to: "/transporter-boats", label: "Ghe vận chuyển", icon: Truck, accent: "#5a85a8", pastel: "#dceaf5" },
  { to: "/transport-trips", label: "Chuyến ghe", icon: Truck, accent: "#4a90a0", pastel: "#dbf0f5" },
  { to: "/transport-routes", label: "Tuyến vận chuyển", icon: Map, accent: "#4a9488", pastel: "#d9f0ee" },
  { to: "/factories", label: "Nhà máy", icon: Factory, accent: "#a08060", pastel: "#f5ebe0" },
  { to: "/processing-records", label: "Sấy xay xát", icon: Landmark, accent: "#c07850", pastel: "#fce8dc" },
  { to: "/debts", label: "Công nợ", icon: Banknote, accent: "#c06878", pastel: "#fce4e8" },
  { to: "/attachments", label: "Chứng từ", icon: FileArchive, accent: "#7a7870", pastel: "#ebeae6" },
  { to: "/exports", label: "Xuất file", icon: FileDown, accent: "#3d8f6a", pastel: "#e0f5ec" },
];

export function getNavTitle(pathname: string) {
  const exact = navigation.find((item) => item.to === pathname);
  if (exact) return exact.label;

  const nested = navigation.find(
    (item) => item.to !== "/dashboard" && pathname.startsWith(`${item.to}/`),
  );
  if (nested) return nested.label;

  return branding.appName;
}
