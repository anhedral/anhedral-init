const sharedApiGitignores = [
  ['.gitignore', ['.env', '.env.*', '!.env.example']],
  ['apps/api/.gitignore', ['.env', '.env.*', '!.env.example']],
];

const appModules = ['web', 'admin', 'mobile', 'api', 'desktop', 'extension'];
const featureModules = {
  database: 'db',
  auth: 'auth',
  realtime: 'realtime',
  billing: 'billing',
  storage: 'storage',
  workflows: 'workflows',
  nativeSubscriptions: 'native-subscriptions',
  electronUpdater: 'electron-updater',
};

function defineScenario(scenario) {
  const selectedModules = new Set(scenario.modules);
  return {
    ...scenario,
    apps: Object.fromEntries(appModules.map((moduleId) => [moduleId, selectedModules.has(moduleId)])),
    features: Object.fromEntries(
      Object.entries(featureModules).map(([selection, moduleId]) => [selection, selectedModules.has(moduleId)]),
    ),
  };
}

export const OUTPUT_TREE_SCENARIOS = [
  defineScenario({
    id: 'expo-extension',
    treeTitle: 'Full stack (`expo-extension`)',
    description: 'All app surfaces and feature modules',
    projectDirectory: 'expo-extension-sample',
    initArgs: [],
    addArgs: [],
    modules: ['web', 'mobile', 'api', 'desktop', 'extension', 'db', 'auth', 'realtime', 'billing', 'storage', 'workflows', 'native-subscriptions', 'electron-updater'],
    gitignoreExpectations: [
      ...sharedApiGitignores,
      ['apps/mobile/.gitignore', ['.env', '.env.*', '!.env.example']],
    ],
    e2eChecks: [
      ['pnpm', ['verify']],
      ['pnpm', ['build']],
    ],
    goldenTree: true,
    auditLock: true,
    refreshDemo: false,
  }),
  defineScenario({
    id: 'web-api-minimal',
    description: 'Next.js, Fastify, database, and auth',
    projectDirectory: 'web-api-minimal',
    initArgs: ['--next', '--fastify', '--neon', '--clerk'],
    addArgs: [],
    modules: ['web', 'api', 'db', 'auth'],
    gitignoreExpectations: sharedApiGitignores,
    e2eChecks: [
      ['pnpm', ['verify']],
      ['pnpm', ['build']],
    ],
    goldenTree: true,
    auditLock: false,
    refreshDemo: true,
  }),
  defineScenario({
    id: 'authjs-admin-app',
    description: 'Auth.js web application with a separately deployed administrator boundary',
    projectDirectory: 'authjs-admin-app',
    initArgs: ['--next', '--fastify', '--neon', '--authjs', '--admin-app'],
    addArgs: [],
    modules: ['web', 'admin', 'api', 'db', 'auth'],
    gitignoreExpectations: sharedApiGitignores,
    e2eChecks: [
      ['pnpm', ['verify']],
      ['pnpm', ['build']],
    ],
    goldenTree: false,
    auditLock: false,
    refreshDemo: false,
  }),
  defineScenario({
    id: 'api-only',
    description: 'Minimal Fastify API without database or auth',
    projectDirectory: 'api-only',
    initArgs: ['--fastify'],
    addArgs: [],
    modules: ['api'],
    gitignoreExpectations: sharedApiGitignores,
    e2eChecks: [
      ['pnpm', ['verify']],
      ['pnpm', ['build']],
    ],
    goldenTree: true,
    auditLock: false,
    refreshDemo: false,
  }),
  defineScenario({
    id: 'add-desktop-flow',
    description: 'API-first project with desktop added afterward',
    projectDirectory: 'add-desktop-flow',
    initArgs: ['--fastify', '--neon', '--clerk'],
    addArgs: ['electron'],
    modules: ['api', 'desktop', 'db', 'auth'],
    gitignoreExpectations: sharedApiGitignores,
    e2eChecks: [
      ['pnpm', ['install', '--frozen-lockfile']],
      ['pnpm', ['verify']],
      ['pnpm', ['build']],
    ],
    goldenTree: true,
    auditLock: false,
    refreshDemo: false,
  }),
];

export const GOLDEN_TREE_SCENARIOS = OUTPUT_TREE_SCENARIOS.filter((scenario) => scenario.goldenTree);

export function getOutputTreeScenario(id) {
  const scenario = OUTPUT_TREE_SCENARIOS.find((candidate) => candidate.id === id);

  if (!scenario) {
    throw new Error(`Unknown output-tree scenario: ${id}`);
  }

  return scenario;
}

export function getRefreshDemoScenario() {
  const refreshScenarios = OUTPUT_TREE_SCENARIOS.filter((scenario) => scenario.refreshDemo);

  if (refreshScenarios.length !== 1) {
    throw new Error(`Expected exactly one refresh-demo scenario, found ${refreshScenarios.length}`);
  }

  return refreshScenarios[0];
}
