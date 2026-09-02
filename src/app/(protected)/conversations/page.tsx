"use client";

import { useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Can, RequireCapability } from "@/components/can";
import { ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  DataTableToolbar,
  PAGE_SIZE_OPTIONS,
} from "@/components/ui/data-table-toolbar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  adminSendMessage,
  listAdminConversationMessages,
  listAdminConversations,
  type ConversationRow,
} from "@/lib/graphql/conversations";

const QUERY_KEY = "admin-conversations";

/**
 * Oversight of existing chat threads (customer<->provider, customer<->
 * courier) — NOT a support-ticket system: there is no queue, no assignment.
 * Mostly read-only, with one exception: an admin or support agent can reply
 * into a thread as a third party (gated by the `chat:takeover` capability).
 * The reply renders with its own "Support" sender label, never folded into
 * customer/merchant/washer/courier.
 *
 * Reading the threads is `chat:read`, which is what the sidebar entry gates
 * on; the page gates on the same thing so the two cannot drift.
 */

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

const SENDER_LABELS: Record<string, string> = {
  customer: "Customer",
  merchant: "Merchant",
  washer: "Washer",
  courier: "Courier",
  support: "Lalaba Support",
};

function ThreadViewer({
  conversation,
  onClose,
}: {
  conversation: ConversationRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const { data, isPending } = useQuery({
    queryKey: ["admin-conversation-messages", conversation?._id],
    queryFn: () => listAdminConversationMessages(conversation!._id),
    enabled: !!conversation,
  });

  const sendMutation = useMutation({
    mutationFn: (text: string) =>
      adminSendMessage(conversation!._id, text),
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({
        queryKey: ["admin-conversation-messages", conversation?._id],
      });
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not send that message.",
      ),
  });

  return (
    <Sheet
      open={!!conversation}
      onOpenChange={(open) => {
        if (!open) {
          setDraft("");
          onClose();
        }
      }}
    >
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {conversation?.customerName} · {conversation?.providerName}
          </SheetTitle>
          <SheetDescription>
            {conversation?.kind === "courier" ? "Courier" : "Provider"}{" "}
            thread{conversation?.orderId ? ` for order ${conversation.orderId}` : ""}.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-4">
          {isPending && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {!isPending && (data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          )}
          {(data ?? []).map((m) => (
            <div
              key={m._id}
              className={
                m.senderRole === "support"
                  ? "flex flex-col gap-0.5 rounded-md border border-[var(--status-info)] bg-[var(--status-info-bg)] p-3"
                  : "flex flex-col gap-0.5 rounded-md border p-3"
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {SENDER_LABELS[m.senderRole] ?? m.senderRole}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(m.createdAt)}
                </span>
              </div>
              <p className="text-sm">{m.text}</p>
            </div>
          ))}
        </div>

        <Can capability="chat:takeover">
          {conversation && (
            <div className="mt-auto flex flex-col gap-2 border-t px-4 pt-4">
              <textarea
                className="min-h-16 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Reply as Lalaba Support — both the customer and provider will see this."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={sendMutation.isPending}
              />
              <Button
                size="sm"
                className="self-end"
                disabled={!draft.trim() || sendMutation.isPending}
                onClick={() => sendMutation.mutate(draft.trim())}
              >
                {sendMutation.isPending ? "Sending…" : "Send as Support"}
              </Button>
            </div>
          )}
        </Can>
      </SheetContent>
    </Sheet>
  );
}

function columns(onView: (row: ConversationRow) => void): ColumnDef<ConversationRow>[] {
  return [
    {
      id: "participants",
      header: "Participants",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.customerName}</div>
          <div className="text-sm text-muted-foreground">
            {row.original.providerName}
          </div>
        </div>
      ),
    },
    {
      id: "kind",
      header: "Kind",
      cell: ({ row }) => (
        <Badge variant="secondary">
          {row.original.kind === "courier" ? "Courier" : "Provider"}
        </Badge>
      ),
    },
    {
      id: "lastMessage",
      header: "Last message",
      cell: ({ row }) => (
        <div className="max-w-xs">
          <div className="truncate text-sm">
            {row.original.lastMessageText ?? "—"}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatDateTime(row.original.lastMessageAt)}
          </div>
        </div>
      ),
    },
    {
      id: "unread",
      header: "Unread",
      cell: ({ row }) => {
        const total = row.original.customerUnread + row.original.providerUnread;
        return total > 0 ? (
          <Badge>{total}</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => onView(row.original)}>
            View
          </Button>
        </div>
      ),
    },
  ];
}

export default function ConversationsPage() {
  return (
    <RequireCapability capability="chat:read">
      <ConversationsWorkspace />
    </RequireCapability>
  );
}

function ConversationsWorkspace() {
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [pageIndex, setPageIndex] = useState(0);
  const [viewing, setViewing] = useState<ConversationRow | null>(null);

  const filter = useMemo(
    () => ({
      search: search.trim() || undefined,
      limit: pageSize,
      offset: pageIndex * pageSize,
    }),
    [search, pageSize, pageIndex],
  );

  const { data, isPending, isError } = useQuery({
    queryKey: [QUERY_KEY, filter],
    queryFn: () => listAdminConversations(filter),
    placeholderData: keepPreviousData,
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Conversations</h1>
        <p className="text-sm text-muted-foreground">
          Oversight of customer chats with providers and couriers. There is no
          queue or assignment — open a thread to read it, or reply in as Lalaba
          Support.
        </p>
      </div>

      <DataTableToolbar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPageIndex(0);
        }}
        searchPlaceholder="Search by customer or provider name…"
        limit={pageSize}
        onLimitChange={(limit) => {
          setPageSize(limit);
          setPageIndex(0);
        }}
        page={pageIndex + 1}
        totalPages={pageCount}
        onPageChange={(page) => setPageIndex(page - 1)}
      />

      <DataTable
        columns={columns(setViewing)}
        data={rows}
        isLoading={isPending}
        isError={isError}
        errorMessage="Failed to load conversations. Please try again."
        emptyMessage="No conversations match this search."
      />

      <ThreadViewer conversation={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
