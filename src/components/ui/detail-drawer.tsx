"use client";

import { CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { StatusMeta } from "@/lib/status";

export type DetailTab = {
  value: string;
  label: string;
  content: React.ReactNode;
};

/**
 * The standard "open a row without leaving the list" surface.
 *
 * A drawer rather than a route because back-office work is a loop: an agent
 * opens twenty rows out of one filtered queue, and a full navigation loses the
 * scroll position, the filters and the page number every single time.
 *
 * Header is fixed by the component (entity id + status + actions) so that
 * every drawer in the panel puts those three things in the same place.
 */
export function DetailDrawer({
  open,
  onOpenChange,
  entityId,
  title,
  subtitle,
  status,
  statusRegistry,
  actions,
  tabs,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown monospaced with a copy button — support pastes these into tickets constantly. */
  entityId?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  status?: string;
  statusRegistry?: Record<string, StatusMeta>;
  /** Primary actions, rendered in the header. Gate each one with <Can>. */
  actions?: React.ReactNode;
  /** Tabbed sections. Mutually exclusive with `children`. */
  tabs?: DetailTab[];
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn("flex w-full flex-col gap-0 sm:max-w-xl", className)}
      >
        <SheetHeader className="gap-2 border-b">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle className="text-base">{title}</SheetTitle>
            {status && (
              <StatusBadge status={status} registry={statusRegistry} />
            )}
          </div>
          {entityId && <EntityId id={entityId} />}
          {subtitle && <SheetDescription>{subtitle}</SheetDescription>}
          {actions && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {actions}
            </div>
          )}
        </SheetHeader>

        {tabs ? (
          <Tabs defaultValue={tabs[0]?.value} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-4 mt-3 w-fit">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {tabs.map((tab) => (
              <TabsContent
                key={tab.value}
                value={tab.value}
                className="min-h-0 flex-1 overflow-y-auto p-4"
              >
                {tab.content}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EntityId({ id }: { id: string }) {
  return (
    <div className="flex items-center gap-1">
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
        {id}
      </code>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        aria-label="Copy ID"
        onClick={() => {
          void navigator.clipboard.writeText(id);
          toast.success("ID copied");
        }}
      >
        <CopyIcon className="size-3" />
      </Button>
    </div>
  );
}
