import type { SubscriptionTier, SubscriptionStatus } from '../db/schema.js';

export interface AppUser {
  id: string;
  subscriptionTier?: SubscriptionTier;
  subscriptionStatus?: SubscriptionStatus;
}

export interface AppEnv {
  PORT: number;
  NODE_ENV: string;
  LOG_LEVEL: string;
  ANHEDRAL_DEMO?: string | null;
  CLERK_PUBLISHABLE_KEY?: string | null;
  CLERK_SECRET_KEY?: string | null;
  FRONTEND_URL?: string | null;
  EXTENSION_ORIGINS?: string | null;
  DATABASE_URL?: string | null;
  R2_ACCOUNT_ID?: string | null;
  R2_ACCESS_KEY_ID?: string | null;
  R2_SECRET_ACCESS_KEY?: string | null;
  R2_BUCKET?: string | null;
  RC_SECRET_API_KEY: string;
  RC_WEBHOOK_SECRET: string;
  RC_ENTITLEMENT_ID: string;
  RC_OFFERING_ID: string;
}
