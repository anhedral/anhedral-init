import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { createDatabase } from '@workspace/db';
export function createAuth(db: ReturnType<typeof createDatabase>['db'], secret: string, baseURL: string) {
  return betterAuth({ appName: 'Anhedral Factory', rateLimit: { enabled: true }, database: drizzleAdapter(db, { provider: 'pg' }), secret, baseURL, emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 } });
}
