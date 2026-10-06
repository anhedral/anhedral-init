import { PostHog } from 'posthog-node';
export function createAnalytics(apiKey: string, host: string) { return new PostHog(apiKey, { host }); }
