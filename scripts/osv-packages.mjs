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
  // pnpm 12 writes separate YAML documents for toolchain and app dependencies.
  const sections = [...lockfile.matchAll(/(?:^|\n)packages:\r?\n([\s\S]*?)(?=\nsnapshots:\r?\n)/g)];
  if (sections.length !== [...lockfile.matchAll(/^packages:\r?$/gm)].length) throw new Error(`Incomplete packages section in ${source}`);
  if (!sections.length) throw new Error(`Could not locate the packages section in ${source}`);
  const packages = [];
  for (const [, section] of sections) {
    for (const line of section.split(/\r?\n/).filter((row) => /^  [^ #\t]/.test(row))) {
      const match = line.match(/^  (.+?):(?:[ \t].*|$)/);
      if (!match) throw new Error(`Unsupported package row in ${source}: ${line}`);
      const coordinate = packageCoordinateFromPnpmKey(match[1]);
      if (!coordinate) throw new Error(`Unsupported package coordinate ${match[1]} in ${source}`);
      packages.push(coordinate);
    }
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

function comparePrereleasePart(leftPart, rightPart) {
  if (leftPart === undefined) return -1;
  if (rightPart === undefined) return 1;
  if (leftPart === rightPart) return 0;
  const leftNumeric = /^\d+$/.test(leftPart);
  const rightNumeric = /^\d+$/.test(rightPart);
  if (leftNumeric && rightNumeric) return Number(leftPart) < Number(rightPart) ? -1 : 1;
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return leftPart < rightPart ? -1 : 1;
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
    const comparison = comparePrereleasePart(leftPart, rightPart);
    if (comparison !== 0) return comparison;
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

function applyOsvEvent(version, event, affected) {
  for (const [field, state, inclusive] of [
    ['introduced', true, true], ['fixed', false, true],
    ['last_affected', false, false], ['limit', false, true],
  ]) {
    if (event[field] === undefined) continue;
    const comparison = compareSemver(version, event[field]);
    if (comparison === null) return null;
    if (comparison > 0 || (inclusive && comparison === 0)) affected = state;
  }
  return affected;
}

function versionMatchesOsvEvents(version, events) {
  let affected = false;
  for (const event of events ?? []) {
    affected = applyOsvEvent(version, event, affected);
    if (affected === null) return null;
  }
  return affected;
}

function affectedPackageMatchesVersion(affected, version) {
  if (affected.versions?.includes(version)) return true;

  const reviewedRange = affected.database_specific?.last_known_affected_version_range;
  if (reviewedRange) {
    const reviewedMatch = versionMatchesComparatorRange(version, reviewedRange);
    if (reviewedMatch === true) return true;
    if (reviewedMatch === false) return false;
  }

  for (const range of affected.ranges ?? []) {
    if (range.type !== 'SEMVER') continue;
    const matches = versionMatchesOsvEvents(version, range.events);
    if (matches === true) return true;
    if (matches === null) return null;
  }
  return false;
}

export function osvAdvisoryAffectsPackageVersion(advisory, name, version) {
  const matching = (advisory?.affected ?? []).filter((item) => item?.package?.ecosystem === 'npm' && item.package.name === name);
  if (matching.length === 0) return null;
  for (const affected of matching) {
    const result = affectedPackageMatchesVersion(affected, version);
    if (result !== false) return result;
  }
  return false;
}
