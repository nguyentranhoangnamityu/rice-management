import type { ReactNode } from "react";
import { X } from "lucide-react";

type ModalShellProps = {
  children: ReactNode;
  onClose?: () => void;
  wide?: boolean;
};

export function ModalShell({ children, onClose, wide = false }: ModalShellProps) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className={wide ? "modal-panel modal-panel-wide" : "modal-panel"}>
        {onClose ? (
          <button className="modal-close-button" type="button" onClick={onClose} aria-label="Đóng">
            <X size={18} aria-hidden="true" />
          </button>
        ) : null}
        {children}
      </div>
    </div>
  );
}
