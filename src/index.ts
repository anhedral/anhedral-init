#!/usr/bin/env tsx

import path from 'node:path';
import { argv, env, exit } from 'node:process';
import { STACK_IDS, scaffoldProject, type InitMode, type InitOptions } from './scaffold.js';
import { TOOLCHAIN_CHANNELS, resolveToolchainChannel } from './toolchain.js';

const USAGE = `
anhedral init <next|next-fullstack|expo-fullstack|backend> [--toolchain <latest|stable>]

Commands:
  anhedral init next
    Next.js App Router, shadcn/ui, Tailwind CSS, TypeScript, Drizzle ORM, Neon Postgres, Clerk Auth, Stripe, Cloudflare R2

  anhedral init next-fullstack
    Next.js App Router, shadcn/ui, Tailwind CSS, TypeScript, Fastify, Drizzle ORM, Neon Postgres, Clerk Auth, Stripe, Cloudflare R2

  anhedral init expo-fullstack
    Expo, NativeWind/Tailwind CSS, TypeScript, Fastify, Drizzle ORM, Neon Postgres, Clerk Auth, RevenueCat + Stripe, Cloudflare R2

  anhedral init backend
    Fastify, TypeScript, Drizzle ORM, Neon Postgres, Clerk Auth or Better Auth, Stripe-ready integrations, Cloudflare R2
`;

type ParsedFlags = {
  stack?: string;
  toolchain?: string;
};

function parseCli(args: string[]): ParsedFlags {
  const flags: ParsedFlags = {
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (!token.startsWith('--')) {
      if (flags.stack != null) {
        throw new Error(`Unknown flag: ${token}`);
      }
      flags.stack = token;
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

  if (!flags.stack) {
    throw new Error(`Missing stack. Choose one of: ${STACK_IDS.join(', ')}`);
  }

  return flags;
}

function resolveMode(flags: ParsedFlags): InitMode {
  if (!STACK_IDS.includes(flags.stack as InitMode)) {
    throw new Error(`Unknown stack: ${flags.stack}. Choose one of: ${STACK_IDS.join(', ')}`);
  }

  return flags.stack as InitMode;
}

function deriveProjectName(cwd: string): string {
  const base = path.basename(cwd);
  const sanitized = base
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || 'anhedral-app';
}

function deriveDisplayName(cwd: string): string {
  const base = path.basename(cwd).trim();
  return base || 'Anhedral App';
}

function buildOptions(flags: ParsedFlags): InitOptions {
  const cwd = process.cwd();
  const mode = resolveMode(flags);
  const projectName = deriveProjectName(cwd);
  const displayName = deriveDisplayName(cwd);

  if (flags.toolchain != null && !TOOLCHAIN_CHANNELS.includes(flags.toolchain as (typeof TOOLCHAIN_CHANNELS)[number])) {
    throw new Error(`--toolchain must be one of: ${TOOLCHAIN_CHANNELS.join(', ')}`);
  }

  switch (mode) {
    case 'next':
      return {
        mode,
        projectName,
        displayName,
        auth: 'clerk',
        payments: 'stripe',
        db: 'neon',
        orm: 'drizzle',
        storage: 'r2',
        api: null,
        monorepo: false,
        toolchainChannel: resolveToolchainChannel(flags.toolchain ?? env.ANHEDRAL_TOOLCHAIN),
      };
    case 'next-fullstack':
      return {
        mode,
        projectName,
        displayName,
        auth: 'clerk',
        payments: 'stripe',
        db: 'neon',
        orm: 'drizzle',
        storage: 'r2',
        api: 'fastify',
        monorepo: true,
        toolchainChannel: resolveToolchainChannel(flags.toolchain ?? env.ANHEDRAL_TOOLCHAIN),
      };
    case 'expo-fullstack':
      return {
        mode,
        projectName,
        displayName,
        auth: 'clerk',
        payments: 'revenuecat',
        db: 'neon',
        orm: 'drizzle',
        storage: 'r2',
        api: 'fastify',
        monorepo: true,
        toolchainChannel: resolveToolchainChannel(flags.toolchain ?? env.ANHEDRAL_TOOLCHAIN),
      };
    case 'backend':
      return {
        mode,
        projectName,
        displayName,
        auth: 'betterauth',
        payments: 'none',
        db: 'neon',
        orm: 'drizzle',
        storage: 'r2',
        api: 'fastify',
        monorepo: false,
        toolchainChannel: resolveToolchainChannel(flags.toolchain ?? env.ANHEDRAL_TOOLCHAIN),
      };
  }
}

async function main(): Promise<void> {
  const args = argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    exit(0);
  }

  if (command !== 'init') {
    console.error(`Unknown command: ${command}`);
    console.log(USAGE);
    exit(1);
  }

  try {
    const rawArgs = args.slice(1);
    const options = buildOptions(parseCli(rawArgs));
    await scaffoldProject(options);
  } catch (error) {
    console.error('Error:', (error as Error).message);
    exit(1);
  }
}

main();
