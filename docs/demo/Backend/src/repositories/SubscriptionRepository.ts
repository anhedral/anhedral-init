import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { subscriptions } from '../db/schema.js';
import type { Subscriptions, NewSubscriptions } from '../db/schema.js';
import { LRUCache } from '../lib/lruCache.js';
import { invalidateAuthPluginCache } from './UserRepository.js';

const subscriptionCache = new LRUCache<Subscriptions>({ maxSize: 50_000, ttlMs: 30_000 });

export class SubscriptionRepository {
  constructor(private db: Database) {}

  async findByUserId(userId: string): Promise<Subscriptions | null> {
    const cached = subscriptionCache.get(`sub:${userId}`);
    if (cached !== undefined) return cached;
    const [row] = await this.db.select().from(subscriptions)
      .where(eq(subscriptions.userId, userId)).limit(1);
    const result = row || null;
    if (result) subscriptionCache.set(`sub:${userId}`, result);
    return result;
  }

  async createIfMissing(data: NewSubscriptions): Promise<{ subscription: Subscriptions; created: boolean }> {
    try {
      const [inserted] = await this.db.insert(subscriptions).values(data)
        .onConflictDoNothing({ target: subscriptions.userId }).returning();
      if (inserted) {
        subscriptionCache.set(`sub:${inserted.userId}`, inserted);
        return { subscription: inserted, created: true };
      }
    } catch {}
    const existing = await this.findByUserId(data.userId);
    if (existing) return { subscription: existing, created: false };
    throw new Error(`Failed to create subscription for user ${data.userId}`);
  }

  async upsert(userId: string, data: Partial<Omit<NewSubscriptions, 'id' | 'userId'>>): Promise<Subscriptions> {
    const insertData: NewSubscriptions = {
      id: crypto.randomUUID(), userId,
      tier: data.tier ?? 'free',
      status: data.status ?? 'active',
      method: data.method ?? null,
      origin: data.origin ?? null,
      billingPeriod: data.billingPeriod ?? null,
      currentPeriodStart: data.currentPeriodStart ?? null,
      currentPeriodEnd: data.currentPeriodEnd ?? null,
      canceledAt: data.canceledAt ?? null,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
      trialStart: data.trialStart ?? null,
      trialEnd: data.trialEnd ?? null,
      dailyLimit: data.dailyLimit ?? null,
      metadata: data.metadata ?? null,
    };
    const updateData = Object.fromEntries(
      Object.entries({ ...data, updatedAt: new Date() }).filter(([, v]) => v !== undefined)
    ) as Partial<Subscriptions>;
    const [row] = await this.db.insert(subscriptions).values(insertData)
      .onConflictDoUpdate({ target: subscriptions.userId, set: updateData }).returning();
    if (!row) throw new Error(`Failed to upsert subscription for user ${userId}`);
    subscriptionCache.set(`sub:${userId}`, row);
    invalidateAuthPluginCache(userId);
    return row;
  }

  async updateByUserId(userId: string, data: Partial<Subscriptions>): Promise<Subscriptions | null> {
    const [updated] = await this.db.update(subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptions.userId, userId)).returning();
    if (updated) subscriptionCache.set(`sub:${userId}`, updated);
    else subscriptionCache.invalidate(`sub:${userId}`);
    invalidateAuthPluginCache(userId);
    return updated || null;
  }

  async getOrCreate(userId: string, options?: { allowTrial?: boolean }): Promise<Subscriptions> {
    const existing = await this.findByUserId(userId);
    if (existing) return existing;
    const allowTrial = options?.allowTrial ?? true;
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const { subscription } = await this.createIfMissing(allowTrial
      ? { id: crypto.randomUUID(), userId, tier: 'pro', status: 'active', method: 'trialing', trialStart: now, trialEnd }
      : { id: crypto.randomUUID(), userId, tier: 'free', status: 'active', method: null, trialStart: null, trialEnd: null }
    );
    return subscription;
  }
}
