"use client";

/**
 * ⌘K / Ctrl+K — one search box over the whole back office.
 *
 * The panel searched per page: orders on the Orders page, people on Accounts,
 * tickets on the Inbox. An agent answering a call holds a phone number and had
 * to decide which section owned it before they could type it — which means
 * knowing how Lalaba stores things in order to ask Lalaba a question.
 *
 * It lives in the shell rather than the sidebar, deliberately. Search is not a
 * place you go; it is available from wherever you already are, which is the
 * only version that saves the trip.
 *
 * Everything it shows comes from ONE backend query that also decides what this
 * operator may search. `searchedTypes` is what lets an empty result say "orders
 * were not searched" rather than the much worse "no orders found" — see
 * lib/graphql/search.ts for why that is server-authored and permittedActions
 * is not.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import {
  ENTITY_LABELS,
  MATCHED_ON_LABELS,
  destinationFor,
  searchOperationalEntities,
  type SearchEntityType,
  type SearchResult,
} from "@/lib/graphql/search";

/** Below this the backend returns nothing, so don't ask. */
const MIN_QUERY = 3;

export function OmniboxTrigger() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Ctrl+K as well as ⌘K: the back office is not all Macs, and a shortcut
      // that only works on one platform is a shortcut half the team never
      // learns.
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      {/* A real button, not just a hint. The shortcut is for people who know
          it; everyone else needs something to click on their first day. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-8 w-full max-w-72 items-center gap-2 rounded-md border bg-background",
          "px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent",
        )}
      >
        <SearchIcon className="size-4 shrink-0" />
        <span className="truncate">Search anything…</span>
        <kbd className="ml-auto hidden shrink-0 rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline-block">
          ⌘K
        </kbd>
      </button>
      <Omnibox open={open} onOpenChange={setOpen} />
    </>
  );
}

function Omnibox({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // An agent types a phone number in one burst; querying per keystroke would
  // fire eleven searches to answer one question.
  const debounced = useDebouncedValue(query, 250);
  const enabled = open && debounced.trim().length >= MIN_QUERY;

  const { data, isFetching, isError } = useQuery({
    queryKey: ["operational-search", debounced.trim()],
    queryFn: () => searchOperationalEntities(debounced.trim()),
    enabled,
    // Keeps the previous list on screen while the next one loads, so the
    // palette does not flash empty between keystrokes.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const grouped = useMemo(() => {
    // Insertion order IS the backend's ranking: results arrive sorted, so the
    // first time a type appears is the position of its best result, and a Map
    // preserves that. Grouping therefore cannot reorder anything.
    //
    // An earlier version listed the groups in a fixed order here, which
    // silently overrode the backend — searching a customer's name showed
    // Orders above Customers no matter how the server ranked them, because
    // the constant said so.
    const byType = new Map<SearchEntityType, SearchResult[]>();
    for (const result of data?.results ?? []) {
      const list = byType.get(result.entityType) ?? [];
      list.push(result);
      byType.set(result.entityType, list);
    }
    return [...byType.entries()].map(([type, results]) => ({ type, results }));
  }, [data]);

  // Closing clears the box, so reopening is a fresh search rather than the
  // last one. Done in the event that closes it rather than in an effect
  // watching `open` — it is a thing that happens, not state to synchronise.
  const close = useCallback(() => {
    setQuery("");
    onOpenChange(false);
  }, [onOpenChange]);

  const go = useCallback(
    (result: SearchResult) => {
      close();
      router.push(destinationFor(result));
    },
    [close, router],
  );

  const tooShort = query.trim().length > 0 && query.trim().length < MIN_QUERY;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent
        className="top-1/4 max-w-2xl translate-y-0 overflow-hidden rounded-xl! p-0"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>
            Find an order, a person, a branch or a ticket.
          </DialogDescription>
        </DialogHeader>
        {/* Composed from Command directly rather than the CommandDialog
            helper, which renders no <Command> around its children and takes no
            shouldFilter. Both are needed here: the results are already ranked
            server-side. */}
        <Command shouldFilter={false}>
      {/* shouldFilter={false}: the backend already ranked these. Letting cmdk
          re-filter would drop a phone-number hit whose title is a name and
          contains none of the typed digits. */}
        {/* autoFocus is not decoration here. Opened from the keyboard, the
            dialog left focus on <body> — so ⌘K put a search box on screen
            that you then had to reach for the mouse to use, which is the
            entire shortcut defeated. Caught in the browser; no unit test
            would have seen it. */}
        <CommandInput
          autoFocus
          placeholder="Order number, phone, email, name or ID…"
          value={query}
          onValueChange={setQuery}
        />
      <CommandList>
        {tooShort ? (
          <CommandEmpty>Keep typing — at least {MIN_QUERY} characters.</CommandEmpty>
        ) : isError ? (
          <CommandEmpty>Search is unavailable right now.</CommandEmpty>
        ) : !enabled ? (
          <CommandEmpty>
            Search orders, people, branches and tickets at once.
          </CommandEmpty>
        ) : isFetching && !data ? (
          <CommandEmpty>Searching…</CommandEmpty>
        ) : grouped.length === 0 ? (
          <CommandEmpty>
            <span className="block">No matches for “{debounced.trim()}”.</span>
            {/* The distinction that stops an operator concluding something
                does not exist when it was simply never looked for. */}
            {data && data.searchedTypes.length === 0 && (
              <span className="mt-1 block text-xs">
                Your account cannot search any of these record types.
              </span>
            )}
          </CommandEmpty>
        ) : (
          grouped.map((group) => (
            <CommandGroup
              key={group.type}
              heading={ENTITY_LABELS[group.type]}
            >
              {group.results.map((result) => (
                <CommandItem
                  key={`${result.entityType}:${result.id}`}
                  // cmdk matches on value; the id keeps every row unique so
                  // two people with the same name stay two rows.
                  value={`${result.entityType}:${result.id}`}
                  onSelect={() => go(result)}
                  className="flex items-center gap-3"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{result.title}</span>
                    {result.subtitle && (
                      <span className="truncate text-xs text-muted-foreground">
                        {result.subtitle}
                      </span>
                    )}
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-1.5">
                    {result.context?.status && (
                      <span className="text-xs text-muted-foreground">
                        {result.context.status.replaceAll("_", " ").toLowerCase()}
                      </span>
                    )}
                    {/* Why this matched. An agent who pasted a phone number
                        needs to see that the top row matched the PHONE and not
                        a coincidence in a name. */}
                    <Badge variant="outline" className="text-[10px]">
                      {MATCHED_ON_LABELS[result.matchedOn]}
                    </Badge>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ))
        )}
        {data?.truncated && grouped.length > 0 && (
          // Never let a capped list read as a complete one.
          <div className="px-3 py-2 text-xs text-muted-foreground">
            Showing the closest matches only — narrow the search for more.
          </div>
        )}
        </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
