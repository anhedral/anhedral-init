export const TOOLCHAIN_CHANNELS = ['latest', 'stable'] as const;

export type ToolchainChannel = (typeof TOOLCHAIN_CHANNELS)[number];

export function resolveToolchainChannel(value: string | undefined): ToolchainChannel {
  if (!value) return 'stable';
  if (value === 'latest' || value === 'stable') return value;
  throw new Error(`--toolchain must be one of: ${TOOLCHAIN_CHANNELS.join(', ')}`);
}
