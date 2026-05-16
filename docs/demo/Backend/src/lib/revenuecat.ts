import { createHmac } from 'node:crypto';
import { fetchWithTimeout } from './fetchWithTimeout.js';
import { LRUCache } from './lruCache.js';

export interface RevenueCatEntitlement {
  pro: boolean;
  expiresAt?: string;
  purchaseDate?: string;
  managementUrl?: string;
  cancelAtPeriodEnd?: boolean;
}

const RC_CACHE_TTL_MS = process.env.NODE_ENV === 'production' ? 60_000 : 10_000;
const rcEntitlementCache = new LRUCache<RevenueCatEntitlement>({ maxSize: 100_000, ttlMs: RC_CACHE_TTL_MS });
const inflightCached = new Map<string, Promise<RevenueCatEntitlement>>();
const inflightForced  = new Map<string, Promise<RevenueCatEntitlement>>();

export function invalidateRcEntitlementCache(appUserId: string, entitlementId: string): void {
  rcEntitlementCache.invalidate(`${entitlementId}:${appUserId}`);
}

interface RcSubscriberResponse {
  subscriber?: {
    entitlements?: Record<string, { expires_date?: string; purchase_date?: string; product_identifier?: string; will_renew?: boolean | null; unsubscribe_detected_at?: string | null }>;
    subscriptions?: Record<string, { expires_date?: string; management_url?: string; unsubscribe_detected_at?: string | null }>;
    management_url?: string;
  };
}

export async function getRcEntitlement(
  appUserId: string, entitlementId: string, apiKey: string, opts?: { bypassCache?: boolean }
): Promise<RevenueCatEntitlement> {
  const cacheKey = `${entitlementId}:${appUserId}`;
  const bypass = opts?.bypassCache === true;

  if (!bypass) {
    const cached = rcEntitlementCache.get(cacheKey);
    if (cached) return cached;
    const inflight = inflightCached.get(cacheKey);
    if (inflight) return inflight;
  } else {
    const inflight = inflightForced.get(cacheKey);
    if (inflight) return inflight;
  }

  const map = bypass ? inflightForced : inflightCached;
  const p = (async (): Promise<RevenueCatEntitlement> => {
    const res = await fetchWithTimeout(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` }, timeout: 60_000,
    });
    if (res.status === 404) return { pro: false };
    if (!res.ok) throw new Error(`RevenueCat API error: ${res.status}`);

    const data = (await res.json()) as RcSubscriberResponse;
    const now  = new Date();
    const ent  = data.subscriber?.entitlements?.[entitlementId];
    const entExpires = ent?.expires_date ? new Date(ent.expires_date) : null;
    const entActive  = entExpires ? entExpires > now : false;

    const subs = data.subscriber?.subscriptions ?? {};
    let bestSub: { expires_date?: string; management_url?: string; unsubscribe_detected_at?: string | null } | undefined;
    let bestSubExpires: Date | null = null;
    for (const sub of Object.values(subs)) {
      const d = sub?.expires_date ? new Date(sub.expires_date) : null;
      if (!d || !Number.isFinite(d.getTime())) continue;
      if (!bestSubExpires || d > bestSubExpires) { bestSubExpires = d; bestSub = sub; }
    }

    const pro = entActive || (bestSubExpires ? bestSubExpires > now : false);
    const productId = ent?.product_identifier;
    const entSub    = productId ? data.subscriber?.subscriptions?.[productId] : undefined;
    const managementUrl = entSub?.management_url || bestSub?.management_url || data.subscriber?.management_url;
    const cancelAtPeriodEnd = ent?.will_renew === false || ent?.unsubscribe_detected_at != null
      || (entSub?.unsubscribe_detected_at ?? bestSub?.unsubscribe_detected_at) != null;

    const entMs = entExpires?.getTime() ?? 0;
    const subMs = bestSubExpires?.getTime() ?? 0;
    const bestMs = Math.max(entMs, subMs);
    const expiresAt = bestMs ? new Date(bestMs).toISOString() : undefined;

    return { pro, expiresAt, purchaseDate: ent?.purchase_date, managementUrl, cancelAtPeriodEnd };
  })();

  map.set(cacheKey, p);
  try {
    const value = await p;
    if (!bypass && value.pro) rcEntitlementCache.set(cacheKey, value);
    return value;
  } finally {
    map.delete(cacheKey);
  }
}

export function verifyRevenueCatWebhook(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  try {
    const parts = signature.split('=');
    if (parts.length !== 2 || parts[0] !== 'v1' || !parts[1]) return false;
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    const computed = hmac.digest('hex');
    const a = Buffer.from(computed, 'hex');
    const b = Buffer.from(parts[1], 'hex');
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) result |= (a[i] ?? 0) ^ (b[i] ?? 0);
    return result === 0;
  } catch { return false; }
}

export function verifyRevenueCatWebhookAuthorization(authHeader: string | undefined, secret: string): boolean {
  if (!authHeader) return false;
  const normalize = (v: string) => v.trim().replace(/^bearer\s+/i, '');
  return normalize(authHeader) === normalize(secret);
}
