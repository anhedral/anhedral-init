import assert from 'node:assert/strict';
import {
  DEFAULT_MODULE_DEFINITIONS,
  DEFAULT_MODULE_REGISTRY,
  ManifestValidationError,
  ModuleRegistryError,
  ModuleResolutionError,
  PlanBuildError,
  buildGenerationPlan,
  createManifest,
  createModuleRegistry,
  hashContent,
  readManifest,
  resolveModules,
  serializeManifest,
} from '../dist/architecture/index.js';

function expectCode(fn, ErrorType, code) {
  assert.throws(fn, (error) => {
    assert.equal(error instanceof ErrorType, true);
    assert.equal(error.code, code);
    return true;
  });
}

function definitionsWith(overrides) {
  return DEFAULT_MODULE_DEFINITIONS.map((definition) => ({
    ...definition,
    requires: [...definition.requires],
    conflicts: [...definition.conflicts],
    ...(overrides[definition.id] ?? {}),
  }));
}

assert.equal(Object.isFrozen(DEFAULT_MODULE_REGISTRY), true);
assert.equal(Object.isFrozen(DEFAULT_MODULE_REGISTRY.auth.requires), true);
assert.equal(hashContent('rendered text'), hashContent(Buffer.from('rendered text', 'utf8')));
assert.notEqual(
  hashContent(Buffer.from([0x80])),
  hashContent(Buffer.from([0x81])),
  'filesystem integrity hashing must distinguish malformed byte sequences that decode to the same replacement character',
);

const nativeResolution = resolveModules(['native-subscriptions']);
assert.deepEqual(nativeResolution.requestedModules, ['native-subscriptions']);
assert.deepEqual(nativeResolution.resolvedModules, [
  'mobile',
  'api',
  'db',
  'auth',
  'billing',
  'native-subscriptions',
]);
assert.deepEqual(nativeResolution.dependencyAddedModules, ['mobile', 'api', 'db', 'auth', 'billing']);
assert.equal(Object.isFrozen(nativeResolution), true);
assert.equal(Object.isFrozen(nativeResolution.resolvedModules), true);
assert.throws(() => nativeResolution.resolvedModules.push('web'), TypeError);

expectCode(
  () => resolveModules(['not-a-module']),
  ModuleResolutionError,
  'UNKNOWN_MODULE',
);

const conflictingRegistry = createModuleRegistry(definitionsWith({
  web: { conflicts: ['extension'] },
}));
expectCode(
  () => resolveModules(['extension', 'web'], conflictingRegistry),
  ModuleResolutionError,
  'MODULE_CONFLICT',
);

expectCode(
  () => createModuleRegistry(definitionsWith({
    web: { requires: ['mobile'] },
    mobile: { requires: ['web'] },
  })),
  ModuleRegistryError,
  'DEPENDENCY_CYCLE',
);

const contributions = [
  {
    module: 'root',
    files: [
      {
        path: 'package.json',
        ownership: 'mergeable',
        content: '{"private":true}\n',
      },
      {
        path: 'README.md',
        ownership: 'user',
        content: '# Generated only when absent\n',
      },
    ],
  },
  {
    module: 'auth',
    files: [
      {
        path: 'src/anhedral/features/auth.ts',
        ownership: 'managed',
        content: 'export const auth = true;\n',
      },
    ],
  },
];

const plan = buildGenerationPlan({
  operation: 'add',
  requestedModules: ['auth', 'web'],
  contributions,
});
const reorderedPlan = buildGenerationPlan({
  operation: 'add',
  requestedModules: ['web', 'auth'],
  contributions: [...contributions].reverse(),
});

assert.deepEqual(plan.requestedModules, ['web', 'auth']);
assert.deepEqual(plan.resolvedModules, ['web', 'api', 'db', 'auth']);
assert.deepEqual(plan.files.map((file) => file.path), [
  'package.json',
  'README.md',
  'src/anhedral/features/auth.ts',
].sort());
assert.equal(plan.fingerprint, reorderedPlan.fingerprint);
assert.equal(plan.files.find((file) => file.path === 'package.json').writePolicy, 'structural-merge');
assert.equal(plan.files.find((file) => file.path === 'README.md').writePolicy, 'create-only');
assert.equal(Object.isFrozen(plan), true);
assert.equal(Object.isFrozen(plan.files), true);

expectCode(
  () => buildGenerationPlan({
    operation: 'init',
    requestedModules: ['web'],
    contributions: [{
      module: 'extension',
      files: [{ path: 'extension.ts', ownership: 'managed', content: '' }],
    }],
  }),
  PlanBuildError,
  'UNRESOLVED_CONTRIBUTION',
);

expectCode(
  () => buildGenerationPlan({
    operation: 'init',
    requestedModules: ['auth'],
    contributions: [
      { module: 'root', files: [{ path: 'same.ts', ownership: 'user', content: '' }] },
      { module: 'auth', files: [{ path: 'same.ts', ownership: 'managed', content: '' }] },
    ],
  }),
  PlanBuildError,
  'DUPLICATE_OUTPUT_PATH',
);

expectCode(
  () => buildGenerationPlan({
    operation: 'init',
    requestedModules: [],
    contributions: [{ module: 'root', files: [{ path: '../outside', ownership: 'user', content: '' }] }],
  }),
  PlanBuildError,
  'INVALID_PLAN_PATH',
);

const manifest = createManifest({
  generatorVersion: '0.2.0',
  project: { name: 'new-app', displayName: 'New App' },
  plan,
  toolchain: 'stable',
});
const roundTrip = readManifest(serializeManifest(manifest));
assert.equal(roundTrip.schemaVersion, 3);
assert.deepEqual(roundTrip, manifest);
assert.equal(roundTrip.files['src/anhedral/features/auth.ts'].ownership, 'managed');
assert.equal(roundTrip.files['src/anhedral/features/auth.ts'].mode, null);

const missingMode = JSON.parse(serializeManifest(manifest));
delete missingMode.files['src/anhedral/features/auth.ts'].mode;
expectCode(
  () => readManifest(missingMode),
  ManifestValidationError,
  'INVALID_FILE_RECORD',
);

const invalidMode = JSON.parse(serializeManifest(manifest));
invalidMode.files['src/anhedral/features/auth.ts'].mode = 0o100644;
expectCode(
  () => readManifest(invalidMode),
  ManifestValidationError,
  'INVALID_FILE_RECORD',
);

expectCode(
  () => readManifest({ schemaVersion: 2 }),
  ManifestValidationError,
  'INVALID_SCHEMA_VERSION',
);

expectCode(
  () => readManifest({ schemaVersion: 99 }),
  ManifestValidationError,
  'FUTURE_SCHEMA_VERSION',
);

const incomplete = JSON.parse(serializeManifest(manifest));
incomplete.modules = incomplete.modules.filter((moduleId) => moduleId !== 'db');
expectCode(
  () => readManifest(incomplete),
  ManifestValidationError,
  'INVALID_MODULE_CLOSURE',
);

const reorderedModules = JSON.parse(serializeManifest(manifest));
reorderedModules.modules.reverse();
expectCode(
  () => readManifest(reorderedModules),
  ManifestValidationError,
  'INVALID_MODULE_CLOSURE',
);

const prototypePath = JSON.parse(serializeManifest(manifest));
Object.defineProperty(prototypePath.files, '__proto__', {
  enumerable: true,
  value: { owner: 'root', ownership: 'user', hash: hashContent('prototype'), mode: null },
});
const prototypeManifest = readManifest(prototypePath);
assert.equal(prototypeManifest.schemaVersion, 3);
assert.equal(Object.hasOwn(prototypeManifest.files, '__proto__'), true);
assert.equal(prototypeManifest.files.__proto__.ownership, 'user');

const invalidManaged = JSON.parse(serializeManifest(manifest));
invalidManaged.files['src/anhedral/features/auth.ts'].hash = null;
expectCode(
  () => readManifest(invalidManaged),
  ManifestValidationError,
  'INVALID_FILE_RECORD',
);

console.log('Architecture foundation tests passed');
