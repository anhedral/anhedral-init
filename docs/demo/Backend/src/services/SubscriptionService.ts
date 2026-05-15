import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getRcEntitlement, invalidateRcEntitlementCache } from '../lib/revenuecat.js';
import { TIER_PRICING, TIER_LIMITS } from '../lib/constants.js';
import type { Subscriptions, SubscriptionEventType } from '../db/schema.js';
import type { RecordEventParams } from '../repositories/index.js';
import { runBackgroundTask } from '../lib/routeHelpers.js';

export interface EntitlementWithTrial {
  tier: 'free' | 'pro';
  pro: boolean;
  inTrial: boolean;
  trialEndsAt?: string;
  expiresAt?: string;
  periodStart?: string;
  periodEnd?: string;
  method?: 'trialing' | 'redeemed' | 'paid' | null;
  managementUrl?: string;
  cancelAtPeriodEnd?: boolean;
}

export class SubscriptionService {
  constructor(private fastify: FastifyInstance) {}

  private async recordEvent(req: FastifyRequest | undefined, params: RecordEventParams, label: string): Promise<void> {
    const task = this.fastify.repos.subscriptionEvents.recordEvent(params);
    if (req) { runBackgroundTask(req, task, label); return; }
    await task;
  }

  async getPricing() {
    return {
      tiers: [
        { tier: TIER_PRICING.free.tier, displayName: TIER_PRICING.free.displayName, description: TIER_PRICING.free.description, priceMonthly: TIER_PRICING.free.priceMonthly, priceYearly: TIER_PRICING.free.priceYearly, currency: TIER_PRICING.free.currency, limits: { dailyLimit: TIER_LIMITS.free.dailyLimit } },
        { tier: TIER_PRICING.pro.tier,  displayName: TIER_PRICING.pro.displayName,  description: TIER_PRICING.pro.description,  priceMonthly: TIER_PRICING.pro.priceMonthly,  priceYearly: TIER_PRICING.pro.priceYearly,  currency: TIER_PRICING.pro.currency,  limits: { dailyLimit: TIER_LIMITS.pro.dailyLimit }, paymentInfo: { revenueCatEntitlementId: this.fastify.env.RC_ENTITLEMENT_ID, revenueCatOfferingId: this.fastify.env.RC_OFFERING_ID } },
      ],
    };
  }

  private async getEntitlement(appUserId: string, opts?: { bypassCache?: boolean }) {
    const key = this.fastify.env.RC_SECRET_API_KEY;
    if (!key) throw new Error('RevenueCat not configured');
    return getRcEntitlement(appUserId, this.fastify.env.RC_ENTITLEMENT_ID || 'pro', key, { bypassCache: opts?.bypassCache });
  }

  async getEntitlementWithTrial(appUserId: string, opts?: { refreshRevenueCat?: boolean }, req?: FastifyRequest): Promise<EntitlementWithTrial> {
    const forceRefresh = opts?.refreshRevenueCat === true;
    let subscription = await this.fastify.repos.subscriptions.findByUserId(appUserId);
    if (!subscription) {
      try { subscription = await this.fastify.repos.subscriptions.getOrCreate(appUserId, { allowTrial: true }); } catch {}
    }

    const now = new Date();
    const hasRC = Boolean(this.fastify.env.RC_SECRET_API_KEY);
    const periodEndMs = subscription?.currentPeriodEnd?.getTime();
    const nearPeriodEnd = typeof periodEndMs === 'number' && periodEndMs - now.getTime() <= 12 * 60 * 60 * 1000;
    const isPaidOrRedeemed = subscription?.method === 'paid' || subscription?.method === 'redeemed';

    const shouldSyncRC = hasRC && (forceRefresh || !subscription || subscription.status !== 'active' || subscription.method === 'trialing' || nearPeriodEnd);

    let rcEnt: Awaited<ReturnType<SubscriptionService['getEntitlement']>> | null = null;
    let rcFailed = false;
    if (shouldSyncRC) {
      try { rcEnt = await this.getEntitlement(appUserId, { bypassCache: forceRefresh }); }
      catch { rcFailed = true; }
    }

    // RC says pro → trust it, sync DB
    if (rcEnt?.pro) {
      const rcEnd   = rcEnt.expiresAt   ? new Date(rcEnt.expiresAt)   : null;
      const rcStart = rcEnt.purchaseDate ? new Date(rcEnt.purchaseDate) : null;
      const method: 'paid' | 'redeemed' = subscription?.method === 'redeemed' ? 'redeemed' : 'paid';
      const cancelAtPeriodEnd = rcEnt.cancelAtPeriodEnd ?? subscription?.cancelAtPeriodEnd ?? false;
      const needsUpdate = subscription?.method !== method || subscription?.status !== 'active' || subscription?.tier !== 'pro'
        || (rcEnd && subscription?.currentPeriodEnd?.getTime() !== rcEnd.getTime())
        || (subscription?.cancelAtPeriodEnd ?? false) !== cancelAtPeriodEnd;

      if (needsUpdate) {
        const wasNotPaid = subscription?.method !== method || subscription?.status !== 'active';
        await this.fastify.repos.subscriptions.upsert(appUserId, {
          tier: 'pro', status: 'active', method, cancelAtPeriodEnd, trialStart: null, trialEnd: null,
          ...(rcStart ? { currentPeriodStart: rcStart } : {}),
          ...(rcEnd   ? { currentPeriodEnd:   rcEnd   } : {}),
        });
        if (wasNotPaid) {
          const eventType: SubscriptionEventType = subscription?.method === 'trialing' ? 'trial_converted' : 'initial_purchase';
          await this.recordEvent(req, { userId: appUserId, subscriptionId: subscription?.id, eventType, previousState: { tier: subscription?.tier, status: subscription?.status, method: subscription?.method }, newState: { tier: 'pro', status: 'active', method }, periodStart: rcStart, periodEnd: rcEnd }, eventType);
        }
      }
      return { tier: 'pro', pro: true, inTrial: false, expiresAt: rcEnt.expiresAt, periodStart: rcStart?.toISOString() ?? subscription?.currentPeriodStart?.toISOString(), periodEnd: rcEnt.expiresAt ?? subscription?.currentPeriodEnd?.toISOString(), method, managementUrl: rcEnt.managementUrl, cancelAtPeriodEnd };
    }

    // Expire paid if RC confirmed not-pro on forced refresh
    if (forceRefresh && !rcFailed && rcEnt && !rcEnt.pro && subscription?.tier === 'pro' && subscription.status === 'active' && isPaidOrRedeemed) {
      await this.expirePaidSubscription(appUserId, rcEnt.expiresAt, req);
      subscription = await this.fastify.repos.subscriptions.findByUserId(appUserId);
    }

    // Trial handling
    if (subscription?.method === 'trialing' && subscription.trialEnd) {
      if (subscription.trialEnd > now) {
        return { tier: 'pro', pro: true, inTrial: true, trialEndsAt: subscription.trialEnd.toISOString(), periodStart: subscription.trialStart?.toISOString(), periodEnd: subscription.trialEnd.toISOString(), method: 'trialing', cancelAtPeriodEnd: false };
      }
      if (subscription.status !== 'expired') {
        await this.expireTrial(appUserId, req);
        subscription = await this.fastify.repos.subscriptions.findByUserId(appUserId);
      }
    }

    // DB says active pro
    if (subscription?.tier === 'pro' && subscription.status === 'active') {
      return { tier: 'pro', pro: true, inTrial: false, expiresAt: subscription.currentPeriodEnd?.toISOString(), periodStart: subscription.currentPeriodStart?.toISOString(), periodEnd: subscription.currentPeriodEnd?.toISOString(), method: subscription.method, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd };
    }

    return { tier: 'free', pro: false, inTrial: false, periodStart: subscription?.currentPeriodStart?.toISOString() ?? subscription?.trialStart?.toISOString(), periodEnd: subscription?.currentPeriodEnd?.toISOString() ?? subscription?.trialEnd?.toISOString(), method: subscription?.method, cancelAtPeriodEnd: false };
  }

  async expireTrial(appUserId: string, req?: FastifyRequest): Promise<void> {
    const sub = await this.fastify.repos.subscriptions.findByUserId(appUserId);
    await this.fastify.repos.subscriptions.updateByUserId(appUserId, { tier: 'free', status: 'expired' });
    await this.recordEvent(req, { userId: appUserId, subscriptionId: sub?.id, eventType: 'trial_expired', previousState: { tier: sub?.tier, status: sub?.status, method: sub?.method }, newState: { tier: 'free', status: 'expired', method: sub?.method }, periodStart: sub?.trialStart, periodEnd: sub?.trialEnd }, 'trial_expired');
  }

  async expirePaidSubscription(appUserId: string, expiresAt?: string, req?: FastifyRequest): Promise<void> {
    const sub = await this.fastify.repos.subscriptions.findByUserId(appUserId);
    const expiresDate = expiresAt ? new Date(expiresAt) : sub?.currentPeriodEnd ?? null;
    await this.fastify.repos.subscriptions.updateByUserId(appUserId, { tier: 'free', status: 'expired', cancelAtPeriodEnd: false, ...(expiresDate ? { currentPeriodEnd: expiresDate } : {}) });
    await this.recordEvent(req, { userId: appUserId, subscriptionId: sub?.id, eventType: 'subscription_expired', previousState: { tier: sub?.tier, status: sub?.status, method: sub?.method }, newState: { tier: 'free', status: 'expired', method: sub?.method }, periodStart: sub?.currentPeriodStart, periodEnd: expiresDate }, 'subscription_expired');
  }

  async handleRevenueCatWebhook(event: Record<string, unknown>, req?: FastifyRequest): Promise<void> {
    const appUserId = event.app_user_id as string | undefined;
    if (!appUserId) return;

    const rcEventType   = event.type as string | undefined;
    const entitlementId = this.fastify.env.RC_ENTITLEMENT_ID || 'pro';
    const entIds        = event.entitlement_ids as unknown;
    const entIdSingle   = event.entitlement_id as string | null | undefined;
    const hasEnt = Array.isArray(entIds) ? entIds.some(x => x === entitlementId) : entIdSingle === entitlementId;

    const expirationMs = event.expiration_at_ms as number | undefined;
    const expiresAt    = typeof expirationMs === 'number' ? new Date(expirationMs) : null;
    if (expiresAt && isNaN(expiresAt.getTime())) return;

    const now      = new Date();
    const isActive = hasEnt && (expiresAt ? expiresAt > now : false);
    const tier     = isActive ? 'pro' : 'free';
    const status   = isActive ? 'active' : 'expired';
    const method   = isActive ? 'paid' : null;

    const purchasedMs  = event.purchased_at_ms as number | undefined;
    const periodStart  = typeof purchasedMs === 'number' ? new Date(purchasedMs) : null;
    const validStart   = periodStart && !isNaN(periodStart.getTime()) ? periodStart : null;
    const storeRaw     = event.store as string | undefined;
    const storeNorm    = storeRaw?.toLowerCase();
    const willRenew    = event.will_renew as boolean | undefined;
    const cancelReason = event.cancel_reason as string | undefined;
    const price        = event.price as number | undefined;
    const currency     = event.currency as string | undefined;
    const transactionId = event.transaction_id as string | undefined;
    const productId    = event.product_id as string | undefined;
    const origin       = storeNorm === 'app_store' ? 'apple' : storeNorm === 'play_store' ? 'google' : (storeNorm === 'stripe' || storeNorm === 'rc_billing') ? 'web' : undefined;

    const currentSub = await this.fastify.repos.subscriptions.findByUserId(appUserId);
    await this.fastify.repos.subscriptions.upsert(appUserId, {
      tier: tier as 'free' | 'pro', status: status as 'active' | 'expired', method,
      origin: origin as 'web' | 'apple' | 'google' | undefined,
      currentPeriodStart: validStart, currentPeriodEnd: expiresAt,
      billingPeriod: (event.period_type as string | undefined) ?? null,
      canceledAt: (rcEventType === 'CANCELLATION' || rcEventType === 'EXPIRATION') ? new Date() : null,
      cancelAtPeriodEnd: willRenew === false && isActive,
      trialStart: null, trialEnd: null,
      metadata: { ...(productId ? { revenueCatProductId: productId } : {}), ...(cancelReason ? { cancelReason } : {}), lastWebhookUpdate: new Date().toISOString() },
    });

    invalidateRcEntitlementCache(appUserId, entitlementId);

    const eventMap: Record<string, string> = {
      INITIAL_PURCHASE: 'initial_purchase', RENEWAL: 'renewal', PRODUCT_CHANGE: 'product_change',
      CANCELLATION: 'cancellation_scheduled', UNCANCELLATION: 'cancellation_unscheduled',
      EXPIRATION: 'subscription_expired', BILLING_ISSUE: 'billing_issue', BILLING_ISSUE_RESOLVED: 'billing_recovered',
    };
    const mappedType = rcEventType ? (eventMap[rcEventType] ?? (!isActive ? 'subscription_expired' : 'renewal')) : null;
    if (mappedType) {
      await this.recordEvent(req, {
        userId: appUserId, subscriptionId: currentSub?.id, eventType: mappedType as SubscriptionEventType,
        previousState: { tier: currentSub?.tier, status: currentSub?.status, method: currentSub?.method },
        newState: { tier: tier as 'free' | 'pro', status: status as 'active' | 'expired', method },
        revenueCatEventType: rcEventType, revenueCatProductId: productId,
        origin: origin as 'web' | 'apple' | 'google' | undefined,
        periodStart: validStart, periodEnd: expiresAt,
        metadata: { ...(rcEventType ? { revenueCatEventType: rcEventType } : {}), ...(productId ? { revenueCatProductId: productId } : {}), ...(storeRaw ? { store: storeRaw } : {}), ...(transactionId ? { transactionId } : {}), ...(price !== undefined && currency ? { price: { amount: price, currency } } : {}) },
      }, 'revenuecat_event');
    }
  }
}
