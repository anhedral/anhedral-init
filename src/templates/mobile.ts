import path from 'node:path';
import { anhedralPrint } from '../print.js';
import { appendGitignore, writeFile } from '../util.js';
import { childPackageName, jsString } from '../render.js';
import { FRONTEND_ADDON_DEPENDENCIES, MOBILE_APP_DEPENDENCIES } from '../dependencies.js';
import type { ProjectOptions } from '../scaffold.js';

function selectedDependencies(options: ProjectOptions): Record<string, string> {
  const dependencies = { ...(MOBILE_APP_DEPENDENCIES.dependencies ?? {}) };
  if (!options.apps.api) delete dependencies['@shared/api-client'];

  if (options.features.auth) {
    for (const name of [
      '@clerk/expo',
      'expo-secure-store',
    ]) dependencies[name] = FRONTEND_ADDON_DEPENDENCIES[name]!;
  }
  if (options.features.nativeSubscriptions) {
    dependencies['react-native-purchases'] = FRONTEND_ADDON_DEPENDENCIES['react-native-purchases'];
    dependencies['react-native-purchases-ui'] = FRONTEND_ADDON_DEPENDENCIES['react-native-purchases-ui'];
  }
  return dependencies;
}

function expoScheme(projectName: string): string {
  const unscoped = projectName.replace(/^@[^/]+\//, '');
  const normalized = unscoped
    .toLowerCase()
    .replace(/[^a-z0-9+.-]+/g, '-')
    .replace(/^[+.-]+|[+.-]+$/g, '');
  const candidate = normalized || 'app';
  return /^[a-z]/.test(candidate) ? candidate : `app-${candidate}`;
}

export async function scaffoldMobile(root: string, options: ProjectOptions): Promise<void> {
  const dir = path.join(root, 'apps/mobile');
  const { projectName, displayName } = options;
  const nameLiteral = jsString(displayName);
  const hasSubscriptions = options.features.nativeSubscriptions;

  anhedralPrint.section('Mobile (Expo)');
  anhedralPrint.step('Writing deterministic Expo application');

  writeFile(path.join(dir, 'package.json'), JSON.stringify({
    name: childPackageName(projectName, 'mobile'),
    version: '0.1.0',
    private: true,
    main: 'expo-router/entry',
    scripts: {
      dev: 'expo start -c',
      android: 'expo start -c --android',
      ios: 'expo start -c --ios',
      web: 'expo start -c --web',
      build: 'pnpm typecheck && pnpm build:web',
      'build:web': 'expo export --platform web',
      typecheck: 'tsc --noEmit',
    },
    dependencies: selectedDependencies(options),
    devDependencies: MOBILE_APP_DEPENDENCIES.devDependencies,
  }, null, 2) + '\n');

  writeFile(path.join(dir, 'app.json'), JSON.stringify({
    expo: {
      name: displayName,
      slug: projectName.replace(/^@[^/]+\//, ''),
      version: '1.0.0',
      orientation: 'portrait',
      scheme: expoScheme(projectName),
      userInterfaceStyle: 'automatic',
      web: { bundler: 'metro', output: 'static' },
      plugins: ['expo-router', ...(options.features.auth ? ['expo-secure-store'] : [])],
      experiments: { typedRoutes: true },
    },
  }, null, 2) + '\n');

  writeFile(path.join(dir, 'tsconfig.json'), JSON.stringify({
    extends: 'expo/tsconfig.base',
    compilerOptions: {
      strict: true,
      noUncheckedIndexedAccess: true,
      paths: { '@/*': ['./*'] },
    },
    include: ['**/*.ts', '**/*.tsx', '.expo/types/**/*.ts', 'expo-env.d.ts'],
  }, null, 2) + '\n');
  writeFile(path.join(dir, 'expo-env.d.ts'), '/// <reference types="expo/types" />\n');

  const layoutImports = options.features.auth
    ? `import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { ${hasSubscriptions ? 'Button, ' : ''}ScrollView, Text, View } from 'react-native';
`
    : '';
  const subscriptionImports = hasSubscriptions
    ? `import { useEffect${options.features.auth ? ', useState' : ''} } from 'react';
import { ${options.features.auth ? 'syncRevenueCatUser, type SubscriptionState' : 'initializeRevenueCat'} } from '../lib/subscriptions';
`
    : '';
  const stackElement = hasSubscriptions ? '<AppStack />' : '<Stack />';
const appStack = hasSubscriptions && options.features.auth ? `function AppStack() {
  const { isLoaded, userId } = useAuth();
  const [syncState, setSyncState] = useState<SubscriptionState | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    setSyncState({ status: 'syncing', message: 'Synchronizing the subscription account…' });
    void syncRevenueCatUser(userId ?? null).then((result) => {
      if (!cancelled) setSyncState(result);
    });
    return () => { cancelled = true; };
  }, [isLoaded, userId]);

  const retry = async () => {
    setSyncState({ status: 'syncing', message: 'Retrying subscription account synchronization…' });
    setSyncState(await syncRevenueCatUser(userId ?? null));
  };

  return (
    <>
      <Stack />
      {syncState?.status === 'error' ? (
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16, gap: 8, padding: 16, borderRadius: 12, backgroundColor: '#fee2e2' }}>
          <Text selectable accessibilityLiveRegion="assertive" style={{ color: '#991b1b' }}>{syncState.message}</Text>
          <Button title="Retry subscription sync" onPress={() => void retry()} />
        </View>
      ) : null}
    </>
  );
}

` : hasSubscriptions ? `function AppStack() {
  useEffect(() => {
    void initializeRevenueCat(null);
  }, []);

  return <Stack />;
}

` : '';
  const layoutBody = options.features.auth
    ? `  const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 32 }}>
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '700' }}>Authentication configuration required</Text>
          <Text selectable accessibilityLiveRegion="assertive">
            Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY before starting this app.
          </Text>
        </View>
      </ScrollView>
    );
  }
  return <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>${stackElement}</ClerkProvider>;`
    : `  return ${stackElement};`;

  writeFile(path.join(dir, 'app/_layout.tsx'), `import { Stack } from 'expo-router';
${layoutImports}${subscriptionImports}
${appStack}
export default function RootLayout() {
${layoutBody}
}
`);

  const moduleLines = [
    options.apps.api ? 'Typed API client' : null,
    options.features.auth ? 'Clerk authentication' : null,
    options.features.nativeSubscriptions ? 'RevenueCat subscriptions' : null,
  ].filter((value): value is string => value !== null);

  const homeImports = [
    options.features.nativeSubscriptions
      ? "import { useState } from 'react';\nimport { getRevenueCatAvailability, presentPaywallIfNeeded, type SubscriptionState } from '../lib/subscriptions';"
      : null,
    options.features.auth ? "import { AccountControls } from '../components/account-controls';" : null,
  ].filter((value): value is string => value !== null).join('\n');
  const reactNativeImports = options.features.nativeSubscriptions
    ? 'Button, ScrollView, StyleSheet, Text, View'
    : 'ScrollView, StyleSheet, Text, View';
  const subscriptionComponent = options.features.nativeSubscriptions
    ? `function SubscriptionControls() {
  const [state, setState] = useState<SubscriptionState>(() => getRevenueCatAvailability());
  const [isBusy, setIsBusy] = useState(false);

  const openPaywall = async () => {
    setIsBusy(true);
    setState({ status: 'ready', message: 'Opening subscription options…' });
    setState(await presentPaywallIfNeeded());
    setIsBusy(false);
  };

  return (
    <View style={styles.actions}>
      <Button title={isBusy ? 'Opening…' : 'View subscription options'} disabled={isBusy || state.status === 'unavailable'} onPress={() => void openPaywall()} />
      <Text
        selectable
        accessibilityLiveRegion={state.status === 'error' ? 'assertive' : 'polite'}
        style={state.status === 'error' ? styles.error : styles.status}
      >
        {state.message}
      </Text>
    </View>
  );
}

`
    : '';
  const nativeSubscriptionAction = options.features.nativeSubscriptions
    ? '        <SubscriptionControls />\n'
    : '';
  const accountControls = options.features.auth ? '        <AccountControls />\n' : '';

  writeFile(path.join(dir, 'app/index.tsx'), `import { StatusBar } from 'expo-status-bar';
import { ${reactNativeImports} } from 'react-native';
${homeImports}

const enabledModules = ${JSON.stringify(moduleLines)};

${subscriptionComponent}export default function HomeScreen() {
  return (
    <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.container}>
      <StatusBar style="auto" />
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>{${nameLiteral}}</Text>
        <Text selectable style={styles.subtitle}>Deterministic Expo application generated by Anhedral.</Text>
        {enabledModules.map((moduleName) => <Text selectable key={moduleName} style={styles.module}>• {moduleName}</Text>)}
${accountControls}${nativeSubscriptionAction}      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flexGrow: 1, justifyContent: 'center', padding: 32 },
  content: { gap: 12 },
  actions: { gap: 8, paddingTop: 8 },
  title: { color: '#0f172a', fontSize: 34, fontWeight: '700' },
  subtitle: { color: '#475569', fontSize: 17, paddingBottom: 12 },
  module: { color: '#1e293b', fontSize: 15 },
  status: { color: '#475569', fontSize: 14 },
  error: { color: '#b91c1c', fontSize: 14 },
});
`);

  if (options.features.auth) {
    writeFile(path.join(dir, 'components/account-controls.tsx'), `import { Show, useClerk, useUser } from '@clerk/expo';
import { useState } from 'react';
import { Button, Text, View } from 'react-native';

export function AccountControls() {
  const clerk = useClerk();
  const { user } = useUser();
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setError(null);
    try {
      await Promise.resolve(clerk.openSignIn({}));
    } catch {
      setError('Unable to open sign in. Check the Clerk configuration and try again.');
    }
  };

  const signOut = async () => {
    setError(null);
    try {
      await clerk.signOut();
    } catch {
      setError('Unable to sign out. Check your connection and try again.');
    }
  };

  return (
    <View style={{ gap: 8, paddingTop: 8 }}>
      <Show when="signed-out">
        <Button title="Sign in" onPress={() => void signIn()} />
      </Show>
      <Show when="signed-in">
        <Text selectable>
          Account: {user?.primaryEmailAddress?.emailAddress ?? user?.id ?? 'Signed in'}
        </Text>
        <Button title="Sign out" onPress={() => void signOut()} />
      </Show>
      {error ? (
        <Text selectable accessibilityLiveRegion="assertive" style={{ color: '#b91c1c' }}>{error}</Text>
      ) : null}
    </View>
  );
}
`);
  }

  if (options.apps.api) {
    writeFile(path.join(dir, 'lib/api.ts'), `import { ApiClient, normalizeApiBaseUrl } from '@shared/api-client';

function apiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  const candidate = configured || (__DEV__ ? 'http://localhost:8787/api' : '');
  if (!candidate) throw new Error('EXPO_PUBLIC_API_URL is required in production builds');
  const normalized = normalizeApiBaseUrl(candidate, 'EXPO_PUBLIC_API_URL');
  const url = new URL(normalized);
  if (!__DEV__ && url.protocol !== 'https:') {
    throw new Error('EXPO_PUBLIC_API_URL must use https: in production');
  }
  return normalized;
}

export function createApiClient(getToken?: () => Promise<string | null>) {
  return new ApiClient({
    baseUrl: apiBaseUrl(),
    getToken,
  });
}
`);
  }

  if (options.apps.api && options.features.auth) {
    writeFile(path.join(dir, 'hooks/use-api-client.ts'), `import { useAuth } from '@clerk/expo';
import { useMemo } from 'react';
import { createApiClient } from '../lib/api';

export function useApiClient() {
  const { getToken } = useAuth();
  return useMemo(() => createApiClient(() => getToken()), [getToken]);
}
`);
  }

  if (hasSubscriptions) {
    writeFile(path.join(dir, 'lib/subscriptions.ts'), `import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

export const revenueCatConfig = {
  entitlementId: process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ID || 'pro',
  iosApiKey: process.env.EXPO_PUBLIC_RC_API_KEY_IOS,
  androidApiKey: process.env.EXPO_PUBLIC_RC_API_KEY_ANDROID,
};

export type SubscriptionState = {
  status: 'ready' | 'syncing' | 'unavailable' | 'cancelled' | 'success' | 'error';
  message: string;
};

let configured = false;
let currentAppUserId: string | null = null;
let desiredAppUserId: string | null | undefined;
let identitySynchronized = false;
let syncQueue: Promise<void> = Promise.resolve();

function apiKeyForPlatform(): string | undefined {
  return Platform.OS === 'ios'
    ? revenueCatConfig.iosApiKey
    : Platform.OS === 'android'
      ? revenueCatConfig.androidApiKey
      : undefined;
}

export function getRevenueCatAvailability(): SubscriptionState {
  if (Platform.OS === 'web') {
    return { status: 'unavailable', message: 'Native subscriptions are unavailable on web.' };
  }
  if (!apiKeyForPlatform()) {
    return { status: 'unavailable', message: 'Set the RevenueCat API key for this platform.' };
  }
  return { status: 'ready', message: 'Subscription options are ready.' };
}

export async function initializeRevenueCat(appUserId: string | null = null): Promise<SubscriptionState> {
  const availability = getRevenueCatAvailability();
  if (availability.status === 'unavailable') return availability;
  if (configured) return { status: 'ready', message: 'Subscriptions are ready.' };

  try {
    Purchases.configure({
      apiKey: apiKeyForPlatform()!,
      ...(appUserId ? { appUserID: appUserId } : {}),
    });
    configured = true;
    currentAppUserId = appUserId;
    if (desiredAppUserId === undefined) desiredAppUserId = appUserId;
    identitySynchronized = desiredAppUserId === appUserId;
    return { status: 'ready', message: 'Subscriptions are ready.' };
  } catch {
    identitySynchronized = false;
    return { status: 'error', message: 'RevenueCat initialization failed.' };
  }
}

async function applyRevenueCatUser(appUserId: string | null): Promise<SubscriptionState> {
  const initialized = await initializeRevenueCat(appUserId);
  if (initialized.status !== 'ready') {
    if (desiredAppUserId === appUserId) identitySynchronized = false;
    return initialized;
  }
  if (currentAppUserId === appUserId) {
    if (desiredAppUserId === appUserId) identitySynchronized = true;
    return initialized;
  }

  try {
    if (appUserId) await Purchases.logIn(appUserId);
    else if (currentAppUserId) await Purchases.logOut();
    currentAppUserId = appUserId;
    identitySynchronized = desiredAppUserId === appUserId;
    return { status: 'ready', message: 'Subscription account is synchronized.' };
  } catch {
    if (desiredAppUserId === appUserId) identitySynchronized = false;
    return { status: 'error', message: 'Unable to synchronize the subscription account.' };
  }
}

export async function syncRevenueCatUser(appUserId: string | null): Promise<SubscriptionState> {
  desiredAppUserId = appUserId;
  identitySynchronized = configured && currentAppUserId === appUserId;
  const operation = syncQueue.then(() => applyRevenueCatUser(appUserId));
  syncQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function presentPaywallIfNeeded(): Promise<SubscriptionState> {
  const targetAppUserId = desiredAppUserId;
  if (targetAppUserId === undefined) {
    return { status: 'error', message: 'Wait for the subscription account to synchronize, then try again.' };
  }
  if (!identitySynchronized || currentAppUserId !== targetAppUserId) {
    const synchronized = await syncRevenueCatUser(targetAppUserId);
    if (synchronized.status !== 'ready'
      || !identitySynchronized
      || currentAppUserId !== desiredAppUserId
      || desiredAppUserId !== targetAppUserId) {
      return { status: 'error', message: 'Subscription account synchronization is required before opening the paywall.' };
    }
  }

  try {
    const { default: RevenueCatUI, PAYWALL_RESULT } = await import('react-native-purchases-ui');
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: revenueCatConfig.entitlementId,
    });
    switch (result) {
      case PAYWALL_RESULT.PURCHASED:
        return { status: 'success', message: 'Subscription purchase completed.' };
      case PAYWALL_RESULT.RESTORED:
        return { status: 'success', message: 'Subscription restored.' };
      case PAYWALL_RESULT.NOT_PRESENTED:
        return { status: 'success', message: 'The required entitlement is already active.' };
      case PAYWALL_RESULT.CANCELLED:
        return { status: 'cancelled', message: 'Subscription options were closed without a purchase.' };
      case PAYWALL_RESULT.ERROR:
        return { status: 'error', message: 'RevenueCat could not complete the paywall request.' };
      default:
        return { status: 'error', message: 'RevenueCat returned an unknown paywall result.' };
    }
  } catch {
    return { status: 'error', message: 'Unable to open subscription options.' };
  }
}
`);
  }

  const envLines = [
    options.apps.api ? 'EXPO_PUBLIC_API_URL=http://localhost:8787/api' : null,
    options.features.auth ? 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_***' : null,
    options.features.nativeSubscriptions ? 'EXPO_PUBLIC_RC_ENTITLEMENT_ID=pro' : null,
    options.features.nativeSubscriptions ? 'EXPO_PUBLIC_RC_API_KEY_IOS=' : null,
    options.features.nativeSubscriptions ? 'EXPO_PUBLIC_RC_API_KEY_ANDROID=' : null,
  ].filter((value): value is string => value !== null);
  writeFile(path.join(dir, '.env.example'), envLines.join('\n') + (envLines.length > 0 ? '\n' : ''));
  writeFile(path.join(dir, 'eas.json'), JSON.stringify({
    cli: { version: '>= 16.0.0' },
    build: {
      development: { developmentClient: true, distribution: 'internal' },
      preview: { distribution: 'internal' },
      production: { autoIncrement: true },
    },
    submit: { production: {} },
  }, null, 2) + '\n');
  appendGitignore(dir, ['.env', '.env.*', '!.env.example', '.expo', 'dist', 'node_modules']);

  anhedralPrint.done('Expo application written');
}
