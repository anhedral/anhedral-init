import { ApiClient } from '@anhedral/api-client';

export class APIClient {
  constructor(private getToken: () => Promise<string | null>) {}

  private client() {
    return new ApiClient({
      baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:8787',
      getToken: this.getToken,
      platform: 'extension',
    });
  }

  getMe() {
    return this.client().getMe();
  }

  getSubscriptionEntitlements(options?: { refresh?: boolean }) {
    return this.client().getSubscriptionEntitlements(options);
  }
}
