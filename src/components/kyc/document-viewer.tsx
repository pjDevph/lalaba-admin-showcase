"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api-client";
import {
  getKycDocumentUrl,
  KYC_DOCUMENT_TYPE_LABELS,
  KYC_PROVIDER_TYPE_LABELS,
  idTypeLabel,
  type GovernmentIdType,
  type KycDocumentType,
  type KycProviderType,
} from "@/lib/graphql/kyc";

/**
 * The minimum a viewer needs. Deliberately not a queue row or a provider-detail
 * row — both surfaces open the same evidence, and coupling this to either
 * one's shape would make the other convert on every call.
 */
export type ViewableDocument = {
  documentId: string;
  documentType: KycDocumentType;
  /** The claimed ID type, for the front-of-ID types. Null on everything else. */
  governmentIdType?: GovernmentIdType | null;
  mimeType: string;
  expiresAt: string | null;
  providerName: string | null;
  providerType: KycProviderType;
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

/**
 * Names the host the backend pointed us at, and what that host means.
 *
 * The backend decides this entirely (FIREBASE_STORAGE_EMULATOR_HOST) and the
 * panel is often talking to someone else's machine, so "the image is broken" is
 * useless on its own — whose storage, and which kind, is the whole diagnosis.
 * The signature is stripped: it is long, useless here, and a credential.
 */
function describeStorageHost(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `Backend returned something that is not a URL: ${url.slice(0, 120)}`;
  }
  const where = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  if (parsed.hostname === "storage.googleapis.com") {
    return parsed.searchParams.has("X-Goog-Signature")
      ? `${where} — real Firebase Storage, signed. The link is well-formed, so the object is missing or the signer lacks access.`
      : `${where} — real Firebase Storage but UNSIGNED, so private evidence is refused. The backend built an emulator-style URL against the production host.`;
  }
  if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    return `${where} — the backend named its OWN machine. Loopback points this browser at itself, so the file is fine and unreachable from here. Set FIREBASE_STORAGE_EMULATOR_HOST to that machine's LAN IP and restart it.`;
  }
  return `${where} — a Storage Emulator URL. Nothing serves this unless an emulator is running and reachable on that host and port.`;
}

/**
 * Evidence viewer. Fetches the signed URL when it opens and drops it when it
 * closes — the URL lives 300 seconds, so caching it across opens would show a
 * broken preview. Images render inline; PDFs and Word documents open in a new
 * tab, since the private bucket serves them as downloads.
 *
 * Every open writes a DOCUMENT_URL_ISSUED event to the KYC audit trail, so
 * opening this is itself a recorded action.
 */
export function DocumentViewer({
  item,
  onClose,
}: {
  item: ViewableDocument | null;
  onClose: () => void;
}) {
  const documentId = item?.documentId ?? null;
  // A signed URL that resolves to nothing still arrives as a valid string, so
  // the only signal that the evidence is unreachable is the image failing to
  // load. Without this the reviewer just gets a broken-image glyph and no idea
  // whether the partner uploaded nothing or the storage host is misconfigured.
  //
  // The URL that failed, not a boolean: each open refetches a fresh signed URL,
  // and comparing against it drops the failure on its own. A boolean would need
  // an effect to clear it, which is a cascading render for no gain.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  // staleTime/gcTime 0: the signed URL expires in 300s, so it must be refetched
  // every time the viewer opens and never survive in the cache.
  const {
    data: url,
    error,
    isFetching,
  } = useQuery({
    queryKey: ["kyc-document-url", documentId],
    queryFn: () => getKycDocumentUrl(documentId!),
    enabled: !!documentId,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const loadFailed = !!url && failedUrl === url;
  const isImage = item?.mimeType.startsWith("image/") ?? false;

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {item
              ? (KYC_DOCUMENT_TYPE_LABELS[item.documentType] ??
                item.documentType)
              : ""}
          </DialogTitle>
          <DialogDescription>
            {item?.providerName ?? "Deleted provider"} ·{" "}
            {item ? KYC_PROVIDER_TYPE_LABELS[item.providerType] : ""}
            {idTypeLabel(item?.governmentIdType)
              ? ` · Claimed ${idTypeLabel(item?.governmentIdType)}`
              : ""}
            {item && item.expiresAt
              ? ` · Expires ${formatDate(item.expiresAt)}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-destructive">
            {error instanceof ApiError
              ? error.message
              : "Could not load document."}
          </p>
        ) : isFetching || !url ? (
          <Skeleton className="h-64 w-full" />
        ) : isImage && loadFailed ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-4 text-sm">
            <p className="font-medium text-destructive">
              The evidence file could not be loaded.
            </p>
            <p className="mt-1 text-muted-foreground">
              The document record exists, but the storage URL the backend issued
              did not return an image. Which host it names says why:
            </p>
            <p className="mt-2 font-mono text-xs break-all">
              {describeStorageHost(url)}
            </p>
            <p className="mt-2 text-muted-foreground">
              Open it in a new tab to see the storage error itself — Google
              Cloud Storage answers with an XML code
              (<span className="font-mono">NoSuchKey</span>,{" "}
              <span className="font-mono">AccessDenied</span>,{" "}
              <span className="font-mono">ExpiredToken</span>) that names the
              cause exactly.
            </p>
          </div>
        ) : isImage ? (
          // Not next/image: the host is a short-lived signed storage URL, not
          // a configured remote pattern, and it must never be cached.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="KYC document evidence"
            className="max-h-[60vh] w-full rounded-md object-contain"
            onError={() => setFailedUrl(url)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            This document is a {item?.mimeType} file and cannot be previewed
            inline.
          </p>
        )}

        <DialogFooter>
          {url && (
            <Button
              variant="outline"
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
            >
              Open in new tab
            </Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
