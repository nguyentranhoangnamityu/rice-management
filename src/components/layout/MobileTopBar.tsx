import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { getNavTitle } from "../../config/navigation";

export function MobileTopBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const title = getNavTitle(pathname);

  return (
    <header className="mobile-top-bar">
      <button
        className="mobile-top-bar-back"
        type="button"
        aria-label="Về menu"
        onClick={() => navigate("/menu")}
      >
        <ArrowLeft aria-hidden="true" size={22} strokeWidth={2} />
      </button>
      <h1 className="mobile-top-bar-title">{title}</h1>
      <span className="mobile-top-bar-spacer" aria-hidden="true" />
    </header>
  );
}
