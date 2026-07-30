import path from 'node:path';
import { TOOLCHAIN_DEPENDENCIES, SHARED_DB_DEPENDENCIES, BACKEND_DEPENDENCIES } from '../dependencies.js';
import { anhedralPrint } from '../print.js';
import type { ProjectOptions } from '../project.js';
import { childPackageName } from '../render.js';
import { writeFile } from '../util.js';

function normalizedWorkflowName(projectName: string): string {
  const unscoped = projectName.replace(/^@[^/]+\//, '');
  const characters: string[] = [];
  let separatorPending = false;

  for (const character of unscoped.toLowerCase()) {
    const code = character.charCodeAt(0);
    const alphanumeric = (code >= 48 && code <= 57) || (code >= 97 && code <= 122);

    if (alphanumeric) {
      if (separatorPending && characters.length > 0) characters.push('-');
      characters.push(character);
      separatorPending = false;
    } else {
      separatorPending = characters.length > 0;
    }
  }

  const normalized = characters.join('') || 'anhedral';
  const truncated = normalized.slice(0, 42);
  return truncated.endsWith('-') ? truncated.slice(0, -1) : truncated;
}

export function workflowWorkerName(projectName: string): string {
  return `${normalizedWorkflowName(projectName)}-workflows`;
}

export function applicationWorkflowName(projectName: string): string {
  return `${normalizedWorkflowName(projectName)}-application`;
}

export function scaffoldCloudflareWorkflows(root: string, options: ProjectOptions): void {
  const dir = path.join(root, 'apps/workflows');
  const wranglerVersion = TOOLCHAIN_DEPENDENCIES.wrangler;
  const workerName = workflowWorkerName(options.projectName);
  const workflowName = applicationWorkflowName(options.projectName);

  anhedralPrint.section('Cloudflare Workflows');
  anhedralPrint.step('Writing durable workflow Worker');

  writeFile(path.join(dir, 'package.json'), JSON.stringify({
    name: childPackageName(options.projectName, 'workflows'),
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'wrangler dev',
      build: 'pnpm types && tsc --noEmit',
      typecheck: 'pnpm types && tsc --noEmit',
      test: 'vitest run',
      check: 'pnpm typecheck && pnpm test',
      deploy: 'wrangler deploy',
      types: 'wrangler types',
      'instances:list': `wrangler workflows instances list ${workflowName}`,
      'instances:describe': `wrangler workflows instances describe ${workflowName}`,
    },
    devDependencies: {
      typescript: SHARED_DB_DEPENDENCIES.devDependencies!.typescript,
      vitest: BACKEND_DEPENDENCIES.devDependencies!.vitest,
      wrangler: wranglerVersion,
    },
  }, null, 2) + '\n');

  writeFile(path.join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      isolatedModules: true,
    },
    include: ['worker-configuration.d.ts', 'src/**/*.ts', 'tests/**/*.ts'],
  }, null, 2) + '\n');

  writeFile(path.join(dir, '.env.example'), `# Local Wrangler reads this value from .dev.vars after pnpm first-run.
# Use at least 32 random characters. Production uses: pnpm workflows:secret:put
WORKFLOW_API_TOKEN=
`);
  writeFile(path.join(dir, '.gitignore'), `.dev.vars
.wrangler
coverage
worker-configuration.d.ts
`);

  writeFile(path.join(dir, 'wrangler.jsonc'), `{
  "$schema": "../../node_modules/wrangler/config-schema.json",
  "name": ${JSON.stringify(workerName)},
  "main": "src/index.ts",
  "compatibility_date": "2026-07-26",
  "workflows": [
    {
      "name": ${JSON.stringify(workflowName)},
      "binding": "APPLICATION_WORKFLOW",
      "class_name": "ApplicationWorkflow"
    }
  ],
  "observability": {
    "enabled": true,
    "logs": { "enabled": true, "head_sampling_rate": 1 }
  }
}
`);

  writeFile(path.join(dir, 'src/workflow.ts'), `import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';

// The managed control API validates payloads as JSON before creating an
// instance. Keep the public type open so product code can define a narrower,
// application-specific payload without a deeply recursive RPC type.
export type JsonValue = unknown;

export type ApplicationWorkflowParams = {
  job: string;
  payload?: JsonValue;
};

export type ApplicationWorkflowOutput = {
  instanceId: string;
  job: string;
  accepted: true;
};

export type WorkflowEnvironment = {
  WORKFLOW_API_TOKEN: string;
};

/**
 * Product-owned durable workflow.
 *
 * Add one deterministic, narrowly scoped step per external side effect. Keep
 * dates, randomness, network calls, and mutable reads inside step.do(). Return
 * serializable values from steps so Cloudflare can persist and replay them.
 * Use stable step names and make every retried side effect idempotent.
 */
export class ApplicationWorkflow extends WorkflowEntrypoint<
  WorkflowEnvironment,
  ApplicationWorkflowParams
> {
  async run(
    event: WorkflowEvent<ApplicationWorkflowParams>,
    step: WorkflowStep,
  ): Promise<ApplicationWorkflowOutput> {
    const input = await step.do('validate application job', async () => {
      const job = event.payload.job.trim();
      if (!job || job.length > 100) {
        throw new NonRetryableError('job must contain 1-100 characters');
      }
      return { job };
    });

    return step.do('run application job', {
      retries: {
        limit: 5,
        delay: '10 seconds',
        backoff: 'exponential',
      },
      timeout: '10 minutes',
    }, async () => {
      // Replace this example with one idempotent product operation. Pass
      // event.instanceId as the idempotency key to downstream systems.
      // The validated product input remains available as event.payload.payload.
      console.log(JSON.stringify({
        message: 'application workflow job accepted',
        instanceId: event.instanceId,
        job: input.job,
      }));
      return {
        instanceId: event.instanceId,
        job: input.job,
        accepted: true as const,
      };
    });
  }
}
`);

  writeFile(path.join(dir, 'src/control.ts'), `import type {
  ApplicationWorkflowParams,
  JsonValue,
} from './workflow';

const MAX_BODY_BYTES = 64 * 1024;
const TOKEN_MINIMUM_LENGTH = 32;
const INSTANCE_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,99})$/;
const EVENT_TYPE = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,99})$/;

type WorkflowStatus = {
  status: string;
  error?: { name: string; message: string };
  output?: unknown;
};

type WorkflowInstance = {
  id: string;
  status(): Promise<WorkflowStatus>;
  sendEvent(event: { type: string; payload: JsonValue }): Promise<void>;
};

type WorkflowBinding = {
  create(options: { id?: string; params: ApplicationWorkflowParams }): Promise<WorkflowInstance>;
  get(id: string): Promise<WorkflowInstance>;
};

export type WorkflowControlEnvironment = {
  APPLICATION_WORKFLOW: WorkflowBinding;
  WORKFLOW_API_TOKEN: string;
};

export async function handleWorkflowControlRequest(
  request: Request,
  env: WorkflowControlEnvironment,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health') {
    return json({ ok: true, service: 'workflows' }, 200);
  }

  if (!(await isAuthorized(request.headers.get('authorization'), env.WORKFLOW_API_TOKEN))) {
    return json({ error: 'Unauthorized' }, 401, { 'www-authenticate': 'Bearer' });
  }

  const segments = url.pathname.split('/').filter(Boolean).map(decodeSegment);
  if (segments.some((segment) => segment === null)) return json({ error: 'Not Found' }, 404);

  if (request.method === 'POST' && segments.length === 1 && segments[0] === 'instances') {
    const body = await readJsonObject(request);
    if (body instanceof Response) return body;
    const id = body.id;
    if (id !== undefined && (typeof id !== 'string' || !INSTANCE_ID.test(id))) {
      return json({ error: 'id must be 1-100 safe characters' }, 400);
    }
    const params = parseWorkflowParams(body.params);
    if (!params) return json({ error: 'params.job must contain 1-100 characters' }, 400);
    try {
      const instance = await env.APPLICATION_WORKFLOW.create({
        ...(typeof id === 'string' ? { id } : {}),
        params,
      });
      return json({ instanceId: instance.id }, 202);
    } catch (error) {
      console.error('workflow instance creation failed', safeError(error));
      return json({ error: 'Unable to create workflow instance' }, 409);
    }
  }

  if (request.method === 'GET' && segments.length === 2 && segments[0] === 'instances') {
    const id = segments[1];
    if (!id || !INSTANCE_ID.test(id)) return json({ error: 'Not Found' }, 404);
    try {
      const instance = await env.APPLICATION_WORKFLOW.get(id);
      return json({ instanceId: instance.id, ...(await instance.status()) }, 200);
    } catch (error) {
      console.error('workflow instance lookup failed', safeError(error));
      return json({ error: 'Workflow instance not found' }, 404);
    }
  }

  if (
    request.method === 'POST'
    && segments.length === 4
    && segments[0] === 'instances'
    && segments[2] === 'events'
  ) {
    const id = segments[1];
    const eventType = segments[3];
    if (!id || !eventType || !INSTANCE_ID.test(id) || !EVENT_TYPE.test(eventType)) {
      return json({ error: 'Not Found' }, 404);
    }
    const body = await readJsonObject(request);
    if (body instanceof Response) return body;
    if (!isJsonValue(body.payload)) return json({ error: 'payload must be JSON-serializable' }, 400);
    try {
      const instance = await env.APPLICATION_WORKFLOW.get(id);
      await instance.sendEvent({ type: eventType, payload: body.payload });
      return json({ instanceId: instance.id, event: eventType, accepted: true }, 202);
    } catch (error) {
      console.error('workflow event delivery failed', safeError(error));
      return json({ error: 'Unable to deliver workflow event' }, 404);
    }
  }

  return json({ error: 'Not Found' }, 404);
}

function parseWorkflowParams(value: unknown): ApplicationWorkflowParams | null {
  if (!isRecord(value) || typeof value.job !== 'string') return null;
  const job = value.job.trim();
  if (!job || job.length > 100) return null;
  if (value.payload !== undefined && !isJsonValue(value.payload)) return null;
  return { job, ...(value.payload !== undefined ? { payload: value.payload } : {}) };
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | Response> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') return json({ error: 'Content-Type must be application/json' }, 415);
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ error: 'Request body is too large' }, 413);
  }
  const source = await request.text();
  if (new TextEncoder().encode(source).byteLength > MAX_BODY_BYTES) {
    return json({ error: 'Request body is too large' }, 413);
  }
  try {
    const value: unknown = JSON.parse(source);
    return isRecord(value) ? value : json({ error: 'Request body must be a JSON object' }, 400);
  } catch {
    return json({ error: 'Request body must be valid JSON' }, 400);
  }
}

async function isAuthorized(header: string | null, expected: string): Promise<boolean> {
  if (expected.length < TOKEN_MINIMUM_LENGTH || !header?.startsWith('Bearer ')) return false;
  const provided = header.slice('Bearer '.length);
  if (provided.length < TOKEN_MINIMUM_LENGTH) return false;
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function decodeSegment(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment);
    return decoded && !decoded.includes('/') && !decoded.includes('\\\\') ? decoded : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function safeError(error: unknown): { name: string; message: string } {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: 'Error', message: String(error) };
}

function json(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'",
      'x-content-type-options': 'nosniff',
      ...extraHeaders,
    },
  });
}
`);

  writeFile(path.join(dir, 'src/index.ts'), `import { handleWorkflowControlRequest } from './control';
import type { WorkflowControlEnvironment } from './control';

export { ApplicationWorkflow } from './workflow';

export default {
  async fetch(request: Request, env: WorkflowControlEnvironment): Promise<Response> {
    return handleWorkflowControlRequest(request, env);
  },
};
`);

  writeFile(path.join(dir, 'tests/control.test.ts'), `import { describe, expect, it } from 'vitest';
import { handleWorkflowControlRequest, type WorkflowControlEnvironment } from '../src/control';
import type { JsonValue } from '../src/workflow';

const CONTROL_AUTHORIZATION = 'test-workflow-authorization-with-at-least-32-characters';

function environment(): WorkflowControlEnvironment {
  const instances = new Map<string, {
    id: string;
    events: Array<{ type: string; payload: JsonValue }>;
    status(): Promise<{ status: string; output: { accepted: boolean } }>;
    sendEvent(event: { type: string; payload: JsonValue }): Promise<void>;
  }>();
  return {
    WORKFLOW_API_TOKEN: CONTROL_AUTHORIZATION,
    APPLICATION_WORKFLOW: {
      async create({ id = 'generated-id' }) {
        if (instances.has(id)) throw new Error('duplicate');
        const instance = {
          id,
          events: [] as Array<{ type: string; payload: JsonValue }>,
          async status() { return { status: 'complete', output: { accepted: true } }; },
          async sendEvent(event: { type: string; payload: JsonValue }) { this.events.push(event); },
        };
        instances.set(id, instance);
        return instance;
      },
      async get(id) {
        const instance = instances.get(id);
        if (!instance) throw new Error('missing');
        return instance;
      },
    },
  };
}

function request(pathname: string, init: RequestInit = {}): Request {
  return new Request('https://workflows.example.com' + pathname, {
    ...init,
    headers: {
      authorization: 'Bearer ' + CONTROL_AUTHORIZATION,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
}

describe('workflow control API', () => {
  it('exposes health without exposing workflow state', async () => {
    const response = await handleWorkflowControlRequest(request('/health', {
      headers: { authorization: '' },
    }), environment());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, service: 'workflows' });
  });

  it('requires the server-only control token', async () => {
    const response = await handleWorkflowControlRequest(request('/instances', {
      method: 'POST',
      body: JSON.stringify({ params: { job: 'example' } }),
      headers: { authorization: 'Bearer wrong-token-that-is-long-enough-123' },
    }), environment());
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('creates and reads a durable instance', async () => {
    const env = environment();
    const created = await handleWorkflowControlRequest(request('/instances', {
      method: 'POST',
      body: JSON.stringify({ id: 'job-123', params: { job: 'send-report', payload: { reportId: 'r1' } } }),
    }), env);
    expect(created.status).toBe(202);
    await expect(created.json()).resolves.toEqual({ instanceId: 'job-123' });

    const status = await handleWorkflowControlRequest(request('/instances/job-123'), env);
    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toMatchObject({
      instanceId: 'job-123',
      status: 'complete',
    });
  });

  it('validates input and safely reports duplicate IDs', async () => {
    const env = environment();
    const invalid = await handleWorkflowControlRequest(request('/instances', {
      method: 'POST',
      body: JSON.stringify({ params: { job: '' } }),
    }), env);
    expect(invalid.status).toBe(400);

    const body = JSON.stringify({ id: 'same-id', params: { job: 'example' } });
    expect((await handleWorkflowControlRequest(request('/instances', { method: 'POST', body }), env)).status).toBe(202);
    expect((await handleWorkflowControlRequest(request('/instances', { method: 'POST', body }), env)).status).toBe(409);
  });

  it('delivers typed external events to waiting workflows', async () => {
    const env = environment();
    await handleWorkflowControlRequest(request('/instances', {
      method: 'POST',
      body: JSON.stringify({ id: 'approval-1', params: { job: 'approval' } }),
    }), env);
    const response = await handleWorkflowControlRequest(request('/instances/approval-1/events/approved', {
      method: 'POST',
      body: JSON.stringify({ payload: { approved: true } }),
    }), env);
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ accepted: true, event: 'approved' });
  });
});
`);

  anhedralPrint.done('Cloudflare durable workflow Worker written');
}
