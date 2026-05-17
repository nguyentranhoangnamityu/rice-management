import { useCallback, useEffect, useState } from "react";
import type { ListTableKey } from "../config/list-tables";
import { fetchPaginatedList, type ListQueryOptions } from "../lib/list-query";
import { formatDbError } from "../lib/db-errors";
import type { PaginatedResult } from "../lib/pagination";

type UseServerPaginationOptions = {
  queryOptions?: Omit<ListQueryOptions, "search">;
};

export function useServerPagination<T>(table: ListTableKey, options: UseServerPaginationOptions = {}) {
  const { queryOptions } = options;
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const loadPage = useCallback(
    async (targetPage: number): Promise<PaginatedResult<T>> => {
      return fetchPaginatedList<T>(table, targetPage, {
        ...queryOptions,
        search: debouncedSearch,
      });
    },
    [table, debouncedSearch, queryOptions],
  );

  const refresh = useCallback(
    async (preferredPage = page) => {
      setLoading(true);
      setError(null);

      try {
        let result = await loadPage(preferredPage);

        if (result.data.length === 0 && result.total > 0 && preferredPage > 1) {
          result = await loadPage(preferredPage - 1);
        }

        setItems(result.data);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        setPage(result.page);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : formatDbError(null, "Không thể tải dữ liệu"));
      } finally {
        setLoading(false);
      }
    },
    [loadPage, page],
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        let result = await loadPage(page);

        if (!cancelled && result.data.length === 0 && result.total > 0 && page > 1) {
          result = await loadPage(page - 1);
        }

        if (!cancelled) {
          setItems(result.data);
          setTotal(result.total);
          setTotalPages(result.totalPages);
          setPage(result.page);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : formatDbError(null, "Không thể tải dữ liệu"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [loadPage, page]);

  return {
    items,
    page,
    setPage,
    total,
    totalPages,
    search,
    setSearch,
    loading,
    error,
    refresh,
  };
}
