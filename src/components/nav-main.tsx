"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

export type NavMainSubItem = {
  title: string;
  url: string;
};

export type NavMainItem = {
  title: string;
  url?: string;
  icon?: React.ReactNode;
  items?: NavMainSubItem[];
};

export type NavGroup = {
  title: string;
  items: NavMainItem[];
};

// Its own component (not inlined in the .map() below) so each group can
// hold its own `useState` — hooks can't be called from inside a callback.
// `open` is a real controlled value, only *initialized* from whether a
// sub-item is active; after mount it's just a normal expand/collapse
// toggle. Passing a value that keeps changing after mount (e.g. a
// `defaultOpen` recomputed from the current pathname on every render) is
// what Base UI's Collapsible warns about — `defaultOpen` is an initial
// value, not a prop meant to be updated.
function NavMainCollapsibleItem({
  item,
  pathname,
}: {
  item: NavMainItem;
  pathname: string;
}) {
  const isSubItemActive = item.items!.some(
    (subItem) => pathname === subItem.url,
  );
  const [open, setOpen] = useState(() => isSubItemActive);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/collapsible"
      render={<SidebarMenuItem />}
    >
      <CollapsibleTrigger render={<SidebarMenuButton tooltip={item.title} />}>
        {item.icon}
        <span>{item.title}</span>
        <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-open/collapsible:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>
          {item.items!.map((subItem) => (
            <SidebarMenuSubItem key={subItem.title}>
              <SidebarMenuSubButton
                isActive={pathname === subItem.url}
                render={<Link href={subItem.url} />}
              >
                <span>{subItem.title}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

function renderNavItem(item: NavMainItem, pathname: string) {
  if (!item.items || item.items.length === 0) {
    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton
          tooltip={item.title}
          isActive={pathname === item.url}
          render={<Link href={item.url ?? "#"} />}
        >
          {item.icon}
          <span>{item.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return <NavMainCollapsibleItem key={item.title} item={item} pathname={pathname} />;
}

// `topLevelItems` renders ungrouped, above any labeled sections (just
// Dashboard today). `groups` are the role-filtered workspaces — filtering
// happens in the caller (AppSidebar), which is where the role is known.
export function NavMain({
  topLevelItems,
  groups,
}: {
  topLevelItems: NavMainItem[];
  groups: NavGroup[];
}) {
  const pathname = usePathname();

  return (
    <>
      {topLevelItems.length > 0 && (
        <SidebarGroup>
          <SidebarMenu>
            {topLevelItems.map((item) => renderNavItem(item, pathname))}
          </SidebarMenu>
        </SidebarGroup>
      )}
      {groups.map((group) => (
        <SidebarGroup key={group.title}>
          <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
          <SidebarMenu>
            {group.items.map((item) => renderNavItem(item, pathname))}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}
