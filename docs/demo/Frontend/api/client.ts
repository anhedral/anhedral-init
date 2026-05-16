import { ApiClient, APIRequestError } from '@anhedral/api-client';

export class APIClient extends ApiClient {
  constructor(baseUrl: string, getToken: () => Promise<string | null>) {
    super({ baseUrl, getToken, platform: 'frontend' });
  }
}

export { APIRequestError };
