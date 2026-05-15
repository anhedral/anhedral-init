import * as React from 'react';
import Purchases, { type CustomerInfo, type PurchasesOfferings } from 'react-native-purchases';
import { Purchases as PurchasesWeb } from '@revenuecat/purchases-js';
import { AppState, Platform } from 'react-native';
import { subscriptionConfig, getPlatformRevenueCatApiKey } from '@/lib/config';
import { useAuth, useUser } from '@clerk/expo';
import { useAPI } from '@/hooks/useAPI';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

export type SubscriptionState = {
  status: 'idle' | 'loading' | 'active' | 'inactive' | 'error';
  entitlementActive: boolean;
  inTrial: boolean;
  trialEndsAt?: string | null;
  expiresAt?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  method?: 'trialing' | 'redeemed' | 'paid' | null;
  managementUrl?: string | null;
  cancelAtPeriodEnd?: boolean;
  offerings?: PurchasesOfferings | null;
  lastError?: Error | null;
  pricing?: { monthly: number; yearly: number } | null;
};

interface SubscriptionContextValue extends SubscriptionState {
  refresh: () => Promise<void>;
  openPaywall: (plan?: 'monthly' | 'yearly') => Promise<void>;
}

const SubscriptionContext = React.createContext<SubscriptionContextValue | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const { user } = useUser();
  const api = useAPI();

  const [state, setState] = React.useState<SubscriptionState>({
    status: 'idle', entitlementActive: false, inTrial: false,
    periodStart: null, periodEnd: null, method: null,
  });

  const configuredRef = React.useRef<string | null>(null);
  const apiRef = React.useRef(api);
  React.useEffect(() => { apiRef.current = api; }, [api]);
  const userRef = React.useRef(user);
  React.useEffect(() => { userRef.current = user; }, [user]);
  const expiryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const inflightRef = React.useRef<Promise<unknown> | null>(null);
  const didSkipInitialVisibilityRef = React.useRef(false);

  const sleep = React.useCallback((ms: number) => new Promise<void>((r) => setTimeout(r, ms)), []);

  const loadEntitlements = React.useCallback(async (options?: { refresh?: boolean }) => {
    const forced = Boolean(options?.refresh);
    if (!forced && inflightRef.current) {
      try { return (await inflightRef.current) as Awaited<ReturnType<typeof apiRef.current.getSubscriptionEntitlements>>; } catch { return null; }
    }
    try {
      const p = apiRef.current.getSubscriptionEntitlements(options);
      if (!forced) inflightRef.current = p;
      const e = await p;
      setState(prev => ({
        ...prev,
        status: e.pro ? 'active' : 'inactive',
        entitlementActive: e.pro,
        inTrial: e.inTrial ?? false,
        trialEndsAt: e.trialEndsAt ?? null,
        expiresAt: e.expiresAt ?? null,
        periodStart: e.periodStart ?? null,
        periodEnd: e.periodEnd ?? null,
        method: e.pro ? (e.method ?? prev.method ?? null) : null,
        managementUrl: e.pro ? (e.managementUrl ?? prev.managementUrl ?? null) : null,
        cancelAtPeriodEnd: e.cancelAtPeriodEnd ?? (e.pro ? (prev.cancelAtPeriodEnd ?? false) : false),
      }));
      return e;
    } catch {
      setState(prev => ({ ...prev, status: prev.status === 'loading' ? 'inactive' : prev.status }));
      return null;
    } finally {
      if (!forced) inflightRef.current = null;
    }
  }, []);

  const loadPricingAndOfferings = React.useCallback(async () => {
    try {
      const [pricingRes, offerings] = await Promise.all([
        apiRef.current.getSubscriptionPricing(),
        Platform.OS === 'web'
          ? PurchasesWeb.getSharedInstance().getOfferings()
          : Purchases.getOfferings(),
      ]);
      const pro = pricingRes.tiers.find(t => t.tier === 'pro');
      setState(prev => ({
        ...prev,
        pricing: pro?.priceMonthly != null && pro?.priceYearly != null
          ? { monthly: pro.priceMonthly, yearly: pro.priceYearly } : prev.pricing,
        offerings: offerings as PurchasesOfferings,
      }));
    } catch (e) { console.error('[Subscription] Failed to load pricing/offerings:', e); }
  }, []);

  const refresh = React.useCallback(async () => {
    try {
      if (Platform.OS === 'web') {
        await PurchasesWeb.getSharedInstance().getCustomerInfo();
      } else {
        await Purchases.getCustomerInfo();
      }
      await loadPricingAndOfferings();
      for (let i = 0; i < 4; i++) {
        const e = await loadEntitlements({ refresh: true });
        if (e?.pro) break;
        if (i < 3) await sleep(1500);
      }
    } catch (e) { console.error('[Subscription] Refresh error:', e); }
  }, [loadEntitlements, loadPricingAndOfferings, sleep]);

  const openPaywall = React.useCallback(async (plan?: 'monthly' | 'yearly') => {
    try {
      const current = await apiRef.current.getSubscriptionEntitlements({ refresh: true });
      if (current.pro && (current.method === 'paid' || current.method === 'redeemed')) {
        setState(prev => ({ ...prev, status: 'active', entitlementActive: true, inTrial: false, expiresAt: current.expiresAt ?? prev.expiresAt ?? null, method: current.method ?? prev.method ?? null }));
        try { await userRef.current?.reload(); } catch {}
        return;
      }
      setState(prev => ({ ...prev, status: 'loading', lastError: null }));

      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        const result = await RevenueCatUI.presentPaywallIfNeeded({ requiredEntitlementIdentifier: subscriptionConfig.entitlementId });
        if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED || result === PAYWALL_RESULT.NOT_PRESENTED) {
          setState(prev => ({ ...prev, status: 'active', entitlementActive: true, inTrial: prev.inTrial ?? false }));
          await refresh();
          try { await userRef.current?.reload(); } catch {}
        } else {
          setState(prev => ({ ...prev, status: prev.entitlementActive ? 'active' : 'inactive' }));
        }
      } else {
        const offerings = await PurchasesWeb.getSharedInstance().getOfferings();
        const cur = offerings.current;
        if (!cur?.availablePackages.length) throw new Error('No offerings');
        const pkg = plan === 'monthly'
          ? (cur.monthly ?? cur.availablePackages.find(p => p.identifier.includes('month')))
          : plan === 'yearly'
            ? (cur.annual ?? cur.availablePackages.find(p => p.identifier.includes('year')))
            : cur.availablePackages[0];
        if (pkg) {
          try {
            await PurchasesWeb.getSharedInstance().purchase({ rcPackage: pkg });
          } catch (purchaseErr) {
            const pe = purchaseErr as { errorCode?: unknown; message?: unknown };
            const code = typeof pe?.errorCode === 'number' ? pe.errorCode : null;
            if (code === 6 || code === 7) {
              setState(prev => ({ ...prev, status: 'loading', lastError: null }));
              await refresh();
              try { await userRef.current?.reload(); } catch {}
              return;
            }
            throw purchaseErr;
          }
          setState(prev => ({ ...prev, status: 'active', entitlementActive: true, inTrial: prev.inTrial ?? false }));
          await refresh();
          try { await userRef.current?.reload(); } catch {}
        }
      }
    } catch (error) {
      const err = error as Error & { userCancelled?: boolean | null; code?: unknown };
      const code = typeof err.code === 'string' ? err.code : typeof err.code === 'number' ? String(err.code) : null;
      const cancelled = Boolean(err.userCancelled) || code === 'USER_CANCELLED';
      if (cancelled) {
        setState(prev => ({ ...prev, status: prev.entitlementActive ? 'active' : 'inactive' }));
      } else {
        setState(prev => ({ ...prev, status: 'error', lastError: error as Error }));
      }
    }
  }, [loadEntitlements, refresh]);

  // Auto-expire timer
  React.useEffect(() => {
    if (expiryTimerRef.current) { clearTimeout(expiryTimerRef.current); expiryTimerRef.current = null; }
    if (!userId) return;
    const until = (state.method === 'trialing' ? (state.trialEndsAt ?? state.periodEnd) : (state.expiresAt ?? state.periodEnd)) ?? null;
    if (!until) return;
    const untilMs = new Date(until).getTime();
    if (!Number.isFinite(untilMs)) return;
    const delay = Math.min(Math.max(untilMs - Date.now() + 1500, 0), 2147483647);
    if (delay <= 0) { if (state.entitlementActive) void loadEntitlements({ refresh: true }); return; }
    expiryTimerRef.current = setTimeout(() => {
      let shouldRefresh = false;
      setState(prev => {
        const prevUntil = (prev.method === 'trialing' ? (prev.trialEndsAt ?? prev.periodEnd) : (prev.expiresAt ?? prev.periodEnd)) ?? null;
        const prevMs = prevUntil ? new Date(prevUntil).getTime() : null;
        if (!prevMs || !Number.isFinite(prevMs) || prevMs > Date.now()) return prev;
        if (!prev.entitlementActive) return prev;
        shouldRefresh = true;
        if (prev.method === 'paid' || prev.method === 'redeemed') return prev;
        return { ...prev, status: 'inactive', entitlementActive: false, inTrial: false };
      });
      if (shouldRefresh) void loadEntitlements({ refresh: true });
    }, delay);
    return () => { if (expiryTimerRef.current) { clearTimeout(expiryTimerRef.current); expiryTimerRef.current = null; } };
  }, [loadEntitlements, state.entitlementActive, state.expiresAt, state.method, state.periodEnd, state.trialEndsAt, userId]);

  // Periodic refresh
  React.useEffect(() => {
    if (refreshIntervalRef.current) { clearInterval(refreshIntervalRef.current); refreshIntervalRef.current = null; }
    if (!userId || !state.entitlementActive || state.status === 'loading') return;
    const until = (state.method === 'trialing' ? (state.trialEndsAt ?? state.periodEnd) : (state.expiresAt ?? state.periodEnd)) ?? null;
    const untilMs = until ? new Date(until).getTime() : null;
    const remainingMs = untilMs != null && Number.isFinite(untilMs) ? (untilMs - Date.now()) : null;
    const intervalMs = remainingMs != null
      ? (remainingMs <= 5 * 60_000 ? 60_000 : remainingMs <= 60 * 60_000 ? 5 * 60_000 : 15 * 60_000)
      : 15 * 60_000;
    refreshIntervalRef.current = setInterval(() => { void loadEntitlements({ refresh: false }); }, intervalMs);
    return () => { if (refreshIntervalRef.current) { clearInterval(refreshIntervalRef.current); refreshIntervalRef.current = null; } };
  }, [loadEntitlements, state.entitlementActive, state.expiresAt, state.method, state.periodEnd, state.status, state.trialEndsAt, userId]);

  // Initialize RevenueCat SDK
  React.useEffect(() => {
    const key = getPlatformRevenueCatApiKey();
    if (!key || !userId || configuredRef.current === userId) return;
    configuredRef.current = userId;
    if (Platform.OS === 'web') {
      PurchasesWeb.configure({ apiKey: key, appUserId: userId });
    } else {
      Purchases.configure({ apiKey: key, appUserID: userId });
    }
    setState(prev => ({ ...prev, status: 'loading' }));
    void Promise.all([loadPricingAndOfferings(), loadEntitlements({ refresh: true })]);

    if (Platform.OS === 'web') {
      didSkipInitialVisibilityRef.current = false;
      const handleVisibility = () => {
        if (!didSkipInitialVisibilityRef.current) { didSkipInitialVisibilityRef.current = true; return; }
        if (document.visibilityState === 'visible') void loadEntitlements({ refresh: false });
      };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => document.removeEventListener('visibilitychange', handleVisibility);
    } else {
      const listener = (_: CustomerInfo) => { void loadEntitlements({ refresh: false }); };
      Purchases.addCustomerInfoUpdateListener(listener);
      const appSub = AppState.addEventListener('change', s => { if (s === 'active') void loadEntitlements({ refresh: false }); });
      return () => { Purchases.removeCustomerInfoUpdateListener(listener); appSub.remove(); };
    }
  }, [userId, loadPricingAndOfferings, loadEntitlements]);

  const value = React.useMemo(() => ({ ...state, refresh, openPaywall }), [state, refresh, openPaywall]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscriptionContext() {
  const ctx = React.useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscriptionContext must be used within SubscriptionProvider');
  return ctx;
}
