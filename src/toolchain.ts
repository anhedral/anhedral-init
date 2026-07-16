import { TOOLCHAIN_DEPENDENCIES, VERIFIED_AT } from './dependencies.js';

export const TOOLCHAIN_CHANNELS = ['latest', 'stable'] as const;

export type ToolchainChannel = (typeof TOOLCHAIN_CHANNELS)[number];

export type ToolchainSpec = {
  verifiedAt: string | null;
  shadcn: string;
  wxt: string;
};

const TOOLCHAIN_SPECS: Record<ToolchainChannel, ToolchainSpec> = {
  latest: {
    verifiedAt: null,
    shadcn: 'latest',
    wxt: 'latest',
  },
  stable: {
    verifiedAt: VERIFIED_AT,
    shadcn: TOOLCHAIN_DEPENDENCIES.shadcn,
    wxt: TOOLCHAIN_DEPENDENCIES.wxt,
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
