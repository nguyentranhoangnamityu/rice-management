import type { ReactNode } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type ModalShellProps = {
  children: ReactNode;
  onClose?: () => void;
  wide?: boolean;
};

export function ModalShell({ children, onClose, wide = false }: ModalShellProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div
        className={wide ? "modal-panel modal-panel-wide" : "modal-panel"}
        onClick={(event) => event.stopPropagation()}
      >
        {onClose ? (
          <button className="modal-close-button" type="button" onClick={onClose} aria-label="Đóng">
            <X size={18} aria-hidden="true" />
          </button>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
