import fs from 'node:fs';
import path from 'node:path';
import { writeAnhedralLogo } from '../branding.js';
import { anhedralPrint } from '../print.js';
import { appendGitignore, writeFile, exec, execExpect, liftNestedProject } from '../util.js';
import type { ProjectOptions } from '../scaffold.js';
import { FRONTEND_ADDON_DEPENDENCIES, withVersions } from '../dependencies.js';
import { resolveToolchainChannel, resolveToolchain, toolPackageRef } from '../toolchain.js';

export async function scaffoldFrontend(root: string, { projectName, displayName, skipInstall }: ProjectOptions): Promise<void> {
  const dir = path.join(root, 'apps/mobile');
  const toolchain = resolveToolchain(resolveToolchainChannel(process.env.ANHEDRAL_TOOLCHAIN));

  anhedralPrint.section('Mobile (Expo)');

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
  patchFrontendTsConfig(dir);
  if (!skipInstall) {
    exec('pnpm install --no-frozen-lockfile', dir);
    exec('pnpm exec expo install --fix --pnpm', dir);
  }
  appendGitignore(dir, ['.env', '.env.*', '!.env.example']);
  anhedralPrint.done(skipInstall ? 'Mobile dependency manifests written' : 'Mobile dependencies installed');

  writeApiClient(dir);
  writeConfigFile(dir);
  writeTypeDeclarations(dir);
  writeApiHook(dir);
  writeAccountHook(dir);
  writeThemeToggle(dir);
  writeAppShellFiles(dir, displayName);
  writeEnvExample(dir);
  writeEnvFile(dir);
  writeVercelConfig(dir);
  writeEasConfig(dir);
  writeAnhedralLogo(dir);
  writeSubscriptionProvider(dir);
  writeUseSubscription(dir);
  removeUnusedFrontendFiles(dir);

  anhedralPrint.step('Installing RevenueCat SDKs');
  const revenueCatDependencies = withVersions({
    'react-native-purchases': FRONTEND_ADDON_DEPENDENCIES['react-native-purchases'],
    'react-native-purchases-ui': FRONTEND_ADDON_DEPENDENCIES['react-native-purchases-ui'],
    '@revenuecat/purchases-js': FRONTEND_ADDON_DEPENDENCIES['@revenuecat/purchases-js'],
  });
  if (skipInstall) {
    anhedralPrint.info(`Skipping RevenueCat SDK install (--skip-install). Run after init: pnpm --filter ./apps/mobile add ${revenueCatDependencies.join(' ')}`);
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
    '@shared/api-client': FRONTEND_ADDON_DEPENDENCIES['@shared/api-client'],
    '@react-navigation/native': FRONTEND_ADDON_DEPENDENCIES['@react-navigation/native'],
    '@clerk/expo': FRONTEND_ADDON_DEPENDENCIES['@clerk/expo'],
    'react-native-purchases': FRONTEND_ADDON_DEPENDENCIES['react-native-purchases'],
    'react-native-purchases-ui': FRONTEND_ADDON_DEPENDENCIES['react-native-purchases-ui'],
    '@revenuecat/purchases-js': FRONTEND_ADDON_DEPENDENCIES['@revenuecat/purchases-js'],
  };
  delete packageJson.dependencies['@rn-primitives/avatar'];
  delete packageJson.dependencies['expo-image-picker'];

  packageJson.scripts = {
    ...(packageJson.scripts ?? {}),
    build: 'pnpm typecheck && pnpm build:web',
    'build:web': 'expo export --platform web',
    typecheck: 'tsc --noEmit',
  };

  writeFile(filePath, JSON.stringify(packageJson, null, 2) + '\n');
}

function removeUnusedFrontendFiles(dir: string): void {
  const avatarComponent = path.join(dir, 'components/ui/avatar.tsx');
  if (fs.existsSync(avatarComponent)) {
    fs.rmSync(avatarComponent);
  }
}

function patchFrontendTsConfig(dir: string): void {
  const filePath = path.join(dir, 'tsconfig.json');
  if (!fs.existsSync(filePath)) {
    return;
  }

  const tsConfig = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
    extends?: string;
    compilerOptions?: Record<string, unknown>;
  };

  if (tsConfig.extends === 'expo/tsconfig.base') {
    tsConfig.extends = 'expo/tsconfig.base.json';
  }
  tsConfig.compilerOptions = {
    ...(tsConfig.compilerOptions ?? {}),
    ignoreDeprecations: '6.0',
  };

  writeFile(filePath, JSON.stringify(tsConfig, null, 2) + '\n');
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
  appJson.expo.plugins = Array.from(new Set([
    ...((Array.isArray(appJson.expo.plugins) ? appJson.expo.plugins : []) as string[]),
    '@clerk/expo',
  ]));

  writeFile(filePath, JSON.stringify(appJson, null, 2) + '\n');
}

function writeApiClient(dir: string): void {
  writeFile(path.join(dir, 'api/client.ts'), `import { ApiClient, APIRequestError } from '@shared/api-client';

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

function writeTypeDeclarations(dir: string): void {
  writeFile(path.join(dir, 'types/css.d.ts'), "declare module '*.css';\n");
}

function writeApiHook(dir: string): void {
  writeFile(path.join(dir, 'hooks/useAPI.ts'), `import { useAuth } from '@clerk/expo';
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
        destination: '/',
      },
    ],
  }, null, 2) + '\n');
}

function writeEasConfig(dir: string): void {
  writeFile(path.join(dir, 'eas.json'), JSON.stringify({
    cli: {
      version: '>= 16.24.0',
      appVersionSource: 'remote',
    },
    build: {
      development: {
        developmentClient: true,
        distribution: 'internal',
        android: {
          buildType: 'apk',
        },
      },
      preview: {
        distribution: 'internal',
      },
      production: {
        autoIncrement: true,
      },
    },
    submit: {
      production: {},
    },
  }, null, 2) + '\n');
}

function writeAccountHook(dir: string): void {
  writeFile(path.join(dir, 'hooks/useAccount.ts'), `import { useAuth } from '@clerk/expo';
import * as React from 'react';
import { useAPI } from '@/hooks/useAPI';

export type AccountSummary = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName: string;
  imageUrl?: string | null;
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

  return {
    account,
    loading,
    error,
    refresh,
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
`);
}

function writeUseSubscription(dir: string): void {
  writeFile(path.join(dir, 'hooks/useSubscription.ts'), `import { useCallback } from 'react';
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
`);
}

function writeAppShellFiles(dir: string, displayName: string): void {
  writeFile(path.join(dir, 'app/_layout.tsx'), `import '@/global.css';

import { SubscriptionProvider } from '@/contexts/SubscriptionProvider';
import { clerkPublishableKey } from '@/lib/config';
import { NAV_THEME } from '@/lib/theme';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
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
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
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
        <Stack.Screen name="(app)/system" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
`);

  writeFile(path.join(dir, 'app/index.tsx'), `import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useAuth } from '@clerk/expo';
import { Link } from 'expo-router';
import { ScrollView, View } from 'react-native';

export default function HomeScreen() {
  const { isSignedIn } = useAuth();

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="min-h-full px-4 pb-10 pt-6 sm:px-6">
      <View className="mx-auto w-full max-w-3xl gap-4">
        <View className="flex-row items-center justify-between border-b border-border py-3">
          <Text className="text-lg font-semibold">${displayName}</Text>
          <ThemeToggle />
        </View>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-left text-2xl">Application foundation ready</CardTitle>
          </CardHeader>
          <CardContent className="gap-4">
            <Text className="text-muted-foreground">
              Configure providers, then use the protected area to verify auth, API, subscription, database, and storage wiring.
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {isSignedIn ? (
                <Link href="/system" asChild>
                  <Button>
                    <Text>Open app</Text>
                  </Button>
                </Link>
              ) : (
                <>
                  <Link href="/(auth)/sign-in" asChild>
                    <Button>
                      <Text>Sign in</Text>
                    </Button>
                  </Link>
                  <Link href="/(auth)/sign-up" asChild>
                    <Button variant="outline">
                      <Text>Create account</Text>
                    </Button>
                  </Link>
                </>
              )}
            </View>
          </CardContent>
        </Card>
      </View>
    </ScrollView>
  );
}
`);

  writeFile(path.join(dir, 'app/(app)/system.tsx'), `import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/user-menu';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useAccount } from '@/hooks/useAccount';
import { useSubscription } from '@/hooks/useSubscription';
import { Stack } from 'expo-router';
import { CheckCircleIcon, CircleAlertIcon, CreditCardIcon, DatabaseIcon } from 'lucide-react-native';
import * as React from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

export default function DashboardScreen() {
  const { account, loading, error, refresh } = useAccount();
  const subscription = useSubscription();

  const subscriptionLabel = React.useMemo(() => {
    if (subscription.isPaid) return 'Paid';
    if (subscription.isTrial) return \`Trial, \${subscription.trialDaysRemaining} days left\`;
    if (subscription.isRedeemed) return 'Redeemed';
    if (subscription.canAccess) return 'Active';
    return 'Inactive';
  }, [subscription.canAccess, subscription.isPaid, subscription.isRedeemed, subscription.isTrial, subscription.trialDaysRemaining]);

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
        <View className="mx-auto w-full max-w-3xl gap-4">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-left text-2xl">System status</CardTitle>
            </CardHeader>
            <CardContent className="flex-row flex-wrap gap-2">
              <Button onPress={() => void runSubscriptionAction()}>
                <Text>{subscription.managementUrl ? 'Manage subscription' : 'Open paywall'}</Text>
              </Button>
              <Button variant="outline" onPress={() => void refresh()}>
                <Text>Refresh</Text>
              </Button>
            </CardContent>
          </Card>

          <View className="gap-3">
            <Card className="border-border bg-card">
              <CardHeader>
                <View className="flex-row items-center gap-2">
                  {account ? <CheckCircleIcon size={18} color="currentColor" /> : <CircleAlertIcon size={18} color="currentColor" />}
                  <CardTitle className="text-left text-lg">Authenticated API</CardTitle>
                </View>
              </CardHeader>
              <CardContent className="gap-1">
                <Text className="text-sm text-muted-foreground">{account ? 'Connected' : loading ? 'Loading' : 'Unavailable'}</Text>
                {account ? <Text>{account.email}</Text> : null}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <View className="flex-row items-center gap-2">
                  <CreditCardIcon size={18} color="currentColor" />
                  <CardTitle className="text-left text-lg">Subscription entitlement</CardTitle>
                </View>
              </CardHeader>
              <CardContent className="gap-1">
                <Text>{subscriptionLabel}</Text>
                {subscription.expiresAt ? <Text className="text-sm text-muted-foreground">Expires {new Date(subscription.expiresAt).toLocaleDateString()}</Text> : null}
                {subscription.cancelAtPeriodEnd ? <Text className="text-sm text-muted-foreground">Cancels at period end</Text> : null}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <View className="flex-row items-center gap-2">
                  <DatabaseIcon size={18} color="currentColor" />
                  <CardTitle className="text-left text-lg">Database record</CardTitle>
                </View>
              </CardHeader>
              <CardContent className="gap-1">
                <Text>{account?.id ?? 'Not loaded'}</Text>
                <Text className="text-sm text-muted-foreground">Use this route as the starting point for your product data.</Text>
              </CardContent>
            </Card>
          </View>

          {error ? (
            <Card className="rounded-[24px] border-amber-300/60 bg-amber-50 dark:bg-amber-500/10">
              <CardContent className="px-5 py-5">
                <Text className="text-sm leading-6 text-amber-900 dark:text-amber-100">
                  API error: {error}
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
        <View className="flex-row items-center justify-between border-b border-border py-3">
          <View>
            <Text className="text-lg font-semibold">${displayName}</Text>
          </View>
          <ThemeToggle />
        </View>

        <View className="gap-4 sm:flex-row">
          <View className="flex-1 border border-border bg-card px-6 py-8">
            <Text className="text-2xl font-semibold">Sign in</Text>
            <Text className="mt-3 text-muted-foreground">
              Access the protected application area.
            </Text>
            <Link href="/" className="mt-6 text-sm underline underline-offset-4">
              Back
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
        <View className="flex-row items-center justify-between border-b border-border py-3">
          <View>
            <Text className="text-lg font-semibold">${displayName}</Text>
          </View>
          <ThemeToggle />
        </View>

        <View className="gap-4 sm:flex-row">
          <View className="w-full sm:max-w-md sm:order-2">
            <SignUpForm />
          </View>

          <View className="flex-1 border border-border bg-card px-6 py-8 sm:order-1">
            <Text className="text-2xl font-semibold">Create account</Text>
            <Text className="mt-3 text-muted-foreground">
              Create a user and continue into the protected application area.
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
import { useSignIn } from '@clerk/expo/legacy';
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
          <CardTitle className="text-center text-2xl sm:text-left">Sign in</CardTitle>
          <CardDescription className="text-center sm:text-left">
            Continue with your account.
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
import { useSignUp } from '@clerk/expo/legacy';
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
            Enter an email and password to continue.
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

  writeFile(path.join(dir, 'components/user-menu.tsx'), `import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Text } from '@/components/ui/text';
import { useAccount } from '@/hooks/useAccount';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@clerk/expo';
import type { TriggerRef } from '@rn-primitives/popover';
import { CreditCardIcon, LogOutIcon, UserIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

export function UserMenu() {
  const { signOut } = useAuth();
  const { account } = useAccount();
  const subscription = useSubscription();
  const popoverTriggerRef = React.useRef<TriggerRef>(null);

  async function onSignOut() {
    popoverTriggerRef.current?.close();
    await signOut();
  }

  async function onSubscriptionAction() {
    popoverTriggerRef.current?.close();
    if (subscription.managementUrl) {
      await subscription.manageSubscription();
      return;
    }

    await subscription.subscribe('monthly');
  }

  return (
    <Popover>
      <PopoverTrigger asChild ref={popoverTriggerRef}>
        <Button variant="ghost" size="sm">
          <Icon as={UserIcon} className="size-4" />
          <Text>Account</Text>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" side="bottom" className="w-72 gap-0 p-0">
        <View className="gap-1 border-b border-border p-4">
          <Text className="font-medium">{account?.displayName ?? 'Account'}</Text>
          <Text className="text-sm text-muted-foreground">{account?.email ?? 'Loading account...'}</Text>
        </View>

        <View className="gap-2 p-3">
          <Button variant="outline" onPress={() => void onSubscriptionAction()}>
            <Icon as={CreditCardIcon} className="size-4" />
            <Text>{subscription.managementUrl ? 'Manage subscription' : 'Open paywall'}</Text>
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

# API API URL
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

# API API URL
EXPO_PUBLIC_API_URL=http://localhost:8787

# RevenueCat
EXPO_PUBLIC_RC_ENTITLEMENT_ID=pro
EXPO_PUBLIC_RC_API_KEY_IOS=appl_demo_placeholder
EXPO_PUBLIC_RC_API_KEY_ANDROID=goog_demo_placeholder
EXPO_PUBLIC_RC_WEB_API_KEY=rcb_demo_placeholder
`);
}
