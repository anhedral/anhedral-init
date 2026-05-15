export const DEFAULT_API_PATH_PREFIX = '/api';
export const DEFAULT_LOCAL_API_URL = 'http://localhost:8787';
export const DEFAULT_FRONTEND_URL = 'http://localhost:8081';
export const DEFAULT_EXTENSION_URL = 'chrome-extension://';

export function joinApiUrl(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
