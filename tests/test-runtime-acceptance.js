import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { runCommand } from './support/scenario-runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const target = process.argv[2];
const artifactMetadataArgument = process.argv[3];
const supportedTargets = new Set(['desktop', 'extension', 'mobile']);
const isCi = /^(?:1|true)$/i.test(process.env.CI ?? '');
const probeTimeoutMs = 45_000;
const maxProcessLogBytes = 128 * 1024;

if (!supportedTargets.has(target)) {
  throw new Error(`Usage: test-runtime-acceptance.js <${[...supportedTargets].join('|')}> [release-artifact/metadata.json]`);
}

function findFile(root, basename) {
  if (!existsSync(root)) return null;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = findFile(absolute, basename);
      if (nested) return nested;
    } else if (entry.name === basename) {
      return absolute;
    }
  }
  return null;
}

function findFileWithExtension(root, extension) {
  if (!existsSync(root)) return null;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = findFileWithExtension(absolute, extension);
      if (nested) return nested;
    } else if (entry.name.endsWith(extension)) {
      return absolute;
    }
  }
  return null;
}

function resolveExecutable(command) {
  if (!command) return null;
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    try {
      accessSync(command, constants.X_OK);
      return command;
    } catch {
      return null;
    }
  }

  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';')
    : [''];
  for (const directory of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${command}${extension}`);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Try the next PATH entry.
      }
    }
  }
  return null;
}

function appendBounded(current, chunk) {
  const combined = current + String(chunk);
  return combined.length <= maxProcessLogBytes
    ? combined
    : combined.slice(combined.length - maxProcessLogBytes);
}

function launchManaged(command, args, cwd, env = {}) {
  console.log(`Launching in ${cwd}: ${command} ${args.join(' ')}`);
  const child = spawn(command, args, {
    cwd,
    detached: process.platform !== 'win32',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const state = {
    child,
    exited: false,
    exitCode: null,
    signal: null,
    spawnError: null,
    stdout: '',
    stderr: '',
  };
  child.stdout.on('data', (chunk) => { state.stdout = appendBounded(state.stdout, chunk); });
  child.stderr.on('data', (chunk) => { state.stderr = appendBounded(state.stderr, chunk); });
  child.once('error', (error) => { state.spawnError = error; });
  state.exitPromise = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      state.exited = true;
      state.exitCode = code;
      state.signal = signal;
      resolve();
    });
  });
  return state;
}

function processFailure(state, label) {
  return `${label} exited before its runtime target was ready (code=${state.exitCode}, signal=${state.signal})`
    + `\nstdout (tail):\n${state.stdout}\nstderr (tail):\n${state.stderr}`;
}

async function stopManaged(state) {
  if (!state || state.exited) return;
  const sendSignal = (signal) => {
    try {
      if (process.platform !== 'win32' && state.child.pid) process.kill(-state.child.pid, signal);
      else state.child.kill(signal);
    } catch {
      // The process may have exited between the state check and the signal.
    }
  };

  sendSignal('SIGTERM');
  await Promise.race([state.exitPromise, delay(3_000)]);
  if (!state.exited) {
    sendSignal('SIGKILL');
    await Promise.race([state.exitPromise, delay(3_000)]);
  }
}

async function reserveLoopbackPort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to reserve a loopback port'));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

async function readDebugTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(1_500),
  });
  if (!response.ok) throw new Error(`DevTools target endpoint returned HTTP ${response.status}`);
  const targets = await response.json();
  if (!Array.isArray(targets)) throw new Error('DevTools target endpoint did not return an array');
  return targets;
}

async function evaluateTarget(debugTarget, expression) {
  assert.equal(typeof globalThis.WebSocket, 'function', 'runtime CDP probes require Node.js 22 or newer');
  assert.equal(typeof debugTarget.webSocketDebuggerUrl, 'string', 'DevTools target must expose a debugger WebSocket');

  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(debugTarget.webSocketDebuggerUrl);
    const commandId = 1;
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // A failed handshake can leave the socket in a non-closeable state.
      }
      callback();
    };
    const timer = setTimeout(() => {
      finish(() => reject(new Error('Timed out evaluating the DevTools target')));
    }, 2_500);

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        id: commandId,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true },
      }));
    }, { once: true });
    socket.addEventListener('message', (event) => {
      let payload;
      try {
        payload = JSON.parse(String(event.data));
      } catch (error) {
        finish(() => reject(error));
        return;
      }
      if (payload.id !== commandId) return;
      if (payload.error || payload.result?.exceptionDetails) {
        finish(() => reject(new Error(`DevTools evaluation failed: ${JSON.stringify(payload.error ?? payload.result.exceptionDetails)}`)));
        return;
      }
      finish(() => resolve(payload.result?.result?.value));
    });
    socket.addEventListener('error', () => {
      finish(() => reject(new Error('Unable to connect to the DevTools target')));
    }, { once: true });
  });
}

async function waitForInspectableTarget({ port, state, label, matches, inspect }) {
  const deadline = Date.now() + probeTimeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (state.spawnError) throw state.spawnError;
    if (state.exited) throw new Error(processFailure(state, label));
    try {
      const targets = await readDebugTargets(port);
      for (const debugTarget of targets.filter(matches)) {
        try {
          const inspection = await inspect(debugTarget);
          if (inspection) return { debugTarget, inspection };
        } catch (error) {
          lastError = error;
        }
      }
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(`${label} did not expose an inspectable runtime target within ${probeTimeoutMs}ms`
    + (lastError ? `\nLast probe error: ${lastError.message}` : '')
    + `\nstdout (tail):\n${state.stdout}\nstderr (tail):\n${state.stderr}`);
}

function requireCiTool(tool, message) {
  const executable = resolveExecutable(tool);
  if (!executable && isCi) throw new Error(message);
  return executable;
}

const temporaryRoot = mkdtempSync(path.join(tmpdir(), `anhedral-${target}-acceptance-`));
const projectRoot = path.join(temporaryRoot, 'project');
const managedProcesses = [];

try {
  let cliEntry = path.join(repoRoot, 'dist', 'bin.js');
  if (artifactMetadataArgument) {
    const metadataPath = path.resolve(artifactMetadataArgument);
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    assert.equal(metadata.name, 'anhedral', 'runtime acceptance only permits the anhedral release artifact');
    assert.equal(metadata.filename, path.basename(metadata.filename), 'release artifact filename must be a basename');
    const tarballPath = path.join(path.dirname(metadataPath), metadata.filename);
    assert.equal(existsSync(tarballPath), true, `release tarball should exist at ${tarballPath}`);

    const generatorRoot = path.join(temporaryRoot, 'generator');
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    runCommand(process.execPath, ['-e', "require('node:fs').mkdirSync(process.argv[1], { recursive: true })", generatorRoot], temporaryRoot, { log: false });
    runCommand(npmCommand, ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarballPath], generatorRoot, {
      env: { npm_config_cache: path.join(temporaryRoot, 'npm-cache') },
    });
    const installedRoot = path.join(generatorRoot, 'node_modules', 'anhedral');
    const installedPackage = JSON.parse(readFileSync(path.join(installedRoot, 'package.json'), 'utf8'));
    assert.equal(installedPackage.name, metadata.name);
    assert.equal(installedPackage.version, metadata.version, 'runtime acceptance must execute the exact artifact version');
    cliEntry = path.join(installedRoot, 'bin', 'anhedral.js');
    assert.equal(existsSync(cliEntry), true, 'installed release artifact must include its CLI entry point');
  }

  runCommand(process.execPath, ['-e', "require('node:fs').mkdirSync(process.argv[1], { recursive: true })", projectRoot], temporaryRoot, { log: false });
  const requestedModule = target === 'mobile' ? 'native-subscriptions' : target;
  runCommand(process.execPath, [cliEntry, 'init', requestedModule, '--skip-install'], projectRoot);
  runCommand('pnpm', ['install', '--no-frozen-lockfile'], projectRoot, { env: { CI: '1' } });

  if (target === 'desktop') {
    runCommand('pnpm', ['--filter', './apps/desktop', 'build'], projectRoot, { env: { CI: '1' } });
    if (process.platform === 'linux') {
      runCommand('pnpm', ['--filter', './apps/desktop', 'exec', 'electron-builder', '--linux', 'dir', '--publish', 'never'], projectRoot, { env: { CI: '1' } });
      const desktopPackage = JSON.parse(readFileSync(path.join(projectRoot, 'apps/desktop/package.json'), 'utf8'));
      const executable = findFile(path.join(projectRoot, 'apps/desktop/release'), desktopPackage.build.productName);
      assert.ok(executable, 'Electron builder should emit the configured Linux executable');
      accessSync(executable, constants.X_OK);

      const xvfbRun = requireCiTool('xvfb-run', 'xvfb-run is required for Linux desktop runtime acceptance in CI');
      if (xvfbRun) {
        const debugPort = await reserveLoopbackPort();
        const state = launchManaged(xvfbRun, [
          '-a',
          '-s', '-screen 0 1280x800x24',
          executable,
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--no-sandbox',
          `--user-data-dir=${path.join(temporaryRoot, 'electron-profile')}`,
          '--remote-allow-origins=*',
          '--remote-debugging-address=127.0.0.1',
          `--remote-debugging-port=${debugPort}`,
        ], projectRoot, { CI: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' });
        managedProcesses.push(state);
        const { debugTarget, inspection } = await waitForInspectableTarget({
          port: debugPort,
          state,
          label: 'Packaged Electron application',
          matches: (candidate) => candidate.type === 'page'
            && /\/dist\/renderer\/index\.html(?:$|[?#])/.test(String(candidate.url)),
          inspect: async (candidate) => {
            const value = await evaluateTarget(candidate, `JSON.stringify({
              readyState: document.readyState,
              title: document.title,
              renderedChildren: document.querySelector('#root')?.childElementCount ?? 0
            })`);
            const parsed = JSON.parse(value);
            return parsed.readyState === 'complete' && parsed.renderedChildren > 0 ? parsed : null;
          },
        });
        assert.equal(inspection.title, desktopPackage.build.productName, 'packaged renderer must load the configured application');
        assert.match(debugTarget.url, /\/dist\/renderer\/index\.html(?:$|[?#])/, 'Electron target must be the packaged renderer');
        await stopManaged(state);
      } else {
        console.log('xvfb-run is unavailable locally; Electron packaging passed but live renderer launch was skipped');
      }
    } else {
      console.log(`Electron packaging acceptance is unavailable on ${process.platform}; build verification completed`);
    }
  }

  if (target === 'extension') {
    runCommand('pnpm', ['--filter', './apps/extension', 'build'], projectRoot, { env: { CI: '1' } });
    runCommand('pnpm', ['--filter', './apps/extension', 'zip'], projectRoot, { env: { CI: '1' } });
    const manifestPath = findFile(path.join(projectRoot, 'apps/extension/.output'), 'manifest.json');
    assert.ok(manifestPath, 'WXT build should emit an unpacked manifest');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.manifest_version, 3);
    assert.equal(typeof manifest.background?.service_worker, 'string', 'built extension must declare a service worker');
    assert.equal(existsSync(path.join(path.dirname(manifestPath), manifest.background.service_worker)), true, 'declared service worker must exist');
    assert.equal(typeof manifest.side_panel?.default_path, 'string', 'built extension must declare its side panel');
    assert.equal(existsSync(path.join(path.dirname(manifestPath), manifest.side_panel.default_path)), true, 'declared side panel must exist');
    assert.ok(findFileWithExtension(path.join(projectRoot, 'apps/extension/.output'), '.zip'), 'WXT zip should emit an archive');

    const chromeSetting = process.env.ANHEDRAL_CHROME_PATH;
    const chromePath = resolveExecutable(chromeSetting);
    if (chromeSetting) {
      assert.ok(chromePath, `ANHEDRAL_CHROME_PATH is not executable: ${chromeSetting}`);
      const extensionRoot = path.dirname(manifestPath);
      const debugPort = await reserveLoopbackPort();
      const state = launchManaged(chromePath, [
        '--headless=new',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        `--user-data-dir=${path.join(temporaryRoot, 'chrome-profile')}`,
        `--disable-extensions-except=${extensionRoot}`,
        `--load-extension=${extensionRoot}`,
        '--remote-allow-origins=*',
        '--remote-debugging-address=127.0.0.1',
        `--remote-debugging-port=${debugPort}`,
        'chrome://extensions/',
      ], projectRoot, { CI: '1' });
      managedProcesses.push(state);
      const serviceWorkerPath = manifest.background.service_worker.replace(/^\/+/, '');
      const { debugTarget, inspection } = await waitForInspectableTarget({
        port: debugPort,
        state,
        label: 'Chrome extension service worker',
        matches: (candidate) => {
          if (candidate.type !== 'service_worker') return false;
          try {
            const url = new URL(candidate.url);
            return url.protocol === 'chrome-extension:' && url.pathname.slice(1) === serviceWorkerPath;
          } catch {
            return false;
          }
        },
        inspect: async (candidate) => {
          const value = await evaluateTarget(candidate, "JSON.stringify({ href: self.location.href, hasChromeRuntime: typeof chrome?.runtime?.id === 'string' })");
          const parsed = JSON.parse(value);
          return parsed.hasChromeRuntime ? parsed : null;
        },
      });
      assert.equal(inspection.href, debugTarget.url, 'CDP must inspect the loaded extension service worker itself');
      assert.match(debugTarget.url, /^chrome-extension:\/\//, 'service worker must run under an extension origin');
      await stopManaged(state);
    } else {
      if (isCi) throw new Error('ANHEDRAL_CHROME_PATH must point to Chrome for extension runtime acceptance in CI');
      console.log('ANHEDRAL_CHROME_PATH is unavailable; unpacked manifest and archive checks completed');
    }
  }

  if (target === 'mobile') {
    runCommand('pnpm', [
      '--filter', './apps/mobile', 'exec', 'expo', 'prebuild',
      '--no-install', '--platform', 'android',
    ], projectRoot, { env: { CI: '1' } });
    assert.equal(existsSync(path.join(projectRoot, 'apps/mobile/android/settings.gradle')), true, 'Expo should emit an Android native project');
    assert.equal(existsSync(path.join(projectRoot, 'apps/mobile/android/app/build.gradle')), true, 'Expo should emit the Android app build');
    const mobilePackage = JSON.parse(readFileSync(path.join(projectRoot, 'apps/mobile/package.json'), 'utf8'));
    assert.equal(typeof mobilePackage.dependencies['react-native-purchases'], 'string');
    assert.equal(typeof mobilePackage.dependencies['react-native-purchases-ui'], 'string');
    const autolinking = runCommand('pnpm', [
      '--filter', './apps/mobile', 'exec', 'expo-modules-autolinking',
      'react-native-config', '--platform', 'android',
    ], projectRoot, { env: { CI: '1' } }).stdout;
    assert.match(autolinking, /react-native-purchases/, 'RevenueCat purchases must appear in Android autolinking config');
    assert.match(autolinking, /react-native-purchases-ui/, 'RevenueCat purchases UI must appear in Android autolinking config');

    const androidSdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    const javaExecutable = resolveExecutable('java');
    const hasAndroidSdk = Boolean(androidSdk && existsSync(androidSdk));
    if ((!hasAndroidSdk || !javaExecutable) && isCi) {
      throw new Error('Android SDK and JDK are required for mobile runtime acceptance in CI');
    }
    if (hasAndroidSdk && javaExecutable) {
      const androidRoot = path.join(projectRoot, 'apps/mobile/android');
      const gradleWrapper = process.platform === 'win32'
        ? path.join(androidRoot, 'gradlew.bat')
        : path.join(androidRoot, 'gradlew');
      assert.equal(existsSync(gradleWrapper), true, 'Expo prebuild must emit the Gradle wrapper');
      if (process.platform !== 'win32') chmodSync(gradleWrapper, 0o755);
      runCommand(gradleWrapper, ['--no-daemon', '--stacktrace', 'assembleDebug'], androidRoot, {
        env: {
          ANDROID_HOME: androidSdk,
          ANDROID_SDK_ROOT: androidSdk,
          CI: '1',
        },
      });
      assert.equal(
        existsSync(path.join(androidRoot, 'app/build/outputs/apk/debug/app-debug.apk')),
        true,
        'Gradle assembleDebug must emit a debug APK',
      );
    } else {
      console.log('Android SDK or JDK is unavailable locally; prebuild/autolinking passed but Gradle assembleDebug was skipped');
    }
  }

  console.log(`${target} runtime acceptance passed`);
} finally {
  await Promise.all(managedProcesses.map((state) => stopManaged(state)));
  if (process.env.ANHEDRAL_ACCEPTANCE_KEEP === '1') {
    console.log(`ANHEDRAL_ACCEPTANCE_KEEP=1; retained acceptance output at ${temporaryRoot}`);
  } else {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
