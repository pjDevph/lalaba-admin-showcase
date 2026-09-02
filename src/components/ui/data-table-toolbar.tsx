"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 75, 100] as const;

const pageSizeItems = Object.fromEntries(
  PAGE_SIZE_OPTIONS.map((size) => [String(size), String(size)]),
);

interface DataTableToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  // Set for tables with nothing to search (e.g. a single employee's
  // attendance history) — hides the search input instead of showing one
  // that silently does nothing.
  hideSearch?: boolean;
  // Page-specific filter controls (e.g. business/role/status selects),
  // rendered next to the search input — differs per page, unlike the
  // search/page-size/pagination controls which are the same everywhere.
  filters?: React.ReactNode;
  limit: number;
  onLimitChange: (limit: number) => void;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

// Standard search + page-size + pagination toolbar for every table-backed
// list in this app — renders above the DataTable, not below it. Owns
// debouncing the search input itself so every call site gets it for free.
export function DataTableToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  hideSearch = false,
  filters,
  limit,
  onLimitChange,
  page,
  totalPages,
  onPageChange,
}: DataTableToolbarProps) {
  const [inputValue, setInputValue] = useState(search);
  const debouncedValue = useDebouncedValue(inputValue, 300);

  useEffect(() => {
    onSearchChange(debouncedValue);
    // Only re-run when the debounced value itself changes — including
    // onSearchChange would re-fire on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedValue]);

  return (
    <div className="flex flex-col gap-3">
      {/* Search and paging share the top line; FILTERS GET THEIR OWN, at full
          width. Sharing one row squeezed the status chips into a column beside
          a half-empty search box — the layout complaint on the orders and
          inbox screens. Giving the shrunken side flex-1 only made it worse,
          because min-w-0 let it collapse to nothing; the honest fix is to stop
          asking two things to share a line neither can size itself against. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {!hideSearch && (
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={searchPlaceholder}
            className="sm:max-w-xs"
          />
        )}
        <div className="flex shrink-0 items-center gap-4 sm:ml-auto">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="whitespace-nowrap">Rows per page</span>
            <Select
              items={pageSizeItems}
              value={String(limit)}
              onValueChange={(value) => value && onLimitChange(Number(value))}
            >
              <SelectTrigger className="w-[76px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        {totalPages > 1 && (
          <Pagination className="mx-0 w-auto">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onPageChange(Math.max(1, page - 1));
                  }}
                  className={
                    page === 1 ? "pointer-events-none opacity-50" : undefined
                  }
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#" isActive>
                  {page}
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onPageChange(Math.min(totalPages, page + 1));
                  }}
                  className={
                    page === totalPages
                      ? "pointer-events-none opacity-50"
                      : undefined
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
        </div>
      </div>

      {/* Full width, so chips wrap only when they genuinely run out of room. */}
      {filters && (
        <div className="flex flex-wrap items-center gap-2">{filters}</div>
      )}
    </div>
  );
}
