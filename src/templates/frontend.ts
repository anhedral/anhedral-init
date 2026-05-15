import fs from 'node:fs';
import path from 'node:path';
import { writeAnhedralLogo } from '../branding.js';
import { anhedralPrint } from '../print.js';
import { appendGitignore, writeFile, exec, execExpect, liftNestedProject } from '../util.js';
import type { ProjectOptions } from '../scaffold.js';
import { FRONTEND_ADDON_DEPENDENCIES, withVersions } from '../dependencies.js';
import { resolveToolchainChannel, resolveToolchain, toolPackageRef } from '../toolchain.js';

export async function scaffoldFrontend(root: string, { projectName, displayName, skipInstall }: ProjectOptions): Promise<void> {
  const dir = path.join(root, 'apps/frontend');
  const toolchain = resolveToolchain(resolveToolchainChannel(process.env.ANHEDRAL_TOOLCHAIN));

  anhedralPrint.section('Frontend (Expo)');

  anhedralPrint.step('Scaffolding Expo app with react-native-reusables');
  fs.mkdirSync(dir, { recursive: true });
  await execExpect(
    `pnpm dlx ${toolPackageRef('@react-native-reusables/cli', toolchain.reactNativeReusables)} init -t clerk-auth`,
    dir,
    [
      ['What is the name of your project?', projectName],
      ['Would you like to install dependencies?', 'n'],
      ['Would you like to initialize a Git repository?', 'n'],
    ],
  );
  liftNestedProject(dir, projectName);
  anhedralPrint.done('Expo app scaffolded');

  anhedralPrint.step('Installing frontend dependencies');
  patchFrontendPackageJson(dir);
  patchExpoAppConfig(dir);
  if (!skipInstall) {
    exec('pnpm install --no-frozen-lockfile', dir);
    exec('pnpm exec expo install --fix --pnpm', dir);
  }
  appendGitignore(dir, ['.env', '.env.*', '!.env.example']);
  anhedralPrint.done(skipInstall ? 'Frontend dependency manifests written' : 'Frontend dependencies installed');

  writeApiClient(dir);
  writeConfigFile(dir);
  writeApiHook(dir);
  writeAccountHook(dir);
  writeThemeToggle(dir);
  writeAppShellFiles(dir, displayName);
  writeEnvExample(dir);
  writeEnvFile(dir);
  writeVercelConfig(dir);
  writeAnhedralLogo(dir);
  writeSubscriptionProvider(dir);
  writeUseSubscription(dir);

  anhedralPrint.step('Installing Expo native packages');
  if (skipInstall) {
    anhedralPrint.info('Skipping Expo native package install (--skip-install)');
    anhedralPrint.info('Run after init: pnpm --filter ./apps/frontend exec expo install --pnpm expo-image-picker');
  } else {
    exec('pnpm exec expo install --pnpm expo-image-picker', dir);
    exec('pnpm exec expo install --fix --pnpm', dir);
  }
  anhedralPrint.done(skipInstall ? 'Expo native package install skipped' : 'Expo native packages installed');

  anhedralPrint.step('Installing RevenueCat SDKs');
  const revenueCatDependencies = withVersions({
    'react-native-purchases': FRONTEND_ADDON_DEPENDENCIES['react-native-purchases'],
    'react-native-purchases-ui': FRONTEND_ADDON_DEPENDENCIES['react-native-purchases-ui'],
    '@revenuecat/purchases-js': FRONTEND_ADDON_DEPENDENCIES['@revenuecat/purchases-js'],
  });
  if (skipInstall) {
    anhedralPrint.info(`Skipping RevenueCat SDK install (--skip-install). Run after init: pnpm --filter ./apps/frontend add ${revenueCatDependencies.join(' ')}`);
  } else {
    exec(`pnpm add ${revenueCatDependencies.join(' ')}`, dir);
  }
  anhedralPrint.done(skipInstall ? 'RevenueCat SDK install skipped' : 'Additional Expo SDKs installed');
}

function patchFrontendPackageJson(dir: string): void {
  const filePath = path.join(dir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
  };

  packageJson.dependencies = {
    ...(packageJson.dependencies ?? {}),
    '@anhedral/api-client': FRONTEND_ADDON_DEPENDENCIES['@anhedral/api-client'],
    '@clerk/clerk-expo': FRONTEND_ADDON_DEPENDENCIES['@clerk/clerk-expo'],
    'react-native-purchases': FRONTEND_ADDON_DEPENDENCIES['react-native-purchases'],
    'react-native-purchases-ui': FRONTEND_ADDON_DEPENDENCIES['react-native-purchases-ui'],
    '@revenuecat/purchases-js': FRONTEND_ADDON_DEPENDENCIES['@revenuecat/purchases-js'],
  };

  packageJson.scripts = {
    ...(packageJson.scripts ?? {}),
    build: 'pnpm typecheck && pnpm build:web',
    'build:web': 'expo export --platform web',
    typecheck: 'tsc --noEmit',
  };

  writeFile(filePath, JSON.stringify(packageJson, null, 2) + '\n');
}

function patchExpoAppConfig(dir: string): void {
  const filePath = path.join(dir, 'app.json');
  if (!fs.existsSync(filePath)) {
    return;
  }

  const appJson = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
    expo?: Record<string, unknown> & {
      web?: Record<string, unknown>;
    };
  };

  appJson.expo ??= {};
  appJson.expo.web = {
    ...(appJson.expo.web ?? {}),
    bundler: 'metro',
    output: 'static',
  };

  writeFile(filePath, JSON.stringify(appJson, null, 2) + '\n');
}

function writeApiClient(dir: string): void {
  writeFile(path.join(dir, 'api/client.ts'), `import { ApiClient, APIRequestError } from '@anhedral/api-client';

export class APIClient extends ApiClient {
  constructor(baseUrl: string, getToken: () => Promise<string | null>) {
    super({ baseUrl, getToken, platform: 'frontend' });
  }
}

export { APIRequestError };
`);

  writeFile(path.join(dir, 'api/index.ts'), `export { APIClient, APIRequestError } from './client';
`);
}

function writeConfigFile(dir: string): void {
  writeFile(path.join(dir, 'lib/config.ts'), `import { Platform } from 'react-native';

type EnvKey =
  | 'EXPO_PUBLIC_API_URL'
  | 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY'
  | 'EXPO_PUBLIC_RC_ENTITLEMENT_ID'
  | 'EXPO_PUBLIC_RC_API_KEY_IOS'
  | 'EXPO_PUBLIC_RC_API_KEY_ANDROID'
  | 'EXPO_PUBLIC_RC_WEB_API_KEY';

const envValue = (key: EnvKey): string | undefined => {
  switch (key) {
    case 'EXPO_PUBLIC_API_URL': return process.env.EXPO_PUBLIC_API_URL;
    case 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY': return process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    case 'EXPO_PUBLIC_RC_ENTITLEMENT_ID': return process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ID;
    case 'EXPO_PUBLIC_RC_API_KEY_IOS': return process.env.EXPO_PUBLIC_RC_API_KEY_IOS;
    case 'EXPO_PUBLIC_RC_API_KEY_ANDROID': return process.env.EXPO_PUBLIC_RC_API_KEY_ANDROID;
    case 'EXPO_PUBLIC_RC_WEB_API_KEY': return process.env.EXPO_PUBLIC_RC_WEB_API_KEY;
    default: return undefined;
  }
};

const requireEnv = (key: EnvKey): string => {
  const value = envValue(key);
  if (!value) throw new Error(\`Missing \${key}. Set it in your environment variables.\`);
  return value;
};

export const apiBaseUrl = requireEnv('EXPO_PUBLIC_API_URL');
export const clerkPublishableKey = requireEnv('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');

export type SubscriptionConfig = {
  entitlementId: string;
  iosApiKey: string;
  androidApiKey: string;
  webApiKey: string;
};

export const subscriptionConfig: SubscriptionConfig = {
  entitlementId: requireEnv('EXPO_PUBLIC_RC_ENTITLEMENT_ID'),
  iosApiKey: requireEnv('EXPO_PUBLIC_RC_API_KEY_IOS'),
  androidApiKey: requireEnv('EXPO_PUBLIC_RC_API_KEY_ANDROID'),
  webApiKey: requireEnv('EXPO_PUBLIC_RC_WEB_API_KEY'),
};

export function getPlatformRevenueCatApiKey(): string {
  if (Platform.OS === 'ios') return subscriptionConfig.iosApiKey;
  if (Platform.OS === 'android') return subscriptionConfig.androidApiKey;
  if (Platform.OS === 'web') return subscriptionConfig.webApiKey;
  throw new Error(\`Unsupported platform: \${Platform.OS}\`);
}
`);
}

function writeApiHook(dir: string): void {
  writeFile(path.join(dir, 'hooks/useAPI.ts'), `import { useAuth } from '@clerk/clerk-expo';
import { useMemo } from 'react';
import { APIClient } from '@/api/client';
import { apiBaseUrl } from '@/lib/config';

export function useAPI() {
  const { getToken } = useAuth();
  return useMemo(() => new APIClient(apiBaseUrl, getToken), [getToken]);
}
`);
}

function writeVercelConfig(dir: string): void {
  writeFile(path.join(dir, 'vercel.json'), JSON.stringify({
    $schema: 'https://openapi.vercel.sh/vercel.json',
    buildCommand: 'pnpm build:web',
    outputDirectory: 'dist',
    devCommand: 'pnpm dev',
    cleanUrls: true,
    framework: null,
    rewrites: [
      {
        source: '/:path*',
        destination: '/index.html',
      },
    ],
  }, null, 2) + '\n');
}

function writeAccountHook(dir: string): void {
  writeFile(path.join(dir, 'hooks/useAccount.ts'), `import { useAuth } from '@clerk/clerk-expo';
import * as React from 'react';
import { useAPI } from '@/hooks/useAPI';

export type AccountSummary = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName: string;
  imageUrl?: string | null;
  avatarUrl?: string | null;
  creditsBalance: number;
  subscriptionTier: string;
  subscriptionStatus: string;
};

export function useAccount() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useAPI();
  const [account, setAccount] = React.useState<AccountSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!isLoaded || !isSignedIn) {
      setAccount(null);
      setLoading(false);
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.getMe();
      setAccount(response.user);
      return response.user;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load account');
      return null;
    } finally {
      setLoading(false);
    }
  }, [api, isLoaded, isSignedIn]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const uploadAvatar = React.useCallback(async (input: {
    base64: string;
    mimeType: string;
    fileName?: string;
  }) => {
    const response = await api.uploadAvatar(input);
    setAccount((prev) => prev ? { ...prev, avatarUrl: response.avatarUrl } : prev);
    return response;
  }, [api]);

  return {
    account,
    loading,
    error,
    refresh,
    uploadAvatar,
  };
}
`);
}

function writeThemeToggle(dir: string): void {
  writeFile(path.join(dir, 'components/theme-toggle.tsx'), `import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { MoonStarIcon, SunIcon } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';

const THEME_ICONS = {
  light: SunIcon,
  dark: MoonStarIcon,
};

export function ThemeToggle() {
  const { colorScheme, toggleColorScheme } = useColorScheme();

  return (
    <Button onPress={toggleColorScheme} size="icon" variant="ghost" className="rounded-full">
      <Icon as={THEME_ICONS[colorScheme ?? 'light']} className="size-6" />
    </Button>
  );
}
`);
}

function writeSubscriptionProvider(dir: string): void {
  writeFile(path.join(dir, 'contexts/SubscriptionProvider.tsx'), `import * as React from 'react';
import Purchases, { type CustomerInfo, type PurchasesOfferings } from 'react-native-purchases';
import { Purchases as PurchasesWeb } from '@revenuecat/purchases-js';
import { AppState, Platform } from 'react-native';
import { subscriptionConfig, getPlatformRevenueCatApiKey } from '@/lib/config';
import { useAuth, useUser } from '@clerk/clerk-expo';
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
`);
}

function writeUseSubscription(dir: string): void {
  writeFile(path.join(dir, 'hooks/useSubscription.ts'), `import { useCallback, useState } from 'react';
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
`);
}

function writeAppShellFiles(dir: string, displayName: string): void {
  writeFile(path.join(dir, 'app/_layout.tsx'), `import '@/global.css';

import { SubscriptionProvider } from '@/contexts/SubscriptionProvider';
import { NAV_THEME } from '@/lib/theme';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { ThemeProvider } from '@react-navigation/native';
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import * as React from 'react';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  return (
    <ClerkProvider tokenCache={tokenCache}>
      <ThemeProvider value={NAV_THEME[colorScheme ?? 'light']}>
        <SubscriptionProvider>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          <Routes />
          <PortalHost />
        </SubscriptionProvider>
      </ThemeProvider>
    </ClerkProvider>
  );
}

SplashScreen.preventAutoHideAsync();

function Routes() {
  const { isSignedIn, isLoaded } = useAuth();

  React.useEffect(() => {
    if (isLoaded) {
      SplashScreen.hideAsync();
    }
  }, [isLoaded]);

  if (!isLoaded) {
    return null;
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />

      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="(auth)/sign-in" options={{ headerShown: false, title: 'Sign in' }} />
        <Stack.Screen name="(auth)/sign-up" options={{ presentation: 'modal', title: '', headerTransparent: true, gestureEnabled: false }} />
        <Stack.Screen name="(auth)/reset-password" options={{ title: '', headerShadowVisible: false, headerTransparent: true }} />
        <Stack.Screen name="(auth)/forgot-password" options={{ title: '', headerShadowVisible: false, headerTransparent: true }} />
      </Stack.Protected>

      <Stack.Protected guard={isSignedIn}>
        <Stack.Screen name="(app)/dashboard" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
`);

  writeFile(path.join(dir, 'app/index.tsx'), `import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useAuth } from '@clerk/clerk-expo';
import { Link } from 'expo-router';
import { CloudIcon, CreditCardIcon, ShieldCheckIcon, DatabaseIcon } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';

const FEATURES = [
  {
    title: 'Landing page here',
    description: 'Replace this placeholder copy with the actual acquisition story for your Expo app.',
    icon: CloudIcon,
  },
  {
    title: 'Clerk custom auth',
    description: 'Custom sign-in and sign-up screens are already wired into the Expo starter.',
    icon: ShieldCheckIcon,
  },
  {
    title: 'RevenueCat subscriptions',
    description: 'The signed-in shell already knows how to open a RevenueCat paywall and management flow.',
    icon: CreditCardIcon,
  },
  {
    title: 'Neon + Drizzle + R2',
    description: 'Backend routes for profile data, credits, and avatar upload are scaffolded for you.',
    icon: DatabaseIcon,
  },
];

export default function LandingScreen() {
  const { isSignedIn } = useAuth();

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="min-h-full px-4 pb-10 pt-6 sm:px-6">
      <View className="mx-auto flex w-full max-w-5xl gap-6">
        <View className="flex-row items-center justify-between rounded-[28px] border border-border/70 bg-card px-4 py-3">
          <View>
            <Text className="text-xs uppercase tracking-[3px] text-muted-foreground">anhedral crossplatform</Text>
            <Text className="mt-1 text-lg font-semibold">${displayName}</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <ThemeToggle />
            {isSignedIn ? (
              <Link href="/(app)/dashboard" asChild>
                <Button size="sm">
                  <Text>Open dashboard</Text>
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/(auth)/sign-in" asChild>
                  <Button size="sm" variant="ghost">
                    <Text>Sign in</Text>
                  </Button>
                </Link>
                <Link href="/(auth)/sign-up" asChild>
                  <Button size="sm">
                    <Text>Get started</Text>
                  </Button>
                </Link>
              </>
            )}
          </View>
        </View>

        <Card className="rounded-[32px] border-border/70 bg-card">
          <CardHeader className="gap-4 px-6 pt-8 sm:px-8">
            <Text className="text-xs uppercase tracking-[3px] text-muted-foreground">Starter shell</Text>
            <CardTitle className="text-left text-4xl leading-tight sm:text-5xl">
              Landing page here. Replace the story, keep the plumbing.
            </CardTitle>
            <CardDescription className="max-w-3xl text-base leading-7">
              This crossplatform starter already gives you a real auth flow, a protected dashboard, RevenueCat subscription plumbing, seeded credits, and avatar upload to R2.
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-3 px-6 pb-8 sm:px-8">
            {isSignedIn ? (
              <Link href="/(app)/dashboard" asChild>
                <Button className="self-start">
                  <Text>Continue to the app</Text>
                </Button>
              </Link>
            ) : (
              <Link href="/(auth)/sign-up" asChild>
                <Button className="self-start">
                  <Text>Create an account</Text>
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>

        <View className="gap-3 sm:flex-row sm:flex-wrap">
          {FEATURES.map(({ title, description, icon: Icon }) => (
            <Card key={title} className="flex-1 rounded-[24px] border-border/70 bg-card sm:min-w-[240px]">
              <CardHeader className="px-5 pt-5">
                <View className="mb-2 size-11 items-center justify-center rounded-2xl bg-muted">
                  <Icon size={20} color="currentColor" />
                </View>
                <CardTitle className="text-left text-xl">{title}</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <Text className="text-sm leading-6 text-muted-foreground">{description}</Text>
              </CardContent>
            </Card>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
`);

  writeFile(path.join(dir, 'app/(app)/dashboard.tsx'), `import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/user-menu';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useAccount } from '@/hooks/useAccount';
import { useSubscription } from '@/hooks/useSubscription';
import { Stack } from 'expo-router';
import { CoinsIcon, CreditCardIcon, HardDriveUploadIcon, SparklesIcon } from 'lucide-react-native';
import * as React from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

export default function DashboardScreen() {
  const { account, loading, error, refresh } = useAccount();
  const subscription = useSubscription();

  const subscriptionLabel = React.useMemo(() => {
    if (subscription.isPaid) return 'RevenueCat Pro';
    if (subscription.isTrial) return \`Trial • \${subscription.trialDaysRemaining} days left\`;
    if (subscription.isRedeemed) return 'Promo access';
    if (subscription.canAccess) return 'Access active';
    return 'Free';
  }, [subscription.canAccess, subscription.isPaid, subscription.isRedeemed, subscription.isTrial, subscription.trialDaysRemaining]);

  const subscriptionStatus = React.useMemo(() => {
    if (subscription.isPaid || subscription.isRedeemed) {
      return subscription.cancelAtPeriodEnd ? 'Cancels at period end' : 'Active';
    }
    if (subscription.isTrial) return 'Trialing';
    return 'Setup required';
  }, [subscription.cancelAtPeriodEnd, subscription.isPaid, subscription.isRedeemed, subscription.isTrial]);

  const runSubscriptionAction = React.useCallback(async () => {
    if (subscription.managementUrl) {
      await subscription.manageSubscription();
      return;
    }

    await subscription.subscribe('monthly');
  }, [subscription]);

  return (
    <>
      <Stack.Screen
        options={{
          header: () => (
            <View className="top-safe flex-row items-center justify-between bg-background px-4 py-3">
              <ThemeToggle />
              <UserMenu />
            </View>
          ),
        }}
      />

      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="px-4 pb-10 pt-4 sm:px-6"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}>
        <View className="mx-auto w-full max-w-5xl gap-4">
          <Card className="rounded-[28px] border-border/70 bg-card">
            <CardHeader className="gap-4 px-6 pt-8 sm:px-8">
              <View className="flex-row items-center gap-2">
                <SparklesIcon size={18} color="currentColor" />
                <Text className="text-xs uppercase tracking-[3px] text-muted-foreground">Signed-in shell</Text>
              </View>
              <CardTitle className="text-left text-4xl leading-tight">
                {account?.displayName ? \`Make \${account.displayName} yours.\` : 'Make this app yours.'}
              </CardTitle>
              <CardDescription className="max-w-3xl text-base leading-7">
                This screen is the production starter: subscription state, credits, and avatar upload are already in place so your team can move straight to product work.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-row flex-wrap gap-3 px-6 pb-8 sm:px-8">
              <Button onPress={() => void runSubscriptionAction()}>
                <Text>{subscription.managementUrl ? 'Manage subscription' : 'Unlock pro'}</Text>
              </Button>
              <Button variant="outline" onPress={() => void refresh()}>
                <Text>Refresh profile</Text>
              </Button>
            </CardContent>
          </Card>

          <View className="gap-3 sm:flex-row sm:flex-wrap">
            <Card className="flex-1 rounded-[24px] border-border/70 bg-card sm:min-w-[240px]">
              <CardHeader className="px-5 pt-5">
                <View className="mb-2 size-11 items-center justify-center rounded-2xl bg-muted">
                  <CreditCardIcon size={20} color="currentColor" />
                </View>
                <CardTitle className="text-left text-xl">{subscriptionLabel}</CardTitle>
              </CardHeader>
              <CardContent className="gap-2 px-5 pb-5">
                <Text className="text-sm text-muted-foreground">{subscriptionStatus}</Text>
                {subscription.expiresAt ? (
                  <Text className="text-sm text-muted-foreground">Access until {new Date(subscription.expiresAt).toLocaleDateString()}</Text>
                ) : null}
              </CardContent>
            </Card>

            <Card className="flex-1 rounded-[24px] border-border/70 bg-card sm:min-w-[240px]">
              <CardHeader className="px-5 pt-5">
                <View className="mb-2 size-11 items-center justify-center rounded-2xl bg-muted">
                  <CoinsIcon size={20} color="currentColor" />
                </View>
                <CardTitle className="text-left text-xl">{account?.creditsBalance ?? 250} credits</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <Text className="text-sm leading-6 text-muted-foreground">
                  Credits are seeded in the backend user record so you can connect real usage accounting later without redesigning the shell.
                </Text>
              </CardContent>
            </Card>

            <Card className="flex-1 rounded-[24px] border-border/70 bg-card sm:min-w-[240px]">
              <CardHeader className="px-5 pt-5">
                <View className="mb-2 size-11 items-center justify-center rounded-2xl bg-muted">
                  <HardDriveUploadIcon size={20} color="currentColor" />
                </View>
                <CardTitle className="text-left text-xl">Avatar upload</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <Text className="text-sm leading-6 text-muted-foreground">
                  The header menu uploads profile photos into R2 and swaps the avatar immediately when the upload returns.
                </Text>
              </CardContent>
            </Card>
          </View>

          {error ? (
            <Card className="rounded-[24px] border-amber-300/60 bg-amber-50 dark:bg-amber-500/10">
              <CardContent className="px-5 py-5">
                <Text className="text-sm leading-6 text-amber-900 dark:text-amber-100">
                  Backend profile data is not ready yet: {error}
                </Text>
              </CardContent>
            </Card>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}
`);

  writeFile(path.join(dir, 'app/(auth)/sign-in.tsx'), `import { SignInForm } from '@/components/sign-in-form';
import { ThemeToggle } from '@/components/theme-toggle';
import { Text } from '@/components/ui/text';
import { Link } from 'expo-router';
import { ScrollView, View } from 'react-native';

export default function SignInScreen() {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="min-h-full bg-background px-4 pb-10 pt-6 sm:px-6"
      keyboardDismissMode="interactive">
      <View className="mx-auto w-full max-w-5xl gap-6">
        <View className="flex-row items-center justify-between rounded-[28px] border border-border/70 bg-card px-4 py-3">
          <View>
            <Text className="text-xs uppercase tracking-[3px] text-muted-foreground">Clerk custom auth</Text>
            <Text className="mt-1 text-lg font-semibold">${displayName}</Text>
          </View>
          <ThemeToggle />
        </View>

        <View className="gap-4 sm:flex-row">
          <View className="flex-1 rounded-[28px] border border-border/70 bg-card px-6 py-8">
            <Text className="text-xs uppercase tracking-[3px] text-muted-foreground">Sign in</Text>
            <Text className="mt-4 text-4xl font-semibold leading-tight">Return to the app shell without rebuilding auth from scratch.</Text>
            <Text className="mt-4 text-base leading-7 text-muted-foreground">
              The starter already connects Clerk, RevenueCat subscription state, credits, and R2 avatar upload. This screen is here so your team starts from a real flow instead of a blank form.
            </Text>
            <Link href="/" className="mt-6 text-sm underline underline-offset-4">
              Back to landing
            </Link>
          </View>

          <View className="w-full sm:max-w-md">
            <SignInForm />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
`);

  writeFile(path.join(dir, 'app/(auth)/sign-up/index.tsx'), `import { SignUpForm } from '@/components/sign-up-form';
import { ThemeToggle } from '@/components/theme-toggle';
import { Text } from '@/components/ui/text';
import { ScrollView, View } from 'react-native';

export default function SignUpScreen() {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="min-h-full bg-background px-4 pb-10 pt-6 sm:px-6"
      keyboardDismissMode="interactive">
      <View className="mx-auto w-full max-w-5xl gap-6">
        <View className="flex-row items-center justify-between rounded-[28px] border border-border/70 bg-card px-4 py-3">
          <View>
            <Text className="text-xs uppercase tracking-[3px] text-muted-foreground">Starter onboarding</Text>
            <Text className="mt-1 text-lg font-semibold">${displayName}</Text>
          </View>
          <ThemeToggle />
        </View>

        <View className="gap-4 sm:flex-row">
          <View className="w-full sm:max-w-md sm:order-2">
            <SignUpForm />
          </View>

          <View className="flex-1 rounded-[28px] border border-border/70 bg-card px-6 py-8 sm:order-1">
            <Text className="text-xs uppercase tracking-[3px] text-muted-foreground">Create account</Text>
            <Text className="mt-4 text-4xl font-semibold leading-tight">Get users into the signed-in product shell immediately.</Text>
            <Text className="mt-4 text-base leading-7 text-muted-foreground">
              New accounts land in a dashboard that already exposes RevenueCat subscription state, credits, and an R2 avatar flow.
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
`);

  writeFile(path.join(dir, 'components/sign-in-form.tsx'), `import { SocialConnections } from '@/components/social-connections';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { useSignIn } from '@clerk/clerk-expo';
import { Link } from 'expo-router';
import * as React from 'react';
import { type TextInput, View } from 'react-native';

export function SignInForm() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const passwordInputRef = React.useRef<TextInput>(null);
  const [error, setError] = React.useState<{ email?: string; password?: string }>({});

  async function onSubmit() {
    if (!isLoaded) return;

    try {
      const signInAttempt = await signIn.create({
        identifier: email,
        password,
      });

      if (signInAttempt.status === 'complete') {
        setError({ email: '', password: '' });
        await setActive({ session: signInAttempt.createdSessionId });
        return;
      }
    } catch (err) {
      if (err instanceof Error) {
        const message = err.message;
        const isEmailMessage = message.toLowerCase().includes('identifier') || message.toLowerCase().includes('email');
        setError(isEmailMessage ? { email: message } : { password: message });
      }
    }
  }

  return (
    <View className="gap-6">
      <Card className="rounded-[28px] border-border/70 bg-card shadow-sm shadow-black/5">
        <CardHeader className="px-6 pt-8">
          <CardTitle className="text-center text-2xl sm:text-left">Sign in to keep building</CardTitle>
          <CardDescription className="text-center sm:text-left">
            Use your existing account to return to the starter dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-6 px-6 pb-8">
          <View className="gap-4">
            <View className="gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                placeholder="you@example.com"
                keyboardType="email-address"
                autoComplete="email"
                autoCapitalize="none"
                onChangeText={setEmail}
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                returnKeyType="next"
                submitBehavior="submit"
              />
              {error.email ? <Text className="text-sm font-medium text-destructive">{error.email}</Text> : null}
            </View>

            <View className="gap-1.5">
              <View className="flex-row items-center">
                <Label htmlFor="password">Password</Label>
                <Link asChild href={\`/(auth)/forgot-password?email=\${email}\`}>
                  <Button variant="link" size="sm" className="ml-auto h-4 px-1 py-0 web:h-fit sm:h-4">
                    <Text className="font-normal leading-4">Forgot password?</Text>
                  </Button>
                </Link>
              </View>
              <Input
                ref={passwordInputRef}
                id="password"
                secureTextEntry
                onChangeText={setPassword}
                returnKeyType="send"
                onSubmitEditing={onSubmit}
              />
              {error.password ? <Text className="text-sm font-medium text-destructive">{error.password}</Text> : null}
            </View>

            <Button className="w-full" onPress={onSubmit}>
              <Text>Continue</Text>
            </Button>
          </View>

          <Text className="text-center text-sm">
            Don&apos;t have an account?{' '}
            <Link href="/(auth)/sign-up" className="text-sm underline underline-offset-4">
              Sign up
            </Link>
          </Text>

          <View className="flex-row items-center">
            <Separator className="flex-1" />
            <Text className="px-4 text-sm text-muted-foreground">or</Text>
            <Separator className="flex-1" />
          </View>

          <SocialConnections />
        </CardContent>
      </Card>
    </View>
  );
}
`);

  writeFile(path.join(dir, 'components/sign-up-form.tsx'), `import { SocialConnections } from '@/components/social-connections';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { useSignUp } from '@clerk/clerk-expo';
import { Link, router } from 'expo-router';
import * as React from 'react';
import { TextInput, View } from 'react-native';

export function SignUpForm() {
  const { signUp, isLoaded } = useSignUp();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const passwordInputRef = React.useRef<TextInput>(null);
  const [error, setError] = React.useState<{ email?: string; password?: string }>({});

  async function onSubmit() {
    if (!isLoaded) return;

    try {
      await signUp.create({
        emailAddress: email,
        password,
      });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      router.push(\`/(auth)/sign-up/verify-email?email=\${email}\`);
    } catch (err) {
      if (err instanceof Error) {
        const message = err.message;
        const isEmailMessage = message.toLowerCase().includes('identifier') || message.toLowerCase().includes('email');
        setError(isEmailMessage ? { email: message } : { password: message });
      }
    }
  }

  return (
    <View className="gap-6">
      <Card className="rounded-[28px] border-border/70 bg-card shadow-sm shadow-black/5">
        <CardHeader className="px-6 pt-8">
          <CardTitle className="text-center text-2xl sm:text-left">Create your account</CardTitle>
          <CardDescription className="text-center sm:text-left">
            Start with a real signed-in shell instead of another empty Expo project.
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-6 px-6 pb-8">
          <View className="gap-4">
            <View className="gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                placeholder="you@example.com"
                keyboardType="email-address"
                autoComplete="email"
                autoCapitalize="none"
                onChangeText={setEmail}
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                returnKeyType="next"
                submitBehavior="submit"
              />
              {error.email ? <Text className="text-sm font-medium text-destructive">{error.email}</Text> : null}
            </View>

            <View className="gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                ref={passwordInputRef}
                id="password"
                secureTextEntry
                onChangeText={setPassword}
                returnKeyType="send"
                onSubmitEditing={onSubmit}
              />
              {error.password ? <Text className="text-sm font-medium text-destructive">{error.password}</Text> : null}
            </View>

            <Button className="w-full" onPress={onSubmit}>
              <Text>Continue</Text>
            </Button>
          </View>

          <Text className="text-center text-sm">
            Already have an account?{' '}
            <Link href="/(auth)/sign-in" dismissTo className="text-sm underline underline-offset-4">
              Sign in
            </Link>
          </Text>

          <View className="flex-row items-center">
            <Separator className="flex-1" />
            <Text className="px-4 text-sm text-muted-foreground">or</Text>
            <Separator className="flex-1" />
          </View>

          <SocialConnections />
        </CardContent>
      </Card>
    </View>
  );
}
`);

  writeFile(path.join(dir, 'components/user-menu.tsx'), `import * as ImagePicker from 'expo-image-picker';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Text } from '@/components/ui/text';
import { useAccount } from '@/hooks/useAccount';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@clerk/clerk-expo';
import type { TriggerRef } from '@rn-primitives/popover';
import { CameraIcon, CreditCardIcon, CoinsIcon, LoaderCircleIcon, LogOutIcon } from 'lucide-react-native';
import * as React from 'react';
import { Alert, Platform, View } from 'react-native';

function showNotice(title: string, message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(\`\${title}\\n\\n\${message}\`);
    return;
  }

  Alert.alert(title, message);
}

export function UserMenu() {
  const { signOut } = useAuth();
  const { account, refresh, uploadAvatar } = useAccount();
  const subscription = useSubscription();
  const popoverTriggerRef = React.useRef<TriggerRef>(null);
  const [uploading, setUploading] = React.useState(false);

  const subscriptionLabel = subscription.isPaid
    ? 'RevenueCat Pro'
    : subscription.isTrial
      ? 'Trial'
      : subscription.isRedeemed
        ? 'Promo'
        : 'Free';

  async function onSignOut() {
    popoverTriggerRef.current?.close();
    await signOut();
  }

  async function onUploadAvatar() {
    popoverTriggerRef.current?.close();
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showNotice('Permission required', 'Allow photo library access to upload an avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      base64: true,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    if (!asset.base64) {
      showNotice('Upload failed', 'Could not read the selected image.');
      return;
    }

    setUploading(true);
    try {
      await uploadAvatar({
        base64: asset.base64,
        mimeType: asset.mimeType ?? 'image/jpeg',
        fileName: asset.fileName ?? 'avatar.jpg',
      });
      await refresh();
      showNotice('Avatar updated', 'Your profile photo is now stored in R2.');
    } catch (err) {
      showNotice('Upload failed', err instanceof Error ? err.message : 'Avatar upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function onSubscriptionAction() {
    popoverTriggerRef.current?.close();
    if (subscription.managementUrl) {
      await subscription.manageSubscription();
      return;
    }

    await subscription.subscribe('monthly');
  }

  const avatarSource = account?.avatarUrl || account?.imageUrl;
  const userName = account?.displayName || account?.email || 'Builder';
  const initials = userName
    .split(' ')
    .map((name) => name[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Popover>
      <PopoverTrigger asChild ref={popoverTriggerRef}>
        <Button variant="ghost" size="icon" className="size-9 rounded-full">
          <Avatar className="size-9" alt={userName}>
            <AvatarImage source={avatarSource ? { uri: avatarSource } : undefined} />
            <AvatarFallback>
              <Text>{initials}</Text>
            </AvatarFallback>
          </Avatar>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" side="bottom" className="w-80 gap-0 p-0">
        <View className="gap-4 border-b border-border p-4">
          <View className="flex-row items-center gap-3">
            <Avatar className="size-12" alt={userName}>
              <AvatarImage source={avatarSource ? { uri: avatarSource } : undefined} />
              <AvatarFallback>
                <Text>{initials}</Text>
              </AvatarFallback>
            </Avatar>
            <View className="flex-1">
              <Text className="font-medium leading-5">{userName}</Text>
              <Text className="text-sm text-muted-foreground">{account?.email ?? 'Loading account...'}</Text>
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1 rounded-2xl border border-border bg-muted/40 p-3">
              <View className="flex-row items-center gap-2">
                <CreditCardIcon size={16} color="currentColor" />
                <Text className="text-xs uppercase tracking-[2px] text-muted-foreground">Subscription</Text>
              </View>
              <Text className="mt-3 font-semibold">{subscriptionLabel}</Text>
              <Text className="text-sm text-muted-foreground">
                {subscription.isTrial ? \`\${subscription.trialDaysRemaining} days left\` : (account?.subscriptionStatus ?? 'active')}
              </Text>
            </View>

            <View className="flex-1 rounded-2xl border border-border bg-muted/40 p-3">
              <View className="flex-row items-center gap-2">
                <CoinsIcon size={16} color="currentColor" />
                <Text className="text-xs uppercase tracking-[2px] text-muted-foreground">Credits</Text>
              </View>
              <Text className="mt-3 font-semibold">{account?.creditsBalance ?? 250}</Text>
              <Text className="text-sm text-muted-foreground">Starter balance</Text>
            </View>
          </View>
        </View>

        <View className="gap-2 p-3">
          <Button variant="outline" onPress={() => void onSubscriptionAction()}>
            <Icon as={CreditCardIcon} className="size-4" />
            <Text>{subscription.managementUrl ? 'Manage subscription' : 'Open paywall'}</Text>
          </Button>

          <Button variant="outline" onPress={() => void onUploadAvatar()} disabled={uploading}>
            <Icon as={uploading ? LoaderCircleIcon : CameraIcon} className={uploading ? 'size-4 animate-spin' : 'size-4'} />
            <Text>{uploading ? 'Uploading avatar...' : 'Upload avatar to R2'}</Text>
          </Button>

          <Button variant="outline" onPress={() => void onSignOut()}>
            <Icon as={LogOutIcon} className="size-4" />
            <Text>Sign out</Text>
          </Button>
        </View>
      </PopoverContent>
    </Popover>
  );
}
`);
}

function writeEnvExample(dir: string): void {
  writeFile(path.join(dir, '.env.example'), `# Clerk
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_***

# Backend API URL
EXPO_PUBLIC_API_URL=http://localhost:8787

# RevenueCat
EXPO_PUBLIC_RC_ENTITLEMENT_ID=pro
EXPO_PUBLIC_RC_API_KEY_IOS=appl_***
EXPO_PUBLIC_RC_API_KEY_ANDROID=goog_***
EXPO_PUBLIC_RC_WEB_API_KEY=rcb_***
`);
}

function writeEnvFile(dir: string): void {
  writeFile(path.join(dir, '.env'), `# Clerk
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_demo_placeholder

# Backend API URL
EXPO_PUBLIC_API_URL=http://localhost:8787

# RevenueCat
EXPO_PUBLIC_RC_ENTITLEMENT_ID=pro
EXPO_PUBLIC_RC_API_KEY_IOS=appl_demo_placeholder
EXPO_PUBLIC_RC_API_KEY_ANDROID=goog_demo_placeholder
EXPO_PUBLIC_RC_WEB_API_KEY=rcb_demo_placeholder
`);
}
