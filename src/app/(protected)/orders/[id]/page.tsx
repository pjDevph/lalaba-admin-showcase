"use client";

import { use } from "react";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { useCan } from "@/components/can";
import { OrderDetailView } from "@/components/orders/order-detail";

// One order, at its own URL.
//
// The detail used to be inline selection state on /orders, which meant an
// agent could not send a colleague the order they were both talking about,
// and a page refresh lost it. Everything about the view itself lives in
// OrderDetailView — this file is the route and its access gate.
//
// Next passes `params` as a Promise; a client component unwraps it with
// React's `use()` (see next/dist/docs/01-app/.../dynamic-routes.md).
export default function OrderDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  const { can } = useCan();

  if (!can("order:read")) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <h1 className="text-xl font-semibold">Order</h1>
        <p className="text-sm text-muted-foreground">
          You do not have access to order lookup.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Link
          href="/orders"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ChevronLeftIcon />
          All orders
        </Link>
      </div>

      <OrderDetailView orderId={id} />
    </div>
  );
}
