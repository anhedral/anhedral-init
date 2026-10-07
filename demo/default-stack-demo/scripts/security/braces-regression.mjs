import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

// Golden results were captured from the original registry package braces 3.0.3.
const fixtures = [
  {"input":"{a,b}","options":{},"expected":{"create":"(a|b)","compile":"(a|b)","expand":["a","b"],"stringify":"{a,b}"},"main":["(a|b)"]},
  {"input":"a/{b,c}/d","options":{},"expected":{"create":"a/(b|c)/d","compile":"a/(b|c)/d","expand":["a/b/d","a/c/d"],"stringify":"a/{b,c}/d"},"main":["a/(b|c)/d"]},
  {"input":"{01..05}","options":{},"expected":{"create":"(0[1-5])","compile":"(0[1-5])","expand":["01","02","03","04","05"],"stringify":"{01..05}"},"main":["(0[1-5])"]},
  {"input":"{-3..3}","options":{},"expected":{"create":"(-[1-3]|[0-3])","compile":"(-[1-3]|[0-3])","expand":["-3","-2","-1","0","1","2","3"],"stringify":"{-3..3}"},"main":["(-[1-3]|[0-3])"]},
  {"input":"{10..2..2}","options":{},"expected":{"create":"(2|4|6|8|10)","compile":"(2|4|6|8|10)","expand":["10","8","6","4","2"],"stringify":"{10..2..2}"},"main":["(2|4|6|8|10)"]},
  {"input":"{a..z..3}","options":{},"expected":{"create":"(a|d|g|j|m|p|s|v|y)","compile":"(a|d|g|j|m|p|s|v|y)","expand":["a","d","g","j","m","p","s","v","y"],"stringify":"{a..z..3}"},"main":["(a|d|g|j|m|p|s|v|y)"]},
  {"input":"{a,{b,c}}","options":{},"expected":{"create":"(a|(b|c))","compile":"(a|(b|c))","expand":["a","b","c"],"stringify":"{a,{b,c}}"},"main":["(a|(b|c))"]},
  {"input":"{,a,,b,}","options":{},"expected":{"create":"(|a|b|)","compile":"(|a|b|)","expand":["","a","","b",""],"stringify":"{,a,,b,}"},"main":["(|a|b|)"]},
  {"input":"\\{literal\\}","options":{"keepEscaping":true},"expected":{"create":"\\{literal\\}","compile":"\\{literal\\}","expand":["\\{literal\\}"],"stringify":"\\{literal\\}"},"main":["\\{literal\\}"]},
  {"input":"file[{}].js","options":{},"expected":{"create":"file[{}].js","compile":"file[{}].js","expand":["file[{}].js"],"stringify":"file[{}].js"},"main":["file[{}].js"]},
  {"input":"(x){a,b}","options":{},"expected":{"create":"(x)(a|b)","compile":"(x)(a|b)","expand":["(x)a","(x)b"],"stringify":"(x){a,b}"},"main":["(x)(a|b)"]},
  {"input":"${name}","options":{},"expected":{"create":"${name}","compile":"${name}","expand":["${name}"],"stringify":"${name}"},"main":["${name}"]},
  {"input":"{unclosed","options":{"escapeInvalid":true},"expected":{"create":"\\{unclosed","compile":"\\{unclosed","expand":["{unclosed"],"stringify":"{unclosed"},"main":["\\{unclosed"]},
  {"input":"\"{a,b}\"","options":{"keepQuotes":true},"expected":{"create":"\"{a,b}\"","compile":"\"{a,b}\"","expand":["\"{a,b}\""],"stringify":"\"{a,b}\""},"main":["\"{a,b}\""]},
  {"input":"{a,a,,b}","options":{"nodupes":true,"noempty":true},"expected":{"create":"(a|a|b)","compile":"(a|a|b)","expand":["a","b"],"stringify":"{a,a,,b}"},"main":["(a|a|b)"]},
  {"input":"user-{200..300}","options":{},"expected":{"create":"user-(20[0-9]|2[1-9][0-9]|300)","compile":"user-(20[0-9]|2[1-9][0-9]|300)","expand":["user-200","user-201","user-202","user-203","user-204","user-205","user-206","user-207","user-208","user-209","user-210","user-211","user-212","user-213","user-214","user-215","user-216","user-217","user-218","user-219","user-220","user-221","user-222","user-223","user-224","user-225","user-226","user-227","user-228","user-229","user-230","user-231","user-232","user-233","user-234","user-235","user-236","user-237","user-238","user-239","user-240","user-241","user-242","user-243","user-244","user-245","user-246","user-247","user-248","user-249","user-250","user-251","user-252","user-253","user-254","user-255","user-256","user-257","user-258","user-259","user-260","user-261","user-262","user-263","user-264","user-265","user-266","user-267","user-268","user-269","user-270","user-271","user-272","user-273","user-274","user-275","user-276","user-277","user-278","user-279","user-280","user-281","user-282","user-283","user-284","user-285","user-286","user-287","user-288","user-289","user-290","user-291","user-292","user-293","user-294","user-295","user-296","user-297","user-298","user-299","user-300"],"stringify":"user-{200..300}"},"main":["user-(20[0-9]|2[1-9][0-9]|300)"]},
  {"input":"","options":{},"expected":{"create":[""],"compile":"","expand":[],"stringify":""},"main":[""]},
  {"input":"x","options":{},"expected":{"create":["x"],"compile":"x","expand":["x"],"stringify":"x"},"main":["x"]},
  {"input":"{..3}","options":{},"expected":{"create":"{..3}","compile":"{..3}","expand":["{..3}"],"stringify":"{..3}"},"main":["{..3}"]},
  {"input":"{1..3}","options":{"step":2},"expected":{"create":"(1|3)","compile":"(1|3)","expand":["1","3"],"stringify":"{1..3}"},"main":["(1|3)"]}
];

const normalize = value => JSON.parse(JSON.stringify(value, (key, item) => ['parent', 'prev'].includes(key) ? undefined : item));

const bounded = fn => assert.throws(fn, error => error instanceof RangeError && /safe resource limits/.test(error.message));

function verifyCompatibility(braces) {
  for (const { input, options, expected, main } of fixtures) {
    assert.deepEqual(braces(input, options), main, `braces ${input}`);
    const parsed = braces.parse(input, options);
    assert.equal(parsed.type, 'root');
    assert.equal(parsed.input, input);
    assert.equal(braces.stringify(parsed, options), expected.stringify);
    for (const method of ['create', 'compile', 'expand', 'stringify']) {
      assert.deepEqual(normalize(braces[method](input, options)), expected[method], `${method} ${input}`);
    }
  }
  assert.deepEqual(braces(['{a,b}', '{1..3}'], { expand: true }), ['a', 'b', '1', '2', '3']);
  assert.deepEqual(braces(['{a,a}', '{a,b}'], { expand: true, nodupes: true }), ['a', 'b']);
  assert.throws(() => braces.expand('{1..1001}'), /range limit/);
  assert.deepEqual(braces.expand('{1..3}', { rangeLimit: false }), ['1', '2', '3']);
  assert.match(braces.compile('{1..1000000000}'), /./, 'Optimized numeric regex compilation remains available');
  assert.equal(braces.expand('{1..100000}', { rangeLimit: false }).length, 100000);

}

function verifyNestedStrings(braces) {
  for (const method of ['create', 'compile', 'expand', 'parse', 'stringify']) {
    bounded(() => braces[method]('{'.repeat(4000) + 'a,b' + '}'.repeat(4000)));
    bounded(() => braces[method]('('.repeat(4000) + 'x' + ')'.repeat(4000)));
  }
}

function verifyAstBounds(braces) {
  for (const method of ['compile', 'expand', 'stringify']) {
    let ast = { type: 'text', value: 'x' };
    for (let i = 0; i < 101; i++) ast = { type: 'root', nodes: [ast] };
    bounded(() => braces[method](ast));
    const cycle = { type: 'root', nodes: [] }; cycle.nodes.push(cycle);
    bounded(() => braces[method](cycle));
    const parentCycle = { type: 'root', nodes: [] }; parentCycle.parent = parentCycle;
    bounded(() => braces[method](parentCycle));
    const foreignParents = Array.from({ length: 201 }, () => {
      let parent;
      for (let i = 0; i < 100; i++) parent = { parent };
      return { type: 'text', value: 'x', parent };
    });
    bounded(() => braces[method]({ type: 'root', nodes: foreignParents }));
    const leaf = { type: 'text', value: 'x' };
    const dag = { type: 'root', nodes: [leaf, leaf] };
    assert.deepEqual(braces[method](dag), method === 'expand' ? ['xx'] : 'xx', `${method} accepts an acyclic shared node`);
    bounded(() => braces[method]({ type: 'root', nodes: Array.from({ length: 20001 }, () => ({ type: 'text', value: 'x' })) }));
  }
}

function verifyExpansionBounds(braces) {
  for (const input of ['{1..100001}', '{100001..1}', '{-100001..-1}', '{a,b}'.repeat(17)]) {
    bounded(() => braces.expand(input, { rangeLimit: false }));
  }
  bounded(() => braces.compile('{1..300000..2}'));
  bounded(() => braces.expand(`{${'0'.repeat(200)}1..${'0'.repeat(200)}100000}`, { rangeLimit: false }));
  bounded(() => braces.expand('{100000000000000000000..100000000000000000001}', { rangeLimit: false }));
  bounded(() => braces(['{a,b}'.repeat(16), '{a,b}'.repeat(16)], { expand: true }));
  bounded(() => braces(Array(100001).fill('a')));
}

export function verifyBraces(packageRoot) {
  const require = createRequire(import.meta.url);
  const braces = require(path.join(packageRoot, 'index.js'));
  assert.equal(require(path.join(packageRoot, 'package.json')).version, '3.0.3');
  verifyCompatibility(braces);
  verifyNestedStrings(braces);
  verifyAstBounds(braces);
  verifyExpansionBounds(braces);
  return { normalPatterns: fixtures.length, depthLimit: 100, nodeLimit: 20000, expansionLimit: 100000, characterLimit: 10485760 };
}
