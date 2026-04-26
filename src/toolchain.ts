export const TOOLCHAIN_CHANNELS = ['latest', 'stable'] as const;

export type ToolchainChannel = (typeof TOOLCHAIN_CHANNELS)[number];

export type ToolchainSpec = {
  verifiedAt: string | null;
  shadcn: string;
  reactNativeReusables: string;
  wxt: string;
};

const TOOLCHAIN_SPECS: Record<ToolchainChannel, ToolchainSpec> = {
  latest: {
    verifiedAt: null,
    shadcn: 'latest',
    reactNativeReusables: 'latest',
    wxt: 'latest',
  },
  stable: {
    verifiedAt: '2026-03-22',
    // renovate: datasource=npm depName=shadcn
    shadcn: '4.1.0',
    // renovate: datasource=npm depName=@react-native-reusables/cli
    reactNativeReusables: '0.5.0',
    // renovate: datasource=npm depName=wxt
    wxt: '0.20.20',
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
