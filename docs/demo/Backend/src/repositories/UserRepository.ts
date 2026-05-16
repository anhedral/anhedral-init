import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { users } from '../db/schema.js';
import type { NewUsers, SubscriptionStatus, SubscriptionTier } from '../db/schema.js';
import { LRUCache } from '../lib/lruCache.js';
import { subscriptions, uploads } from '../db/schema.js';

export type UserAuthData = {
  id: string;
  email: string;
  subscriptionTier?: SubscriptionTier | null;
  subscriptionStatus?: SubscriptionStatus | null;
};

const authPluginCache = new LRUCache<UserAuthData>({
  maxSize: 50_000,
  ttlMs: 60_000,
});

export function invalidateAuthPluginCache(userId: string): void {
  authPluginCache.invalidate(`auth:${userId}`);
}

export class UserRepository {
  constructor(private db: Database) {}

  async getAuthDataForPlugin(userId: string): Promise<UserAuthData | null> {
    const cached = authPluginCache.get(`auth:${userId}`);
    if (cached) return cached;

    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        subscriptionTier: subscriptions.tier,
        subscriptionStatus: subscriptions.status,
      })
      .from(users)
      .leftJoin(subscriptions, eq(users.id, subscriptions.userId))
      .where(eq(users.id, userId))
      .limit(1);

    const row = rows[0] ?? null;
    if (row) authPluginCache.set(`auth:${userId}`, row);
    return row;
  }

  async findById(userId: string) {
    const rows = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    return rows[0] ?? null;
  }

  async findByEmail(email: string) {
    const rows = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return rows[0] ?? null;
  }

  async createIfMissing(data: NewUsers): Promise<{ created: boolean }> {
    const existing = await this.findById(data.id);
    if (existing) return { created: false };
    await this.db.insert(users).values(data).onConflictDoNothing();
    return { created: true };
  }

  async getProfile(userId: string) {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        profileImageUrl: users.profileImageUrl,
        subscriptionTier: subscriptions.tier,
        subscriptionStatus: subscriptions.status,
      })
      .from(users)
      .leftJoin(subscriptions, eq(users.id, subscriptions.userId))
      .where(eq(users.id, userId))
      .limit(1);

    return rows[0] ?? null;
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
    authPluginCache.invalidate(`auth:${userId}`);
  }

  async createUploadRecord(
    userId: string,
    input: { objectKey: string; bucket: string; contentType: string | null },
  ): Promise<void> {
    await this.db.insert(uploads).values({
      id: crypto.randomUUID(),
      userId,
      objectKey: input.objectKey,
      bucket: input.bucket,
      contentType: input.contentType,
    });
  }

  async deleteById(userId: string): Promise<void> {
    await this.db.delete(users).where(eq(users.id, userId));
    authPluginCache.invalidate(`auth:${userId}`);
  }
}
