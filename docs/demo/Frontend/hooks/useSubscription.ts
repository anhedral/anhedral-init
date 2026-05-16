import { useCallback } from 'react';
import { Linking, Platform } from 'react-native';
import { useSubscriptionContext } from '@/contexts/SubscriptionProvider';
import { useAPI } from '@/hooks/useAPI';

export function useSubscription() {
  const ctx = useSubscriptionContext();
  const api = useAPI();

  const accessUntilMs = (() => {
    const until = (ctx.method === 'trialing' ? (ctx.trialEndsAt ?? ctx.periodEnd) : (ctx.expiresAt ?? ctx.periodEnd)) ?? null;
    if (!until) return null;
    const t = new Date(until).getTime();
    return Number.isFinite(t) ? t : null;
  })();

  const canAccess = ctx.entitlementActive && (
    ctx.method === 'paid' || ctx.method === 'redeemed' || accessUntilMs == null || accessUntilMs > Date.now() + 1500
  );
  const isLoading = ctx.status === 'idle' || ctx.status === 'loading';
  const isPaid = ctx.method === 'paid';
  const isRedeemed = ctx.method === 'redeemed';
  const isTrial = ctx.method === 'trialing' && ctx.inTrial;
  const trialDaysRemaining = ctx.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(ctx.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const managementUrl = (() => {
    if (ctx.managementUrl) return ctx.managementUrl;
    if (!ctx.entitlementActive) return null;
    if (Platform.OS === 'ios') return 'https://apps.apple.com/account/subscriptions';
    if (Platform.OS === 'android') return 'https://play.google.com/store/account/subscriptions';
    return null;
  })();

  const subscribe = useCallback(async (plan?: 'monthly' | 'yearly') => {
    await ctx.openPaywall(plan);
  }, [ctx]);

  const manageSubscription = useCallback(async () => {
    let url: string | null = managementUrl ?? null;
    if (!url && Platform.OS === 'web' && ctx.entitlementActive) {
      try { const r = await api.getSubscriptionEntitlements({ refresh: true }); url = r.managementUrl ?? null; } catch {}
    }
    if (!url) return;
    if (Platform.OS === 'web') { window.open(url, '_blank'); return; }
    await Linking.openURL(url);
  }, [api, ctx.entitlementActive, managementUrl]);

  return {
    status: ctx.status, canAccess, isLoading, isPaid, isRedeemed, isTrial,
    inTrial: ctx.inTrial, method: ctx.method, trialEndsAt: ctx.trialEndsAt,
    trialDaysRemaining, expiresAt: ctx.expiresAt, periodStart: ctx.periodStart,
    periodEnd: ctx.periodEnd, managementUrl, cancelAtPeriodEnd: ctx.cancelAtPeriodEnd,
    pricing: ctx.pricing, offerings: ctx.offerings, lastError: ctx.lastError,
    subscribe, refresh: ctx.refresh, manageSubscription,
  };
}

export type { SubscriptionState } from '@/contexts/SubscriptionProvider';
