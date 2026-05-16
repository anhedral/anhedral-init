export type ApiEnvelope<T> = { data: T } | { error: string; message: string };
export type {
  AuthMeResponse,
  ClientPlatform,
  CreateUploadRequest,
  CreateUploadResponse,
  PricingResponse,
  SignOutResponse,
  StorageFileResponse,
  SubscriptionEntitlements,
} from '@shared/contracts';
