export function packageCoordinateFromPnpmKey(rawKey) {
  const key = rawKey.replace(/^['"]|['"]$/g, '');
  const peerQualifier = key.indexOf('(');
  const unqualified = peerQualifier === -1 ? key : key.slice(0, peerQualifier);
  const separator = unqualified.lastIndexOf('@');
  if (separator <= 0) return null;
  const name = unqualified.slice(0, separator);
  const version = unqualified.slice(separator + 1);
  if (!name || !version || version.includes(':') || version.startsWith('/')) return null;
  return { name, version };
}

export function collectPnpmLockPackages(lockfile, source = 'pnpm-lock.yaml') {
  const packagesSection = lockfile.match(/\npackages:\n([\s\S]*?)\nsnapshots:\n/)?.[1];
  if (!packagesSection) throw new Error(`Could not locate the packages section in ${source}`);

  const packages = [];
  for (const match of packagesSection.matchAll(/^  (.+):$/gm)) {
    const coordinate = packageCoordinateFromPnpmKey(match[1]);
    if (coordinate) packages.push(coordinate);
  }
  return packages;
}

function parseSemver(version) {
  if (version === '0') return { major: 0, minor: 0, patch: 0, prerelease: [] };
  const match = String(version).trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split('.') ?? [],
  };
}

function comparePrerelease(left, right) {
  if (left.length === 0 || right.length === 0) {
    if (left.length === right.length) return 0;
    return left.length === 0 ? 1 : -1;
  }

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) return Number(leftPart) < Number(rightPart) ? -1 : 1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

export function compareSemver(leftVersion, rightVersion) {
  const left = parseSemver(leftVersion);
  const right = parseSemver(rightVersion);
  if (!left || !right) return null;

  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

function matchesComparator(version, operator, boundary) {
  const comparison = compareSemver(version, boundary);
  if (comparison === null) return null;
  if (operator === '<') return comparison < 0;
  if (operator === '<=') return comparison <= 0;
  if (operator === '>') return comparison > 0;
  if (operator === '>=') return comparison >= 0;
  return comparison === 0;
}

function matchesComparatorSet(version, range) {
  const comparators = [];
  const pattern = /(<=|>=|<|>|=)?\s*(v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)/g;
  let match;
  while ((match = pattern.exec(range)) !== null) comparators.push([match[1] ?? '=', match[2]]);
  const remainder = range.replace(pattern, '').replace(/[\s,]/g, '');
  if (comparators.length === 0 || remainder.length > 0) return null;

  for (const [operator, boundary] of comparators) {
    const matches = matchesComparator(version, operator, boundary);
    if (matches === null) return null;
    if (!matches) return false;
  }
  return true;
}

export function versionMatchesComparatorRange(version, range) {
  let sawValidSet = false;
  for (const comparatorSet of String(range).split(/\s*\|\|\s*/)) {
    const matches = matchesComparatorSet(version, comparatorSet);
    if (matches === true) return true;
    if (matches === false) sawValidSet = true;
  }
  return sawValidSet ? false : null;
}

function versionMatchesOsvEvents(version, events) {
  let affected = false;
  for (const event of events ?? []) {
    if (event.introduced !== undefined) {
      const comparison = compareSemver(version, event.introduced);
      if (comparison === null) return null;
      if (comparison >= 0) affected = true;
    }
    if (event.fixed !== undefined) {
      const comparison = compareSemver(version, event.fixed);
      if (comparison === null) return null;
      if (comparison >= 0) affected = false;
    }
    if (event.last_affected !== undefined) {
      const comparison = compareSemver(version, event.last_affected);
      if (comparison === null) return null;
      if (comparison > 0) affected = false;
    }
    if (event.limit !== undefined) {
      const comparison = compareSemver(version, event.limit);
      if (comparison === null) return null;
      if (comparison >= 0) affected = false;
    }
  }
  return affected;
}

export function osvAdvisoryAffectsPackageVersion(advisory, name, version) {
  let evaluatedMatchingPackage = false;
  for (const affected of advisory?.affected ?? []) {
    if (affected?.package?.ecosystem !== 'npm' || affected.package.name !== name) continue;
    evaluatedMatchingPackage = true;
    if (affected.versions?.includes(version)) return true;

    const reviewedRange = affected.database_specific?.last_known_affected_version_range;
    if (reviewedRange) {
      const reviewedMatch = versionMatchesComparatorRange(version, reviewedRange);
      if (reviewedMatch === true) return true;
      if (reviewedMatch === false) continue;
    }

    for (const range of affected.ranges ?? []) {
      if (range.type !== 'SEMVER') continue;
      const matches = versionMatchesOsvEvents(version, range.events);
      if (matches === true) return true;
      if (matches === null) return null;
    }
  }
  return evaluatedMatchingPackage ? false : null;
}
