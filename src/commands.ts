import type { InitOptions } from './scaffold.js';
import { toolPackageRef, type ToolchainSpec } from './toolchain.js';

export type ScaffoldCommand = {
  cmd: string;
  stdinInput?: string;
  skippable?: boolean;
};

export function getDefaultWebInitCommand(toolchain: ToolchainSpec, projectName: string): ScaffoldCommand {
  return {
    cmd: [
      'pnpm',
      'dlx',
      toolPackageRef('shadcn', toolchain.shadcn),
      'init',
      '-t',
      'next',
      '-n',
      projectName,
      '-d',
      '-y',
      '--css-variables',
    ].join(' '),
  };
}

export function getDefaultWebDependencyCommands(): ScaffoldCommand[] {
  return [
    {
      cmd: 'pnpm add @clerk/nextjs drizzle-orm @neondatabase/serverless stripe @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner',
      skippable: true,
    },
    {
      cmd: 'pnpm add -D babel-plugin-react-compiler drizzle-kit tsx dotenv',
      skippable: true,
    },
  ];
}

export function getBackendInstallCommands(): ScaffoldCommand[] {
  return [
    {
      cmd: 'pnpm add fastify fastify-plugin @fastify/cors @fastify/env @fastify/compress @fastify/helmet @fastify/rate-limit @fastify/swagger @fastify/swagger-ui @fastify/multipart @clerk/fastify @neondatabase/serverless drizzle-orm @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner dotenv',
    },
    {
      cmd: 'pnpm add -D typescript@5.9.3 tsx @types/node@25.5.0 drizzle-kit vitest @vitest/coverage-v8 @vercel/node eslint@9.39.4 @eslint/js@9.39.4 globals typescript-eslint pino-pretty',
    },
  ];
}

export function getSkillCommands(options: Pick<InitOptions, 'frontend' | 'extension'>): string[] {
  const commands = [
    'pnpm dlx skills add https://github.com/clerk/skills --skill clerk-custom-ui',
    'pnpm dlx skills add https://github.com/stripe/ai --skill stripe-best-practices',
  ];

  if (options.frontend === 'expo') {
    commands.splice(1, 0, 'pnpm dlx skills add https://github.com/revenuecat/revenuecat-skill --skill revenuecat');
  }

  return commands;
}
