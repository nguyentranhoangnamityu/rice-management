export const PAGE_SIZE = 10;

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
};

export function getPageRange(page: number) {
  const safePage = Math.max(1, page);
  const from = (safePage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  return { from, to, page: safePage };
}

export function getTotalPages(total: number) {
  if (total <= 0) return 1;
  return Math.ceil(total / PAGE_SIZE);
}
