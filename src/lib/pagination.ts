export const PAGE_SIZE = 10;

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
};

export function getPageRange(page: number, pageSize = PAGE_SIZE) {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  return { from, to, page: safePage };
}

export function getTotalPages(total: number, pageSize = PAGE_SIZE) {
  if (total <= 0) return 1;
  return Math.ceil(total / Math.max(1, pageSize));
}
