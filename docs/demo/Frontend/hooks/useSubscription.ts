import { useCallback, useState } from 'react';
import { Linking, NativeModules, Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import { useSubscriptionContext } from '@/contexts/SubscriptionProvider';
import { useAPI } from '@/hooks/useAPI';
import { APIRequestError } from '@/api/client';

export type RedeemError =
  | 'invalid_code' | 'code_expired' | 'code_fully_used' | 'already_redeemed'
  | 'redemption_failed' | 'offer_code_only' | 'offer_code_unavailable' | 'network_error';

const REDEEM_ERROR_MESSAGES: Record<RedeemError, string> = {
  invalid_code: 'This code is not valid.',
  code_expired: 'This code has expired.',
  code_fully_used: 'This code has already been used.',
  already_redeemed: 'You have already redeemed this code.',
  redemption_failed: 'Failed to redeem code. Please try again.',
  offer_code_only: 'Promo codes must be redeemed through the App Store on iOS.',
  offer_code_unavailable: 'Offer code redemption requires a development build.',
  network_error: 'Network error. Please check your connection.',
};

export function useSubscription() {
  const ctx = useSubscriptionContext();
  const api = useAPI();
  const hasNativePurchases = Platform.OS !== 'web' && Boolean((NativeModules as { RNPurchases?: unknown }).RNPurchases);

  const [redeemState, setRedeemState] = useState({
    loading: false, error: null as RedeemError | null, errorMessage: null as string | null,
    success: false, expiresAt: null as string | null,
  });

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

  const redeem = useCallback(async (code: string): Promise<boolean> => {
    setRedeemState(s => ({ ...s, loading: true, error: null, errorMessage: null, success: false, expiresAt: null }));
    if (Platform.OS === 'ios') {
      setRedeemState(s => ({ ...s, loading: false, error: 'offer_code_only', errorMessage: REDEEM_ERROR_MESSAGES.offer_code_only }));
      return false;
    }
    try {
      try { await ctx.refresh(); } catch {}
      const result = await api.redeemPromoCode(code.trim());
      await ctx.refresh();
      setRedeemState(s => ({ ...s, loading: false, success: true, expiresAt: result.expiresAt }));
      return true;
    } catch (err) {
      const errorCode = err instanceof APIRequestError
        ? (err.errorCode as RedeemError) || 'redemption_failed'
        : 'network_error';
      setRedeemState(s => ({ ...s, loading: false, error: errorCode, errorMessage: REDEEM_ERROR_MESSAGES[errorCode] || 'Unknown error' }));
      return false;
    }
  }, [api, ctx]);

  const redeemOfferCode = useCallback(async (): Promise<boolean> => {
    setRedeemState(s => ({ ...s, loading: true, error: null, errorMessage: null, success: false, expiresAt: null }));
    if (Platform.OS !== 'ios') {
      setRedeemState(s => ({ ...s, loading: false, error: 'offer_code_only', errorMessage: REDEEM_ERROR_MESSAGES.offer_code_only }));
      return false;
    }
    if (!hasNativePurchases) {
      setRedeemState(s => ({ ...s, loading: false, error: 'offer_code_unavailable', errorMessage: REDEEM_ERROR_MESSAGES.offer_code_unavailable }));
      return false;
    }
    try {
      await Purchases.presentCodeRedemptionSheet();
      try { await Purchases.syncPurchases(); } catch {}
      const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
      let refreshed: Awaited<ReturnType<typeof api.getSubscriptionEntitlements>> | null = null;
      for (let i = 0; i < 6; i++) {
        refreshed = await api.getSubscriptionEntitlements({ refresh: true });
        if (refreshed?.pro) break;
        if (i < 5) await wait(1500);
      }
      const redeemed = Boolean(refreshed?.pro) && (refreshed?.method === 'redeemed' || refreshed?.method === 'paid');
      await ctx.refresh();
      setRedeemState(s => ({ ...s, loading: false, success: redeemed }));
      return redeemed;
    } catch {
      setRedeemState(s => ({ ...s, loading: false, error: 'redemption_failed', errorMessage: REDEEM_ERROR_MESSAGES.redemption_failed }));
      return false;
    }
  }, [api, ctx, hasNativePurchases]);

  const resetRedeem = useCallback(() => {
    setRedeemState({ loading: false, error: null, errorMessage: null, success: false, expiresAt: null });
  }, []);

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
    subscribe, redeem, redeemOfferCode, resetRedeem, refresh: ctx.refresh, manageSubscription,
    redeemLoading: redeemState.loading, redeemError: redeemState.error,
    redeemErrorMessage: redeemState.errorMessage, redeemSuccess: redeemState.success,
    redeemExpiresAt: redeemState.expiresAt,
  };
}

export type { SubscriptionState } from '@/contexts/SubscriptionProvider';
