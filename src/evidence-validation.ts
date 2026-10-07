/** Shared, dependency-free validation for public progress and plugin evidence. */
const forbiddenEvidence = /(?:postgres(?:ql)?:\/\/|bearer\s+\S+|(?:api[_-]?key|secret|password|token)\s*[:=]\s*\S+|\b(?:sk|pk)_(?:live|test|proj)_\S+|\bsk-(?:proj-|live_|test_)?[a-zA-Z0-9_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bAKIA[A-Z0-9]{16}\b|\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/i;
export function isNonSecretEvidence(value: string): boolean {
  if (/[\x00-\x08\x0b-\x1f]/.test(value) || forbiddenEvidence.test(value)) return false;
  for (const candidate of value.matchAll(/\b(?:https?|wss?):[^\s<>"']+/gi)) {
    try {
      const target = new URL(candidate[0]);
      if (target.username || target.password) return false;
    } catch { /* Non-URL prose is validated by the bounded text contract. */ }
  }
  return true;
}
export function isProgressEnvironment(value: string): boolean {
  return /^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,79}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
}
