import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatFindings, scanDirectory } from './secret-scanner.mjs';

function crc32(contents) {
  let crc = 0xffffffff;
  for (const byte of contents) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pluginFiles(directory, prefix = '') {
  return readdirSync(directory).sort().flatMap((name) => {
    const absolute = path.join(directory, name);
    const relative = path.posix.join(prefix, name);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Plugin cannot contain symbolic links: ${relative}`);
    if (stat.isDirectory()) return pluginFiles(absolute, relative);
    if (!stat.isFile()) throw new Error(`Unsupported plugin file: ${relative}`);
    return [{ name: relative, contents: readFileSync(absolute) }];
  });
}

function zipEntry(file, offset) {
  const name = Buffer.from(file.name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(33, 12);
  local.writeUInt32LE(crc32(file.contents), 14); local.writeUInt32LE(file.contents.length, 18);
  local.writeUInt32LE(file.contents.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt16LE(33, 14); central.writeUInt32LE(crc32(file.contents), 16);
  central.writeUInt32LE(file.contents.length, 20); central.writeUInt32LE(file.contents.length, 24);
  central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
  return { local: Buffer.concat([local, name, file.contents]), central: Buffer.concat([central, name]) };
}

export function buildPluginArchive(root) {
  const findings = scanDirectory(root, 'plugins/anhedral');
  if (findings.length) throw new Error(formatFindings(findings));
  const pluginRoot = path.join(root, 'plugins/anhedral');
  const manifest = JSON.parse(readFileSync(path.join(pluginRoot, 'plugin.json'), 'utf8'));
  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const registry = JSON.parse(readFileSync(path.join(pluginRoot, 'skills/anhedral/references/capabilities.json'), 'utf8'));
  if (manifest.version !== packageJson.version || registry.cliVersion !== packageJson.version) throw new Error('Plugin and CLI release versions must match. Run pnpm build.');
  const local = [], central = [];
  let offset = 0;
  for (const file of pluginFiles(pluginRoot)) {
    const entry = zipEntry(file, offset);
    local.push(entry.local); central.push(entry.central); offset += entry.local.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(local.length, 8); end.writeUInt16LE(local.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return { contents: Buffer.concat([...local, directory, end]), version: manifest.version };
}

export function packagePlugin(root, outputDirectory) {
  const { contents, version } = buildPluginArchive(root);
  const filename = `anhedral-plugin-${version}.zip`;
  writeFileSync(path.join(outputDirectory, filename), contents);
  const metadata = { schemaVersion: 1, version, cliVersion: version, filename, integrity: `sha512-${createHash('sha512').update(contents).digest('base64')}`, size: contents.length };
  writeFileSync(path.join(outputDirectory, 'plugin-metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
  return metadata;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(import.meta.dirname, '..');
  console.log(JSON.stringify(packagePlugin(root, path.join(root, '.artifacts/release'))));
}
