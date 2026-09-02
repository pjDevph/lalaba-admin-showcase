"use client";

import { useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { MoreHorizontalIcon, WashingMachineIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { RequireCapability } from "@/components/can";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { WasherServiceTemplateDialog } from "@/components/washer-service-template-dialog";
import { useCan } from "@/components/can";
import { ApiError } from "@/lib/api-client";
import {
  createWasherServiceTemplate,
  describePlatformPricing,
  formatPeso,
  listWasherServiceTemplates,
  PRICING_MODEL_LABELS,
  setWasherServiceTemplateActive,
  updateWasherServiceTemplate,
  type WasherServiceTemplate,
  type WasherServiceTemplateInput,
} from "@/lib/graphql/washer-service-templates";

type StatusFilter = "all" | "active" | "inactive";

/** Pricing-control badge + a one-line summary of the actual numbers. */
function PricingSummary({ template }: { template: WasherServiceTemplate }) {
  if (template.pricingControl === "PLATFORM_FIXED") {
    const { headline, detail } = describePlatformPricing(template);
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          Lalaba Controlled Price
        </Badge>
        <Badge variant="outline">{headline}</Badge>
        <Badge variant="outline">{detail}</Badge>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge className="border-purple-500/40 bg-purple-500/10 text-purple-600 dark:text-purple-400">
        Washer Controlled Price
      </Badge>
      <Badge variant="outline">
        {template.allowedPricingModels
          .map((m) => PRICING_MODEL_LABELS[m])
          .join(" · ") || "No method allowed"}
      </Badge>
    </div>
  );
}

function LimitsBadge({ template }: { template: WasherServiceTemplate }) {
  if (template.pricingControl === "PLATFORM_FIXED") {
    return template.platformLoadCapacityKg != null ? (
      <Badge variant="outline">
        Capacity limit: {template.platformLoadCapacityKg} kg max per load
      </Badge>
    ) : null;
  }
  const { minPriceCentavos: min, maxPriceCentavos: max } = template;
  if (min == null && max == null) {
    return <Badge variant="outline">No strict limitations</Badge>;
  }
  return (
    <Badge variant="outline">
      Price limit: {min == null ? "any" : formatPeso(min)} –{" "}
      {max == null ? "any" : formatPeso(max)}
    </Badge>
  );
}

function ServiceRow({
  template,
  isAdmin,
  isWorking,
  onEdit,
  onDuplicate,
  onToggleActive,
}: {
  template: WasherServiceTemplate;
  isAdmin: boolean;
  isWorking: boolean;
  onEdit: (t: WasherServiceTemplate) => void;
  onDuplicate: (t: WasherServiceTemplate) => void;
  onToggleActive: (t: WasherServiceTemplate) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border p-4">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted">
        <WashingMachineIcon className="size-5 text-muted-foreground" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{template.name}</span>
          <Badge variant={template.isActive ? "default" : "secondary"}>
            {template.isActive ? "Active" : "Hidden"}
          </Badge>
        </div>
        {template.description && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {template.description}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PricingSummary template={template} />
          <LimitsBadge template={template} />
        </div>
      </div>

      {isAdmin && (
        <div className="flex items-center gap-2">
          <Switch
            checked={template.isActive}
            disabled={isWorking}
            onCheckedChange={() => onToggleActive(template)}
            aria-label={`${template.name} active`}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" aria-label={`${template.name} actions`} />
              }
            >
              <MoreHorizontalIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(template)}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(template)}>
                Duplicate
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

function WasherServicesPage() {
  const { can } = useCan();
  const isAdmin = can("service:manage");
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WasherServiceTemplate | null>(null);
  // Prefills the create form from an existing template without editing it —
  // see WasherServiceTemplateDialog's `mode="duplicate"`, which pre-fills but
  // still submits as a brand-new template (the source id is never sent).
  const [duplicating, setDuplicating] = useState<WasherServiceTemplate | null>(
    null,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] =
    useState<WasherServiceTemplate | null>(null);

  // The catalog is a handful of rows that every washer sees, so it's fetched
  // whole and filtered client-side — there is no paginated admin query.
  const { data, isPending } = useQuery({
    queryKey: ["washer-service-templates"],
    queryFn: listWasherServiceTemplates,
    placeholderData: keepPreviousData,
  });

  const all = useMemo(() => data ?? [], [data]);
  const activeCount = all.filter((t) => t.isActive).length;
  const inactiveCount = all.length - activeCount;

  const templates = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all.filter((t) => {
      if (statusFilter !== "all" && t.isActive !== (statusFilter === "active")) {
        return false;
      }
      if (term && !t.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [all, statusFilter, search]);

  function invalidate() {
    void queryClient.invalidateQueries({
      queryKey: ["washer-service-templates"],
    });
  }

  const saveMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string | null;
      input: WasherServiceTemplateInput;
    }) =>
      id
        ? updateWasherServiceTemplate(id, input)
        : createWasherServiceTemplate(input),
    onSuccess: (saved, { id }) => {
      toast.success(id ? `${saved.name} updated.` : `${saved.name} created.`);
      setFormOpen(false);
      setEditing(null);
      setDuplicating(null);
      setFormError(null);
      invalidate();
    },
    // Shown inside the dialog rather than as a toast: "a template named X
    // already exists" is a field problem, and the dialog stays open to fix it.
    onError: (err) =>
      setFormError(
        err instanceof ApiError ? err.message : "Could not save the service.",
      ),
  });

  const activeMutation = useMutation({
    mutationFn: (template: WasherServiceTemplate) =>
      setWasherServiceTemplateActive(template._id, !template.isActive),
    onSuccess: (_, template) => {
      toast.success(
        template.isActive
          ? `${template.name} hidden from washers.`
          : `${template.name} published.`,
      );
      setConfirmTarget(null);
      invalidate();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not change visibility.",
      ),
  });

  function openCreate() {
    setEditing(null);
    setDuplicating(null);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(template: WasherServiceTemplate) {
    setEditing(template);
    setDuplicating(null);
    setFormError(null);
    setFormOpen(true);
  }

  function openDuplicate(template: WasherServiceTemplate) {
    setEditing(null);
    setDuplicating({ ...template, name: `${template.name} (Copy)` });
    setFormError(null);
    setFormOpen(true);
  }

  const workingId = activeMutation.isPending
    ? (activeMutation.variables?._id ?? null)
    : null;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Washer Services</h1>
          <p className="text-sm text-muted-foreground">
            The services home washers can offer. Lalaba controls which services
            exist and how they may be charged; each washer sets her own price
            unless a service is marked as priced by Lalaba.
          </p>
        </div>
        {isAdmin && <Button onClick={openCreate}>+ Add Service</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search services…"
          className="max-w-xs"
          aria-label="Search services"
        />
        <ToggleGroup
          variant="outline"
          value={[statusFilter]}
          onValueChange={(values) =>
            values[0] && setStatusFilter(values[0] as StatusFilter)
          }
        >
          <ToggleGroupItem value="all">All ({all.length})</ToggleGroupItem>
          <ToggleGroupItem value="active">
            Active ({activeCount})
          </ToggleGroupItem>
          <ToggleGroupItem value="inactive">
            Inactive ({inactiveCount})
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex flex-col gap-3">
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : templates.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {all.length === 0
              ? "No services in the catalog yet. Add one to let washers start offering it."
              : "No services match this search/filter."}
          </p>
        ) : (
          templates.map((t) => (
            <ServiceRow
              key={t._id}
              template={t}
              isAdmin={isAdmin}
              isWorking={workingId === t._id}
              onEdit={openEdit}
              onDuplicate={openDuplicate}
              onToggleActive={setConfirmTarget}
            />
          ))
        )}
      </div>

      <WasherServiceTemplateDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditing(null);
            setDuplicating(null);
            setFormError(null);
          }
        }}
        template={editing ?? duplicating}
        mode={editing ? "edit" : "duplicate"}
        submitting={saveMutation.isPending}
        error={formError}
        onSubmit={(input) =>
          saveMutation.mutate({ id: editing?._id ?? null, input })
        }
      />

      <ConfirmDialog
        open={!!confirmTarget}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        title={
          confirmTarget?.isActive
            ? "Hide this service?"
            : "Publish this service?"
        }
        description={
          confirmTarget &&
          (confirmTarget.isActive
            ? // Deactivating is not destructive but it isn't inert either: the
              // washer profile mutation drops ids that are no longer active.
              `"${confirmTarget.name}" disappears from the washer app immediately, and washers already offering it stop offering it. Existing bookings are unaffected. You can publish it again later.`
            : `"${confirmTarget.name}" becomes available for every home washer to add to their profile.`)
        }
        confirmLabel={confirmTarget?.isActive ? "Hide" : "Publish"}
        onConfirm={() => confirmTarget && activeMutation.mutate(confirmTarget)}
      />
    </div>
  );
}

export default function WasherServicesPageGuard() {
  return (
    <RequireCapability capability="service:manage">
      <WasherServicesPage />
    </RequireCapability>
  );
}
