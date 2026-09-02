import { graphqlFetch } from "@/lib/api-client";

export type Permission = {
  _id: string;
  permissionName: string;
  description: string;
};

const LIST_QUERY = `
  query ListAdminPermissions {
    listAdminPermissions {
      _id
      permissionName
      description
    }
  }
`;

export async function listAdminPermissions() {
  const { listAdminPermissions } = await graphqlFetch<{
    listAdminPermissions: Permission[];
  }>(LIST_QUERY);
  return listAdminPermissions;
}

/**
 * Editing the catalogue itself.
 *
 * `listAdminPermissions` was the only one of these four wired up, so the
 * catalogue an owner grants from could be read here and only changed by
 * deploying a seed. These three are @Roles('admin') on the backend and had no
 * caller at all.
 *
 * A permission's NAME is the contract: the merchant app checks grants by
 * string, and the admin panel groups this page by the name's prefix. Renaming
 * one silently unmakes every grant that referenced it, which is why the edit
 * form treats the name as immutable and only the description is editable.
 */
export async function createPermission(input: {
  permissionName: string;
  description: string;
}) {
  const { createPermission } = await graphqlFetch<{
    createPermission: Permission;
  }>(
    `mutation CreatePermission($input: CreatePermissionInput!) {
       createPermission(input: $input) { _id permissionName description }
     }`,
    { input },
  );
  return createPermission;
}

export async function updatePermission(
  id: string,
  input: { description: string },
) {
  const { updatePermission } = await graphqlFetch<{
    updatePermission: Permission;
  }>(
    `mutation UpdatePermission($id: ID!, $input: UpdatePermissionInput!) {
       updatePermission(id: $id, input: $input) { _id permissionName description }
     }`,
    { id, input },
  );
  return updatePermission;
}

export async function deletePermission(id: string) {
  const { deletePermission } = await graphqlFetch<{ deletePermission: boolean }>(
    `mutation DeletePermission($id: ID!) { deletePermission(id: $id) }`,
    { id },
  );
  return deletePermission;
}

/**
 * ROLES.
 *
 * Every role on the platform, back-office and app-facing alike. listRoles,
 * getRole, createRole, updateRole and deleteRole are all @Roles('admin') and
 * none of them had a caller — so adding the `finance` or `support_lead` role
 * that capabilities.ts has anticipated since it was written meant a database
 * write by hand.
 *
 * A caveat this screen states out loud rather than burying: creating a role
 * here does NOT make it able to use the admin panel. Panel access is decided
 * by ALLOWED_ROLES in auth-context and by each backend resolver's @Roles(...)
 * guard, both of which name roles literally. A new role is a real, assignable
 * role with no permissions in this panel until code grants it some.
 */
export type Role = {
  _id: string;
  roleId: string;
  roleName: string;
  description: string | null;
};

/** The roles the backend seeds and refuses to delete. Mirrors SEED_ROLE_IDS
 *  in roles.service.ts, so the UI can hide a delete button that would 400. */
export const SYSTEM_ROLE_IDS = [
  "admin",
  "merchant",
  "washer",
  "staff",
  "customer",
  "courier",
  "support",
];

export async function listRoles() {
  const { listRoles } = await graphqlFetch<{ listRoles: Role[] }>(
    `query ListRoles { listRoles { _id roleId roleName description } }`,
  );
  return listRoles;
}

export async function createRole(input: {
  roleId: string;
  roleName: string;
  description: string;
}) {
  const { createRole } = await graphqlFetch<{ createRole: Role }>(
    `mutation CreateRole($input: CreateRoleInput!) {
       createRole(input: $input) { _id roleId roleName description }
     }`,
    { input },
  );
  return createRole;
}

/** roleId is omitted from UpdateRoleInput server-side — the slug is the
 *  contract every guard matches on, so only the label and blurb are editable. */
export async function updateRole(
  id: string,
  input: { roleName?: string; description?: string },
) {
  const { updateRole } = await graphqlFetch<{ updateRole: Role }>(
    `mutation UpdateRole($id: ID!, $input: UpdateRoleInput!) {
       updateRole(id: $id, input: $input) { _id roleId roleName description }
     }`,
    { id, input },
  );
  return updateRole;
}

export async function deleteRole(id: string) {
  const { deleteRole } = await graphqlFetch<{ deleteRole: boolean }>(
    `mutation DeleteRole($id: ID!) { deleteRole(id: $id) }`,
    { id },
  );
  return deleteRole;
}
