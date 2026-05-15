export {
  SUBSCRIPTION_TIERS, SUBSCRIPTION_STATUSES, SUBSCRIPTION_METHODS, SUBSCRIPTION_ORIGINS,
  type SubscriptionTier, type SubscriptionStatus, type SubscriptionMethod, type SubscriptionOrigin,
} from '../db/schema.js';

export const TIER_LIMITS = {
  free: { tier: 'free' as const, dailyLimit: 0 },
  pro:  { tier: 'pro'  as const, dailyLimit: null },
} as const;

export const TIER_PRICING = {
  free: { tier: 'free' as const, priceMonthly: 0,  priceYearly: 0,  currency: 'USD', displayName: 'Free', description: 'Get started for free' },
  pro:  { tier: 'pro'  as const, priceMonthly: 5,  priceYearly: 54, currency: 'USD', displayName: 'Pro',  description: 'Unlimited access' },
} as const;

export const CACHE_SECONDS = {
  SUBSCRIPTIONS_PRICING: 60,
} as const;
