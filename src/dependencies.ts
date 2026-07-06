export const PACKAGE_MANAGER = 'pnpm@10.15.1';

export type DependencyMap = Record<string, string>;

export type DependencyGroup = {
  dependencies?: DependencyMap;
  devDependencies?: DependencyMap;
};

export const VERIFIED_AT = '2026-04-26';

export const TOOLCHAIN_DEPENDENCIES = {
  // renovate: datasource=npm depName=shadcn
  shadcn: '4.5.0',
  // renovate: datasource=npm depName=@react-native-reusables/cli
  reactNativeReusables: '0.7.1',
  // renovate: datasource=npm depName=wxt
  wxt: '0.20.25',
} as const;

export const ROOT_DEPENDENCIES: DependencyGroup = {
  devDependencies: {
    // renovate: datasource=npm depName=turbo
    turbo: '2.8.0',
  },
};

export const SHARED_DB_DEPENDENCIES: DependencyGroup = {
  dependencies: {
    // renovate: datasource=npm depName=@neondatabase/serverless
    '@neondatabase/serverless': '1.0.2',
    // renovate: datasource=npm depName=drizzle-orm
    'drizzle-orm': '0.44.7',
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
    '@types/node': '25.6.0',
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
    '@shared/config': 'workspace:*',
    '@shared/contracts': 'workspace:*',
    '@shared/types': 'workspace:*',
    zod: CONTRACTS_DEPENDENCIES.dependencies!.zod,
  },
  ...SHARED_PACKAGE_DEPENDENCIES,
};

export const BACKEND_DEPENDENCIES: DependencyGroup = {
  dependencies: {
    '@shared/contracts': 'workspace:*',
    '@shared/db': 'workspace:*',
    // renovate: datasource=npm depName=fastify
    fastify: '5.6.2',
    // renovate: datasource=npm depName=fastify-plugin
    'fastify-plugin': '5.1.0',
    // renovate: datasource=npm depName=@fastify/cors
    '@fastify/cors': '11.1.0',
    // renovate: datasource=npm depName=@fastify/env
    '@fastify/env': '5.0.3',
    // renovate: datasource=npm depName=@fastify/compress
    '@fastify/compress': '8.3.0',
    // renovate: datasource=npm depName=@fastify/helmet
    '@fastify/helmet': '13.0.2',
    // renovate: datasource=npm depName=@fastify/rate-limit
    '@fastify/rate-limit': '10.3.0',
    // renovate: datasource=npm depName=@fastify/swagger
    '@fastify/swagger': '9.6.1',
    // renovate: datasource=npm depName=@fastify/swagger-ui
    '@fastify/swagger-ui': '5.2.3',
    // renovate: datasource=npm depName=@fastify/multipart
    '@fastify/multipart': '9.3.0',
    // renovate: datasource=npm depName=@clerk/fastify
    '@clerk/fastify': '3.1.26',
    '@neondatabase/serverless': SHARED_DB_DEPENDENCIES.dependencies!['@neondatabase/serverless'],
    'drizzle-orm': SHARED_DB_DEPENDENCIES.dependencies!['drizzle-orm'],
    // renovate: datasource=npm depName=@aws-sdk/client-s3
    '@aws-sdk/client-s3': '3.1047.0',
    // renovate: datasource=npm depName=@aws-sdk/lib-storage
    '@aws-sdk/lib-storage': '3.1047.0',
    // renovate: datasource=npm depName=@aws-sdk/s3-request-presigner
    '@aws-sdk/s3-request-presigner': '3.1047.0',
    dotenv: SHARED_DB_DEPENDENCIES.dependencies!.dotenv,
    zod: CONTRACTS_DEPENDENCIES.dependencies!.zod,
  },
  devDependencies: {
    typescript: SHARED_DB_DEPENDENCIES.devDependencies!.typescript,
    tsx: SHARED_DB_DEPENDENCIES.devDependencies!.tsx,
    '@types/node': SHARED_DB_DEPENDENCIES.devDependencies!['@types/node'],
    'drizzle-kit': SHARED_DB_DEPENDENCIES.devDependencies!['drizzle-kit'],
    // renovate: datasource=npm depName=vitest
    vitest: '4.0.16',
    // renovate: datasource=npm depName=@vitest/coverage-v8
    '@vitest/coverage-v8': '4.0.16',
    // renovate: datasource=npm depName=eslint
    eslint: '9.39.2',
    // renovate: datasource=npm depName=@eslint/js
    '@eslint/js': '9.39.2',
    // renovate: datasource=npm depName=globals
    globals: '16.5.0',
    // renovate: datasource=npm depName=typescript-eslint
    'typescript-eslint': '8.49.0',
    // renovate: datasource=npm depName=pino-pretty
    'pino-pretty': '13.1.3',
  },
};

export const EXTENSION_DEPENDENCIES: DependencyGroup = {
  dependencies: {
    '@shared/api-client': 'workspace:*',
    // renovate: datasource=npm depName=@clerk/chrome-extension
    '@clerk/chrome-extension': '3.1.25',
    // renovate: datasource=npm depName=react
    react: '19.2.3',
    // renovate: datasource=npm depName=react-dom
    'react-dom': '19.2.3',
    // renovate: datasource=npm depName=clsx
    clsx: '2.1.1',
    // renovate: datasource=npm depName=tailwind-merge
    'tailwind-merge': '3.4.0',
    // renovate: datasource=npm depName=class-variance-authority
    'class-variance-authority': '0.7.1',
    // renovate: datasource=npm depName=lucide-react
    'lucide-react': '0.562.0',
  },
  devDependencies: {
    // renovate: datasource=npm depName=@types/chrome
    '@types/chrome': '0.1.9',
    // renovate: datasource=npm depName=@types/react
    '@types/react': '19.2.7',
    // renovate: datasource=npm depName=@types/react-dom
    '@types/react-dom': '19.2.3',
    // renovate: datasource=npm depName=@wxt-dev/module-react
    '@wxt-dev/module-react': '1.1.5',
    // renovate: datasource=npm depName=autoprefixer
    autoprefixer: '10.4.23',
    // renovate: datasource=npm depName=postcss
    postcss: '8.5.6',
    // renovate: datasource=npm depName=tailwindcss
    tailwindcss: '3.4.19',
    typescript: SHARED_DB_DEPENDENCIES.devDependencies!.typescript,
    wxt: TOOLCHAIN_DEPENDENCIES.wxt,
  },
};

export const FRONTEND_ADDON_DEPENDENCIES: DependencyMap = {
  '@shared/api-client': 'workspace:*',
  // renovate: datasource=npm depName=@clerk/expo
  '@clerk/expo': '3.2.11',
  // renovate: datasource=npm depName=react-native-purchases
  'react-native-purchases': '10.1.1',
  // renovate: datasource=npm depName=react-native-purchases-ui
  'react-native-purchases-ui': '10.1.1',
  // renovate: datasource=npm depName=@revenuecat/purchases-js
  '@revenuecat/purchases-js': '1.11.1',
};

export const WEB_APP_DEPENDENCIES: DependencyGroup = {
  dependencies: {
    '@shared/api-client': 'workspace:*',
    // renovate: datasource=npm depName=@clerk/nextjs
    '@clerk/nextjs': '7.4.2',
    // renovate: datasource=npm depName=next
    next: '16.1.1',
    // renovate: datasource=npm depName=react
    react: EXTENSION_DEPENDENCIES.dependencies!.react,
    // renovate: datasource=npm depName=react-dom
    'react-dom': EXTENSION_DEPENDENCIES.dependencies!['react-dom'],
    clsx: EXTENSION_DEPENDENCIES.dependencies!.clsx,
    'tailwind-merge': EXTENSION_DEPENDENCIES.dependencies!['tailwind-merge'],
    'class-variance-authority': EXTENSION_DEPENDENCIES.dependencies!['class-variance-authority'],
    'lucide-react': EXTENSION_DEPENDENCIES.dependencies!['lucide-react'],
  },
  devDependencies: {
    // renovate: datasource=npm depName=@tailwindcss/postcss
    '@tailwindcss/postcss': '4.1.18',
    '@types/node': SHARED_DB_DEPENDENCIES.devDependencies!['@types/node'],
    '@types/react': EXTENSION_DEPENDENCIES.devDependencies!['@types/react'],
    '@types/react-dom': EXTENSION_DEPENDENCIES.devDependencies!['@types/react-dom'],
    typescript: SHARED_DB_DEPENDENCIES.devDependencies!.typescript,
  },
};

export const DESKTOP_DEPENDENCIES: DependencyGroup = {
  dependencies: {
    '@shared/api-client': 'workspace:*',
    // renovate: datasource=npm depName=@clerk/clerk-js
    '@clerk/clerk-js': '6.23.0',
    react: EXTENSION_DEPENDENCIES.dependencies!.react,
    'react-dom': EXTENSION_DEPENDENCIES.dependencies!['react-dom'],
    clsx: EXTENSION_DEPENDENCIES.dependencies!.clsx,
    'tailwind-merge': EXTENSION_DEPENDENCIES.dependencies!['tailwind-merge'],
    'class-variance-authority': EXTENSION_DEPENDENCIES.dependencies!['class-variance-authority'],
    'lucide-react': EXTENSION_DEPENDENCIES.dependencies!['lucide-react'],
  },
  devDependencies: {
    // renovate: datasource=npm depName=@vitejs/plugin-react
    '@vitejs/plugin-react': '5.1.2',
    '@types/node': SHARED_DB_DEPENDENCIES.devDependencies!['@types/node'],
    '@types/react': EXTENSION_DEPENDENCIES.devDependencies!['@types/react'],
    '@types/react-dom': EXTENSION_DEPENDENCIES.devDependencies!['@types/react-dom'],
    // renovate: datasource=npm depName=electron
    electron: '39.2.7',
    // renovate: datasource=npm depName=electron-builder
    'electron-builder': '26.0.12',
    typescript: SHARED_DB_DEPENDENCIES.devDependencies!.typescript,
    // renovate: datasource=npm depName=vite
    vite: '7.3.0',
  },
};

export const NEXT_TEMPLATE_DEPENDENCIES: DependencyGroup = {
  dependencies: {
    // renovate: datasource=npm depName=@clerk/nextjs
    '@clerk/nextjs': '7.4.2',
    '@neondatabase/serverless': SHARED_DB_DEPENDENCIES.dependencies!['@neondatabase/serverless'],
    'drizzle-orm': SHARED_DB_DEPENDENCIES.dependencies!['drizzle-orm'],
    // renovate: datasource=npm depName=stripe
    stripe: '20.1.2',
    // renovate: datasource=npm depName=@aws-sdk/client-s3
    '@aws-sdk/client-s3': BACKEND_DEPENDENCIES.dependencies!['@aws-sdk/client-s3'],
    // renovate: datasource=npm depName=@aws-sdk/s3-request-presigner
    '@aws-sdk/s3-request-presigner': BACKEND_DEPENDENCIES.dependencies!['@aws-sdk/s3-request-presigner'],
    dotenv: SHARED_DB_DEPENDENCIES.dependencies!.dotenv,
    zod: CONTRACTS_DEPENDENCIES.dependencies!.zod,
  },
  devDependencies: {
    'drizzle-kit': SHARED_DB_DEPENDENCIES.devDependencies!['drizzle-kit'],
    tsx: SHARED_DB_DEPENDENCIES.devDependencies!.tsx,
  },
};

export function withVersions(dependencies: DependencyMap): string[] {
  return Object.entries(dependencies).map(([name, version]) => {
    if (version === 'workspace:*') return `${name}@workspace:*`;
    return `${name}@${version}`;
  });
}

export function dependencyManifest() {
  return {
    verifiedAt: VERIFIED_AT,
    packageManager: PACKAGE_MANAGER,
    toolchain: TOOLCHAIN_DEPENDENCIES,
    root: ROOT_DEPENDENCIES,
    contracts: CONTRACTS_DEPENDENCIES,
    sharedDb: SHARED_DB_DEPENDENCIES,
    sharedPackages: SHARED_PACKAGE_DEPENDENCIES,
    backend: BACKEND_DEPENDENCIES,
    extension: EXTENSION_DEPENDENCIES,
    frontendAddons: FRONTEND_ADDON_DEPENDENCIES,
    webApp: WEB_APP_DEPENDENCIES,
    desktop: DESKTOP_DEPENDENCIES,
    nextTemplate: NEXT_TEMPLATE_DEPENDENCIES,
  };
}
