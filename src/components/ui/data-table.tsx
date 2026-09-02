"use client"

import * as React from "react"

import { usePersistedPreference } from "@/hooks/use-persisted-preference"
import {
  type ColumnDef,
  type RowData,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  DownloadIcon,
  Rows2Icon,
  Rows3Icon,
  SlidersHorizontalIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- both params are required by the interface being augmented
  interface ColumnMeta<TData extends RowData, TValue> {
    /**
     * Human label for the column, used by the CSV export and the column
     * visibility menu. Needed because a column whose `header` is a render
     * function (any sortable column) has no string to fall back to, and those
     * two surfaces would otherwise show the raw column id.
     */
    label?: string
  }
}

/** The label to show for a column outside the table header itself. */
function columnLabel<TData, TValue>(
  column: import("@tanstack/react-table").Column<TData, TValue>,
): string {
  return (
    column.columnDef.meta?.label ??
    (typeof column.columnDef.header === "string"
      ? column.columnDef.header
      : column.id)
  )
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  isLoading?: boolean
  isError?: boolean
  errorMessage?: string
  emptyMessage?: string
  /**
   * Client-side sorting on the rows currently loaded. Off by default because
   * most lists here are server-paginated — sorting one page of 25 and calling
   * it "sorted" is a lie, so a page opts in only when it holds the whole set.
   */
  enableSorting?: boolean
  /** Show the column visibility menu. Columns opt out via `enableHiding: false`. */
  enableColumnVisibility?: boolean
  /**
   * Filename (without extension) for the CSV export button. Omitted = no
   * button. Exports the rows currently in `data` — i.e. the current page and
   * the current filters, which is what the admin can see and therefore what
   * they expect to get.
   */
  csvFileName?: string
  /** Row click handler — the drawer-open gesture on list pages. */
  onRowClick?: (row: TData) => void
  /**
   * Keeps the header visible while the body scrolls. Requires a bounded
   * height on the wrapper, which `maxHeight` supplies.
   */
  stickyHeader?: boolean
  /** e.g. "60vh". Only meaningful together with `stickyHeader`. */
  maxHeight?: string
  /**
   * Stable id for this table's remembered column choices.
   *
   * Omitted = the choices reset on every visit, which is the right default for
   * a table nobody customises. Give one to any table an operator lives in.
   */
  tableId?: string
  /**
   * When the data on screen was fetched. React Query's `dataUpdatedAt`.
   *
   * Rendered as "as of HH:MM" beside the utility bar. A table that cannot say
   * how old it is invites an argument on a call about whether the number is
   * current — the same reason the reconciliation report states when it ran.
   */
  dataUpdatedAt?: number
}

/**
 * Header cell with a sort toggle. Use as a column's `header` when the table
 * has `enableSorting` — a plain string header stays unsortable, which is the
 * right default for columns where sorting is meaningless (actions, photos).
 */
export function SortableHeader<TData, TValue>({
  column,
  children,
}: {
  column: import("@tanstack/react-table").Column<TData, TValue>
  children: React.ReactNode
}) {
  const sorted = column.getIsSorted()
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-7 px-2 data-[sorted=true]:text-foreground"
      data-sorted={sorted !== false}
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {children}
      {sorted === "asc" ? (
        <ArrowUpIcon />
      ) : sorted === "desc" ? (
        <ArrowDownIcon />
      ) : (
        <ArrowUpDownIcon className="opacity-50" />
      )}
    </Button>
  )
}

function csvCell(value: unknown): string {
  if (value == null) return ""
  const text = String(value)
  // Excel treats a leading =, +, - or @ as a formula. An order note reading
  // "=cmd|..." is a real injection vector once someone opens the export.
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${guarded.replaceAll('"', '""')}"`
}

/**
 * Serialize the visible columns of the loaded rows to CSV.
 *
 * Uses each column's raw accessor value, not its rendered cell — a cell is
 * JSX (badges, buttons, avatars) and stringifies to nothing useful. Columns
 * that are display-only (no accessor) are skipped, which correctly drops the
 * actions column.
 */
function exportCsv<TData>(
  table: import("@tanstack/react-table").Table<TData>,
  fileName: string,
) {
  const columns = table
    .getVisibleLeafColumns()
    .filter((column) => column.accessorFn != null)

  const header = columns.map((column) => csvCell(columnLabel(column)))

  const rows = table
    .getRowModel()
    .rows.map((row) => columns.map((column) => csvCell(row.getValue(column.id))))

  const csv = [header, ...rows].map((cells) => cells.join(",")).join("\r\n")
  // BOM so Excel opens UTF-8 (Filipino names and ₱ signs) correctly.
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${fileName}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

type Density = "comfortable" | "compact"

/**
 * Row padding, remembered per OPERATOR rather than per table.
 *
 * Someone triaging a queue wants forty rows on screen; someone reviewing one
 * record wants room to read. That is a property of the person, not of the
 * page, so switching it once applies everywhere.
 */
/**
 * Controls inside a row that own their own keys and clicks.
 *
 * The actions column sits in the same row as the row itself, so both the
 * click handler and the key handler have to step aside for it — otherwise
 * Enter on "Claim" opens the ticket instead of claiming it, and typing `j`
 * in a cell input jumps focus to another row. One selector for both, so
 * they cannot drift apart.
 */
const INTERACTIVE_IN_ROW =
  "button, a, input, textarea, select, [role='menuitem'], [contenteditable='true']"

const DENSITY_KEY = "lalaba.table.density"

const DENSITY_CLASS: Record<Density, string> = {
  comfortable: "",
  // Applies to every cell in the table via a descendant selector, so it needs
  // no change at each of the ~25 call sites.
  compact: "[&_td]:py-1 [&_th]:py-1 [&_td]:text-[13px]",
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading,
  isError,
  errorMessage = "Something went wrong loading this data.",
  emptyMessage = "No results.",
  enableSorting = false,
  enableColumnVisibility = false,
  csvFileName,
  onRowClick,
  stickyHeader = false,
  maxHeight,
  tableId,
  dataUpdatedAt,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [density, setDensity] = usePersistedPreference<Density>(
    DENSITY_KEY,
    "comfortable",
  )
  // Persisted only when the table names itself. An unnamed table keeps its
  // choices in memory exactly as before.
  const [storedVisibility, setStoredVisibility] =
    usePersistedPreference<VisibilityState>(
      tableId ? `lalaba.table.columns.${tableId}` : "lalaba.table.columns.__none",
      {},
    )
  const [localVisibility, setLocalVisibility] =
    React.useState<VisibilityState>({})

  const columnVisibility = tableId ? storedVisibility : localVisibility
  const setColumnVisibility = tableId ? setStoredVisibility : setLocalVisibility

  const stickyActions = (columnId: string) =>
    columnId === "actions"
      ? "sticky right-0 z-20 bg-background shadow-[inset_1px_0_0_0_var(--border)]"
      : undefined

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: (updater) =>
      setColumnVisibility(
        typeof updater === "function" ? updater(columnVisibility) : updater,
      ),
    getCoreRowModel: getCoreRowModel(),
    ...(enableSorting ? { getSortedRowModel: getSortedRowModel() } : {}),
  })

  // These tables are wider than a phone viewport, so the row actions
  // (View / Claim / Approve / Reject) sit far off the right edge and can only be
  // reached by first scrolling the table sideways — easy to miss entirely.
  // Pinning the actions column keeps them on screen at any width; on a desktop
  // the table already fits, so the sticky offset is a no-op there.

  const hasUtilityBar =
    enableColumnVisibility || csvFileName != null || dataUpdatedAt != null
  const rows = table.getRowModel().rows
  const hasRows = rows.length > 0

  // ── Keyboard navigation ───────────────────────────────────────────────────
  //
  // Only when there is something to activate. A read-only table with no
  // onRowClick gains focusable rows that do nothing, which is worse for a
  // screen-reader user than leaving the rows alone.
  //
  // j/k as well as the arrows: an operator who lives in a queue all day
  // reaches for them, and they cost nothing to support. Arrow keys stay
  // because they are what everyone else expects.
  const keyboardEnabled = onRowClick != null && hasRows
  const [focusedIndex, setFocusedIndex] = React.useState<number | null>(null)
  const bodyRef = React.useRef<HTMLTableSectionElement>(null)

  // A filter that shortens the list must not leave focus pointing past its
  // end. Clamping here rather than in an effect keeps it a render-time fact.
  const activeIndex =
    focusedIndex === null ? null : Math.min(focusedIndex, rows.length - 1)

  // Moving focus is DOM work, not state to synchronise — the effect drives an
  // external system, which is exactly what effects are for. Keyed on
  // activeIndex (not focusedIndex) so a filter that clamps the row out from
  // under the operator moves real DOM focus along with it, instead of
  // silently dropping it to the document when the previously-focused row
  // unmounts.
  React.useEffect(() => {
    if (activeIndex === null) return
    const row = bodyRef.current?.querySelector<HTMLElement>(
      `[data-row-index="${activeIndex}"]`,
    )
    row?.focus()
  }, [activeIndex])

  const onKeyDown = (event: React.KeyboardEvent<HTMLTableSectionElement>) => {
    if (!keyboardEnabled) return
    // The handler lives on the tbody, so every key pressed anywhere in the
    // table bubbles to it — including keys meant for a control inside a row.
    // Those own their keys entirely: Enter presses the button, `j` types a j.
    if ((event.target as HTMLElement).closest(INTERACTIVE_IN_ROW)) return
    const key = event.key
    const move = (next: number) => {
      event.preventDefault()
      setFocusedIndex(Math.max(0, Math.min(next, rows.length - 1)))
    }

    if (key === "ArrowDown" || key === "j") {
      move(activeIndex === null ? 0 : activeIndex + 1)
    } else if (key === "ArrowUp" || key === "k") {
      move(activeIndex === null ? 0 : activeIndex - 1)
    } else if (key === "Home") {
      move(0)
    } else if (key === "End") {
      move(rows.length - 1)
    } else if (key === "Enter" && activeIndex !== null) {
      event.preventDefault()
      onRowClick?.(rows[activeIndex].original)
    } else if (key === "Escape") {
      // Leaves the table without opening anything, and hands focus back to
      // the page rather than trapping it in a grid.
      //
      // Blurs the focused ROW, not the tbody. `currentTarget` is the element
      // the handler is attached to, and blurring an element that never had
      // focus does nothing at all — the first version did exactly that, and
      // Escape appeared to work while leaving focus exactly where it was.
      event.preventDefault()
      setFocusedIndex(null)
      const active = document.activeElement
      if (active instanceof HTMLElement) active.blur()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {hasUtilityBar && (
        <div className="flex items-center justify-end gap-2">
          {/* Provenance. A table that cannot say how old it is invites an
              argument on a call about whether the number is current. */}
          {dataUpdatedAt != null && dataUpdatedAt > 0 && (
            <span className="mr-auto text-xs text-muted-foreground">
              As of{" "}
              {new Date(dataUpdatedAt).toLocaleTimeString("en-PH", {
                timeStyle: "short",
              })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            aria-pressed={density === "compact"}
            onClick={() =>
              setDensity(density === "compact" ? "comfortable" : "compact")
            }
          >
            {density === "compact" ? <Rows3Icon /> : <Rows2Icon />}
            <span className="sr-only sm:not-sr-only">
              {density === "compact" ? "Comfortable" : "Compact"}
            </span>
          </Button>
          {enableColumnVisibility && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                <SlidersHorizontalIcon />
                Columns
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {table
                  .getAllLeafColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={column.getIsVisible()}
                      onCheckedChange={(checked) =>
                        column.toggleVisibility(!!checked)
                      }
                    >
                      {columnLabel(column)}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {csvFileName != null && (
            <Button
              variant="outline"
              size="sm"
              disabled={!hasRows}
              onClick={() => exportCsv(table, csvFileName)}
            >
              <DownloadIcon />
              Export CSV
            </Button>
          )}
        </div>
      )}

      <div
        className={cn(
          "rounded-lg border",
          stickyHeader ? "overflow-auto" : "overflow-hidden",
          DENSITY_CLASS[density],
        )}
        style={stickyHeader && maxHeight ? { maxHeight } : undefined}
      >
        <Table>
          <TableHeader
            className={
              stickyHeader
                ? "sticky top-0 z-30 bg-background shadow-[inset_0_-1px_0_0_var(--border)]"
                : undefined
            }
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className={stickyActions(header.column.id)}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody ref={bodyRef} onKeyDown={onKeyDown}>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-destructive"
                >
                  {errorMessage}
                </TableCell>
              </TableRow>
            ) : hasRows ? (
              rows.map((row, index) => (
                <TableRow
                  key={row.id}
                  data-row-index={index}
                  // Roving tabindex: one stop for the whole table, so Tab
                  // moves past it rather than through every row.
                  tabIndex={
                    keyboardEnabled
                      ? (activeIndex ?? 0) === index
                        ? 0
                        : -1
                      : undefined
                  }
                  onFocus={
                    keyboardEnabled ? () => setFocusedIndex(index) : undefined
                  }
                  className={cn(
                    onRowClick && "cursor-pointer",
                    keyboardEnabled &&
                      "focus-visible:outline-none focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  )}
                  onClick={
                    onRowClick
                      ? (event) => {
                          // Don't hijack a click that landed on a button or
                          // link inside the row — the actions column sits in
                          // the same row and its clicks mean something else.
                          if (
                            (event.target as HTMLElement).closest(
                              INTERACTIVE_IN_ROW,
                            )
                          ) {
                            return
                          }
                          onRowClick(row.original)
                        }
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={stickyActions(cell.column.id)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
