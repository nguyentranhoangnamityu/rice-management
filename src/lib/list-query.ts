import { listTableConfig, type ListTableKey } from "../config/list-tables";
import { formatDbError } from "./db-errors";
import { getPageRange, getTotalPages, type PaginatedResult } from "./pagination";
import { supabase } from "./supabase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryBuilder = any;

export type ListQueryOptions = {
  search?: string;
  applySearch?: (query: QueryBuilder, search: string) => QueryBuilder;
  /** Trả về chuỗi filter PostgREST cho `.or()` — không trả query builder trong async (sẽ bị await thực thi sớm). */
  resolveSearchFilter?: (search: string) => Promise<string | null>;
  applyFilter?: (query: QueryBuilder) => QueryBuilder;
};

function applyTextSearch(query: QueryBuilder, search: string, columns: string[]) {
  const term = search.trim();
  if (!term || columns.length === 0) return query;

  const escaped = term.replace(/[%_,]/g, "");
  if (!escaped) return query;

  const pattern = `%${escaped}%`;
  return query.or(columns.map((column) => `${column}.ilike.${pattern}`).join(","));
}

export async function fetchPaginatedList<T>(
  table: ListTableKey,
  page: number,
  options: ListQueryOptions = {},
): Promise<PaginatedResult<T>> {
  const config = listTableConfig[table];
  const { from, to, page: safePage } = getPageRange(page);
  const search = options.search?.trim() ?? "";

  let query = supabase.from(table).select("*", { count: "exact" });

  if (options.applyFilter) {
    query = options.applyFilter(query);
  }

  if (options.resolveSearchFilter) {
    const orFilter = await options.resolveSearchFilter(search);
    if (orFilter) {
      query = query.or(orFilter);
    }
  } else if (options.applySearch) {
    query = options.applySearch(query, search);
  } else {
    query = applyTextSearch(query, search, config.searchColumns);
  }

  const { data, error, count } = await query
    .order(config.orderColumn, { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(formatDbError(error));
  }

  const total = count ?? 0;
  return {
    data: (data ?? []) as T[],
    total,
    page: safePage,
    totalPages: getTotalPages(total),
  };
}
