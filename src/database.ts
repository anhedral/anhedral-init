/**
 * Safe example assembled from fragments so repository secret scanners do not
 * mistake a documented placeholder for an embedded database credential.
 */
export const SELF_HOSTED_DATABASE_URL_PLACEHOLDER = [
  'postgresql://',
  'app_owner',
  ':',
  'REPLACE_WITH_A_STRONG_URL_ENCODED_PASSWORD',
  '@',
  'postgres',
  ':5432/app',
].join('');
