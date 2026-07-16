import { mapWithConcurrency } from './async-pool.mjs';
import { osvAdvisoryAffectsPackageVersion } from './osv-packages.mjs';

export async function collectOsvFindings(packages, options) {
  const {
    queryBatch,
    queryAdvisory,
    concurrency = 4,
    batchSize = 500,
    onExcluded = () => undefined,
  } = options;
  if (typeof queryBatch !== 'function' || typeof queryAdvisory !== 'function') {
    throw new TypeError('queryBatch and queryAdvisory must be functions');
  }
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new TypeError('batchSize must be a positive integer');
  }

  const batches = [];
  for (let offset = 0; offset < packages.length; offset += batchSize) {
    batches.push(packages.slice(offset, offset + batchSize));
  }
  const reports = await mapWithConcurrency(batches, concurrency, async (batch) => {
    const report = await queryBatch(batch);
    if (!Array.isArray(report.results) || report.results.length !== batch.length) {
      throw new Error('OSV audit returned an unexpected result shape');
    }
    return report;
  });

  const findings = [];
  reports.forEach((report, batchIndex) => {
    const batch = batches[batchIndex];
    findings.push(...report.results.flatMap((result, index) =>
      (result.vulns ?? []).map((vulnerability) => ({ ...batch[index], id: vulnerability.id })),
    ));
  });
  if (findings.length === 0) return findings;

  const advisoryIds = [...new Set(findings.map((finding) => finding.id))];
  const advisories = await mapWithConcurrency(advisoryIds, concurrency, queryAdvisory);
  const advisoryById = new Map(advisoryIds.map((id, index) => [id, advisories[index]]));

  return findings.filter((finding) => {
    const affectsVersion = osvAdvisoryAffectsPackageVersion(
      advisoryById.get(finding.id),
      finding.name,
      finding.version,
    );
    if (affectsVersion === false) {
      onExcluded(finding);
      return false;
    }
    return true;
  });
}
