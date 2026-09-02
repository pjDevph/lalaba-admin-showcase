"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";

import { RequireCapability, useCan } from "@/components/can";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FaqEntryDialog } from "@/components/site-content/faq-entry-dialog";
import { ServiceAreaDialog } from "@/components/site-content/service-area-dialog";
import { AnnouncementDialog } from "@/components/site-content/announcement-dialog";
import { ApiError } from "@/lib/api-client";
import {
  ANNOUNCEMENT_AUDIENCES,
  FAQ_CATEGORIES,
  createAnnouncement,
  createFaqEntry,
  createServiceArea,
  deleteAnnouncement,
  deleteFaqEntry,
  deleteServiceArea,
  listAnnouncements,
  listFaqEntries,
  listServiceAreas,
  updateAnnouncement,
  updateFaqEntry,
  updateServiceArea,
  type FaqEntry,
  type ServiceArea,
  type SiteAnnouncement,
} from "@/lib/graphql/site-content";

function PublishedBadge({ isPublished }: { isPublished: boolean }) {
  return (
    <Badge variant={isPublished ? "default" : "secondary"}>
      {isPublished ? "Published" : "Draft"}
    </Badge>
  );
}

function FaqTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FaqEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FaqEntry | null>(null);

  const { data, isPending } = useQuery({ queryKey: ["site-faq"], queryFn: listFaqEntries });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["site-faq"] });
  }

  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: Parameters<typeof createFaqEntry>[0] }) =>
      id ? updateFaqEntry(id, input) : createFaqEntry(input),
    onSuccess: () => {
      toast.success(editing ? "FAQ entry updated." : "FAQ entry added.");
      setDialogOpen(false);
      setEditing(null);
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save this entry."),
  });

  const publishMutation = useMutation({
    mutationFn: (entry: FaqEntry) => updateFaqEntry(entry._id, { isPublished: !entry.isPublished }),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not update this entry."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFaqEntry(id),
    onSuccess: () => {
      toast.success("FAQ entry deleted.");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not delete this entry."),
  });

  const columns: ColumnDef<FaqEntry>[] = [
    {
      id: "question",
      header: "Question",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.question}</div>
          <div className="text-sm text-muted-foreground">
            {FAQ_CATEGORIES.find((c) => c.id === row.original.category)?.label}
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) =>
        canManage ? (
          <div className="flex items-center gap-2">
            <Switch
              checked={row.original.isPublished}
              onCheckedChange={() => publishMutation.mutate(row.original)}
            />
            <span className="text-sm text-muted-foreground">
              {row.original.isPublished ? "Published" : "Draft"}
            </span>
          </div>
        ) : (
          <PublishedBadge isPublished={row.original.isPublished} />
        ),
    },
  ];

  if (canManage) {
    columns.push({
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditing(row.original);
              setError(null);
              setDialogOpen(true);
            }}
          >
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(row.original)}>
            Delete
          </Button>
        </div>
      ),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex justify-end">
          <Button
            onClick={() => {
              setEditing(null);
              setError(null);
              setDialogOpen(true);
            }}
          >
            Add FAQ entry
          </Button>
        </div>
      )}
      <DataTable columns={columns} data={data ?? []} isLoading={isPending} emptyMessage="No FAQ entries yet." />

      <FaqEntryDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        entry={editing}
        submitting={saveMutation.isPending}
        error={error}
        onSubmit={(input) => saveMutation.mutate({ id: editing?._id ?? null, input })}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this FAQ entry?"
        description={`"${deleteTarget?.question}" will be removed from the site immediately.`}
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget._id)}
      />
    </div>
  );
}

function ServiceAreasTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceArea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServiceArea | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["site-service-areas"],
    queryFn: listServiceAreas,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["site-service-areas"] });
  }

  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: Parameters<typeof createServiceArea>[0] }) =>
      id ? updateServiceArea(id, input) : createServiceArea(input),
    onSuccess: () => {
      toast.success(editing ? "Service area updated." : "Service area added.");
      setDialogOpen(false);
      setEditing(null);
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save this area."),
  });

  const publishMutation = useMutation({
    mutationFn: (area: ServiceArea) => updateServiceArea(area._id, { isPublished: !area.isPublished }),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not update this area."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteServiceArea(id),
    onSuccess: () => {
      toast.success("Service area deleted.");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not delete this area."),
  });

  const columns: ColumnDef<ServiceArea>[] = [
    { id: "name", header: "Area", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) =>
        canManage ? (
          <div className="flex items-center gap-2">
            <Switch
              checked={row.original.isPublished}
              onCheckedChange={() => publishMutation.mutate(row.original)}
            />
            <span className="text-sm text-muted-foreground">
              {row.original.isPublished ? "Published" : "Draft"}
            </span>
          </div>
        ) : (
          <PublishedBadge isPublished={row.original.isPublished} />
        ),
    },
  ];

  if (canManage) {
    columns.push({
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditing(row.original);
              setError(null);
              setDialogOpen(true);
            }}
          >
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(row.original)}>
            Delete
          </Button>
        </div>
      ),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex justify-end">
          <Button
            onClick={() => {
              setEditing(null);
              setError(null);
              setDialogOpen(true);
            }}
          >
            Add service area
          </Button>
        </div>
      )}
      <DataTable columns={columns} data={data ?? []} isLoading={isPending} emptyMessage="No service areas published yet." />

      <ServiceAreaDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        area={editing}
        submitting={saveMutation.isPending}
        error={error}
        onSubmit={(input) => saveMutation.mutate({ id: editing?._id ?? null, input })}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this service area?"
        description={`"${deleteTarget?.name}" will be removed from the site immediately.`}
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget._id)}
      />
    </div>
  );
}

function AnnouncementsTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SiteAnnouncement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SiteAnnouncement | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["site-announcements"],
    queryFn: listAnnouncements,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["site-announcements"] });
  }

  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: Parameters<typeof createAnnouncement>[0] }) =>
      id ? updateAnnouncement(id, input) : createAnnouncement(input),
    onSuccess: () => {
      toast.success(editing ? "Announcement updated." : "Announcement added.");
      setDialogOpen(false);
      setEditing(null);
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save this announcement."),
  });

  const publishMutation = useMutation({
    mutationFn: (a: SiteAnnouncement) => updateAnnouncement(a._id, { isPublished: !a.isPublished }),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not update this announcement."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAnnouncement(id),
    onSuccess: () => {
      toast.success("Announcement deleted.");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not delete this announcement."),
  });

  const columns: ColumnDef<SiteAnnouncement>[] = [
    {
      id: "title",
      header: "Announcement",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.title}</div>
          <div className="text-sm text-muted-foreground">
            {ANNOUNCEMENT_AUDIENCES.find((a) => a.id === row.original.audience)?.label}
            {row.original.promoCode ? ` · ${row.original.promoCode}` : ""}
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) =>
        canManage ? (
          <div className="flex items-center gap-2">
            <Switch
              checked={row.original.isPublished}
              onCheckedChange={() => publishMutation.mutate(row.original)}
            />
            <span className="text-sm text-muted-foreground">
              {row.original.isPublished ? "Published" : "Draft"}
            </span>
          </div>
        ) : (
          <PublishedBadge isPublished={row.original.isPublished} />
        ),
    },
  ];

  if (canManage) {
    columns.push({
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditing(row.original);
              setError(null);
              setDialogOpen(true);
            }}
          >
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(row.original)}>
            Delete
          </Button>
        </div>
      ),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex justify-end">
          <Button
            onClick={() => {
              setEditing(null);
              setError(null);
              setDialogOpen(true);
            }}
          >
            Add announcement
          </Button>
        </div>
      )}
      <DataTable columns={columns} data={data ?? []} isLoading={isPending} emptyMessage="No announcements yet." />

      <AnnouncementDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        announcement={editing}
        submitting={saveMutation.isPending}
        error={error}
        onSubmit={(input) => saveMutation.mutate({ id: editing?._id ?? null, input })}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this announcement?"
        description={`"${deleteTarget?.title}" will be removed from the site immediately.`}
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget._id)}
      />
    </div>
  );
}

function WebsiteContentPage() {
  const { can } = useCan();
  const canManage = can("site_content:manage");

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Website Content</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          FAQ, service areas and promo banners for the public marketing site.
          The site fetches published entries directly — changes here go live
          on its next page load, no redeploy needed.
        </p>
      </div>

      <Tabs defaultValue="faq">
        <TabsList>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
          <TabsTrigger value="areas">Service Areas</TabsTrigger>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
        </TabsList>
        <TabsContent value="faq">
          <FaqTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="areas">
          <ServiceAreasTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="announcements">
          <AnnouncementsTab canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function WebsiteContentPageGuard() {
  return (
    <RequireCapability capability="site_content:manage">
      <WebsiteContentPage />
    </RequireCapability>
  );
}
