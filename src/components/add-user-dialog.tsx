"use client";

import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type AddUserFormState = {
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  role: "admin" | "support";
};

export function AddUserDialog({
  open,
  onOpenChange,
  form,
  onFormChange,
  onSubmit,
  submitting,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: AddUserFormState;
  onFormChange: Dispatch<SetStateAction<AddUserFormState>>;
  onSubmit: (event: React.FormEvent) => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button />}>Add User</DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>
              Creates the account and emails a link for them to set their own
              password.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="firstName">First name</FieldLabel>
              <Input
                id="firstName"
                required
                value={form.firstName}
                onChange={(e) =>
                  onFormChange((f) => ({ ...f, firstName: e.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="lastName">Last name</FieldLabel>
              <Input
                id="lastName"
                required
                value={form.lastName}
                onChange={(e) =>
                  onFormChange((f) => ({ ...f, lastName: e.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) =>
                  onFormChange((f) => ({ ...f, email: e.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="phoneNumber">Phone number</FieldLabel>
              <Input
                id="phoneNumber"
                required
                placeholder="09171234567"
                value={form.phoneNumber}
                onChange={(e) =>
                  onFormChange((f) => ({ ...f, phoneNumber: e.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="role">Role</FieldLabel>
              <Select
                value={form.role}
                onValueChange={(value) =>
                  onFormChange((f) => ({
                    ...f,
                    role: value as AddUserFormState["role"],
                  }))
                }
              >
                <SelectTrigger id="role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="support">Support</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>
                Admins can create other admin/support accounts; support
                cannot.
              </FieldDescription>
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
