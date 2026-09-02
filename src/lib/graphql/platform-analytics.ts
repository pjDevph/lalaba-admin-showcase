import { graphqlFetch } from "@/lib/api-client";

/**
 * Platform-wide GMV / revenue / throughput reporting. Reads the backend's
 * `platform-analytics` module (LALABA_BE_DEV/src/platform-analytics) — NOT
 * the merchant-facing `analytics` module, which is a same-named but
 * differently-scoped module for a merchant's own POS orders. This one is
 * admin-only and platform-wide.
 */

export type ProviderType = "MERCHANT" | "WASHER";

export type PlatformAnalyticsRange = {
  from?: string;
  to?: string;
};

export type PlatformAnalyticsDayPoint = {
  date: string;
  orders: number;
  gmvCentavos: number;
};

export type PlatformProviderTypeBreakdown = {
  providerType: ProviderType;
  orders: number;
  gmvCentavos: number;
};

export type TopPlatformProvider = {
  branchId: string;
  providerName: string;
  providerType: ProviderType;
  orders: number;
  gmvCentavos: number;
};

export type PlatformOverview = {
  ordersCreated: number;
  ordersCompleted: number;
  ordersCancelled: number;
  cancellationRate: number;
  gmvCentavos: number;
  platformFeeRevenueCentavos: number;
  averageOrderValueCentavos: number;
  activeCustomers: number;
  activeProviders: number;
  daily: PlatformAnalyticsDayPoint[];
  byProviderType: PlatformProviderTypeBreakdown[];
  topProviders: TopPlatformProvider[];
};

const QUERY = `
  query PlatformOverview($range: PlatformAnalyticsRangeInput) {
    platformOverview(range: $range) {
      ordersCreated
      ordersCompleted
      ordersCancelled
      cancellationRate
      gmvCentavos
      platformFeeRevenueCentavos
      averageOrderValueCentavos
      activeCustomers
      activeProviders
      daily { date orders gmvCentavos }
      byProviderType { providerType orders gmvCentavos }
      topProviders { branchId providerName providerType orders gmvCentavos }
    }
  }
`;

export async function fetchPlatformOverview(range: PlatformAnalyticsRange) {
  const { platformOverview } = await graphqlFetch<{
    platformOverview: PlatformOverview;
  }>(QUERY, { range });
  return platformOverview;
}
