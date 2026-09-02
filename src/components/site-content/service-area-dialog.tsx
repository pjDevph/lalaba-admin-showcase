"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CreateServiceAreaInput, ServiceArea } from "@/lib/graphql/site-content";

type ServiceAreaDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  area: ServiceArea | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: CreateServiceAreaInput) => void;
};

export function ServiceAreaDialog({
  open,
  onOpenChange,
  area,
  submitting,
  error,
  onSubmit,
}: ServiceAreaDialogProps) {
  const isEdit = !!area;
  const [name, setName] = useState(area?.name ?? "");
  const [order, setOrder] = useState(area ? String(area.order) : "0");

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(area?.name ?? "");
      setOrder(area ? String(area.order) : "0");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit service area" : "Add service area"}</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="area-name">Name</FieldLabel>
            <Input
              id="area-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Quezon City, Metro Manila"
            />
          </Field>
          <Field>
            <Label htmlFor="area-order" className="text-xs text-muted-foreground">
              Display order (lower shows first)
            </Label>
            <Input
              id="area-order"
              type="number"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              className="w-32"
            />
          </Field>
          {error && <FieldError>{error}</FieldError>}
        </FieldGroup>
        <DialogFooter>
          <Button
            disabled={!name.trim() || submitting}
            onClick={() => onSubmit({ name: name.trim(), order: Number(order) || 0 })}
          >
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Add area"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
