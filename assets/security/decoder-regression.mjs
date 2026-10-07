import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// Upstream fa479da scanner backport retains the legacy CommonJS/plus API.
export async function verifyDecoder(packageRoot) {
  const require = createRequire(join(packageRoot, 'package.json'));
  const decode = require(join(packageRoot, 'index.js'));
  assert.equal(typeof decode, 'function', 'Decoder CommonJS export changed');
  for (const [input, expected] of [
    ['', ''], ['a+b%2Bc', 'a b+c'], ['%25', '%'], ['%2525', '%25'],
    ['st%C3%A5le%', 'ståle%'], ['%E4%BD%A0%E5%A5%BD', '你好'],
    ['%F0%9F%98%80', '😀'], ['%F4%8F%BF%BF', '\u{10FFFF}'],
    ['%C2', '\uFFFD'], ['%C2%B5%C2', 'µ\uFFFD'],
    ['%FE%FF', '\uFFFD\uFFFD'], ['%FF%FE', '\uFFFD\uFFFD'],
    ['%F0%9F%98', '%F0%9F%98'], ['%ED%A0%80', '%ED%A0%80'],
    ['%C0%AF', '%C0%AF'], ['%F4%90%80%80', '%F4%90%80%80'],
    ['%C3%5A%A5', '%C3Z%A5'], ['%G0%C3%A5%ab', '%G0å%ab'],
    ['%84%D7%25%88%90', '%84%D7%%88%90'], ['%20%20%25%80', '  %%80'],
  ]) assert.equal(decode(input), expected, `Decoder compatibility failure: ${input}`);
  for (const value of [undefined, null, 1, {}, [], Symbol('x')]) {
    assert.throws(() => decode(value), TypeError);
  }
  // Execute hostile runs in an isolated, hard-bounded process: the old recursive
  // fallback exhausts its stack or CPU; the scanner leaves invalid bytes literal.
  const script = `
    const assert = require('node:assert/strict');
    const decode = require(${JSON.stringify(join(packageRoot, 'index.js'))});
    assert.equal(decode('%AB'.repeat(10000)), '%AB'.repeat(10000));
    assert.equal(decode('%C3%5A%A5'.repeat(10000)), '%C3Z%A5'.repeat(10000));
    assert.equal(decode('%E0%80%80'.repeat(10000)), '%E0%80%80'.repeat(10000));
  `;
  execFileSync(process.execPath, ['--input-type=commonjs', '--eval', script], {
    timeout: 5000, maxBuffer: 128 * 1024, stdio: 'pipe',
  });
}
