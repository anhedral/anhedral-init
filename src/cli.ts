import path from 'node:path';
import { env } from 'node:process';
import type { FrontendMode, InitOptions } from './scaffold.js';
import { TOOLCHAIN_CHANNELS, resolveToolchainChannel } from './toolchain.js';

export const DEFAULT_FRONTEND_MODE: FrontendMode = 'expo';

export const USAGE = `
anhedral init [--next] [--extension] [--toolchain <latest|stable>]

Commands:
  anhedral init
    Expo, Fastify, Drizzle ORM, Neon Postgres, Clerk Auth, RevenueCat + Stripe, Cloudflare R2, shared packages

  anhedral init --next
    Next.js App Router, shadcn/ui, Tailwind CSS, TypeScript, Fastify, Drizzle ORM, Neon Postgres, Clerk Auth, Stripe, Cloudflare R2, shared packages

  anhedral init --extension
    Expo + Fastify plus a WXT Chrome extension

  anhedral init --next --extension
    Next.js + Fastify plus a WXT Chrome extension
`;

export type ParsedFlags = {
  next: boolean;
  extension: boolean;
  toolchain?: string;
};

export function parseCli(args: string[]): ParsedFlags {
  const flags: ParsedFlags = {
    next: false,
    extension: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}. Use flags: --next, --extension, --toolchain`);
    }

    if (token === '--next') {
      flags.next = true;
      continue;
    }

    if (token === '--extension') {
      flags.extension = true;
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

  if (flags.toolchain != null && !TOOLCHAIN_CHANNELS.includes(flags.toolchain as (typeof TOOLCHAIN_CHANNELS)[number])) {
    throw new Error(`--toolchain must be one of: ${TOOLCHAIN_CHANNELS.join(', ')}`);
  }

  return {
    frontend: flags.next ? 'next' : DEFAULT_FRONTEND_MODE,
    extension: flags.extension,
    projectName,
    displayName,
    auth: 'clerk',
    payments: flags.next ? 'stripe' : 'revenuecat',
    db: 'neon',
    orm: 'drizzle',
    storage: 'r2',
    api: 'fastify',
    monorepo: true,
    toolchainChannel: resolveToolchainChannel(flags.toolchain ?? env.ANHEDRAL_TOOLCHAIN),
  };
}
