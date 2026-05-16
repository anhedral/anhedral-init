import type { ZodType } from 'zod';
import { joinApiUrl } from '@anhedral/config';
import {
  AuthMeResponseSchema,
  CreateUploadResponseSchema,
  PricingResponseSchema,
  SignOutResponseSchema,
  StorageFileResponseSchema,
  SubscriptionEntitlementsSchema,
  type AuthMeResponse,
  type ClientPlatform,
  type CreateUploadRequest,
  type CreateUploadResponse,
  type PricingResponse,
  type SignOutResponse,
  type StorageFileResponse,
  type SubscriptionEntitlements,
} from '@anhedral/contracts';

export class APIRequestError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public errorCode?: string,
  ) {
    super(message);
    this.name = 'APIRequestError';
  }
}

export type ApiClientOptions = {
  baseUrl: string;
  platform: ClientPlatform;
  getToken?: () => Promise<string | null>;
};

export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  async request<T>(path: string, init: RequestInit = {}, schema?: ZodType<T>): Promise<T> {
    const token = await this.options.getToken?.();
    const headers = new Headers(init.headers);
    if (init.body != null) {
      headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json');
    }
    headers.set('X-Platform', this.options.platform);
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(joinApiUrl(this.options.baseUrl, path), {
      ...init,
      headers,
    });

    if (!response.ok) {
      let error: { error?: string; message?: string } = {};
      try { error = await response.json(); } catch {}
      throw new APIRequestError(
        response.status,
        error.message || `API request failed: ${response.status}`,
        error.error,
      );
    }

    if (response.status === 204) return {} as T;
    const data = await response.json();
    return schema ? schema.parse(data) : data as T;
  }

  getMe() {
    return this.request<AuthMeResponse>('/auth/me', {}, AuthMeResponseSchema);
  }

  getPricing() {
    return this.request<PricingResponse>('/subscriptions/pricing', {}, PricingResponseSchema);
  }

  getSubscriptionPricing() {
    return this.getPricing();
  }

  getSubscriptionEntitlements(options?: { refresh?: boolean }) {
    return this.request<SubscriptionEntitlements>(
      options?.refresh ? '/subscriptions/entitlements/me?refresh=true' : '/subscriptions/entitlements/me',
      {},
      SubscriptionEntitlementsSchema,
    );
  }

  signOut() {
    return this.request<SignOutResponse>('/auth/signout', {
      method: 'POST',
    }, SignOutResponseSchema);
  }

  deleteAccount() {
    return this.request<void>('/auth/account', {
      method: 'DELETE',
    });
  }

  createUpload(input: CreateUploadRequest) {
    return this.request<CreateUploadResponse>('/storage/uploads', {
      method: 'POST',
      body: JSON.stringify(input),
    }, CreateUploadResponseSchema);
  }

  getStorageFile(objectKey: string) {
    return this.request<StorageFileResponse>(
      `/storage/files/${encodeURIComponent(objectKey)}`,
      {},
      StorageFileResponseSchema,
    );
  }

  deleteStorageFile(objectKey: string) {
    return this.request<void>(`/storage/files/${encodeURIComponent(objectKey)}`, {
      method: 'DELETE',
    });
  }
}
