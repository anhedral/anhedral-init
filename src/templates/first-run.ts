import type { ProjectOptions } from '../project.js';

type EnvironmentFile = {
  example: string;
  target: string;
  optional: string[];
};

function environmentFiles(options: ProjectOptions): EnvironmentFile[] {
  return [
    options.apps.api ? {
      example: 'apps/api/.env.example',
      target: 'apps/api/.env',
      optional: options.features.storage ? ['CLOUDFLARE_API_TOKEN'] : [],
    } : null,
    options.features.database ? {
      example: 'packages/db/.env.example',
      target: 'packages/db/.env',
      optional: [],
    } : null,
    options.apps.web ? {
      example: 'apps/web/.env.example',
      target: 'apps/web/.env.local',
      optional: [],
    } : null,
    options.apps.mobile ? {
      example: 'apps/mobile/.env.example',
      target: 'apps/mobile/.env',
      optional: [],
    } : null,
    options.apps.desktop ? {
      example: 'apps/desktop/.env.example',
      target: 'apps/desktop/.env',
      optional: [],
    } : null,
    options.features.electronUpdater ? {
      example: 'apps/desktop/electron-builder.env.example',
      target: 'apps/desktop/electron-builder.env',
      optional: [],
    } : null,
    options.apps.extension ? {
      example: 'apps/extension/.env.example',
      target: 'apps/extension/.env',
      optional: [
        ...(options.features.auth ? ['VITE_CLERK_SYNC_HOST'] : []),
        'VITE_CRX_PUBLIC_KEY',
      ],
    } : null,
  ].filter((entry): entry is EnvironmentFile => entry !== null);
}

function nextCommands(options: ProjectOptions): string[] {
  return [
    'pnpm ready',
    options.features.database ? 'pnpm db:generate' : null,
    options.features.database ? 'git add packages/db/migrations' : null,
    'pnpm verify',
    options.features.database ? 'pnpm db:migrate' : null,
    'pnpm dev',
  ].filter((entry): entry is string => entry !== null);
}

export function generatedFirstRunScript(options: ProjectOptions): string {
  return `import { copyFileSync, existsSync, readFileSync } from 'node:fs';

const environmentFiles = ${JSON.stringify(environmentFiles(options), null, 2)};
const args = new Set(process.argv.slice(2));
const supportedArgs = new Set(['--check', '--json']);
const unknownArgs = [...args].filter((arg) => !supportedArgs.has(arg));
if (unknownArgs.length > 0) {
  console.error(\`Unknown first-run option: \${unknownArgs[0]}. Use --check and/or --json.\`);
  process.exit(2);
}

const checkOnly = args.has('--check');
const json = args.has('--json');
const created = [];
const kept = [];
const missing = [];
const unresolved = [];

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

function isPlaceholder(value) {
  const normalized = unquote(value).toLowerCase();
  return normalized.includes('***')
    || normalized.includes('your_')
    || normalized.includes('your-')
    || normalized.includes('example.com')
    || /^(?:change|replace)(?:[-_ ]?me)?(?:[-_ ].*)?$/.test(normalized)
    || /^(?:placeholder|your value|your-value|your_value)$/.test(normalized);
}

function environmentValues(source) {
  const values = new Map();
  for (const line of source.split(/\\r?\\n/)) {
    const match = /^(?:export\\s+)?([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match) values.set(match[1], unquote(match[2]));
  }
  return values;
}

for (const { example, target, optional } of environmentFiles) {
  if (!existsSync(target)) {
    if (checkOnly) {
      missing.push(target);
      continue;
    }
    copyFileSync(example, target);
    created.push(target);
  } else {
    kept.push(target);
  }
  const optionalNames = new Set(optional);
  const expected = environmentValues(readFileSync(example, 'utf8'));
  const actual = environmentValues(readFileSync(target, 'utf8'));
  for (const name of expected.keys()) {
    if (!optionalNames.has(name)) {
      const value = actual.get(name);
      if (value === undefined || !value || isPlaceholder(value)) {
        unresolved.push(\`\${target}: \${name}\`);
      }
    }
  }
}

const blockers = [
  ...missing.map((target) => \`\${target}: file is missing\`),
  ...unresolved,
];
const result = {
  operation: checkOnly ? 'ready' : 'first-run',
  ok: blockers.length === 0,
  created,
  kept,
  missing,
  unresolved,
  nextCommands: ${JSON.stringify(nextCommands(options))},
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  for (const target of created) console.log(\`created \${target}\`);
  for (const target of kept) console.log(\`kept    \${target}\`);

  if (blockers.length > 0) {
    console.log('\\nConfiguration is not ready:');
    for (const item of blockers) console.log(\`  - \${item}\`);
    console.log(checkOnly
      ? '\\nRun pnpm first-run to create missing files, configure the listed values, then run pnpm ready again.'
      : '\\nConfigure the listed values, then run pnpm ready.');
  } else {
    console.log('\\nConfiguration is ready.');
    ${options.features.database
      ? "console.log('Before verification, review the SQL created by pnpm db:generate before staging it.');"
      : ''}
    console.log('\\nNext:');
    for (const command of result.nextCommands.filter((command) => command !== 'pnpm ready')) {
      console.log(\`  \${command}\`);
    }
  }
}

if (checkOnly && blockers.length > 0) process.exitCode = 1;
`;
}
