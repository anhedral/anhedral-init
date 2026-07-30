import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import {
  applicationWorkflowName,
  scaffoldCloudflareWorkflows,
  workflowWorkerName,
} from '../dist/templates/workflows.js';

const root = mkdtempSync(path.join(tmpdir(), 'anhedral-workflows-template-'));
const options = {
  projectName: '@scope/durable-product',
  displayName: 'Durable Product',
  apps: { web: false, mobile: false, api: false, desktop: false, extension: false },
  features: {
    database: false,
    auth: false,
    realtime: false,
    billing: false,
    storage: false,
    workflows: true,
    nativeSubscriptions: false,
    electronUpdater: false,
  },
  skipInstall: true,
};
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

function assertValidTypeScript(source, fileName) {
  const output = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const errors = (output.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  assert.deepEqual(errors, [], `generated syntax error in ${fileName}`);
}

try {
  scaffoldCloudflareWorkflows(root, options);

  assert.equal(workflowWorkerName('@scope/My.App'), 'my-app-workflows');
  assert.equal(
    workflowWorkerName(`---My${'-'.repeat(10_000)}App---`),
    'my-app-workflows',
    'worker names should normalize long separator runs in linear time',
  );
  assert.equal(applicationWorkflowName('---'), 'anhedral-application');
  assert.ok(workflowWorkerName('a'.repeat(100)).length <= 64);
  assert.ok(applicationWorkflowName('a'.repeat(100)).length <= 64);

  const packageJson = JSON.parse(read('apps/workflows/package.json'));
  assert.equal(packageJson.scripts.dev, 'wrangler dev');
  assert.equal(packageJson.scripts.deploy, 'wrangler deploy');
  assert.equal(packageJson.scripts.check, 'pnpm typecheck && pnpm test');
  assert.equal(packageJson.devDependencies.wrangler, '4.111.0');
  assert.equal(packageJson.devDependencies.vitest, '4.1.0');

  const config = read('apps/workflows/wrangler.jsonc');
  assert.match(config, /"workflows": \[/);
  assert.match(config, /"binding": "APPLICATION_WORKFLOW"/);
  assert.match(config, /"class_name": "ApplicationWorkflow"/);
  assert.match(config, /"observability"/);

  const workflow = read('apps/workflows/src/workflow.ts');
  assert.match(workflow, /extends WorkflowEntrypoint/);
  assert.match(workflow, /step\.do\('validate application job'/);
  assert.match(workflow, /backoff: 'exponential'/);
  assert.match(workflow, /NonRetryableError/);
  assert.match(workflow, /event\.instanceId as the idempotency key/);

  const control = read('apps/workflows/src/control.ts');
  assert.match(control, /MAX_BODY_BYTES = 64 \* 1024/);
  assert.match(control, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(control, /env\.APPLICATION_WORKFLOW\.create/);
  assert.match(control, /instance\.sendEvent/);
  assert.match(control, /'cache-control': 'no-store'/);
  assert.doesNotMatch(control, /json\(\{[^}]*WORKFLOW_API_TOKEN/);

  assert.match(read('apps/workflows/.env.example'), /WORKFLOW_API_TOKEN=/);
  assert.match(read('apps/workflows/.gitignore'), /^\.dev\.vars$/m);
  assert.equal(existsSync(path.join(root, 'apps/workflows/.dev.vars')), false);

  for (const relativePath of [
    'apps/workflows/src/workflow.ts',
    'apps/workflows/src/control.ts',
    'apps/workflows/src/index.ts',
    'apps/workflows/tests/control.test.ts',
  ]) {
    assertValidTypeScript(read(relativePath), relativePath);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('Cloudflare Workflows template tests passed');
