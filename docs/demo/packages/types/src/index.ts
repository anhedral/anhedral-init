export type ApiEnvelope<T> = { data: T } | { error: string; message: string };
export type ClientPlatform = 'frontend' | 'extension';
export type SubscriptionEntitlements = {
  pro: boolean;
  inTrial: boolean;
  trialEndsAt?: string;
  expiresAt?: string;
  periodStart?: string;
  periodEnd?: string;
  method?: 'trialing' | 'redeemed' | 'paid' | null;
  managementUrl?: string;
  cancelAtPeriodEnd?: boolean;
};
export type AuthMeResponse = {
  user: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    displayName: string;
    imageUrl?: string | null;
  };
};
export type PricingResponse = {
  tiers: Array<{
    tier: 'free' | 'pro';
    displayName: string;
    description: string;
    priceMonthly: number | null;
    priceYearly: number | null;
    currency: string;
    limits: {
      dailyLimit: number | null;
    };
    paymentInfo?: {
      revenueCatEntitlementId: string;
      revenueCatOfferingId: string;
    };
  }>;
};
