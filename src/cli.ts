import path from 'node:path';
import { env } from 'node:process';
import type { InitOptions } from './scaffold.js';
import { TOOLCHAIN_CHANNELS, resolveToolchainChannel } from './toolchain.js';

export const USAGE = `
anhedral init [--template <fullstack|next>] [--toolchain <latest|stable>] [--skip-install]

Commands:
  anhedral init
    Expo + React Native Reusables, Fastify, WXT extension, Neon + Drizzle, Cloudflare R2/CDN, Clerk, RevenueCat + Stripe, Vercel
  anhedral init --template next
    Next.js + shadcn/ui, Neon + Drizzle, Cloudflare R2/CDN, Clerk, Stripe, Vercel
`;

export type ParsedFlags = {
  template?: string;
  toolchain?: string;
  skipInstall?: boolean;
};

export function parseCli(args: string[]): ParsedFlags {
  const flags: ParsedFlags = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}. Use flags: --template, --toolchain, --skip-install`);
    }

    if (token === '--skip-install') {
      flags.skipInstall = true;
      continue;
    }

    if (token === '--template') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --template');
      }
      flags.template = value;
      index += 1;
      continue;
    }

    if (token.startsWith('--template=')) {
      const value = token.slice('--template='.length);
      if (!value) {
        throw new Error('Missing value for --template');
      }
      flags.template = value;
      continue;
    }

    if (token === '--toolchain') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --toolchain');
      }
      flags.toolchain = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown flag: ${token}`);
  }

  return flags;
}

export function deriveProjectName(cwd: string): string {
  const base = path.basename(cwd);
  const sanitized = base
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || 'anhedral-app';
}

export function deriveDisplayName(cwd: string): string {
  const base = path.basename(cwd).trim();
  return base || 'Anhedral App';
}

export function buildOptions(flags: ParsedFlags): InitOptions {
  const cwd = process.cwd();
  const projectName = deriveProjectName(cwd);
  const displayName = deriveDisplayName(cwd);
  const template = flags.template ?? 'fullstack';

  if (!['fullstack', 'next', 'nextjs'].includes(template)) {
    throw new Error('--template must be one of: fullstack, next');
  }

  if (flags.toolchain != null && !TOOLCHAIN_CHANNELS.includes(flags.toolchain as (typeof TOOLCHAIN_CHANNELS)[number])) {
    throw new Error(`--toolchain must be one of: ${TOOLCHAIN_CHANNELS.join(', ')}`);
  }

  const normalizedTemplate = template === 'nextjs' ? 'next' : template as 'fullstack' | 'next';

  return {
    template: normalizedTemplate,
    projectName,
    displayName,
    auth: 'clerk',
    payments: normalizedTemplate === 'next' ? 'stripe' : 'revenuecat_stripe',
    db: 'neon',
    orm: 'drizzle',
    storage: 'r2',
    api: normalizedTemplate === 'next' ? 'nextjs_route_handlers' : 'fastify',
    skipInstall: flags.skipInstall === true || env.ANHEDRAL_SKIP_INSTALL === '1',
    toolchainChannel: resolveToolchainChannel(flags.toolchain ?? env.ANHEDRAL_TOOLCHAIN),
  };
}
