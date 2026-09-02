"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navMain } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

// Derives the breadcrumb trail for the current route from the same navMain
// structure that drives the sidebar, so the two never drift apart.
//
// A dynamic detail route (/orders/[id]) has no navMain entry of its own, so it
// falls back to the deepest listed page whose url is a prefix of it — the
// parent stays a link, and the record itself gets a generic trailing crumb.
// The record's own identifier is not fetched for this: the page below already
// renders it, and a crumb reading a 24-character id would be worse than one
// reading "Details".
function findTrail(pathname: string): { title: string; url?: string }[] {
  for (const item of navMain) {
    if (item.url === pathname) {
      return [{ title: item.title }];
    }
    const subItem = item.items?.find((sub) => sub.url === pathname);
    if (subItem) {
      return [{ title: item.title }, { title: subItem.title }];
    }
  }

  // Longest prefix wins, so a future /orders/[id]/something still resolves to
  // the most specific listed ancestor rather than the first one that matches.
  const parent = navMain
    .filter((item) => item.url && item.url !== "/" && pathname.startsWith(`${item.url}/`))
    .sort((a, b) => (b.url?.length ?? 0) - (a.url?.length ?? 0))[0];

  if (parent) {
    return [{ title: parent.title, url: parent.url }, { title: "Details" }];
  }

  // The operational context has no sidebar entry by design — it is reached
  // from search or from a record, never from the nav — so the prefix match
  // above finds nothing and the header rendered EMPTY, which reads as a
  // broken page rather than a deliberate one. Named from the route itself.
  const context = /^\/context\/(person|branch)\//.exec(pathname);
  if (context) {
    return [
      { title: "Context" },
      { title: context[1] === "branch" ? "Branch" : "Person" },
    ];
  }

  return [];
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const trail = findTrail(pathname);

  if (trail.length === 0) {
    return null;
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <Fragment key={crumb.title}>
              <BreadcrumbItem>
                {isLast || !crumb.url ? (
                  <BreadcrumbPage>{crumb.title}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link href={crumb.url} />}>
                    {crumb.title}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
