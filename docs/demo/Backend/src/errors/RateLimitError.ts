import { AppError } from './AppError.js';

export class RateLimitError extends AppError {
  constructor(message: string, details?: unknown) {
    super('rate_limited', 429, message, details);
  }

  static dailyLimit(resource: string, limit: number) {
    return new RateLimitError(
      `Daily ${resource} limit reached (${limit} requests per day)`,
      { resource, limit, window: '24h' }
    );
  }

  static tooManyRequests(retryAfter?: number) {
    return new RateLimitError('Too many requests. Please try again later.', { retryAfter });
  }
}
