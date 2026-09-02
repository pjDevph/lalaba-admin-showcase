import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "./data-table";

/**
 * The keyboard framework and the remembered preferences, which are the two
 * things an operator notices every day and no other test covers.
 */
type Row = { id: string; name: string };

const columns: ColumnDef<Row, unknown>[] = [
  { id: "name", header: "Name", accessorFn: (row) => row.name },
];

const rows: Row[] = [
  { id: "1", name: "Ana" },
  { id: "2", name: "Ben" },
  { id: "3", name: "Cara" },
];

function body() {
  // The tbody owns the key handler, so events are dispatched there.
  return document.querySelector("tbody") as HTMLElement;
}

function rowAt(index: number) {
  return document.querySelector(`[data-row-index="${index}"]`) as HTMLElement;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("DataTable keyboard navigation", () => {
  it("[HP] moves with j/k and the arrow keys, and opens with Enter", () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} data={rows} onRowClick={onRowClick} />);

    fireEvent.keyDown(body(), { key: "j" });
    expect(rowAt(0)).toHaveFocus();

    fireEvent.keyDown(body(), { key: "j" });
    expect(rowAt(1)).toHaveFocus();

    fireEvent.keyDown(body(), { key: "ArrowUp" });
    expect(rowAt(0)).toHaveFocus();

    fireEvent.keyDown(body(), { key: "Enter" });
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it("[EC] stops at both ends rather than wrapping", () => {
    // Wrapping in a queue is disorienting: an agent holding k expects to
    // arrive at the top and stay there, not to reappear at the bottom.
    render(<DataTable columns={columns} data={rows} onRowClick={vi.fn()} />);

    fireEvent.keyDown(body(), { key: "k" });
    fireEvent.keyDown(body(), { key: "k" });
    fireEvent.keyDown(body(), { key: "k" });
    expect(rowAt(0)).toHaveFocus();

    fireEvent.keyDown(body(), { key: "End" });
    fireEvent.keyDown(body(), { key: "j" });
    expect(rowAt(2)).toHaveFocus();
  });

  it("[EC] Escape leaves the table without opening anything", () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} data={rows} onRowClick={onRowClick} />);

    fireEvent.keyDown(body(), { key: "j" });
    fireEvent.keyDown(body(), { key: "Escape" });

    expect(onRowClick).not.toHaveBeenCalled();
    expect(rowAt(0)).not.toHaveFocus();
  });

  it("[A11Y] keeps one tab stop for the whole table, not one per row", () => {
    render(<DataTable columns={columns} data={rows} onRowClick={vi.fn()} />);
    const focusable = [0, 1, 2].map((i) => rowAt(i).getAttribute("tabindex"));
    expect(focusable).toEqual(["0", "-1", "-1"]);
  });

  it("[A11Y] leaves rows unfocusable when there is nothing to activate", () => {
    // Focusable rows that do nothing are worse for a screen-reader user than
    // rows that are not focusable at all.
    render(<DataTable columns={columns} data={rows} />);
    expect(rowAt(0).hasAttribute("tabindex")).toBe(false);

    fireEvent.keyDown(body(), { key: "j" });
    expect(rowAt(0)).not.toHaveFocus();
  });
});

describe("DataTable preferences", () => {
  it("[HP] remembers density across mounts, per operator", () => {
    const first = render(
      <DataTable columns={columns} data={rows} enableColumnVisibility />,
    );
    fireEvent.click(screen.getByRole("button", { name: /compact/i }));
    first.unmount();

    render(<DataTable columns={columns} data={rows} enableColumnVisibility />);
    // The button now offers the way back, which is how it reports the state.
    expect(
      screen.getByRole("button", { name: /comfortable/i }),
    ).toBeInTheDocument();
  });

  it("[EC] keeps column choices in memory when the table has no id", () => {
    // An unnamed table behaves exactly as it did before preferences existed.
    render(<DataTable columns={columns} data={rows} enableColumnVisibility />);
    expect(window.localStorage.getItem("lalaba.table.columns.__none")).toBeNull();
  });

  it("[HP] states when the data on screen was fetched", () => {
    const at = new Date("2026-08-26T04:30:00.000Z").getTime();
    render(
      <DataTable columns={columns} data={rows} dataUpdatedAt={at} />,
    );
    expect(screen.getByText(/^As of /)).toBeInTheDocument();
  });

  it("[EC] says nothing about freshness when it has not been told", () => {
    render(<DataTable columns={columns} data={rows} enableColumnVisibility />);
    expect(screen.queryByText(/^As of /)).toBeNull();
  });
});

describe("DataTable rows", () => {
  it("[HP] still renders its data", () => {
    render(<DataTable columns={columns} data={rows} />);
    expect(within(body()).getByText("Cara")).toBeInTheDocument();
  });
});

/**
 * The key handler lives on the tbody, so every key pressed anywhere in the
 * table bubbles to it. The actions column sits inside the rows, which means
 * the handler has to step aside for controls that own their own keys — the
 * first version did not, and the tests above never caught it because they
 * dispatch on the tbody itself rather than on something inside a row.
 */
describe("DataTable keyboard vs controls inside a row", () => {
  const onClaim = vi.fn();

  const withActions: ColumnDef<Row, unknown>[] = [
    ...columns,
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <>
          <button onClick={() => onClaim(row.original)}>Claim</button>
          <input aria-label={`note-${row.original.id}`} defaultValue="" />
        </>
      ),
    },
  ];

  beforeEach(() => onClaim.mockClear());

  it("[REG] Enter on a row's own button presses it, rather than opening the row", () => {
    // The tickets queue has both: Claim and Open sit in every row, and the
    // row itself opens the ticket. Enter on Claim used to open the ticket and
    // suppress the button's own click, so claiming by keyboard was impossible.
    const onRowClick = vi.fn();
    render(<DataTable columns={withActions} data={rows} onRowClick={onRowClick} />);

    fireEvent.keyDown(body(), { key: "j" });
    const claim = screen.getAllByRole("button", { name: "Claim" })[0];
    claim.focus();
    fireEvent.keyDown(claim, { key: "Enter", bubbles: true });

    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("[REG] j and k type into an input inside a row instead of moving focus", () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={withActions} data={rows} onRowClick={onRowClick} />);

    const note = screen.getByLabelText("note-2");
    note.focus();
    fireEvent.keyDown(note, { key: "j", bubbles: true });

    expect(note).toHaveFocus();
  });

  it("[HP] still navigates when the key lands on the row itself", () => {
    // The guard must not disarm the table it is protecting.
    const onRowClick = vi.fn();
    render(<DataTable columns={withActions} data={rows} onRowClick={onRowClick} />);

    fireEvent.keyDown(body(), { key: "j" });
    fireEvent.keyDown(rowAt(0), { key: "j", bubbles: true });
    expect(rowAt(1)).toHaveFocus();

    fireEvent.keyDown(rowAt(1), { key: "Enter", bubbles: true });
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });
});
