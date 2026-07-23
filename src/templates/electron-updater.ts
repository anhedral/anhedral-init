import path from 'node:path';
import { TOOLCHAIN_DEPENDENCIES } from '../dependencies.js';
import { anhedralPrint } from '../print.js';
import { childPackageName } from '../render.js';
import type { ProjectOptions } from '../scaffold.js';
import { writeFile } from '../util.js';

function normalizedResourceName(projectName: string): string {
  const unscoped = projectName.replace(/^@[^/]+\//, '');
  const normalized = unscoped.toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'anhedral';
  return normalized.slice(0, 48).replace(/-+$/g, '') || 'anhedral';
}

export function desktopUpdatesBucketName(projectName: string): string {
  return `${normalizedResourceName(projectName)}-desktop-updates`;
}

export function scaffoldElectronUpdater(root: string, options: ProjectOptions): void {
  const workerDir = path.join(root, 'apps/desktop-updater-worker');
  const desktopDir = path.join(root, 'apps/desktop');
  const wrangler = `pnpm dlx wrangler@${TOOLCHAIN_DEPENDENCIES.wrangler}`;
  const bucketName = desktopUpdatesBucketName(options.projectName);

  anhedralPrint.section('Electron updater (private R2 + Cloudflare Worker)');
  anhedralPrint.step('Writing desktop update channel');

  writeFile(path.join(workerDir, 'package.json'), JSON.stringify({
    name: childPackageName(options.projectName, 'desktop-updater-worker'),
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      check: 'node --check src/index.js && node --test tests/*.test.js',
      test: 'node --test tests/*.test.js',
      dev: `${wrangler} dev`,
      deploy: `${wrangler} deploy`,
      types: `${wrangler} types`,
    },
  }, null, 2) + '\n');

  writeFile(path.join(workerDir, 'wrangler.jsonc'), `{
  // Replace both updates.example.com values with a hostname in your active Cloudflare zone.
  "name": "desktop-updater",
  "main": "src/index.js",
  "compatibility_date": "2026-07-22",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": false,
  "preview_urls": false,
  "routes": [{ "pattern": "updates.example.com", "custom_domain": true }],
  "vars": { "UPDATE_HOSTNAME": "updates.example.com", "UPDATE_PREFIX": "releases" },
  "r2_buckets": [{ "binding": "UPDATES", "bucket_name": "${bucketName}" }],
  "observability": {
    "enabled": true,
    "logs": { "enabled": true, "head_sampling_rate": 1 }
  }
}
`);

  writeFile(path.join(workerDir, 'src/index.js'), `/**
 * Electron update delivery from a private R2 bucket.
 *
 * The bucket has no public r2.dev or bucket custom domain. This Worker is the
 * only public read path. Release CI uploads signed installers, blockmaps, and
 * update metadata with Wrangler; the Worker never permits writes or listings.
 */
const ARTIFACT_CACHE_CONTROL = "public, max-age=31536000, immutable";
const METADATA_CACHE_CONTROL = "no-store";

export default {
  async fetch(request, env) {
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      return textResponse("Method Not Allowed", 405, { allow: "GET, HEAD" });
    }

    const url = new URL(request.url);
    if (url.hostname !== env.UPDATE_HOSTNAME) return textResponse("Forbidden", 403);
    const key = decodeObjectKey(url.pathname);
    const prefix = env.UPDATE_PREFIX.replace(/^\\/+|\\/+$/g, "") + "/";
    if (!key || !key.startsWith(prefix)) return textResponse("Not Found", 404);

    try {
      if (method === "HEAD") {
        const object = await env.UPDATES.head(key);
        if (!object) return textResponse("Not Found", 404);
        return new Response(null, { status: 200, headers: objectHeaders(object, key) });
      }

      const object = await env.UPDATES.get(key, {
        onlyIf: request.headers,
        range: request.headers,
      });
      if (!object) return textResponse("Not Found", 404);

      const headers = objectHeaders(object, key);
      if (!("body" in object)) {
        const status = failedConditionalStatus(request.headers);
        headers.delete("content-length");
        return new Response(null, { status, headers });
      }

      const isRange = request.headers.has("range") && object.range;
      if (isRange) {
        const returned = normalizeRange(object.range, object.size);
        headers.set("content-range", "bytes " + returned.offset + "-" + (returned.offset + returned.length - 1) + "/" + object.size);
        headers.set("content-length", String(returned.length));
      }
      return new Response(object.body, { status: isRange ? 206 : 200, headers });
    } catch (error) {
      console.error(JSON.stringify({
        message: "desktop update delivery failed",
        key,
        error: error instanceof Error ? error.message : String(error),
      }));
      return textResponse("Update delivery failed", 500);
    }
  },
};

function decodeObjectKey(pathname) {
  const parts = [];
  for (const rawPart of pathname.replace(/^\\/+/, "").split("/")) {
    if (!rawPart) continue;
    let part;
    try {
      part = decodeURIComponent(rawPart);
    } catch {
      return null;
    }
    if (!part || part === "." || part === ".." || part.includes("/") || part.includes("\\\\")) return null;
    parts.push(part);
  }
  return parts.join("/") || null;
}

function objectHeaders(object, key) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", key.endsWith(".yml") ? METADATA_CACHE_CONTROL : ARTIFACT_CACHE_CONTROL);
  headers.set("content-length", String(object.size));
  headers.set("etag", object.httpEtag);
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-security-policy", "default-src 'none'");
  if (object.uploaded instanceof Date) headers.set("last-modified", object.uploaded.toUTCString());
  headers.delete("set-cookie");
  return headers;
}

function failedConditionalStatus(headers) {
  if (headers.has("if-none-match")) return 304;
  if (!headers.has("if-match") && !headers.has("if-unmodified-since") && headers.has("if-modified-since")) return 304;
  return 412;
}

function normalizeRange(range, objectSize) {
  if (typeof range.suffix === "number") {
    const length = Math.min(Math.max(0, range.suffix), objectSize);
    return { offset: objectSize - length, length };
  }
  const offset = Math.min(Math.max(0, range.offset ?? 0), objectSize);
  const available = objectSize - offset;
  const length = typeof range.length === "number"
    ? Math.min(Math.max(0, range.length), available)
    : available;
  return { offset, length };
}

function textResponse(body, status, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8", ...extraHeaders },
  });
}
`);

  writeFile(path.join(workerDir, 'tests/worker.test.js'), `import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.js';

function storedObject(body = new TextEncoder().encode('release-bytes'), overrides = {}) {
  return {
    body,
    size: body.byteLength,
    httpEtag: '"synthetic-etag"',
    uploaded: new Date('2026-07-22T00:00:00.000Z'),
    writeHttpMetadata(headers) { headers.set('content-type', 'application/octet-stream'); },
    ...overrides,
  };
}

function environment(overrides = {}) {
  const object = storedObject();
  return {
    UPDATE_HOSTNAME: 'updates.example.com',
    UPDATE_PREFIX: 'releases',
    UPDATES: {
      async head() { return object; },
      async get() { return object; },
    },
    ...overrides,
  };
}

test('allows only read methods on the configured host and release prefix', async () => {
  const env = environment();
  assert.equal((await worker.fetch(new Request('https://updates.example.com/releases/mac/arm64/app.zip', { method: 'POST' }), env)).status, 405);
  assert.equal((await worker.fetch(new Request('https://other.example.com/releases/mac/arm64/app.zip'), env)).status, 403);
  assert.equal((await worker.fetch(new Request('https://updates.example.com/private/app.zip'), env)).status, 404);
  assert.equal((await worker.fetch(new Request('https://updates.example.com/releases/%2Fprivate.zip'), env)).status, 404);
});

test('streams artifacts and handles HEAD without exposing a body', async () => {
  const env = environment();
  const response = await worker.fetch(new Request('https://updates.example.com/releases/mac/arm64/app.zip'), env);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'release-bytes');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(response.headers.get('etag'), '"synthetic-etag"');

  const head = await worker.fetch(new Request('https://updates.example.com/releases/mac/arm64/app.zip', { method: 'HEAD' }), env);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('returns ranges and conditional responses with safe cache policy', async () => {
  const ranged = storedObject(new TextEncoder().encode('le'), { size: 13, range: { offset: 2, length: 2 } });
  const rangeResponse = await worker.fetch(new Request('https://updates.example.com/releases/mac/arm64/app.zip', {
    headers: { range: 'bytes=2-3' },
  }), environment({ UPDATES: { async head() { return ranged; }, async get() { return ranged; } } }));
  assert.equal(rangeResponse.status, 206);
  assert.equal(rangeResponse.headers.get('content-range'), 'bytes 2-3/13');
  assert.equal(rangeResponse.headers.get('content-length'), '2');

  const notModified = storedObject(new Uint8Array(), { size: 13 });
  delete notModified.body;
  const conditional = await worker.fetch(new Request('https://updates.example.com/releases/mac/arm64/latest-mac.yml', {
    headers: { 'if-none-match': '"synthetic-etag"' },
  }), environment({ UPDATES: { async head() { return notModified; }, async get() { return notModified; } } }));
  assert.equal(conditional.status, 304);
  assert.equal(conditional.headers.get('cache-control'), 'no-store');
  assert.equal(conditional.headers.has('content-length'), false);
});
`);

  writeFile(path.join(desktopDir, 'scripts/publish-updates.mjs'), `import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const WRANGLER_VERSION = ${JSON.stringify(TOOLCHAIN_DEPENDENCIES.wrangler)};
const BUCKET_NAME = ${JSON.stringify(bucketName)};
const RELEASE_DIRECTORY = path.resolve('apps/desktop/release');
const ALLOWED_PLATFORMS = new Set(['mac', 'win', 'linux']);
const ALLOWED_ARCHITECTURES = new Set(['x64', 'arm64']);
const UPLOAD_COMMAND = process.env.ANHEDRAL_DESKTOP_UPDATE_UPLOAD_COMMAND || (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm');
const UPLOAD_ARGS_PREFIX = process.env.ANHEDRAL_DESKTOP_UPDATE_UPLOAD_ARGS_PREFIX
  ? JSON.parse(process.env.ANHEDRAL_DESKTOP_UPDATE_UPLOAD_ARGS_PREFIX)
  : [];
if (!Array.isArray(UPLOAD_ARGS_PREFIX) || !UPLOAD_ARGS_PREFIX.every((value) => typeof value === 'string')) {
  throw new Error('ANHEDRAL_DESKTOP_UPDATE_UPLOAD_ARGS_PREFIX must be a JSON string array');
}

function option(name) {
  const index = process.argv.indexOf('--' + name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const platform = option('platform');
const arch = option('arch');
if (!platform || !ALLOWED_PLATFORMS.has(platform)) {
  throw new Error('--platform must be one of: mac, win, linux');
}
if (!arch || !ALLOWED_ARCHITECTURES.has(arch)) {
  throw new Error('--arch must be one of: x64, arm64');
}

const metadataName = platform === 'mac' ? 'latest-mac.yml' : platform === 'linux' ? 'latest-linux.yml' : 'latest.yml';
const artifactExtensions = platform === 'mac'
  ? ['.dmg', '.zip', '.blockmap']
  : platform === 'win'
    ? ['.exe', '.zip', '.blockmap']
    : ['.AppImage', '.deb', '.blockmap'];
const files = readdirSync(RELEASE_DIRECTORY)
  .filter((name) => name === metadataName || artifactExtensions.some((extension) => name.endsWith(extension)))
  .filter((name) => name === metadataName || name.includes('-' + arch + '.'))
  .filter((name) => statSync(path.join(RELEASE_DIRECTORY, name)).isFile());
if (!files.includes(metadataName)) throw new Error('Missing electron-updater metadata: ' + metadataName);
if (!files.some((name) => name !== metadataName && !name.endsWith('.blockmap'))) {
  throw new Error('No desktop installer artifact was found for ' + platform + '/' + arch);
}

// Publish immutable artifacts first and the mutable channel metadata last.
files.sort((left, right) => Number(left === metadataName) - Number(right === metadataName) || left.localeCompare(right));
for (const name of files) {
  const source = path.join(RELEASE_DIRECTORY, name);
  const objectPath = BUCKET_NAME + '/releases/' + platform + '/' + arch + '/' + name;
  const metadata = name.endsWith('.yml');
  const args = [
    'dlx',
    'wrangler@' + WRANGLER_VERSION,
    'r2',
    'object',
    'put',
    objectPath,
    '--remote',
    '--file=' + source,
    '--content-type=' + contentType(name),
    '--cache-control=' + (metadata ? 'no-store' : 'public, max-age=31536000, immutable'),
  ];
  const result = spawnSync(UPLOAD_COMMAND, [...UPLOAD_ARGS_PREFIX, ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Unable to upload desktop update object: ' + objectPath);
}

function contentType(name) {
  if (name.endsWith('.yml')) return 'text/yaml; charset=utf-8';
  if (name.endsWith('.blockmap')) return 'application/octet-stream';
  if (name.endsWith('.zip')) return 'application/zip';
  if (name.endsWith('.dmg')) return 'application/x-apple-diskimage';
  if (name.endsWith('.exe')) return 'application/vnd.microsoft.portable-executable';
  if (name.endsWith('.deb')) return 'application/vnd.debian.binary-package';
  return 'application/octet-stream';
}

console.log('Published ' + files.length + ' desktop update files to ' + BUCKET_NAME + '.');
`);

  writeFile(path.join(root, 'cloudflare/desktop-updates.md'), `# Electron desktop update channel

The \`${bucketName}\` R2 bucket stays private. The generated
\`desktop-updater\` Worker is the only public read path and serves signed
installers, blockmaps, and electron-updater channel metadata through a
Cloudflare-managed custom domain such as \`updates.example.com\`.

Set the same HTTPS origin in \`apps/desktop/electron-builder.env\` as
\`DESKTOP_UPDATE_BASE_URL\`. electron-builder expands platform and architecture
macros below \`/releases/<os>/<arch>\`, and the packaged application reads that
URL from its generated \`app-update.yml\` file. Keep the bucket's \`r2.dev\` URL
and R2 bucket custom-domain access disabled.

Publish signed artifacts before channel metadata. The generated publisher does
this ordering automatically so an update check cannot discover a release whose
installer or blockmap is not yet available.

Provision and release from the repository root:

\`\`\`sh
pnpm desktop:updates:cloudflare:login
# First replace updates.example.com in apps/desktop-updater-worker/wrangler.jsonc.
pnpm desktop:updates:first-provision
cp apps/desktop/electron-builder.env.example apps/desktop/electron-builder.env
pnpm desktop:updates:build:mac
pnpm desktop:updates:publish -- --platform mac --arch arm64
\`\`\`

Build each operating system on its native, signing-enabled CI runner. Increase
the desktop package version for every release and upload each architecture from
a clean \`apps/desktop/release\` directory. The publisher rejects unknown
platforms/architectures and selects only artifacts carrying the requested
architecture in the generated filename.
`);

  anhedralPrint.done('Electron desktop update channel written');
}
