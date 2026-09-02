"use client";

import * as React from "react";
import {
  Building2Icon,
  CalendarClockIcon,
  ContactIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  MegaphoneIcon,
  MessageCircleIcon,
  PackageSearchIcon,
  PercentIcon,
  ImageIcon,
  TicketPercentIcon,
  TrendingUpIcon,
  GlobeIcon,
  UserXIcon,
  ReceiptTextIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ScanFaceIcon,
  ShieldCheckIcon,
  ShieldIcon,
  StarIcon,
  TagsIcon,
  UsersIcon,
  WalletIcon,
  WashingMachineIcon,
} from "lucide-react";

import { NavMain, type NavGroup, type NavMainItem } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useCan } from "@/components/can";
import { useAuth } from "@/context/auth-context";
import type { Capability } from "@/lib/capabilities";

// "Now", not "Dashboard". The word dashboard sets the expectation of a wall
// of statistics to read; this is meant to become the list of what needs an
// operator right now (Phase 2). Renaming it first means the destination is
// named before it is built, rather than a dashboard being quietly relabelled
// later.
export const dashboardItem: NavMainItem = {
  title: "Now",
  url: "/",
  icon: <LayoutDashboardIcon />,
};

type NavWorkspaceItem = NavMainItem & {
  // The capability the item's page requires. Omitted = every account that can
  // reach this panel at all sees it. This is the SAME value the page passes to
  // RequireCapability, so nav visibility and page access can no longer drift
  // apart — the old version kept a separate `roles: ["admin"]` list here and
  // repeated the decision in each page's RequireRole.
  capability?: Capability;
};

type NavWorkspace = Omit<NavGroup, "items"> & {
  items: NavWorkspaceItem[];
};

/**
 * TWO SURFACES, ONE AUTHORIZATION LAYER.
 *
 * The panel used to be grouped by the platform's data model — Operations Hub,
 * People, Finance & Settlements, Platform Config, System & Access. That reads
 * as an index of what Lalaba stores, and it left support looking at admin's
 * console with rows deleted.
 *
 * The split now follows the two jobs actually done in here, which differ in
 * tempo, risk and reversibility:
 *
 *   CONSOLE     reactive. Someone is waiting. The unit of work is a case
 *               attached to a person, and speed is the whole point.
 *   QUEUES      reactive but bulk. Work that arrives and is ground through,
 *               each with its own filtered surface — as opposed to the single
 *               top-of-queue rows that belong on Now.
 *   CONTROL     deliberate. The unit of work is a rule applied to everyone,
 *   ROOM        and the larger the blast radius the slower the interface
 *               should be. Split by what a change actually touches: the rules
 *               providers trade under, money, anything users SEE, and the
 *               panel's own administration.
 *
 * What this is NOT is a second authorization model. Every entry still names a
 * capability from capabilities.ts, the same value its page passes to
 * RequireCapability, and capability-coverage.test.ts still checks both halves
 * against the backend's guards. Which group a page sits in is an ergonomic
 * decision; who may open it is not.
 */
export const navWorkspaces: NavWorkspace[] = [
  {
    title: "Console",
    items: [
      // Named for what an operator is doing, not for the tables underneath.
      // "Inbox", not "Support": the page is a queue of tickets, and "Support"
      // was the name of a whole department applied to one screen.
      {
        title: "Inbox",
        url: "/tickets",
        icon: <LifeBuoyIcon />,
        capability: "ticket:read",
      },
      {
        title: "Orders",
        url: "/orders",
        icon: <PackageSearchIcon />,
        capability: "order:read",
      },
      {
        title: "Conversations",
        url: "/conversations",
        icon: <MessageCircleIcon />,
        capability: "chat:read",
      },
      // Every account on the platform, whatever the role. Distinct from
      // Control Room -> System -> Back-office users, which is about
      // ADMINISTERING panel accounts; this is about looking someone up.
      {
        title: "Accounts",
        url: "/accounts",
        icon: <ContactIcon />,
        capability: "account:read",
      },
      // Was "Washers", at /washers, listing merchant branches too —
      // `bookingProviders` has always returned both. The name described a
      // subset of its own contents, which is exactly the kind of thing that
      // makes an operator learn the database before they can do their job.
      //
      // Support sees it read-only: bookingProviders is ('admin', 'support'),
      // while the cap and suspend mutations behind it stay admin-only.
      {
        title: "Providers",
        url: "/providers",
        icon: <WashingMachineIcon />,
        capability: "provider:read",
      },
      // Merchant USER accounts — activate/deactivate — as opposed to the
      // bookable branches on Providers above. Two different questions about
      // the same business, and naming them apart is cheaper than explaining
      // the difference every time.
      {
        title: "Merchant accounts",
        url: "/merchants",
        icon: <Building2Icon />,
        capability: "account:read",
      },
    ],
  },
  {
    title: "Queues",
    items: [
      // Work that ARRIVES rather than being looked up, and that is worked
      // through in bulk. Deliberately its own group rather than folded into
      // Now: Now shows the top of each queue, and each of these is a surface
      // an agent sits in — Verifications alone has a claim/release model and
      // three tabs.
      //
      // "Verifications", not "KYC" — the partner-facing apps never use that
      // word either, though the backend module is still called kyc.
      {
        title: "Verifications",
        url: "/verifications",
        icon: <ShieldCheckIcon />,
        capability: "kyc:review",
      },
      // Separate from Verifications on purpose: these are already live and
      // public, so the job is spotting bad ones, not approving good ones.
      // "ID checks", not "Photos" — the work is a decision, not a gallery.
      {
        title: "Courier ID checks",
        url: "/courier-selfies",
        icon: <ScanFaceIcon />,
        capability: "courier:revoke_selfie",
      },
      {
        title: "Reviews",
        url: "/reviews",
        icon: <StarIcon />,
        capability: "review:moderate",
      },
      // The page's own doc comment calls this "Support's unpaid-money
      // queue" — built for support to chase, not an admin-only finance
      // screen, so it belongs with the queues rather than under Money.
      {
        title: "Unsettled orders",
        url: "/unsettled-orders",
        icon: <ReceiptTextIcon />,
        capability: "settlement:reinstate",
      },
      // The DSAR/compliance queue — every account in the 30-day deletion
      // grace period, plus recent cancellations and completions.
      {
        title: "Deletion requests",
        url: "/deletion-requests",
        icon: <UserXIcon />,
        capability: "compliance:read",
      },
    ],
  },
  {
    title: "Platform rules",
    items: [
      // The home-washer price list. Merchant branches price their own
      // services; washer pricing is platform-locked, so this page is the
      // only way to change it — a washer only picks which of these she
      // offers.
      {
        title: "Washer services",
        url: "/washer-services",
        icon: <TagsIcon />,
        capability: "service:manage",
      },
      // ONE record evaluated against every provider — universal defaults,
      // milestone entitlements and campaigns. A provider's own schedule
      // lives in the partner app; this page answers what she is ALLOWED to
      // do, which is a different question and must not require a
      // per-provider write.
      {
        title: "Booking policy",
        url: "/booking-policy",
        icon: <CalendarClockIcon />,
        capability: "booking_policy:manage",
      },
      // Platform-wide kill switch — blocks the Customer and/or Partner app
      // while work is in progress. A product-facing lever (what customers and
      // providers can do right now), not administration of the panel itself.
      {
        title: "Maintenance mode",
        url: "/maintenance-mode",
        icon: <ShieldAlertIcon />,
        capability: "maintenance:toggle",
      },
    ],
  },
  {
    title: "Money",
    items: [
      // Read-only oversight: the wallet is prepaid with no withdrawal path, so
      // there is nothing here that moves money — which is also why this needs
      // only wallet:read and not wallet:adjust.
      {
        title: "Wallets",
        url: "/wallets",
        icon: <WalletIcon />,
        capability: "wallet:read",
      },
      // The numbers that decide what everyone on the platform is charged —
      // a fee change is a publish-and-audit action, not a preference.
      {
        title: "Platform fees",
        url: "/platform-fees",
        icon: <PercentIcon />,
        capability: "fee:manage",
      },
      // GMV/revenue reporting across every provider — the numbers the fee
      // rules above actually produce.
      {
        title: "Reports",
        url: "/reports",
        icon: <TrendingUpIcon />,
        capability: "reports:read",
      },
    ],
  },
  {
    title: "Reach",
    items: [
      // Everything that reaches a user. Grouped by blast radius rather than
      // by department: a broadcast, a popup and a homepage edit are the same
      // KIND of act — the company speaking — and they are the changes most
      // worth slowing down.
      {
        title: "Broadcasts",
        url: "/broadcasts",
        icon: <MegaphoneIcon />,
        capability: "broadcast:send",
      },
      // A promo is money the platform gives up, which is why it needs the
      // same care as a fee. It sits here rather than under Money because an
      // admin reaches for it while thinking about a campaign.
      {
        title: "Promo codes",
        url: "/promotions",
        icon: <TicketPercentIcon />,
        capability: "promo:manage",
      },
      // The advertisement half of promotions. Next to Promo Codes because an
      // admin thinks of them together, but a separate page because a campaign
      // decides what people SEE and a promo decides what they are owed —
      // collapsing the two is how a picture change becomes a pricing change.
      {
        title: "Popup campaigns",
        url: "/campaigns",
        icon: <ImageIcon />,
        capability: "promo:manage",
      },
      // The only editable surface for lalaba-website's FAQ, service areas
      // and promo banners — that site has no CMS of its own.
      {
        title: "Website content",
        url: "/website-content",
        icon: <GlobeIcon />,
        capability: "site_content:manage",
      },
    ],
  },
  {
    title: "System",
    items: [
      // "Back-office users", not "Users" — the panel holds several hundred
      // thousand user accounts and this page administers about a dozen of
      // them. Accounts, in the Console, is the one that means everybody.
      {
        title: "Back-office users",
        url: "/users",
        icon: <UsersIcon />,
        capability: "admin_user:manage",
      },
      // "Staff permissions", not "Permissions" — this catalogue is what a
      // MERCHANT OWNER can grant their branch staff in the merchant app. It
      // has nothing to do with who can use this panel, which is the first
      // thing everyone assumes when they read the old name.
      {
        title: "Staff permissions",
        url: "/permissions",
        icon: <KeyRoundIcon />,
        capability: "admin_user:manage",
      },
      { title: "Audit logs", url: "/audit-logs", icon: <ShieldIcon />, capability: "audit:read" },
      // Security is per-ACCOUNT, not per-role: two-factor enrolment is about
      // the person signed in, so it carries no capability and everyone who
      // can reach the panel sees it. That is what makes ADMIN_MFA_REQUIRED
      // safe to switch on — the team can enrol before it is.
      {
        title: "Settings",
        icon: <SettingsIcon />,
        items: [
          { title: "Security", url: "/settings/security" },
          { title: "Themes", url: "/settings/themes" },
        ],
      },
    ],
  },
];

// Flat, ungrouped, unfiltered list of every page — used by Breadcrumbs to
// look up a title/trail for the current route regardless of role. Keep this
// in sync with navWorkspaces by construction (derived, not hand-maintained).
export const navMain: NavMainItem[] = [
  dashboardItem,
  ...navWorkspaces.flatMap((group) => group.items),
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { profile } = useAuth();
  const { can } = useCan();

  // Filter item-by-item rather than group-by-group, then drop groups that
  // emptied out. A role that holds only some of a workspace's capabilities
  // now sees exactly those pages instead of all-or-nothing.
  const visibleWorkspaces = navWorkspaces
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.capability || can(item.capability)),
    }))
    .filter((group) => group.items.length > 0);

  const user = profile
    ? {
        name: `${profile.firstName} ${profile.lastName}`,
        email: profile.email,
      }
    : { name: "", email: "" };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="cursor-default hover:bg-transparent">
              {/* The approved wordmark, not a mark plus the word re-typed.
                  The apps' own brand guidance is explicit about both halves:
                  "never re-type 'lalaba' as text", and use the white cut on
                  blue plates — which is exactly what this navy sidebar is.
                  The previous header did neither, and its "Admin Panel"
                  subtitle inherited --muted-foreground, a dark slate that
                  measured barely legible once the sidebar became navy.

                  eslint-disable: a fixed-size brand asset, not a content
                  image — next/image would round-trip it through the optimizer
                  for no gain. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/lalaba-wordmark-white.png"
                alt="Lalaba"
                className="h-7 w-auto object-contain group-data-[collapsible=icon]:hidden"
              />
              {/* Collapsed to the rail there is no room for a wordmark, so the
                  square mark stands in — the one place it belongs. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/lalaba-mark.png"
                alt="Lalaba"
                className="hidden size-6 shrink-0 object-contain group-data-[collapsible=icon]:block"
              />
              <span className="sr-only">Lalaba admin panel</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <Separator className="bg-sidebar-border" />
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain topLevelItems={[dashboardItem]} groups={visibleWorkspaces} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
