"use client";

// The account directory — every person on the platform, whatever their role.
//
// Distinct from /users, which manages BACK-OFFICE accounts (inviting an admin,
// resending an invite). This is the lookup surface: "who is this person, what
// have they done, and is anything odd about them". Admin accounts appear here
// too, as people rather than as things to administer.
//
// Read-only. Deactivate and force-logout live on the pages that own those
// decisions and already carry reason codes; duplicating them here would mean
// two sets of rules to keep in sync.

import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { UsersIcon } from "lucide-react";

import { RequireCapability } from "@/components/can";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  DataTableToolbar,
  PAGE_SIZE_OPTIONS,
} from "@/components/ui/data-table-toolbar";
import { StatusBadge, ToneBadge } from "@/components/ui/status-badge";
import { StatusFilterChips } from "@/components/ui/status-filter-chips";
import {
  DIRECTORY_ROLES,
  listDirectoryUsers,
  ROLE_LABELS,
  type DirectoryUser,
} from "@/lib/graphql/directory";
import { ACCOUNT_STATUS } from "@/lib/status";
import { AccountDetailDrawer } from "@/components/directory/account-detail-drawer";
import { useDeepLinkedId } from "@/hooks/use-deep-linked-id";

export default function AccountsPage() {
  return (
    <RequireCapability capability="account:read">
      <AccountsDirectory />
    </RequireCapability>
  );
}

function AccountsDirectory() {
  const [search, setSearch] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [activeOnly, setActiveOnly] = useState(false);
  const [sharedPhoneOnly, setSharedPhoneOnly] = useState(false);
  const [limit, setLimit] = useState<number>(PAGE_SIZE_OPTIONS[1]);
  const [page, setPage] = useState(1);
  // In the URL, so the omnibox can land directly on a person and a refresh
  // or a pasted link still opens them.
  const [openUid, setOpenUid] = useDeepLinkedId("uid");

  const filter = useMemo(
    () => ({
      search: search.trim() || undefined,
      roleIds: roleIds.length ? roleIds : undefined,
      // Tri-state on purpose: unset means "every account", which is what a
      // lookup surface should default to. A directory that hides deactivated
      // accounts by default is one where the person you are looking for is
      // missing exactly when it matters.
      isActive: activeOnly ? true : undefined,
      sharedPhoneOnly: sharedPhoneOnly || undefined,
      limit,
      offset: (page - 1) * limit,
    }),
    [search, roleIds, activeOnly, sharedPhoneOnly, limit, page],
  );

  const { data, isPending, isError, dataUpdatedAt } = useQuery({
    queryKey: ["directory-users", filter],
    queryFn: () => listDirectoryUsers(filter),
    placeholderData: keepPreviousData,
  });

  const rows = data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Accounts</h1>
        <p className="text-sm text-muted-foreground">
          Everyone on the platform — customers, washers, merchants, staff and
          couriers. Search by name, email, phone number, or account id.
        </p>
      </div>

      <DataTableToolbar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Name, email, phone, or account id…"
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <StatusFilterChips
              chips={DIRECTORY_ROLES.map((r) => ({
                value: r.id,
                label: r.label,
              }))}
              selected={roleIds}
              onChange={(next) => {
                setRoleIds(next);
                setPage(1);
              }}
            />
            <Button
              size="sm"
              variant={activeOnly ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              aria-pressed={activeOnly}
              onClick={() => {
                setActiveOnly((on) => !on);
                setPage(1);
              }}
            >
              Active only
            </Button>
            <Button
              size="sm"
              variant={sharedPhoneOnly ? "destructive" : "outline"}
              className="h-7 gap-1 px-2 text-xs"
              aria-pressed={sharedPhoneOnly}
              onClick={() => {
                setSharedPhoneOnly((on) => !on);
                setPage(1);
              }}
            >
              <UsersIcon className="size-3" />
              Shared phone
            </Button>
          </div>
        }
        limit={limit}
        onLimitChange={(next) => {
          setLimit(next);
          setPage(1);
        }}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />

      {sharedPhoneOnly && (
        // Said plainly, because a filter that quietly narrows only the page in
        // front of you is worse than no filter at all.
        <p className="text-xs text-muted-foreground">
          Shared-phone filtering is applied to the current page, so the total
          above counts every match before it. Narrow by role or search to make
          it exact.
        </p>
      )}

      <DataTable
        tableId="accounts"
        dataUpdatedAt={dataUpdatedAt}
        columns={columns}
        data={rows}
        isLoading={isPending}
        isError={isError}
        emptyMessage={
          search.trim() || roleIds.length
            ? "No accounts match these filters."
            : "No accounts yet."
        }
        onRowClick={(row) => setOpenUid(row.uid)}
        enableColumnVisibility
        csvFileName="lalaba-accounts"
      />

      <AccountDetailDrawer uid={openUid} onClose={() => setOpenUid(null)} />
    </div>
  );
}

const columns: ColumnDef<DirectoryUser>[] = [
  {
    id: "person",
    header: "Person",
    meta: { label: "Person" },
    accessorFn: (row) => row.displayName,
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.displayName}</div>
        <div className="text-xs text-muted-foreground">
          {row.original.email ?? row.original.phoneNumber ?? "—"}
        </div>
      </div>
    ),
  },
  {
    id: "role",
    header: "Role",
    meta: { label: "Role" },
    accessorFn: (row) => row.roleId,
    cell: ({ row }) => (
      <Badge variant="outline">
        {ROLE_LABELS[row.original.roleId] ?? row.original.roleName}
      </Badge>
    ),
  },
  {
    id: "status",
    header: "Status",
    meta: { label: "Status" },
    accessorFn: (row) => (row.isActive ? "ACTIVE" : "SUSPENDED"),
    cell: ({ row }) => {
      const u = row.original;
      return (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge
            status={u.isActive ? "ACTIVE" : "SUSPENDED"}
            registry={ACCOUNT_STATUS}
            label={u.isActive ? "Active" : "Deactivated"}
          />
          {/* Role-specific states that a bare active/inactive flag hides —
              a washer can be live as an account and suspended as a provider. */}
          {u.washerStatus === "SUSPENDED" && (
            <ToneBadge tone="danger">Provider suspended</ToneBadge>
          )}
          {u.selfieStatus === "REVOKED" && (
            <ToneBadge tone="danger">Photo revoked</ToneBadge>
          )}
          {u.accountStatus === "DELETION_PENDING" && (
            <ToneBadge tone="pending">Deletion pending</ToneBadge>
          )}
        </div>
      );
    },
  },
  {
    id: "phone",
    header: "Phone",
    meta: { label: "Phone" },
    accessorFn: (row) => row.phoneNumber ?? "",
    cell: ({ row }) => (
      <div className="flex flex-col items-start gap-1">
        <span className="text-sm tabular-nums">
          {row.original.phoneNumber ?? "—"}
        </span>
        {row.original.sharedPhoneCount > 0 && (
          <ToneBadge tone="pending">
            +{row.original.sharedPhoneCount} account
            {row.original.sharedPhoneCount === 1 ? "" : "s"}
          </ToneBadge>
        )}
      </div>
    ),
  },
  {
    id: "joined",
    header: "Joined",
    meta: { label: "Joined" },
    accessorFn: (row) => row.createdAt ?? "",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm">
        {row.original.createdAt
          ? new Date(row.original.createdAt).toLocaleDateString("en-PH", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : "—"}
      </span>
    ),
  },
];
