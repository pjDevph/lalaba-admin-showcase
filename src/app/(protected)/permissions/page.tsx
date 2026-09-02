"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  SYSTEM_ROLE_IDS,
  createPermission,
  createRole,
  deletePermission,
  deleteRole,
  listAdminPermissions,
  listRoles,
  updatePermission,
  updateRole,
  type Permission,
  type Role,
} from "@/lib/graphql/permissions";
import { RequireCapability } from "@/components/can";

// The four owner-facing groups, mirroring
// LALABA_BE_DEV/src/permissions/permission-groups.ts — which is the authority,
// and whose spec asserts these four partition the catalogue exactly.
//
// This page used to infer groups from the permissionName prefix and had drifted
// into a sixth grouping of its own: it split "Reports & Logs" where the merchant
// app split "Reports" and "Logs", and it listed Products separately from
// Inventory where an owner is only ever asked one question about stock. Naming
// the groups outright means a merchant reading this page and a merchant reading
// the app see the same four buckets.
//
// Membership is still derived from the name prefix rather than fetched: the
// backend catalogue has no category column, and adding one to serve a read-only
// admin view is not worth a migration. The prefixes are stable and the backend
// spec fails CI if a new permission is left ungrouped.
const GROUP_ORDER = ["Orders", "Inventory", "Services", "Others"] as const;

const GROUP_DESCRIPTIONS: Record<(typeof GROUP_ORDER)[number], string> = {
  Orders:
    "Counter work: taking orders, moving them through, confirming pickup, discounts and cancellations.",
  Inventory: "Supplies and the retail products a branch sells.",
  Services: "The service catalogue and its pricing.",
  Others: "Reports, activity logs and costing.",
};

function groupFor(permissionName: string): (typeof GROUP_ORDER)[number] {
  const prefix = permissionName.split("_")[0];
  switch (prefix) {
    case "order":
      return "Orders";
    case "inventory":
    case "product":
      return "Inventory";
    case "service":
      return "Services";
    default:
      // report, log, costing — and anything new, which surfaces here rather
      // than in a silent "Other" bucket nobody reads.
      return "Others";
  }
}

// ── Permissions ─────────────────────────────────────────────────────────────

function PermissionsTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Permission | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Permission | null>(null);

  // The catalogue is static enough that a background refetch should never
  // flash the page back to "Loading…" — only the first load has no data yet.
  const { data, isPending, isError } = useQuery({
    queryKey: ["adminPermissions"],
    queryFn: listAdminPermissions,
  });
  const permissions = data ?? [];

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["adminPermissions"] });
  }

  const removeMutation = useMutation({
    mutationFn: (permission: Permission) => deletePermission(permission._id),
    onSuccess: () => {
      toast.success("Permission deleted.");
      setRemoving(null);
      invalidate();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not delete it.",
      ),
  });

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: permissions.filter((p) => groupFor(p.permissionName) === group),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          The full catalogue of permissions staff can be granted in the merchant
          app, grouped as owners see them. Granting is per staff member, per
          branch, from within the merchant app itself — this page defines what
          there is to grant.
        </p>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon />
          Add permission
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">
          Failed to load permissions. Please try again.
        </p>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">No permissions found.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {grouped.map(({ group, items }) => (
            <Card key={group}>
              <CardHeader>
                <CardTitle>{group}</CardTitle>
                <CardDescription>
                  {GROUP_DESCRIPTIONS[group]}
                  <span className="mt-1 block text-xs">
                    Grants {items.length} permission
                    {items.length === 1 ? "" : "s"}.
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {items.map((p) => (
                  <div
                    key={p._id}
                    className="flex items-start justify-between gap-2"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <code className="text-xs font-medium text-foreground">
                        {p.permissionName}
                      </code>
                      <span className="text-sm text-muted-foreground">
                        {p.description}
                      </span>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-7 p-0"
                        onClick={() => setEditing(p)}
                      >
                        <PencilIcon className="size-3.5" />
                        <span className="sr-only">Edit</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-7 p-0"
                        onClick={() => setRemoving(p)}
                      >
                        <Trash2Icon className="size-3.5" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PermissionDialog
        open={creating || editing != null}
        permission={editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={invalidate}
      />

      <ConfirmDialog
        open={removing != null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Delete this permission?"
        description={
          removing
            ? `"${removing.permissionName}" disappears from every owner's grant screen. Staff who already hold it lose it.`
            : undefined
        }
        confirmLabel="Delete"
        onConfirm={() => removing && removeMutation.mutate(removing)}
      />
    </div>
  );
}

function PermissionDialog({
  open,
  permission,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  permission: Permission | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Keyed on the record so the fields re-seed for each open rather than
            being synced by an effect. */}
        {open && (
          <PermissionForm
            key={permission?._id ?? "new"}
            permission={permission}
            onCancel={() => onOpenChange(false)}
            onSaved={() => {
              onOpenChange(false);
              onSaved();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PermissionForm({
  permission,
  onCancel,
  onSaved,
}: {
  permission: Permission | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(permission?.permissionName ?? "");
  const [description, setDescription] = useState(permission?.description ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      permission
        ? updatePermission(permission._id, { description: description.trim() })
        : createPermission({
            permissionName: name.trim(),
            description: description.trim(),
          }),
    onSuccess: () => {
      toast.success(permission ? "Permission updated." : "Permission created.");
      onSaved();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not save it.",
      ),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {permission ? "Edit permission" : "Add permission"}
        </DialogTitle>
        <DialogDescription>
          {permission
            ? "The name is the contract every grant references, so only the description can change."
            : "The name is matched literally by the merchant app, and its prefix decides which group it appears under here."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="permission-name">Name</Label>
          <Input
            id="permission-name"
            value={name}
            // Immutable once created: the merchant app checks grants by
            // string, so a rename silently unmakes every grant referencing
            // the old name. The backend's UpdatePermissionInput would accept
            // one; this form refuses to offer it.
            disabled={permission != null}
            placeholder="e.g. order_refund"
            onChange={(event) => setName(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Lower snake_case. The prefix (order, inventory, product, service)
            decides the group.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="permission-description">Description</Label>
          <Textarea
            id="permission-description"
            value={description}
            rows={2}
            placeholder="What a staff member holding this can do."
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={
            mutation.isPending || !name.trim() || !description.trim()
          }
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}

// ── Roles ───────────────────────────────────────────────────────────────────

function RolesTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Role | null>(null);

  const { data, isPending, isError } = useQuery({
    queryKey: ["adminRoles"],
    queryFn: listRoles,
  });
  const roles = data ?? [];

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["adminRoles"] });
  }

  const removeMutation = useMutation({
    mutationFn: (role: Role) => deleteRole(role._id),
    onSuccess: () => {
      toast.success("Role deleted.");
      setRemoving(null);
      invalidate();
    },
    onError: (err) =>
      // The backend refuses to delete a seeded role or one still held by an
      // account, and its message names the count. Worth showing verbatim.
      toast.error(
        err instanceof ApiError ? err.message : "Could not delete the role.",
      ),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every role on the platform. Adding one here makes it real and
          assignable — but a new role can do nothing in this admin panel until
          code grants it something: panel access and every query behind it are
          gated by guards that name roles literally.
        </p>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon />
          Add role
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">
          Failed to load roles. Please try again.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {roles.map((role) => {
            const isSystem = SYSTEM_ROLE_IDS.includes(role.roleId);
            return (
              <li
                key={role._id}
                className="flex items-start justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{role.roleName}</span>
                    <code className="text-xs text-muted-foreground">
                      {role.roleId}
                    </code>
                    {isSystem && <Badge variant="outline">System</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {role.description ?? "No description"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="size-7 p-0"
                    onClick={() => setEditing(role)}
                  >
                    <PencilIcon className="size-3.5" />
                    <span className="sr-only">Edit</span>
                  </Button>
                  {/* Seeded roles cannot be deleted — the backend refuses and
                      names the reason. Hiding the button means the refusal is
                      never something you have to discover by clicking. */}
                  {!isSystem && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-7 p-0"
                      onClick={() => setRemoving(role)}
                    >
                      <Trash2Icon className="size-3.5" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <RoleDialog
        open={creating || editing != null}
        role={editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={invalidate}
      />

      <ConfirmDialog
        open={removing != null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Delete this role?"
        description={
          removing
            ? `"${removing.roleName}" is removed. This fails if any account still holds it.`
            : undefined
        }
        confirmLabel="Delete"
        onConfirm={() => removing && removeMutation.mutate(removing)}
      />
    </div>
  );
}

function RoleDialog({
  open,
  role,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  role: Role | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <RoleForm
            key={role?._id ?? "new"}
            role={role}
            onCancel={() => onOpenChange(false)}
            onSaved={() => {
              onOpenChange(false);
              onSaved();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RoleForm({
  role,
  onCancel,
  onSaved,
}: {
  role: Role | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [roleId, setRoleId] = useState(role?.roleId ?? "");
  const [roleName, setRoleName] = useState(role?.roleName ?? "");
  const [description, setDescription] = useState(role?.description ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      role
        ? updateRole(role._id, {
            roleName: roleName.trim(),
            description: description.trim(),
          })
        : createRole({
            roleId: roleId.trim(),
            roleName: roleName.trim(),
            description: description.trim(),
          }),
    onSuccess: () => {
      toast.success(role ? "Role updated." : "Role created.");
      onSaved();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not save the role.",
      ),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{role ? "Edit role" : "Add role"}</DialogTitle>
        <DialogDescription>
          {role
            ? "The slug is what every guard matches on and cannot change — the backend omits it from the update input for the same reason."
            : "The slug is matched literally by backend guards and by this panel's own capability map. Neither knows about a new one until code says so."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role-id">Slug</Label>
          <Input
            id="role-id"
            value={roleId}
            disabled={role != null}
            placeholder="e.g. finance"
            onChange={(event) => setRoleId(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role-name">Name</Label>
          <Input
            id="role-name"
            value={roleName}
            placeholder="e.g. Finance"
            onChange={(event) => setRoleName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role-description">Description</Label>
          <Textarea
            id="role-description"
            value={description}
            rows={2}
            placeholder="What this role is for."
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={
            mutation.isPending ||
            !roleName.trim() ||
            !description.trim() ||
            (!role && !roleId.trim())
          }
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

function RolesAndPermissionsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Roles & Permissions</h1>
        <p className="text-sm text-muted-foreground">
          The two catalogues underneath every access decision on the platform:
          which roles exist, and what a merchant owner can grant their staff.
        </p>
      </div>

      <Tabs defaultValue="permissions">
        <TabsList>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>
        <TabsContent value="permissions" className="pt-4">
          <PermissionsTab />
        </TabsContent>
        <TabsContent value="roles" className="pt-4">
          <RolesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function PermissionsPageGuard() {
  return (
    <RequireCapability capability="admin_user:manage">
      <RolesAndPermissionsPage />
    </RequireCapability>
  );
}
