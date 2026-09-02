"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import {
  DataTableToolbar,
  PAGE_SIZE_OPTIONS,
} from "@/components/ui/data-table-toolbar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequireCapability } from "@/components/can";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ACTIONS_WITH_REASON,
  ADMIN_AUDIT_ACTION_LABELS,
  ADMIN_AUDIT_TARGET_LABELS,
  describeDetails,
  listAdminAuditLog,
  type AdminAuditAction,
  type AdminAuditEvent,
} from "@/lib/graphql/admin-audit";
import {
  KYC_AUDIT_EVENT_LABELS,
  KYC_PROVIDER_TYPE_LABELS,
  listKycAuditLog,
  type KycAuditEventType,
  type KycAuditEventView,
} from "@/lib/graphql/kyc";

export const AUDIT_QUERY_KEY = "kyc-audit-log";

type EventFilter = KycAuditEventType | "all";

// Decisions are what an auditor is usually looking for, so they carry the
// strongest variants; routine reads (evidence viewed) recede.
const EVENT_VARIANTS: Partial<
  Record<KycAuditEventType, "default" | "secondary" | "destructive" | "ghost">
> = {
  DOCUMENT_APPROVED: "default",
  PROVIDER_VERIFICATION_APPROVED: "default",
  DOCUMENT_REJECTED: "destructive",
  PROVIDER_VERIFICATION_REJECTED: "destructive",
  DOCUMENT_CLAIM_OVERRIDDEN: "destructive",
  DOCUMENT_CLAIMED_FOR_REVIEW: "secondary",
  DOCUMENT_URL_ISSUED: "ghost",
};

const EVENT_OPTIONS: KycAuditEventType[] = [
  "DOCUMENT_SUBMITTED",
  "DOCUMENT_CLAIMED_FOR_REVIEW",
  "DOCUMENT_APPROVED",
  "DOCUMENT_REJECTED",
  "DOCUMENT_SUPERSEDED",
  "DOCUMENT_CLAIM_OVERRIDDEN",
  "DOCUMENT_URL_ISSUED",
  "PROVIDER_VERIFICATION_APPROVED",
  "PROVIDER_VERIFICATION_REJECTED",
];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

/** Renders the JSON `details` blob as plain key/value text. */
function detailsText(details: string | null): string {
  if (!details) return "—";
  try {
    const parsed = JSON.parse(details) as Record<string, unknown>;
    const entries = Object.entries(parsed);
    if (!entries.length) return "—";
    return entries.map(([k, v]) => `${k}: ${String(v)}`).join(" · ");
  } catch {
    // A malformed payload is still evidence — show it raw rather than dropping
    // the row's only distinguishing content.
    return details;
  }
}

function columns(): ColumnDef<KycAuditEventView>[] {
  return [
    {
      id: "timestamp",
      header: "When",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm">
          {formatDateTime(row.original.timestamp)}
        </span>
      ),
    },
    {
      id: "event",
      header: "Event",
      cell: ({ row }) => (
        <Badge variant={EVENT_VARIANTS[row.original.event] ?? "outline"}>
          {KYC_AUDIT_EVENT_LABELS[row.original.event] ?? row.original.event}
        </Badge>
      ),
    },
    {
      id: "actor",
      header: "Actor",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.actorEmail ?? (
            <span className="font-mono text-xs text-muted-foreground">
              {row.original.actorUid}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "provider",
      header: "Provider",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm">
            {row.original.providerName ?? (
              <span className="text-muted-foreground italic">
                Deleted provider
              </span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {KYC_PROVIDER_TYPE_LABELS[row.original.providerType]}
          </span>
        </div>
      ),
    },
    {
      id: "details",
      header: "Details",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {detailsText(row.original.details)}
        </span>
      ),
    },
  ];
}

/**
 * Read-only view of the KYC audit trail. The underlying collection is
 * append-only — the backend exposes no write, update, or delete path for it,
 * and none may be added.
 */
// RequireCapability (see the guard export below) already restricts this page to
// admins, so the query has no `enabled` gate to duplicate that check.
function KycAuditTab() {
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [pageIndex, setPageIndex] = useState(0);

  const filter = useMemo(
    () => ({
      event: eventFilter === "all" ? undefined : eventFilter,
      limit: pageSize,
      offset: pageIndex * pageSize,
    }),
    [eventFilter, pageSize, pageIndex],
  );

  const { data, isPending } = useQuery({
    queryKey: [AUDIT_QUERY_KEY, filter],
    queryFn: () => listKycAuditLog(filter),
    placeholderData: keepPreviousData,
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Every verification action, newest first — submissions, claims,
        decisions, and each time a reviewer opened a partner&apos;s evidence.
      </p>

      <DataTableToolbar
        search=""
        onSearchChange={() => undefined}
        hideSearch
        filters={
          <Select
            value={eventFilter}
            onValueChange={(value) => {
              if (!value) return;
              setEventFilter(value as EventFilter);
              setPageIndex(0);
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {EVENT_OPTIONS.map((event) => (
                <SelectItem key={event} value={event}>
                  {KYC_AUDIT_EVENT_LABELS[event]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
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
        tableId="audit-verifications"
        columns={columns()}
        data={rows}
        isLoading={isPending}
        emptyMessage="No audit events match this filter."
      />
    </div>
  );
}

export default function AuditLogsPageGuard() {
  return (
    <RequireCapability capability="audit:read">
      <AuditLogsPage />
    </RequireCapability>
  );
}

/**
 * Two trails, two tabs — not one merged list.
 *
 * The KYC trail is document-level and much richer (per-file claims, evidence
 * URL issuance). Merging it into the platform trail would either flatten
 * detail the reviewers rely on, or drag KYC-only columns into every other
 * row. They answer different questions, so they get different tables.
 */
function AuditLogsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Audit Logs</h1>
        <p className="text-sm text-muted-foreground">
          Who did what, when. Append-only — entries can never be edited or
          removed, by anyone, including from here.
        </p>
      </div>

      <Tabs defaultValue="platform" className="flex flex-1 flex-col gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="platform">Platform actions</TabsTrigger>
          <TabsTrigger value="kyc">Verifications</TabsTrigger>
        </TabsList>
        <TabsContent value="platform">
          <PlatformAuditTab />
        </TabsContent>
        <TabsContent value="kyc">
          <KycAuditTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Platform trail ──────────────────────────────────────────────────────────

const ACTION_OPTIONS = Object.keys(
  ADMIN_AUDIT_ACTION_LABELS,
) as AdminAuditAction[];

function PlatformAuditTab() {
  const [action, setAction] = useState<AdminAuditAction | "all">("all");
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[1]);
  const [pageIndex, setPageIndex] = useState(0);

  const filter = useMemo(
    () => ({
      actions: action === "all" ? undefined : [action],
      limit: pageSize,
      offset: pageIndex * pageSize,
    }),
    [action, pageSize, pageIndex],
  );

  const { data, isPending, isError } = useQuery({
    queryKey: ["admin-audit-log", filter],
    queryFn: () => listAdminAuditLog(filter),
    placeholderData: keepPreviousData,
  });

  const rows = data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Suspensions, deactivations, cap changes, revocations and reinstatements
        — each with the reason the admin gave at the time.
      </p>

      <DataTableToolbar
        search=""
        onSearchChange={() => undefined}
        hideSearch
        filters={
          <Select
            items={{
              all: "All actions",
              ...Object.fromEntries(
                ACTION_OPTIONS.map((a) => [a, ADMIN_AUDIT_ACTION_LABELS[a]]),
              ),
            }}
            value={action}
            onValueChange={(value) => {
              setAction((value as AdminAuditAction | "all") ?? "all");
              setPageIndex(0);
            }}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {ACTION_OPTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {ADMIN_AUDIT_ACTION_LABELS[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
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
        tableId="audit-platform"
        columns={platformColumns}
        data={rows}
        isLoading={isPending}
        isError={isError}
        emptyMessage="No platform actions recorded yet."
        enableColumnVisibility
        csvFileName="lalaba-admin-audit"
      />
    </div>
  );
}

const platformColumns: ColumnDef<AdminAuditEvent>[] = [
  {
    id: "timestamp",
    header: "When",
    meta: { label: "When" },
    accessorFn: (row) => row.timestamp ?? "",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm">
        {row.original.timestamp
          ? new Date(row.original.timestamp).toLocaleString()
          : "—"}
      </span>
    ),
  },
  {
    id: "actor",
    header: "Who",
    meta: { label: "Who" },
    accessorFn: (row) => row.actorName,
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.actorName}</div>
        <div className="text-xs text-muted-foreground">
          {row.original.actorEmail} · {row.original.actorRole}
        </div>
      </div>
    ),
  },
  {
    id: "action",
    header: "Action",
    meta: { label: "Action" },
    accessorFn: (row) => ADMIN_AUDIT_ACTION_LABELS[row.action] ?? row.action,
    cell: ({ row }) => (
      <Badge variant="outline">
        {ADMIN_AUDIT_ACTION_LABELS[row.original.action] ?? row.original.action}
      </Badge>
    ),
  },
  {
    id: "target",
    header: "Target",
    meta: { label: "Target" },
    accessorFn: (row) => row.targetLabel ?? row.targetId,
    cell: ({ row }) => (
      <div>
        <div className="text-sm">
          {row.original.targetLabel ?? "—"}
        </div>
        <div className="text-xs text-muted-foreground">
          {ADMIN_AUDIT_TARGET_LABELS[row.original.targetType]} ·{" "}
          <span className="font-mono">{row.original.targetId}</span>
        </div>
      </div>
    ),
  },
  {
    id: "reason",
    header: "Reason",
    meta: { label: "Reason" },
    accessorFn: (row) => row.reasonCode ?? "",
    cell: ({ row }) => {
      const { reasonCode, note, action } = row.original;
      // An empty reason on an action that never carries one is "not
      // applicable", not "someone failed to give a reason". Saying so stops
      // a config change reading like an unexplained suspension.
      if (!reasonCode) {
        return (
          <span className="text-xs text-muted-foreground">
            {ACTIONS_WITH_REASON.has(action) ? "—" : "n/a"}
          </span>
        );
      }
      return (
        <div className="max-w-64">
          <Badge variant="secondary" className="font-mono text-[10px]">
            {reasonCode}
          </Badge>
          {note && (
            <p className="mt-1 text-xs text-muted-foreground">{note}</p>
          )}
        </div>
      );
    },
  },
  {
    id: "details",
    header: "Details",
    meta: { label: "Details" },
    accessorFn: (row) => describeDetails(row.detailsJson) ?? "",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {describeDetails(row.original.detailsJson) ?? "—"}
      </span>
    ),
  },
];
