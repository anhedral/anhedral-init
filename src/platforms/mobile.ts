import path from 'node:path';
import { writeReactLintConfig } from './lint.js';
import { appendGitignore, writeFile } from '../util.js';
import { childPackageName, jsString } from '../render.js';
import { MOBILE_APP_DEPENDENCIES, MOBILE_NATIVEWIND_DEPENDENCIES, EAS_CLI_VERSION, } from '../dependencies.js';
import type { ProjectOptions } from '../project.js';
function writeReactNativeReusablesConfig(dir: string): void {
    writeFile(path.join(dir, 'components.json'), JSON.stringify({
        $schema: 'https://ui.shadcn.com/schema.json',
        style: 'new-york',
        rsc: false,
        tsx: true,
        tailwind: {
            config: 'tailwind.config.js',
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
    writeFile(path.join(dir, 'components/ui/button.tsx'), `import { Pressable, Text, type PressableProps } from 'react-native';
import { cn } from '@/lib/utils';

type ButtonProps = Omit<PressableProps, 'children'> & { children: string; className?: string };

export function Button({ children, className, ...props }: ButtonProps) {
  return <Pressable accessibilityRole="button" className={cn('h-10 items-center justify-center rounded-md bg-primary px-4', className)} {...props}>
    <Text className="font-medium text-primary-foreground">{children}</Text>
  </Pressable>;
}
`);
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
    writeFile(path.join(dir, 'styles.d.ts'), "declare module '*.css';\n");
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
    const safe = unscoped
        .toLowerCase()
        .replace(/[^a-z0-9+.-]+/g, '-');
    let start = 0;
    let end = safe.length;
    while (start < end && '+.-'.includes(safe[start]!)) start++;
    while (end > start && '+.-'.includes(safe[end - 1]!)) end--;
    const normalized = safe.slice(start, end);
    const candidate = normalized || 'app';
    return /^[a-z]/.test(candidate) ? candidate : `app-${candidate}`;
}
export async function scaffoldMobile(root: string, options: ProjectOptions): Promise<void> {
    const dir = path.join(root, 'apps/mobile');
    const { projectName, displayName } = options;
    const nameLiteral = jsString(displayName);
    writeReactLintConfig(dir);
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
            'eas:login': `pnpm dlx eas-cli@${EAS_CLI_VERSION} login`,
            'build:internal:ios': `pnpm dlx eas-cli@${EAS_CLI_VERSION} build --platform ios --profile preview`,
            'build:internal:android': `pnpm dlx eas-cli@${EAS_CLI_VERSION} build --platform android --profile preview`,
            'build:production:ios': `pnpm dlx eas-cli@${EAS_CLI_VERSION} build --platform ios --profile production`,
            'build:production:android': `pnpm dlx eas-cli@${EAS_CLI_VERSION} build --platform android --profile production`,
            'submit:ios': `pnpm dlx eas-cli@${EAS_CLI_VERSION} submit --platform ios --profile production --latest`,
            'submit:android': `pnpm dlx eas-cli@${EAS_CLI_VERSION} submit --platform android --profile production --latest`,
            typecheck: 'tsc --noEmit',
            lint: 'eslint app components lib --max-warnings 0',
        },
        dependencies: { ...MOBILE_APP_DEPENDENCIES.dependencies, ...MOBILE_NATIVEWIND_DEPENDENCIES.dependencies },
        devDependencies: { ...MOBILE_APP_DEPENDENCIES.devDependencies, '@workspace/eslint-config': 'workspace:*', eslint: '9.39.1' },
    }, null, 2) + '\n');
    writeFile(path.join(dir, 'app.json'), JSON.stringify({
        expo: {
            name: displayName,
            slug: projectName.replace(/^@[^/]+\//, ''),
            version: '1.0.0',
            orientation: 'portrait',
            scheme: expoScheme(projectName),
            web: { bundler: 'metro', output: 'static' },
            plugins: ['expo-router', 'expo-status-bar'],
            experiments: { reactCompiler: true, typedRoutes: true },
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
            'nativewind-env.d.ts',
        ],
    }, null, 2) + '\n');
    writeReactNativeReusablesConfig(dir);
    writeFile(path.join(dir, 'app/_layout.tsx'), `import '@/global.css';

import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';


export default function RootLayout() {
  return <><Stack /><PortalHost /></>;
}
`);
    writeFile(path.join(dir, 'app/index.tsx'), `import { StatusBar } from 'expo-status-bar';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/button';

export default function HomeScreen() {
  return (
    <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.container}>
      <StatusBar style="auto" />
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>{${nameLiteral}}</Text>
        <Text selectable style={styles.subtitle}>Deterministic Expo application generated by Anhedral.</Text>
        <Button onPress={() => void Linking.openURL('https://docs.expo.dev')}>Learn more</Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flexGrow: 1, justifyContent: 'center', padding: 32 },
  content: { gap: 12 },
  title: { color: '#0f172a', fontSize: 34, fontWeight: '700' },
  subtitle: { color: '#475569', fontSize: 17, paddingBottom: 12 },
});
`);
    writeFile(path.join(dir, '.env.example'), '');
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
}
