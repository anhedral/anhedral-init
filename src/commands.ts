import { BACKEND_DEPENDENCIES, withVersions } from './dependencies.js';

export type ScaffoldCommand = {
  cmd: string;
  command: string;
  args: string[];
};

export function getBackendInstallCommands(): ScaffoldCommand[] {
  const dependencies = withVersions(BACKEND_DEPENDENCIES.dependencies ?? {});
  const devDependencies = withVersions(BACKEND_DEPENDENCIES.devDependencies ?? {});

  return [
    {
      cmd: `pnpm add ${dependencies.join(' ')}`,
      command: 'pnpm',
      args: ['add', ...dependencies],
    },
    {
      cmd: `pnpm add -D ${devDependencies.join(' ')}`,
      command: 'pnpm',
      args: ['add', '-D', ...devDependencies],
    },
  ];
}

export function getSkillCommands(): string[] {
  return [
    'pnpm dlx skills add https://github.com/clerk/skills --skill clerk-custom-ui',
    'pnpm dlx skills add https://github.com/revenuecat/revenuecat-skill --skill revenuecat',
    'pnpm dlx skills add https://github.com/stripe/ai --skill stripe-best-practices',
  ];
}
