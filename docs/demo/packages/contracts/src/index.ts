import { z } from 'zod';

export const ClientPlatformSchema = z.enum(['frontend', 'extension']);
export type ClientPlatform = z.infer<typeof ClientPlatformSchema>;

export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const AuthMeResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    displayName: z.string(),
    imageUrl: z.string().url().nullable().optional(),
  }),
});
export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;

export const PricingResponseSchema = z.object({
  tiers: z.array(z.object({
    tier: z.enum(['free', 'pro']),
    displayName: z.string(),
    description: z.string(),
    priceMonthly: z.number().nullable(),
    priceYearly: z.number().nullable(),
    currency: z.string(),
    limits: z.object({
      dailyLimit: z.number().nullable(),
    }),
    paymentInfo: z.object({
      revenueCatEntitlementId: z.string(),
      revenueCatOfferingId: z.string(),
    }).optional(),
  })),
});
export type PricingResponse = z.infer<typeof PricingResponseSchema>;

export const SubscriptionEntitlementsSchema = z.object({
  pro: z.boolean(),
  inTrial: z.boolean(),
  trialEndsAt: z.string().optional(),
  expiresAt: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  method: z.enum(['trialing', 'redeemed', 'paid']).nullable().optional(),
  managementUrl: z.string().url().optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
});
export type SubscriptionEntitlements = z.infer<typeof SubscriptionEntitlementsSchema>;

export const SignOutResponseSchema = z.object({
  success: z.boolean(),
});
export type SignOutResponse = z.infer<typeof SignOutResponseSchema>;

export const CreateUploadRequestSchema = z.object({
  fileName: z.string().min(1).max(200).optional(),
  contentType: z.string().min(1).max(200),
});
export type CreateUploadRequest = z.infer<typeof CreateUploadRequestSchema>;

export const CreateUploadResponseSchema = z.object({
  objectKey: z.string(),
  uploadUrl: z.string().url(),
  expiresIn: z.number(),
  headers: z.record(z.string(), z.string()),
});
export type CreateUploadResponse = z.infer<typeof CreateUploadResponseSchema>;

export const StorageFileResponseSchema = z.object({
  objectKey: z.string(),
  downloadUrl: z.string().url(),
  expiresIn: z.number(),
});
export type StorageFileResponse = z.infer<typeof StorageFileResponseSchema>;
