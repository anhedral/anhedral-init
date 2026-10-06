export const STANDARD_PRODUCTS = [
  'next', 'expo', 'electron', 'wxt', 'hono', 'neon', 'd1', 'local-data',
  'clerk', 'better-auth', 'r2', 'kv', 'realtime', 'queues', 'cron', 'workflows',
  'openai', 'ai-sdk', 'workers-ai', 'resend', 'stripe', 'revenuecat',
  'sentry', 'basin', 'posthog', 'styling',
] as const;
export type StandardProduct = typeof STANDARD_PRODUCTS[number];
