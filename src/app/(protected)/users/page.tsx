"use client";

import { useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { LogOutIcon } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { AddUserDialog, type AddUserFormState } from "@/components/add-user-dialog";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { ACCOUNT_STATUS } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  DataTableToolbar,
  PAGE_SIZE_OPTIONS,
} from "@/components/ui/data-table-toolbar";
import { RequireCapability } from "@/components/can";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCan } from "@/components/can";
import { ApiError } from "@/lib/api-client";
import {
  createAdminUser,
  listAdminUsers,
  resendAdminInvite,
  revokeUserSessions,
} from "@/lib/graphql/admin-users";
import {
  ReasonCodeDialog,
  SESSION_REVOKE_REASONS,
} from "@/components/ui/reason-code-dialog";
import type { UserProfile } from "@/lib/types";

const EMPTY_FORM: AddUserFormState = {
  email: "",
  firstName: "",
  lastName: "",
  phoneNumber: "",
  role: "support",
};

/** Mirror the SelectItems below — without these the triggers read "all". */
const ROLE_FILTER_LABELS: Record<string, string> = {
  all: "All roles",
  admin: "Admin",
  support: "Support",
};
const STATUS_FILTER_LABELS: Record<string, string> = {
  all: "All statuses",
  active: "Active",
  deactivated: "Deactivated",
};

function columns(
  isAdmin: boolean,
  onRevokeSessions: (user: UserProfile) => void,
  onResendInvite: (uid: string) => void,
  resendingId: string | null,
): ColumnDef<UserProfile>[] {
  const base: ColumnDef<UserProfile>[] = [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => `${row.original.firstName} ${row.original.lastName}`,
    },
    {
      accessorKey: "email",
      header: "Email",
    },
    {
      id: "role",
      header: "Role",
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.role.roleName}</Badge>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) =>
        row.original.isActive ? (
          <StatusBadge status="ACTIVE" registry={ACCOUNT_STATUS} />
        ) : (
          <StatusBadge
            status="SUSPENDED"
            registry={ACCOUNT_STATUS}
            label="Deactivated"
          />
        ),
    },
    {
      id: "createdAt",
      header: "Created",
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
    },
  ];

  if (!isAdmin) return base;

  return [
    ...base,
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={resendingId === row.original._id}
            onClick={() => onResendInvite(row.original._id)}
          >
            {resendingId === row.original._id ? "Sending…" : "Resend invite"}
          </Button>
          {/* Only for accounts that can still sign in — ending the sessions
              of a deactivated account is a no-op the guard already covers. */}
          {row.original.isActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRevokeSessions(row.original)}
            >
              <LogOutIcon />
              Sign out
            </Button>
          )}
        </div>
      ),
    },
  ];
}

function UsersPage() {
  const { can } = useCan();
  const isAdmin = can("admin_user:manage");
  const queryClient = useQueryClient();

  // Already-debounced by the time DataTableToolbar calls onSearchChange —
  // it owns the raw input value + debounce internally.
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "support">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "deactivated">("all");
  const [revokeTarget, setRevokeTarget] = useState<UserProfile | null>(null);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [pageIndex, setPageIndex] = useState(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<AddUserFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const filter = useMemo(
    () => ({
      search: search.trim() || undefined,
      role: roleFilter === "all" ? undefined : roleFilter,
      isActive: statusFilter === "all" ? undefined : statusFilter === "active",
      limit: pageSize,
      offset: pageIndex * pageSize,
    }),
    [search, roleFilter, statusFilter, pageSize, pageIndex],
  );

  const { data, isPending } = useQuery({
    queryKey: ["adminUsers", filter],
    queryFn: () => listAdminUsers(filter),
    // Hold the current page while the next one loads, and treat only the very
    // first load as "loading" — isFetching is also true on every background
    // refetch, which blanked the table on each filter/page change.
    placeholderData: keepPreviousData,
  });
  const users = data?.data ?? [];
  const total = data?.total ?? 0;

  function handleRoleFilterChange(value: string | null) {
    if (!value) return;
    setRoleFilter(value as typeof roleFilter);
    setPageIndex(0);
  }

  function handleStatusFilterChange(value: string | null) {
    if (!value) return;
    setStatusFilter(value as typeof statusFilter);
    setPageIndex(0);
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const createMutation = useMutation({
    mutationFn: (input: AddUserFormState) => createAdminUser(input),
    onSuccess: (_, input) => {
      toast.success(`Invite sent to ${input.email}`);
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      void queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
    },
    onError: (err) => {
      setFormError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
      );
    },
  });

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    createMutation.mutate(form);
  }

  const resendMutation = useMutation({
    mutationFn: (uid: string) => resendAdminInvite(uid),
    onSuccess: () => toast.success("Invite email sent."),
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not resend invite.",
      ),
  });

  const revokeMutation = useMutation({
    mutationFn: ({
      uid,
      reason,
      note,
    }: {
      uid: string;
      reason: string;
      note: string | null;
    }) => revokeUserSessions(uid, reason, note),
    onSuccess: () => {
      toast.success("Signed out of every device.");
      setRevokeTarget(null);
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Could not end this account's sessions.",
      ),
  });

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">
            Admin and support accounts with access to this panel.
          </p>
        </div>
        {isAdmin && (
          <AddUserDialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) {
                setForm(EMPTY_FORM);
                setFormError(null);
              }
            }}
            form={form}
            onFormChange={setForm}
            onSubmit={handleCreate}
            submitting={createMutation.isPending}
            error={formError}
          />
        )}
      </div>

      <DataTableToolbar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPageIndex(0);
        }}
        searchPlaceholder="Search by name or email…"
        filters={
          <>
            <Select value={roleFilter} onValueChange={handleRoleFilterChange}>
              <SelectTrigger className="w-36">
                <SelectValue labels={ROLE_FILTER_LABELS} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="support">Support</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
              <SelectTrigger className="w-40">
                <SelectValue labels={STATUS_FILTER_LABELS} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="deactivated">Deactivated</SelectItem>
              </SelectContent>
            </Select>
          </>
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
        columns={columns(
          isAdmin,
          setRevokeTarget,
          (uid) => resendMutation.mutate(uid),
          resendMutation.isPending ? (resendMutation.variables ?? null) : null,
        )}
        data={users}
        isLoading={isPending}
        emptyMessage="No admin or support accounts match these filters."
      />

      {/* Ending a session is nearly always about a DEVICE, not the person, so
          the reasons are about devices — and it is deliberately separate from
          deactivating the account, which stops them working entirely. */}
      <ReasonCodeDialog
        open={revokeTarget != null}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title="Sign this account out everywhere?"
        description={
          revokeTarget
            ? `${revokeTarget.firstName} ${revokeTarget.lastName} will be signed out of every device immediately and will need to log in again. Their account stays active.`
            : undefined
        }
        reasons={SESSION_REVOKE_REASONS}
        confirmLabel="Sign out everywhere"
        pending={revokeMutation.isPending}
        onConfirm={(reason, note) =>
          revokeTarget &&
          revokeMutation.mutate({ uid: revokeTarget._id, reason, note })
        }
      />
    </div>
  );
}

export default function UsersPageGuard() {
  return (
    <RequireCapability capability="admin_user:manage">
      <UsersPage />
    </RequireCapability>
  );
}
