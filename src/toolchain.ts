export const TOOLCHAIN_CHANNELS = ['latest', 'stable'] as const;

export type ToolchainChannel = (typeof TOOLCHAIN_CHANNELS)[number];

export type ToolchainSpec = {
  verifiedAt: string | null;
  viteCreate: string;
  shadcn: string;
  reactNativeReusables: string;
  wxt: string;
  tauriCli: string;
  tauriApi: string;
};

const TOOLCHAIN_SPECS: Record<ToolchainChannel, ToolchainSpec> = {
  latest: {
    verifiedAt: null,
    viteCreate: 'latest',
    shadcn: 'latest',
    reactNativeReusables: 'latest',
    wxt: 'latest',
    tauriCli: 'latest',
    tauriApi: 'latest',
  },
  stable: {
    verifiedAt: '2026-03-22',
    // renovate: datasource=npm depName=create-vite
    viteCreate: '7.1.4',
    // renovate: datasource=npm depName=shadcn
    shadcn: '4.1.0',
    // renovate: datasource=npm depName=@react-native-reusables/cli
    reactNativeReusables: '0.5.0',
    // renovate: datasource=npm depName=wxt
    wxt: '0.20.20',
    // renovate: datasource=npm depName=@tauri-apps/cli
    tauriCli: '2.8.4',
    // renovate: datasource=npm depName=@tauri-apps/api
    tauriApi: '2.8.0',
  },
};

export function resolveToolchainChannel(value: string | undefined): ToolchainChannel {
  if (!value) return 'stable';
  if (value === 'latest' || value === 'stable') return value;
  throw new Error(`--toolchain must be one of: ${TOOLCHAIN_CHANNELS.join(', ')}`);
}

export function resolveToolchain(channel: ToolchainChannel): ToolchainSpec {
  return TOOLCHAIN_SPECS[channel];
}

export function toolPackageRef(pkg: string, versionTag: string): string {
  return `${pkg}@${versionTag}`;
}
