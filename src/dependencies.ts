export const PACKAGE_MANAGER = 'pnpm@10.34.5';
export const NODE_ENGINE = '^20.19.0 || >=22.12.0';
// Expo SDK 56 targets React Native 0.85, whose supported Node release lines start here.
export const MOBILE_NODE_ENGINE = '^22.13.0 || ^24.3.0 || >=25';

export type DependencyMap = Record<string, string>;

export type DependencyGroup = {
  dependencies?: DependencyMap;
  devDependencies?: DependencyMap;
};

const VERIFIED_AT = '2026-07-15';

export const TOOLCHAIN_DEPENDENCIES = {
  // renovate: datasource=npm depName=shadcn
  shadcn: '4.13.0',
  // renovate: datasource=npm depName=wxt
  wxt: '0.20.27',
  // renovate: datasource=npm depName=vercel
  vercel: '56.2.1',
  // renovate: datasource=npm depName=eas-cli
  'eas-cli': '21.0.1',
  // renovate: datasource=npm depName=neonctl
  neonctl: '2.33.2',
  // renovate: datasource=npm depName=wrangler
  wrangler: '4.111.0',
} as const;

export const SECURITY_OVERRIDES: DependencyMap = {
  // renovate: datasource=npm depName=adm-zip
  'adm-zip@<0.6.0': '0.6.0',
  // renovate: datasource=npm depName=@vitejs/plugin-react
  '@vitejs/plugin-react': '5.2.0',
  // renovate: datasource=npm depName=postcss
  postcss: '8.5.19',
  // renovate: datasource=npm depName=esbuild
  'esbuild@<=0.24.2': '0.25.12',
  // renovate: datasource=npm depName=esbuild
  'esbuild@>=0.27.3 <0.28.1': '0.28.1',
  // renovate: datasource=npm depName=shell-quote
  'shell-quote@<=1.8.4': '1.10.0',
  // renovate: datasource=npm depName=sharp
  'sharp@<0.35.0': '0.35.3',
  // renovate: datasource=npm depName=tmp
  'tmp@<0.2.6': '0.2.7',
  // renovate: datasource=npm depName=uuid
  'uuid@<11.1.1': '11.1.1',
};

export const ROOT_DEPENDENCIES: DependencyGroup = {
  devDependencies: {
    // renovate: datasource=npm depName=turbo
    turbo: '2.9.14',
  },
};

export const SHARED_DB_DEPENDENCIES: DependencyGroup = {
  dependencies: {
    // renovate: datasource=npm depName=@neondatabase/serverless
    '@neondatabase/serverless': '1.0.2',
    // renovate: datasource=npm depName=drizzle-orm
    'drizzle-orm': '0.45.2',
    // renovate: datasource=npm depName=dotenv
    dotenv: '17.2.3',
  },
  devDependencies: {
    // renovate: datasource=npm depName=drizzle-kit
    'drizzle-kit': '0.31.7',
    // renovate: datasource=npm depName=tsx
    tsx: '4.20.6',
    // renovate: datasource=npm depName=typescript
    typescript: '5.9.3',
    // renovate: datasource=npm depName=@types/node
    '@types/node': '20.19.43',
  },
};

export const SHARED_PACKAGE_DEPENDENCIES: DependencyGroup = {
  devDependencies: {
    // renovate: datasource=npm depName=typescript
    typescript: '5.9.3',
  },
};

export const CONTRACTS_DEPENDENCIES: DependencyGroup = {
  dependencies: {
    // renovate: datasource=npm depName=zod
    zod: '4.2.1',
  },
  ...SHARED_PACKAGE_DEPENDENCIES,
};

export const API_CLIENT_DEPENDENCIES: DependencyGroup = {
  dependencies: {
    '@shared/contracts': 'workspace:*',
    zod: CONTRACTS_DEPENDENCIES.dependencies!.zod,
  },
  ...SHARED_PACKAGE_DEPENDENCIES,
};

export const REALTIME_DEPENDENCIES: DependencyGroup = {
  dependencies: {
    '@shared/contracts': 'workspace:*',
    // renovate: datasource=npm depName=ably
    ably: '2.24.0',
  },
  ...SHARED_PACKAGE_DEPENDENCIES,
};

export const BACKEND_DEPENDENCIES: DependencyGroup = {
  dependencies: {
    '@shared/contracts': 'workspace:*',
    '@shared/db': 'workspace:*',
    // renovate: datasource=npm depName=fastify
    fastify: '5.8.5',
    // renovate: datasource=npm depName=@fastify/cors
    '@fastify/cors': '11.1.0',
    // renovate: datasource=npm depName=@fastify/compress
    '@fastify/compress': '8.3.0',
    // renovate: datasource=npm depName=@fastify/helmet
    '@fastify/helmet': '13.0.2',
    // renovate: datasource=npm depName=@fastify/rate-limit
    '@fastify/rate-limit': '10.3.0',
    // renovate: datasource=npm depName=@clerk/fastify
    '@clerk/fastify': '3.1.51',
    // renovate: datasource=npm depName=ably
    ably: REALTIME_DEPENDENCIES.dependencies!.ably,
    '@neondatabase/serverless': SHARED_DB_DEPENDENCIES.dependencies!['@neondatabase/serverless'],
    'drizzle-orm': SHARED_DB_DEPENDENCIES.dependencies!['drizzle-orm'],
    // renovate: datasource=npm depName=@aws-sdk/client-s3
    '@aws-sdk/client-s3': '3.1047.0',
    // renovate: datasource=npm depName=@aws-sdk/s3-request-presigner
    '@aws-sdk/s3-request-presigner': '3.1047.0',
    dotenv: SHARED_DB_DEPENDENCIES.dependencies!.dotenv,
    zod: CONTRACTS_DEPENDENCIES.dependencies!.zod,
  },
  devDependencies: {
    typescript: SHARED_DB_DEPENDENCIES.devDependencies!.typescript,
    tsx: SHARED_DB_DEPENDENCIES.devDependencies!.tsx,
    '@types/node': SHARED_DB_DEPENDENCIES.devDependencies!['@types/node'],
    // renovate: datasource=npm depName=vitest
    vitest: '4.1.0',
    // renovate: datasource=npm depName=@vitest/coverage-v8
    '@vitest/coverage-v8': '4.1.0',
  },
};

export const EXTENSION_DEPENDENCIES: DependencyGroup = {
  dependencies: {
    '@shared/api-client': 'workspace:*',
    '@shared/realtime': 'workspace:*',
    // renovate: datasource=npm depName=@clerk/chrome-extension
    '@clerk/chrome-extension': '3.1.52',
    // renovate: datasource=npm depName=react
    react: '19.2.7',
    // renovate: datasource=npm depName=react-dom
    'react-dom': '19.2.7',
    // renovate: datasource=npm depName=clsx
    clsx: '2.1.1',
    // renovate: datasource=npm depName=tailwind-merge
    'tailwind-merge': '3.4.0',
  },
  devDependencies: {
    // renovate: datasource=npm depName=@types/chrome
    '@types/chrome': '0.1.9',
    // renovate: datasource=npm depName=@types/react
    '@types/react': '19.2.7',
    // renovate: datasource=npm depName=@types/react-dom
    '@types/react-dom': '19.2.3',
    // renovate: datasource=npm depName=@wxt-dev/module-react
    '@wxt-dev/module-react': '1.2.2',
    // renovate: datasource=npm depName=autoprefixer
    autoprefixer: '10.4.23',
    // renovate: datasource=npm depName=postcss
    postcss: '8.5.19',
    // renovate: datasource=npm depName=tailwindcss
    tailwindcss: '3.4.19',
    typescript: SHARED_DB_DEPENDENCIES.devDependencies!.typescript,
    wxt: TOOLCHAIN_DEPENDENCIES.wxt,
    // renovate: datasource=npm depName=vite
    vite: '7.3.6',
  },
};

export const FRONTEND_ADDON_DEPENDENCIES: DependencyMap = {
  '@shared/api-client': 'workspace:*',
  // renovate: datasource=npm depName=@clerk/expo
  '@clerk/expo': '3.7.5',
  // renovate: datasource=npm depName=expo-secure-store
  'expo-secure-store': '56.0.4',
  // renovate: datasource=npm depName=react-native-purchases
  'react-native-purchases': '10.4.2',
  // renovate: datasource=npm depName=react-native-purchases-ui
  'react-native-purchases-ui': '10.4.2',
};

export const MOBILE_APP_DEPENDENCIES: DependencyGroup = {
  dependencies: {
    '@shared/api-client': 'workspace:*',
    '@shared/realtime': 'workspace:*',
    '@rn-primitives/portal': '1.5.2',
    '@rn-primitives/slot': '1.5.2',
    // renovate: datasource=npm depName=class-variance-authority
    'class-variance-authority': '0.7.1',
    clsx: EXTENSION_DEPENDENCIES.dependencies!.clsx,
    // renovate: datasource=npm depName=expo
    expo: '56.0.16',
    // renovate: datasource=npm depName=expo-constants
    'expo-constants': '56.0.21',
    // renovate: datasource=npm depName=expo-linking
    'expo-linking': '56.0.15',
    // renovate: datasource=npm depName=expo-router
    'expo-router': '56.2.15',
    // renovate: datasource=npm depName=expo-status-bar
    'expo-status-bar': '56.0.4',
    // renovate: datasource=npm depName=expo-system-ui
    'expo-system-ui': '56.0.5',
    // renovate: datasource=npm depName=lucide-react-native
    'lucide-react-native': '1.21.0',
    react: EXTENSION_DEPENDENCIES.dependencies!.react,
    'react-dom': EXTENSION_DEPENDENCIES.dependencies!['react-dom'],
    // renovate: datasource=npm depName=react-native
    'react-native': '0.85.3',
    // renovate: datasource=npm depName=react-native-gesture-handler
    'react-native-gesture-handler': '2.31.1',
    // renovate: datasource=npm depName=react-native-reanimated
    'react-native-reanimated': '4.3.1',
    // renovate: datasource=npm depName=react-native-safe-area-context
    'react-native-safe-area-context': '5.7.0',
    // renovate: datasource=npm depName=react-native-screens
    'react-native-screens': '4.25.2',
    // renovate: datasource=npm depName=react-native-worklets
    'react-native-worklets': '0.8.3',
    // renovate: datasource=npm depName=react-native-web
    'react-native-web': '0.21.0',
    // renovate: datasource=npm depName=react-native-svg
    'react-native-svg': '15.15.4',
    'tailwind-merge': '3.5.0',
    // renovate: datasource=npm depName=tailwindcss-animate
    'tailwindcss-animate': '1.0.7',
  },
  devDependencies: {
    // renovate: datasource=npm depName=@babel/core
    '@babel/core': '7.29.6',
    // expo-router's web test utilities expose @testing-library/user-event, whose DOM peer is explicit when autoInstallPeers is disabled.
    // renovate: datasource=npm depName=@testing-library/dom
    '@testing-library/dom': '10.4.1',
    // renovate: datasource=npm depName=@react-native/metro-config
    '@react-native/metro-config': '0.85.3',
    // renovate: datasource=npm depName=@types/react
    '@types/react': '19.2.10',
    // renovate: datasource=npm depName=typescript
    typescript: '6.0.3',
  },
};

export const MOBILE_NATIVEWIND_DEPENDENCIES: DependencyGroup = {
  dependencies: {
    // renovate: datasource=npm depName=nativewind
    nativewind: '4.2.6',
    // NativeWind's Babel transform imports this runtime from application code,
    // so pnpm's strict linker requires it as a direct dependency.
    // renovate: datasource=npm depName=react-native-css-interop
    'react-native-css-interop': '0.2.6',
    tailwindcss: EXTENSION_DEPENDENCIES.devDependencies!.tailwindcss,
  },
};

export const MOBILE_UNIWIND_DEPENDENCIES: DependencyGroup = {
  dependencies: {
    // renovate: datasource=npm depName=uniwind
    uniwind: '1.9.0',
    // renovate: datasource=npm depName=tailwindcss
    tailwindcss: '4.2.1',
    // renovate: datasource=npm depName=tw-animate-css
    'tw-animate-css': '1.4.0',
  },
};

export const WEB_APP_DEPENDENCIES: DependencyGroup = {
  dependencies: {
    '@shared/api-client': 'workspace:*',
    '@shared/realtime': 'workspace:*',
    // renovate: datasource=npm depName=@clerk/nextjs
    '@clerk/nextjs': '7.5.18',
    // renovate: datasource=npm depName=@clerk/ui
    '@clerk/ui': '1.25.3',
    // renovate: datasource=npm depName=next
    next: '16.2.11',
    // renovate: datasource=npm depName=react
    react: EXTENSION_DEPENDENCIES.dependencies!.react,
    // renovate: datasource=npm depName=react-dom
    'react-dom': EXTENSION_DEPENDENCIES.dependencies!['react-dom'],
    clsx: EXTENSION_DEPENDENCIES.dependencies!.clsx,
    'tailwind-merge': EXTENSION_DEPENDENCIES.dependencies!['tailwind-merge'],
  },
  devDependencies: {
    // renovate: datasource=npm depName=@tailwindcss/postcss
    '@tailwindcss/postcss': '4.1.18',
    // renovate: datasource=npm depName=tailwindcss
    tailwindcss: '4.1.18',
    '@types/node': SHARED_DB_DEPENDENCIES.devDependencies!['@types/node'],
    '@types/react': EXTENSION_DEPENDENCIES.devDependencies!['@types/react'],
    '@types/react-dom': EXTENSION_DEPENDENCIES.devDependencies!['@types/react-dom'],
    typescript: SHARED_DB_DEPENDENCIES.devDependencies!.typescript,
  },
};

export const DESKTOP_DEPENDENCIES: DependencyGroup = {
  dependencies: {
    '@shared/api-client': 'workspace:*',
    '@shared/realtime': 'workspace:*',
    // renovate: datasource=npm depName=@clerk/clerk-js
    '@clerk/clerk-js': '6.25.3',
    '@clerk/ui': WEB_APP_DEPENDENCIES.dependencies!['@clerk/ui'],
    // Clerk's browser bundle imports @solana/wallet-adapter-react, whose web3 peer must be explicit when autoInstallPeers is disabled.
    // renovate: datasource=npm depName=@solana/web3.js
    '@solana/web3.js': '1.98.4',
    // Clerk's Solana wallet adapter expects the current bs58 peer alongside web3.js.
    // renovate: datasource=npm depName=bs58
    bs58: '6.0.0',
    react: EXTENSION_DEPENDENCIES.dependencies!.react,
    'react-dom': EXTENSION_DEPENDENCIES.dependencies!['react-dom'],
    clsx: EXTENSION_DEPENDENCIES.dependencies!.clsx,
    'tailwind-merge': EXTENSION_DEPENDENCIES.dependencies!['tailwind-merge'],
  },
  devDependencies: {
    '@tailwindcss/postcss': WEB_APP_DEPENDENCIES.devDependencies!['@tailwindcss/postcss'],
    // renovate: datasource=npm depName=@vitejs/plugin-react
    '@vitejs/plugin-react': '5.2.0',
    '@types/node': SHARED_DB_DEPENDENCIES.devDependencies!['@types/node'],
    '@types/react': EXTENSION_DEPENDENCIES.devDependencies!['@types/react'],
    '@types/react-dom': EXTENSION_DEPENDENCIES.devDependencies!['@types/react-dom'],
    // renovate: datasource=npm depName=electron
    electron: '43.1.1',
    // renovate: datasource=npm depName=electron-builder
    'electron-builder': '26.15.3',
    // renovate: datasource=npm depName=electron-builder-squirrel-windows
    'electron-builder-squirrel-windows': '26.15.3',
    // renovate: datasource=npm depName=tailwindcss
    tailwindcss: '4.1.18',
    postcss: EXTENSION_DEPENDENCIES.devDependencies!.postcss,
    typescript: SHARED_DB_DEPENDENCIES.devDependencies!.typescript,
    // renovate: datasource=npm depName=vite
    vite: '7.3.6',
  },
};

export const ELECTRON_UPDATER_DEPENDENCIES: DependencyGroup = {
  dependencies: {
    // renovate: datasource=npm depName=electron-updater
    'electron-updater': '6.8.9',
  },
};

export function dependencyManifest() {
  return {
    verifiedAt: VERIFIED_AT,
    packageManager: PACKAGE_MANAGER,
    toolchain: TOOLCHAIN_DEPENDENCIES,
    securityOverrides: SECURITY_OVERRIDES,
    root: ROOT_DEPENDENCIES,
    contracts: CONTRACTS_DEPENDENCIES,
    sharedDb: SHARED_DB_DEPENDENCIES,
    sharedPackages: SHARED_PACKAGE_DEPENDENCIES,
    realtime: REALTIME_DEPENDENCIES,
    backend: BACKEND_DEPENDENCIES,
    extension: EXTENSION_DEPENDENCIES,
    frontendAddons: FRONTEND_ADDON_DEPENDENCIES,
    mobileApp: MOBILE_APP_DEPENDENCIES,
    mobileNativewind: MOBILE_NATIVEWIND_DEPENDENCIES,
    mobileUniwind: MOBILE_UNIWIND_DEPENDENCIES,
    webApp: WEB_APP_DEPENDENCIES,
    desktop: DESKTOP_DEPENDENCIES,
    electronUpdater: ELECTRON_UPDATER_DEPENDENCIES,
  };
}
