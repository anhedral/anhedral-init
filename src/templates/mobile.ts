import path from 'node:path';
import { anhedralPrint } from '../print.js';
import { appendGitignore, writeFile } from '../util.js';
import { childPackageName, jsString } from '../render.js';
import {
  CLERK_SOLANA_PEER_DEPENDENCIES,
  FRONTEND_ADDON_DEPENDENCIES,
  MOBILE_APP_DEPENDENCIES,
  MOBILE_NATIVEWIND_DEPENDENCIES,
  MOBILE_UNIWIND_DEPENDENCIES,
  TOOLCHAIN_DEPENDENCIES,
} from '../dependencies.js';
import type { NativeStylingLibrary } from '../ui.js';
import type { ProjectOptions } from '../project.js';

function selectedDependencies(options: ProjectOptions): Record<string, string> {
  const dependencies = { ...(MOBILE_APP_DEPENDENCIES.dependencies ?? {}) };
  Object.assign(
    dependencies,
    (options.nativeStyling ?? 'nativewind') === 'uniwind'
      ? MOBILE_UNIWIND_DEPENDENCIES.dependencies
      : MOBILE_NATIVEWIND_DEPENDENCIES.dependencies,
  );
  if (!options.apps.api) delete dependencies['@shared/api-client'];
  if (!options.features.billing) delete dependencies['@shared/realtime'];

  if (options.features.auth) {
    Object.assign(dependencies, CLERK_SOLANA_PEER_DEPENDENCIES);
    for (const name of ['@clerk/expo', 'expo-secure-store']) {
      dependencies[name] = FRONTEND_ADDON_DEPENDENCIES[name]!;
    }
  }
  if (options.features.nativeSubscriptions) {
    dependencies['react-native-purchases'] = FRONTEND_ADDON_DEPENDENCIES['react-native-purchases'];
    dependencies['react-native-purchases-ui'] = FRONTEND_ADDON_DEPENDENCIES['react-native-purchases-ui'];
  }
  return dependencies;
}

function writeReactNativeReusablesConfig(dir: string, styling: NativeStylingLibrary): void {
  writeFile(path.join(dir, 'components.json'), JSON.stringify({
    $schema: 'https://ui.shadcn.com/schema.json',
    style: 'new-york',
    rsc: false,
    tsx: true,
    tailwind: {
      config: styling === 'nativewind' ? 'tailwind.config.js' : '',
      css: 'global.css',
      baseColor: 'neutral',
      cssVariables: true,
    },
    aliases: {
      components: '@/components',
      utils: '@/lib/utils',
      ui: '@/components/ui',
      lib: '@/lib',
      hooks: '@/hooks',
    },
    iconLibrary: 'lucide',
  }, null, 2) + '\n');

  writeFile(path.join(dir, 'lib/utils.ts'), `import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`);

  if (styling === 'uniwind') {
    writeFile(path.join(dir, 'metro.config.js'), `const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './uniwind-types.d.ts',
});
`);
    writeFile(path.join(dir, 'uniwind-types.d.ts'), `/// <reference types="uniwind/types" />

declare module 'uniwind' {
  export interface UniwindConfig {
    themes: readonly ['light', 'dark'];
  }
}

export {};
`);
    writeFile(path.join(dir, 'global.css'), `@import "tailwindcss";
@import "uniwind";
@import "tw-animate-css";

@theme {
  --radius: 10px;
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --spacing-hairline: hairlineWidth();
}

@layer theme {
  :root {
    @variant light {
      --color-background: oklch(1 0 0); --color-foreground: oklch(0.145 0 0);
      --color-card: oklch(1 0 0); --color-card-foreground: oklch(0.145 0 0);
      --color-popover: oklch(1 0 0); --color-popover-foreground: oklch(0.145 0 0);
      --color-primary: oklch(0.205 0 0); --color-primary-foreground: oklch(0.985 0 0);
      --color-secondary: oklch(0.97 0 0); --color-secondary-foreground: oklch(0.205 0 0);
      --color-muted: oklch(0.97 0 0); --color-muted-foreground: oklch(0.556 0 0);
      --color-accent: oklch(0.97 0 0); --color-accent-foreground: oklch(0.205 0 0);
      --color-destructive: oklch(0.577 0.245 27.325); --color-border: oklch(0.922 0 0);
      --color-input: oklch(0.922 0 0); --color-ring: oklch(0.708 0 0);
    }
    @variant dark {
      --color-background: oklch(0.145 0 0); --color-foreground: oklch(0.985 0 0);
      --color-card: oklch(0.205 0 0); --color-card-foreground: oklch(0.985 0 0);
      --color-popover: oklch(0.205 0 0); --color-popover-foreground: oklch(0.985 0 0);
      --color-primary: oklch(0.922 0 0); --color-primary-foreground: oklch(0.205 0 0);
      --color-secondary: oklch(0.269 0 0); --color-secondary-foreground: oklch(0.985 0 0);
      --color-muted: oklch(0.269 0 0); --color-muted-foreground: oklch(0.708 0 0);
      --color-accent: oklch(0.269 0 0); --color-accent-foreground: oklch(0.985 0 0);
      --color-destructive: oklch(0.704 0.191 22.216); --color-border: oklch(1 0 0 / 10%);
      --color-input: oklch(1 0 0 / 15%); --color-ring: oklch(0.556 0 0);
    }
  }
}
`);
    return;
  }

  writeFile(path.join(dir, 'babel.config.js'), `module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
`);
  writeFile(path.join(dir, 'metro.config.js'), `const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css', inlineRem: 16 });
`);
  writeFile(path.join(dir, 'nativewind-env.d.ts'), '/// <reference types="nativewind/types" />\n');
  writeFile(path.join(dir, 'tailwind.config.js'), `const { hairlineWidth } = require('nativewind/theme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))', input: 'hsl(var(--input))', ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))', foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      borderWidth: { hairline: hairlineWidth() },
    },
  },
  future: { hoverOnlyWhenSupported: true },
  plugins: [require('tailwindcss-animate')],
};
`);
  writeFile(path.join(dir, 'global.css'), `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%; --foreground: 0 0% 3.9%;
    --card: 0 0% 100%; --card-foreground: 0 0% 3.9%;
    --popover: 0 0% 100%; --popover-foreground: 0 0% 3.9%;
    --primary: 0 0% 9%; --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96.1%; --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96.1%; --muted-foreground: 0 0% 45.1%;
    --accent: 0 0% 96.1%; --accent-foreground: 0 0% 9%;
    --destructive: 0 84.2% 60.2%; --destructive-foreground: 0 0% 98%;
    --border: 0 0% 89.8%; --input: 0 0% 89.8%; --ring: 0 0% 63%; --radius: 0.625rem;
  }
  .dark:root {
    --background: 0 0% 3.9%; --foreground: 0 0% 98%;
    --card: 0 0% 3.9%; --card-foreground: 0 0% 98%;
    --popover: 0 0% 3.9%; --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%; --primary-foreground: 0 0% 9%;
    --secondary: 0 0% 14.9%; --secondary-foreground: 0 0% 98%;
    --muted: 0 0% 14.9%; --muted-foreground: 0 0% 63.9%;
    --accent: 0 0% 14.9%; --accent-foreground: 0 0% 98%;
    --destructive: 0 70.9% 59.4%; --destructive-foreground: 0 0% 98%;
    --border: 0 0% 14.9%; --input: 0 0% 14.9%; --ring: 300 0% 45%;
  }
}
`);
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
  const nativeStyling = options.nativeStyling ?? 'nativewind';

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
      'eas:login': `pnpm dlx eas-cli@${TOOLCHAIN_DEPENDENCIES['eas-cli']} login`,
      'build:internal:ios': `pnpm dlx eas-cli@${TOOLCHAIN_DEPENDENCIES['eas-cli']} build --platform ios --profile preview`,
      'build:internal:android': `pnpm dlx eas-cli@${TOOLCHAIN_DEPENDENCIES['eas-cli']} build --platform android --profile preview`,
      'build:production:ios': `pnpm dlx eas-cli@${TOOLCHAIN_DEPENDENCIES['eas-cli']} build --platform ios --profile production`,
      'build:production:android': `pnpm dlx eas-cli@${TOOLCHAIN_DEPENDENCIES['eas-cli']} build --platform android --profile production`,
      'submit:ios': `pnpm dlx eas-cli@${TOOLCHAIN_DEPENDENCIES['eas-cli']} submit --platform ios --profile production --latest`,
      'submit:android': `pnpm dlx eas-cli@${TOOLCHAIN_DEPENDENCIES['eas-cli']} submit --platform android --profile production --latest`,
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
    include: [
      '**/*.ts',
      '**/*.tsx',
      '.expo/types/**/*.ts',
      'expo-env.d.ts',
      nativeStyling === 'nativewind' ? 'nativewind-env.d.ts' : 'uniwind-types.d.ts',
    ],
  }, null, 2) + '\n');
  writeReactNativeReusablesConfig(dir, nativeStyling);
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
  if (!publishableKey || publishableKey.includes('***')) {
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
  return <><ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>${stackElement}</ClerkProvider><PortalHost /></>;`
    : `  return <>${stackElement}<PortalHost /></>;`;

  writeFile(path.join(dir, 'app/_layout.tsx'), `import '@/global.css';

import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
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
    options.features.billing ? "import { useEntitlement } from '../hooks/use-entitlement';" : null,
    options.apps.api && options.features.database ? "import { ItemList } from '../components/item-list';" : null,
  ].filter((value): value is string => value !== null).join('\n');
  const reactNativeImports = options.features.nativeSubscriptions
    ? 'Button, ScrollView, StyleSheet, Text, View'
    : 'ScrollView, StyleSheet, Text, View';
  const subscriptionComponent = options.features.nativeSubscriptions
    ? `function SubscriptionControls() {
  const [state, setState] = useState<SubscriptionState>(() => getRevenueCatAvailability());
  const [isBusy, setIsBusy] = useState(false);
  const { entitlement, error, refresh } = useEntitlement();

  const openPaywall = async () => {
    setIsBusy(true);
    setState({ status: 'ready', message: 'Opening subscription options…' });
    const result = await presentPaywallIfNeeded();
    setState(result);
    if (result.status === 'success') await refresh(true);
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
      {entitlement ? <Text selectable style={styles.status}>Plan: {entitlement.entitlement} ({entitlement.status})</Text> : null}
      {error ? <Text selectable accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

`
    : '';
  const nativeSubscriptionAction = options.features.nativeSubscriptions
    ? '        <SubscriptionControls />\n'
    : '';
  const accountControls = options.features.auth ? '        <AccountControls />\n' : '';
  const itemList = options.apps.api && options.features.database ? '        <ItemList />\n' : '';

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
${accountControls}${itemList}${nativeSubscriptionAction}      </View>
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

  if (options.apps.api && options.features.database) {
    const authImport = options.features.auth ? "import { useAuth } from '@clerk/expo';\n" : '';
    const authState = options.features.auth ? '  const { isLoaded, isSignedIn, userId } = useAuth();\n' : '';
    const identityState = options.features.auth
      ? '  const identity = isLoaded && isSignedIn ? userId ?? null : null;\n'
      : "  const identity = 'public';\n";
    const authGuard = options.features.auth
      ? `  if (!isLoaded || (isSignedIn && !userId)) return <Text selectable style={styles.status}>Loading account…</Text>;
  if (!isSignedIn) return <Text selectable style={styles.status}>Sign in to use the working starter feature.</Text>;

`
      : '';
    writeFile(path.join(dir, 'components/item-list.tsx'), `import { createItem, listItems, type Item } from '@shared/api-client';
${authImport}import * as React from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { useApiClient } from '../hooks/use-api-client';

export function ItemList() {
${authState}${identityState}  const api = useApiClient();
  const [items, setItems] = React.useState<Item[]>([]);
  const [loadedIdentity, setLoadedIdentity] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'saving'>('loading');
  const [error, setError] = React.useState<string | null>(null);
  const identityRef = React.useRef(identity);
  const visibleItems = loadedIdentity === identity ? items : [];
  const visibleError = loadedIdentity === identity ? error : null;
  const isLoading = status === 'loading' || loadedIdentity !== identity;

  React.useEffect(() => {
    identityRef.current = identity;
    if (!identity) return;
    let active = true;
    setLoadedIdentity(identity);
    setItems([]);
    setName('');
    setError(null);
    setStatus('loading');
    void listItems(api).then((nextItems) => {
      if (active) setItems(nextItems);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Unable to load items');
    }).finally(() => {
      if (active) setStatus('ready');
    });
    return () => { active = false; };
  }, [api, identity]);

  const submit = async () => {
    const nextName = name.trim();
    if (!identity || !nextName || status !== 'ready' || loadedIdentity !== identity) return;
    const submittedIdentity = identity;
    setStatus('saving');
    try {
      const created = await createItem(api, { name: nextName });
      if (identityRef.current !== submittedIdentity) return;
      setItems((current) => [created, ...current]);
      setName('');
      setError(null);
    } catch (cause) {
      if (identityRef.current === submittedIdentity) {
        setError(cause instanceof Error ? cause.message : 'Unable to create item');
      }
    } finally {
      if (identityRef.current === submittedIdentity) setStatus('ready');
    }
  };

${authGuard}  return (
    <View accessibilityLabel="Working starter feature" style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>Working starter feature</Text>
      <View style={styles.form}>
        <TextInput
          accessibilityLabel="Item name"
          maxLength={120}
          onChangeText={setName}
          placeholder="Your first item"
          style={styles.input}
          value={name}
        />
        <Button
          disabled={status !== 'ready' || loadedIdentity !== identity || !name.trim()}
          onPress={() => void submit()}
          title={status === 'saving' ? 'Adding…' : 'Add item'}
        />
      </View>
      {visibleError ? (
        <Text accessibilityLiveRegion="assertive" selectable style={styles.error}>
          {visibleError}. Check DATABASE_URL, run pnpm db:migrate, and make sure the API is running.
        </Text>
      ) : null}
      {isLoading ? <Text selectable style={styles.status}>Loading items…</Text> : null}
      {!isLoading && visibleItems.length === 0 && !visibleError
        ? <Text selectable style={styles.status}>Your database is connected. Add the first item.</Text>
        : null}
      {visibleItems.map((item) => <Text key={item.id} selectable style={styles.item}>• {item.name}</Text>)}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, marginTop: 12, padding: 16, borderRadius: 12, backgroundColor: '#ffffff' },
  heading: { color: '#0f172a', fontSize: 18, fontWeight: '700' },
  form: { gap: 8 },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 12, color: '#0f172a' },
  item: { color: '#1e293b', fontSize: 15 },
  status: { color: '#475569', fontSize: 14 },
  error: { color: '#b91c1c', fontSize: 14 },
});
`);
  }

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

  if (options.apps.api) {
    writeFile(path.join(dir, 'hooks/use-api-client.ts'), options.features.auth ? `import { useAuth } from '@clerk/expo';
import { useMemo } from 'react';
import { createApiClient } from '../lib/api';

export function useApiClient() {
  const { getToken } = useAuth();
  return useMemo(() => createApiClient(() => getToken()), [getToken]);
}
` : `import { useMemo } from 'react';
import { createApiClient } from '../lib/api';

export function useApiClient() {
  return useMemo(() => createApiClient(), []);
}
`);
  }

  if (options.features.billing) {
    writeFile(path.join(dir, 'hooks/use-entitlement.ts'), `import { subscribeToSubscriptionChanges } from '@shared/realtime';
import { useAuth } from '@clerk/expo';
import * as React from 'react';
import { AppState } from 'react-native';
import { useApiClient } from './use-api-client';
${options.features.nativeSubscriptions ? "import { subscribeToRevenueCatUpdates } from '../lib/subscriptions';" : ''}

export function useEntitlement() {
  const api = useApiClient();
  const { isLoaded, isSignedIn, userId } = useAuth();
  const identity = isLoaded && isSignedIn ? userId : null;
  const [entitlement, setEntitlement] = React.useState<Awaited<ReturnType<typeof api.getEntitlement>> | null>(null);
  const [loadedIdentity, setLoadedIdentity] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const revision = React.useRef(0);
  const identityRef = React.useRef(identity);
  const refresh = React.useCallback(async (reconcile = false) => {
    if (!identity) return;
    try {
      const next = reconcile ? await api.refreshEntitlement() : await api.getEntitlement();
      if (identityRef.current !== identity) return;
      revision.current = Math.max(revision.current, next.revision);
      setEntitlement(next);
      setLoadedIdentity(identity);
      setError(null);
    } catch (cause) {
      if (identityRef.current !== identity) return;
      setLoadedIdentity(identity);
      setError(cause instanceof Error ? cause.message : 'Unable to load subscription');
    }
  }, [api, identity]);

  React.useEffect(() => {
    identityRef.current = identity;
    revision.current = 0;
    setEntitlement(null);
    setLoadedIdentity(null);
    setError(null);
    void refresh();
  }, [identity, refresh]);
  ${options.features.nativeSubscriptions ? 'React.useEffect(() => subscribeToRevenueCatUpdates(() => { void refresh(true); }), [refresh]);' : ''}
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);
  React.useEffect(() => {
    if (!identity) return;
    return subscribeToSubscriptionChanges({
      userId: identity,
      getTokenRequest: () => api.getRealtimeToken(),
      onChange: (nextRevision) => {
        if (nextRevision > revision.current) void refresh();
      },
      onError: (cause) => {
        if (identityRef.current === identity) {
          setLoadedIdentity(identity);
          setError(cause.message);
        }
      },
    });
  }, [api, identity, refresh]);
  return {
    entitlement: loadedIdentity === identity ? entitlement : null,
    error: loadedIdentity === identity ? error : null,
    refresh,
  };
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
const customerInfoListeners = new Set<() => void>();
let customerInfoListenerRegistered = false;

function ensureCustomerInfoListener(): void {
  if (customerInfoListenerRegistered || Platform.OS === 'web') return;
  Purchases.addCustomerInfoUpdateListener(() => {
    for (const listener of customerInfoListeners) listener();
  });
  customerInfoListenerRegistered = true;
}

export function subscribeToRevenueCatUpdates(listener: () => void): () => void {
  customerInfoListeners.add(listener);
  return () => customerInfoListeners.delete(listener);
}

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
    ensureCustomerInfoListener();
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
