import path from 'node:path';
import { anhedralPrint } from '../print.js';
import { childPackageName } from '../render.js';
import { TOOLCHAIN_DEPENDENCIES } from '../dependencies.js';
import { writeFile } from '../util.js';
import type { ProjectOptions } from '../scaffold.js';

export function r2BucketName(projectName: string): string {
  const unscoped = projectName.replace(/^@[^/]+\//, '');
  const normalized = unscoped.toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'anhedral';
  const base = normalized.slice(0, 56).replace(/-+$/g, '') || 'anhedral';
  return `${base}-assets`;
}

export function scaffoldAssetsPrivateProxy(root: string, options: ProjectOptions): void {
  const dir = path.join(root, 'apps/assets-private-proxy');
  const wrangler = `pnpm dlx wrangler@${TOOLCHAIN_DEPENDENCIES.wrangler}`;
  const bucketName = r2BucketName(options.projectName);

  anhedralPrint.section('Private asset proxy (Cloudflare Worker + R2)');
  anhedralPrint.step('Writing private-bucket delivery Worker');

  writeFile(path.join(dir, 'package.json'), JSON.stringify({
    name: childPackageName(options.projectName, 'assets-private-proxy'),
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      check: 'node --check src/index.js',
      dev: `${wrangler} dev`,
      deploy: `${wrangler} deploy`,
      types: `${wrangler} types`,
    },
  }, null, 2) + '\n');

  writeFile(path.join(dir, 'wrangler.jsonc'), `{
  // Replace both assets.example.com values with a hostname in your active Cloudflare zone before deployment.
  "name": "assets-private-proxy",
  "main": "src/index.js",
  "compatibility_date": "2026-07-16",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": false,
  "preview_urls": false,
  "routes": [{ "pattern": "assets.example.com", "custom_domain": true }],
  "vars": { "ASSET_HOSTNAME": "assets.example.com", "R2_PREFIX": "storage" },
  "r2_buckets": [{ "binding": "ASSETS", "bucket_name": "${bucketName}" }],
  "observability": {
    "enabled": true,
    "logs": { "enabled": true, "head_sampling_rate": 1 }
  }
}
`);

  writeFile(path.join(dir, 'src/index.js'), `/**
 * Public asset delivery for a private Anhedral R2 bucket.
 *
 * Cloudflare configuration:
 * - Worker name: assets-private-proxy
 * - Custom domain: replace assets.example.com in wrangler.jsonc
 * - R2 binding name: ASSETS
 * - Public object prefix: storage/confirmed/
 *
 * Uploads remain authenticated through the Anhedral application. This Worker
 * only allows public GET and HEAD access to objects whose unguessable key is
 * known. Use authenticated or application-signed requests instead when object
 * keys are not sufficient authorization for your product.
 */
const CACHE_CONTROL = "public, max-age=86400, s-maxage=2592000, immutable";
const PRIVATE_GENERATION_INPUT_SEGMENT = "/generation-inputs/";

const worker = {
  async fetch(request, env, ctx) {
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      return textNoStore("Method Not Allowed", 405, { allow: "GET, HEAD" });
    }

    const url = new URL(request.url);
    if (url.hostname !== env.ASSET_HOSTNAME) return textNoStore("Forbidden", 403);
    const key = decodeObjectKey(url.pathname);
    const publicPrefix = env.R2_PREFIX + "/confirmed/";
    if (!key || !key.startsWith(publicPrefix) || key.includes(PRIVATE_GENERATION_INPUT_SEGMENT)) {
      return textNoStore("Not Found", 404);
    }

    try {
      const cache = caches.default;
      const cacheKey = buildCacheKey(url, key);
      const canUseBodyCache = isCacheableBodyRequest(request, method);

      if (method === "HEAD") {
        const cached = await cache.match(cacheKey);
        if (cached) return headFromResponse(cached, "HIT");
        const object = await env.ASSETS.head(key);
        if (!object) return textNoStore("Not Found", 404);
        return new Response(null, {
          status: 200,
          headers: withAssetDebugHeaders(buildObjectHeaders(object), "BYPASS"),
        });
      }

      if (canUseBodyCache) {
        const cached = await cache.match(cacheKey);
        if (cached) return withCacheStatus(cached, "HIT");
      }

      const object = await env.ASSETS.get(key, {
        onlyIf: request.headers,
        range: request.headers,
      });
      if (!object) return textNoStore("Not Found", 404);

      const hasBody = "body" in object;
      const headers = buildObjectHeaders(object);
      const isRangeResponse = hasBody && request.headers.has("range");
      if (isRangeResponse && object.range) {
        const returnedRange = normalizeReturnedRange(object.range, object.size);
        headers.set("content-range", "bytes " + returnedRange.offset + "-" + (returnedRange.offset + returnedRange.length - 1) + "/" + object.size);
        headers.set("content-length", String(returnedRange.length));
      }

      if (!hasBody) {
        const status = getFailedConditionalRequestStatus(request.headers);
        headers.delete("content-length");
        if (status === 412) headers.set("cache-control", "no-store");
        return new Response(null, {
          status,
          headers: withAssetDebugHeaders(headers, "BYPASS"),
        });
      }

      const response = new Response(object.body, {
        status: isRangeResponse ? 206 : 200,
        headers,
      });
      if (canUseBodyCache && response.status === 200) {
        ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((error) => {
          console.error("Asset cache put failed", { key, error });
        }));
        return withCacheStatus(response, "MISS");
      }
      return withCacheStatus(response, "BYPASS");
    } catch (error) {
      console.error("Asset delivery failed", { key, error });
      return textNoStore("Asset delivery failed", 500);
    }
  },
};

export default worker;

function isCacheableBodyRequest(request, method) {
  if (method !== "GET") return false;
  return !request.headers.has("range")
    && !request.headers.has("if-none-match")
    && !request.headers.has("if-match")
    && !request.headers.has("if-modified-since")
    && !request.headers.has("if-unmodified-since");
}

function buildCacheKey(url, key) {
  return new Request(url.origin + "/" + encodeObjectKey(key), { method: "GET" });
}

function decodeObjectKey(pathname) {
  const rawKey = pathname.replace(/^\\/+/, "");
  if (!rawKey) return null;
  const parts = [];
  for (const rawPart of rawKey.split("/")) {
    if (!rawPart) continue;
    let part;
    try {
      part = decodeURIComponent(rawPart);
    } catch {
      return null;
    }
    if (!part || part === "." || part === ".." || part.includes("/")) return null;
    parts.push(part);
  }
  return parts.join("/") || null;
}

function encodeObjectKey(key) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function buildObjectHeaders(object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", CACHE_CONTROL);
  headers.set("etag", object.httpEtag);
  headers.set("content-length", String(object.size));
  headers.set("x-assets-proxy", "anhedral-r2-direct-v1");
  if (object.uploaded instanceof Date) headers.set("last-modified", object.uploaded.toUTCString());
  headers.delete("set-cookie");
  if (headers.get("vary") === "*") headers.delete("vary");
  return headers;
}

function headFromResponse(response, cacheStatus) {
  const headers = new Headers(response.headers);
  headers.set("x-assets-cache", cacheStatus);
  return new Response(null, { status: response.status, headers });
}

function withCacheStatus(response, cacheStatus) {
  const headers = new Headers(response.headers);
  headers.set("x-assets-cache", cacheStatus);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withAssetDebugHeaders(headers, cacheStatus) {
  const nextHeaders = new Headers(headers);
  nextHeaders.set("x-assets-cache", cacheStatus);
  return nextHeaders;
}

function textNoStore(body, status, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: { "cache-control": "no-store", ...extraHeaders },
  });
}

function getFailedConditionalRequestStatus(headers) {
  if (headers.has("if-none-match")) return 304;
  if (!headers.has("if-match") && !headers.has("if-unmodified-since") && headers.has("if-modified-since")) return 304;
  return 412;
}

function normalizeReturnedRange(range, objectSize) {
  if (typeof range.suffix === "number") {
    const length = Math.min(Math.max(0, range.suffix), objectSize);
    return { offset: objectSize - length, length };
  }
  const offset = Math.min(Math.max(0, range.offset ?? 0), objectSize);
  const availableLength = objectSize - offset;
  const length = typeof range.length === "number"
    ? Math.min(Math.max(0, range.length), availableLength)
    : availableLength;
  return { offset, length };
}
`);

  writeFile(path.join(root, 'cloudflare/r2-cors.template.json'), JSON.stringify({
    rules: [
      {
        id: 'anhedral-browser-uploads',
        allowed: {
          origins: ['https://app.example.com', 'http://localhost:3000'],
          methods: ['GET', 'HEAD', 'PUT'],
          headers: ['Content-Type'],
        },
        exposeHeaders: ['ETag'],
        maxAgeSeconds: 3600,
      },
    ],
  }, null, 2) + '\n');

  writeFile(path.join(root, 'cloudflare/README.md'), `# Anhedral Cloudflare resources

The R2 bucket remains private. Browser uploads use short-lived, authenticated
presigned URLs on the R2 S3 API hostname. Public downloads pass through the
\`assets-private-proxy\` Worker, which exposes only keys below
\`storage/confirmed/\` by default. Authenticated reads use the API's
\`/api/storage/uploads/:uploadId/read-url\` endpoint instead.

Before applying \`r2-cors.template.json\`, replace \`app.example.com\` and merge
every exact web or extension origin that uploads to this bucket. Wrangler's
\`r2 bucket cors set\` command replaces the complete live policy, so list and
review the deployed policy before every update.

\`CLOUDFLARE_API_TOKEN\` is an operations/CI credential used by Wrangler. It is
not an application storage credential and must never be exposed to a browser,
mobile build, desktop renderer, extension bundle, or Worker variable.
`);

  anhedralPrint.done('Private R2 asset proxy written');
}
