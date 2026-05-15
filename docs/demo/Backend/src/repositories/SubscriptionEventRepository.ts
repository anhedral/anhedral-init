import { eq, desc, and, inArray, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import type { Database } from '../db/index.js';
import {
  subscriptionEvents,
  type SubscriptionEvents, type NewSubscriptionEvents,
  type SubscriptionEventType, type SubscriptionTier, type SubscriptionStatus,
  type SubscriptionMethod, type SubscriptionOrigin, type SubscriptionEventMetadata,
} from '../db/schema.js';

export interface RecordEventParams {
  userId: string;
  subscriptionId?: string | null;
  eventType: SubscriptionEventType;
  previousState?: { tier?: SubscriptionTier | null; status?: SubscriptionStatus | null; method?: SubscriptionMethod | null };
  newState?: { tier?: SubscriptionTier | null; status?: SubscriptionStatus | null; method?: SubscriptionMethod | null };
  revenueCatEventType?: string;
  revenueCatProductId?: string;
  origin?: SubscriptionOrigin;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  metadata?: SubscriptionEventMetadata;
}

export class SubscriptionEventRepository {
  constructor(private db: Database) {}

  async recordEvent(params: RecordEventParams): Promise<SubscriptionEvents> {
    const data: NewSubscriptionEvents = {
      id: crypto.randomUUID(),
      userId: params.userId,
      subscriptionId: params.subscriptionId ?? null,
      eventType: params.eventType,
      previousTier: params.previousState?.tier ?? null,
      previousStatus: params.previousState?.status ?? null,
      previousMethod: params.previousState?.method ?? null,
      newTier: params.newState?.tier ?? null,
      newStatus: params.newState?.status ?? null,
      newMethod: params.newState?.method ?? null,
      revenueCatEventType: params.revenueCatEventType ?? null,
      revenueCatProductId: params.revenueCatProductId ?? null,
      origin: params.origin ?? null,
      periodStart: params.periodStart ?? null,
      periodEnd: params.periodEnd ?? null,
      metadata: params.metadata ?? null,
    };
    const [event] = await this.db.insert(subscriptionEvents).values(data).returning();
    return event!;
  }

  async getEventHistory(userId: string, opts: { limit?: number; offset?: number; eventTypes?: SubscriptionEventType[] } = {}): Promise<SubscriptionEvents[]> {
    const { limit = 50, offset = 0, eventTypes } = opts;
    const conditions = [eq(subscriptionEvents.userId, userId)];
    if (eventTypes?.length) conditions.push(inArray(subscriptionEvents.eventType, eventTypes));
    return this.db.select().from(subscriptionEvents)
      .where(and(...conditions))
      .orderBy(desc(subscriptionEvents.createdAt))
      .limit(limit).offset(offset);
  }

  async getEventCountByType(userId: string): Promise<Record<string, number>> {
    const results = await this.db
      .select({ eventType: subscriptionEvents.eventType, count: sql<number>`count(*)::int` })
      .from(subscriptionEvents).where(eq(subscriptionEvents.userId, userId))
      .groupBy(subscriptionEvents.eventType);
    return results.reduce((acc, r) => { acc[r.eventType] = r.count; return acc; }, {} as Record<string, number>);
  }
}
