// Mirrors the backend's Role document (LALABA_BE_DEV src/users/schemas/role.schema.ts).
export type Role = {
  roleId: string;
  roleName: string;
};

// Mirrors the backend's User GraphQL type (LALABA_BE_DEV src/users/models/user.model.ts) —
// only the fields the admin panel actually requests via the `me` query.
export type UserProfile = {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
