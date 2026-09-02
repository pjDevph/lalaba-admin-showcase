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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  FAQ_CATEGORIES,
  type CreateFaqEntryInput,
  type FaqCategory,
  type FaqEntry,
} from "@/lib/graphql/site-content";

type FaqEntryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: FaqEntry | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: CreateFaqEntryInput) => void;
};

export function FaqEntryDialog({
  open,
  onOpenChange,
  entry,
  submitting,
  error,
  onSubmit,
}: FaqEntryDialogProps) {
  const isEdit = !!entry;
  const [category, setCategory] = useState<FaqCategory>(
    entry?.category ?? FAQ_CATEGORIES[0].id,
  );
  const [question, setQuestion] = useState(entry?.question ?? "");
  const [answer, setAnswer] = useState(entry?.answer ?? "");
  const [order, setOrder] = useState(entry ? String(entry.order) : "0");

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCategory(entry?.category ?? FAQ_CATEGORIES[0].id);
      setQuestion(entry?.question ?? "");
      setAnswer(entry?.answer ?? "");
      setOrder(entry ? String(entry.order) : "0");
    }
  }

  const canSubmit = question.trim() && answer.trim() && !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit FAQ entry" : "Add FAQ entry"}</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Category</FieldLabel>
            <Select value={category} onValueChange={(v) => v && setCategory(v as FaqCategory)}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v: FaqCategory) => FAQ_CATEGORIES.find((c) => c.id === v)?.label ?? v}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {FAQ_CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="faq-question">Question</FieldLabel>
            <Input id="faq-question" value={question} onChange={(e) => setQuestion(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="faq-answer">Answer</FieldLabel>
            <Textarea
              id="faq-answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={4}
            />
          </Field>
          <Field>
            <Label htmlFor="faq-order" className="text-xs text-muted-foreground">
              Display order (lower shows first)
            </Label>
            <Input
              id="faq-order"
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
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                category,
                question: question.trim(),
                answer: answer.trim(),
                order: Number(order) || 0,
              })
            }
          >
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Add entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
