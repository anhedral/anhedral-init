import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const repoRoot = path.resolve(import.meta.dirname, '..');
const libraryUrl = pathToFileURL(path.join(repoRoot, 'dist', 'index.js')).href;
const cliEntry = path.join(repoRoot, 'dist', 'bin.js');

const imported = spawnSync('node', ['--input-type=module', '--eval', `await import(${JSON.stringify(libraryUrl)})`], {
  cwd: repoRoot,
  encoding: 'utf8',
});
assert.equal(imported.status, 0, imported.stderr);
assert.equal(imported.stdout, '', 'importing the library must not execute the CLI or print output');

const publicApi = await import(libraryUrl);
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
assert.equal(publicApi.GENERATOR_VERSION, packageJson.version, 'package and generator versions must stay synchronized');
assert.equal(typeof publicApi.scaffoldProject, 'function');
assert.equal(typeof publicApi.resolveModules, 'function');
assert.equal(typeof publicApi.createManifest, 'function');
assert.equal(typeof publicApi.readManifest, 'function');
assert.equal(typeof publicApi.serializeManifest, 'function');

const previousCwd = process.cwd();
const equivalentWorkspace = mkdtempSync(path.join(tmpdir(), 'anhedral-equivalent-api-'));
try {
  process.chdir(equivalentWorkspace);
  await assert.doesNotReject(publicApi.scaffoldProject({
    projectName: 'equivalent',
    displayName: 'Equivalent',
    modules: ['auth'],
    skipInstall: true,
    dryRun: true,
    json: false,
    toolchainChannel: 'stable',
  }), 'module intent should resolve its complete dependency closure');
} finally {
  process.chdir(previousCwd);
  rmSync(equivalentWorkspace, { recursive: true, force: true });
}

function collectSourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = path.join(directory, entry);
    if (statSync(absolute).isDirectory()) return collectSourceFiles(absolute);
    return /\.tsx?$/.test(entry) && !entry.endsWith('.d.ts') ? [absolute] : [];
  });
}

const workspace = mkdtempSync(path.join(tmpdir(), 'anhedral-render-safety-'));
const project = path.join(workspace, "Sam's ${project}");
mkdirSync(project);
try {
  const result = spawnSync('node', [cliEntry, 'init', '--skip-install', '--json'], {
    cwd: project,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotThrow(() => JSON.parse(result.stdout), '--json output must contain one clean JSON document');
  assert.equal(result.stderr, '');

  const manifest = JSON.parse(readFileSync(path.join(project, 'anhedral.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 3);
  assert.deepEqual(manifest.modules, [
    'web',
    'mobile',
    'api',
    'desktop',
    'extension',
    'db',
    'auth',
    'billing',
    'storage',
    'native-subscriptions',
  ]);
  assert.equal(manifest.toolchain, 'stable');

  const apiSource = readFileSync(path.join(project, 'apps/api/src/application.ts'), 'utf8');
  assert.match(apiSource, /export const serviceName = "Sam's \$\{project\} API";/);
  const extensionHtml = readFileSync(path.join(project, 'apps/extension/src/entrypoints/sidepanel/index.html'), 'utf8');
  assert.match(extensionHtml, /<title>Sam&#39;s \$\{project\}<\/title>/);

  for (const file of collectSourceFiles(project)) {
    const output = ts.transpileModule(readFileSync(file, 'utf8'), {
      fileName: file,
      reportDiagnostics: true,
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ESNext,
      },
    });
    const syntaxErrors = (output.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    assert.deepEqual(syntaxErrors, [], `generated syntax error in ${path.relative(project, file)}`);
  }
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

console.log('Public API, JSON output, and render safety tests passed');
