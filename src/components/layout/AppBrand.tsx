import { branding } from "../../config/branding";

type AppBrandProps = {
  variant?: "sidebar" | "auth" | "mobile";
  authSubtitle?: string;
};

export function AppBrand({ variant = "sidebar", authSubtitle = "Đăng nhập hệ thống" }: AppBrandProps) {
  const isAuth = variant === "auth";

  return (
    <div className={`brand brand-${variant}${isAuth ? " auth-brand" : ""}`}>
      <div className="brand-mark" aria-hidden="true">
        {branding.mark}
      </div>
      <div className="brand-copy">
        <strong>{branding.appName}</strong>
        <span className="brand-company">{branding.companyName}</span>
        <span className="brand-tagline">{isAuth ? authSubtitle : branding.appTagline}</span>
      </div>
    </div>
  );
}
