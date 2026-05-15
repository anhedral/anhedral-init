import { joinApiUrl } from '@anhedral/config';
import type { AuthMeResponse, ClientPlatform, PricingResponse, SubscriptionEntitlements } from '@anhedral/types';

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

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.options.getToken?.();
    const headers = new Headers(init.headers);
    headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json');
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
    return response.json() as Promise<T>;
  }

  getMe() {
    return this.request<AuthMeResponse>('/auth/me');
  }

  getPricing() {
    return this.request<PricingResponse>('/subscriptions/pricing');
  }

  getSubscriptionPricing() {
    return this.getPricing();
  }

  getSubscriptionEntitlements(options?: { refresh?: boolean }) {
    return this.request<SubscriptionEntitlements>(
      options?.refresh ? '/subscriptions/entitlements/me?refresh=true' : '/subscriptions/entitlements/me',
    );
  }

  redeemCode(code: string) {
    return this.request<{ ok: boolean; expiresAt: string }>('/subscriptions/redeem', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  signOut() {
    return this.request<{ success: boolean }>('/auth/signout', {
      method: 'POST',
    });
  }

  uploadAvatar(input: { base64: string; mimeType: string; fileName?: string }) {
    return this.request<{ ok: boolean; avatarUrl: string }>('/auth/avatar', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  deleteAccount() {
    return this.request<void>('/auth/account', {
      method: 'DELETE',
    });
  }
}
