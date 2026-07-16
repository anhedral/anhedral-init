import assert from 'node:assert/strict';
import { mapWithConcurrency } from '../scripts/async-pool.mjs';
import { collectOsvFindings } from '../scripts/osv-audit-core.mjs';
import {
  collectPnpmLockPackages,
  compareSemver,
  osvAdvisoryAffectsPackageVersion,
  packageCoordinateFromPnpmKey,
  versionMatchesComparatorRange,
} from '../scripts/osv-packages.mjs';

assert.deepEqual(packageCoordinateFromPnpmKey("'@clerk/example@1.2.3(react@19.2.3)'"), {
  name: '@clerk/example',
  version: '1.2.3',
});
assert.deepEqual(packageCoordinateFromPnpmKey('example@4.5.6(@scope/peer@7.8.9)'), {
  name: 'example',
  version: '4.5.6',
});

const lockfile = `lockfileVersion: '9.0'

packages:

  '@clerk/example@1.2.3(react@19.2.3)':
    resolution: {integrity: sha512-test}

  example@4.5.6(@scope/peer@7.8.9):
    resolution: {integrity: sha512-test}

snapshots:

  '@clerk/example@1.2.3(react@19.2.3)': {}
`;

assert.deepEqual(collectPnpmLockPackages(lockfile), [
  { name: '@clerk/example', version: '1.2.3' },
  { name: 'example', version: '4.5.6' },
]);

assert.equal(compareSemver('10.34.5', '10.34.2'), 1);
assert.equal(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
assert.equal(compareSemver('1.0.0', '1.0.0-rc.1'), 1);
assert.equal(versionMatchesComparatorRange('10.34.1', '< 10.34.2'), true);
assert.equal(versionMatchesComparatorRange('10.34.5', '< 10.34.2'), false);
assert.equal(versionMatchesComparatorRange('11.5.2', '>= 11.0.0, < 11.5.3'), true);
assert.equal(versionMatchesComparatorRange('11.5.3', '>= 11.0.0, < 11.5.3'), false);

const advisoryWithCorrectedTenRange = {
  affected: [
    {
      package: { ecosystem: 'npm', name: 'pnpm' },
      ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '11.5.3' }] }],
      database_specific: { last_known_affected_version_range: '< 10.34.2' },
    },
    {
      package: { ecosystem: 'npm', name: 'pnpm' },
      ranges: [{ type: 'SEMVER', events: [{ introduced: '11.0.0' }, { fixed: '11.5.3' }] }],
    },
  ],
};
assert.equal(osvAdvisoryAffectsPackageVersion(advisoryWithCorrectedTenRange, 'pnpm', '10.34.1'), true);
assert.equal(osvAdvisoryAffectsPackageVersion(advisoryWithCorrectedTenRange, 'pnpm', '10.34.5'), false);
assert.equal(osvAdvisoryAffectsPackageVersion(advisoryWithCorrectedTenRange, 'pnpm', '11.5.2'), true);
assert.equal(osvAdvisoryAffectsPackageVersion(advisoryWithCorrectedTenRange, 'pnpm', '11.5.3'), false);

let active = 0;
let peakActive = 0;
const mapped = await mapWithConcurrency([3, 1, 2, 0], 2, async (value) => {
  active += 1;
  peakActive = Math.max(peakActive, active);
  await new Promise((resolve) => setTimeout(resolve, value * 2));
  active -= 1;
  return value * 10;
});
assert.deepEqual(mapped, [30, 10, 20, 0]);
assert.equal(peakActive, 2);
await assert.rejects(() => mapWithConcurrency([1], 0, async () => undefined), /positive integer/);

const packages = [
  { name: 'first', version: '1.0.0' },
  { name: 'second', version: '2.0.0' },
  { name: 'third', version: '3.0.0' },
];
const advisoryCalls = [];
const excluded = [];
const findings = await collectOsvFindings(packages, {
  batchSize: 1,
  concurrency: 2,
  async queryBatch(batch) {
    await new Promise((resolve) => setTimeout(resolve, batch[0].name === 'first' ? 8 : 1));
    return {
      results: [{ vulns: batch[0].name === 'third'
        ? [{ id: 'OSV-2' }]
        : [{ id: 'OSV-1' }] }],
    };
  },
  async queryAdvisory(id) {
    advisoryCalls.push(id);
    return id === 'OSV-1'
      ? { affected: [
        { package: { ecosystem: 'npm', name: 'first' }, versions: ['1.0.0'] },
        { package: { ecosystem: 'npm', name: 'second' }, versions: ['1.0.0'] },
      ] }
      : { affected: [{ package: { ecosystem: 'npm', name: 'third' }, versions: ['3.0.0'] }] };
  },
  onExcluded(finding) {
    excluded.push(finding);
  },
});
assert.deepEqual(advisoryCalls.sort(), ['OSV-1', 'OSV-2']);
assert.deepEqual(findings, [
  { name: 'first', version: '1.0.0', id: 'OSV-1' },
  { name: 'third', version: '3.0.0', id: 'OSV-2' },
]);
assert.deepEqual(excluded, [{ name: 'second', version: '2.0.0', id: 'OSV-1' }]);

let scheduledAfterFailure = 0;
await assert.rejects(() => mapWithConcurrency([0, 1, 2, 3, 4], 2, async (value) => {
  if (value === 0) throw new Error('pool failure');
  scheduledAfterFailure += 1;
  await new Promise((resolve) => setTimeout(resolve, 2));
}), /pool failure/);
assert.ok(scheduledAfterFailure <= 1, `expected the pool to stop scheduling after failure; got ${scheduledAfterFailure}`);

console.log('Security audit package parsing tests passed');
