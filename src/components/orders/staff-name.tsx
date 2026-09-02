"use client";

import { useQuery } from "@tanstack/react-query";

import { useCan } from "@/components/can";
import { listDirectoryUsers, ROLE_LABELS } from "@/lib/graphql/directory";

// An order snapshot stores only UIDs for the people who touched it — the
// courier on each leg, whoever collected the money, whoever captured the
// handover photo. Rendering those raw is useless to an agent on a call: they
// have a name in front of them, not a 28-character Firebase uid.
//
// Resolution goes through the account directory's exact-uid search rather
// than `directoryUser(uid)`, which would additionally count that person's
// orders and tickets, read their wallet, and list their devices and linked
// accounts — several collections' worth of work to render one name.
//
// It degrades rather than fails. The directory is gated on `account:read`,
// which order-only roles may not hold, and a courier account can be deleted
// while the order it touched lives on. Either way the uid still renders, so
// the page never loses the identifier support can escalate with.

function useResolvedName(uid: string | null | undefined) {
  const { can } = useCan();
  const enabled = !!uid && can("account:read");

  return useQuery({
    queryKey: ["directory-name", uid],
    queryFn: async () => {
      const { data } = await listDirectoryUsers({
        search: uid as string,
        limit: 1,
        offset: 0,
      });
      // The search box matches names and phone numbers too, so an exact uid
      // match is confirmed here rather than assumed from "first row".
      return data.find((user) => user.uid === uid) ?? null;
    },
    enabled,
    // A person's name does not change during a support call, and the same
    // courier appears on both legs of an order.
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

/**
 * A uid rendered as the person behind it, with the uid kept underneath.
 *
 * Both halves stay on screen deliberately: the name is what the agent needs
 * to talk about the order, and the uid is what engineering needs when the
 * agent escalates it.
 */
export function StaffName({ uid }: Readonly<{ uid: string | null | undefined }>) {
  const { data, isPending } = useResolvedName(uid);

  if (!uid) return null;

  if (isPending || !data) {
    return <span className="font-mono text-xs">{uid}</span>;
  }

  return (
    <span className="flex flex-col items-end">
      <span>{data.displayName}</span>
      <span className="text-xs font-normal text-muted-foreground">
        {ROLE_LABELS[data.roleId] ?? data.roleId} · <span className="font-mono">{uid}</span>
      </span>
    </span>
  );
}

/**
 * Inline form for places that already sit inside a sentence or a table cell,
 * where the stacked two-line form of `StaffName` would break the layout.
 */
export function StaffNameInline({ uid }: Readonly<{ uid: string | null | undefined }>) {
  const { data } = useResolvedName(uid);

  if (!uid) return null;
  if (!data) return <span className="font-mono text-xs">{uid}</span>;

  return (
    <span>
      {data.displayName}{" "}
      <span className="text-muted-foreground">
        ({ROLE_LABELS[data.roleId] ?? data.roleId})
      </span>
    </span>
  );
}
