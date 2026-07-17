import assert from 'node:assert/strict';

export function parseNpmPackJson(output) {
  const start = output.indexOf('[');
  const end = output.lastIndexOf(']');
  assert.ok(start >= 0 && end > start, `npm pack should emit a JSON array\noutput:\n${output}`);
  return JSON.parse(output.slice(start, end + 1));
}
