import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { clerkPlugin, getAuth, clerkClient } from '@clerk/fastify';
import { AuthError } from '../errors/index.js';
import { runBackgroundTask } from '../lib/routeHelpers.js';
import type { AppUser } from '../types/index.js';
import crypto from 'node:crypto';
import { LRUCache } from '../lib/lruCache.js';

export const clerkAuthPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  await fastify.register(clerkPlugin);

  const trackedSessions = new LRUCache<number>({ maxSize: 50_000, ttlMs: 24 * 60 * 60 * 1000 });

  type ClerkUser = Awaited<ReturnType<(typeof clerkClient.users)['getUser']>>;
  const CLERK_USER_CACHE = new LRUCache<ClerkUser>({
    maxSize: 50_000,
    ttlMs: fastify.env?.NODE_ENV === 'production' ? 300_000 : 60_000,
  });
  const INFLIGHT_CLERK_USER = new Map<string, Promise<ClerkUser>>();

  const getClerkUser = async (userId: string): Promise<ClerkUser> => {
    const cached = CLERK_USER_CACHE.get(userId);
    if (cached) return cached;
    const existing = INFLIGHT_CLERK_USER.get(userId);
    if (existing) return existing;
    const p = (async () => {
      try {
        const user = await clerkClient.users.getUser(userId);
        CLERK_USER_CACHE.set(userId, user);
        return user;
      } finally {
        INFLIGHT_CLERK_USER.delete(userId);
      }
    })();
    INFLIGHT_CLERK_USER.set(userId, p);
    return p;
  };

  fastify.addHook('onRequest', async (req) => { req._startedAt = Date.now(); });

  const authenticate = async (req: FastifyRequest, _reply: FastifyReply) => {
    if (req.method === 'OPTIONS' || req.url.startsWith('/health')) return;

    if (fastify.env?.ANHEDRAL_DEMO === 'true') {
      req.user = {
        id: 'user_demo',
        subscriptionTier: 'pro',
        subscriptionStatus: 'active',
      };
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) throw AuthError.unauthorized();

    const jwtToken = authHeader.slice('Bearer '.length).trim();
    if (!jwtToken) throw AuthError.unauthorized();

    try {
      const auth = getAuth(req);
      if (!auth.userId) throw AuthError.unauthorized();

      const userId = auth.userId as string;
      const clerkUser = await getClerkUser(userId);
      if (!clerkUser) throw AuthError.unauthorized();

      let userData = await fastify.repos.users.getAuthDataForPlugin(userId);

      if (!userData) {
        const primaryEmail = clerkUser.emailAddresses.find(
          (e: { id: string }) => e.id === clerkUser.primaryEmailAddressId
        );
        const displayName = [clerkUser.firstName, clerkUser.lastName]
          .filter(Boolean).join(' ').trim() || (primaryEmail?.emailAddress?.split('@')[0] ?? '');

        await fastify.repos.users.createIfMissing({
          id: userId,
          email: primaryEmail?.emailAddress || '',
          displayName,
          profileImageUrl: clerkUser.imageUrl || null,
        });

        await fastify.repos.subscriptions.createIfMissing({
          id: crypto.randomUUID(),
          userId,
          tier: 'free',
          status: 'active',
        });

        userData = await fastify.repos.users.getAuthDataForPlugin(userId);
      } else {
        const sessionKey = auth.sessionId ?? userId;
        if (trackedSessions.get(sessionKey) === undefined) {
          trackedSessions.set(sessionKey, Date.now());
          runBackgroundTask(req, fastify.repos.users.updateLastLogin(userId), 'session_sync');
        }
      }

      if (!userData) throw AuthError.unauthorized();

      const userObj: AppUser = { id: userId };
      if (userData.subscriptionTier) userObj.subscriptionTier = userData.subscriptionTier;
      if (userData.subscriptionStatus) userObj.subscriptionStatus = userData.subscriptionStatus;
      req.user = userObj;
    } catch (err) {
      if (err instanceof AuthError) throw err;
      req.log.error({ msg: '[clerk-auth:error]', error: (err as Error).message });
      throw err;
    }
  };

  fastify.decorate('authenticate', authenticate);
};

export default fp(clerkAuthPlugin, { name: 'clerk-auth-plugin', fastify: '5.x' });
