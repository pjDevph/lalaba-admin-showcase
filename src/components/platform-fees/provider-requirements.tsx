"use client";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  NON_CHARGE_CATEGORIES,
  PAYER_LABELS,
  REQUIREMENT_LABELS,
  formatPeso,
  type FeeCategory,
  type FeePayerRole,
  type PlatformFeeRule,
} from "@/lib/graphql/platform-fees";

/**
 * The wallet minimums, kept out of the fee table.
 *
 * They are configured exactly like fees and share the rule schema, but they are
 * not charges — the balance stays the provider's — so listing them alongside
 * the commissions made a page called "Platform Fees" read as six fees when
 * there are two. Here they are laid out requirement × payer, which is also the
 * comparison an admin actually makes ("is the washer threshold the same as the
 * laundromat one?") and which the flat list buried.
 */
export function ProviderRequirements({
  rules,
  canEdit,
  onEdit,
}: {
  /** Every rule; this component picks out the non-charge ones itself. */
  rules: PlatformFeeRule[];
  canEdit: boolean;
  onEdit: (rule: PlatformFeeRule) => void;
}) {
  const requirements = rules.filter((r) =>
    NON_CHARGE_CATEGORIES.includes(r.category),
  );
  if (requirements.length === 0) return null;

  // Only the payers and categories that actually have rules — an empty column
  // for Courier would imply a requirement that doesn't exist.
  const payers = (
    [...new Set(requirements.map((r) => r.appliesTo))] as FeePayerRole[]
  ).sort();
  const categories = [...new Set(requirements.map((r) => r.category))].sort(
    (a, b) =>
      NON_CHARGE_CATEGORIES.indexOf(a) - NON_CHARGE_CATEGORIES.indexOf(b),
  ) as FeeCategory[];

  const find = (category: FeeCategory, payer: FeePayerRole) =>
    requirements.find((r) => r.category === category && r.appliesTo === payer);

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-medium">Provider requirements</h2>
        <p className="text-sm text-muted-foreground">
          Minimum wallet balance a provider must hold. Not charged — the money
          stays theirs.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Requirement</TableHead>
              {payers.map((payer) => (
                <TableHead key={payer}>{PAYER_LABELS[payer]}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => (
              <TableRow key={category}>
                <TableCell className="font-medium">
                  {REQUIREMENT_LABELS[category] ?? category}
                </TableCell>
                {payers.map((payer) => {
                  const rule = find(category, payer);
                  return (
                    <TableCell key={payer}>
                      {rule ? (
                        <div className="flex items-center gap-2">
                          <span className="tabular-nums">
                            {formatPeso(rule.fixedAmountCentavos ?? 0)}
                          </span>
                          {!rule.isActive && (
                            <span className="text-xs text-muted-foreground">
                              (inactive)
                            </span>
                          )}
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onEdit(rule)}
                            >
                              Edit
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
