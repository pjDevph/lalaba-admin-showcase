"use client";

import { useQuery } from "@tanstack/react-query";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CAMPAIGN_ACTIONS,
  CAMPAIGN_DESTINATIONS,
  type CampaignActionType,
} from "@/lib/graphql/campaigns";
import {
  derivePromoStatus,
  listPromoCodes,
  PROMO_STATUS_LABELS,
  type PromoCode,
} from "@/lib/graphql/promotions";

/**
 * Which codes are worth advertising to this audience.
 *
 * Three filters, each of which would otherwise become a customer tapping a
 * button that fails:
 *
 * - The promotions engine refuses to claim anything whose status is not
 *   `active`, so an expired or disabled code is a guaranteed error. `scheduled`
 *   IS offered — a campaign that starts next week wants next week's code, and
 *   the campaign's own start date is the thing that gates it.
 * - A code that does not target this audience's role is refused at claim time
 *   for exactly that reason.
 * - PLATFORM_FEE codes are partner incentives that the fee engine applies on
 *   its own. There is nothing for a person to claim and nothing they could
 *   spend it on.
 */
function advertisable(promos: PromoCode[], roleIds: string[]): PromoCode[] {
  return promos.filter((p) => {
    const status = derivePromoStatus(p);
    if (status !== "active" && status !== "scheduled") return false;
    if (p.scope === "PLATFORM_FEE") return false;
    return roleIds.some((r) => p.targetRoleIds.includes(r));
  });
}

export function CampaignActionField({
  audienceId,
  audienceRoleIds,
  actionType,
  promoId,
  deepLink,
  errors,
  onChange,
}: {
  audienceId: string;
  audienceRoleIds: string[];
  actionType: CampaignActionType;
  promoId: string;
  deepLink: string;
  errors: { promoId?: string; deepLink?: string };
  onChange: (patch: {
    actionType?: CampaignActionType;
    promoId?: string;
    deepLink?: string;
  }) => void;
}) {
  // Only fetched once the admin actually asks for a promo — most campaigns are
  // announcements, and the promo list is a paginated query.
  const { data, isPending, isError } = useQuery({
    queryKey: ["campaign-promo-options"],
    queryFn: () => listPromoCodes({ limit: 100, offset: 0 }),
    enabled: actionType === "PROMO",
  });

  const options = advertisable(data?.data ?? [], audienceRoleIds);
  const destinations = CAMPAIGN_DESTINATIONS[audienceId] ?? [];
  const selectedPromo = options.find((p) => p._id === promoId);

  return (
    <>
      <Field>
        <FieldLabel>When they tap it</FieldLabel>
        <RadioGroup
          value={actionType}
          onValueChange={(v) => {
            const next = v as CampaignActionType;
            // Clear the other action's payload. Leaving a stale promoId behind
            // would sit in the update mutation and re-attach itself the next
            // time someone switched back.
            onChange({
              actionType: next,
              promoId: next === "PROMO" ? promoId : "",
              deepLink: next === "DEEP_LINK" ? deepLink : "",
            });
          }}
          className="gap-2"
        >
          {CAMPAIGN_ACTIONS.map((a) => {
            const allowed = !a.audiences || a.audiences.includes(audienceId);
            return (
              <div key={a.id} className="flex items-start gap-2">
                <RadioGroupItem
                  value={a.id}
                  id={`act-${a.id}`}
                  disabled={!allowed}
                  className="mt-1"
                />
                <Label
                  htmlFor={`act-${a.id}`}
                  className={`font-normal ${allowed ? "" : "opacity-50"}`}
                >
                  <span className="block">{a.label}</span>
                  <span className="text-muted-foreground block text-xs">
                    {allowed
                      ? a.hint
                      : a.id === "PROMO"
                        ? "Not available for this audience — only the customer app can claim a voucher."
                        : "Not available for a mixed partner audience — merchants and home washers have different screens."}
                  </span>
                </Label>
              </div>
            );
          })}
        </RadioGroup>
      </Field>

      {actionType === "PROMO" && (
        <Field>
          <FieldLabel htmlFor="campaign-promo">Voucher</FieldLabel>
          {isError ? (
            <p className="text-destructive text-sm">
              Couldn&apos;t load promo codes.
            </p>
          ) : isPending ? (
            <p className="text-muted-foreground text-sm">Loading codes…</p>
          ) : options.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No promo code is currently available to this audience. Create one
              on the Promotions page first — it has to be live (or scheduled)
              and target this audience&apos;s role.
            </p>
          ) : (
            <Select
              value={promoId}
              onValueChange={(v) => v && onChange({ promoId: v as string })}
            >
              <SelectTrigger id="campaign-promo" className="w-full">
                <SelectValue>
                  {() =>
                    selectedPromo ? selectedPromo.code : "Pick a code"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {options.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    <span className="font-medium">{p.code}</span>
                    <span className="text-muted-foreground">
                      {" — "}
                      {p.description || "No description"}
                      {derivePromoStatus(p) === "scheduled"
                        ? ` (${PROMO_STATUS_LABELS.scheduled})`
                        : ""}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <FieldDescription>
            The campaign shows the artwork; this code is what actually
            discounts the order. Its own caps, minimum and expiry still apply
            at checkout.
          </FieldDescription>
          {errors.promoId && <FieldError>{errors.promoId}</FieldError>}
        </Field>
      )}

      {actionType === "DEEP_LINK" && (
        <Field>
          <FieldLabel htmlFor="campaign-destination">Destination</FieldLabel>
          {destinations.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No destinations are listed for this audience.
            </p>
          ) : (
            <Select
              value={deepLink}
              onValueChange={(v) => v && onChange({ deepLink: v as string })}
            >
              <SelectTrigger id="campaign-destination" className="w-full">
                <SelectValue>
                  {() =>
                    destinations.find((d) => d.path === deepLink)?.label ??
                    "Pick a screen"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {destinations.map((d) => (
                  <SelectItem key={d.path} value={d.path}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <FieldDescription>
            In-app screens only. A campaign never opens an external website.
          </FieldDescription>
          {errors.deepLink && <FieldError>{errors.deepLink}</FieldError>}
        </Field>
      )}
    </>
  );
}
