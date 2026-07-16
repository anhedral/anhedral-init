import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (relativePath) => readFileSync(path.join(repoRoot, relativePath), 'utf8');

const scaffold = source('src/scaffold.ts');
const api = source('src/templates/api.ts');
const shared = source('src/templates/shared.ts');
const mobile = source('src/templates/mobile.ts');
const web = source('src/templates/web.ts');
const extension = source('src/templates/extension.ts');
const dependencies = source('src/dependencies.ts');
const workspaceConfig = source('src/workspace-config.ts');
const dependencyVersionDeclarations = dependencies.replace(/^export const (?:MOBILE_)?NODE_ENGINE = .*$/gm, '');

assert.match(scaffold, /runStagedTransaction/);
assert.match(scaffold, /createManifest/);
assert.match(scaffold, /Refusing to overwrite unowned path/);
assert.match(scaffold, /Managed file has user modifications/);
assert.match(scaffold, /anhedral add <module> --dry-run/);
assert.match(scaffold, /\.github\/workflows\/anhedral-ci\.yml/);

assert.match(api, /webhookEvents/);
assert.match(api, /onConflictDoNothing\(\)/);
assert.match(api, /webhook_processing_failed/);
assert.match(api, /reply\.code\(503\)/);
assert.match(api, /redact: \['req\.headers\.authorization'\]/);
assert.match(api, /TRUST_PROXY_HOPS/);
assert.match(api, /'@vitest\/coverage-v8'/);
assert.match(api, /'test:coverage': 'vitest run --coverage'/);
assert.match(api, /writeFile\(path\.join\(dir, 'vitest\.config\.ts'\)/);
assert.match(api, /include: \['src\/\*\*\/\*\.ts'\]/);
assert.match(api, /exclude: \['src\/index\.ts'\]/);
assert.match(scaffold, /verify:api'.*test:coverage/);
assert.doesNotMatch(api, /trustProxy: true/);
assert.match(api, /prefix: '\/api'/);
assert.match(scaffold, /services\.api = \{ root: 'apps\/api' \}/);
assert.match(scaffold, /services\.web = \{ root: 'apps\/web', framework: 'nextjs' \}/);
assert.match(scaffold, /source: '\/api\/\(\.\*\)', destination: \{ service: 'api' \}/);
assert.match(scaffold, /source: '\/\(\.\*\)', destination: \{ service: 'web' \}/);
assert.match(scaffold, /\/api\/internal\/storage\/cleanup/);
assert.match(scaffold, /\/api\/internal\/realtime\/flush/);
assert.match(scaffold, /MOBILE_NODE_ENGINE/);
assert.match(scaffold, /from '\.\/workspace-config\.js'/);
assert.match(workspaceConfig, /overrides: \{ \.\.\.SECURITY_OVERRIDES \}/);
assert.match(workspaceConfig, /mergeTopLevelWorkspaceMap/);
assert.doesNotMatch(
  scaffold,
  /devDependencies: ROOT_DEPENDENCIES\.devDependencies,\s+pnpm:/,
  'generated root package.json must not contain pnpm-workspace-only settings',
);

assert.match(shared, /providerEventId: text\('provider_event_id'\)\.primaryKey\(\)/);
assert.match(shared, /realtimeOutbox/);
assert.match(shared, /writeRealtimePackage/);
assert.match(shared, /if \(!options\.features\.database\) return/);
assert.match(shared, /if \(!options\.apps\.api\) return/);

assert.match(mobile, /Writing deterministic Expo application/);
assert.match(mobile, /if \(!options\.apps\.api\) delete dependencies\['@shared\/api-client'\]/);
assert.match(web, /Materializing bundled Next\.js \+ shadcn substrate/);
assert.doesNotMatch(web, /pnpm dlx|exec\(/);
assert.match(web, /if \(!options\.features\.auth\)/);
assert.match(web, /@theme inline/);
assert.match(web, /http:\/\/localhost:8787\/api/);
assert.match(web, /new URL\(candidate, window\.location\.origin\)/);
assert.match(web, /candidate\.startsWith\('\/\/'\)/);
assert.match(mobile, /http:\/\/localhost:8787\/api/);
assert.match(extension, /http:\/\/localhost:8787\/api/);
assert.match(extension, /Materializing bundled WXT substrate/);
assert.doesNotMatch(extension, /pnpm dlx|exec\(/);

assert.doesNotMatch(dependencies, /@latest\b/);
assert.doesNotMatch(dependencyVersionDeclarations, /'\^[^']+'/);
assert.doesNotMatch(dependencies, /NEXT_TEMPLATE_DEPENDENCIES/);
assert.match(dependencies, /'esbuild@<=0\.24\.2': '0\.25\.12'/);
assert.match(dependencies, /'esbuild@>=0\.27\.3 <0\.28\.1': '0\.28\.1'/);
assert.match(dependencies, /'shell-quote@<=1\.8\.3': '1\.8\.4'/);
assert.match(dependencies, /'tmp@<0\.2\.6': '0\.2\.7'/);
assert.match(dependencies, /'uuid@<11\.1\.1': '11\.1\.1'/);
assert.match(dependencies, /ably: '2\.24\.0'/);

console.log('Generated config regression tests passed');
