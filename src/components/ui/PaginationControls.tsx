import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE } from "../../lib/pagination";

type PaginationControlsProps = {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
};

export function PaginationControls({
  page,
  totalPages,
  total,
  onPageChange,
  loading = false,
}: PaginationControlsProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const canGoPrev = page > 1 && !loading;
  const canGoNext = page < safeTotalPages && !loading;
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(page * PAGE_SIZE, total);

  return (
    <div className="pagination-bar" aria-label="Phân trang">
      <span className="pagination-summary">
        {total === 0
          ? "Không có bản ghi"
          : `Hiển thị ${rangeStart}–${rangeEnd} / ${total} bản ghi · Trang ${page}/${safeTotalPages}`}
      </span>
      <div className="pagination-actions">
        <button
          className="secondary-button pagination-button"
          type="button"
          disabled={!canGoPrev}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={17} aria-hidden="true" />
          Trước
        </button>
        <button
          className="secondary-button pagination-button"
          type="button"
          disabled={!canGoNext}
          onClick={() => onPageChange(page + 1)}
        >
          Sau
          <ChevronRight size={17} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
