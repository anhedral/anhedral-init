import { eq, and, lt, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import type { Database } from '../db/index.js';
import { promoCodes, promoRedemptions } from '../db/schema.js';
import type { PromoCodes } from '../db/schema.js';

export interface ValidateCodeResult {
  valid: boolean;
  error?: string;
  promoCode?: PromoCodes;
}

export class PromoCodeRepository {
  constructor(private db: Database) {}

  async validateCode(code: string, userId: string): Promise<ValidateCodeResult> {
    const [promoCode] = await this.db.select().from(promoCodes)
      .where(eq(promoCodes.code, code.toUpperCase())).limit(1);
    if (!promoCode) return { valid: false, error: 'invalid_code' };

    const now = new Date();
    if (promoCode.expiresAt && promoCode.expiresAt < now) return { valid: false, error: 'code_expired' };
    if (promoCode.redeemedCount >= promoCode.maxRedemptions) return { valid: false, error: 'code_fully_used' };

    const [existing] = await this.db.select().from(promoRedemptions)
      .where(and(eq(promoRedemptions.promoCodeId, promoCode.id), eq(promoRedemptions.userId, userId))).limit(1);
    if (existing) return { valid: false, error: 'already_redeemed' };

    return { valid: true, promoCode };
  }

  async recordRedemption(promoCodeId: string, userId: string, entitlementExpiresAt: Date): Promise<void> {
    await this.db.insert(promoRedemptions).values({
      id: crypto.randomUUID(), promoCodeId, userId, entitlementExpiresAt,
    });
    await this.db.update(promoCodes)
      .set({ redeemedCount: sql`${promoCodes.redeemedCount} + 1` })
      .where(eq(promoCodes.id, promoCodeId));
  }

  async findExpiredRedemptions(userId: string): Promise<typeof promoRedemptions.$inferSelect[]> {
    return this.db.select().from(promoRedemptions)
      .where(and(eq(promoRedemptions.userId, userId), lt(promoRedemptions.entitlementExpiresAt, new Date())));
  }
}
