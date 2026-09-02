import { graphqlFetch } from "@/lib/api-client";

/**
 * ADMIN WALLET OVERSIGHT — mostly read-only.
 *
 * The Lalaba wallet is prepaid and consumable: providers top it up, the
 * platform consumes fees out of it, and there is no withdrawal path by design
 * (§17). There is still no payout queue. Every OTHER balance change comes
 * from one of three ledgered paths — a verified Xendit webhook, a fee
 * consumption, or a fee reversal on an abandoned order — and the variance
 * column exists to catch a balance that moved outside them.
 *
 * `adjustWalletBalance` is the one exception: a manual, fully-ledgered,
 * mandatory-reason correction for cases those three paths don't cover (e.g. a
 * platform-side billing mistake). It writes the same ledger shape every other
 * path does, so a correctly-used adjustment never shows up as variance.
 *
 * Hand-maintained mirror of LALABA_BE_DEV/src/wallets/*. This project has no
 * GraphQL codegen; keep in sync by hand.
 */

export type WalletProviderType = "MERCHANT" | "WASHER";
export type TopUpIntentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "EXPIRED";
export type WalletLedgerEntryType =
  | "TOP_UP"
  | "FEE_CONSUMPTION"
  | "FEE_REVERSAL"
  | "ADMIN_ADJUSTMENT";

export const LEDGER_TYPE_LABELS: Record<WalletLedgerEntryType, string> = {
  TOP_UP: "Top-up",
  FEE_CONSUMPTION: "Platform fee",
  FEE_REVERSAL: "Fee returned",
  ADMIN_ADJUSTMENT: "Manual adjustment",
};

export type AdminWalletRow = {
  branchId: string;
  providerType: WalletProviderType;
  name: string;
  balanceCentavos: number;
  ledgerBalanceCentavos: number;
  /** Non-zero means a balance moved outside the ledgered paths. Never ignore. */
  varianceCentavos: number;
  ledgerEntryCount: number;
  activatedAt: string | null;
  meetsAcceptMinimum: boolean;
  walletAllowsDiscovery: boolean;
  pendingTopUpCount: number;
  lastLedgerEntryAt: string | null;
};

export type AdminWalletPage = {
  data: AdminWalletRow[];
  total: number;
  /** Across every wallet, not just the current page or filter. */
  varianceCount: number;
  totalBalanceCentavos: number;
};

export type AdminWalletFilter = {
  search?: string;
  providerType?: WalletProviderType;
  varianceOnly?: boolean;
  belowAcceptMinimum?: boolean;
  notActivated?: boolean;
  limit: number;
  offset: number;
};

const WALLETS_QUERY = `
  query AdminWallets($filter: AdminWalletFilterInput) {
    adminWallets(filter: $filter) {
      data {
        branchId
        providerType
        name
        balanceCentavos
        ledgerBalanceCentavos
        varianceCentavos
        ledgerEntryCount
        activatedAt
        meetsAcceptMinimum
        walletAllowsDiscovery
        pendingTopUpCount
        lastLedgerEntryAt
      }
      total
      varianceCount
      totalBalanceCentavos
    }
  }
`;

export async function listAdminWallets(filter: AdminWalletFilter) {
  const { adminWallets } = await graphqlFetch<{
    adminWallets: AdminWalletPage;
  }>(WALLETS_QUERY, { filter });
  return adminWallets;
}

export type WalletLedgerEntry = {
  _id: string;
  branchId: string;
  type: WalletLedgerEntryType;
  /** Positive for top-ups and reversals, negative for fee consumption. */
  amountCentavos: number;
  balanceAfterCentavos: number;
  orderId: string | null;
  /** For a top-up row, the TopUpIntent id that produced it. */
  xenditReference: string | null;
  createdAt: string | null;
};

const LEDGER_QUERY = `
  query AdminWalletLedger($branchId: ID!, $limit: Int, $offset: Int) {
    adminWalletLedger(branchId: $branchId, limit: $limit, offset: $offset) {
      data {
        _id
        branchId
        type
        amountCentavos
        balanceAfterCentavos
        orderId
        xenditReference
        createdAt
      }
      total
    }
  }
`;

export async function fetchWalletLedger(
  branchId: string,
  limit = 50,
  offset = 0,
) {
  const { adminWalletLedger } = await graphqlFetch<{
    adminWalletLedger: { data: WalletLedgerEntry[]; total: number };
  }>(LEDGER_QUERY, { branchId, limit, offset });
  return adminWalletLedger;
}

export type TopUpIntent = {
  _id: string;
  branchId: string;
  amountCentavos: number;
  status: TopUpIntentStatus;
  xenditInvoiceId: string | null;
  invoiceUrl: string | null;
  resolvedAt: string | null;
  createdAt: string | null;
};

export type AdminTopUpRow = {
  intent: TopUpIntent;
  providerName: string;
  providerType: WalletProviderType;
  /**
   * False on a SUCCEEDED intent means the gateway took money that never
   * reached a wallet. Nothing else in the product surfaces this.
   */
  hasLedgerCredit: boolean;
};

export type AdminTopUpFilter = {
  branchId?: string;
  status?: TopUpIntentStatus;
  unreconciledOnly?: boolean;
  limit: number;
  offset: number;
};

const TOPUPS_QUERY = `
  query AdminTopUps($filter: AdminTopUpFilterInput) {
    adminTopUps(filter: $filter) {
      data {
        intent {
          _id
          branchId
          amountCentavos
          status
          xenditInvoiceId
          invoiceUrl
          resolvedAt
          createdAt
        }
        providerName
        providerType
        hasLedgerCredit
      }
      total
    }
  }
`;

export async function listAdminTopUps(filter: AdminTopUpFilter) {
  const { adminTopUps } = await graphqlFetch<{
    adminTopUps: { data: AdminTopUpRow[]; total: number };
  }>(TOPUPS_QUERY, { filter });
  return adminTopUps;
}

export type WalletThresholds = {
  /** ₱1,000 — reaching it once activates the wallet, permanently. */
  activationMinCentavos: number;
  /** ₱100 — below this the provider is not surfaced in discovery. */
  acceptMinCentavos: number;
};

const THRESHOLDS_QUERY = `
  query WalletThresholds {
    walletThresholds {
      activationMinCentavos
      acceptMinCentavos
    }
  }
`;

export async function fetchWalletThresholds() {
  const { walletThresholds } = await graphqlFetch<{
    walletThresholds: WalletThresholds;
  }>(THRESHOLDS_QUERY);
  return walletThresholds;
}

const ADJUST_BALANCE_MUTATION = `
  mutation AdjustWalletBalance($branchId: ID!, $deltaCentavos: Int!, $reason: String!) {
    adjustWalletBalance(branchId: $branchId, deltaCentavos: $deltaCentavos, reason: $reason) {
      _id
      branchId
      balanceCentavos
    }
  }
`;

/**
 * `deltaCentavos` is signed: positive credits, negative debits. `reason` is
 * required server-side too — this moves money, so there is no unattributed
 * version of this call.
 */
export async function adjustWalletBalance(
  branchId: string,
  deltaCentavos: number,
  reason: string,
) {
  const { adjustWalletBalance } = await graphqlFetch<{
    adjustWalletBalance: { _id: string; branchId: string; balanceCentavos: number };
  }>(ADJUST_BALANCE_MUTATION, { branchId, deltaCentavos, reason });
  return adjustWalletBalance;
}

/**
 * The financial-integrity audit: every wallet's balance recomputed from the
 * sum of its own ledger entries, and every wallet where the two disagree.
 *
 * Distinct from the `varianceCount` the wallet list already returns. That
 * number answers "are the books clean?" — this answers "by how much, in which
 * direction, and over how many entries?", which is the question you actually
 * have once the answer to the first one is no.
 *
 * It walks every wallet and aggregates the whole ledger, so it is fetched on
 * demand rather than on page load.
 */
export type WalletReconciliationRow = {
  branchId: string;
  /** Stored running balance on the wallet document. */
  walletBalanceCentavos: number;
  /** The same balance recomputed as the sum of every ledger entry. */
  ledgerBalanceCentavos: number;
  /** walletBalance − ledgerBalance. Expected: 0. */
  varianceCentavos: number;
  ledgerEntryCount: number;
};

export type WalletReconciliationReport = {
  generatedAt: string;
  walletsChecked: number;
  walletsWithVariance: number;
  /** Only wallets whose variance is non-zero — empty means clean books. */
  variances: WalletReconciliationRow[];
};

const RECONCILIATION_QUERY = `
  query WalletReconciliationReport {
    walletReconciliationReport {
      generatedAt
      walletsChecked
      walletsWithVariance
      variances {
        branchId
        walletBalanceCentavos
        ledgerBalanceCentavos
        varianceCentavos
        ledgerEntryCount
      }
    }
  }
`;

export async function fetchWalletReconciliationReport() {
  const { walletReconciliationReport } = await graphqlFetch<{
    walletReconciliationReport: WalletReconciliationReport;
  }>(RECONCILIATION_QUERY);
  return walletReconciliationReport;
}

/** Centavos → "₱1,234.50". The backend stores money in centavos everywhere. */
export function peso(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Signed variant for ledger amounts, where the direction is the point. */
export function signedPeso(centavos: number): string {
  const sign = centavos > 0 ? "+" : centavos < 0 ? "−" : "";
  return `${sign}${peso(Math.abs(centavos))}`;
}
